// @vitest-environment node
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbook,
  createSheet,
  getActiveSheet,
  createWorkbookEvaluator,
} from "@sheetcraft/core/workbook";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSetSheetDrawingsCommand } from "@sheetcraft/core/commands";
import { normalizeSheetDrawing } from "@sheetcraft/core/sheet-drawings";
import { groupShapeRoots } from "@sheetcraft/core/shape-group-planning";
import { findShapeGroupNode } from "@sheetcraft/core/shape-group";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { useTextBoxReference } from "../../../modules/sheet-drawings/useTextBoxReference";
import { createTextBoxReferenceResolver } from "../../../modules/sheet-drawings/textbox-reference-display";
import { prepareTextBoxReferenceUpdate } from "../../../modules/sheet-drawings/prepare-textbox-reference-update";
import { planShapeTextPaint } from "../../../modules/sheet-drawings/shape-text-paint";
import * as runtime from "../../../modules/sheet-drawings/shape-text-runtime";
import { ref, shallowRef } from "vue";

afterEach(() => vi.restoreAllMocks());
function fixture(kind: "legacy" | "frame" | "owned" = "frame", prepare = false) {
  vi.spyOn(runtime, "ensureDrawingShapeTextFont").mockResolvedValue(undefined);
  const workbook = createWorkbook({ id: "reference-actions", sheetId: "owner" });
  const sheet = getActiveSheet(workbook),
    source = createSheet("Data source", "source");
  source.cells.set("0:0", {
    content: { kind: "literal", value: 0.125 },
    style: { numberFormat: { kind: "percent", fractionDigits: 1 } },
  });
  workbook.sheets.set(source.id, source);
  const plain = createGraphicDrawing("box", "textBox", "Box", { row: 2, column: 3 });
  plain.text = "Original text";
  plain.shapeText!.characterRuns = [{ start: 0, end: 8, bold: true, fontSize: 24 }];
  const { anchor: _anchor, offsetX: _x, offsetY: _y, width: _w, height: _h, ...appearance } = plain;
  const framed = normalizeSheetDrawing({
    ...appearance,
    kind: "textBox",
    shapeFrame: {
      kind: "shape-frame-v1",
      anchor: { mode: "fixed", x: 120, y: 80, size: { width: 240, height: 100 } },
    },
  });
  const metrics = createPictureSheetMetrics(sheet);
  sheet.drawings =
    kind === "legacy"
      ? [plain]
      : kind === "frame"
        ? [framed]
        : groupShapeRoots(
            [framed, { ...framed, id: "sibling" }],
            ["box", "sibling"],
            { id: "group", name: "Group" },
            metrics,
          );
  const core = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const revision = ref(0),
    generation = ref(0),
    currentSheet = shallowRef(sheet);
  const resolver = shallowRef(
    createTextBoxReferenceResolver({
      workbook,
      evaluator: createWorkbookEvaluator(workbook, sheet.id),
      locale: "en-US",
    }),
  );
  const refresh = () => {
    revision.value++;
    resolver.value = createTextBoxReferenceResolver({
      workbook,
      evaluator: createWorkbookEvaluator(workbook, sheet.id),
      locale: "en-US",
    });
  };
  const actions = useTextBoxReference({
    getWorkbook: () => core.workbook,
    getSheet: () => currentSheet.value,
    getGeneration: () => generation.value,
    getRevision: () => revision.value,
    getMetrics: () => metrics,
    getResolver: () => resolver.value,
    isBusy: () => false,
    flush: () => true,
    replaceCollection: (next, expected, supplied, guard) => {
      if (
        supplied !== metrics ||
        guard?.() === false ||
        expected.some((root, index) => root !== sheet.drawings?.[index])
      )
        return false;
      const proposed = prepare
        ? next.map((candidate) =>
            prepareTextBoxReferenceUpdate(
              resolver.value,
              candidate,
              expected.find((value) => value.id === candidate.id),
              undefined,
              {
                measurer: {
                  measure: (text) => [...text].length * 10,
                  measureMetrics: (text) => ({
                    width: [...text].length * 10,
                    ascent: 15,
                    descent: 5,
                    inkLeft: 0,
                    inkRight: [...text].length * 10,
                  }),
                },
                normalLineMetrics: { ascent: 15, descent: 5, lineAdvance: 20 },
                resolveNormalLineMetrics: () => ({ ascent: 15, descent: 5, lineAdvance: 20 }),
              },
              {
                preflight: (options) => {
                  const plan = planShapeTextPaint(options);
                  return plan.kind !== "ready"
                    ? {
                        kind: "unavailable",
                        reason: plan.reason,
                        missingAssetIds: [...plan.missingAssetIds],
                      }
                    : {
                        kind: "ready",
                        proof: "numeric-source",
                        actualDensity: plan.actualDensity,
                        estimatedPeakBytes: plan.estimatedPeakBytes,
                        contourCount: 0,
                        edgeCount: 0,
                        pointCount: 0,
                        glyphCommandCount: 0,
                      };
                },
              },
              metrics,
              { candidateForest: next, sourceForest: expected, revision: revision.value },
              "preserve-geometry",
            ),
          )
        : next;
      const accepted = executeWorkbookCommand(
        core,
        createSetSheetDrawingsCommand(sheet.id, proposed),
      );
      if (accepted) refresh();
      return accepted;
    },
  });
  const root = () => sheet.drawings![0]!;
  const path = kind === "owned" ? ["group", "box"] : ["box"];
  const node = () => {
    const current = root();
    const value = current.kind === "shapeGroup" ? findShapeGroupNode(current, path)!.node : current;
    if (value.kind !== "textBox") throw new TypeError("Expected fixture text box.");
    return value;
  };
  const open = () => {
    expect(actions.open(root(), path)).toBe(true);
    return actions.dialog.value!;
  };
  return {
    workbook,
    sheet,
    source,
    core,
    revision,
    generation,
    currentSheet,
    resolver,
    metrics,
    refresh,
    actions,
    root,
    node,
    path,
    open,
  };
}

