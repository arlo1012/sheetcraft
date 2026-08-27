import { describe, expect, test } from "vitest";
import { activeCell, mountSheetGrid } from "./fixture";

describe("SheetGrid viewport", () => {
  test("renders only the viewport and overscan cells while scrolling", async () => {
    const { wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");

    expect(wrapper.findAll(".sheet-cell-layer__cell").length).toBeLessThan(1_000);
    (scroller.element as HTMLDivElement).scrollTop = 1_200;
    (scroller.element as HTMLDivElement).scrollLeft = 800;
    await scroller.trigger("scroll");

    expect(wrapper.find('[data-row="48"][data-column="8"]').exists()).toBe(true);
    expect(wrapper.get('[data-row="50"][data-column="8"]').element.parentElement?.style.top).toBe(
      "0px",
    );
    expect(wrapper.get('[data-row="50"][data-column="8"]').attributes("style")).toContain(
      "left: -32px",
    );
    expect(wrapper.findAll(".sheet-cell-layer__cell").length).toBeLessThan(1_000);
  });

  test("expands the allocated extent when scrolling reaches its tail", async () => {
    const { wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 1_800;
    (scroller.element as HTMLDivElement).scrollLeft = 3_840;
    await scroller.trigger("scroll");

    expect(scroller.attributes("aria-rowcount")).toBe("125");
    expect(scroller.attributes("aria-colcount")).toBe("60");
    expect((scroller.element as HTMLDivElement).scrollTop).toBe(1_800);
    expect((scroller.element as HTMLDivElement).scrollLeft).toBe(3_840);
  });

  test("expands before keyboard navigation crosses an allocated edge", async () => {
    const { session, wrapper } = mountSheetGrid({
      initialRowCount: 30,
      initialColumnCount: 12,
      rowExpansionStep: 5,
      columnExpansionStep: 4,
      rowExpansionTail: 0,
      columnExpansionTail: 0,
    });
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 120;
    (scroller.element as HTMLDivElement).scrollLeft = 192;
    await scroller.trigger("scroll");
    await wrapper.get('[data-row="29"][data-column="11"]').trigger("mousedown", { button: 0 });

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "Enter" });
    await wrapper.get("input.cell-editor").trigger("keydown", { key: "Tab" });

    expect(activeCell(wrapper)).toBe("M31");
    expect(scroller.attributes("aria-rowcount")).toBe("35");
    expect(scroller.attributes("aria-colcount")).toBe("16");
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("brings an offscreen active cell back into view on keyboard navigation", async () => {
    const { wrapper } = mountSheetGrid();
    const scroller = wrapper.get(".sheet-grid__scroller");
    (scroller.element as HTMLDivElement).scrollTop = 1_200;
    await scroller.trigger("scroll");

    await wrapper.get("input.cell-editor").trigger("keydown", { key: "ArrowDown" });

    expect(activeCell(wrapper)).toBe("A2");
    expect((scroller.element as HTMLDivElement).scrollTop).toBe(24);
  });
});
