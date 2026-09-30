import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { nextTick } from "vue";
import ConditionalFormatEditorDialog from "../../../modules/conditional-formatting/components/ConditionalFormatEditorDialog.vue";
import ConditionalFormatManagerDialog from "../../../modules/conditional-formatting/components/ConditionalFormatManagerDialog.vue";
import ConditionalFormatContainingCriteria from "../../../modules/conditional-formatting/components/ConditionalFormatContainingCriteria.vue";
import ConditionalFormatStyleDialog from "../../../modules/conditional-formatting/components/ConditionalFormatStyleDialog.vue";
import { createAppI18n } from "../../../shared/i18n";
import RangeReferenceInput from "../../../shared/range-reference/RangeReferenceInput.vue";
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountEditor(rule?: SheetConditionalFormatRule, initialKind?: "between" | "formula") {
  const wrapper = mount(ConditionalFormatEditorDialog, {
    attachTo: document.body,
    props: { visible: true, rule, ranges: "A1:A3", initialKind },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

function confirmButton(): DOMWrapper<HTMLButtonElement> {
  const button = [...document.body.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.trim().startsWith("OK"),
  );
  if (!(button instanceof HTMLButtonElement))
    throw new Error("Missing dialog confirmation button.");
  return new DOMWrapper(button);
}

const textRule: SheetConditionalFormatRule = {
  id: "text-rule",
  ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
  anchor: { row: 0, column: 0 },
  condition: { kind: "text", operator: "contains", text: "late" },
  style: { textColor: "#0000FF", bold: false, italic: false },
};

const shiftedFormulaRule: SheetConditionalFormatRule = {
  id: "formula-rule",
  ranges: [{ start: { row: 4, column: 0 }, end: { row: 7, column: 0 } }],
  anchor: { row: 0, column: 0 },
  condition: { kind: "formula", formula: "=B1>0" },
  style: { fillColor: "#FDE2E1" },
};

const stringValueRule: SheetConditionalFormatRule = {
  id: "string-value-rule",
  ranges: [{ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }],
  anchor: { row: 0, column: 0 },
  condition: { kind: "cellValue", operator: "equal", value: "001" },
  style: { fillColor: "#FDE2E1" },
};

describe("conditional formatting dialogs", () => {
  test("manager immediately shows mounted rules and opens a quick-create editor", () => {
    const wrapper = mount(ConditionalFormatManagerDialog, {
      attachTo: document.body,
      props: {
        visible: true,
        rules: [textRule],
        selectionRanges: "A1",
        createKind: "formula",
      },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);

    expect(document.body.textContent).toContain("New conditional formatting rule");
    expect(wrapper.findComponent(RangeReferenceInput).exists()).toBe(true);
  });

  test("allows priority changes in the current selection scope", () => {
    const secondRule = { ...textRule, id: "second-rule" };
    const wrapper = mount(ConditionalFormatManagerDialog, {
      attachTo: document.body,
      props: { visible: true, rules: [textRule, secondRule], selectionRanges: "A1" },
      global: { plugins: [createAppI18n("en-US")] },
    });
    mounted.push(wrapper);

    expect(
      wrapper.get('[data-cf-rule="text-rule"] [data-cf-action="down"]').attributes("aria-disabled"),
    ).toBeUndefined();
  });

  test("preserves text and explicit false format attributes when editing", async () => {
    const wrapper = mountEditor(textRule);
    expect((document.body.querySelectorAll("input")[0] as HTMLInputElement).value).toBe("A1:A3");
    await confirmButton().trigger("click");
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      anchor: { row: 0, column: 0 },
      condition: { kind: "text", operator: "contains", text: "late" },
      style: { textColor: "#0000FF", bold: false, italic: false },
    });
  });

  test("rebases a stored formula to the first visible application range", async () => {
    const wrapper = mountEditor(shiftedFormulaRule);
    expect(
      [...document.body.querySelectorAll<HTMLInputElement>("input")].map((input) => input.value),
    ).toContain("=B5>0");
    await confirmButton().trigger("click");
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      anchor: { row: 4, column: 0 },
      condition: { kind: "formula", formula: "=B5>0" },
    });
  });

  test("keeps a string cell-value operand while editing only the style", async () => {
    const wrapper = mountEditor(stringValueRule);
    await confirmButton().trigger("click");
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({
      condition: { kind: "cellValue", operator: "equal", value: "001" },
    });
  });

  test.each([
    ["blank", { kind: "blank", blank: true }],
    ["nonBlank", { kind: "blank", blank: false }],
    ["error", { kind: "error", error: true }],
    ["nonError", { kind: "error", error: false }],
  ] as const)("preserves %s containing rule when saved and reopened", async (type, condition) => {
    const first = mountEditor(undefined, "between");
    first.getComponent(ConditionalFormatContainingCriteria).vm.$emit("update:type", type);
    await nextTick();
    await confirmButton().trigger("click");
    const saved = first.emitted("save")?.[0]?.[0] as SheetConditionalFormatRule;
    expect(saved.condition).toEqual(condition);
    first.unmount();
    mounted.splice(mounted.indexOf(first), 1);
    document.body.replaceChildren();

    const reopened = mountEditor(saved);
    expect(reopened.getComponent(ConditionalFormatContainingCriteria).props("type")).toBe(type);
    await confirmButton().trigger("click");
    expect(reopened.emitted("save")?.[0]?.[0]).toMatchObject({ condition });
  });

  test("keeps between references, text, and dates when editing their containing rules", async () => {
    const conditions = [
      {
        kind: "cellValue" as const,
        operator: "between" as const,
        value: { formula: "=$D$1" },
        secondValue: { formula: "=$E$1" },
      },
      { kind: "text" as const, operator: "beginsWith" as const, text: "Late" },
      { kind: "date" as const, period: "nextMonth" as const },
    ];
    for (const condition of conditions) {
      const wrapper = mountEditor({ ...textRule, id: condition.kind, condition });
      await confirmButton().trigger("click");
      expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({ condition });
      wrapper.unmount();
      mounted.splice(mounted.indexOf(wrapper), 1);
      document.body.replaceChildren();
    }
  });

  test("retains format on cancel and uses the confirmed containing-rule format", async () => {
    const wrapper = mountEditor(textRule);
    const editFormat = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Format…",
    );
    if (!editFormat) throw new Error("Missing containing-rule format action.");
    await new DOMWrapper(editFormat).trigger("click");
    const style = wrapper.getComponent(ConditionalFormatStyleDialog);
    style.vm.$emit("cancel");
    await nextTick();
    await confirmButton().trigger("click");
    expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject({ style: textRule.style });

    wrapper.unmount();
    mounted.splice(mounted.indexOf(wrapper), 1);
    document.body.replaceChildren();
    const confirmed = mountEditor(textRule);
    const formatButton = [...document.body.querySelectorAll("button")].find(
      (button) => button.textContent?.trim() === "Format…",
    );
    if (!formatButton) throw new Error("Missing containing-rule format action.");
    await new DOMWrapper(formatButton).trigger("click");
    confirmed
      .getComponent(ConditionalFormatStyleDialog)
      .vm.$emit("confirm", { fillColor: "#00FF00" });
    await nextTick();
    await confirmButton().trigger("click");
    expect(confirmed.emitted("save")?.[0]?.[0]).toMatchObject({ style: { fillColor: "#00FF00" } });
  });

  test("does not emit an invalid formula or incomplete between rule", async () => {
    const formula = mountEditor(undefined, "formula");
    const selects = document.body.querySelectorAll("input");
    await new DOMWrapper(selects[1]!).setValue("=NOT A FORMULA(");
    await confirmButton().trigger("click");
    expect(formula.emitted("save")).toBeUndefined();
    formula.unmount();
    mounted.splice(mounted.indexOf(formula), 1);
    document.body.replaceChildren();

    const between = mountEditor(undefined, "between");
    const inputs = document.body.querySelectorAll("input");
    await new DOMWrapper(inputs[1]!).setValue("1");
    await confirmButton().trigger("click");
    expect(between.emitted("save")).toBeUndefined();
  });
});

