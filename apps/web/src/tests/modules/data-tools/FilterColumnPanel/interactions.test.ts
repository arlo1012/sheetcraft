import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import FilterColumnPanel from "../../../../modules/data-tools/components/FilterColumnPanel.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});
function panel(criteria?: { kind: "number"; operator: "equals"; value: number }) {
  const values = [
    { key: { kind: "string" as const, value: "North Alpha" }, label: "North Alpha", count: 2 },
    { key: { kind: "string" as const, value: "North Beta" }, label: "North Beta", count: 1 },
    { key: { kind: "string" as const, value: "South Alpha" }, label: "South Alpha", count: 3 },
  ];
  const result = mount(FilterColumnPanel, {
    attachTo: document.body,
    props: {
      visible: true,
      columnLabel: "Team (A)",
      values,
      appliedKeys: values.map((option) => option.key),
      preferredKind: "number",
      hasCriteria: Boolean(criteria),
      canSort: true,
      criteria,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrapper = result;
  return result;
}
describe("filter column panel", () => {
  test("search then Apply submits checked matches and clearing the search restores the full draft", async () => {
    const w = panel();
    const search = new DOMWrapper(document.body).find(
      'input[placeholder="Match all keywords, separated by spaces"]',
    );
    await search.setValue("north alpha");
    expect(document.body.textContent).toContain("Search results: 1 of 1");
    const apply = () => w.findAllComponents(TButton).find((button) => button.text() === "Apply")!;
    await apply().trigger("click");
    expect(w.emitted("apply")?.[0]).toEqual([
      { includedKeys: [{ kind: "string", value: "North Alpha" }] },
    ]);
    await search.setValue("");
    await apply().trigger("click");
    expect(w.emitted<{ includedKeys: unknown[] }[]>("apply")![1]![0]!.includedKeys).toHaveLength(3);
  });
  test("real numeric input updates a typed condition and reopening retains it", async () => {
    const w = panel({ kind: "number", operator: "equals", value: 2 });
    await new DOMWrapper(document.body).find('input[type="number"]').setValue("12");
    await w
      .findAllComponents(TButton)
      .find((button) => button.text() === "Apply")!
      .trigger("click");
    expect(w.emitted("apply")?.[0]).toEqual([
      { includedKeys: [], criteria: { kind: "number", operator: "equals", value: 12 } },
    ]);
    await w.setProps({ criteria: { kind: "number", operator: "equals", value: 12 } });
    expect(document.body.querySelector<HTMLInputElement>('input[type="number"]')?.value).toBe("12");
  });
  test("Cancel discards edits, and a disabled panel prevents editing and applying", async () => {
    const w = panel({ kind: "number", operator: "equals", value: 2 });
    await new DOMWrapper(document.body).find('input[type="number"]').setValue("9");
    await w
      .findAllComponents(TButton)
      .find((button) => button.text() === "Cancel")!
      .trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
    expect(w.emitted("apply")).toBeUndefined();
    await w.setProps({ disabled: true });
    expect(document.body.querySelector<HTMLInputElement>('input[type="number"]')?.disabled).toBe(
      true,
    );
    expect(w.findAllComponents(TSelect).every((select) => select.props("disabled"))).toBe(true);
    expect(
      w
        .findAllComponents(TButton)
        .find((button) => button.text() === "Apply")!
        .props("disabled"),
    ).toBe(true);
  });
});
