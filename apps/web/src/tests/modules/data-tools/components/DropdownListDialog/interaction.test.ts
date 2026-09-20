import { mount } from "@vue/test-utils";
import { afterEach, expect, test } from "vitest";
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
