import {
  LocalSymbolFontError,
  readLoadedLocalSymbolFontSource,
} from "../../shared/cell-text/local-font-source";
import {
  getLoadedManagedCellFontFace,
  MANAGED_CELL_FONTS,
} from "../../shared/cell-text/managed-fonts";

export const CHART_PRINT_MAX_FONT_FACES = 16;
export const CHART_PRINT_MAX_FONT_BYTES = 32 * 1024 * 1024;

export type ChartPrintFontErrorCode =
  | "unavailable"
  | "source-unavailable"
  | "budget"
  | "font-load"
  | "stale"
  | "unprepared"
  | "invalid-family"
  | "disposed";

export class ChartPrintFontError extends Error {
  constructor(
    readonly code: ChartPrintFontErrorCode,
    readonly family?: string,
    cause?: unknown,
  ) {
    super(
      code === "source-unavailable"
        ? `Chart print requires the verified source of the registered font ${family ?? ""}.`
        : `Chart print font preparation failed (${code}).`,
      { cause },
    );
    this.name = "ChartPrintFontError";
  }
}

export type ChartPrintFontLease = {
  /** One batch only. Resolves before the caller's first native text measurement. */
  prepare(cssFamilyStacks: readonly string[], options: { isCurrent: () => boolean }): Promise<void>;
  mapFamily(originalCSSStack: string): string;
  assertCurrent(): void;
  dispose(): void;
};

type FamilyToken = { raw: string; name: string; quoted: boolean };
const genericFamilies = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-serif",
  "ui-sans-serif",
  "ui-monospace",
  "ui-rounded",
  "math",
  "emoji",
  "fangsong",
]);

function decodeCSS(value: string): string {
  return value.replace(/\\([\da-f]{1,6}[\t\n\f\r ]?|[^\n\r\f])/giu, (_match, escape: string) => {
    if (/^[\da-f]/iu.test(escape)) {
      const point = Number.parseInt(escape.trim(), 16);
      return point === 0 || point > 0x10ffff || (point >= 0xd800 && point <= 0xdfff)
        ? "\ufffd"
        : String.fromCodePoint(point);
    }
    return escape;
  });
}

