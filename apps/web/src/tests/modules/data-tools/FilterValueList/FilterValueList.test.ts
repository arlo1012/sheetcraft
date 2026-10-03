import { mount } from "@vue/test-utils";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { defineComponent, nextTick, ref } from "vue";
import { describe, expect, test } from "vitest";
import type { SheetFilterValue } from "@idea10/core/workbook";
import FilterValueList from "../../../../modules/data-tools/components/FilterValueList.vue";
import type { DataToolFilterValueOption } from "../../../../modules/data-tools/data-tools-types";
import { createAppI18n } from "../../../../shared/i18n";
import { readFilterPanelSettings } from "../../../../modules/data-tools/filter-panel-settings";

function stringOption(value: string, count = 1): DataToolFilterValueOption {
  return { key: { kind: "string", value }, label: value, count };
}

function mountList(
  values: readonly DataToolFilterValueOption[],
  selected: SheetFilterValue[] = [],
) {
  const selectedRef = ref<SheetFilterValue[]>(selected);
  const query = ref("");
  const settings = ref(readFilterPanelSettings());
  const wrapper = mount(
    defineComponent({
      components: { FilterValueList },
      setup: () => ({ query, selected: selectedRef, values, settings }),
      template: `
        <FilterValueList
          v-model="selected"
          v-model:query="query"
          v-model:settings="settings"
          :values="values"
          :disabled="false"
        />
      `,
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  return { wrapper, selected: selectedRef, query, settings };
}

function filterComponent(wrapper: ReturnType<typeof mount>) {
  return wrapper.getComponent(FilterValueList);
}

function checkboxAt(wrapper: ReturnType<typeof mount>, index: number) {
  return filterComponent(wrapper).findAllComponents(TCheckbox).at(index)!;
}

function buttonWithText(wrapper: ReturnType<typeof mount>, text: string) {
  return filterComponent(wrapper)
    .findAllComponents(TButton)
    .find((button) => button.text().includes(text))!;
}

describe("FilterValueList", () => {
  test("selects and inverts all 200 matching values rather than only the rendered page", async () => {
    const values = Array.from({ length: 200 }, (_, index) => stringOption(`Value ${index + 1}`));
    const { wrapper, selected } = mountList(values);

    checkboxAt(wrapper, 0).vm.$emit("change", true);
    await nextTick();
    expect(selected.value).toHaveLength(200);
    expect(filterComponent(wrapper).findAll(".filter-value-list__label")).toHaveLength(100);

    await buttonWithText(wrapper, "Invert").trigger("click");
    expect(selected.value).toEqual([]);
  });

  test("keeps values outside a multi-word query selected while changing matching values", async () => {
    const northAmerica = stringOption("North America");
    const northEurope = stringOption("North Europe");
    const southAmerica = stringOption("South America");
    const { wrapper, selected, query } = mountList(
      [northAmerica, northEurope, southAmerica],
      [southAmerica.key],
    );
    await filterComponent(wrapper).get("input").setValue("north america");
    expect(query.value).toBe("north america");

    checkboxAt(wrapper, 0).vm.$emit("change", true);
    await nextTick();
    expect(selected.value).toEqual([southAmerica.key, northAmerica.key]);
  });

  test("orders numeric keys numerically and replaces only matching values with duplicates", async () => {
    const one = { key: { kind: "number" as const, value: 1 }, label: "1", count: 1 };
    const two = { key: { kind: "number" as const, value: 2 }, label: "2", count: 4 };
    const ten = { key: { kind: "number" as const, value: 10 }, label: "10", count: 3 };
    const outside = stringOption("outside");
    const { wrapper, selected } = mountList([ten, two, one], [outside.key]);

    expect(
      filterComponent(wrapper)
        .findAll(".filter-value-list__label")
        .map((node) => node.text()),
    ).toEqual(["1", "2", "10"]);

    await buttonWithText(wrapper, "Count").trigger("click");
    expect(
      filterComponent(wrapper)
        .findAll(".filter-value-list__label")
        .map((node) => node.text()),
    ).toEqual(["2", "10", "1"]);

    await buttonWithText(wrapper, "Select duplicates").trigger("click");
    expect(selected.value).toEqual([outside.key, ten.key, two.key]);
  });

  test("hides item counts and pins the opening selection without moving rows during edits", async () => {
    const a = stringOption("Alpha", 2);
    const b = stringOption("Beta", 3);
    const c = stringOption("Gamma", 4);
    const { wrapper, settings } = mountList([a, b, c], [c.key]);
    settings.value.checkedFirst = true;
    settings.value.showItemCount = false;
    await nextTick();
    const names = () =>
      filterComponent(wrapper)
        .findAll(".filter-value-list__label")
        .map((node) => node.text());
    expect(names()).toEqual(["Gamma", "Alpha", "Beta"]);
    expect(
      filterComponent(wrapper).findAll(".filter-value-list__value-text .filter-value-list__count"),
    ).toHaveLength(0);
    checkboxAt(wrapper, 1).vm.$emit("change", false);
    await nextTick();
    expect(names()).toEqual(["Gamma", "Alpha", "Beta"]);
  });
});