test("initializes rank and date quick rules with their selected preset", async () => {
  const topPercent = mountEditor(undefined, "top10Percent" as never);
  await confirmButton().trigger("click");
  expect(topPercent.emitted("save")?.[0]?.[0]).toMatchObject({
    condition: { kind: "rank", count: 10, percent: true },
  });
  topPercent.unmount();
  mounted.splice(mounted.indexOf(topPercent), 1);
  document.body.replaceChildren();

  const yesterday = mountEditor(undefined, "yesterday" as never);
  await confirmButton().trigger("click");
  expect(yesterday.emitted("save")?.[0]?.[0]).toMatchObject({
    condition: { kind: "date", period: "yesterday" },
  });
});

test("initializes visual gallery presets with their exact visual conditions", async () => {
  const bar = mountEditor(undefined, "barGreenSolid" as never);
  await confirmButton().trigger("click");
  expect(bar.emitted("save")?.[0]?.[0]).toMatchObject({
    condition: { kind: "dataBar", color: "#63BE7B", gradient: false },
  });
  bar.unmount();
  mounted.splice(mounted.indexOf(bar), 1);
  document.body.replaceChildren();

  const scale = mountEditor(undefined, "scaleWhiteRed" as never);
  await confirmButton().trigger("click");
  expect(
    (scale.emitted("save")?.[0]?.[0] as SheetConditionalFormatRule | undefined)?.condition,
  ).toMatchObject({
    kind: "colorScale",
    stops: [{ color: "#FFFFFF" }, { color: "#F8696B" }],
  });
  scale.unmount();
  mounted.splice(mounted.indexOf(scale), 1);
  document.body.replaceChildren();

  const icons = mountEditor(undefined, "iconsTrafficLights" as never);
  await confirmButton().trigger("click");
  expect(icons.emitted("save")?.[0]?.[0]).toMatchObject({
    condition: { kind: "iconSet", iconSet: "threeTrafficLights" },
  });
});
