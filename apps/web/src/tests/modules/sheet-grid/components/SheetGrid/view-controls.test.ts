import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { DEFAULT_COLUMN_WIDTH, getColumnWidth } from "@sheetcraft/core/workbook";
import {
  activeCell,
  mountSheetGrid,
  triggerAxisHeader,
  triggerAxisResize,
  triggerCell,
} from "./fixture";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";

function dispatchMouse(type: string, options: MouseEventInit): void {
  const event = new MouseEvent(
    type === "mousemove" ? "pointermove" : "pointerup",
    options,
  ) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: 1 });
  window.dispatchEvent(event);
}

function overlays(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]) {
  return wrapper.getComponent(SheetSurface).props("overlays");
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
      expect(overlays(wrapper).rangeRects![0]!.rect).toMatchObject({ width: 288, height: 72 });
      expect(session.history.undoStack).toHaveLength(0);
    },
  );

  test("converts a physical resize delta through the zoom scale before committing", async () => {
    const { session, sheet, wrapper } = mountSheetGrid();
    await wrapper.setProps({ zoom: 200 });

    const surface = wrapper.getComponent(SheetSurface);
    const frame = surface.props("frame") as {
      scale: number;
      columnHeaders: readonly {
        items: readonly { index: number; offset: number; size: number }[];
      }[];
    };
    const column = frame.columnHeaders
      .flatMap((pane) => pane.items)
      .find((item) => item.index === 0)!;
    const bounds = surface
      .get<HTMLCanvasElement>("[data-sheet-surface]")
      .element.getBoundingClientRect();
    const start = bounds.left + (column.offset + column.size - 1) * frame.scale;
    await triggerAxisResize(wrapper, "column", 0, { button: 0, pointerId: 1 });
    dispatchPointer("pointermove", {
      buttons: 1,
      pointerId: 1,
      clientX: start + 40,
    });
    dispatchPointer("pointerup", {
      pointerId: 1,
      clientX: start + 40,
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

    const bands = overlays(wrapper).readingRects;
    expect(bands?.length).toBeGreaterThan(2);
    expect(overlays(wrapper).readingColor).toBe("#7a3cff");
    expect(activeCell(wrapper)).toBe("A1");
    const mergedBands = bands!.map((band) => band.rect);

    await triggerCell(wrapper, { row: 2, column: 2 }, "mousedown", { button: 0 });
    await nextTick();
    expect(activeCell(wrapper)).toBe("C3");
    const movedBands = overlays(wrapper).readingRects;
    expect(movedBands).toHaveLength(4);
    expect(movedBands!.map((band) => band.rect)).not.toEqual(mergedBands);
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

    const bands = overlays(wrapper).readingRects;
    expect(bands!.map((band: { rect: object }) => band.rect)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ width: 960, height: 72 }),
        expect.objectContaining({ width: 288, height: 600 }),
      ]),
    );
    expect(bands).toHaveLength(2);
  });

  test("keeps whole-row and whole-column highlights on their selected axes", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.setProps({ highlightEnabled: true });

    await triggerAxisHeader(wrapper, "row", 2);
    await triggerAxisHeader(wrapper, "row", 4, "pointerdown", { shiftKey: true });
    await nextTick();
    const rowBands = overlays(wrapper).readingRects;
    expect(rowBands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rect: expect.objectContaining({ height: 72, width: 960 }) }),
      ]),
    );

    await triggerAxisHeader(wrapper, "column", 2);
    await triggerAxisHeader(wrapper, "column", 4, "pointerdown", { shiftKey: true });
    await nextTick();
    const columnBands = overlays(wrapper).readingRects;
    expect(columnBands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rect: expect.objectContaining({ height: 600, width: 288 }) }),
      ]),
    );
  });
});
