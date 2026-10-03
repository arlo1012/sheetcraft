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
function panel(criteria?: SheetFilterCondition) {
  const values = [{ key: { kind: "number" as const, value: 1 }, label: "1", count: 3 }];
  wrapper = mount(FilterColumnPanel, {
    attachTo: document.body,
    props: {
      visible: true,
      columnLabel: "Color (A)",
      values,
      appliedKeys: values.map((option) => option.key),
      preferredKind: "number",
      hasCriteria: Boolean(criteria),
      canSort: true,
      criteria,
      colors: { cellColors: [null, "#ff0000", "#0000ff"], fontColors: ["#000000", "#ff0000"] },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}
const body = () => new DOMWrapper(document.body);
const color = (target: "background" | "font", value: string) =>
  body().get(`[aria-label="Filter by ${target} color ${value}"]`);
const button = (text: string) =>
  body()
    .findAll("button")
    .find((item) => item.text().trim() === text)!;
async function tab(text: string) {
  await body()
    .findAll(".t-tabs__nav-item")
    .find((item) => item.text().trim() === text)!
    .trigger("click");
}

describe("filter color multi-selection", () => {
  test("selects multiple fills including no fill and applies only on confirmation", async () => {
    const w = panel();
    await tab("By color");
    await color("background", "No fill").trigger("click");
    await color("background", "#FF0000").trigger("click");
    expect(color("background", "No fill").attributes("aria-pressed")).toBe("true");
    expect(color("background", "#FF0000").attributes("aria-pressed")).toBe("true");
    expect(body().findAll(".filter-color-options__check")).toHaveLength(2);
    expect(body().find(".filter-column-panel__criteria").exists()).toBe(false);
    expect(w.emitted("apply")).toBeUndefined();
    await button("Apply").trigger("click");
    expect(w.emitted("apply")?.[0]?.[0]).toMatchObject({
      includedKeys: [],
      criteria: { kind: "color-set", target: "fill", colors: [null, "#ff0000"] },
    });
  });

  test("toggles font colors, switches filter target, and disables Apply after deselecting all", async () => {
    const w = panel({ kind: "color", target: "fill", color: null });
    await color("font", "#000000").trigger("click");
    await color("font", "#FF0000").trigger("click");
    expect(color("background", "No fill").attributes("aria-pressed")).toBe("false");
    await button("Apply").trigger("click");
    expect(w.emitted("apply")?.[0]?.[0]).toMatchObject({
      criteria: { kind: "color-set", target: "text", colors: ["#000000", "#ff0000"] },
    });
    await color("font", "#000000").trigger("click");
    await button("Apply").trigger("click");
    expect(w.emitted("apply")?.[1]?.[0]).toMatchObject({
      criteria: { kind: "color", target: "text", color: "#ff0000" },
    });
    await color("font", "#FF0000").trigger("click");
    expect(button("Apply").attributes("disabled")).toBeDefined();
  });

  test("restores applied multi-selection after cancelling and keeps content filtering separate", async () => {
    const criteria: SheetFilterCondition = {
      kind: "color-set",
      target: "fill",
      colors: [null, "#ff0000"],
    };
    const w = panel(criteria);
    expect(color("background", "No fill").attributes("aria-pressed")).toBe("true");
    await color("background", "No fill").trigger("click");
    await color("background", "#0000FF").trigger("click");
    await button("Cancel").trigger("click");
    expect(w.emitted("apply")).toBeUndefined();
    expect(criteria.colors).toEqual([null, "#ff0000"]);
    await w.setProps({ visible: false });
    await w.setProps({ visible: true });
    expect(color("background", "No fill").attributes("aria-pressed")).toBe("true");
    expect(color("background", "#0000FF").attributes("aria-pressed")).toBe("false");
    await tab("By content");
    await button("Apply").trigger("click");
    expect(w.emitted("apply")?.[0]?.[0]).toMatchObject({
      includedKeys: [{ kind: "number", value: 1 }],
    });
    expect(w.emitted("apply")?.[0]?.[0]).not.toHaveProperty("criteria");
  });
});
