import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
import { PrimaryTable } from "tdesign-vue-next/es/table";
import { RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import DropdownListDialog from "../../../../../modules/data-tools/components/DropdownListDialog.vue";
import { createAppI18n } from "../../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
const initial = () => ({
  mode: "manual" as const,
  items: ["Open", "Closed"],
  source: "",
  applyToMatching: true,
  clear: false,
  canApplyToMatching: true,
});

function mountDialog(overrides: Record<string, unknown> = {}) {
  wrapper = mount(DropdownListDialog, {
    attachTo: document.body,
    props: { visible: true, initial: initial(), ...overrides },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}

afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});

test("adds an option and applies its active editor without requiring Enter", async () => {
  const dialog = mountDialog();
  await dialog.get("[data-dropdown-add]").trigger("click");
  await dialog.get('[aria-label="Edit option"] input').setValue("Pending");
  await dialog.get("[data-dropdown-confirm]").trigger("click");

  expect(dialog.emitted("apply")?.[0]?.[0]).toEqual({
    mode: "manual",
    items: ["Open", "Closed", "Pending"],
    source: "",
    applyToMatching: true,
    clear: false,
  });
});

test("reorders and removes the selected manual option", async () => {
  const dialog = mountDialog();
  await dialog.get('[role="option"]').trigger("click");
  await dialog.get("[data-dropdown-move-down]").trigger("click");
  await dialog.get("[data-dropdown-remove]").trigger("click");
  await dialog.get("[data-dropdown-confirm]").trigger("click");

  expect(dialog.emitted("apply")?.[0]?.[0]).toMatchObject({ items: ["Closed"] });
});

test("clearing is only applied after confirmation and retains matching-list scope", async () => {
  const dialog = mountDialog();
  await dialog.get("[data-dropdown-clear]").trigger("click");
  await dialog.get("[data-dropdown-cancel]").trigger("click");
  expect(dialog.emitted("apply")).toBeUndefined();
  expect(dialog.emitted("close")).toHaveLength(1);

  await dialog.get("[data-dropdown-confirm]").trigger("click");
  expect(dialog.emitted("apply")?.[0]?.[0]).toMatchObject({
    clear: true,
    items: [],
    source: "",
    applyToMatching: true,
  });
});

test("preserves an in-progress range draft while the picker suspends the dialog", async () => {
  const dialog = mountDialog();
  dialog.findAllComponents(TRadioGroup)[1]!.vm.$emit("update:modelValue", "range");
  await dialog.vm.$nextTick();
  await dialog
    .get('[aria-label="Choose dropdown options from cells"] input')
    .setValue("Sheet1!A1:A3");
  await dialog.setProps({ suspended: true });
  await dialog.setProps({ suspended: false });
  await dialog.get("[data-dropdown-confirm]").trigger("click");

  expect(dialog.emitted("apply")?.[0]?.[0]).toMatchObject({
    mode: "range",
    source: "Sheet1!A1:A3",
    clear: false,
  });
});

async function dragOption(dialog: ReturnType<typeof mount>, from: number, to: number) {
  const table = dialog.getComponent(PrimaryTable);
  const data = table.props("data") ?? [];
  const newData = [...data];
  const [row] = newData.splice(from, 1);
  if (row) newData.splice(to, 0, row);
  table.vm.$emit("drag-sort", {
    currentIndex: from,
    targetIndex: to,
    current: data[from],
    target: data[to],
    data,
    newData,
    sort: "row",
  });
  await dialog.vm.$nextTick();
}

test("drags a manual option to its final position and applies the order", async () => {
  const dialog = mountDialog({ initial: { ...initial(), items: ["Open", "Closed", "Pending"] } });
  expect(dialog.getComponent(PrimaryTable).props("dragSort")).toBe("row-handler");
  expect(dialog.findAll("svg.idea-table-drag-icon")).toHaveLength(3);
  await dragOption(dialog, 0, 2);
  expect(dialog.findAll('[role="option"]').map((row) => row.text())).toEqual([
    "Closed",
    "Pending",
    "Open",
  ]);
  expect(dialog.findAll('[role="option"]')[2]!.attributes("aria-selected")).toBe("true");
  await dialog.get("[data-dropdown-confirm]").trigger("click");
  expect(dialog.emitted("apply")?.[0]?.[0]).toMatchObject({ items: ["Closed", "Pending", "Open"] });
});

test("dragging duplicate option text preserves each position and cancel leaves the source untouched", async () => {
  const source = { ...initial(), items: ["Open", "Closed", "Open"] };
  const dialog = mountDialog({ initial: source });
  await dragOption(dialog, 2, 1);
  expect(dialog.findAll('[role="option"]').map((row) => row.text())).toEqual([
    "Open",
    "Open",
    "Closed",
  ]);
  await dialog.get("[data-dropdown-cancel]").trigger("click");
  expect(dialog.emitted("apply")).toBeUndefined();
  expect(source.items).toEqual(["Open", "Closed", "Open"]);
});

test("ignores same-position drags and disables drag while editing or using a range", async () => {
  const dialog = mountDialog();
  await dragOption(dialog, 0, 0);
  await dialog.findAll('[role="option"]')[0]!.trigger("dblclick");
  const filter = dialog.getComponent(PrimaryTable).props("dragSortOptions")?.filter;
  expect(typeof filter).toBe("function");
  expect((filter as () => boolean)()).toBe(true);
  await dialog.get('[aria-label="Edit option"] input').setValue("Still editing");
  await dragOption(dialog, 0, 1);
  await dialog.get("[data-dropdown-confirm]").trigger("click");
  expect(dialog.emitted("apply")?.[0]?.[0]).toMatchObject({ items: ["Still editing", "Closed"] });
  dialog.findAllComponents(TRadioGroup)[1]!.vm.$emit("update:modelValue", "range");
  await dialog.vm.$nextTick();
  expect(dialog.getComponent(PrimaryTable).props("dragSort")).toBeUndefined();
  await dragOption(dialog, 0, 1);
  expect(dialog.findAll('[role="option"]').map((row) => row.text())).toEqual([
    "Still editing",
    "Closed",
  ]);
});

test("double-clicking another row edits that option after a reorder", async () => {
  const dialog = mountDialog();
  await dragOption(dialog, 0, 1);
  await dialog.findAll('[role="option"]')[0]!.trigger("dblclick");
  await dialog.get('[aria-label="Edit option"] input').setValue("Resolved");
  await dialog.get("[data-dropdown-confirm]").trigger("click");
  expect(dialog.emitted("apply")?.[0]?.[0]).toMatchObject({ items: ["Resolved", "Open"] });
});
