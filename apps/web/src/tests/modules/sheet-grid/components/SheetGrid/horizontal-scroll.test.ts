import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid external horizontal scrolling", () => {
  test("reports native scrolling, preserves vertical position and selection for external scrolling", async () => {
    const { wrapper, session } = mountSheetGrid();
    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    scroller.element.scrollTop = 240;
    scroller.element.scrollLeft = 192;
    await scroller.trigger("scroll");
    expect(wrapper.emitted("horizontalScrollChange")?.at(-1)?.[0]).toMatchObject({
      position: 192,
      viewportSize: 960,
      contentSize: 4800,
    });
    wrapper.vm.scrollHorizontally(600);
    await nextTick();
    expect(scroller.element.scrollLeft).toBe(600);
    expect(scroller.element.scrollTop).toBe(240);
    expect(wrapper.emitted("viewStateChange")?.at(-1)?.[0]).toMatchObject({
      scrollPosition: { x: 600, y: 240 },
      selection: { active: { row: 0, column: 0 } },
    });
    expect(session.history.undoStack).toHaveLength(0);
    wrapper.unmount();
  });

  test("reports the unfrozen body's range and keeps frozen columns stationary", async () => {
    const { wrapper, sheet } = mountSheetGrid();
    sheet.freezePanes = { rows: 2, columns: 2 };
    await nextTick();
    wrapper.vm.scrollHorizontally(500);
    await nextTick();
    expect(wrapper.emitted("horizontalScrollChange")?.at(-1)?.[0]).toEqual({
      position: 500,
      viewportSize: 768,
      contentSize: 4608,
    });
    expect(
      wrapper
        .get('.sheet-column-headers [data-header-pane="frozen"] [data-column="0"]')
        .attributes("style"),
    ).toContain("left: 0px");
    expect(wrapper.find('[data-row="2"][data-column="7"]').exists()).toBe(true);
    wrapper.unmount();
  });

  test("handles horizontal, diagonal and Shift wheel input without hijacking zoom", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.setProps({ externalHorizontalScrollbar: true });
    const scroller = wrapper.get<HTMLDivElement>(".sheet-grid__scroller");
    await scroller.trigger("wheel", { deltaX: 100, deltaY: 60 });
    expect(scroller.element.scrollLeft).toBe(100);
    expect(scroller.element.scrollTop).toBe(60);
    await scroller.trigger("wheel", { deltaY: 5, deltaMode: 1, shiftKey: true });
    expect(scroller.element.scrollLeft).toBe(180);
    expect(scroller.element.scrollTop).toBe(60);
    await scroller.trigger("wheel", { deltaX: 100, ctrlKey: true });
    expect(scroller.element.scrollLeft).toBe(180);
    wrapper.vm.scrollHorizontally(-100);
    await nextTick();
    expect(scroller.element.scrollLeft).toBe(0);
    wrapper.unmount();
  });
});
