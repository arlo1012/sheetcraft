import { DOMWrapper, mount } from "@vue/test-utils";
import { createSheet } from "@idea10/core/workbook";
import { afterEach, describe, expect, test } from "vitest";
import WorksheetOperationsMenu from "../../../../../modules/workbook/components/WorksheetOperationsMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

function sheet(name: string, id: string) {
  return createSheet(name, id);
}

function mountMenu(sheets = [sheet("Plan", "sheet-1"), sheet("Archive", "sheet-2")]) {
  const wrapper = mount(WorksheetOperationsMenu, {
    attachTo: document.body,
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: {
        ColorPalette: {
          name: "ColorPalette",
          emits: ["select"],
          template: `<button data-tab-color @click="$emit('select', '#a1b2c3')" />`,
        },
      },
    },
    props: { sheets, activeSheetId: "sheet-1" },
  });
  wrappers.push(wrapper);
  return wrapper;
}

function menu() {
  return new DOMWrapper(document.body).get(".worksheet-operations-menu");
}

async function openMenu(wrapper: ReturnType<typeof mountMenu>) {
  await wrapper.get('[data-ribbon-action="worksheet-operations"]').trigger("click");
  return menu();
}

describe("WorksheetOperationsMenu", () => {
  test("emits sheet operations and keeps pinned sheets inside their own move group", async () => {
    const first = sheet("Plan", "sheet-1");
    first.properties = { ...first.properties, pinned: true };
    const second = sheet("Archive", "sheet-2");
    const wrapper = mountMenu([first, second]);
    let surface = await openMenu(wrapper);
    await surface.get('[data-worksheet-action="add"]').trigger("click");
    expect(wrapper.emitted("add")).toEqual([[]]);

    surface = await openMenu(wrapper);
    expect(surface.get('[data-worksheet-action="move-right"]').attributes("aria-disabled")).toBe(
      "true",
    );
    await surface.get('[data-worksheet-action="duplicate"]').trigger("click");
    expect(wrapper.emitted("duplicate")).toEqual([["sheet-1"]]);

    surface = await openMenu(wrapper);
    await surface.get('[data-worksheet-action="protect"]').trigger("click");
    expect(wrapper.emitted("updateProperties")).toContainEqual([
      { sheetId: "sheet-1", patch: { protected: true } },
    ]);
  });

  test("disables hide and delete for the last visible sheet, while offering hidden sheets to restore", async () => {
    const active = sheet("Plan", "sheet-1");
    const hidden = sheet("Archive", "sheet-2");
    hidden.properties = { ...hidden.properties, hidden: true };
    const wrapper = mountMenu([active, hidden]);
    const surface = await openMenu(wrapper);
    expect(surface.get('[data-worksheet-action="hide"]').attributes("aria-disabled")).toBe("true");
    expect(surface.get('[data-worksheet-action="delete"]').attributes("aria-disabled")).toBe(
      "true",
    );
    await surface.get('[data-worksheet-action="restore"]').trigger("click");
    await new DOMWrapper(document.body).get('button[aria-label="Show Archive"]').trigger("click");
    expect(wrapper.emitted("restore")).toEqual([["sheet-2"]]);
  });

  test("opens rename with its input focused and returns focus to the trigger after confirmation", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get('[data-ribbon-action="worksheet-operations"]');
    const surface = await openMenu(wrapper);
    await surface.get('[data-worksheet-action="rename"]').trigger("click");
    const input = new DOMWrapper(document.body).get("[data-worksheet-rename-input] input");
    expect(document.activeElement).toBe(input.element);
    await input.setValue("Roadmap");
    await new DOMWrapper(document.body).get(".t-dialog__confirm").trigger("click");
    expect(wrapper.emitted("rename")).toEqual([[{ sheetId: "sheet-1", name: "Roadmap" }]]);
    expect(document.activeElement).toBe(trigger.element);
  });

  test("keeps the tab color chooser available after its parent menu closes and applies its value", async () => {
    const wrapper = mountMenu();
    const surface = await openMenu(wrapper);
    await surface.get('[data-worksheet-action="tab-color"]').trigger("click");
    expect(document.body.querySelector(".worksheet-operations-menu")).toBeNull();
    const panel = new DOMWrapper(document.body).get(".sheet-tab-color-panel");
    await panel.get("[data-tab-color]").trigger("click");
    expect(wrapper.emitted("updateProperties")).toContainEqual([
      { sheetId: "sheet-1", patch: { tabColor: "#A1B2C3" } },
    ]);
  });
});
