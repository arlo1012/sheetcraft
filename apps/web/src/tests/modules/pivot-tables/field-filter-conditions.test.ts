import { DOMWrapper, flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import PivotFieldFilterConditions from "../../../modules/pivot-tables/components/PivotFieldFilterConditions.vue";
import FilterConditionDialog from "../../../shared/filter/components/FilterConditionDialog.vue";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});
function setup(kind: "text" | "number") {
  const wrapper = mount(PivotFieldFilterConditions, {
    attachTo: document.body,
    props: {
      kind,
      fieldLabel: "Region",
      values: [],
      measures: [{ field: 2, aggregate: "sum", caption: "Revenue" }],
      dateSystem: "1900",
      disabled: false,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  return wrapper;
}
const labelActions = [
  "equals",
  "notEquals",
  "beginsWith",
  "doesNotBeginWith",
  "endsWith",
  "doesNotEndWith",
  "contains",
  "doesNotContain",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "between",
  "notBetween",
];
const valueActions = [
  "equals",
  "notEquals",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
  "between",
  "notBetween",
  "rank",
];
async function menu(wrapper: ReturnType<typeof setup>, index: number) {
  await wrapper
    .get(".pivot-field-filter-conditions__actions")
    .findAll("button")
    [index]!.trigger("click");
  await flushPromises();
  return new DOMWrapper(document.querySelector(".filter-condition-menu")!);
}
describe("pivot field filter conditions", () => {
  test.each(["text", "number"] as const)(
    "%s labels expose exactly the fourteen WPS actions",
    async (kind) => {
      const wrapper = setup(kind);
      const actions = (await menu(wrapper, 0))
        .findAll("[data-filter-condition-action]")
        .map((item) => item.attributes("data-filter-condition-action"));
      expect(actions).toEqual(labelActions);
      expect(actions).toHaveLength(14);
    },
  );
  test("value menu contains exactly nine WPS actions", async () => {
    const actions = (await menu(setup("number"), 1))
      .findAll("[data-filter-condition-action]")
      .map((item) => item.attributes("data-filter-condition-action"));
    expect(actions).toEqual(valueActions);
    expect(actions).toHaveLength(9);
  });
  test("numeric label comparison opens the numeric editor and preserves its numeric condition", async () => {
    const wrapper = setup("number");
    await (
      await menu(wrapper, 0)
    )
      .get('[data-filter-condition-action="greaterThan"]')
      .trigger("click");
    const dialog = wrapper.findComponent(FilterConditionDialog);
    expect(dialog.props()).toMatchObject({ visible: true, kind: "number", action: "greaterThan" });
    dialog.vm.$emit("apply", { kind: "number", operator: "greaterThan", value: 20 });
    await flushPromises();
    expect(wrapper.emitted("update:labelCondition")).toEqual([
      [{ kind: "number", operator: "greaterThan", value: 20 }],
    ]);
  });
});