describe("single-cell TextBox source actions and genuine Core history", () => {
  test.each(["legacy", "frame", "owned"] as const)(
    "%s bind/clear is one reversible source transaction",
    async (kind) => {
      const f = fixture(kind),
        before = serializeWorkbook(f.workbook),
        opened = f.open();
      expect(opened.replacesContent).toBe(true);
      expect(opened.preview("='Data source'!$A$1")).toBe("12.5%");
      expect(await opened.confirm("A1", f.source.id)).toBe(true);
      expect(f.node()).toMatchObject({
        kind: "textBox",
        text: "",
        textReference: { sheetId: "source", cell: { row: 0, column: 0 } },
      });
      expect(f.node().shapeText?.characterRuns).toBeUndefined();
      expect(f.core.history.undoStack).toHaveLength(1);
      const linked = serializeWorkbook(f.workbook);
      expect(undoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(redoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(linked);
      f.refresh();
      const unlink = f.open();
      expect(await unlink.unlink()).toBe(true);
      expect(f.node()).toMatchObject({ kind: "textBox", text: "12.5%" });
      expect("textReference" in f.node()).toBe(false);
      expect(undoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(linked);
    },
  );
  test("cancel, ranges including repeated same cell, names and expressions leave originals untouched", async () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook),
      dialog = f.open();
    for (const input of [
      "A1:B2",
      "A1:A1",
      "='Data source'!$A$1:$A$1",
      "A1+1",
      "SUM(A1)",
      "NamedCell",
      "[other.xlsx]Sheet1!A1",
    ]) {
      expect(await dialog.confirm(input)).toBe(false);
      expect(f.actions.error.value).toBe("invalid");
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.core.history.undoStack).toHaveLength(0);
    }
    dialog.close();
    expect(f.actions.dialog.value).toBeUndefined();
    expect(await dialog.confirm("A1")).toBe(false);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });
  test("old dialog confirm/cancel cannot replace a newer instance", async () => {
    const f = fixture(),
      before = serializeWorkbook(f.workbook),
      old = f.open(),
      current = f.open();
    old.close();
    expect(f.actions.dialog.value).toBe(current);
    expect(await old.confirm("A1")).toBe(false);
    expect(f.actions.dialog.value).toBe(current);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
    expect(await current.confirm("A1")).toBe(true);
  });
  test.each(["generation", "revision", "sheet", "owner", "font"] as const)(
    "a late font promise rejects changed %s without mutation",
    async (change) => {
      const f = fixture(),
        before = serializeWorkbook(f.workbook),
        dialog = f.open();
      let resolve!: () => void;
      vi.mocked(runtime.ensureDrawingShapeTextFont).mockReturnValueOnce(
        new Promise<void>((done) => {
          resolve = done;
        }),
      );
      const applying = dialog.confirm("A1");
      expect(f.actions.busy.value).toBe(true);
      if (change === "generation") f.generation.value++;
      if (change === "revision") f.revision.value++;
      if (change === "sheet") f.currentSheet.value = f.source;
      if (change === "owner") f.sheet.drawings = [...f.sheet.drawings!];
      if (change === "font")
        f.resolver.value = createTextBoxReferenceResolver({
          workbook: f.workbook,
          evaluator: createWorkbookEvaluator(f.workbook, f.sheet.id),
          locale: "en-US",
        });
      // A replacement array with the same leaf identities is deliberately a valid
      // stable forest; change an actual owner object to exercise CAS.
      if (change === "owner") f.sheet.drawings![0] = normalizeSheetDrawing(f.sheet.drawings![0]!);
      resolve();
      expect(await applying).toBe(false);
      expect(f.actions.error.value).toBe("stale");
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(f.core.history.undoStack).toHaveLength(0);
    },
  );
  test("source read does not require source write permission; owner edit still does", async () => {
    const f = fixture();
    f.source.properties.protected = true;
    expect(await f.open().confirm("A1", f.source.id)).toBe(true);
    f.sheet.properties.protected = true;
    expect(f.actions.open(f.root(), f.path)).toBe(false);
    expect(f.core.history.undoStack).toHaveLength(1);
  });
  test.each(["frame", "owned"] as const)(
    "%s relinks an unavailable old source without consuming its discarded display",
    async (kind) => {
      const f = fixture(kind, true);
      expect(await f.open().confirm("A1", f.source.id)).toBe(true);
      f.source.cells.set("0:0", { content: { kind: "literal", value: "x".repeat(100001) } });
      f.source.cells.set("0:1", { content: { kind: "literal", value: "Ready source" } });
      f.refresh();
      const before = serializeWorkbook(f.workbook),
        frame = JSON.stringify(f.root());
      expect(await f.open().unlink()).toBe(false);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      expect(await f.open().confirm("B1", f.source.id)).toBe(true);
      expect(f.node()).toMatchObject({
        text: "",
        textReference: { sheetId: "source", cell: { row: 0, column: 1 } },
      });
      expect(f.node().shapeText?.characterRuns).toBeUndefined();
      expect(JSON.stringify(f.root()).replace('"column":1', '"column":0')).toBe(frame);
      expect(f.core.history.undoStack).toHaveLength(2);
      expect(undoWorkbookCommand(f.core)).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );
});
