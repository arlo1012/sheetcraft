import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import LookupFieldMappingTable from "../../../../../modules/data-tools/components/LookupFieldMappingTable.vue";
import LookupFillDialog from "../../../../../modules/data-tools/components/LookupFillDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});

const columns = [
  { column: 0, label: "A", header: "ID" },
  { column: 1, label: "B", header: "Name" },
  { column: 2, label: "C", header: "Amount" },
];
function initial(overrides = {}) {
  return {
    sourceRange: "Sheet1!A1:C3",
    targetRange: "Sheet1!D1:F3",
    hasHeader: true,
    matchFields: [{ sourceColumn: 0, targetColumn: 0 }],
    fillFields: [],
    matchMode: "first" as const,
    overwrite: false,
    ...overrides,
  };
}
function button(label: string) {
  return wrapper!.findAll("button").find((item) => item.text().includes(label));
}

test("defaults fill fields to remaining matching headers without changing the input draft", async () => {
  const value = initial();
  wrapper = mount(LookupFillDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      initial: value,
      sourceColumns: columns,
      targetColumns: columns,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  await button("Next")!.trigger("click");
  expect(wrapper.text()).toContain("Map fields");
  expect(wrapper.findAllComponents(TSelect)).toHaveLength(6);
  expect(wrapper.emitted("draftChange")?.at(-1)?.[0]).toMatchObject({
    fillFields: [
      { sourceColumn: 1, targetColumn: 1 },
      { sourceColumn: 2, targetColumn: 2 },
    ],
  });
  await button("Match same headers")!.trigger("click");
  await wrapper.vm.$nextTick();
  expect(value.fillFields).toEqual([]);
  expect(wrapper.findAllComponents(TSelect)).toHaveLength(6);
});

test("creates an editable first lookup row that can be confirmed without changing a valid key", async () => {
  wrapper = mount(LookupFillDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      initial: initial({
        matchFields: [],
        fillFields: [{ sourceColumn: 1, targetColumn: 1 }],
      }),
      sourceColumns: columns,
      targetColumns: columns,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  await button("Next")!.trigger("click");
  expect(wrapper.text()).toContain("Map fields");
  expect(wrapper.findAllComponents(TSelect)).toHaveLength(4);
  expect(button("Next")!.attributes("disabled")).toBeUndefined();
  await button("Next")!.trigger("click");
  expect(wrapper.text()).toContain("Preview and fill");
});

test("blocks the field step and names invalid mappings after a range becomes narrower", async () => {
  wrapper = mount(LookupFillDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      initial: initial({
        fillFields: [{ sourceColumn: 2, targetColumn: 2 }],
      }),
      sourceColumns: columns,
      targetColumns: columns,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  await wrapper.setProps({
    sourceColumns: columns.slice(0, 2),
    targetColumns: columns.slice(0, 2),
  });
  await button("Next")!.trigger("click");
  expect(wrapper.text()).toContain("The ranges changed.");
  expect(button("Next")!.attributes("disabled")).toBeDefined();
});

test("clears either table without restoring defaults on reactive updates or Back", async () => {
  wrapper = mount(LookupFillDialog, {
    attachTo: document.body,
    props: { visible: true, initial: initial(), sourceColumns: columns, targetColumns: columns },
    global: { plugins: [createAppI18n("en-US")] },
  });
  await button("Next")!.trigger("click");
  const tables = wrapper.findAllComponents(LookupFieldMappingTable);
  for (const table of tables) {
    await table
      .findAll("button")
      .find((item) => item.text() === "Clear")!
      .trigger("click");
  }
  await wrapper.setProps({ sourceColumns: [...columns], targetColumns: [...columns] });
  expect(wrapper.findAllComponents(TSelect)).toHaveLength(0);
  expect(button("Next")!.attributes("disabled")).toBeDefined();
  await button("Back")!.trigger("click");
  await button("Next")!.trigger("click");
  expect(wrapper.findAllComponents(TSelect)).toHaveLength(0);
  await wrapper.setProps({ visible: false });
  await wrapper.setProps({ visible: true });
  await button("Next")!.trigger("click");
  expect(wrapper.findAllComponents(TSelect)).toHaveLength(6);
});

test("does not auto-match duplicated or missing headers", async () => {
  wrapper = mount(LookupFillDialog, {
    attachTo: document.body,
    props: {
      visible: true,
      initial: initial(),
      sourceColumns: [columns[0]!, columns[1]!, { column: 2, label: "C", header: "Name" }],
      targetColumns: columns,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  await button("Next")!.trigger("click");
  expect(wrapper.findAllComponents(TSelect)).toHaveLength(2);
  expect(wrapper.text()).toContain("Add a field to fill.");
});
