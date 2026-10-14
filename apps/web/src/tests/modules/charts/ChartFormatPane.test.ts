import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import ChartFormatPane from "../../../modules/charts/components/ChartFormatPane.vue";
import type {
  ChartFormatIntent,
  ChartFormatTarget,
} from "../../../modules/charts/chart-format-pane";
import type { SheetChartDrawing } from "@sheetcraft/core/sheet-drawings";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { createAppI18n } from "../../../shared/i18n";

vi.mock("../../../shared/cell-text/useFontCatalog", async () => {
  const { computed } = await import("vue");
  return {
    useFontCatalog: () => ({ fontOptions: computed(() => [{ value: "Arial", label: "Arial" }]) }),
  };
});
const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  document.body.replaceChildren();
});
function drawing(changes: Partial<SheetChart> = {}, id = "chart-one"): SheetChartDrawing {
  return {
    id,
    kind: "chart",
    name: "Sales chart",
    anchor: { row: 0, column: 0 },
    offsetX: 0,
    offsetY: 0,
    width: 480,
    height: 320,
    text: "",
    shape: "rectangle",
    fill: "transparent",
    stroke: "transparent",
    strokeWidth: 0,
    color: "#000000",
    fontSize: 12,
    bold: false,
    italic: false,
    rotation: 0,
    chart: {
      type: "column",
      title: "Sales",
      range: null,
      headerRow: true,
      headerColumn: true,
      seriesBy: "columns",
      legend: true,
      labels: false,
      stacked: false,
      showHidden: false,
      source: {
        kind: "series",
        categories: { kind: "generated" },
        series: [
          {
            id: "apples",
            colorIndex: 0,
            name: { kind: "literal", text: "Apples" },
            values: { kind: "literal", values: [10, 20] },
          },
          {
            id: "pears",
            colorIndex: 1,
            name: { kind: "literal", text: "Pears" },
            values: { kind: "literal", values: [30, 40] },
          },
        ],
      },
      ...changes,
    },
  };
}
const data: ChartData = {
  categories: ["East", "North"],
  records: [],
  series: [
    { id: "apples", name: "Apples", values: [10, 20] },
    { id: "pears", name: "Pears", values: [30, 40] },
  ],
};
function fixture(
  target: ChartFormatTarget = { kind: "valueAxis" },
  extra: Record<string, unknown> = {},
) {
  const apply = vi.fn((_intent: ChartFormatIntent) => true);
  const wrapper = mount(ChartFormatPane, {
    attachTo: document.body,
    props: { drawing: drawing(), data, target, disabled: false, apply, ...extra },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        ColorPaletteSelect: {
          props: ["modelValue", "disabled", "label"],
          emits: ["select"],
          template: '<button type="button" :disabled="disabled" :aria-label="label" />',
        },
        FontFormatField: {
          props: ["modelValue", "disabled", "label"],
          emits: ["change"],
          template: '<input :value="modelValue" :disabled="disabled" :aria-label="label" />',
        },
        FontSettingsAction: true,
      },
    },
  });
  wrappers.push(wrapper);
  return { wrapper, apply };
}
function input(wrapper: VueWrapper, field: string) {
  return wrapper.get(`[data-chart-format-field="${field}"]`).get<HTMLInputElement>("input");
}
function inputControl(wrapper: VueWrapper, field: string) {
  return wrapper.get(`[data-chart-format-field="${field}"]`).getComponent(Input);
}
function select(wrapper: VueWrapper, label: string) {
  return wrapper
    .findAllComponents(Select)
    .find((component) => component.attributes("aria-label") === label)!;
}
function checkbox(wrapper: VueWrapper, label: string) {
  return wrapper.findAllComponents(Checkbox).find((component) => component.text() === label)!;
}

