import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import { FormItem } from "tdesign-vue-next/es/form";
import { Input } from "tdesign-vue-next/es/input";
import { Select } from "tdesign-vue-next/es/select";
import { Radio, RadioGroup } from "tdesign-vue-next/es/radio";
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import ConditionalFormatEditorDialog from "../../../modules/conditional-formatting/components/ConditionalFormatEditorDialog.vue";
import ConditionalFormatIconRules from "../../../modules/conditional-formatting/components/ConditionalFormatIconRules.vue";
import DataBarAdvancedSettingsDialog from "../../../modules/conditional-formatting/components/DataBarAdvancedSettingsDialog.vue";
import ConditionalFormatThresholdField from "../../../modules/conditional-formatting/components/ConditionalFormatThresholdField.vue";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import ColorPaletteSelect from "../../../shared/color/ColorPaletteSelect.vue";
import type { ConditionalFormatQuickRule } from "../../../modules/conditional-formatting/components/ConditionalFormattingMenu.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function editor(
  initialKind?: ConditionalFormatQuickRule,
  rule?: SheetConditionalFormatRule,
  selectValueReference?: (current: string) => Promise<string | undefined>,
) {
  const wrapper = mount(ConditionalFormatEditorDialog, {
    attachTo: document.body,
    props: { visible: true, ranges: "A1:A5", initialKind, rule, selectValueReference },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
async function confirm() {
  const button = [...document.body.querySelectorAll("button")].find(
    (candidate) => candidate.textContent?.trim() === "OK",
  );
  if (!button) throw new Error("Missing confirmation");
  await new DOMWrapper(button).trigger("click");
}
function rule(condition: SheetConditionalFormatRule["condition"]): SheetConditionalFormatRule {
  return {
    id: "imported",
    ranges: [{ start: { row: 0, column: 0 }, end: { row: 4, column: 0 } }],
    anchor: { row: 0, column: 0 },
    condition,
    style: {},
  };
}

describe("advanced conditional format editor", () => {
  test.each(["lessThan", "between", "equal", "contains"] as const)(
    "keeps the selected %s quick operator",
    async (initial) => {
      const wrapper = editor(initial);
      for (const field of wrapper.findAllComponents(FormItem)) {
        if (field.props("label") === "Value")
          field.findComponent(Input).vm.$emit("update:modelValue", "12");
        if (field.props("label") === "Second value")
          field.findComponent(Input).vm.$emit("update:modelValue", "24");
      }
      await nextTick();
      await confirm();
      expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({ condition: { operator: initial } });
    },
  );

  test("accepts text in an equal-to rule", async () => {
    const imported = rule({ kind: "cellValue", operator: "equal", value: "Overdue" });
    imported.style = { fillColor: "#FDE2E1" };
    const wrapper = editor(undefined, imported);
    const field = wrapper
      .findAllComponents(FormItem)
      .find((item) => item.props("label") === "Value")!;
    field.findComponent(Input).vm.$emit("update:modelValue", "Overdue");
    await nextTick();
    await confirm();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: { kind: "cellValue", operator: "equal", value: "Overdue" },
    });
  });

  test("edits each color-scale numeric threshold through the reusable control", async () => {
    const wrapper = editor(
      undefined,
      rule({
        kind: "colorScale",
        stops: [
          { threshold: { kind: "num", value: 0 }, color: "#FFFFFF" },
          { threshold: { kind: "num", value: 100 }, color: "#FF0000" },
        ],
      }),
    );
    const fields = wrapper.findAllComponents(ConditionalFormatThresholdField);
    expect(fields).toHaveLength(2);
    fields[1]!.vm.$emit("update:value", "200");
    await nextTick();
    await confirm();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: {
        stops: [
          { threshold: { kind: "num", value: 0 } },
          { threshold: { kind: "num", value: 200 } },
        ],
      },
    });
  });

  test("rejects an empty numeric threshold and preserves an absolute formula threshold", async () => {
    const invalid = editor(
      undefined,
      rule({
        kind: "dataBar",
        minimum: { kind: "num", value: 0 },
        maximum: { kind: "num", value: 10 },
        color: "#638EC6",
      }),
    );
    invalid.findAllComponents(ConditionalFormatThresholdField)[1]!.vm.$emit("update:value", "");
    await nextTick();
    await confirm();
    expect(invalid.emitted("save")).toBeUndefined();
    invalid.unmount();
    mounted.splice(mounted.indexOf(invalid), 1);
    document.body.replaceChildren();

    const formula = editor(
      undefined,
      rule({
        kind: "dataBar",
        minimum: { kind: "formula", formula: "=$D$1" },
        maximum: { kind: "max" },
        color: "#638EC6",
      }),
    );
    await confirm();
    expect(formula.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: { minimum: { kind: "formula", formula: "=$D$1" } },
    });
  });

  test("edits one icon cutoff while preserving imported cutoffs and reversal", async () => {
    const wrapper = editor(
      undefined,
      rule({
        kind: "iconSet",
        iconSet: "threeArrows",
        thresholds: [{ kind: "min" }, { kind: "num", value: 20 }, { kind: "num", value: 80 }],
        reverse: true,
      }),
    );
    const iconRules = wrapper.getComponent(ConditionalFormatIconRules);
    const inputs = iconRules.findAllComponents(RangeReferenceInput);
    expect(inputs).toHaveLength(2);
    inputs[1]!.vm.$emit("update:modelValue", "30");
    await nextTick();
    await confirm();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: {
        reverse: true,
        thresholds: [{ kind: "min" }, { kind: "num", value: 30 }, { kind: "num", value: 80 }],
      },
    });
  });

  test("saves custom icons, strict cutoffs, and a typed formula cutoff", async () => {
    const wrapper = editor(
      undefined,
      rule({
        kind: "iconSet",
        iconSet: "threeTrafficLights",
        thresholds: [
          { kind: "percent", value: 0 },
          { kind: "percent", value: 33 },
          { kind: "percent", value: 67 },
        ],
        reverse: true,
      }),
    );
    const iconRules = wrapper.getComponent(ConditionalFormatIconRules);
    iconRules.vm.$emit("updateIcon", 2, { iconSet: "threeStars", iconIndex: 1 });
    iconRules.vm.$emit("updateIcon", 1, null);
    iconRules.vm.$emit("updateInclusive", 2, false);
    iconRules.vm.$emit("updateValue", 2, "=$D$1");
    await nextTick();
    await confirm();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: {
        thresholds: [
          { kind: "percent", value: 0 },
          { kind: "percent", value: 33 },
          { kind: "formula", formula: "=$D$1", inclusive: false },
        ],
        reverse: true,
        icons: [
          { iconSet: "threeStars", iconIndex: 1 },
          null,
          { iconSet: "threeTrafficLights", iconIndex: 2 },
        ],
      },
    });
  });

  test("uses the range picker for an icon cutoff and saves it as a formula", async () => {
    const wrapper = editor(
      undefined,
      rule({
        kind: "iconSet",
        iconSet: "threeTrafficLights",
        thresholds: [
          { kind: "percent", value: 0 },
          { kind: "percent", value: 33 },
          { kind: "percent", value: 67 },
        ],
      }),
      async () => "=$E$1",
    );
    const iconRules = wrapper.getComponent(ConditionalFormatIconRules);
    await iconRules
      .findAllComponents(RangeReferenceInput)[0]!
      .find("[data-select-formula-reference]")
      .trigger("click");
    await nextTick();
    await confirm();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: {
        thresholds: [
          { kind: "percent", value: 0 },
          { kind: "percent", value: 33 },
          { kind: "formula", formula: "=$E$1" },
        ],
      },
    });
  });

  test("restores an inclusive cutoff and clears custom glyphs on icon-style changes", async () => {
    const wrapper = editor(
      undefined,
      rule({
        kind: "iconSet",
        iconSet: "threeTrafficLights",
        thresholds: [
          { kind: "percent", value: 0 },
          { kind: "percent", value: 33 },
          { kind: "percent", value: 67, inclusive: false },
        ],
        icons: [
          { iconSet: "threeStars", iconIndex: 0 },
          { iconSet: "threeTrafficLights", iconIndex: 1 },
          { iconSet: "threeTrafficLights", iconIndex: 2 },
        ],
      }),
    );
    wrapper.getComponent(ConditionalFormatIconRules).vm.$emit("updateInclusive", 2, true);
    wrapper
      .findAllComponents(Select)
      .find((select) => select.attributes("aria-label") === "Icon set")!
      .vm.$emit("update:modelValue", "threeArrows");
    await nextTick();
    await confirm();
    const saved = wrapper.emitted("save")?.[0]?.[0] as SheetConditionalFormatRule;
    expect(saved.condition).toMatchObject({ kind: "iconSet", iconSet: "threeArrows" });
    expect(saved.condition).not.toHaveProperty("icons");
    expect(
      (saved.condition as Extract<SheetConditionalFormatRule["condition"], { kind: "iconSet" }>)
        .thresholds[2],
    ).not.toHaveProperty("inclusive");
  });

  test("explains the absolute-reference requirement for a formula threshold", async () => {
    const wrapper = editor("barBlue");
    const minimum = wrapper.findAllComponents(ConditionalFormatThresholdField)[0]!;
    minimum.vm.$emit("update:kind", "formula");
    minimum.vm.$emit("update:value", "=D1");
    await nextTick();
    await confirm();
    expect(wrapper.emitted("save")).toBeUndefined();
    expect(document.body.textContent).toContain("absolute cell references");
  });

  test("keeps a standard data-bar preset free of unrequested XLSX extensions", async () => {
    const wrapper = editor("barBlue");
    await confirm();
    const saved = wrapper.emitted("save")?.[0]?.[0] as SheetConditionalFormatRule;
    expect(saved.condition).toMatchObject({ kind: "dataBar", color: "#638EC6" });
    expect(saved.condition).toMatchObject({
      minimum: { kind: "autoMin" },
      maximum: { kind: "autoMax" },
      direction: "context",
      axisPosition: "automatic",
      axisColor: "#000000",
    });
    expect(saved.condition).not.toMatchObject({ gradient: false });
    expect(saved.condition).not.toHaveProperty("negativeColor");
  });

  test("saves the complete data-bar configuration and cancels nested edits", async () => {
    const wrapper = editor("dataBar");
    const barOnly = wrapper.find('input[type="checkbox"]');
    await barOnly.setValue(true);
    const border = wrapper
      .findAllComponents(FormItem)
      .find((item) => item.props("label") === "Border")!
      .findComponent(Select);
    border.vm.$emit("update:modelValue", true);
    const direction = wrapper
      .findAllComponents(Select)
      .find((item) => item.attributes("aria-label") === "Bar direction")!;
    direction.vm.$emit("update:modelValue", "rightToLeft");
    await nextTick();

    const openAdvanced = () =>
      new DOMWrapper(
        [...document.body.querySelectorAll("button")].find((button) =>
          button.textContent?.trim().startsWith("Negative values and axis"),
        )!,
      );
    await openAdvanced().trigger("click");
    let advanced = wrapper.getComponent(DataBarAdvancedSettingsDialog);
    await advanced.findAllComponents(Radio)[0]!.trigger("click");
    advanced.findAllComponents(ColorPaletteSelect)[0]!.vm.$emit("select", "#00AA00");
    advanced
      .findAllComponents(RadioGroup)
      .find((item) => item.attributes("aria-label") === "Axis position")!
      .vm.$emit("update:modelValue", "middle");
    await nextTick();
    const cancel = [...document.body.querySelectorAll("button")]
      .filter((button) => button.textContent?.trim() === "Cancel")
      .at(-1);
    await new DOMWrapper(cancel!).trigger("click");

    await openAdvanced().trigger("click");
    advanced = wrapper.getComponent(DataBarAdvancedSettingsDialog);
    expect(advanced.findAllComponents(ColorPaletteSelect)[0]!.props("modelValue")).toBe("#FF0000");
    expect(advanced.findAllComponents(ColorPaletteSelect)[0]!.props("disabled")).toBe(true);
    await advanced.findAllComponents(Radio)[0]!.trigger("click");
    await advanced.findAllComponents(Radio)[2]!.trigger("click");
    advanced.findAllComponents(ColorPaletteSelect)[0]!.vm.$emit("select", "#F8696B");
    advanced.findAllComponents(ColorPaletteSelect)[1]!.vm.$emit("select", "#AA2020");
    advanced.findAllComponents(ColorPaletteSelect)[2]!.vm.$emit("select", "#343434");
    advanced
      .findAllComponents(RadioGroup)
      .find((item) => item.attributes("aria-label") === "Axis position")!
      .vm.$emit("update:modelValue", "middle");
    await nextTick();
    const advancedConfirm = [...document.body.querySelectorAll("button")]
      .filter((button) => button.textContent?.trim() === "OK")
      .at(-1);
    await new DOMWrapper(advancedConfirm!).trigger("click");
    await confirm();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: {
        minimum: { kind: "autoMin" },
        maximum: { kind: "autoMax" },
        showValue: false,
        borderColor: "#638EC6",
        negativeColor: "#F8696B",
        negativeBorderColor: "#AA2020",
        direction: "rightToLeft",
        axisPosition: "middle",
        axisColor: "#343434",
      },
    });
  });

  test("preserves imported average qualifiers while editing its style", async () => {
    const original = rule({ kind: "average", above: true, equalAverage: true, stdDev: 2 });
    original.style = { bold: true };
    const wrapper = editor(undefined, original);
    await confirm();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({ condition: original.condition });
  });
});
