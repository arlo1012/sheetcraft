import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Select } from "tdesign-vue-next/es/select";
import type { SheetConditionalFormatRule } from "@idea10/core/conditional-formatting";
import ConditionalFormatManagerDialog from "../../../modules/conditional-formatting/components/ConditionalFormatManagerDialog.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

const textRule: SheetConditionalFormatRule = {
  id: "text-rule",
  ranges: [{ start: { row: 0, column: 0 }, end: { row: 2, column: 0 } }],
  anchor: { row: 0, column: 0 },
  condition: { kind: "text", operator: "contains", text: "late" },
  style: { fillColor: "#FDE2E1" },
};
const secondRule: SheetConditionalFormatRule = {
  ...textRule,
  id: "second-rule",
  ranges: [{ start: { row: 4, column: 1 }, end: { row: 5, column: 1 } }],
  anchor: { row: 4, column: 1 },
};
const visualRule: SheetConditionalFormatRule = {
  ...textRule,
  id: "visual-rule",
  condition: {
    kind: "colorScale",
    stops: [
      { threshold: { kind: "num", value: 0 }, color: "#F8696B" },
      { threshold: { kind: "num", value: 100 }, color: "#63BE7B" },
    ],
  },
  style: {},
};
type ManagerSheet = {
  id: string;
  name: string;
  rules: readonly SheetConditionalFormatRule[];
  selectionRanges: string;
  protected?: boolean;
};
const summarySheet: ManagerSheet = {
  id: "summary",
  name: "Summary",
  rules: [textRule],
  selectionRanges: "A1:A3",
};
const detailsSheet: ManagerSheet = {
  id: "details",
  name: "Details",
  rules: [
    {
      ...textRule,
      condition: { kind: "text", operator: "contains", text: "urgent" },
      ranges: [{ start: { row: 5, column: 2 }, end: { row: 5, column: 2 } }],
      anchor: { row: 5, column: 2 },
    },
  ],
  selectionRanges: "C6",
};