describe("chart format right pane", () => {
  test("shows real applicable targets and named source series, without unsupported no-op controls", () => {
    const { wrapper } = fixture();
    const options = select(wrapper, "Chart element").props("options") as {
      value: string;
      label: string;
    }[];
    expect(options.map((entry) => entry.value)).toEqual([
      "chart",
      "title",
      "plot",
      "categoryAxis",
      "valueAxis",
      "series:apples",
      "series:pears",
    ]);
    expect(options.at(-1)?.label).toBe("Series: Pears");
    expect(wrapper.text()).not.toMatch(/Logarithmic|Crosses|Shadow|Glow|Display units/);
  });
  test("typing keeps the actual input node and complete draft until Enter; blur does not repeat the edit", async () => {
    const { wrapper, apply } = fixture();
    const field = input(wrapper, "min"),
      element = field.element;
    await field.setValue("-");
    await field.setValue("-2");
    await field.setValue("-20");
    expect(apply).not.toHaveBeenCalled();
    expect(input(wrapper, "min").element).toBe(element);
    await field.trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: "valueAxis", format: { min: -20 } });
    await wrapper.setProps({ drawing: drawing({ format: { valueAxis: { min: -20 } } }) });
    expect(input(wrapper, "min").element).toBe(element);
    expect(element.value).toBe("-20");
    await field.trigger("blur");
    expect(apply).toHaveBeenCalledTimes(1);
  });
  test("invalid bounds and incomplete numbers show errors without losing input", async () => {
    const { wrapper, apply } = fixture(
      { kind: "valueAxis" },
      { drawing: drawing({ format: { valueAxis: { max: 10 } } }) },
    );
    const field = input(wrapper, "min");
    await field.setValue("20");
    await field.trigger("keydown", { key: "Enter" });
    expect(apply).not.toHaveBeenCalled();
    expect(field.element.value).toBe("20");
    expect(wrapper.get('[role="alert"]').text()).toContain("Minimum must be less");
    await field.setValue("1e");
    await field.trigger("blur");
    expect(apply).not.toHaveBeenCalled();
    expect(field.element.value).toBe("1e");
    expect(wrapper.get('[role="alert"]').text()).toContain("complete finite number");
  });
  test("false apply and same-owner external changes preserve a draft, then an explicit retry succeeds", async () => {
    const apply = vi.fn((_intent: ChartFormatIntent) => false);
    const { wrapper } = fixture({ kind: "valueAxis" }, { apply });
    const field = input(wrapper, "max");
    await field.setValue("200");
    await field.trigger("keydown", { key: "Enter" });
    expect(wrapper.get('[role="alert"]').text()).toContain("draft is retained");
    await wrapper.setProps({ drawing: drawing({ format: { valueAxis: { min: 20, max: 180 } } }) });
    expect(field.element.value).toBe("200");
    apply.mockReturnValue(true);
    await field.trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenLastCalledWith({ kind: "valueAxis", format: { min: 20, max: 200 } });
  });
  test("callback replacement never retargets a dirty input to a new owner", async () => {
    const old = vi.fn((_intent: ChartFormatIntent) => false);
    const replacement = vi.fn((_intent: ChartFormatIntent) => true);
    const { wrapper } = fixture({ kind: "valueAxis" }, { apply: old });
    const field = input(wrapper, "min");
    await field.setValue("20");
    await wrapper.setProps({
      apply: replacement,
      drawing: drawing({ format: { valueAxis: { max: 180 } } }),
    });
    await field.trigger("blur");
    expect(replacement).not.toHaveBeenCalled();
    expect(old).not.toHaveBeenCalled();
    expect(field.element.value).toBe("20");
    await field.trigger("keydown", { key: "Escape" });
    await field.setValue("30");
    await field.trigger("keydown", { key: "Enter" });
    expect(replacement).toHaveBeenCalledExactlyOnceWith({
      kind: "valueAxis",
      format: { max: 180, min: 30 },
    });
  });
  test("previously rendered callbacks reject callback replacement and unmount before any external apply", async () => {
    const { wrapper, apply } = fixture();
    await input(wrapper, "min").setValue("20");
    const oldEnter = inputControl(wrapper, "min").vm.$.vnode.props!.onEnter as () => void;
    const replacement = vi.fn((_intent: ChartFormatIntent) => true);
    await wrapper.setProps({ apply: replacement });
    oldEnter();
    expect(apply).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(input(wrapper, "min").element.value).toBe("20");
    await input(wrapper, "min").setValue("30");
    oldEnter();
    expect(replacement).not.toHaveBeenCalled();
    const currentEnter = inputControl(wrapper, "min").vm.$.vnode.props!.onEnter as () => void;
    wrapper.unmount();
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    currentEnter();
    expect(replacement).not.toHaveBeenCalled();
  });
  test("changing drawing or target clears uncommitted numeric drafts", async () => {
    const { wrapper, apply } = fixture();
    await input(wrapper, "min").setValue("123");
    await wrapper.setProps({ drawing: drawing({}, "chart-two") });
    expect(input(wrapper, "min").element.value).toBe("");
    expect(apply).not.toHaveBeenCalled();
    await input(wrapper, "fontSize").setValue("42");
    await wrapper.setProps({ target: { kind: "title" } });
    expect(input(wrapper, "fontSize").element.value).toBe("");
  });
  test("composition blocks Enter, blur, target changes and other format controls", async () => {
    const { wrapper, apply } = fixture();
    const control = inputControl(wrapper, "min");
    control.vm.$emit("compositionstart", "", { e: new CompositionEvent("compositionstart") });
    await input(wrapper, "min").setValue("20");
    await input(wrapper, "min").trigger("keydown", { key: "Enter", isComposing: true });
    await input(wrapper, "min").trigger("blur");
    checkbox(wrapper, "Reverse order").vm.$emit("change", true);
    select(wrapper, "Chart element").vm.$emit("change", "title");
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:target")).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toContain("Finish composing");
    control.vm.$emit("compositionend", "20", { e: { target: input(wrapper, "min").element } });
    await input(wrapper, "min").trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: "valueAxis", format: { min: 20 } });
  });
  test("auto reset removes only one field without committing an intermediate draft", async () => {
    const { wrapper, apply } = fixture(
      { kind: "valueAxis" },
      { drawing: drawing({ format: { valueAxis: { min: 20, max: 180, reverse: true } } }) },
    );
    await input(wrapper, "min").setValue("25");
    const reset = wrapper.get('[data-chart-format-field="min"] button');
    await reset.trigger("pointerdown");
    await input(wrapper, "min").trigger("blur", { relatedTarget: reset.element });
    expect(apply).not.toHaveBeenCalled();
    await reset.trigger("click");
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: "valueAxis",
      format: { max: 180, reverse: true },
    });
    expect(input(wrapper, "min").element.value).toBe("");
  });
  test("source formats appear in preview and any manual category change unlinks source", async () => {
    const source = {
      ...data,
      series: [
        { ...data.series[0]!, numberFormat: { kind: "percent" as const, fractionDigits: 1 } },
        { ...data.series[1]!, numberFormat: { kind: "percent" as const, fractionDigits: 1 } },
      ],
    };
    const { wrapper, apply } = fixture({ kind: "valueAxis" }, { data: source });
    expect(checkbox(wrapper, "Linked to source").props("checked")).toBe(true);
    expect(wrapper.get("output").text()).toContain("%");
    select(wrapper, "Category").vm.$emit("change", "number");
    await flushPromises();
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: "valueAxis",
      format: { numberFormat: { kind: "number", fractionDigits: 2 }, linkedToSource: false },
    });
  });
  test("source linking matches actual axis groups and uses General for mixed formats", () => {
    const mixed = {
      ...data,
      series: [
        { ...data.series[0]!, numberFormat: { kind: "percent" as const, fractionDigits: 1 } },
        data.series[1]!,
      ],
    };
    const { wrapper } = fixture({ kind: "valueAxis" }, { data: mixed });
    expect(select(wrapper, "Category").props("value")).toBe("general");
    expect(wrapper.get("output").text()).not.toContain("%");
    const scatter = fixture(
      { kind: "valueAxis" },
      {
        drawing: drawing({ type: "scatter", source: undefined }),
        data: {
          ...data,
          series: [
            { ...data.series[0]!, numberFormat: { kind: "percent", fractionDigits: 1 } },
            { ...data.series[1]!, numberFormat: { kind: "number", fractionDigits: 2 } },
          ],
        },
      },
    );
    expect(select(scatter.wrapper, "Category").props("value")).toBe("number");
    expect(scatter.wrapper.get("output").text()).toBe("30.00");
  });
  test("General removes the override and link flag; source ON retains a dormant manual format", async () => {
    const { wrapper, apply } = fixture(
      { kind: "valueAxis" },
      {
        drawing: drawing({
          format: {
            valueAxis: {
              min: 20,
              linkedToSource: false,
              numberFormat: { kind: "number", fractionDigits: 1 },
            },
          },
        }),
      },
    );
    select(wrapper, "Category").vm.$emit("change", "general");
    await flushPromises();
    expect(apply).toHaveBeenLastCalledWith({ kind: "valueAxis", format: { min: 20 } });
    checkbox(wrapper, "Linked to source").vm.$emit("change", true);
    await flushPromises();
    expect(apply).toHaveBeenLastCalledWith({
      kind: "valueAxis",
      format: {
        min: 20,
        linkedToSource: true,
        numberFormat: { kind: "number", fractionDigits: 1 },
      },
    });
  });
  test("manual decimal/code changes are complete drafts and rejected code is retained", async () => {
    const { wrapper, apply } = fixture(
      { kind: "valueAxis" },
      {
        drawing: drawing({
          format: {
            valueAxis: {
              linkedToSource: false,
              numberFormat: { kind: "number", fractionDigits: 2 },
            },
          },
        }),
      },
    );
    await input(wrapper, "decimals").setValue("1");
    expect(apply).not.toHaveBeenCalled();
    await input(wrapper, "decimals").trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: "valueAxis",
      format: { linkedToSource: false, numberFormat: { kind: "number", fractionDigits: 1 } },
    });
    await wrapper.setProps({
      drawing: drawing({
        format: {
          valueAxis: { linkedToSource: false, numberFormat: { kind: "custom", code: "0.00" } },
        },
      }),
    });
    await input(wrapper, "formatCode").setValue('"unterminated');
    await input(wrapper, "formatCode").trigger("blur");
    expect(apply).toHaveBeenCalledTimes(1);
    expect(input(wrapper, "formatCode").element.value).toBe('"unterminated');
  });
  test("series editing addresses a stable ID and global gap never becomes a series field", async () => {
    const { wrapper, apply } = fixture({ kind: "series", seriesId: "pears" });
    select(wrapper, "Plot series on").vm.$emit("change", "secondary");
    await flushPromises();
    expect(apply).toHaveBeenLastCalledWith({
      kind: "series",
      seriesId: "pears",
      format: { axis: "secondary" },
    });
    await input(wrapper, "gapWidth").setValue("50");
    await input(wrapper, "gapWidth").trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenLastCalledWith({ kind: "chart", format: { gapWidth: 50 } });
    expect(wrapper.text()).toContain("whole chart");
    expect(wrapper.find('[data-chart-format-field="strokeWidth"]').exists()).toBe(false);
  });
  test("word-cloud title bold state matches its actual SVG default", () => {
    const { wrapper } = fixture(
      { kind: "title" },
      { drawing: drawing({ type: "wordCloud", source: undefined }) },
    );
    expect(checkbox(wrapper, "Bold").props("checked")).toBe(false);
  });
  test("radar offers real color/line/marker controls without secondary/smoothing", () => {
    const { wrapper } = fixture(
      { kind: "series", seriesId: "apples" },
      { drawing: drawing({ type: "radar" }) },
    );
    expect(wrapper.find('[data-chart-format-field="strokeWidth"]').exists()).toBe(true);
    expect(wrapper.text()).toContain("Show markers");
    expect(wrapper.text()).not.toContain("Smooth lines");
    expect(wrapper.text()).not.toContain("Plot series on");
  });
  test("title text and position use the existing elements intent and merge an in-pane layout change", async () => {
    const { wrapper, apply } = fixture({ kind: "title" });
    await input(wrapper, "title").setValue("新的标题");
    await wrapper.get("[data-chart-format-title-position]").trigger("pointerdown");
    await input(wrapper, "title").trigger("blur");
    expect(apply).not.toHaveBeenCalled();
    select(wrapper, "Title position").vm.$emit("change", "overlay");
    await flushPromises();
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: "elements",
      patch: { title: "新的标题", elements: { titlePosition: "overlay" } },
    });
  });
  test("disabled charts do not accept programmatic edits; unavailable source targets fall back", async () => {
    const { wrapper, apply } = fixture({ kind: "valueAxis" }, { disabled: true });
    expect(input(wrapper, "min").element.disabled).toBe(true);
    checkbox(wrapper, "Reverse order").vm.$emit("change", true);
    expect(apply).not.toHaveBeenCalled();
    await wrapper.setProps({ target: { kind: "series", seriesId: "foreign" } });
    expect(wrapper.emitted("update:target")?.at(-1)).toEqual([{ kind: "chart" }]);
  });
});

