import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { InputNumber } from "tdesign-vue-next/es/input-number";
import { Select } from "tdesign-vue-next/es/select";
import { createAppI18n } from "../../../shared/i18n";
import ConditionalFormatManagerDialog from "../../../modules/conditional-formatting/components/ConditionalFormatManagerDialog.vue";
import ConditionalFormatQuickDialog from "../../../modules/conditional-formatting/components/ConditionalFormatQuickDialog.vue";
import ConditionalFormatStyleSelect from "../../../modules/conditional-formatting/components/ConditionalFormatStyleSelect.vue";
import ConditionalFormatStyleDialog from "../../../modules/conditional-formatting/components/ConditionalFormatStyleDialog.vue";
import {
  conditionalFormatPresetStyle,
  type ConditionalFormatQuickDialogKind,
} from "../../../modules/conditional-formatting/conditional-format-quick-rules";
const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function quick(kind: ConditionalFormatQuickDialogKind) {
  const wrapper = mount(ConditionalFormatQuickDialog, {
    attachTo: document.body,
    props: { kind, ranges: "A1:A8" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
async function confirm(wrapper: ReturnType<typeof quick>) {
  wrapper.findComponent(Dialog).vm.$emit("confirm");
  await nextTick();
}
describe("fixed conditional-format shortcut dialogs", () => {
  test("opens Greater than directly from the manager and saves once", async () => {
    const wrapper = mount(ConditionalFormatManagerDialog, {
      attachTo: document.body,
      props: { visible: true, rules: [], selectionRanges: "A1:A8", createKind: "greaterThan" },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);
    const dialog = wrapper.findComponent(ConditionalFormatQuickDialog);
    const quickDialog = document.querySelector('[role="dialog"][aria-label="Greater than"]');
    expect(quickDialog).not.toBeNull();
    expect(quickDialog?.textContent).not.toContain("Select a rule type");
    expect(quickDialog?.textContent).not.toContain("Applies to");
    dialog.findComponent(Input).vm.$emit("update:modelValue", "10");
    await nextTick();
    dialog.findComponent(Dialog).vm.$emit("confirm");
    await nextTick();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject([
      {
        condition: { kind: "cellValue", operator: "greaterThan", value: 10 },
        style: conditionalFormatPresetStyle("redFillText"),
      },
    ]);
  });
  test.each([
    ["top10Items", undefined, undefined],
    ["top10Percent", true, undefined],
    ["bottom10Items", undefined, true],
    ["bottom10Percent", true, true],
  ] as const)(
    "locks %s direction and percentage while editing N",
    async (kind, percent, bottom) => {
      const wrapper = quick(kind);
      expect(wrapper.findComponent(InputNumber).props("modelValue")).toBe(10);
      expect(wrapper.findAllComponents(Select)).toHaveLength(1);
      wrapper.findComponent(InputNumber).vm.$emit("update:modelValue", 3);
      await nextTick();
      await confirm(wrapper);
      expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
        condition: {
          kind: "rank",
          count: 3,
          ...(percent ? { percent } : {}),
          ...(bottom ? { bottom } : {}),
        },
      });
    },
  );
  test.each(["aboveAverage", "belowAverage"] as const)("%s only asks for format", async (kind) => {
    const wrapper = quick(kind);
    expect(wrapper.findAllComponents(InputNumber)).toHaveLength(0);
    expect(wrapper.findAllComponents(Select)).toHaveLength(1);
    await confirm(wrapper);
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: { kind: "average", above: kind === "aboveAverage" },
    });
  });
  test("retains the parent draft when custom format is cancelled", async () => {
    const wrapper = quick("greaterThan");
    wrapper.findComponent(Input).vm.$emit("update:modelValue", "12");
    await nextTick();
    const picker = wrapper.findComponent(ConditionalFormatStyleSelect);
    picker.findComponent(Select).vm.$emit("change", "custom");
    await nextTick();
    expect(wrapper.findComponent(Dialog).props("visible")).toBe(false);
    const custom = document.querySelector(".cell-format-dialog");
    expect(custom).not.toBeNull();
    expect(custom?.parentElement?.closest('[role="dialog"]')).toBeNull();
    picker.findComponent(ConditionalFormatStyleDialog).vm.$emit("cancel");
    await nextTick();
    expect(wrapper.findComponent(Dialog).props("visible")).toBe(true);
    await confirm(wrapper);
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: { value: 12 },
      style: conditionalFormatPresetStyle("redFillText"),
    });
  });
  test("accepts cell-reference formulas and explicitly quoted literal values", async () => {
    const formula = quick("greaterThan");
    formula.findComponent(Input).vm.$emit("update:modelValue", "=$D$1");
    await nextTick();
    await confirm(formula);
    expect(formula.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: { kind: "cellValue", value: { formula: "=$D$1" } },
    });
    formula.unmount();
    mounted.splice(mounted.indexOf(formula), 1);
    document.body.replaceChildren();

    const literal = quick("equal");
    literal.findComponent(Input).vm.$emit("update:modelValue", '"001"');
    await nextTick();
    await confirm(literal);
    expect(literal.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: { kind: "cellValue", value: "001" },
    });
  });
  test("saves a custom number format and four-edge red border", async () => {
    const wrapper = quick("aboveAverage");
    const picker = wrapper.findComponent(ConditionalFormatStyleSelect);
    picker.findComponent(Select).vm.$emit("change", "custom");
    await nextTick();
    const style = {
      ...conditionalFormatPresetStyle("redBorder"),
      numberFormat: { kind: "percent" as const, fractionDigits: 2 },
    };
    picker.findComponent(ConditionalFormatStyleDialog).vm.$emit("confirm", style);
    await nextTick();
    await confirm(wrapper);
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      style: {
        numberFormat: { kind: "percent", fractionDigits: 2 },
        borderTop: { style: "thin", color: "#9c0006" },
        borderRight: { style: "thin", color: "#9c0006" },
        borderBottom: { style: "thin", color: "#9c0006" },
        borderLeft: { style: "thin", color: "#9c0006" },
      },
    });
  });

  test("reports an invalid comparison formula without saving", async () => {
    const wrapper = quick("greaterThan");
    wrapper.findComponent(Input).vm.$emit("update:modelValue", "=SUM(");
    await nextTick();
    await confirm(wrapper);
    expect(wrapper.emitted("save")).toBeUndefined();
    expect(document.body.textContent).toContain("formula");
  });
});
