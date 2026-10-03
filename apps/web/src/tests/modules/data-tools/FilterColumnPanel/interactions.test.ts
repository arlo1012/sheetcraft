import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SheetFilterCondition } from "@idea10/core/workbook";
import FilterColumnPanel from "../../../../modules/data-tools/components/FilterColumnPanel.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.innerHTML = "";
});
function panel(criteria?: SheetFilterCondition) {
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
      colors: { cellColors: [null, "#ff0000"], fontColors: ["#008000", "#000000"] },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrapper = result;
  return result;
}
function button(text: string) {
  return new DOMWrapper(document.body)
    .findAll("button")
    .find((item) => item.text().trim() === text)!;
}
async function choose(action: string) {
  await new DOMWrapper(document.body).get('[aria-label="Number filters"]').trigger("click");
  const item = new DOMWrapper(document.body).get(`[data-filter-condition-action="${action}"]`);
  await item.trigger("pointerdown");
  await item.trigger("click");
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
      { includedKeys: [{ kind: "string", value: "North Alpha" }], allowMergedCells: true },
    ]);
    await search.setValue("");
    await apply().trigger("click");
    expect(w.emitted<{ includedKeys: unknown[] }[]>("apply")![1]![0]!.includedKeys).toHaveLength(3);
  });
  test("opens the custom dialog with the existing condition and applies freely typed numeric input", async () => {
    const w = panel({ kind: "number", operator: "equals", value: 2 });
    await choose("custom");
    const value = new DOMWrapper(document.body).get('[aria-label="First condition value"] input');
    expect((value.element as HTMLInputElement).value).toBe("2");
    expect(new DOMWrapper(document.body).find(".filter-column-panel").exists()).toBe(false);
    expect(w.emitted("close")).toBeUndefined();
    await value.setValue("12");
    await button("OK").trigger("click");
    expect(w.emitted("apply")?.[0]).toEqual([
      {
        includedKeys: [],
        criteria: { kind: "number", operator: "equals", value: 12 },
        allowMergedCells: true,
      },
    ]);
    await w.setProps({ criteria: { kind: "number", operator: "equals", value: 12 } });
    await choose("custom");
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="First condition value"] input')
        ?.value,
    ).toBe("12");
  });
  test("dialog cancellation returns to the same panel draft and disabled controls cannot apply", async () => {
    const w = panel({ kind: "number", operator: "equals", value: 2 });
    await new DOMWrapper(document.body)
      .get('input[placeholder="Match all keywords, separated by spaces"]')
      .setValue("North");
    await choose("custom");
    await new DOMWrapper(document.body)
      .get('[aria-label="First condition value"] input')
      .setValue("9");
    await button("Cancel").trigger("click");
    expect(w.emitted("close")).toBeUndefined();
    expect(w.emitted("apply")).toBeUndefined();
    expect(
      document.body.querySelector<HTMLInputElement>(
        'input[placeholder="Match all keywords, separated by spaces"]',
      )?.value,
    ).toBe("North");
    await choose("custom");
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="First condition value"] input')
        ?.value,
    ).toBe("2");
    await w.setProps({ disabled: true });
    expect(
      document.body.querySelector<HTMLInputElement>('[aria-label="First condition value"] input')
        ?.disabled,
    ).toBe(true);
    expect(w.findAllComponents(TSelect).every((select) => select.props("disabled"))).toBe(true);
    expect(
      w
        .findAllComponents(TButton)
        .find((button) => button.text() === "OK")!
        .props("disabled"),
    ).toBe(true);
  });
  test("color choices remain a draft until Apply and include no fill and font colors", async () => {
    const w = panel();
    await new DOMWrapper(document.body)
      .findAll(".t-tabs__nav-item")
      .find((item) => item.text().trim() === "By color")!
      .trigger("click");
    expect(button("Apply").attributes("disabled")).toBeDefined();
    await new DOMWrapper(document.body)
      .get('[aria-label="Filter by background color No fill"]')
      .trigger("click");
    expect(w.emitted("apply")).toBeUndefined();
    expect(
      new DOMWrapper(document.body)
        .get('[aria-label="Filter by background color No fill"]')
        .attributes("aria-pressed"),
    ).toBe("true");
    await button("Apply").trigger("click");
    expect(w.emitted("apply")?.[0]).toEqual([
      {
        includedKeys: [],
        criteria: { kind: "color", target: "fill", color: null },
        allowMergedCells: true,
      },
    ]);
    await new DOMWrapper(document.body)
      .get('[aria-label="Filter by font color #008000"]')
      .trigger("click");
    await button("Apply").trigger("click");
    expect(w.emitted("apply")?.[1]).toEqual([
      {
        includedKeys: [],
        criteria: { kind: "color", target: "text", color: "#008000" },
        allowMergedCells: true,
      },
    ]);
    await button("Cancel").trigger("click");
    expect(w.emitted("close")).toHaveLength(1);
  });
  test("condition-menu Escape leaves the panel open and average/clear actions use the canonical criteria", async () => {
    const w = panel({ kind: "number", operator: "equals", value: 2 });
    await new DOMWrapper(document.body).get('[aria-label="Number filters"]').trigger("click");
    await new DOMWrapper(document.body)
      .get(".filter-condition-menu")
      .trigger("keydown", { key: "Escape" });
    expect(w.emitted("close")).toBeUndefined();
    expect(new DOMWrapper(document.body).find(".filter-condition-menu").exists()).toBe(false);
    await choose("aboveAverage");
    expect(w.emitted("apply")?.[0]).toEqual([
      { includedKeys: [], criteria: { kind: "average", above: true }, allowMergedCells: true },
    ]);
    await new DOMWrapper(document.body).get('[aria-label="Clear filter"]').trigger("click");
    expect(w.emitted("clear")).toHaveLength(1);
  });
  test("unchanged numeric criteria are preserved and edited content replaces them", async () => {
    const w = panel({ kind: "number", operator: "equals", value: 2 });
    await button("Apply").trigger("click");
    expect(w.emitted("apply")?.[0]).toEqual([
      {
        includedKeys: [],
        criteria: { kind: "number", operator: "equals", value: 2 },
        allowMergedCells: true,
      },
    ]);
    await new DOMWrapper(document.body)
      .get('input[placeholder="Match all keywords, separated by spaces"]')
      .setValue("south");
    await button("Apply").trigger("click");
    expect(w.emitted("apply")?.[1]).toEqual([
      { includedKeys: [{ kind: "string", value: "South Alpha" }], allowMergedCells: true },
    ]);
  });
});
