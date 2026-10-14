import { flushPromises, mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Textarea } from "tdesign-vue-next/es/textarea";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { deserializeWorkbook, serializeWorkbook } from "@sheetcraft/core/serialization";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import DrawingEditorDialog from "../../../modules/sheet-drawings/components/DrawingEditorDialog.vue";
import EquationContent from "../../../modules/sheet-drawings/components/EquationContent.vue";
import { useDrawingActions } from "../../../modules/sheet-drawings/useDrawingActions";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function drawing(kind: "icon" | "equation"): SheetGraphicDrawing {
  return {
    id: kind,
    kind,
    name: "Synthetic object",
    anchor: { row: 1, column: 1 },
    offsetX: 8,
    offsetY: 8,
    width: 240,
    height: 120,
    text: kind === "equation" ? "\\frac{a}{b} + x^2" : "Literal <script>label</script>",
    shape: "heart",
    fill: "#abcdef",
    stroke: "#123456",
    strokeWidth: 3,
    color: "#654321",
    fontSize: 28,
    bold: false,
    italic: true,
    rotation: 15,
  };
}
function editor(original: SheetGraphicDrawing) {
  const wrapper = mount(DrawingEditorDialog, {
    attachTo: document.body,
    props: { drawing: original, disabled: false },
    global: { plugins: [createAppI18n("en-US")], stubs: { TTextarea: true } },
  });
  mounted.push(wrapper);
  return wrapper;
}
describe("existing icon and equation objects", () => {
  test("equations hide unused global font switches and retain previous values", async () => {
    const original = { ...drawing("equation"), bold: true, italic: true };
    const wrapper = editor(original);
    expect(wrapper.text()).not.toContain("Bold");
    expect(wrapper.text()).not.toContain("Italic");
    wrapper.getComponent(Textarea).vm.$emit("update:modelValue", "\\mathbf{A} + \\mathit{B}");
    await nextTick();
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")?.[0]).toEqual([
      { ...original, text: "\\mathbf{A} + \\mathit{B}" },
    ]);
  });
  test("equations hide unused fill and outline controls without deleting stored fields", async () => {
    const original = drawing("equation");
    const wrapper = editor(original);
    expect(wrapper.findAll('input[type="color"]')).toHaveLength(1);
    expect(wrapper.text()).not.toContain("No fill");
    expect(wrapper.text()).not.toContain("Line width");
    expect(wrapper.text()).not.toContain("Outline");
    wrapper.getComponent(Textarea).vm.$emit("update:modelValue", "x^3");
    await nextTick();
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")?.[0]).toEqual([{ ...original, text: "x^3" }]);
    expect(original.text).toBe("\\frac{a}{b} + x^2");
  });
  test("icons retain the fixed nine choices and effective SVG appearance and literal text", async () => {
    const original = drawing("icon");
    const wrapper = editor(original);
    expect(wrapper.findAll(".drawing-editor__shapes button")).toHaveLength(9);
    expect(wrapper.findAll('input[type="color"]')).toHaveLength(3);
    expect(wrapper.text()).toContain("Bold");
    expect(wrapper.text()).toContain("Italic");
    const rendered = mount(DrawingContent, {
      props: { drawing: original },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(rendered);
    expect(rendered.get("svg g").attributes()).toMatchObject({
      fill: "#abcdef",
      stroke: "#123456",
      "stroke-width": "3",
    });
    expect(rendered.get("svg path").attributes("d")).toContain("C-30 40");
    expect(rendered.get(".drawing-content__text").text()).toBe(original.text);
    expect(rendered.find("script").exists()).toBe(false);
    await wrapper.get('button[aria-label="Star"]').trigger("click");
    wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(wrapper.emitted("confirm")?.[0]).toEqual([{ ...original, shape: "star" }]);
  });
  test("equation renderer retains LaTeX source and uses bounded untrusted KaTeX", async () => {
    const original = drawing("equation");
    const rendered = mount(DrawingContent, {
      props: { drawing: original },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(rendered);
    await flushPromises();
    expect(rendered.find(".katex").exists()).toBe(true);
    expect(rendered.get('annotation[encoding="application/x-tex"]').text()).toBe(original.text);
    expect(rendered.getComponent(EquationContent).attributes("style")).toContain("font-size: 28px");
    expect(rendered.get(".drawing-content").attributes("style")).toContain("rotate(15deg)");
    await rendered.setProps({
      drawing: { ...original, text: "\\href{https://example.invalid}{x}" },
    });
    expect(rendered.find("a").exists()).toBe(false);
    await rendered.setProps({ drawing: { ...original, text: "\\frac{<script>}{" } });
    expect(rendered.find(".katex-error").exists()).toBe(true);
    expect(rendered.find("script").exists()).toBe(false);
    expect(rendered.find("img").exists()).toBe(false);
    expect(original.text).toBe("\\frac{a}{b} + x^2");
  });
  test.each(["icon", "equation"] as const)(
    "%s real history no-op, stale callbacks, edit UndoRedo and snapshot remain exact",
    (kind) => {
      const workbook = createWorkbook({ id: "graphic-lifecycle", sheetId: "sheet" });
      const sheet = getActiveSheet(workbook);
      const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
      const actions = useDrawingActions({
        getWorkbook: () => workbook,
        getSheet: () => sheet,
        getAddress: () => ({ row: 1, column: 1 }),
        isBusy: () => false,
        flush: () => true,
        execute: (command) => executeWorkbookCommand(session, command),
        name: () => kind,
      });
      actions.insert(kind);
      const initial = actions.dialog.value!;
      initial.confirm(initial.initial);
      const created = serializeWorkbook(workbook);
      const saved = sheet.drawings![0] as SheetGraphicDrawing;
      expect(session.history.undoStack).toHaveLength(1);
      actions.edit(saved);
      const noOp = actions.dialog.value!;
      const history = structuredClone(session.history);
      noOp.confirm(noOp.initial);
      expect(actions.dialog.value).toBeUndefined();
      expect(session.history).toEqual(history);
      expect(serializeWorkbook(workbook)).toEqual(created);
      actions.edit(saved);
      const stale = actions.dialog.value!;
      actions.edit(saved);
      const current = actions.dialog.value!;
      stale.confirm({ ...saved, text: "Stale" });
      stale.close();
      expect(actions.dialog.value).toBe(current);
      expect(serializeWorkbook(workbook)).toEqual(created);
      current.confirm({ ...saved, text: "x^3", width: 300, rotation: 20 });
      const edited = serializeWorkbook(workbook);
      expect(session.history.undoStack).toHaveLength(2);
      expect(undoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(workbook)).toEqual(created);
      expect(redoWorkbookCommand(session)).toBe(true);
      expect(serializeWorkbook(workbook)).toEqual(edited);
      expect(serializeWorkbook(deserializeWorkbook(edited))).toEqual(edited);
    },
  );
});
