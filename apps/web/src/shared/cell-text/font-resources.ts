import { readonly, shallowRef, watch } from "vue";
import { ensureLocalSymbolFont, useLocalSymbolFonts } from "./local-font-source";
import { ensureManagedCellFont, MANAGED_CELL_FONTS } from "./managed-fonts";
import { invalidateCellTextFontMetrics } from "./text-metrics";

export type CellFontResourceKind = "managed" | "local" | "system";
export type CellFontResourceErrorCode = "missing-local-resource" | "font-load";

export class CellFontResourceError extends Error {
  readonly family: string;
  readonly code: CellFontResourceErrorCode;

  constructor(family: string, code: CellFontResourceErrorCode, cause?: unknown) {
    super(
      code === "missing-local-resource"
        ? `The local font resource ${family} is not available on this device.`
        : `The cell font resource ${family} could not be loaded.`,
      { cause },
    );
    this.name = "CellFontResourceError";
    this.family = family;
    this.code = code;
  }
}

export type CellFontResourceStatus = Readonly<{
  family: string;
  kind: CellFontResourceKind;
  state: "idle" | "loading" | "ready" | "error";
  error?: CellFontResourceError;
}>;

const resources = shallowRef<ReadonlyMap<string, CellFontResourceStatus>>(new Map());
const revision = shallowRef(0);
const attempts = new Map<string, Promise<void>>();
const localFonts = useLocalSymbolFonts().fonts;

/** Obtaining state never requests OS font access or reads stored font bytes. */
export function useCellFontResources() {
  return { resources: readonly(resources), revision: readonly(revision) };
}

export function getCellFontResourceKind(family: string): CellFontResourceKind {
  if (MANAGED_CELL_FONTS.some((font) => font.family === family)) return "managed";
  return /^SheetcraftLocal_[a-f0-9]{64}$/u.test(family) ? "local" : "system";
}

/** Only owned resources from a CSS family stack, including quoted theme stacks. */
export function getCellFontResourceFamilies(cssFamily: string): readonly string[] {
  if (getCellFontResourceKind(cssFamily) !== "system") return [cssFamily];
  const families = new Set<string>();
  let family = "";
  let quote = "";
  let escaped = false;
  const append = () => {
    const value = family.trim();
    if (getCellFontResourceKind(value) !== "system") families.add(value);
    family = "";
  };
  for (const character of cssFamily) {
    if (escaped) {
      family += character;
      escaped = false;
    } else if (character === "\\") escaped = true;
    else if (quote) {
      if (character === quote) quote = "";
      else family += character;
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ",") append();
    else family += character;
  }
  if (!quote && !escaped) append();
  return [...families];
}

export function getCellFontResourceStatus(family: string): CellFontResourceStatus {
  const cached = resources.value.get(family);
  if (cached) return cached;
  const kind = getCellFontResourceKind(family);
  const ready = kind === "system" || localFonts.value.some((font) => font.family === family);
  return { family, kind, state: ready ? "ready" : "idle" };
}

/** Failed attempts remain pending work and fail again without repeated I/O. */
export function cellFontResourceNeedsLoading(family: string): boolean {
  return getCellFontResourceStatus(family).state !== "ready";
}

function publish(status: CellFontResourceStatus): void {
  const becameReady =
    status.state === "ready" && resources.value.get(status.family)?.state !== "ready";
  const next = new Map(resources.value);
  next.set(status.family, Object.freeze(status));
  resources.value = next;
  if (becameReady) invalidateCellTextFontMetrics();
  revision.value++;
}

// Imports performed by the font picker publish only genuinely loaded/registered
// aliases. Reconcile those successes without retrying a disk or permission call.
watch(
  localFonts,
  (fonts) => {
    for (const font of fonts) {
      const previous = resources.value.get(font.family);
      if (previous?.state === "ready") continue;
      if (previous?.state === "error") attempts.delete(font.family);
      publish({ family: font.family, kind: "local", state: "ready" });
    }
  },
  { flush: "sync" },
);

/**
 * Exact packaged faces and persisted content-addressed aliases only. Unknown CSS
 * families keep the normal system-font path. Errors are cached until explicit
 * retry/invalidation, so viewport refreshes cannot continually retry storage I/O.
 */
export function ensureCellFontResource(family: string): Promise<void> {
  const kind = getCellFontResourceKind(family);
  if (kind === "system") return Promise.resolve();
  const pending = attempts.get(family);
  if (pending) return pending;
  if (getCellFontResourceStatus(family).state === "ready") return Promise.resolve();
  publish({ family, kind, state: "loading" });
  const promise = Promise.resolve()
    .then(async () => {
      if (kind === "managed") await ensureManagedCellFont(family);
      else if (!(await ensureLocalSymbolFont(family)))
        throw new CellFontResourceError(family, "missing-local-resource");
    })
    .then(
      () => {
        if (attempts.get(family) === promise && resources.value.get(family)?.state !== "ready")
          publish({ family, kind, state: "ready" });
      },
      (error: unknown) => {
        const failure =
          error instanceof CellFontResourceError
            ? error
            : new CellFontResourceError(family, "font-load", error);
        if (attempts.get(family) === promise)
          publish({ family, kind, state: "error", error: failure });
        throw failure;
      },
    );
  attempts.set(family, promise);
  return promise;
}

/** Invalidation does not unload a registered face or change any saved resource. */
export function invalidateCellFontResource(family: string): void {
  attempts.delete(family);
  if (!resources.value.has(family)) return;
  const next = new Map(resources.value);
  next.delete(family);
  resources.value = next;
  revision.value++;
}

/** Explicit UI retry after a failure, or after the missing font was imported. */
export function retryCellFontResource(family: string): Promise<void> {
  if (getCellFontResourceStatus(family).state === "loading") return ensureCellFontResource(family);
  invalidateCellFontResource(family);
  return ensureCellFontResource(family);
}
