import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import { createSheetEvaluator, createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import ChartElementsToolbar from "../../../modules/charts/components/ChartElementsToolbar.vue";
import ChartElementsControls from "../../../modules/charts/components/ChartElementsControls.vue";
import ChartSubtypeControls from "../../../modules/charts/components/ChartSubtypeControls.vue";
import ChartStyleGallery from "../../../modules/charts/components/ChartStyleGallery.vue";
import ChartInsertTools from "../../../modules/charts/components/ChartInsertTools.vue";
import ChartEditorDialog from "../../../modules/charts/components/ChartEditorDialog.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import { createAppI18n } from "../../../shared/i18n";
import {
  applyChartDesignIntent,
  type ChartDesignIntent,
} from "../../../modules/charts/chart-design-intents";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
function chart(overrides: Partial<SheetChart> = {}): SheetChart {
  return {
    type: "line",
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
function trigger(wrapper: Pick<VueWrapper, "findAllComponents">, label: string) {
  return wrapper
    .findAllComponents(RibbonMenuButton)
    .find((button) => button.props("label") === label)!;
}
async function toolbar(applyDesign = vi.fn((_intent: ChartDesignIntent, _title?: string) => true)) {
  const apply = vi.fn(() => true);
  const wrapper = mount(ChartElementsToolbar, {
    attachTo: document.body,
    props: { chart: chart(), disabled: false, apply, applyDesign },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return { wrapper, apply, applyDesign };
}
function editor(overrides: Partial<SheetChart> = {}) {
  const workbook = createWorkbook({ id: "book", sheetId: "sheet" }),
    sheet = getActiveSheet(workbook);
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
    chart: chart(overrides),
  };
  const wrapper = mount(ChartEditorDialog, {
    attachTo: document.body,
    props: {
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
  mounted.push(wrapper);
  return { wrapper, drawing };
}

describe("concrete chart subtype and owned style controls", () => {
  test("three column choices and six line choices have stable ordered names", async () => {
    const wrapper = mount(ChartSubtypeControls, {
      props: { type: "column", disabled: false, apply: vi.fn(() => true) },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
      "Clustered Column",
      "Stacked Column",
      "100% Stacked Column",
    ]);
    await wrapper.setProps({ type: "line", variant: "standardMarkers" });
    expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
      "Line",
      "Stacked Line",
      "100% Stacked Line",
      "Line with Markers",
      "Stacked Line with Markers",
      "100% Stacked Line with Markers",
    ]);
    expect(wrapper.get('[data-chart-variant="standardMarkers"]').attributes("aria-checked")).toBe(
      "true",
    );
  });
  test("Chinese captions and eight self-owned styles do not claim WPS preset names", () => {
    const wrapper = mount(ChartStyleGallery, {
      props: { chart: chart(), disabled: false, apply: vi.fn(() => true) },
      global: { plugins: [createAppI18n("zh-CN")] },
    });
    mounted.push(wrapper);
    expect(wrapper.findAll("button").map((button) => button.text())).toEqual([
      "缤纷",
      "办公",
      "森林",
      "暖色",
      "冷色",
      "灰阶",
      "深色",
      "简约",
    ]);
    expect(wrapper.text()).toContain("Sheetcraft 自有样式");
    expect(wrapper.text()).not.toContain("WPS");
    expect(wrapper.findAll("svg")).toHaveLength(8);
  });
  test("style selection follows actual appearance and never persists an ID", async () => {
    const styled = applyChartDesignIntent(chart(), { kind: "style", style: "dark" });
    const wrapper = mount(ChartStyleGallery, {
      props: { chart: styled, disabled: false, apply: vi.fn(() => true) },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    expect(wrapper.get('[data-chart-style="dark"]').attributes("aria-checked")).toBe("true");
    styled.format!.title!.color = "#ffffff";
    await wrapper.setProps({ chart: { ...styled } });
    expect(wrapper.findAll('[aria-checked="true"]')).toHaveLength(0);
  });
  test("a rejected edit remains in the gallery and retries the exact choice", async () => {
    const apply = vi.fn(() => false),
      f = await toolbar(apply);
    await trigger(f.wrapper, "Chart styles").trigger("click");
    await flushPromises();
    const gallery = f.wrapper.getComponent(ChartStyleGallery);
    await gallery.get('[data-chart-style="forest"]').trigger("click");
    expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: "style", style: "forest" }, undefined);
    expect(f.wrapper.findComponent(ChartStyleGallery).exists()).toBe(true);
    expect(gallery.get('[role="alert"]').text()).toContain("not applied");
    apply.mockReturnValue(true);
    await gallery.get('[data-chart-style="forest"]').trigger("click");
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(f.wrapper.findComponent(ChartStyleGallery).exists()).toBe(false);
  });
  test("title plus subtype is one owner callback, including native composition blocking", async () => {
    const f = await toolbar();
    await trigger(f.wrapper, "Add chart element").trigger("click");
    await flushPromises();
    const input = f.wrapper.getComponent(ChartElementsControls).getComponent(Input).get("input");
    await input.trigger("compositionstart");
    await input.setValue("营");
    await trigger(f.wrapper, "Chart subtypes").trigger("click");
    await flushPromises();
    await f.wrapper
      .getComponent(ChartSubtypeControls)
      .get('[data-chart-variant="percentStackedMarkers"]')
      .trigger("click");
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.applyDesign).not.toHaveBeenCalled();
    expect(input.element.value).toBe("营");
    input.element.value = "营收统计";
    await input.trigger("compositionend");
    await f.wrapper
      .getComponent(ChartSubtypeControls)
      .get('[data-chart-variant="percentStackedMarkers"]')
      .trigger("click");
    await flushPromises();
    expect(f.applyDesign).toHaveBeenCalledExactlyOnceWith(
      { kind: "variant", variant: "percentStackedMarkers" },
      "营收统计",
    );
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.wrapper.findComponent(ChartSubtypeControls).exists()).toBe(false);
    expect(f.wrapper.findComponent(ChartElementsControls).exists()).toBe(false);
  });
  test("moving title focus into the owned style gallery never commits a separate blur command", async () => {
    const f = await toolbar();
    await trigger(f.wrapper, "Add chart element").trigger("click");
    await flushPromises();
    const input = f.wrapper.getComponent(ChartElementsControls).getComponent(Input).get("input");
    await input.setValue("Atomic title");
    await trigger(f.wrapper, "Chart styles").trigger("click");
    await flushPromises();
    const choice = f.wrapper.getComponent(ChartStyleGallery).get('[data-chart-style="warm"]');
    await input.trigger("blur", { relatedTarget: choice.element });
    expect(f.apply).not.toHaveBeenCalled();
    await choice.trigger("click");
    expect(f.applyDesign).toHaveBeenCalledExactlyOnceWith(
      { kind: "style", style: "warm" },
      "Atomic title",
    );
  });
  test.each(["Chart subtypes", "Chart styles"])(
    "%s keyboard open, navigation and Escape restore trigger focus without mutation",
    async (label) => {
      const f = await toolbar(),
        button = trigger(f.wrapper, label);
      await button.trigger("keydown", { key: "ArrowDown" });
      await flushPromises();
      const first = document.activeElement as HTMLElement;
      expect(first?.getAttribute("role")).toBe("menuitemradio");
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
      expect(document.activeElement).not.toBe(first);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flushPromises();
      expect(f.applyDesign).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(button.vm.rootElement);
      expect(
        f.wrapper
          .findComponent(label === "Chart styles" ? ChartStyleGallery : ChartSubtypeControls)
          .exists(),
      ).toBe(false);
    },
  );
  test("callbacks retained from a dismissed gallery cannot apply after reopen or owner replacement", async () => {
    const f = await toolbar(),
      button = trigger(f.wrapper, "Chart styles");
    await button.trigger("click");
    await flushPromises();
    const oldApply = f.wrapper.getComponent(ChartStyleGallery).props("apply");
    await button.trigger("click");
    await flushPromises();
    await button.trigger("click");
    await flushPromises();
    expect(oldApply({ kind: "style", style: "dark" })).toBe(false);
    const newApply = f.wrapper.getComponent(ChartStyleGallery).props("apply"),
      replacement = vi.fn(() => true);
    await f.wrapper.setProps({
      chart: chart(),
      apply: vi.fn(() => true),
      applyDesign: replacement,
    });
    expect(newApply({ kind: "style", style: "office" })).toBe(false);
    expect(f.applyDesign).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(f.wrapper.findComponent(ChartStyleGallery).exists()).toBe(false);
  });
  test("disabled owner blocks old gallery callbacks", async () => {
    const f = await toolbar();
    await trigger(f.wrapper, "Chart subtypes").trigger("click");
    await flushPromises();
    const callback = f.wrapper.getComponent(ChartSubtypeControls).props("apply");
    await f.wrapper.setProps({ disabled: true });
    expect(callback({ kind: "variant", variant: "stacked" })).toBe(false);
    expect(f.applyDesign).not.toHaveBeenCalled();
  });
});

describe("insert subtype intents", () => {
  test("line menu emits a typed variant; its main entry still emits the legacy string", async () => {
    const wrapper = mount(ChartInsertTools, {
      attachTo: document.body,
      props: { disabled: false },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    const line = wrapper
      .findAllComponents(RibbonSplitButton)
      .find((button) => button.props("label") === "Line")!;
    line.vm.$emit("activate");
    expect(wrapper.emitted("insert")).toEqual([["line"]]);
    line.vm.$emit("menuKeydown", new KeyboardEvent("keydown", { key: "ArrowDown" }));
    await flushPromises();
    expect(wrapper.getComponent(ChartSubtypeControls).findAll("button")).toHaveLength(6);
    const old = wrapper.getComponent(ChartSubtypeControls).props("apply");
    await wrapper
      .getComponent(ChartSubtypeControls)
      .get('[data-chart-variant="percentStacked"]')
      .trigger("click");
    await flushPromises();
    expect(wrapper.emitted("insert")).toEqual([
      ["line"],
      [{ type: "line", variant: "percentStacked" }],
    ]);
    line.vm.$emit("toggleMenu");
    await flushPromises();
    expect(old({ kind: "variant", variant: "standardMarkers" })).toBe(false);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(wrapper.findComponent(ChartSubtypeControls).exists()).toBe(false);
    expect(wrapper.emitted("insert")).toHaveLength(2);
  });
});

describe("chart editor design draft", () => {
  test("style and subtype mutate only the local draft until Confirm; Cancel has no mutation", async () => {
    const f = editor(),
      before = structuredClone(f.drawing);
    await f.wrapper
      .getComponent(ChartStyleGallery)
      .get('[data-chart-style="dark"]')
      .trigger("click");
    await f.wrapper
      .getComponent(ChartSubtypeControls)
      .get('[data-chart-variant="percentStackedMarkers"]')
      .trigger("click");
    await flushPromises();
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
    expect(f.drawing).toEqual(before);
    f.wrapper.getComponent(Dialog).vm.$emit("close");
    expect(f.wrapper.emitted("close")).toEqual([[]]);
    expect(f.drawing).toEqual(before);
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    const result = f.wrapper.emitted("confirm")![0]![0] as SheetChartDrawing;
    expect(result.chart.presentation).toMatchObject({
      background: "#202936",
      percentStacked: true,
      lineMarkers: true,
    });
    expect(f.drawing).toEqual(before);
  });
  test("changing type and unchecking stacked remove only inapplicable presentation flags", async () => {
    const f = editor();
    await f.wrapper
      .getComponent(ChartStyleGallery)
      .get('[data-chart-style="office"]')
      .trigger("click");
    await f.wrapper
      .getComponent(ChartSubtypeControls)
      .get('[data-chart-variant="percentStackedMarkers"]')
      .trigger("click");
    const type = f.wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes("aria-label") === "Chart type")!;
    type.vm.$emit("change", "column");
    await flushPromises();
    let current = f.wrapper.getComponent(ChartElementsControls).props("chart");
    expect(current.presentation).toMatchObject({ percentStacked: true, background: "#ffffff" });
    expect(current.presentation?.lineMarkers).toBeUndefined();
    const stacked = f.wrapper
      .getComponent(ChartElementsControls)
      .findAllComponents(Checkbox)
      .find((box) => box.text() === "Stacked")!;
    await stacked.get('input[type="checkbox"]').setValue(false);
    current = f.wrapper.getComponent(ChartElementsControls).props("chart");
    expect(current.stacked).toBe(false);
    expect(current.presentation?.percentStacked).toBeUndefined();
    expect(current.presentation?.palette).toHaveLength(6);
    type.vm.$emit("change", "pie");
    await flushPromises();
    expect(f.wrapper.findComponent(ChartSubtypeControls).exists()).toBe(false);
    expect(
      f.wrapper.getComponent(ChartElementsControls).props("chart").presentation?.palette,
    ).toHaveLength(6);
  });
  test("disabled editor and live-source applicability remain authoritative", async () => {
    const f = editor({
      range: null,
      source: {
        kind: "series",
        categories: { kind: "generated" },
        series: [
          {
            id: "series",
            colorIndex: 0,
            name: { kind: "literal", text: "S" },
            values: { kind: "literal", values: [1, 2] },
          },
        ],
      },
    });
    const type = f.wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes("aria-label") === "Chart type")!;
    type.vm.$emit("change", "pie");
    await flushPromises();
    expect(f.wrapper.getComponent(ChartElementsControls).props("chart").type).toBe("line");
    await f.wrapper.setProps({ disabled: true });
    const gallery = f.wrapper.getComponent(ChartStyleGallery);
    expect(gallery.props("apply")({ kind: "style", style: "dark" })).toBe(false);
    f.wrapper.getComponent(Dialog).vm.$emit("confirm");
    expect(f.wrapper.emitted("confirm")).toBeUndefined();
  });
});
