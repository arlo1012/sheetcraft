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

function mountManager(
  rules: readonly SheetConditionalFormatRule[],
  selectReference?: (current: string) => Promise<string | undefined>,
) {
  const wrapper = mount(ConditionalFormatManagerDialog, {
    attachTo: document.body,
    props: { visible: true, rules, selectionRanges: "A1:A3", selectReference },
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
  expect(wrapper.get('[data-cf-action="edit"]').attributes("disabled")).toBeUndefined();
});

test("moves the selected sheet rule and saves its changed priority", async () => {
  const wrapper = mountManager([textRule, secondRule]);
  expect(wrapper.get("[data-cf-scope]").exists()).toBe(true);
  wrapper.getComponent(Select).vm.$emit("update:modelValue", "sheet");
  await wrapper.vm.$nextTick();

  await wrapper.get('[data-cf-rule="second-rule"]').trigger("click");
  await wrapper.get('[data-cf-action="up"]').trigger("click");
  saveManager(wrapper);

  const saved = wrapper.emitted("save")?.[0]?.[0] as SheetConditionalFormatRule[] | undefined;
  expect(saved?.map((rule) => rule.id)).toEqual(["second-rule", "text-rule"]);
});

test("deleting a selected rule stays in the draft when the manager is cancelled", async () => {
  const rules = [textRule, secondRule];
  const wrapper = mountManager(rules);
  await wrapper.get('[data-cf-action="delete"]').trigger("click");

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
