import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { DEFAULT_COLUMN_WIDTH, getColumnWidth } from "@idea10/core/workbook";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";

function dispatchMouse(type: string, options: MouseEventInit): void {
  window.dispatchEvent(new MouseEvent(type, options));
}

function createPointerEvent(
  type: "pointermove" | "pointerup",
  options: MouseEventInit & { pointerId?: number },
): PointerEvent {
  const event = new MouseEvent(type, options) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: options.pointerId ?? 1 });
  return event;
}

function dispatchPointer(
  type: "pointermove" | "pointerup",
  options: MouseEventInit & { pointerId?: number },
): void {
  window.dispatchEvent(createPointerEvent(type, options));
}

describe("SheetGrid view controls", () => {
  test.each([400, 200, 75, 50, 25, 10])(
    "maps a drag selection to the same logical range at %i%% zoom",
    async (zoom) => {
      const { session, wrapper } = mountSheetGrid();
      await wrapper.setProps({ zoom });

      await triggerCell(wrapper, { row: 0, column: 0 }, "mousedown", {
        button: 0,
        buttons: 1,
        clientX: 10 * (zoom / 100),
        clientY: 10 * (zoom / 100),
      });
      dispatchMouse("mousemove", {
        buttons: 1,
        clientX: (DEFAULT_COLUMN_WIDTH * 2 + 10) * (zoom / 100),
        clientY: (24 * 2 + 10) * (zoom / 100),
      });
      dispatchMouse("mouseup", { button: 0 });
      await nextTick();

      expect(activeCell(wrapper)).toBe("A1");
      expect(wrapper.get("[data-selection-range]").attributes("style")).toContain("width: 288px");
      expect(wrapper.get("[data-selection-range]").attributes("style")).toContain("height: 72px");
      expect(session.history.undoStack).toHaveLength(0);
    },
  );

  test("converts a physical resize delta through the zoom scale before committing", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    await wrapper.setProps({ zoom: 200 });

    await wrapper.get('[data-resize-column="0"]').trigger("pointerdown", {
      button: 0,
      pointerId: 1,
      clientX: DEFAULT_COLUMN_WIDTH * 2,
    });
    dispatchPointer("pointermove", {
      buttons: 1,
      pointerId: 1,
      clientX: DEFAULT_COLUMN_WIDTH * 2 + 40,
    });
    dispatchPointer("pointerup", {
      pointerId: 1,
      clientX: DEFAULT_COLUMN_WIDTH * 2 + 40,
    });
    await nextTick();

    expect(getColumnWidth(sheet, 0)).toBe(DEFAULT_COLUMN_WIDTH + 20);
    expect(session.history.undoStack).toHaveLength(1);
  });

  test("renders reading bands for the active merged cell across frozen pane boundaries", async () => {
    const { session, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.freezePanes = { rows: 1, columns: 1 };
        sheet.mergedCells = [{ start: { row: 0, column: 0 }, end: { row: 1, column: 1 } }];
      },
    });
    await wrapper.setProps({ highlightEnabled: true, highlightColor: "#7a3cff" });
    await nextTick();

    const bands = wrapper.findAll<HTMLElement>(".sheet-reading-highlight__band");
    expect(bands.length).toBeGreaterThan(2);
    expect(wrapper.get(".sheet-reading-highlight").attributes("style")).toContain("color: #7a3cff");
    expect(activeCell(wrapper)).toBe("A1");
    const mergedBandStyles = bands.map((band) => band.attributes("style"));

    await triggerCell(wrapper, { row: 2, column: 2 }, "mousedown", { button: 0 });
    await nextTick();
    expect(activeCell(wrapper)).toBe("C3");
    const movedBands = wrapper.findAll(".sheet-reading-highlight__band");
    expect(movedBands).toHaveLength(4);
    expect(movedBands.map((band) => band.attributes("style"))).not.toEqual(mergedBandStyles);
    expect(session.history.undoStack).toHaveLength(0);
  });

  test("highlights every row and column in a cell range", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.setProps({ highlightEnabled: true });

    await triggerCell(wrapper, { row: 0, column: 0 }, "mousedown", {
      button: 0,
      buttons: 1,
      clientX: 10,
      clientY: 10,
    });
    dispatchMouse("mousemove", {
      buttons: 1,
      clientX: DEFAULT_COLUMN_WIDTH * 2 + 10,
      clientY: 24 * 2 + 10,
    });
    dispatchMouse("mouseup", { button: 0 });
    await nextTick();

    const bandStyles = wrapper
      .findAll<HTMLElement>(".sheet-reading-highlight__band")
      .map((band) => band.attributes("style"));
    expect(bandStyles).toEqual(
      expect.arrayContaining([
        expect.stringContaining("width: 960px; height: 72px"),
        expect.stringContaining("width: 288px; height: 600px"),
      ]),
    );
    expect(bandStyles).toHaveLength(2);
  });

  test("keeps whole-row and whole-column highlights on their selected axes", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.setProps({ highlightEnabled: true });

    await wrapper.get('[data-select-row="2"]').trigger("mousedown", { button: 0 });
    await wrapper.get('[data-select-row="4"]').trigger("mousedown", { button: 0, shiftKey: true });
    await nextTick();
    const rowBands = wrapper.findAll<HTMLElement>(".sheet-reading-highlight__band");
    expect(rowBands).toHaveLength(1);
    expect(rowBands[0]?.attributes("style")).toContain("height: 72px");
    expect(rowBands[0]?.attributes("style")).toContain("width: 960px");

    await wrapper.get('[data-select-column="2"]').trigger("mousedown", { button: 0 });
    await wrapper.get('[data-select-column="4"]').trigger("mousedown", {
      button: 0,
      shiftKey: true,
    });
    await nextTick();
    const columnBands = wrapper.findAll<HTMLElement>(".sheet-reading-highlight__band");
    expect(columnBands).toHaveLength(1);
    expect(columnBands[0]?.attributes("style")).toContain("height: 600px");
    expect(columnBands[0]?.attributes("style")).toContain("width: 288px");
  });
});
