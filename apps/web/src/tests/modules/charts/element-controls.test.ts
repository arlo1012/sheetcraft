import { DOMWrapper, flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createWorkbook, createSheetEvaluator, getActiveSheet } from "@sheetcraft/core/workbook";
import ChartElementsControls from "../../../modules/charts/components/ChartElementsControls.vue";
import ChartElementsToolbar from "../../../modules/charts/components/ChartElementsToolbar.vue";
import ChartEditorDialog from "../../../modules/charts/components/ChartEditorDialog.vue";
import type { ChartElementPatch } from "../../../modules/charts/chart-element-controls";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function chart(overrides: Partial<SheetChart> = {}): SheetChart {
  return {
    type: "column",
    range: { start: { row: 0, column: 0 }, end: { row: 2, column: 1 } },
    title: "Sales",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
    ...overrides,
  };
}
function controls(overrides: Partial<SheetChart> = {}, locale: "en-US" | "zh-CN" = "en-US") {
  const wrapper = mount(ChartElementsControls, {
    attachTo: document.body,
    props: { chart: chart(overrides), disabled: false },
    global: { plugins: [createAppI18n(locale)] },
  });
  mounted.push(wrapper);
  return wrapper;
}
function select(wrapper: Pick<VueWrapper, "findAllComponents">, label: string) {
  return wrapper
    .findAllComponents(Select)
    .find((control) => control.attributes("aria-label") === label)!;
}
function checkbox(wrapper: Pick<VueWrapper, "findAllComponents">, label: string) {
  return wrapper.findAllComponents(Checkbox).find((control) => control.text() === label)!;
}
async function toolbar(apply = vi.fn((_patch: ChartElementPatch) => true)) {
  const wrapper = mount(ChartElementsToolbar, {
    attachTo: document.body,
    props: { chart: chart(), disabled: false, apply },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  await wrapper.getComponent(RibbonMenuButton).trigger("click");
  await flushPromises();
  return { wrapper, apply };
}

describe("bounded chart element controls", () => {
  test("title typing stays local until complete Enter or blur, with no duplicate blur command", async () => {
    const wrapper = controls();
    const input = wrapper.getComponent(Input);
    await input.get("input").setValue("2026 revenue");
    expect(wrapper.emitted("patch")).toBeUndefined();
    await input.get("input").trigger("keydown", { key: "Enter", code: "Enter" });
    await input.get("input").trigger("blur");
    expect(wrapper.emitted("patch")).toEqual([[{ title: "2026 revenue" }]]);
    await input.get("input").trigger("focus");
    await input.get("input").setValue("2027 revenue");
    await input.get("input").trigger("blur");
    expect(wrapper.emitted("patch")?.[1]).toEqual([{ title: "2027 revenue" }]);
  });
  test("does not commit a title while an IME composition is active", () => {
    const wrapper = controls();
    wrapper.getComponent(Input).vm.$emit("enter", "营收", { e: { isComposing: true } });
    expect(wrapper.emitted("patch")).toBeUndefined();
  });
  test("real input composition never commits a partial blur, and commits full text only after composition ends", async () => {
    const wrapper = controls();
    const input = wrapper.getComponent(Input).get("input");
    await input.trigger("compositionstart");
    await input.setValue("营");
    await input.trigger("blur");
    expect(wrapper.emitted("patch")).toBeUndefined();
    input.element.value = "营收统计";
    await input.trigger("compositionend");
    expect(wrapper.emitted("patch")).toBeUndefined();
    await input.trigger("keydown", { key: "Enter", code: "Enter" });
    expect(wrapper.emitted("patch")).toEqual([[{ title: "营收统计" }]]);
  });
  test("title positions preserve sparse, dormant settings without changing title text", () => {
    const wrapper = controls({
      elements: { legendPosition: "right", labelPosition: "insideBase" },
    });
    const position = select(wrapper, "Title position");
    expect(
      position.props("options")?.map((option) => ("value" in option ? option.value : undefined)),
    ).toEqual(["none", "above", "overlay"]);
    position.vm.$emit("change", "overlay");
    expect(wrapper.emitted("patch")).toEqual([
      [
        {
          elements: {
            titlePosition: "overlay",
            legendPosition: "right",
            labelPosition: "insideBase",
          },
        },
      ],
    ]);
  });
  test("offers all five legend placements and a non-overlap checkbox with inverse storage", async () => {
    const wrapper = controls({ elements: { titlePosition: "overlay", legendOverlay: true } });
    const position = select(wrapper, "Legend position");
    expect(
      position.props("options")?.map((option) => ("value" in option ? option.value : undefined)),
    ).toEqual(["none", "right", "top", "left", "bottom", "topRight"]);
    position.vm.$emit("change", "topRight");
    expect(wrapper.emitted("patch")?.[0]).toEqual([
      {
        legend: true,
        elements: { titlePosition: "overlay", legendOverlay: true, legendPosition: "topRight" },
      },
    ]);
    const overlap = checkbox(wrapper, "Show legend without overlapping the chart");
    expect(overlap.props("checked")).toBe(false);
    await overlap.get('input[type="checkbox"]').setValue(true);
    expect(wrapper.emitted("patch")?.[1]).toEqual([
      {
        elements: { titlePosition: "overlay", legendOverlay: false },
      },
    ]);
    position.vm.$emit("change", "none");
    expect(wrapper.emitted("patch")?.[2]).toEqual([{ legend: false }]);
  });
  test.each(["column", "bar"] as const)(
    "%s labels offer exactly four positions plus off",
    (type) => {
      const wrapper = controls({ type, elements: { legendPosition: "left" } });
      const position = select(wrapper, "Data label position");
      expect(
        position.props("options")?.map((option) => ("value" in option ? option.value : undefined)),
      ).toEqual(["none", "center", "insideEnd", "insideBase", "outsideEnd"]);
      position.vm.$emit("change", "outsideEnd");
      expect(wrapper.emitted("patch")?.[0]).toEqual([
        {
          labels: true,
          elements: { legendPosition: "left", labelPosition: "outsideEnd" },
        },
      ]);
    },
  );
  test.each([
    "line",
    "area",
    "pie",
    "doughnut",
    "scatter",
    "radar",
    "treemap",
    "sankey",
    "river",
  ] as const)("%s uses only its supported toggles", (type) => {
    const wrapper = controls({ type });
    expect(select(wrapper, "Data label position")).toBeUndefined();
    expect(checkbox(wrapper, "Data labels")).toBeDefined();
    expect(!!checkbox(wrapper, "Stacked")).toBe(type === "line" || type === "area");
    expect(!!select(wrapper, "Legend position")).toBe(type !== "treemap" && type !== "sankey");
  });
  test("word clouds hide unsupported controls and explain them truthfully", () => {
    const wrapper = controls(
      { type: "wordCloud", legend: true, labels: true, stacked: true },
      "zh-CN",
    );
    expect(wrapper.findAllComponents(Select)).toHaveLength(1);
    expect(wrapper.findAllComponents(Checkbox)).toHaveLength(0);
    expect(wrapper.text()).toContain("词云图不使用图例、数据标签或堆积。");
  });
  test("disabled controls reject even delayed emitted input events", async () => {
    const wrapper = controls();
    await wrapper.setProps({ disabled: true });
    wrapper.getComponent(Input).vm.$emit("blur", "Rejected");
    for (const control of wrapper.findAllComponents(Select)) control.vm.$emit("change", "none");
    for (const control of wrapper.findAllComponents(Checkbox)) control.vm.$emit("change", true);
    expect(wrapper.emitted("patch")).toBeUndefined();
  });
  test("Chinese position labels stay concise and localized", () => {
    const wrapper = controls({}, "zh-CN");
    expect(
      select(wrapper, "标题位置")
        .props("options")
        ?.map((option) => ("label" in option ? option.label : undefined)),
    ).toEqual(["无", "图表上方", "居中覆盖"]);
    expect(
      select(wrapper, "数据标签位置")
        .props("options")
        ?.map((option) => ("label" in option ? option.label : undefined)),
    ).toEqual(["无", "居中", "内侧末端", "内侧基部", "外侧末端"]);
    expect(wrapper.text()).toContain("显示图例且不与图表重叠");
  });
});

describe("chart elements context toolbar", () => {
  test("applies exactly one patch through its callback and closes after success", async () => {
    const f = await toolbar();
    expect(f.wrapper.findComponent(MenuSurface).exists()).toBe(true);
    select(f.wrapper, "Legend position").vm.$emit("change", "right");
    await flushPromises();
    expect(f.apply).toHaveBeenCalledExactlyOnceWith({
      legend: true,
      elements: { legendPosition: "right" },
    });
    expect(f.wrapper.findComponent(MenuSurface).exists()).toBe(false);
  });
  test.each(["false", "throw"] as const)(
    "keeps rejected %s edits visible without claiming success",
    async (failure) => {
      const apply = vi.fn((_patch: ChartElementPatch): boolean => {
        if (failure === "throw") throw new Error("Rejected");
        return false;
      });
      const f = await toolbar(apply);
      select(f.wrapper, "Title position").vm.$emit("change", "none");
      await flushPromises();
      expect(f.wrapper.getComponent(MenuSurface).get('[role="alert"]').text()).toContain(
        "could not be updated",
      );
      expect(f.wrapper.findComponent(MenuSurface).exists()).toBe(true);
    },
  );
  test("an explicit Enter can retry the same rejected title while following blur stays deduplicated", async () => {
    const apply = vi.fn((_patch: ChartElementPatch) => false);
    const f = await toolbar(apply);
    const input = f.wrapper.getComponent(ChartElementsControls).getComponent(Input).get("input");
    await input.setValue("Retry this title");
    await input.trigger("keydown", { key: "Enter", code: "Enter" });
    await input.trigger("blur");
    expect(apply).toHaveBeenCalledTimes(1);
    await input.trigger("keydown", { key: "Enter", code: "Enter" });
    await input.trigger("blur");
    expect(apply).toHaveBeenCalledTimes(2);
  });
  test("invalidates old menu handlers when the target callback changes, including after reopen", async () => {
    const f = await toolbar();
    const oldControls = f.wrapper.getComponent(ChartElementsControls);
    const oldHandler = oldControls.vm.$.vnode.props?.onPatch as (patch: ChartElementPatch) => void;
    const newApply = vi.fn((_patch: ChartElementPatch) => true);
    await f.wrapper.setProps({ chart: chart({ title: "Other chart" }), apply: newApply });
    expect(f.wrapper.findComponent(MenuSurface).exists()).toBe(false);
    await f.wrapper.getComponent(RibbonMenuButton).trigger("click");
    await flushPromises();
    oldHandler({ title: "Late old title" });
    expect(f.apply).not.toHaveBeenCalled();
    expect(newApply).not.toHaveBeenCalled();
    select(f.wrapper, "Title position").vm.$emit("change", "overlay");
    expect(newApply).toHaveBeenCalledExactlyOnceWith({ elements: { titlePosition: "overlay" } });
  });
  test("native same-owner focus buffers the title and merges it into one real legend popup edit", async () => {
    const f = await toolbar();
    const controls = f.wrapper.getComponent(ChartElementsControls);
    const title = controls.getComponent(Input).get("input");
    title.element.focus();
    await title.setValue("Complete title and legend");
    const legend = select(controls, "Legend position");
    legend.get<HTMLInputElement>("input").element.focus();
    await flushPromises();
    expect(f.apply).not.toHaveBeenCalled();
    await legend.get(".t-input__inner").trigger("keydown", { key: "ArrowDown", code: "ArrowDown" });
    const options = () =>
      controls.vm
        .popupElements()
        .flatMap((popup) => [...popup.querySelectorAll<HTMLElement>(".t-select-option")]);
    await expect
      .poll(() => options().map((option) => option.textContent?.trim()))
      .toContain("Right");
    const option = options().find((item) => item.textContent?.trim() === "Right")!;
    await new DOMWrapper(option).trigger("pointerdown");
    await new DOMWrapper(option).trigger("click");
    await flushPromises();
    expect(f.apply).toHaveBeenCalledExactlyOnceWith({
      title: "Complete title and legend",
      legend: true,
      elements: { legendPosition: "right" },
    });
  });
  test("outside pointer capture commits before an earlier document bubble listener and later blur stays harmless", async () => {
    const order: string[] = [];
    const bubble = () => order.push("bubble");
    document.addEventListener("pointerdown", bubble);
    try {
      const apply = vi.fn((_patch: ChartElementPatch) => {
        order.push("apply");
        return true;
      });
      const f = await toolbar(apply);
      const title = f.wrapper.getComponent(ChartElementsControls).getComponent(Input).get("input");
      title.element.focus();
      await title.setValue("Save before leaving");
      const outside = document.createElement("button");
      document.body.append(outside);
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      outside.focus();
      await title.trigger("blur");
      expect(order).toEqual(["apply", "bubble"]);
      expect(apply).toHaveBeenCalledExactlyOnceWith({ title: "Save before leaving" });
      await flushPromises();
      expect(f.wrapper.findComponent(MenuSurface).exists()).toBe(false);
      expect(document.activeElement).toBe(outside);
    } finally {
      document.removeEventListener("pointerdown", bubble);
    }
  });
  test.each(["pointer", "focus"] as const)(
    "rejected outside %s preserves the menu, title and owner without another implicit retry",
    async (event) => {
      const apply = vi.fn((_patch: ChartElementPatch) => false);
      const f = await toolbar(apply);
      const title = f.wrapper.getComponent(ChartElementsControls).getComponent(Input).get("input");
      title.element.focus();
      await title.setValue("Keep my rejected title");
      const outside = document.createElement("button");
      document.body.append(outside);
      const observed = vi.fn();
      const observeOutside = (incoming: Event) => {
        if (incoming.target === outside) observed();
      };
      document.addEventListener(event === "pointer" ? "pointerdown" : "focusin", observeOutside);
      try {
        if (event === "pointer") {
          const pointer = new PointerEvent("pointerdown", { bubbles: true, cancelable: true });
          expect(outside.dispatchEvent(pointer)).toBe(false);
        } else outside.focus();
        await flushPromises();
        expect(observed).not.toHaveBeenCalled();
        expect(f.wrapper.findComponent(MenuSurface).exists()).toBe(true);
        expect(title.element.value).toBe("Keep my rejected title");
        expect(apply).toHaveBeenCalledTimes(1);
        await title.trigger("keydown", { key: "Enter", code: "Enter" });
        expect(apply).toHaveBeenCalledTimes(2);
      } finally {
        document.removeEventListener(
          event === "pointer" ? "pointerdown" : "focusin",
          observeOutside,
        );
      }
    },
  );
  test("active native composition blocks outside departure and another element without discarding the title", async () => {
    const f = await toolbar();
    const controls = f.wrapper.getComponent(ChartElementsControls);
    const title = controls.getComponent(Input).get("input");
    title.element.focus();
    await title.trigger("compositionstart");
    await title.setValue("营");
    const outside = document.createElement("button");
    document.body.append(outside);
    expect(
      outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })),
    ).toBe(false);
    await checkbox(controls, "Stacked").get('input[type="checkbox"]').setValue(true);
    await flushPromises();
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.wrapper.findComponent(MenuSurface).exists()).toBe(true);
    expect(controls.get('[role="alert"]').text()).toBe("Finish composing the title first.");
    title.element.value = "营收统计";
    await title.trigger("compositionend");
    select(controls, "Legend position").vm.$emit("change", "right");
    expect(f.apply).toHaveBeenCalledExactlyOnceWith({
      title: "营收统计",
      legend: true,
      elements: { legendPosition: "right" },
    });
  });
  test("provided action callbacks run synchronously when there is no pending title", async () => {
    const f = await toolbar();
    const source = vi.fn();
    await f.wrapper.setProps({ onSource: source });
    f.wrapper.getComponent(RibbonButton).vm.$emit("activate");
    expect(source).toHaveBeenCalledTimes(1);
  });
  test("pending title plus action uses the captured host lease once without independently dispatching source", async () => {
    const f = await toolbar();
    const source = vi.fn();
    const applyAndRun = vi.fn(
      (_patch: ChartElementPatch, _action: "edit" | "source" | "switchDirection") => true,
    );
    await f.wrapper.setProps({ onSource: source, applyAndRun });
    await f.wrapper
      .getComponent(ChartElementsControls)
      .getComponent(Input)
      .get("input")
      .setValue("Title before source");
    f.wrapper.getComponent(RibbonButton).vm.$emit("activate");
    expect(applyAndRun).toHaveBeenCalledExactlyOnceWith({ title: "Title before source" }, "source");
    expect(source).not.toHaveBeenCalled();
    expect(f.apply).not.toHaveBeenCalled();
  });
  test.each(["sheet change", "same-ID replacement"] as const)(
    "old action handlers cannot retarget after %s",
    async (_change) => {
      const f = await toolbar();
      const oldSource = vi.fn();
      const oldHost = vi.fn(
        (_patch: ChartElementPatch, _action: "edit" | "source" | "switchDirection") => true,
      );
      await f.wrapper.setProps({ onSource: oldSource, applyAndRun: oldHost });
      const oldHandler = f.wrapper.getComponent(RibbonButton).vm.$.vnode.props
        ?.onActivate as () => void;
      await f.wrapper
        .getComponent(ChartElementsControls)
        .getComponent(Input)
        .get("input")
        .setValue("Old owner title");
      const newSource = vi.fn();
      const newHost = vi.fn(
        (_patch: ChartElementPatch, _action: "edit" | "source" | "switchDirection") => true,
      );
      await f.wrapper.setProps({
        chart: chart(),
        apply: vi.fn((_patch: ChartElementPatch) => true),
        onSource: newSource,
        applyAndRun: newHost,
      });
      oldHandler();
      await flushPromises();
      expect(oldSource).not.toHaveBeenCalled();
      expect(oldHost).not.toHaveBeenCalled();
      expect(newSource).not.toHaveBeenCalled();
      expect(newHost).not.toHaveBeenCalled();
    },
  );
  test("does not expose missing callback actions and blocks all provided actions when disabled", async () => {
    const f = await toolbar();
    expect(f.wrapper.findAllComponents(RibbonButton)).toHaveLength(0);
    const action = vi.fn();
    await f.wrapper.setProps({
      disabled: true,
      onEdit: action,
      onSource: action,
      onSwitchDirection: action,
    });
    for (const control of f.wrapper.findAllComponents(RibbonButton)) control.vm.$emit("activate");
    expect(action).not.toHaveBeenCalled();
    expect(f.wrapper.findComponent(MenuSurface).exists()).toBe(false);
  });
});

