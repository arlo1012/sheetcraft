import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { createAppI18n } from "../../../../shared/i18n";
import NamedRangesDialog from "../../../../modules/formula-tools/components/NamedRangesDialog.vue";
import NamedRangeEditorDialog from "../../../../modules/formula-tools/components/NamedRangeEditorDialog.vue";

const mounted: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  document.body.innerHTML = "";
});
function mountManager() {
  const wrapper = mount(NamedRangesDialog, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: {
      visible: true,
      ranges: [
        { id: "revenue", name: "Revenue", reference: "Budget!A1:A5" },
        { id: "costs", name: "Costs", reference: "Budget!B1:B5", scopeSheetId: "budget" },
      ],
      sheets: [{ id: "budget", name: "Budget" }],
      activeSheetId: "budget",
      selectionReference: "Budget!C1:C5",
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

test("selects a table row and saves or restores its reference", async () => {
  const wrapper = mountManager();
  const row = wrapper.get('[data-named-range="costs"]');
  expect(row.text()).toContain("Costs");
  expect(row.text()).toContain("Budget!B1:B5");
  await row.trigger("click");
  const reference = wrapper.get<HTMLInputElement>("[data-name-reference] input");
  expect(reference.element.value).toBe("Budget!B1:B5");
  await reference.setValue("Budget!D1:D5");
  await wrapper.get("[data-name-reference-reset]").trigger("click");
  expect(reference.element.value).toBe("Budget!B1:B5");
  await reference.setValue(" Budget!D1:D5 ");
  await wrapper.get("[data-name-reference-save]").trigger("click");
  expect(wrapper.emitted("save")).toEqual([
    [
      {
        id: "costs",
        name: "Costs",
        scopeSheetId: "budget",
        reference: "Budget!D1:D5",
      },
    ],
  ]);
});

test("filters by scope and clears a selection hidden by the filter", async () => {
  const wrapper = mountManager();
  await wrapper.get('[data-named-range="costs"]').trigger("click");
  wrapper.getComponent(TSelect).vm.$emit("change", ["workbook"]);
  await wrapper.vm.$nextTick();
  expect(wrapper.find('[data-named-range="costs"]').exists()).toBe(false);
  expect(wrapper.find('[data-named-range="revenue"]').exists()).toBe(true);
  expect(wrapper.get('[data-name-action="edit"]').attributes("disabled")).toBeDefined();
  expect(wrapper.get<HTMLInputElement>("[data-name-reference] input").element.value).toBe("");
});

test("opens separate create and edit dialogs and retains drafts after an unaccepted save", async () => {
  const wrapper = mountManager();
  await wrapper.get('[data-name-action="new"]').trigger("click");
  let editor = wrapper.getComponent(NamedRangeEditorDialog);
  expect(editor.props("initialDraft")).toEqual({
    name: "",
    scopeSheetId: "budget",
    reference: "Budget!C1:C5",
  });
  editor.vm.$emit("close");
  await wrapper.vm.$nextTick();
  expect(wrapper.findComponent(NamedRangeEditorDialog).exists()).toBe(false);
  await wrapper.get('[data-named-range="costs"]').trigger("click");
  await wrapper.get('[data-name-action="edit"]').trigger("click");
  editor = wrapper.getComponent(NamedRangeEditorDialog);
  expect(editor.props("initialDraft").id).toBe("costs");
  editor.vm.$emit("save", {
    id: "costs",
    name: "Costs",
    scopeSheetId: "budget",
    reference: "invalid",
  });
  await wrapper.vm.$nextTick();
  expect(wrapper.findComponent(NamedRangeEditorDialog).exists()).toBe(true);
  expect(wrapper.emitted("close")).toBeUndefined();
});

test("combines scope and error filters with keyword searches across remarks", async () => {
  const wrapper = mountManager();
  await wrapper.setProps({
    ranges: [
      {
        id: "local",
        name: "Local",
        scopeSheetId: "another-sheet",
        reference: "Budget!A1",
        value: "#DIV/0!",
        hasError: true,
        comment: "Review forecast",
      },
      {
        id: "global",
        name: "Global",
        reference: "Budget!B1",
        value: "42",
        hasError: false,
        comment: "Approved forecast",
      },
    ],
  });
  const select = wrapper.getComponent(TSelect);
  select.vm.$emit("change", ["sheet", "errors"]);
  await wrapper.vm.$nextTick();
  expect(wrapper.find('[data-named-range="local"]').exists()).toBe(true);
  expect(wrapper.find('[data-named-range="global"]').exists()).toBe(false);
  await wrapper.get("[data-name-search] input").setValue("approved");
  expect(wrapper.findAll("[data-named-range]")).toHaveLength(0);
  select.vm.$emit("change", ["sheet", "errors", "workbook"]);
  await wrapper.vm.$nextTick();
  expect(select.props("value")).toEqual(["errors", "workbook"]);
  select.vm.$emit("change", ["errors", "workbook", "no-errors"]);
  await wrapper.vm.$nextTick();
  expect(wrapper.find('[data-named-range="global"]').text()).toContain("Approved forecast");
  select.vm.$emit("change", ["table"]);
  await wrapper.vm.$nextTick();
  expect(wrapper.findAll("[data-named-range]")).toHaveLength(0);
});