function mountManager(
  rules: readonly SheetConditionalFormatRule[],
  selectReference?: (current: string) => Promise<string | undefined>,
  multiSheet?: { sheets: readonly ManagerSheet[]; sheetId: string },
) {
  const wrapper = mount(ConditionalFormatManagerDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      rules,
      selectionRanges: "A1:A3",
      selectReference,
      ...multiSheet,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}

function saveManager(wrapper: ReturnType<typeof mount>): void {
  wrapper.getComponent(Dialog).vm.$emit("confirm");
}

test("selects the first displayed rule when the manager opens", () => {
  const wrapper = mountManager([textRule, secondRule]);

  expect(wrapper.get('[data-cf-rule="text-rule"]').attributes("aria-selected")).toBe("true");
  expect(
    wrapper.get('[data-cf-rule="text-rule"] [data-cf-action="edit"]').attributes("aria-disabled"),
  ).toBeUndefined();
});

test("moves the selected sheet rule and saves its changed priority", async () => {
  const wrapper = mountManager([textRule, secondRule]);
  expect(wrapper.find("[data-cf-scope]").exists()).toBe(true);
  wrapper.getComponent(Select).vm.$emit("update:modelValue", "sheet");
  await wrapper.vm.$nextTick();

  expect(
    wrapper.get('[data-cf-rule="text-rule"] [data-cf-action="up"]').attributes("aria-disabled"),
  ).toBe("true");
  expect(
    wrapper.get('[data-cf-rule="second-rule"] [data-cf-action="down"]').attributes("aria-disabled"),
  ).toBe("true");
  await wrapper.get('[data-cf-rule="second-rule"]').trigger("click");
  await wrapper.get('[data-cf-rule="second-rule"] [data-cf-action="up"]').trigger("click");
  saveManager(wrapper);

  const saved = wrapper.emitted("save")?.[0]?.[0] as SheetConditionalFormatRule[] | undefined;
  expect(saved?.map((rule) => rule.id)).toEqual(["second-rule", "text-rule"]);
});

test("hides sorting in a filtered selection so hidden rule priorities remain unchanged", () => {
  const otherVisibleRule = { ...textRule, id: "other-visible" };
  const wrapper = mountManager([textRule, secondRule, otherVisibleRule]);
  expect(wrapper.find('[data-cf-action="up"]').exists()).toBe(false);
  expect(wrapper.find('[data-cf-action="down"]').exists()).toBe(false);

  saveManager(wrapper);
  const saved = wrapper.emitted("save")?.[0]?.[0] as SheetConditionalFormatRule[];
  expect(saved.map((rule) => rule.id)).toEqual(["text-rule", "second-rule", "other-visible"]);
  expect(saved[1]).toEqual(secondRule);
});

test("deleting a selected rule stays in the draft when the manager is cancelled", async () => {
  const rules = [textRule, secondRule];
  const wrapper = mountManager(rules);
  await wrapper.get('[data-cf-rule="text-rule"] [data-cf-action="delete"]').trigger("click");

  expect(wrapper.find('[data-cf-rule="text-rule"]').exists()).toBe(false);
  wrapper.getComponent(Dialog).vm.$emit("close");
  expect(wrapper.emitted("save")).toBeUndefined();
  expect(rules.map((rule) => rule.id)).toEqual(["text-rule", "second-rule"]);
});

test("saves a valid inline range without changing its existing anchor", async () => {
  const wrapper = mountManager([textRule]);
  const range = wrapper.get('[data-cf-range="text-rule"] input');
  await range.setValue("B2:C3");
  saveManager(wrapper);

  expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject([
    {
      id: "text-rule",
      anchor: { row: 0, column: 0 },
      ranges: [{ start: { row: 1, column: 1 }, end: { row: 2, column: 2 } }],
    },
  ]);
});

test("uses the inline range picker before saving the edited application range", async () => {
  const selectReference = async () => "=D4:E5";
  const wrapper = mountManager([textRule], selectReference);
  await wrapper.get('[data-cf-range="text-rule"] [data-select-formula-reference]').trigger("click");
  await flushPromises();
  saveManager(wrapper);

  expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject([
    {
      id: "text-rule",
      ranges: [{ start: { row: 3, column: 3 }, end: { row: 4, column: 4 } }],
    },
  ]);
});

test("does not save an invalid inline range", async () => {
  const wrapper = mountManager([textRule]);
  await wrapper.get('[data-cf-range="text-rule"] input').setValue("not a range");
  saveManager(wrapper);

  expect(wrapper.emitted("save")).toBeUndefined();
});

test("updates stop-if-true for ordinary rules and disables it for visual rules", async () => {
  const wrapper = mountManager([textRule, visualRule]);
  const stop = wrapper.get('[data-cf-stop="text-rule"] input');
  await new DOMWrapper(stop.element).setValue(true);
  expect(wrapper.get('[data-cf-stop="visual-rule"] input').attributes("disabled")).toBeDefined();
  saveManager(wrapper);

  expect(wrapper.emitted("save")?.[0]?.[0]).toMatchObject([
    { id: "text-rule", stopIfTrue: true },
    { id: "visual-rule" },
  ]);
});

test("keeps same-id rules isolated while changing the displayed sheet", async () => {
  const wrapper = mountManager([], undefined, {
    sheets: [summarySheet, detailsSheet],
    sheetId: "summary",
  });
  expect(wrapper.get('[data-cf-rule="text-rule"]').text()).toContain("Text contains: late");

  wrapper.getComponent(Select).vm.$emit("update:modelValue", "sheet:details");
  await wrapper.vm.$nextTick();
  expect(wrapper.get('[data-cf-rule="text-rule"]').text()).toContain("Text contains: urgent");
  await wrapper.get('[data-cf-range="text-rule"] input').setValue("D7");
  saveManager(wrapper);

  expect(wrapper.emitted("saveSheets")?.[0]?.[0]).toMatchObject([
    {
      sheetId: "details",
      rules: [
        {
          id: "text-rule",
          ranges: [{ start: { row: 6, column: 3 }, end: { row: 6, column: 3 } }],
        },
      ],
    },
  ]);
  expect(summarySheet.rules[0]?.ranges).toEqual(textRule.ranges);
});

test("retains drafts for two sheets and saves only their separate changes", async () => {
  const wrapper = mountManager([], undefined, {
    sheets: [summarySheet, detailsSheet],
    sheetId: "summary",
  });
  await wrapper.get('[data-cf-range="text-rule"] input').setValue("B2");
  wrapper.getComponent(Select).vm.$emit("update:modelValue", "sheet:details");
  await wrapper.vm.$nextTick();
  await wrapper.get('[data-cf-range="text-rule"] input').setValue("D7");
  wrapper.getComponent(Select).vm.$emit("update:modelValue", "sheet:summary");
  await wrapper.vm.$nextTick();
  expect(wrapper.get<HTMLInputElement>('[data-cf-range="text-rule"] input').element.value).toBe(
    "B2",
  );
  saveManager(wrapper);

  expect(wrapper.emitted("saveSheets")?.[0]?.[0]).toMatchObject([
    {
      sheetId: "summary",
      rules: [{ id: "text-rule", ranges: [{ start: { row: 1, column: 1 } }] }],
    },
    {
      sheetId: "details",
      rules: [{ id: "text-rule", ranges: [{ start: { row: 6, column: 3 } }] }],
    },
  ]);
});

test("cancelling a multi-sheet edit leaves both input sheets unchanged", async () => {
  const sheets = [summarySheet, detailsSheet];
  const wrapper = mountManager([], undefined, { sheets, sheetId: "summary" });
  await wrapper.get('[data-cf-range="text-rule"] input').setValue("B2");
  wrapper.getComponent(Dialog).vm.$emit("close");

  expect(wrapper.emitted("saveSheets")).toBeUndefined();
  expect(sheets[0]?.rules[0]?.ranges).toEqual(textRule.ranges);
  expect(sheets[1]?.rules[0]?.ranges).toEqual(detailsSheet.rules[0]?.ranges);
});

test("makes protected sheets read-only", async () => {
  const protectedSheet: ManagerSheet = { ...detailsSheet, id: "locked", protected: true };
  const wrapper = mountManager([], undefined, {
    sheets: [summarySheet, protectedSheet],
    sheetId: "summary",
  });
  wrapper.getComponent(Select).vm.$emit("update:modelValue", "sheet:locked");
  await wrapper.vm.$nextTick();

  expect(wrapper.get('[data-cf-action="new"]').attributes("disabled")).toBeDefined();
  for (const action of ["edit", "delete"]) {
    expect(
      wrapper
        .get(`[data-cf-rule="text-rule"] [data-cf-action="${action}"]`)
        .attributes("aria-disabled"),
    ).toBe("true");
  }
  expect(wrapper.find('[data-cf-action="up"]').exists()).toBe(false);
  expect(wrapper.find('[data-cf-action="down"]').exists()).toBe(false);
  expect(wrapper.get('[data-cf-range="text-rule"] input').attributes("disabled")).toBeDefined();
  expect(wrapper.get('[data-cf-stop="text-rule"] input').attributes("disabled")).toBeDefined();
});
