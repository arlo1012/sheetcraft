import { DOMWrapper, mount } from "@vue/test-utils";
import { afterEach, describe, expect, test } from "vitest";
import type { SheetRenderFrame } from "../../../../../modules/sheet-grid/rendering/sheet-render-frame";
import SheetCellErrorMenu from "../../../../../modules/sheet-grid/components/SheetCellErrorMenu.vue";
import { createAppI18n } from "../../../../../shared/i18n";

const wrappers: ReturnType<typeof mount>[] = [];

function createFrame(rect = { x: 3, y: 42, width: 90, height: 24 }) {
  return {
    body: { x: 40, y: 24, width: 800, height: 500 },
    panes: { body: { clip: { x: 0, y: 0, width: 800, height: 500 } } },
    layout: {
      getCellViewportRect: () => rect,
      getPaneForAddress: () => "body",
    },
  } as unknown as SheetRenderFrame;
}

function mountMenu(readOnly = false, frame = createFrame()) {
  const wrapper = mount(SheetCellErrorMenu, {
    attachTo: document.body,
    global: { plugins: [createAppI18n("en-US")] },
    props: { frame, activeCell: { row: 3, column: 1 }, visible: true, readOnly },
  });
  wrappers.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  document.body.replaceChildren();
});

describe("SheetCellErrorMenu", () => {
  test("anchors the warning button inside the body and exposes duplicate-error actions", async () => {
    const wrapper = mountMenu();
    const trigger = wrapper.get("[data-sheet-cell-error-trigger]");
    expect(trigger.attributes("style")).toContain("left: 40px");
    await trigger.trigger("click");

    const menu = new DOMWrapper(document.body).get(
      '[role="menu"][aria-label="Duplicate entry error"]',
    );
    expect(menu.text()).toContain("does not meet the configured duplicate-entry restriction");
    await menu.get('[data-sheet-cell-error-action="ignore-all"]').trigger("click");
    expect(wrapper.emitted("ignoreAll")).toEqual([[]]);
    expect(new DOMWrapper(document.body).find('[role="menu"]').exists()).toBe(false);
  });

  test("keeps formula-bar editing unavailable in a read-only worksheet", async () => {
    const wrapper = mountMenu(true);
    await wrapper.get("[data-sheet-cell-error-trigger]").trigger("click");
    const item = new DOMWrapper(document.body).get(
      '[data-sheet-cell-error-action="edit-formula-bar"]',
    );
    expect(item.attributes("aria-disabled")).toBe("true");
    await item.trigger("click");
    expect(wrapper.emitted("editFormulaBar")).toBeUndefined();
  });

  test("dismisses when the active cell changes", async () => {
    const wrapper = mountMenu();
    await wrapper.get("[data-sheet-cell-error-trigger]").trigger("click");
    await wrapper.setProps({ activeCell: { row: 4, column: 1 } });
    expect(new DOMWrapper(document.body).find('[role="menu"]').exists()).toBe(false);
  });

  test("hides and dismisses when the active cell scrolls outside its pane", async () => {
    const wrapper = mountMenu();
    await wrapper.get("[data-sheet-cell-error-trigger]").trigger("click");
    await wrapper.setProps({ frame: createFrame({ x: -120, y: 42, width: 90, height: 24 }) });
    expect(wrapper.find("[data-sheet-cell-error-trigger]").exists()).toBe(false);
    expect(new DOMWrapper(document.body).find('[role="menu"]').exists()).toBe(false);
  });
});
