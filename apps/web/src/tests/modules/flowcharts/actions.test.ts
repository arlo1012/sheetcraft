// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test, vi } from "vitest";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import type { SheetAttachmentDrawing } from "@sheetcraft/core/sheet-drawings";
import {
  createSheet,
  createWorkbook,
  getActiveSheet,
  insertSheet,
  type Sheet,
} from "@sheetcraft/core/workbook";
import { createAttachmentDrawing } from "../../../modules/attachments/create-attachment-drawing";
import {
  decodeFlowchartAttachment,
  encodeFlowchartAttachment,
  type FlowchartDocument,
} from "../../../modules/flowcharts/flowchart-document";
import { createFlowchartTemplate } from "../../../modules/flowcharts/flowchart-templates";
import { useFlowchartActions } from "../../../modules/flowcharts/useFlowchartActions";

function fixture() {
  const workbook = createWorkbook({ id: "flowchart-actions", sheetId: "sheet" });
  const initialSheet = getActiveSheet(workbook);
  let sheet = initialSheet;
  let busy = false;
  const address = { row: 2, column: 3 };
  const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
  const flush = vi.fn(() => true);
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  const actions = useFlowchartActions({
    getSheets: () => workbook.sheets.values(),
    getSheet: () => sheet,
    getAddress: () => address,
    isBusy: () => busy,
    flush,
    execute,
  });
  return {
    workbook,
    initialSheet,
    session,
    address,
    flush,
    execute,
    actions,
    get sheet() {
      return sheet;
    },
    switchSheet() {
      sheet = createSheet("Other", "other");
      insertSheet(workbook, sheet);
    },
    setBusy(value: boolean) {
      busy = value;
    },
  };
}

function source(title = "订单审批 🧾"): FlowchartDocument {
  return { ...createFlowchartTemplate("approval", "zh-CN"), title };
}

function addFlowchart(sheet: Sheet, document = source(), id = "source"): SheetAttachmentDrawing {
  const drawing = createAttachmentDrawing(
    id,
    { row: 5, column: 6 },
    encodeFlowchartAttachment(document),
  );
  sheet.drawings = [...(sheet.drawings ?? []), drawing];
  return drawing;
}

function attachments(sheet: Sheet) {
  return (sheet.drawings ?? []).filter(
    (drawing): drawing is SheetAttachmentDrawing => drawing.kind === "attachment",
  );
}