/** Retain order and untouched token spelling, including quoted comma-containing names. */
function parseFamilies(stack: string): FamilyToken[] {
  if (!stack || stack.length > 4096) throw new ChartPrintFontError("invalid-family");
  const tokens: FamilyToken[] = [];
  let start = 0;
  let quote = "";
  let escaped = false;
  const append = (end: number) => {
    const raw = stack.slice(start, end);
    const value = raw.trim();
    if (!value) throw new ChartPrintFontError("invalid-family");
    const quoted = value.startsWith('"') || value.startsWith("'");
    if (quoted && value.at(-1) !== value[0]) throw new ChartPrintFontError("invalid-family");
    if (!quoted && /["'\n\r\f]/u.test(value)) throw new ChartPrintFontError("invalid-family");
    const name = decodeCSS(quoted ? value.slice(1, -1) : value.replace(/\s+/gu, " "));
    if (
      !name ||
      [...name].some(
        (character) => character.charCodeAt(0) <= 0x1f || character.charCodeAt(0) === 0x7f,
      )
    )
      throw new ChartPrintFontError("invalid-family");
    tokens.push({ raw, name, quoted });
    if (tokens.length > 64) throw new ChartPrintFontError("invalid-family");
    start = end + 1;
  };
  for (let index = 0; index < stack.length; index++) {
    const character = stack[index]!;
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (quote) {
      if (character === quote) quote = "";
    } else if (character === '"' || character === "'") quote = character;
    else if (character === ",") append(index);
  }
  if (quote || escaped) throw new ChartPrintFontError("invalid-family");
  append(stack.length);
  return tokens;
}

/** The print warm-up and private lease share CSS token decoding and source identity. */
export function getChartPrintOwnedFontFamilies(stack: string): string[] {
  return [
    ...new Set(
      parseFamilies(stack).flatMap((token) => {
        const managed = MANAGED_CELL_FONTS.find(
          (font) => font.family.toLowerCase() === token.name.toLowerCase(),
        );
        if (managed) return [managed.family];
        const local = /^SheetcraftLocal_([a-f0-9]{64})$/iu.exec(token.name);
        return local ? [`SheetcraftLocal_${local[1]!.toLowerCase()}`] : [];
      }),
    ),
  ];
}

function faceFamily(face: FontFace): string {
  const tokens = parseFamilies(face.family);
  if (tokens.length !== 1) throw new ChartPrintFontError("source-unavailable", face.family);
  return tokens[0]!.name;
}

function descriptors(face: FontFace): FontFaceDescriptors {
  return {
    weight: face.weight,
    style: face.style,
    stretch: face.stretch,
    unicodeRange: face.unicodeRange,
    featureSettings: face.featureSettings,
    variationSettings: face.variationSettings,
    display: face.display,
    ascentOverride: face.ascentOverride,
    descentOverride: face.descentOverride,
    lineGapOverride: face.lineGapOverride,
  };
}

function signature(face: FontFace): string {
  return JSON.stringify([face.family, face.status, descriptors(face)]);
}

let aliasSerial = 0;
let aliasNonce: string | undefined;
const documentBudgets = new WeakMap<Document, { faces: number; bytes: number }>();

function nextAlias(fontSet: FontFaceSet): string {
  if (!aliasNonce) {
    if (!globalThis.crypto?.getRandomValues) throw new ChartPrintFontError("unavailable");
    aliasNonce = [...globalThis.crypto.getRandomValues(new Uint32Array(4))]
      .map((word) => word.toString(16).padStart(8, "0"))
      .join("");
  }
  const occupied = new Set([...fontSet].map((face) => faceFamily(face).toLowerCase()));
  for (let attempt = 0; attempt < 1024; attempt++) {
    if (!Number.isSafeInteger(aliasSerial) || aliasSerial >= Number.MAX_SAFE_INTEGER)
      throw new ChartPrintFontError("budget");
    const alias = `SheetcraftPrint_${aliasNonce}_${++aliasSerial}`;
    if (!occupied.has(alias.toLowerCase())) return alias;
  }
  throw new ChartPrintFontError("budget");
}

async function readManagedBytes(
  url: string,
  maxBytes: number,
  signal: AbortSignal,
  checkpoint: () => void,
): Promise<ArrayBuffer> {
  if (maxBytes <= 0) throw new ChartPrintFontError("budget");
  checkpoint();
  const response = await fetch(url, { signal, credentials: "same-origin" });
  checkpoint();
  if (!response.ok || !response.body) throw new ChartPrintFontError("source-unavailable");
  const length = response.headers.get("content-length");
  if (length !== null && (!/^\d+$/u.test(length) || Number(length) > maxBytes)) {
    await response.body.cancel();
    throw new ChartPrintFontError("budget");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      checkpoint();
      if (done) break;
      if (value.byteLength > maxBytes - total) throw new ChartPrintFontError("budget");
      total += value.byteLength;
      chunks.push(value);
    }
    if (!total) throw new ChartPrintFontError("source-unavailable");
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Original application document only. Private, never-reused native family names
 * prevent a screen fallback measurement from warming the print engine's cache.
 * No global text provider, original face mutation, font scan, or persisted asset.
 */
export function createChartPrintFontLease(owner: Document): ChartPrintFontLease {
  if (
    typeof document === "undefined" ||
    owner !== document ||
    typeof FontFace === "undefined" ||
    !owner.fonts ||
    typeof owner.fonts[Symbol.iterator] !== "function"
  )
    throw new ChartPrintFontError("unavailable");
  const fontSet = owner.fonts;
  const budget = documentBudgets.get(owner) ?? { faces: 0, bytes: 0 };
  documentBudgets.set(owner, budget);
  const owned = new Set<FontFace>();
  const ownedSnapshots = new Map<FontFace, string>();
  const mapped = new Map<string, string>();
  const aliases = new Map<string, string>();
  const controller = new AbortController();
  let state: "new" | "preparing" | "ready" | "disposed" = "new";
  let failure: ChartPrintFontError | undefined;
  let isCurrent: (() => boolean) | undefined;
  let snapshot = new Map<FontFace, string>();
  let reservedFaces = 0;
  let reservedBytes = 0;

  const dispose = () => {
    if (state === "disposed") return;
    state = "disposed";
    controller.abort();
    fontSet.removeEventListener("loading", onFontEvent);
    fontSet.removeEventListener("loadingdone", onFontEvent);
    fontSet.removeEventListener("loadingerror", onFontEvent);
    for (const face of owned) fontSet.delete(face);
    owned.clear();
    ownedSnapshots.clear();
    mapped.clear();
    aliases.clear();
    budget.faces -= reservedFaces;
    budget.bytes -= reservedBytes;
    reservedFaces = reservedBytes = 0;
  };
  const fail = (error: ChartPrintFontError): never => {
    failure ??= error;
    dispose();
    throw failure;
  };
  const checkpoint = () => {
    if (failure) throw failure;
    if (state === "disposed") throw new ChartPrintFontError("disposed");
    if (isCurrent && !isCurrent()) fail(new ChartPrintFontError("stale"));
    if (state === "new") return;
    const current = [...fontSet].filter((face) => !owned.has(face));
    if (
      owner.fonts !== fontSet ||
      current.length !== snapshot.size ||
      current.some((face) => snapshot.get(face) !== signature(face)) ||
      [...ownedSnapshots].some(
        ([face, expected]) => !fontSet.has(face) || signature(face) !== expected,
      )
    )
      fail(new ChartPrintFontError("stale"));
  };
  function onFontEvent(event: Event) {
    try {
      checkpoint();
      const faces =
        "fontfaces" in event && Array.isArray(event.fontfaces)
          ? (event.fontfaces as FontFace[])
          : [];
      // Loading detached private faces should not generate set events. Ignore
      // an implementation's explicit own-face event only after the snapshot check.
      if (faces.length && faces.every((face) => owned.has(face))) return;
      if (state === "preparing" && event.type === "loading" && fontSet.status === "loaded") return;
      fail(new ChartPrintFontError("stale"));
    } catch {
      // The next observer checkpoint surfaces the recorded error to the caller.
    }
  }

  const prepare: ChartPrintFontLease["prepare"] = async (stacks, options) => {
    if (state !== "new")
      throw failure ?? new ChartPrintFontError(state === "disposed" ? "disposed" : "unprepared");
    isCurrent = options.isCurrent;
    snapshot = new Map([...fontSet].map((face) => [face, signature(face)]));
    state = "preparing";
    fontSet.addEventListener("loading", onFontEvent);
    fontSet.addEventListener("loadingdone", onFontEvent);
    fontSet.addEventListener("loadingerror", onFontEvent);
    try {
      checkpoint();
      if (stacks.length > 256) throw new ChartPrintFontError("budget");
      const parsed = new Map(stacks.map((stack) => [stack, parseFamilies(stack)]));
      const families = new Map<string, FamilyToken>();
      for (const tokens of parsed.values())
        for (const token of tokens) {
          const previous = families.get(token.name.toLowerCase());
          families.set(token.name.toLowerCase(), previous?.quoted ? previous : token);
        }
      for (const [familyKey, token] of families) {
        const family = token.name;
        checkpoint();
        const managed = MANAGED_CELL_FONTS.find(
          (entry) => entry.family.toLowerCase() === family.toLowerCase(),
        );
        const localId = /^SheetcraftLocal_([a-f0-9]{64})$/iu.exec(family);
        const local = Boolean(localId);
        const registered = [...snapshot.keys()].filter(
          (face) => faceFamily(face).toLowerCase() === family.toLowerCase(),
        );
        if (!managed && !local) {
          if (!(genericFamilies.has(family.toLowerCase()) && !token.quoted) && registered.length)
            throw new ChartPrintFontError("source-unavailable", family);
          continue;
        }
        if (budget.faces >= CHART_PRINT_MAX_FONT_FACES)
          throw new ChartPrintFontError("budget", family);
        budget.faces++;
        reservedFaces++;
        const remaining = CHART_PRINT_MAX_FONT_BYTES - budget.bytes;
        let bytes: ArrayBuffer;
        let descriptor: FontFaceDescriptors;
        if (managed) {
          const sourceFace = getLoadedManagedCellFontFace(managed.family);
          if (!sourceFace || registered.length !== 1 || registered[0] !== sourceFace)
            throw new ChartPrintFontError("source-unavailable", family);
          descriptor = descriptors(sourceFace);
          if (descriptor.weight !== managed.weight)
            throw new ChartPrintFontError("source-unavailable", family);
          bytes = await readManagedBytes(managed.url, remaining, controller.signal, checkpoint);
        } else {
          let source: Awaited<ReturnType<typeof readLoadedLocalSymbolFontSource>>;
          try {
            if (!localId) throw new ChartPrintFontError("source-unavailable", family);
            source = await readLoadedLocalSymbolFontSource(
              `SheetcraftLocal_${localId[1]!.toLowerCase()}`,
              remaining,
            );
          } catch (error) {
            throw new ChartPrintFontError(
              error instanceof LocalSymbolFontError && error.code === "size"
                ? "budget"
                : "source-unavailable",
              family,
              error,
            );
          }
          checkpoint();
          if (!source || registered.length !== 1 || registered[0] !== source.face)
            throw new ChartPrintFontError("source-unavailable", family);
          bytes = source.bytes;
          descriptor = descriptors(source.face);
        }
        checkpoint();
        if (bytes.byteLength > CHART_PRINT_MAX_FONT_BYTES - budget.bytes)
          throw new ChartPrintFontError("budget", family);
        budget.bytes += bytes.byteLength;
        reservedBytes += bytes.byteLength;
        const alias = nextAlias(fontSet);
        const face = new FontFace(alias, bytes, descriptor);
        owned.add(face);
        await face.load();
        checkpoint();
        if (face.status !== "loaded") throw new ChartPrintFontError("font-load", family);
        fontSet.add(face);
        ownedSnapshots.set(face, signature(face));
        checkpoint();
        aliases.set(familyKey, alias);
      }
      for (const [stack, tokens] of parsed) {
        mapped.set(
          stack,
          tokens
            .map((token) => {
              const alias = aliases.get(token.name.toLowerCase());
              return alias ? token.raw.replace(/\S(?:[\s\S]*\S)?/u, `"${alias}"`) : token.raw;
            })
            .join(","),
        );
      }
      state = "ready";
      checkpoint();
    } catch (error) {
      fail(
        error instanceof ChartPrintFontError
          ? error
          : new ChartPrintFontError(
              controller.signal.aborted ? "disposed" : "font-load",
              undefined,
              error,
            ),
      );
    }
  };

  return {
    prepare,
    mapFamily(stack) {
      checkpoint();
      if (state !== "ready" || !mapped.has(stack)) throw new ChartPrintFontError("unprepared");
      return mapped.get(stack)!;
    },
    assertCurrent: checkpoint,
    dispose,
  };
}
