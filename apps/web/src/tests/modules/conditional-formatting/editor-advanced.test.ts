import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import { FormItem } from "tdesign-vue-next/es/form";
import { Input } from "tdesign-vue-next/es/input";
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import ConditionalFormatEditorDialog from "../../../modules/conditional-formatting/components/ConditionalFormatEditorDialog.vue";
import ConditionalFormatThresholdField from "../../../modules/conditional-formatting/components/ConditionalFormatThresholdField.vue";
import type { ConditionalFormatQuickRule } from "../../../modules/conditional-formatting/components/ConditionalFormattingMenu.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});
function editor(initialKind?: ConditionalFormatQuickRule, rule?: SheetConditionalFormatRule) {
  const wrapper = mount(ConditionalFormatEditorDialog, {
    attachTo: document.body,
    props: { visible: true, ranges: "A1:A5", initialKind, rule },
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
    const wrapper = editor("equal");
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
    fields[1]!.vm.$emit("update:value", 200);
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
    const fields = wrapper.findAllComponents(ConditionalFormatThresholdField);
    expect(fields).toHaveLength(2);
    fields[1]!.vm.$emit("update:value", 30);
    await nextTick();
    await confirm();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: {
        reverse: true,
        thresholds: [{ kind: "min" }, { kind: "num", value: 30 }, { kind: "num", value: 80 }],
      },
    });
  });

  test("keeps a standard data-bar preset free of unrequested XLSX extensions", async () => {
    const wrapper = editor("barBlue");
    await confirm();
    const saved = wrapper.emitted("save")?.[0]?.[0] as SheetConditionalFormatRule;
    expect(saved.condition).toMatchObject({ kind: "dataBar", color: "#638EC6" });
    expect(saved.condition).not.toMatchObject({ gradient: false });
    expect(saved.condition).not.toHaveProperty("negativeColor");
  });

  test("preserves imported average qualifiers while editing its style", async () => {
    const original = rule({ kind: "average", above: true, equalAverage: true, stdDev: 2 });
    original.style = { bold: true };
    const wrapper = editor(undefined, original);
    await confirm();
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({ condition: original.condition });
  });
});
