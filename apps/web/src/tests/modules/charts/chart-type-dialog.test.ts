import { afterEach, describe, expect, test, vi } from "vitest";
import type { ComponentPublicInstance } from "vue";
import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import {
  createWorkbook,
  getActiveSheet,
  createSheetEvaluator,
  setCellContent,
} from "@sheetcraft/core/workbook";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { Dialog } from "tdesign-vue-next/es/dialog";
import OptionList from "../../../shared/option-list/OptionList.vue";
import ChartEditorDialog from "../../../modules/charts/components/ChartEditorDialog.vue";
import ChartTypeNavigation from "../../../modules/charts/components/ChartTypeNavigation.vue";
import ChartSubtypeControls from "../../../modules/charts/components/ChartSubtypeControls.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import { createAppI18n } from "../../../shared/i18n";
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function fixture(mode: "insert" | "change-type" = "insert") {
  const workbook = createWorkbook({ id: "dialog", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  [1, 2, 3].forEach((value, row) =>
    setCellContent(sheet, { row, column: 0 }, { kind: "literal", value }),
  );
  const drawing: SheetChartDrawing = {
    id: "chart",
    kind: "chart",
    name: "Chart",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 480,
    height: 300,
    text: "",
    shape: "rectangle",
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
    color: "#000000",
    fontSize: 14,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      range: { start: { row: 0, column: 0 }, end: { row: 2, column: 0 } },
      title: "Saved title",
      headerRow: false,
      headerColumn: false,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
    },
  };
  const wrapper = mount(ChartEditorDialog, {
    attachTo: document.body,
    props: {
      mode,
      drawing,
      workbook,
      sheet,
      evaluator: createSheetEvaluator(sheet),
      revision: 0,
      disabled: false,
      error: false,
      suspended: false,
      selectReference: vi.fn(async () => undefined),
    },
    global: { plugins: [createAppI18n("en-US")], stubs: { ChartContent: true } },
  });
  wrappers.push(wrapper);
  return { wrapper, drawing, sheet };
}
function button(selector: string): HTMLButtonElement {
  const label =
    selector === "[data-chart-confirm]"
      ? "OK"
      : ["[data-chart-cancel]", "[data-chart-source-cancel]"].includes(selector)
        ? "Cancel"
        : undefined;
  const found = label
    ? [
        ...document.querySelectorAll<HTMLButtonElement>(
          ".chart-type-dialog .t-dialog__footer button",
        ),
      ].find((button) => button.textContent?.trim() === label)
    : document.querySelector<HTMLButtonElement>(selector);
  if (!found) throw new Error(selector);
  return found;
}
async function click(selector: string) {
  button(selector).click();
  await flushPromises();
}
async function openSource(_wrapper: VueWrapper) {
  await click("[data-chart-select-data]");
}
describe("desktop chart type dialog", () => {
  test("shows only thirteen real types and keeps selection separate from advanced editing", async () => {
    const { wrapper } = fixture();
    await flushPromises();
    const dialog = button("[data-chart-confirm]").closest('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("Insert Chart");
    expect(document.querySelectorAll("[data-chart-type]")).toHaveLength(13);
    expect(wrapper.findComponent(ChartSubtypeControls).props("presentation")).toBe("dialog");
    expect(wrapper.findComponent(OptionList).exists()).toBe(true);
    expect(
      wrapper
        .getComponent<ComponentPublicInstance<Parameters<typeof OptionList>[0]>>(OptionList)
        .props("variant"),
    ).toBe("navigation");
    expect(
      [...document.querySelectorAll(".chart-type-dialog .t-dialog__footer button")].map((button) =>
        button.textContent?.trim(),
      ),
    ).toEqual(["Cancel", "OK"]);
    expect(wrapper.getComponent(Dialog).props("cancelBtn")).toMatchObject({
      theme: "default",
      variant: "base",
    });
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({
      theme: "primary",
      variant: "base",
    });
    expect(wrapper.getComponent(Dialog).props("footer")).toBe(true);
    expect(wrapper.getComponent(Dialog).vm.$slots.footer).toBeUndefined();
    expect(wrapper.findComponent(RangeReferenceInput).exists()).toBe(true);
    expect(document.querySelector(".chart-style-gallery")).toBeNull();
    expect(document.querySelector(".chart-elements-controls")).toBeNull();
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });
  test("arrow navigation changes the local type and subtype without writing the drawing", async () => {
    const { wrapper, drawing } = fixture();
    await flushPromises();
    const before = JSON.stringify(drawing);
    button('[data-chart-type="column"]').dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    await flushPromises();
    expect(wrapper.findComponent(ChartTypeNavigation).props("value")).toBe("line");
    const selected = document.querySelector<HTMLButtonElement>(
      '[data-chart-variant="standardMarkers"]',
    )!;
    selected.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    await flushPromises();
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(JSON.stringify(drawing)).toBe(before);
    await click("[data-chart-cancel]");
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });
  test("source substep Cancel rolls back locally and picker suspension retains the draft", async () => {
    const { wrapper } = fixture();
    await flushPromises();
    await openSource(wrapper);
    const range = wrapper.findComponent(RangeReferenceInput);
    const initial = range.props("modelValue");
    range.vm.$emit("update:modelValue", "=Sheet1!$B$1:$B$3");
    await flushPromises();
    await wrapper.setProps({ suspended: true });
    await wrapper.setProps({ suspended: false });
    await flushPromises();
    expect(wrapper.findComponent(RangeReferenceInput).props("modelValue")).toBe(
      "=Sheet1!$B$1:$B$3",
    );
    await click("[data-chart-source-cancel]");
    await flushPromises();
    expect(wrapper.getComponent(RangeReferenceInput).props("modelValue")).toBe(initial);
    expect(wrapper.emitted("close")).toBeUndefined();
    await click("[data-chart-confirm]");
    expect(wrapper.emitted("confirm")?.[0]?.[1]).toBe(initial);
  });
  test("existing mode announces change type and keeps saved title and interpretation", async () => {
    const { wrapper, drawing } = fixture("change-type");
    await flushPromises();
    const dialog = button("[data-chart-confirm]").closest('[role="dialog"]');
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-label")).toBe("Change chart type");
    expect(document.querySelector(".t-dialog__header")?.textContent).toContain("Change chart type");
    await click('[data-chart-type="bar"]');
    await click("[data-chart-confirm]");
    const committed = wrapper.emitted("confirm")?.[0]?.[0] as SheetChartDrawing;
    expect(committed.chart.type).toBe("bar");
    expect(committed.chart.title).toBe("Saved title");
    expect(committed.chart.headerRow).toBe(drawing.chart.headerRow);
  });
  test("the primary range field uses the existing picker and survives a canceled data substep without a write", async () => {
    const { wrapper, drawing } = fixture();
    const before = JSON.stringify(drawing);
    const selectReference = vi.fn(async () => "=Sheet1!$A$1:$A$2");
    await wrapper.setProps({ selectReference });
    const range = wrapper.getComponent(RangeReferenceInput);
    await range.get("[data-select-formula-reference]").trigger("click");
    await flushPromises();
    expect(selectReference).toHaveBeenCalledOnce();
    expect(range.props("modelValue")).toBe("=Sheet1!$A$1:$A$2");
    await openSource(wrapper);
    wrapper.getComponent(RangeReferenceInput).vm.$emit("update:modelValue", "=Sheet1!$A$1:$A$1");
    await flushPromises();
    await click("[data-chart-source-cancel]");
    expect(wrapper.getComponent(RangeReferenceInput).props("modelValue")).toBe("=Sheet1!$A$1:$A$2");
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(JSON.stringify(drawing)).toBe(before);
    await click("[data-chart-confirm]");
    expect(wrapper.emitted("confirm")?.[0]?.[1]).toBe("=Sheet1!$A$1:$A$2");
  });
  test("Escape from the built-in source footer rolls back the data step without closing the chart draft", async () => {
    const { wrapper } = fixture();
    await openSource(wrapper);
    const original = wrapper.getComponent(RangeReferenceInput).props("modelValue");
    wrapper.getComponent(RangeReferenceInput).vm.$emit("update:modelValue", "=Sheet1!$A$1:$A$1");
    await flushPromises();
    const cancel = button("[data-chart-source-cancel]");
    cancel.focus();
    cancel.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    await flushPromises();
    expect(wrapper.getComponent(RangeReferenceInput).props("modelValue")).toBe(original);
    expect(wrapper.getComponent(Dialog).props("confirmBtn")).toMatchObject({ content: "OK" });
    expect(wrapper.emitted("close")).toBeUndefined();
    expect(wrapper.emitted("confirm")).toBeUndefined();
  });
  test("the source-step header close dismisses the whole chart draft without a confirm or drawing write", async () => {
    const { wrapper, drawing } = fixture();
    const original = JSON.stringify(drawing);
    await openSource(wrapper);
    wrapper.getComponent(RangeReferenceInput).vm.$emit("update:modelValue", "=Sheet1!$A$1:$A$1");
    await flushPromises();
    document.querySelector<HTMLElement>(".chart-type-dialog .t-dialog__close")!.click();
    await flushPromises();
    expect(wrapper.emitted("close")).toHaveLength(1);
    expect(wrapper.emitted("confirm")).toBeUndefined();
    expect(JSON.stringify(drawing)).toBe(original);
  });
});
