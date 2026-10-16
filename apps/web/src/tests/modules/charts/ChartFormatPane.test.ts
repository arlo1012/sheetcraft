import { mount, flushPromises, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import { Select } from "tdesign-vue-next/es/select";
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import ChartFormatPane from "../../../modules/charts/components/ChartFormatPane.vue";
import NumericField from "../../../shared/numeric-field/NumericField.vue";
import FormatSection from "../../../shared/format-pane/FormatSection.vue";
import type { CellNumberFormat } from "@sheetcraft/core/style";
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
      "legend",
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
    const oldEnter = wrapper
      .get('[data-chart-format-field="min"]')
      .getComponent(NumericField)
      .props("onCommit");
    const replacement = vi.fn((_intent: ChartFormatIntent) => true);
    await wrapper.setProps({ apply: replacement });
    oldEnter(
      { kind: "value", value: 20 },
      { ownerKey: "chart-one/valueAxis/min", sessionId: "old", source: "enter" },
    );
    expect(apply).not.toHaveBeenCalled();
    expect(replacement).not.toHaveBeenCalled();
    expect(input(wrapper, "min").element.value).toBe("20");
    await input(wrapper, "min").setValue("30");
    oldEnter(
      { kind: "value", value: 20 },
      { ownerKey: "chart-one/valueAxis/min", sessionId: "old", source: "enter" },
    );
    expect(replacement).not.toHaveBeenCalled();
    const currentEnter = wrapper
      .get('[data-chart-format-field="min"]')
      .getComponent(NumericField)
      .props("onCommit");
    wrapper.unmount();
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    currentEnter(
      { kind: "value", value: 30 },
      { ownerKey: "chart-one/valueAxis/min", sessionId: "closed", source: "enter" },
    );
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
    input(wrapper, "min").element.focus();
    await input(wrapper, "min").trigger("compositionstart");
    await input(wrapper, "min").setValue("20");
    await input(wrapper, "min").trigger("keydown", { key: "Enter", isComposing: true });
    await input(wrapper, "min").trigger("blur");
    checkbox(wrapper, "Reverse order").vm.$emit("change", true);
    select(wrapper, "Chart element").vm.$emit("change", "title");
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:target")).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toContain("Finish composing");
    expect(input(wrapper, "min").element.value).toBe("20");
    await input(wrapper, "min").trigger("compositionend");
    await input(wrapper, "min").trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: "valueAxis", format: { min: 20 } });
  });
  test("auto reset removes only one field without committing an intermediate draft", async () => {
    const { wrapper, apply } = fixture(
      { kind: "valueAxis" },
      { drawing: drawing({ format: { valueAxis: { min: 20, max: 180, reverse: true } } }) },
    );
    await input(wrapper, "min").setValue("25");
    const reset = wrapper.get('[data-chart-format-reset="min"]');
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
  test.each([
    {
      field: "decimals",
      format: { kind: "number", fractionDigits: 2 },
      invalid: "21",
      expected: "2",
    },
    {
      field: "formatCode",
      format: { kind: "custom", code: "0.00" },
      invalid: '"unterminated',
      expected: "0.00",
    },
  ] as { field: string; format: CellNumberFormat; invalid: string; expected: string }[])(
    "accepted number category clears only replaced $field drafts and errors",
    async ({ field, format, invalid, expected }) => {
      const snapshot = (numberFormat: CellNumberFormat) =>
        drawing({
          format: { valueAxis: { linkedToSource: false, numberFormat } },
        });
      const { wrapper, apply } = fixture({ kind: "valueAxis" }, { drawing: snapshot(format) });
      await input(wrapper, "min").setValue("-");
      await input(wrapper, field).setValue(invalid);
      await input(wrapper, field).trigger("blur");
      expect(wrapper.find('[role="alert"]').exists()).toBe(true);
      select(wrapper, "Category").vm.$emit("change", "date");
      await flushPromises();
      expect(apply).toHaveBeenCalledTimes(1);
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      await wrapper.setProps({ drawing: snapshot({ kind: "date", code: "yyyy-mm-dd" }) });
      expect(input(wrapper, "formatCode").element.value).toBe("yyyy-mm-dd");
      expect(input(wrapper, "min").element.value).toBe("-");
      select(wrapper, "Category").vm.$emit("change", format.kind);
      await flushPromises();
      await wrapper.setProps({ drawing: snapshot(format) });
      expect(input(wrapper, field).element.value).toBe(expected);
      await input(wrapper, field).trigger("blur");
      expect(apply).toHaveBeenCalledTimes(2);
    },
  );
  test("rejected number category retains the current editor draft for retry", async () => {
    const apply = vi.fn((_intent: ChartFormatIntent) => false);
    const { wrapper } = fixture(
      { kind: "valueAxis" },
      {
        apply,
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
    await input(wrapper, "decimals").setValue("3");
    select(wrapper, "Category").vm.$emit("change", "date");
    await flushPromises();
    expect(input(wrapper, "decimals").element.value).toBe("3");
    expect(select(wrapper, "Category").props("value")).toBe("number");
    apply.mockReturnValue(true);
    await input(wrapper, "decimals").trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenLastCalledWith({
      kind: "valueAxis",
      format: {
        linkedToSource: false,
        numberFormat: { kind: "number", fractionDigits: 3 },
      },
    });
  });
  test("shared sections start open and retain mounted drafts while collapsed", async () => {
    const { wrapper } = fixture();
    const sections = wrapper.findAllComponents(FormatSection);
    expect(sections).toHaveLength(5);
    expect(sections.every((section) => section.props("initiallyOpen"))).toBe(true);
    const field = input(wrapper, "min");
    await field.setValue("-");
    const section = sections[1]!;
    await section.get("button").trigger("click");
    expect(section.get("button").attributes("aria-expanded")).toBe("false");
    expect(input(wrapper, "min").element).toBe(field.element);
    await wrapper.setProps({ drawing: drawing({}, "chart-two") });
    expect(section.get("button").attributes("aria-expanded")).toBe("false");
    expect(input(wrapper, "min").element.value).toBe("");
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

describe("shared chart style numbers", () => {
  test("explicit px values use shared column controls with bounded fine steps", async () => {
    const { wrapper, apply } = fixture(
      { kind: "valueAxis" },
      {
        drawing: drawing({
          format: { valueAxis: { text: { fontSize: 12 }, line: { strokeWidth: 1.5 } } },
        }),
      },
    );
    const font = input(wrapper, "fontSize"),
      width = input(wrapper, "strokeWidth");
    expect(font.attributes()).toMatchObject({
      role: "spinbutton",
      "aria-valuemin": "1",
      "aria-valuemax": "256",
      "aria-valuetext": "12 px",
    });
    expect(width.attributes()).toMatchObject({
      role: "spinbutton",
      "aria-valuemin": "0",
      "aria-valuemax": "32",
      "aria-valuetext": "1.5 px",
    });
    expect(wrapper.findAllComponents(NumericField)).toHaveLength(6);
    await wrapper.get('button[aria-label="Font size (px) +"]').trigger("click");
    expect(apply).toHaveBeenLastCalledWith({
      kind: "valueAxis",
      format: { text: { fontSize: 13 }, line: { strokeWidth: 1.5 } },
    });
    await wrapper.get('button[aria-label="Line width (px) +"]').trigger("click");
    expect(apply).toHaveBeenLastCalledWith({
      kind: "valueAxis",
      format: { text: { fontSize: 12 }, line: { strokeWidth: 1.75 } },
    });
    expect(apply).toHaveBeenCalledTimes(2);
  });

  test("auto stays blank without a made-up step value and clearing removes only the field", async () => {
    const { wrapper, apply } = fixture({ kind: "title" });
    const field = input(wrapper, "fontSize");
    expect(field.element.value).toBe("");
    expect(field.attributes("placeholder")).toBe("Auto");
    expect(
      wrapper.get('button[aria-label="Font size (px) +"]').attributes("disabled"),
    ).toBeDefined();
    await wrapper.get('button[aria-label="Font size (px) +"]').trigger("click");
    expect(apply).not.toHaveBeenCalled();
    await wrapper.setProps({
      drawing: drawing({ format: { title: { fontSize: 12, italic: true } } }),
    });
    await field.setValue("");
    await field.trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: "title", format: { italic: true } });
    field.element.blur();
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(1);
  });

  test("invalid and rejected drafts survive source updates and explicit retry merges the current format", async () => {
    const reject = vi.fn((_intent: ChartFormatIntent) => false);
    const { wrapper } = fixture(
      { kind: "title" },
      { apply: reject, drawing: drawing({ format: { title: { fontSize: 12 } } }) },
    );
    const field = input(wrapper, "fontSize"),
      node = field.element;
    await field.setValue("257");
    await field.trigger("keydown", { key: "Enter" });
    expect(reject).not.toHaveBeenCalled();
    expect(field.element.value).toBe("257");
    await field.setValue("1e");
    await field.trigger("keydown", { key: "Enter" });
    expect(field.element.value).toBe("1e");
    await field.setValue("18.25");
    await field.trigger("keydown", { key: "Enter" });
    expect(reject).toHaveBeenCalledTimes(1);
    await wrapper.setProps({
      drawing: drawing({ format: { title: { fontSize: 14, bold: true } } }),
    });
    expect(field.element).toBe(node);
    expect(field.element.value).toBe("18.25");
    reject.mockReturnValue(true);
    await field.trigger("keydown", { key: "Enter" });
    expect(reject).toHaveBeenLastCalledWith({
      kind: "title",
      format: { fontSize: 18.25, bold: true },
    });
    field.element.blur();
    await flushPromises();
    expect(reject).toHaveBeenCalledTimes(2);
  });

  test("callback replacement rejects old drafts and drawing or target changes clear them", async () => {
    const { wrapper, apply } = fixture({ kind: "title" });
    const field = input(wrapper, "fontSize");
    await field.setValue("20");
    const oldCommit = wrapper.getComponent(NumericField).props("onCommit");
    const replacement = vi.fn((_intent: ChartFormatIntent) => true);
    await wrapper.setProps({ apply: replacement });
    await field.trigger("keydown", { key: "Enter" });
    expect(field.element.value).toBe("20");
    expect(
      oldCommit(
        { kind: "value", value: 21 },
        { ownerKey: "chart-one/title/fontSize", sessionId: "old", source: "enter" },
      ).accepted,
    ).toBe(false);
    expect(replacement).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    await field.trigger("keydown", { key: "Escape" });
    await field.setValue("22");
    await field.trigger("keydown", { key: "Enter" });
    expect(replacement).toHaveBeenCalledExactlyOnceWith({
      kind: "title",
      format: { fontSize: 22 },
    });
    await field.setValue("23");
    await wrapper.setProps({ drawing: drawing({}, "chart-two") });
    expect(input(wrapper, "fontSize").element.value).toBe("");
    await input(wrapper, "fontSize").setValue("24");
    await wrapper.setProps({ target: { kind: "valueAxis" } });
    expect(input(wrapper, "fontSize").element.value).toBe("");
    const currentCommit = wrapper.getComponent(NumericField).props("onCommit");
    wrapper.unmount();
    wrappers.splice(wrappers.indexOf(wrapper), 1);
    expect(
      currentCommit(
        { kind: "value", value: 25 },
        { ownerKey: "chart-two/valueAxis/fontSize", sessionId: "closed", source: "enter" },
      ).accepted,
    ).toBe(false);
    expect(replacement).toHaveBeenCalledTimes(1);
  });

  test("composition blocks other pane actions until shared numeric composition ends", async () => {
    const { wrapper, apply } = fixture({ kind: "valueAxis" });
    const field = input(wrapper, "fontSize");
    field.element.focus();
    await field.trigger("compositionstart");
    await field.setValue("18");
    await field.trigger("keydown", { key: "Enter", isComposing: true });
    checkbox(wrapper, "Reverse order").vm.$emit("change", true);
    select(wrapper, "Chart element").vm.$emit("change", "title");
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    expect(wrapper.emitted("update:target")).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toContain("Finish composing");
    await field.trigger("compositionend");
    await field.trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: "valueAxis",
      format: { text: { fontSize: 18 } },
    });
    expect(wrapper.text()).not.toContain("Finish composing");
  });

  test("field and element resets skip intermediate blur writes and rejected resets keep exact text", async () => {
    const { wrapper, apply } = fixture(
      { kind: "title" },
      { drawing: drawing({ format: { title: { fontSize: 12, bold: true } } }) },
    );
    const field = input(wrapper, "fontSize");
    field.element.focus();
    await field.setValue("18.");
    const reset = wrapper.get('[data-chart-format-reset="fontSize"]');
    await reset.trigger("pointerdown");
    (reset.element as HTMLButtonElement).focus();
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    await reset.trigger("click");
    expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: "title", format: { bold: true } });
    expect(field.element.value).toBe("");
    expect(reset.attributes("disabled")).toBeDefined();
    await wrapper.setProps({
      drawing: drawing({ format: { title: { fontSize: 14, bold: true } } }),
    });
    field.element.focus();
    await field.setValue("19.");
    apply.mockReturnValue(false);
    await reset.trigger("pointerdown");
    (reset.element as HTMLButtonElement).focus();
    await flushPromises();
    await reset.trigger("click");
    expect(field.element.value).toBe("19.");
    expect(apply).toHaveBeenCalledTimes(2);
    expect(wrapper.text()).toContain("draft is retained");
    apply.mockReturnValue(true);
    field.element.focus();
    const elementReset = wrapper.get('[data-chart-format-reset="element"]');
    await elementReset.trigger("pointerdown");
    (elementReset.element as HTMLButtonElement).focus();
    await flushPromises();
    expect(apply).toHaveBeenCalledTimes(2);
    await elementReset.trigger("click");
    expect(apply).toHaveBeenLastCalledWith({ kind: "title", format: undefined });
    expect(apply).toHaveBeenCalledTimes(3);
  });

  test("line width permits zero, rejects over-limit text, and disabled series cannot edit", async () => {
    const { wrapper, apply } = fixture(
      { kind: "series", seriesId: "apples" },
      {
        drawing: drawing({ type: "line", format: { series: [{ id: "apples", strokeWidth: 1 }] } }),
      },
    );
    const field = input(wrapper, "strokeWidth");
    await field.setValue("32.25");
    await field.trigger("keydown", { key: "Enter" });
    expect(field.element.value).toBe("32.25");
    expect(apply).not.toHaveBeenCalled();
    await field.setValue("0");
    await field.trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: "series",
      seriesId: "apples",
      format: { strokeWidth: 0 },
    });
    await wrapper.setProps({ disabled: true });
    expect(field.element.disabled).toBe(true);
    await wrapper.getComponent(NumericField).vm.edit("2");
    wrapper.getComponent(NumericField).vm.commit("external");
    expect(apply).toHaveBeenCalledTimes(1);
  });
});

