import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import WorkbookSheetTabs from "../../../../../modules/workbook/components/WorkbookSheetTabs.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => wrappers.splice(0).forEach((wrapper) => wrapper.unmount()));
function fixture() {
  const sheets = ["First", "Hidden", "Pinned", "Last"].map((name) => createSheet(name, name));
  sheets[1]!.properties.hidden = true;
  sheets[2]!.properties.pinned = true;
  sheets[0]!.properties.tabColor = "#FF0000";
  const wrapper = mount(WorkbookSheetTabs, {
    attachTo: document.body,
    props: { sheets, activeSheetId: "First" },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return { wrapper, sheets };
}

describe("sheet property navigation", () => {
  test("groups pinned tabs, skips hidden tabs in keyboard navigation, and maps moves to workbook indexes", async () => {
    const { wrapper } = fixture();
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual([
      "Pinned",
      "First",
      "Last",
    ]);
    const first = wrapper.get('[title="First (double-click to rename)"]');
    await first.trigger("keydown", { key: "ArrowLeft" });
    expect(wrapper.emitted("select")).toEqual([["Pinned"]]);
    await first.trigger("keydown", { key: "ArrowRight", altKey: true, shiftKey: true });
    expect(wrapper.emitted("move")).toEqual([[{ sheetId: "First", toIndex: 3 }]]);
    await first.trigger("keydown", { key: "ArrowLeft", altKey: true, shiftKey: true });
    expect(wrapper.emitted("move")).toHaveLength(1);
    expect(first.element.parentElement?.style.getPropertyValue("--sheet-tab-color")).toBe(
      "#FF0000",
    );
  });

  test("hides targeted tabs through a command event and restores them from the all-sheets list", async () => {
    const { wrapper } = fixture();
    await wrapper
      .get('[role="tab"][title="First (double-click to rename)"]')
      .trigger("contextmenu");
    await new DOMWrapper(document.body).get('[data-sheet-tab-action="hide"]').trigger("click");
    expect(wrapper.emitted("updateProperties")).toEqual([
      [{ sheetId: "First", patch: { hidden: true } }],
    ]);
    await wrapper.get('[aria-label="All sheets"]').trigger("click");
    const body = new DOMWrapper(document.body);
    expect(body.get('[data-workbook-hidden-sheet-id="Hidden"]').text()).toContain("Unhide");
    await body.get('[data-workbook-hidden-sheet-id="Hidden"]').trigger("click");
    expect(wrapper.emitted("restore")).toEqual([["Hidden"]]);
  });

  test("does not allow hiding or deleting the last visible sheet even with hidden sheets present", async () => {
    const { wrapper, sheets } = fixture();
    sheets[2]!.properties.hidden = true;
    sheets[3]!.properties.hidden = true;
    await wrapper.setProps({ sheets: [...sheets] });
    await wrapper
      .get('[role="tab"][title="First (double-click to rename)"]')
      .trigger("contextmenu");
    for (const action of ["hide", "delete"]) {
      const item = new DOMWrapper(document.body).get(`[data-sheet-tab-action="${action}"]`);
      expect(item.attributes("aria-disabled")).toBe("true");
      await item.trigger("click");
    }
    expect(wrapper.emitted("updateProperties")).toBeUndefined();
    expect(wrapper.emitted("delete")).toBeUndefined();
  });
});
