import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import DataComparisonDialog from "../../../../../modules/data-tools/components/DataComparisonDialog.vue";
import DataComparisonTool from "../../../../../modules/data-tools/components/DataComparisonTool.vue";
import type { DataComparisonDraft } from "../../../../../modules/data-tools/data-comparison-types";
import { createAppI18n } from "../../../../../shared/i18n";

const initial: DataComparisonDraft = {
  scope: "single",
  firstRange: "A1:B4",
  secondRange: "",
  comparisonMode: "cells",
  columns: [0, 1],
  hasHeader: true,
  side: "first",
  fillColor: "#ffc7ce",
};
const columns = [
  { column: 0, label: "A", header: "Name" },
  { column: 1, label: "B", header: "Code" },
] as const;
const wrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function mountDialog(overrides: Partial<InstanceType<typeof DataComparisonDialog>["$props"]> = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const wrapper = mount(DataComparisonDialog, {
    attachTo: host,
    props: {
      visible: true,
      action: "markDuplicate",
      initial,
      columns,
      ...overrides,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function dialog() {
  return new DOMWrapper(document.body).get('[role="dialog"]');
}

describe("DataComparisonDialog", () => {
  test("selects comparison columns, supports invert, and keeps the updated draft after range picking", async () => {
    const wrapper = mountDialog();
    await new DOMWrapper(dialog().get('input[value="rows"]').element.parentElement!).trigger(
      "click",
    );
    await dialog()
      .get<HTMLInputElement>(".data-comparison-dialog__selection-actions input")
      .setValue(false);
    await dialog().get(".data-comparison-dialog__selection-actions button").trigger("click");
    expect(wrapper.emitted("draftChange")?.at(-1)).toEqual([
      { ...initial, comparisonMode: "rows", columns: [0, 1] },
    ]);

    await dialog().get('[aria-label="Range 1"] input').setValue("D1:E4");
    await dialog().get('[aria-label="Select range：Range 1"]').trigger("click");
    expect(wrapper.emitted("pickRange")).toEqual([["firstRange"]]);
    await wrapper.setProps({ picking: true });
    await wrapper.setProps({
      initial: { ...initial, firstRange: "D1:E4", comparisonMode: "rows", columns: [0, 1] },
      picking: false,
    });
    expect((dialog().get('[aria-label="Range 1"] input').element as HTMLInputElement).value).toBe(
      "D1:E4",
    );
    expect((dialog().get('input[value="rows"]').element as HTMLInputElement).checked).toBe(true);
  });

  test.each([
    ["markDuplicate", "Mark Duplicate Data", "Marks the current data"],
    ["extractDuplicate", "Extract Duplicate Data", "Creates a new worksheet"],
    ["markUnique", "Mark Unique Data", "Marks the current data"],
    ["extractUnique", "Extract Unique Data", "Creates a new worksheet"],
  ] as const)("shows the %s action title and hint", (action, title, hint) => {
    mountDialog({ action });
    expect(dialog().text()).toContain(title);
    expect(dialog().text()).toContain(hint);
  });
});

describe("DataComparisonTool", () => {
  test("maps all four actions and respects the disabled state", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const wrapper = mount(DataComparisonTool, {
      attachTo: host,
      props: { disabled: false },
      global: { plugins: [createAppI18n("en-US")] },
    });
    wrappers.push(wrapper);
    const trigger = wrapper.get('[data-data-action="comparison"]');
    for (const [selector, action] of [
      ["mark-duplicate", "markDuplicate"],
      ["extract-duplicate", "extractDuplicate"],
      ["mark-unique", "markUnique"],
      ["extract-unique", "extractUnique"],
    ] as const) {
      await trigger.trigger("click");
      await new DOMWrapper(document.body)
        .get(`[data-data-comparison="${selector}"]`)
        .trigger("click");
      expect(wrapper.emitted("open")?.at(-1)).toEqual([action]);
    }

    await wrapper.setProps({ disabled: true });
    expect((trigger.element as HTMLButtonElement).disabled).toBe(true);
  });
});