describe("shared chart layout numbers", () => {
  test.each([
    {
      field: "labelAngle",
      target: { kind: "categoryAxis" },
      format: { categoryAxis: { labelAngle: 12.5 } },
      min: "-90",
      max: "90",
      value: "12.5 °",
      invalid: "91",
    },
    {
      field: "gapWidth",
      target: { kind: "chart" },
      format: { bar: { gapWidth: 25.5 } },
      min: "0",
      max: "500",
      value: "25.5 %",
      invalid: "501",
    },
    {
      field: "overlap",
      target: { kind: "chart" },
      format: { bar: { overlap: -12.5 } },
      min: "-100",
      max: "100",
      value: "-12.5 %",
      invalid: "-101",
    },
  ] as const)(
    "$field preserves units, fractional values, bounds and automatic reset",
    async (row) => {
      const { wrapper, apply } = fixture(row.target, { drawing: drawing({ format: row.format }) });
      const field = input(wrapper, row.field);
      expect(field.attributes()).toMatchObject({
        role: "spinbutton",
        "aria-valuemin": row.min,
        "aria-valuemax": row.max,
        "aria-valuetext": row.value,
      });
      await field.setValue(row.invalid);
      await field.trigger("keydown", { key: "Enter" });
      expect(apply).not.toHaveBeenCalled();
      await field.trigger("keydown", { key: "Escape" });
      expect(field.attributes("aria-valuetext")).toBe(row.value);
      await field.setValue("");
      await field.trigger("keydown", { key: "Enter" });
      expect(apply).toHaveBeenCalledExactlyOnceWith({ kind: row.target.kind, format: undefined });
      expect(field.element.value).toBe("");
    },
  );
  test("layout auto never steps from a made-up zero, and resets preserve rejected drafts", async () => {
    const { wrapper, apply } = fixture({ kind: "chart" });
    const field = input(wrapper, "gapWidth");
    expect(
      wrapper.get('button[aria-label="Gap width (%) +"]').attributes("disabled"),
    ).toBeDefined();
    await field.setValue("1e");
    await wrapper.get('[data-chart-format-reset="gapWidth"]').trigger("click");
    expect(field.element.value).toBe("");
    expect(apply).not.toHaveBeenCalled();
    await wrapper.setProps({ drawing: drawing({ format: { bar: { gapWidth: 100 } } }) });
    await field.setValue("200.");
    apply.mockReturnValue(false);
    await wrapper.get('[data-chart-format-reset="gapWidth"]').trigger("click");
    expect(field.element.value).toBe("200.");
    expect(wrapper.text()).toContain("draft is retained");
    const replacement = vi.fn(() => true);
    await wrapper.setProps({ apply: replacement });
    await field.trigger("keydown", { key: "Enter" });
    expect(replacement).not.toHaveBeenCalled();
    await field.trigger("keydown", { key: "Escape" });
    await field.setValue("250");
    await field.trigger("keydown", { key: "Enter" });
    expect(replacement).toHaveBeenCalledExactlyOnceWith({
      kind: "chart",
      format: { gapWidth: 250 },
    });
  });
  test("decimal places uses integer bounds, disallows auto, and composition guards other actions", async () => {
    const { wrapper, apply } = fixture(
      { kind: "valueAxis" },
      {
        drawing: drawing({
          format: { valueAxis: { linkedToSource: false, numberFormat: { kind: "number" } } },
        }),
      },
    );
    const field = input(wrapper, "decimals");
    expect(field.attributes()).toMatchObject({
      role: "spinbutton",
      "aria-valuemin": "0",
      "aria-valuemax": "20",
      inputmode: "numeric",
    });
    for (const invalid of ["", "1.5", "21", "-1"]) {
      await field.setValue(invalid);
      await field.trigger("keydown", { key: "Enter" });
    }
    expect(apply).not.toHaveBeenCalled();
    field.element.focus();
    await field.trigger("compositionstart");
    await field.setValue("3");
    select(wrapper, "Category").vm.$emit("change", "date");
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    await field.trigger("compositionend");
    await field.trigger("keydown", { key: "Enter" });
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: "valueAxis",
      format: { linkedToSource: false, numberFormat: { kind: "number", fractionDigits: 3 } },
    });
  });
});

