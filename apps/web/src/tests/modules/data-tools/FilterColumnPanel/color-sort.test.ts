import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import FilterColumnPanel from "../../../../modules/data-tools/components/FilterColumnPanel.vue";
import { createAppI18n } from "../../../../shared/i18n";

let wrapper: ReturnType<typeof mount> | undefined;
afterEach(() => {
  wrapper?.unmount();
  document.body.replaceChildren();
});
function panel() {
  wrapper = mount(FilterColumnPanel, {
    attachTo: document.body,
    props: {
      visible: true,
      columnLabel: "Color (A)",
      values: [],
      appliedKeys: [],
      preferredKind: "number",
      hasCriteria: false,
      canSort: true,
      colors: { cellColors: [null, "#ff0000"], fontColors: ["#008000"] },
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  return wrapper;
}
const body = () => new DOMWrapper(document.body);
const trigger = () => body().get('button[aria-label="Sort by color"]');

describe("filter color sort menu", () => {
  test("opens color choices without a dialog, and sends the chosen color directly", async () => {
    const w = panel();
    await trigger().trigger("click");
    expect(w.emitted("openSort")).toBeUndefined();
    expect(body().find(".filter-color-sort-menu").exists()).toBe(true);
    const red = body().get('[aria-label="Sort by cell color #FF0000"]');
    await red.trigger("pointerdown");
    (red.element as HTMLElement).focus();
    await red.trigger("click");
    expect(w.emitted("sortColor")?.[0]).toEqual([{ sortOn: "cellColor", color: "#ff0000" }]);
    expect(w.emitted("close")).toBeUndefined();
    expect(body().find(".filter-color-sort-menu").exists()).toBe(false);
    await trigger().trigger("click");
    await body().get('[aria-label="Sort by cell color No fill"]').trigger("click");
    await trigger().trigger("click");
    await body().get('[aria-label="Sort by font color #008000"]').trigger("click");
    expect(w.emitted("sortColor")?.slice(1)).toEqual([
      [{ sortOn: "cellColor", color: null }],
      [{ sortOn: "fontColor", color: "#008000" }],
    ]);
    expect(w.emitted("openSort")).toBeUndefined();
  });

  test("only Custom sort requests the dialog; Escape closes only the submenu", async () => {
    const w = panel();
    await trigger().trigger("click");
    await body().get(".filter-color-sort-menu").trigger("keydown", { key: "Escape" });
    expect(w.emitted("close")).toBeUndefined();
    expect(body().find(".filter-color-sort-menu").exists()).toBe(false);
    await trigger().trigger("click");
    const custom = body()
      .get(".filter-color-sort-menu")
      .findAll('[role="menuitem"]')
      .find((item) => item.text() === "Custom sort")!;
    await custom.trigger("keydown", { key: "Enter" });
    expect(w.emitted("openSort")).toEqual([[]]);
    expect(w.emitted("sortColor")).toBeUndefined();
    expect(body().find(".filter-color-sort-menu").exists()).toBe(false);
    await w.setProps({ canSort: false });
    expect(trigger().attributes("disabled")).toBeDefined();
  });
});