describe("flowchart actions", () => {
  test.each(["gallery", "blank", "import"] as const)(
    "opens the %s editor without creating an attachment or a command",
    (start) => {
      const f = fixture();
      const before = serializeWorkbook(f.workbook);

      expect(f.actions.open(start)).toBe(true);
      expect(f.actions.editor.value).toMatchObject({
        start,
        sheet: f.sheet,
        anchor: { row: 2, column: 3 },
        existing: [],
      });
      expect(f.actions.editor.value?.original).toBeUndefined();
      expect(f.actions.editor.value?.document).toBeUndefined();
      expect(f.actions.error.value).toBe(false);
      expect(f.flush).toHaveBeenCalledTimes(1);
      expect(f.execute).not.toHaveBeenCalled();
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("creates one undoable flowchart attachment at the captured insertion address", () => {
    const f = fixture();
    const unrelated = addFlowchart(f.sheet, source("Existing flowchart"), "unrelated");
    const before = serializeWorkbook(f.workbook);
    const document = source();
    const documentBefore = structuredClone(document);
    f.actions.open("blank");
    f.address.row = 20;
    f.address.column = 30;
    f.actions.save(document);

    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.session.history.undoStack).toHaveLength(1);
    const [retained, inserted] = attachments(f.sheet);
    expect(retained).toEqual(unrelated);
    expect(inserted).toMatchObject({
      kind: "attachment",
      name: document.title,
      anchor: { row: 2, column: 3 },
      width: 480,
      height: 300,
      attachment: { display: "document" },
    });
    expect(inserted!.id).not.toBe(unrelated.id);
    expect(decodeFlowchartAttachment(inserted!.attachment)).toEqual(document);
    expect(document).toEqual(documentBefore);
    expect(f.actions.editor.value).toBeUndefined();
    expect(f.actions.error.value).toBe(false);
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("edits only the source and name while preserving the attachment's outer appearance", () => {
    const f = fixture();
    const original = addFlowchart(f.sheet);
    Object.assign(original, {
      name: "Custom outer name",
      anchor: { row: 10, column: 11 },
      offsetX: 17,
      offsetY: 23,
      width: 620,
      height: 350,
      text: "Outer caption",
      fill: "#fef3c7",
      stroke: "#123456",
      strokeWidth: 3,
      color: "#654321",
      fontSize: 18,
      bold: true,
      italic: true,
      rotation: 25,
    });
    const originalBefore = structuredClone(original);
    const before = serializeWorkbook(f.workbook);
    expect(f.actions.open("gallery", original)).toBe(true);
    expect(f.actions.editor.value?.original).toBe(original);
    expect(f.actions.editor.value?.document).toEqual(source());
    const updated = source("Updated approval ✅");
    updated.nodes[1]!.text = "审核最新申请";
    f.actions.save(updated);

    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(attachments(f.sheet)).toEqual([
      { ...originalBefore, name: updated.title, attachment: encodeFlowchartAttachment(updated) },
    ]);
    expect(original).toEqual(originalBefore);
    expect(f.actions.editor.value).toBeUndefined();
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("retains newer outer placement changes when the edited source bytes remain current", () => {
    const f = fixture();
    const original = addFlowchart(f.sheet);
    f.actions.open("gallery", original);
    const moved = {
      ...original,
      anchor: { row: 12, column: 13 },
      width: 550,
      height: 320,
      rotation: 15,
    };
    f.sheet.drawings = [moved];
    const updated = source("Edited after moving");
    f.actions.save(updated);

    expect(attachments(f.sheet)).toEqual([
      { ...moved, name: updated.title, attachment: encodeFlowchartAttachment(updated) },
    ]);
    expect(f.actions.error.value).toBe(false);
  });

  test.each(["deleted", "source replaced"] as const)(
    "keeps the edit draft without overwriting an original that was %s",
    (change) => {
      const f = fixture();
      const original = addFlowchart(f.sheet);
      f.actions.open("gallery", original);
      const editor = f.actions.editor.value;
      f.sheet.drawings =
        change === "deleted"
          ? []
          : [{ ...original, attachment: encodeFlowchartAttachment(source("Changed elsewhere")) }];
      const before = serializeWorkbook(f.workbook);
      f.actions.save(source("Stale editor title"));

      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.editor.value).toBe(editor);
      expect(f.actions.error.value).toBe(true);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
    },
  );

  test("does not save into either sheet after the current sheet changes", () => {
    const f = fixture();
    f.actions.open("blank");
    const editor = f.actions.editor.value;
    f.switchSheet();
    const before = serializeWorkbook(f.workbook);
    f.actions.save(source());

    expect(f.execute).not.toHaveBeenCalled();
    expect(f.actions.editor.value).toBe(editor);
    expect(f.actions.error.value).toBe(true);
    expect(f.initialSheet.drawings ?? []).toEqual([]);
    expect(f.sheet.drawings ?? []).toEqual([]);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each(["busy", "protected", "flush refusal"] as const)(
    "does not open an editor after %s",
    (block) => {
      const f = fixture();
      if (block === "busy") f.setBusy(true);
      if (block === "protected") f.sheet.properties.protected = true;
      if (block === "flush refusal") f.flush.mockReturnValue(false);

      expect(f.actions.open()).toBe(false);
      expect(f.actions.editor.value).toBeUndefined();
      expect(f.execute).not.toHaveBeenCalled();
      expect(f.sheet.drawings ?? []).toEqual([]);
    },
  );

  test("does not open an existing attachment whose flowchart source is damaged", () => {
    const f = fixture();
    const original = addFlowchart(f.sheet);
    original.attachment = { ...original.attachment, data: "%%%=" };

    expect(f.actions.open("gallery", original)).toBe(false);
    expect(f.actions.editor.value).toBeUndefined();
    expect(f.flush).not.toHaveBeenCalled();
    expect(f.execute).not.toHaveBeenCalled();
  });

  test.each(["busy", "protected"] as const)(
    "rechecks %s before saving and keeps the draft available for retry",
    (block) => {
      const f = fixture();
      f.actions.open("blank");
      const editor = f.actions.editor.value;
      if (block === "busy") f.setBusy(true);
      else f.sheet.properties.protected = true;
      const before = serializeWorkbook(f.workbook);
      f.actions.save(source());

      expect(f.execute).not.toHaveBeenCalled();
      expect(f.actions.editor.value).toBe(editor);
      expect(f.actions.error.value).toBe(true);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      f.setBusy(false);
      f.sheet.properties.protected = false;
      f.actions.save(source());
      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.actions.editor.value).toBeUndefined();
      expect(f.actions.error.value).toBe(false);
    },
  );

  test.each(["refused", "thrown"] as const)(
    "retains the editor after a %s command and accepts a later retry",
    (failure) => {
      const f = fixture();
      const original = addFlowchart(f.sheet);
      f.actions.open("gallery", original);
      const editor = f.actions.editor.value;
      const before = serializeWorkbook(f.workbook);
      if (failure === "refused") f.execute.mockReturnValueOnce(false);
      else
        f.execute.mockImplementationOnce(() => {
          throw new Error("Synthetic command failure");
        });
      const updated = source("Retry title");
      f.actions.save(updated);

      expect(f.execute).toHaveBeenCalledTimes(1);
      expect(f.actions.editor.value).toBe(editor);
      expect(f.actions.error.value).toBe(true);
      expect(f.session.history.undoStack).toHaveLength(0);
      expect(serializeWorkbook(f.workbook)).toEqual(before);
      f.actions.save(updated);
      expect(f.execute).toHaveBeenCalledTimes(2);
      expect(f.actions.editor.value).toBeUndefined();
      expect(f.actions.error.value).toBe(false);
      expect(decodeFlowchartAttachment(attachments(f.sheet)[0]!.attachment)).toEqual(updated);
    },
  );

  test("does not save an empty blank template and lets the user cancel its draft", () => {
    const f = fixture();
    f.actions.open("blank");
    const before = serializeWorkbook(f.workbook);
    f.actions.save(createFlowchartTemplate("blank", "en-US"));

    expect(f.actions.error.value).toBe(true);
    expect(f.actions.editor.value).toBeDefined();
    expect(f.execute).not.toHaveBeenCalled();
    f.actions.close();
    expect(f.actions.editor.value).toBeUndefined();
    expect(f.actions.error.value).toBe(false);
    f.actions.save(source());
    expect(f.execute).not.toHaveBeenCalled();
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test("canceling an existing flowchart editor leaves its source and history untouched", () => {
    const f = fixture();
    const original = addFlowchart(f.sheet);
    const before = serializeWorkbook(f.workbook);
    f.actions.open("gallery", original);
    f.actions.editor.value!.document!.nodes[0]!.text = "Unsaved local change";
    f.actions.close();

    expect(f.actions.editor.value).toBeUndefined();
    expect(f.actions.error.value).toBe(false);
    expect(f.execute).not.toHaveBeenCalled();
    expect(f.session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(f.workbook)).toEqual(before);
  });

  test.each(["basic", "approval"] as const)(
    "saves the built-in %s template without mutating it",
    (name) => {
      const f = fixture();
      const template = createFlowchartTemplate(name, "zh-CN");
      const before = structuredClone(template);
      f.actions.open("gallery");
      f.actions.save(template);

      expect(decodeFlowchartAttachment(attachments(f.sheet)[0]!.attachment)).toEqual(before);
      expect(template).toEqual(before);
      expect(createFlowchartTemplate(name, "zh-CN")).toEqual(before);
    },
  );

  test("offers valid sources from visible sheets and ignores hidden or non-flowchart attachments", () => {
    const f = fixture();
    addFlowchart(f.sheet, source("Current chart"), "current");
    const other = createSheet("Visible source", "visible");
    insertSheet(f.workbook, other);
    addFlowchart(other, source("Other chart"), "other-chart");
    other.drawings!.push(
      createAttachmentDrawing("ordinary-file", { row: 0, column: 0 }, {
        filename: "report.txt",
        mimeType: "text/plain",
        size: 3,
        data: "YWJj",
        display: "document",
      }),
    );
    const corrupt = addFlowchart(other, source("Corrupt source"), "corrupt");
    corrupt.attachment = { ...corrupt.attachment, data: "%%%=" };
    const hidden = createSheet("Hidden source", "hidden");
    hidden.properties.hidden = true;
    insertSheet(f.workbook, hidden);
    addFlowchart(hidden, source("Hidden chart"), "hidden-chart");

    f.actions.open();

    expect(f.actions.editor.value?.existing).toEqual([
      { sheetName: f.sheet.name, document: source("Current chart") },
      { sheetName: other.name, document: source("Other chart") },
    ]);
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("reuses an existing chart as an independent attachment without changing the source", () => {
    const f = fixture();
    const original = addFlowchart(f.sheet, source("Reusable chart"));
    const originalBefore = structuredClone(original);
    f.actions.open();
    const reused = f.actions.editor.value!.existing[0]!.document;
    reused.title = "Reused copy";
    reused.nodes[0]!.text = "Changed only in the copy";
    f.actions.save(reused);

    const [retained, copied] = attachments(f.sheet);
    expect(retained).toEqual(originalBefore);
    expect(original).toEqual(originalBefore);
    expect(copied!.id).not.toBe(original.id);
    expect(copied!.anchor).toEqual({ row: 2, column: 3 });
    expect(decodeFlowchartAttachment(copied!.attachment)).toEqual(reused);
    expect(decodeFlowchartAttachment(retained!.attachment)).toEqual(source("Reusable chart"));
  });
});