function editor() {
  const workbook = createWorkbook({ id: "chart-elements-book", sheetId: "sheet" });
  const sheet = getActiveSheet(workbook);
  const drawing: SheetChartDrawing = {
    id: "chart",
    kind: "chart",
    name: "Sales",
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
    chart: chart({
      elements: { titlePosition: "overlay", legendPosition: "right", labelPosition: "insideBase" },
    }),
  };
  const wrapper = mount(ChartEditorDialog, {
    attachTo: document.body,
    props: {
      drawing,
      mode: "change-type",
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
  mounted.push(wrapper);
  return { wrapper, drawing };
}
describe("chart type draft and context element ownership", () => {
  test("type confirmation preserves independently cloned dormant element settings", async () => {
    const f = editor();
    expect(f.wrapper.findComponent(ChartElementsControls).exists()).toBe(false);
    document.querySelector<HTMLButtonElement>("[data-chart-confirm]")!.click();
    await flushPromises();
    const result = f.wrapper.emitted("confirm")![0]![0] as SheetChartDrawing;
    expect(result.chart.elements).toEqual(f.drawing.chart.elements);
    expect(result.chart.elements).not.toBe(f.drawing.chart.elements);
    expect(result.chart.title).toBe("Sales");
    expect(f.drawing.chart.labels).toBe(false);
  });
  test("context element callback atomically includes the complete pending title", async () => {
    const f = await toolbar();
    const controls = f.wrapper.getComponent(ChartElementsControls);
    await controls.getComponent(Input).get("input").setValue("2026 Sales");
    select(controls, "Legend position").vm.$emit("change", "topRight");
    await flushPromises();
    expect(f.apply).toHaveBeenCalledExactlyOnceWith({
      title: "2026 Sales",
      legend: true,
      elements: { legendPosition: "topRight" },
    });
  });
  test("context element commit waits for a real title composition to end", async () => {
    const f = await toolbar();
    const controls = f.wrapper.getComponent(ChartElementsControls);
    const input = controls.getComponent(Input).get("input");
    await input.trigger("compositionstart");
    await input.setValue("营");
    select(controls, "Legend position").vm.$emit("change", "topRight");
    expect(f.apply).not.toHaveBeenCalled();
    input.element.value = "营收统计";
    await input.trigger("compositionend");
    select(controls, "Legend position").vm.$emit("change", "topRight");
    expect(f.apply).toHaveBeenCalledExactlyOnceWith({
      title: "营收统计",
      legend: true,
      elements: { legendPosition: "topRight" },
    });
  });
  test("disabled type confirmation cannot emit or alter saved elements", async () => {
    const f = editor();
    await f.wrapper.setProps({ disabled: true });
    document.querySelector<HTMLButtonElement>("[data-chart-confirm]")!.click();
    await flushPromises();
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    expect(f.drawing.chart.title).toBe("Sales");
  });
});