describe("legend layout pane", () => {
  test("position, nonoverlap and sparse reset submit exact captured intents", async () => {
    const { wrapper, apply } = fixture(
      { kind: "legend" },
      { drawing: drawing({ elements: { legendPosition: "right", legendOverlay: true } }) },
    );
    expect(select(wrapper, "Chart element").props("value")).toBe("legend");
    expect(wrapper.getComponent(RadioGroup).props("modelValue")).toBe("right");
    expect(wrapper.findAllComponents(Radio).map((control) => control.props("value"))).toEqual([
      "top",
      "bottom",
      "left",
      "right",
      "topRight",
    ]);
    expect(checkbox(wrapper, "Show legend without overlapping the chart").props("checked")).toBe(
      false,
    );
    await wrapper
      .findAllComponents(Radio)
      .find((control) => control.props("value") === "topRight")!
      .trigger("click");
    await flushPromises();
    expect(apply).toHaveBeenLastCalledWith({
      kind: "elements",
      patch: { elements: { legendPosition: "topRight" } },
    });
    checkbox(wrapper, "Show legend without overlapping the chart").vm.$emit("change", true);
    await flushPromises();
    expect(apply).toHaveBeenLastCalledWith({
      kind: "elements",
      patch: { elements: { legendOverlay: false } },
    });
    await wrapper.get('[data-chart-format-reset="element"]').trigger("click");
    expect(apply).toHaveBeenLastCalledWith({ kind: "legend", reset: true });
    expect(apply).toHaveBeenCalledTimes(3);
    expect(wrapper.findAllComponents(NumericField)).toHaveLength(0);
  });
  test("rejected position retains the target and an external hide returns to chart", async () => {
    const apply = vi.fn(() => false);
    const { wrapper } = fixture({ kind: "legend" }, { apply });
    wrapper.getComponent(RadioGroup).vm.$emit("change", "left");
    await flushPromises();
    expect(apply).toHaveBeenCalledExactlyOnceWith({
      kind: "elements",
      patch: { elements: { legendPosition: "left" } },
    });
    expect(wrapper.emitted("update:target")).toBeUndefined();
    expect(wrapper.text()).toContain("draft is retained");
    await wrapper.setProps({ drawing: drawing({ legend: false }) });
    expect(wrapper.emitted("update:target")?.at(-1)).toEqual([{ kind: "chart" }]);
    expect(wrapper.findComponent(RadioGroup).exists()).toBe(false);
  });
  test("disabled and stale legend controls cannot send changes", async () => {
    const { wrapper, apply } = fixture({ kind: "legend" });
    const oldPosition = wrapper.getComponent(RadioGroup).vm.$props.onChange as (
      value: string,
    ) => void;
    await wrapper.setProps({ disabled: true });
    wrapper.getComponent(RadioGroup).vm.$emit("change", "left");
    checkbox(wrapper, "Show legend without overlapping the chart").vm.$emit("change", false);
    await flushPromises();
    expect(apply).not.toHaveBeenCalled();
    await wrapper.setProps({ disabled: false, target: { kind: "title" } });
    oldPosition("left");
    expect(apply).not.toHaveBeenCalled();
  });
});

