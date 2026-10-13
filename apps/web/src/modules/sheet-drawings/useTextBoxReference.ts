import { computed, shallowRef, ref } from "vue";
import type { Workbook, Sheet } from "@sheetcraft/core/workbook";
import { formatFormulaAddress, parseFormulaReference } from "@sheetcraft/core/formula";
import type { PictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import type { SheetDrawing, SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  findShapeGroupNode,
  type ShapeGroupPath,
  type ShapeGroupChild,
} from "@sheetcraft/core/shape-group";
import { canEditShapeObject } from "@sheetcraft/core/shape-protection";
import type { TextBoxTextReference } from "@sheetcraft/core/text-box-reference";
import { resolveShapeForestForRender } from "./resolved-shape-render-source";
import { ensureDrawingShapeTextFont } from "./shape-text-runtime";
import { isShapeObjectPathVisible } from "./shape-visibility";
import type { TextBoxReferenceResolver } from "./textbox-reference-display";

type ErrorCode = "invalid" | "stale" | "unavailable" | "apply";
export type TextBoxReferenceDialog = Readonly<{
  sessionId: number;
  name: string;
  sheetId: string;
  sheets: readonly { id: string; name: string }[];
  initial: string;
  replacesContent: boolean;
  linked: boolean;
  isCurrent: () => boolean;
  preview: (source: string, sheetId?: string) => string | undefined;
  confirm: (source: string, sheetId?: string) => Promise<boolean>;
  unlink: () => Promise<boolean>;
  close: () => void;
}>;

function sourceAt(root: SheetDrawing, path: ShapeGroupPath) {
  return root.kind === "shapeGroup"
    ? findShapeGroupNode(root, path)?.node
    : path.length === 1 && path[0] === root.id
      ? root
      : undefined;
}
/** Replace only the exact owned leaf's text source; placement is untouched. */
function replaceSource(
  root: SheetDrawing,
  path: ShapeGroupPath,
  text: string,
  reference?: TextBoxTextReference,
): SheetDrawing {
  const replace = <T extends SheetDrawing | ShapeGroupChild>(node: T, depth: number): T => {
    if (node.id !== path[depth]) return node;
    if (depth === path.length - 1) {
      if (node.kind !== "textBox") throw new TypeError("A cell reference requires a text box.");
      const shapeText = node.shapeText && { ...node.shapeText };
      const { textReference: _old, ...base } = node;
      if (shapeText) delete shapeText.characterRuns;
      return {
        ...base,
        text,
        ...(shapeText ? { shapeText } : {}),
        ...(reference ? { textReference: reference } : {}),
      } as T;
    }
    if (node.kind !== "shapeGroup") throw new TypeError("The text box owner changed.");
    return { ...node, members: node.members.map((member) => replace(member, depth + 1)) } as T;
  };
  return replace(root, 0);
}

let nextSession = 0;
export function useTextBoxReference(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getGeneration: () => number;
  getRevision: () => number;
  getMetrics: () => PictureSheetMetrics | undefined;
  getResolver: () => TextBoxReferenceResolver;
  isBusy: () => boolean;
  flush: () => boolean;
  replaceCollection: (
    next: readonly SheetDrawing[],
    expected: readonly SheetDrawing[],
    metrics?: PictureSheetMetrics,
    guard?: () => boolean,
  ) => boolean;
}) {
  const dialog = shallowRef<TextBoxReferenceDialog>();
  const error = ref<ErrorCode>();
  const busy = ref(false);
  const disabled = computed(() => options.isBusy() || busy.value || !dialog.value?.isCurrent());
  function open(root: SheetDrawing, ownedPath?: ShapeGroupPath): boolean {
    if (busy.value || options.isBusy()) return false;
    const workbook = options.getWorkbook(),
      sheet = options.getSheet(),
      generation = options.getGeneration();
    const path = [...(ownedPath ?? [root.id])];
    const node = sourceAt(root, path);
    if (
      node?.kind !== "textBox" ||
      !sheet.drawings?.includes(root) ||
      !canEditShapeObject(sheet, root) ||
      !isShapeObjectPathVisible(root, path) ||
      !options.flush()
    )
      return false;
    if (
      options.getWorkbook() !== workbook ||
      options.getSheet() !== sheet ||
      options.getGeneration() !== generation ||
      sourceAt(root, path) !== node ||
      !sheet.drawings?.includes(root)
    )
      return false;
    const expected = [...sheet.drawings],
      fingerprint = JSON.stringify(expected),
      metrics = options.getMetrics(),
      revision = options.getRevision();
    const resolver = options.getResolver();
    const reference = node.textReference;
    const initialSheet = reference?.sheetId ?? sheet.id;
    const targetSheet = workbook.sheets.get(initialSheet);
    const initial = reference?.cell && targetSheet ? formatFormulaAddress(reference.cell) : "";
    const opened: TextBoxReferenceDialog = {
      sessionId: ++nextSession,
      name: node.name,
      sheetId: targetSheet?.id ?? sheet.id,
      sheets: [...workbook.sheets.values()].map(({ id, name }) => ({ id, name })),
      initial,
      replacesContent:
        !!reference || node.text.length > 0 || !!node.shapeText?.characterRuns?.length,
      linked: !!reference,
      isCurrent: current,
      preview: (source, sourceSheetId) => {
        const ref = resolve(source, sourceSheetId);
        if (!ref) return undefined;
        const result = options.getResolver().resolve(ref);
        return result.status === "ready" ? result.text : undefined;
      },
      confirm: async (source, sourceSheetId) => {
        if (busy.value || !current()) return fail("stale");
        const ref = resolve(source, sourceSheetId);
        if (!ref) return fail("invalid");
        return apply("", ref);
      },
      unlink: async () => {
        if (busy.value || !current() || !reference) return fail("stale");
        const display = resolver.resolve(reference);
        if (display.status !== "ready") return fail("unavailable");
        return apply(display.text);
      },
      close: () => {
        if (dialog.value === opened && !busy.value) {
          dialog.value = undefined;
          error.value = undefined;
        }
      },
    };
    function current(): boolean {
      return (
        dialog.value === opened &&
        !options.isBusy() &&
        options.getWorkbook() === workbook &&
        options.getSheet() === sheet &&
        options.getGeneration() === generation &&
        options.getRevision() === revision &&
        options.getMetrics() === metrics &&
        options.getResolver() === resolver &&
        workbook.sheets.get(sheet.id) === sheet &&
        sheet.drawings?.length === expected.length &&
        expected.every((value, index) => sheet.drawings?.[index] === value) &&
        JSON.stringify(sheet.drawings) === fingerprint &&
        sourceAt(root, path) === node &&
        isShapeObjectPathVisible(root, path) &&
        canEditShapeObject(sheet, root)
      );
    }
    function resolve(source: string, sourceSheetId?: string): TextBoxTextReference | undefined {
      const currentSheetId = sourceSheetId ?? targetSheet?.id ?? sheet.id;
      if (!workbook.sheets.has(currentSheetId)) return undefined;
      const resolved = parseFormulaReference(source.trim().replace(/^=/, ""), {
        currentSheetId,
        resolveSheetId: (name) =>
          [...workbook.sheets.values()].find(
            (entry) => entry.name.toLocaleLowerCase("en-US") === name.toLocaleLowerCase("en-US"),
          )?.id,
      });
      if (
        !resolved ||
        resolved.source.endReference ||
        !workbook.sheets.has(resolved.target.sheetId)
      )
        return undefined;
      return { sheetId: resolved.target.sheetId, cell: { ...resolved.target.range.start } };
    }
    function fail(code: ErrorCode): false {
      if (dialog.value === opened) error.value = code;
      return false;
    }
    async function apply(text: string, ref?: TextBoxTextReference): Promise<boolean> {
      busy.value = true;
      error.value = undefined;
      try {
        const next = replaceSource(root, path, text, ref);
        if (!metrics) return fail("unavailable");
        const pass = resolveShapeForestForRender({ drawings: expected, metrics, revision });
        const leaf = pass.getLeaf(node!.id);
        const carrier = leaf?.carrierLeaf?.view ?? leaf?.carrierRoot?.view;
        if (!carrier || carrier.kind !== "textBox") return fail("unavailable");
        let paintText = text;
        if (ref) {
          const result = resolver.resolve(ref);
          if (result.status !== "ready") return fail("unavailable");
          paintText = result.text;
        }
        const { textReference: _reference, ...paint } = carrier;
        const shapeText = paint.shapeText && { ...paint.shapeText };
        if (shapeText) delete shapeText.characterRuns;
        await ensureDrawingShapeTextFont({
          ...paint,
          text: paintText,
          ...(shapeText ? { shapeText } : {}),
        } as SheetGraphicDrawing);
        if (!current()) return fail("stale");
        const accepted = options.replaceCollection(
          expected.map((value) => (value === root ? next : value)),
          expected,
          metrics,
          current,
        );
        if (!accepted) return fail("apply");
        if (dialog.value === opened) dialog.value = undefined;
        return true;
      } catch {
        return fail("apply");
      } finally {
        busy.value = false;
      }
    }
    dialog.value = opened;
    error.value = undefined;
    return true;
  }
  return { dialog, error, busy, disabled, open };
}
