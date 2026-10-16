import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { effectScope } from "vue";
import { describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import {
  createConvertFloatingImageToCellCommand,
  planFloatingPictureToCell,
} from "@sheetcraft/core/commands";
import {
  getActiveSheet,
  getCellContent,
  setCellContent,
  setCellStyle,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { usePictureCellConversion } from "../../../modules/sheet-images/usePictureCellConversion";
import { pictureGroup } from "./picture-group-fixture";
function fixture() {
  const session = createWorkbookSession({ idFactory: createSequentialIdFactory() }),
    sheet = getActiveSheet(session.workbook),
    scope = effectScope();
  sheet.floatingImages = [
    {
      id: "p",
      assetId: "asset",
      altText: "",
      locked: false,
      frame: {
        kind: "object-frame-v1",
        anchor: { mode: "fixed", x: 128, y: 48, size: { width: 80, height: 60 } },
        angleDeg: 37,
        source: { widthRatio: 1, heightRatio: 1, offsetXRatio: 0, offsetYRatio: 0 },
      },
    },
  ];
  let currentSheet: Sheet = sheet,
    generation = 0,
    selected = ["p"],
    accepted = true;
  const onApplied = vi.fn(),
    apply = vi.fn(
      (id, options) =>
        accepted &&
        executeWorkbookCommand(
          session,
          createConvertFloatingImageToCellCommand(options.sheetId, id, options),
        ),
    );
  const conversion = scope.run(() =>
    usePictureCellConversion({
      getWorkbook: () => session.workbook,
      getSheet: () => currentSheet,
      getGeneration: () => generation,
      getSelectedIds: () => selected,
      getSelectedPath: () => null,
      flushPendingEdits: () => true,
      apply,
      onApplied,
    }),
  )!;
  const address = planFloatingPictureToCell(sheet, "p")!.address;
  return {
    session,
    sheet,
    address,
    scope,
    conversion,
    apply,
    onApplied,
    setSelected: (value: string[]) => {
      selected = value;
    },
    nextGeneration: () => generation++,
    setRefused: () => {
      accepted = false;
    },
    switchSheet: () => {
      currentSheet = { ...sheet };
    },
  };
}
describe("picture cell overwrite leases", () => {
  test("blank target applies immediately; one Undo restores the exact float", () => {
    const f = fixture(),
      before = serializeWorkbook(f.session.workbook);
    expect(f.conversion.request("p")).toBe(true);
    expect(f.conversion.confirmation.value).toBeNull();
    expect(getCellContent(f.sheet, f.address)?.kind).toBe("image");
    expect(f.onApplied).toHaveBeenCalledWith(f.address);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    f.scope.stop();
  });
  test.each([
    { kind: "literal", value: "original" },
    { kind: "formula", formula: { source: "=1+2" } },
    { kind: "image", image: { assetId: "old", altText: "old" } },
  ] as const)(
    "nonempty %o waits for explicit confirmation; cancel preserves all content",
    (content) => {
      const f = fixture();
      setCellContent(f.sheet, f.address, content);
      const before = serializeWorkbook(f.session.workbook);
      expect(f.conversion.request("p")).toBe(false);
      expect(f.apply).not.toHaveBeenCalled();
      f.conversion.confirmation.value!.cancel();
      expect(serializeWorkbook(f.session.workbook)).toEqual(before);
      expect(f.session.history.undoStack).toHaveLength(0);
      f.scope.stop();
    },
  );
  test("confirmation applies the captured value once and Undo restores it", () => {
    const f = fixture();
    setCellContent(f.sheet, f.address, { kind: "literal", value: "original" });
    const before = serializeWorkbook(f.session.workbook);
    f.conversion.request("p");
    const dialog = f.conversion.confirmation.value!;
    expect(dialog.confirm()).toBe(true);
    expect(dialog.confirm()).toBe(false);
    expect(f.apply).toHaveBeenCalledOnce();
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    f.scope.stop();
  });
  test("old dialog callbacks cannot apply or close a reopened request", () => {
    const f = fixture();
    setCellContent(f.sheet, f.address, { kind: "literal", value: "original" });
    f.conversion.request("p");
    const old = f.conversion.confirmation.value!;
    f.conversion.request("p");
    const latest = f.conversion.confirmation.value;
    expect(old.confirm()).toBe(false);
    old.cancel();
    expect(f.conversion.confirmation.value).toBe(latest);
    expect(f.apply).not.toHaveBeenCalled();
    f.scope.stop();
  });
  test.each([
    "generation",
    "sheet",
    "selection",
    "source",
    "target",
    "merge",
    "default-row-height",
    "permission",
    "dispose",
  ] as const)("changed %s rejects without mutation/history", (kind) => {
    const f = fixture();
    setCellContent(f.sheet, f.address, { kind: "literal", value: "original" });
    f.conversion.request("p");
    const dialog = f.conversion.confirmation.value!;
    if (kind === "generation") f.nextGeneration();
    if (kind === "sheet") f.switchSheet();
    if (kind === "selection") f.setSelected([]);
    if (kind === "source") f.sheet.floatingImages[0]!.altText = "new";
    if (kind === "target") setCellContent(f.sheet, f.address, { kind: "literal", value: "new" });
    if (kind === "merge")
      f.sheet.mergedCells = [
        { start: f.address, end: { ...f.address, column: f.address.column + 1 } },
      ];
    if (kind === "default-row-height") f.sheet.defaultRowHeight = 20;
    if (kind === "permission") f.sheet.properties.protected = true;
    if (kind === "dispose") f.scope.stop();
    const before = serializeWorkbook(f.session.workbook);
    expect(dialog.confirm()).toBe(false);
    expect(f.apply).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    f.scope.stop();
  });
  test("false acknowledgement keeps the draft visible and is retryable/cancellable", () => {
    const f = fixture();
    setCellContent(f.sheet, f.address, { kind: "literal", value: "original" });
    f.conversion.request("p");
    const dialog = f.conversion.confirmation.value!;
    f.setRefused();
    expect(dialog.confirm()).toBe(false);
    expect(f.conversion.confirmation.value?.error).toBe(true);
    expect(f.sheet.floatingImages).toHaveLength(1);
    expect(dialog.confirm()).toBe(false);
    dialog.cancel();
    expect(f.conversion.confirmation.value).toBeNull();
    f.scope.stop();
  });
  test("protected unlocked source and merge-expanded destination can transfer", () => {
    const f = fixture();
    f.sheet.properties.protected = true;
    f.sheet.mergedCells = [
      { start: f.address, end: { ...f.address, column: f.address.column + 1 } },
    ];
    setCellStyle(f.sheet, f.address, { unlocked: true });
    expect(f.conversion.request("p")).toBe(false);
    expect(f.apply).not.toHaveBeenCalled();
    setCellStyle(f.sheet, { ...f.address, column: f.address.column + 1 }, { unlocked: true });
    expect(f.conversion.request("p")).toBe(true);
    f.scope.stop();
  });
});

test("confirmation detaches the owner path instead of following caller mutation", () => {
  const f = fixture(),
    root = pictureGroup();
  root.id = "p";
  const first = root.members[0]!;
  if (first.kind !== "grouped-picture-v1") throw Error("Expected picture");
  first.id = "first";
  first.assetId = "first-asset";
  root.members = [first, { ...structuredClone(first), id: "second", assetId: "second-asset" }];
  f.sheet.floatingImages = [root];
  const path = ["p", "first"],
    address = planFloatingPictureToCell(f.sheet, "p", path)!.address;
  setCellContent(f.sheet, address, { kind: "literal", value: "original" });
  expect(f.conversion.request("p", path)).toBe(false);
  path[1] = "second";
  expect(f.conversion.confirmation.value!.confirm()).toBe(true);
  expect(getCellContent(f.sheet, address)).toMatchObject({
    kind: "image",
    image: { assetId: "first-asset" },
  });
  expect(f.sheet.floatingImages[0]).toMatchObject({ assetId: "second-asset" });
  f.scope.stop();
});
test.each(["row", "column", "hiddenRow", "hiddenColumn", "defaultWidth"])(
  "axis lease rejects changed %s before history",
  (kind) => {
    const f = fixture();
    setCellContent(f.sheet, f.address, { kind: "literal", value: "original" });
    f.conversion.request("p");
    if (kind === "row") f.sheet.rowHeights.set(0, 80);
    if (kind === "column") f.sheet.columnWidths.set(0, 80);
    if (kind === "hiddenRow") (f.sheet.hiddenRows ??= new Set()).add(0);
    if (kind === "hiddenColumn") (f.sheet.hiddenColumns ??= new Set()).add(0);
    if (kind === "defaultWidth") f.sheet.defaultColumnWidth = 80;
    const before = serializeWorkbook(f.session.workbook);
    expect(f.conversion.confirmation.value!.confirm()).toBe(false);
    expect(f.apply).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.session.workbook)).toEqual(before);
    expect(f.session.history.undoStack).toHaveLength(0);
    f.scope.stop();
  },
);