describe("shared value-axis numbers", () => {
  test.each(["min", "max", "majorUnit", "minorUnit"] as const)(
    "%s retains auto and rejects failed resets without losing drafts",
    async (field) => {
      const apply = vi.fn(() => false);
      const { wrapper } = fixture(
        { kind: "valueAxis" },
        { apply, drawing: drawing({ format: { valueAxis: { [field]: 2.5 } } }) },
      );
      const control = input(wrapper, field);
      expect(control.attributes("role")).toBe("spinbutton");
      expect(control.element.value).toBe("2.5");
      await control.setValue("3e1");
      await wrapper.get(`[data-chart-format-reset="${field}"]`).trigger("click");
      expect(control.element.value).toBe("3e1");
      expect(apply).toHaveBeenCalledTimes(1);
      apply.mockReturnValue(true);
      await wrapper.get(`[data-chart-format-reset="${field}"]`).trigger("click");
      expect(control.element.value).toBe("");
      expect(control.attributes("placeholder")).toBe("Auto");
      expect(apply).toHaveBeenLastCalledWith({ kind: "valueAxis", format: undefined });
      expect(
        wrapper.get(`[aria-label="${control.attributes("aria-label")} +"]`).attributes("disabled"),
      ).toBeDefined();
    },
  );
  test.each([0, -1, 3, 0.01])(
    "minor unit %s must preserve positive, even, bounded divisions",
    async (value) => {
      const { wrapper, apply } = fixture(
        { kind: "valueAxis" },
        { drawing: drawing({ format: { valueAxis: { majorUnit: 10 } } }) },
      );
      const control = input(wrapper, "minorUnit");
      await control.setValue(String(value));
      await control.trigger("keydown", { key: "Enter" });
      expect(apply).not.toHaveBeenCalled();
      expect(control.element.value).toBe(String(value));
      await control.setValue("2.5");
      await control.trigger("keydown", { key: "Enter" });
      expect(apply).toHaveBeenCalledExactlyOnceWith({
        kind: "valueAxis",
        format: { majorUnit: 10, minorUnit: 2.5 },
      });
    },
  );
  test("secondary axis shares the bounds contract and command buttons opt into history explicitly", async () => {
    const { wrapper, apply } = fixture(
      { kind: "secondaryValueAxis" },
      {
        drawing: drawing({
          format: {
            series: [{ id: "pears", axis: "secondary" }],
            secondaryValueAxis: { min: -5, max: 5 },
          },
        }),
      },
    );
    await input(wrapper, "max").setValue("-5");
    await input(wrapper, "max").trigger("keydown", { key: "Enter" });
    expect(apply).not.toHaveBeenCalled();
    await wrapper.setProps({ target: { kind: "plot" } });
    const commands = wrapper.findAll('button[data-format-pane-history-control="command"]');
    expect(commands.map((button) => button.text())).toEqual(["No fill", "No line"]);
    await commands[0]!.trigger("click");
    expect(apply).toHaveBeenLastCalledWith({ kind: "plot", format: { fill: "transparent" } });
    expect(
      wrapper.get('button[aria-label="Close"]').attributes("data-format-pane-history-control"),
    ).toBeUndefined();
  });
});

test.each(["legend", "categoryAxis", "valueAxis", "title", "series"] as const)(
  "%s document toggles carry explicit history ownership on the real focus node",
  (kind) => {
    const { wrapper } = fixture(kind === "series" ? { kind, seriesId: "apples" } : { kind });
    for (const control of [
      ...wrapper.findAllComponents(Checkbox),
      ...wrapper.findAllComponents(Radio),
    ]) {
      expect(control.element.tagName).toBe("LABEL");
      expect(control.attributes("data-format-pane-history-control")).toBe("discrete");
      expect(["checkbox", "radio"]).toContain(control.get("input").attributes("type"));
    }
    expect(wrapper.get("aside").attributes("style")).toContain("--chart-format-label-width: 120px");
  },
);
test("paint controls receive separate transparent labels", () => {
  const { wrapper } = fixture({ kind: "plot" });
  expect(wrapper.get('button[aria-label="Fill"]').attributes("transparent-label")).toBe("No fill");
  expect(wrapper.get('button[aria-label="Line"]').attributes("transparent-label")).toBe("No line");
});
