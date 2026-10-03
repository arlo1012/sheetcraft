import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import type { SheetFilterCondition } from "@idea10/core/workbook";
import FilterColumnPanel from "../../../../modules/data-tools/components/FilterColumnPanel.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
  localStorage.clear();
});
const labels = ["North America", "America North", "South America", "北京 North"];
function panel(criteria?: SheetFilterCondition) {
  const values = labels.map((label) => ({
    key: { kind: "string" as const, value: label },
    label,
    count: 1,
  }));
  wrapper = mount(FilterColumnPanel, {
    attachTo: document.body,
    props: {
      visible: true,
      columnLabel: "Region (A)",
      values,
      appliedKeys: values.map((option) => option.key),
      preferredKind: "text",
      hasCriteria: Boolean(criteria),
      canSort: true,
      criteria,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}
const body = () => new DOMWrapper(document.body);
const search = () => body().get('input[type="search"]');
const options = () => body().get('button[aria-label="Search options"]');
const visible = () =>
  body()
    .findAll(".filter-value-list__label")
    .map((node) => node.text());
async function choose(text: string) {
  await options().trigger("click");
  const item = body()
    .get(".filter-search-menu")
    .findAll('[role="menuitemradio"]')
    .find((node) => node.text() === text)!;
  await item.trigger("pointerdown");
  await item.trigger("click");
}
async function apply() {
  await body()
    .findAll("button")
    .find((node) => node.text() === "Apply")!
    .trigger("click");
}

describe("filter search options", () => {
  test("switches all/any/phrase matching and applies the same values displayed in the list", async () => {
    const w = panel();
    await search().setValue("north america");
    expect(visible()).toEqual(["America North", "North America"]);
    await choose("Search for any keyword");
    expect(visible()).toHaveLength(4);
    expect(search().attributes("placeholder")).toBe("Match any keyword, separated by spaces");
    expect(w.emitted("close")).toBeUndefined();
    await apply();
    expect(w.emitted("apply")?.[0]?.[0]).toMatchObject({
      includedKeys: labels.map((value) => ({ kind: "string", value })),
    });
    await choose("Search for the entire string");
    expect(visible()).toEqual(["North America"]);
    await apply();
    expect(w.emitted("apply")?.[1]?.[0]).toMatchObject({
      includedKeys: [{ kind: "string", value: "North America" }],
    });
  });

  test("toggles pinyin matching, keeps menu choices checked, and closes only the menu on Escape", async () => {
    const w = panel();
    await search().setValue("bj");
    expect(visible()).toEqual(["北京 North"]);
    await choose("Disable pinyin search");
    expect(visible()).toEqual([]);
    await options().trigger("click");
    const rows = body().get(".filter-search-menu").findAll('[role="menuitemradio"]');
    expect(rows.map((row) => row.attributes("aria-checked"))).toEqual([
      "true",
      "false",
      "false",
      "false",
      "true",
    ]);
    await body().get(".filter-search-menu").trigger("keydown", { key: "Escape" });
    expect(body().find(".filter-search-menu").exists()).toBe(false);
    expect(w.emitted("close")).toBeUndefined();
    await choose("Enable pinyin search");
    expect(visible()).toEqual(["北京 North"]);
    await apply();
    expect(w.emitted("apply")?.[0]?.[0]).toMatchObject({
      includedKeys: [{ kind: "string", value: "北京 North" }],
    });
  });

  test("changing a search preference without a query preserves the applied condition", async () => {
    const criteria: SheetFilterCondition = { kind: "text", operator: "contains", value: "North" };
    const w = panel(criteria);
    await choose("Search for any keyword");
    await apply();
    expect(w.emitted("apply")?.[0]?.[0]).toMatchObject({ criteria });
  });
});