describe("percentage chart format pane", () => {
  test("uses percentage-point controls and a ratio preview without a no-op source-format toggle", () => {
    const { wrapper } = fixture(
      { kind: "valueAxis" },
      {
        drawing: drawing({
          stacked: true,
          presentation: { percentStacked: true },
          format: { valueAxis: { min: 20, majorUnit: 10, linkedToSource: true } },
        }),
      },
    );
    expect(wrapper.text()).toContain("percentage points");
    expect(wrapper.text()).not.toContain("Linked to source");
    expect(input(wrapper, "min").element.value).toBe("20");
    expect(input(wrapper, "majorUnit").element.value).toBe("10");
    expect(select(wrapper, "Category").props("value")).toBe("percent");
    expect(wrapper.get("output").text()).toBe("38%");
  });

  test("General is an explicit ratio format and does not fall back to auto percentages", async () => {
    const { wrapper, apply } = fixture(
      { kind: "valueAxis" },
      { drawing: drawing({ stacked: true, presentation: { percentStacked: true } }) },
    );
    select(wrapper, "Category").vm.$emit("change", "general");
    expect(apply).toHaveBeenLastCalledWith({
      kind: "valueAxis",
      format: { numberFormat: { kind: "custom", code: "General" }, linkedToSource: false },
    });
    await wrapper.setProps({
      drawing: drawing({
        stacked: true,
        presentation: { percentStacked: true },
        format: {
          valueAxis: {
            numberFormat: { kind: "custom", code: "General" },
            linkedToSource: false,
          },
        },
      }),
    });
    expect(select(wrapper, "Category").props("value")).toBe("general");
    expect(wrapper.get("output").text()).toBe("0.375");
  });

  test("a series marker control starts from the chart-wide line variant", () => {
    const { wrapper } = fixture(
      { kind: "series", seriesId: "apples" },
      { drawing: drawing({ type: "line", presentation: { lineMarkers: false } }) },
    );
    expect(checkbox(wrapper, "Show markers").props("checked")).toBe(false);
  });
});
