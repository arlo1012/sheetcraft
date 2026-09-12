import { flushPromises } from "@vue/test-utils";
import { expect, test } from "vitest";
import SpreadsheetRibbon from "../../../../app/SpreadsheetRibbon.vue";
import NamedRangesDialog from "../../../../modules/formula-tools/components/NamedRangesDialog.vue";
import NamedRangeEditorDialog from "../../../../modules/formula-tools/components/NamedRangeEditorDialog.vue";
import NamedRangePicker from "../../../../modules/formula-tools/components/NamedRangePicker.vue";
import WorkbookFormulaBar from "../../../../modules/workbook/components/WorkbookFormulaBar.vue";
import { triggerCanvasCell } from "../../canvas-interaction";
import {
  createFormulaToolsStore,
  mountFormulaToolsWorkspace,
  registerFormulaToolsCleanup,
} from "./fixture";

registerFormulaToolsCleanup();

test("picks a reference from the manager list and saves only after applying the draft", async () => {
  const wrapper = await mountFormulaToolsWorkspace(createFormulaToolsStore().store);
  wrapper.getComponent(SpreadsheetRibbon).vm.$emit("openNames");
  await flushPromises();
  const manager = wrapper.getComponent(NamedRangesDialog);
  expect(manager.get("[data-select-formula-reference]").attributes("disabled")).toBeDefined();
  manager.vm.$emit("save", { name: "Revenue", reference: "=Summary!$B$1:$C$1" });
  await flushPromises();
  await manager.get("[data-named-range]").trigger("click");
  const reference = manager.get<HTMLInputElement>("[data-name-reference] input");
  await manager.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  expect(manager.props("suspended")).toBe(true);
  expect(manager.findComponent(NamedRangeEditorDialog).exists()).toBe(false);
  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 3 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 3 }, "mouseup", { button: 0 });
  wrapper.getComponent(NamedRangePicker).vm.$emit("confirm");
  await flushPromises();
  expect(manager.props("suspended")).toBe(false);
  expect(reference.element.value).toBe("=Summary!$B$1:$D$3");
  expect(manager.props("ranges")[0]?.reference).toBe("=Summary!$B$1:$C$1");

  await manager.get("[data-select-formula-reference]").trigger("click");
  await triggerCanvasCell(wrapper, { row: 4, column: 0 }, "mousedown", { button: 0 });
  await triggerCanvasCell(wrapper, { row: 4, column: 0 }, "mouseup", { button: 0 });
  wrapper.getComponent(NamedRangePicker).vm.$emit("cancel");
  await flushPromises();
  expect(reference.element.value).toBe("=Summary!$B$1:$D$3");
  await manager.get("[data-name-reference-save]").trigger("click");
  await flushPromises();
  expect(manager.props("visible")).toBe(true);
  expect(manager.props("ranges")[0]?.reference).toBe("=Summary!$B$1:$D$3");
});

test("suspends both dialogs, drags a range and restores the name draft without changing a formula draft", async () => {
  const wrapper = await mountFormulaToolsWorkspace(createFormulaToolsStore().store);
  const formula = wrapper
    .getComponent(WorkbookFormulaBar)
    .get<HTMLTextAreaElement>("[data-formula-input]");
  await formula.trigger("focus");
  await formula.setValue("=SUM(");
  wrapper.getComponent(SpreadsheetRibbon).vm.$emit("openNames");
  await flushPromises();
  const manager = wrapper.getComponent(NamedRangesDialog);
  await manager.get('[data-name-action="new"]').trigger("click");
  const editor = manager.getComponent(NamedRangeEditorDialog);
  await editor.get("[data-formula-name] input").setValue("Revenue");
  await editor.get("[data-select-formula-reference]").trigger("click");
  await flushPromises();
  expect(manager.props("suspended")).toBe(true);
  expect(editor.props("suspended")).toBe(true);
  await triggerCanvasCell(wrapper, { row: 0, column: 1 }, "mousedown", { button: 0, buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 3 }, "mousemove", { buttons: 1 });
  await triggerCanvasCell(wrapper, { row: 2, column: 3 }, "mouseup", { button: 0 });
  await flushPromises();
  const picker = wrapper.getComponent(NamedRangePicker);
  expect(picker.props("reference")).toBe("=Summary!$B$1:$D$3");
  picker.vm.$emit("confirm");
  await flushPromises();
  expect(manager.props("suspended")).toBe(false);
  expect(editor.get<HTMLInputElement>("[data-formula-name] input").element.value).toBe("Revenue");
  expect(editor.get<HTMLInputElement>("[data-formula-reference] input").element.value).toBe(
    "=Summary!$B$1:$D$3",
  );
  expect(formula.element.value).toBe("=SUM(");
  expect(manager.props("ranges")).toEqual([]);

  await editor.get("[data-select-formula-reference]").trigger("click");
  await triggerCanvasCell(wrapper, { row: 4, column: 0 }, "mousedown", { button: 0 });
  await triggerCanvasCell(wrapper, { row: 4, column: 0 }, "mouseup", { button: 0 });
  wrapper.getComponent(NamedRangePicker).vm.$emit("cancel");
  await flushPromises();
  expect(editor.get<HTMLInputElement>("[data-formula-reference] input").element.value).toBe(
    "=Summary!$B$1:$D$3",
  );
  expect(formula.element.value).toBe("=SUM(");
});
