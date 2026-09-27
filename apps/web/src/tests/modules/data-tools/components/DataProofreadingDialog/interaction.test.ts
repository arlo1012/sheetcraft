import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import DataProofreadingDialog from "../../../../../modules/data-tools/components/DataProofreadingDialog.vue";
import type { DataProofreadingIssue } from "../../../../../modules/data-tools/data-proofreading-types";
import { createAppI18n } from "../../../../../shared/i18n";

const issues: DataProofreadingIssue[] = [
  {
    id: "sheet:0:0:textNumber",
    type: "number",
    reason: "textNumber",
    address: "A1",
    currentValue: "42",
    proposedValue: "42",
    safe: true,
  },
  {
    id: "sheet:1:0:unsafeLeadingZero",
    type: "number",
    reason: "unsafeLeadingZero",
    address: "A2",
    currentValue: "0012",
    safe: false,
  },
];
const wrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountDialog(
  overrides: Partial<InstanceType<typeof DataProofreadingDialog>["$props"]> = {},
) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(DataProofreadingDialog, {
    attachTo: host,
    props: {
      visible: true,
      draft: { range: "" },
      issues: [],
      selectedIds: [],
      ...overrides,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
const dialog = () => new DOMWrapper(document.body).get('[role="dialog"]');

describe("DataProofreadingDialog", () => {
  test("does not present an empty scan as success before proofreading begins", async () => {
    const wrapper = mountDialog();
    expect(dialog().text()).toContain("Proofread the current worksheet");
    expect(dialog().text()).not.toContain("No items need proofreading");

    await wrapper.setProps({ hasScanned: true });
    expect(dialog().text()).toContain("No items need proofreading");
  });

  test("allows proofreading with an empty optional range", async () => {
    const wrapper = mountDialog();
    const scan = dialog()
      .findAll("button")
      .find((button) => button.text() === "Proofread")!;
    expect((scan.element as HTMLButtonElement).disabled).toBe(false);
    await scan.trigger("click");
    expect(wrapper.emitted("scan")).toEqual([[{ range: "" }]]);
  });

  test("keeps advisory items out of batch selection and exposes explicit actions", async () => {
    const wrapper = mountDialog({ hasScanned: true, issues });
    const checkboxes = dialog().findAll('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    expect((checkboxes[2]!.element as HTMLInputElement).disabled).toBe(true);
    await new DOMWrapper(checkboxes[1]!.element).setValue(true);
    expect(wrapper.emitted("selectionChange")).toEqual([[[issues[0]!.id]]]);
    expect(dialog().text()).toContain("Apply type");
    expect(dialog().text()).toContain("Ignore type");
  });
  test("selects all safe rows, supports partial selection, and clears the selection", async () => {
    const extra = { ...issues[0]!, id: "sheet:2:0:textNumber", address: "A3" };
    const wrapper = mountDialog({ hasScanned: true, issues: [...issues, extra] });
    const checkboxes = () => dialog().findAll('input[type="checkbox"]');
    const header = () => checkboxes()[0]!;
    await checkboxes()[1]!.setValue(true);
    expect(wrapper.emitted("selectionChange")?.at(-1)).toEqual([[issues[0]!.id]]);
    await wrapper.setProps({ selectedIds: [issues[0]!.id] });
    expect(dialog().find("thead .t-checkbox").classes()).toContain("t-is-indeterminate");
    await header().setValue(true);
    expect(wrapper.emitted("selectionChange")?.at(-1)).toEqual([[issues[0]!.id, extra.id]]);
    await wrapper.setProps({ selectedIds: [issues[0]!.id, extra.id] });
    expect((header().element as HTMLInputElement).checked).toBe(true);
    expect((checkboxes()[2]!.element as HTMLInputElement).disabled).toBe(true);
    await header().setValue(false);
    expect(wrapper.emitted("selectionChange")?.at(-1)).toEqual([[]]);
  });
});
