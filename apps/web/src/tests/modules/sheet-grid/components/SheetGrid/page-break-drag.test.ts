import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import {
  cloneSheetPageSetup,
  DEFAULT_SHEET_PAGE_SETUP,
  type SheetPageSetup,
} from "@idea10/core/page-setup";
import { createSetSheetPageSetupCommand } from "@idea10/core/commands";
import {
  executeWorkbookCommand,
  undoWorkbookCommand,
  redoWorkbookCommand,
} from "@idea10/core/history";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import type { PageViewPaintState } from "../../../../../modules/page-layout/page-view-types";
import { activeCell, getSheetRenderFrame, mountSheetGrid, triggerCell } from "./fixture";

type Grid = ReturnType<typeof mountSheetGrid>;

async function mountPreview(
  area = { start: { row: 0, column: 0 }, end: { row: 44, column: 7 } },
): Promise<Grid> {
  const grid = mountSheetGrid({
    beforeMount(sheet) {
      sheet.pageSetup = {
        ...cloneSheetPageSetup(DEFAULT_SHEET_PAGE_SETUP),
        scale: 200,
        printArea: area,
      };
    },
  });
  await grid.wrapper.setProps({ viewMode: "page-break-preview" });
  return grid;
}

function pageView(grid: Grid): PageViewPaintState {
  return grid.wrapper.getComponent(SheetSurface).props("pageView") as PageViewPaintState;
}
function screenPoint(grid: Grid, x: number, y: number) {
  const frame = getSheetRenderFrame(grid.wrapper);
  const bounds = grid.wrapper
    .get<HTMLCanvasElement>("[data-sheet-surface]")
    .element.getBoundingClientRect();
  return {
    clientX: bounds.left + (frame.body.x + x - frame.layout.bodyScrollPosition.x) * frame.scale,
    clientY: bounds.top + (frame.body.y + y - frame.layout.bodyScrollPosition.y) * frame.scale,
  };
}
async function surfacePointer(
  grid: Grid,
  type: "pointermove" | "pointerdown",
  x: number,
  y: number,
) {
  await grid.wrapper
    .get("[data-sheet-surface]")
    .trigger(type, { ...screenPoint(grid, x, y), button: 0, pointerId: 7 });
}
async function windowPointer(
  grid: Grid,
  type: "pointermove" | "pointerup" | "pointercancel",
  x: number,
  y: number,
) {
  const event = new MouseEvent(type, {
    ...screenPoint(grid, x, y),
    button: 0,
    buttons: type === "pointermove" ? 1 : 0,
  });
  Object.defineProperty(event, "pointerId", { value: 7 });
  window.dispatchEvent(event);
  await nextTick();
}

describe("SheetGrid page-break dragging", () => {
  test.each(["top-left", "top-right", "bottom-left", "bottom-right"] as const)(
    "%s corner previews both edges and submits one undoable update",
    async (corner) => {
      const area = { start: { row: 1, column: 1 }, end: { row: 9, column: 5 } };
      const grid = await mountPreview(area);
      try {
        await grid.wrapper.setProps({
          onPageSetupChange(setup: SheetPageSetup) {
            executeWorkbookCommand(
              grid.session,
              createSetSheetPageSetupCommand(grid.sheet.id, setup),
            );
          },
        });
        const original = { ...pageView(grid).printRect };
        const top = corner.startsWith("top");
        const left = corner.endsWith("left");
        const x = left ? original.x : original.x + original.width;
        const y = top ? original.y : original.y + original.height;
        const dx = left ? 96 : -96;
        const dy = top ? 24 : -24;
        await surfacePointer(grid, "pointermove", x, y);
        expect(
          grid.wrapper.get<HTMLCanvasElement>("[data-sheet-surface]").element.style.cursor,
        ).toBe(corner === "top-left" || corner === "bottom-right" ? "nwse-resize" : "nesw-resize");
        await surfacePointer(grid, "pointerdown", x, y);
        await windowPointer(grid, "pointermove", x + dx, y + dy);
        expect(pageView(grid).printRect.width).toBe(original.width - 96);
        expect(pageView(grid).printRect.height).toBe(original.height - 24);
        expect(pageView(grid).dragCorner).toEqual({ x: x + dx, y: y + dy });
        expect(grid.sheet.pageSetup?.printArea).toEqual(area);
        expect(grid.wrapper.emitted("pageSetupChange")).toBeUndefined();

        await windowPointer(grid, "pointerup", x + dx, y + dy);
        expect(grid.wrapper.emitted("pageSetupChange")).toHaveLength(1);
        expect(grid.session.history.undoStack).toHaveLength(1);
        expect(grid.sheet.pageSetup?.printArea).toEqual({
          start: { row: top ? 2 : 1, column: left ? 2 : 1 },
          end: { row: top ? 9 : 8, column: left ? 5 : 4 },
        });
        expect(pageView(grid).dragCorner).toBeUndefined();
        undoWorkbookCommand(grid.session);
        await nextTick();
        expect(grid.sheet.pageSetup?.printArea).toEqual(area);
        expect(pageView(grid).printRect).toEqual(original);

        await surfacePointer(grid, "pointerdown", x, y);
        await windowPointer(grid, "pointermove", x + dx, y + dy);
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        await nextTick();
        await windowPointer(grid, "pointerup", x + dx, y + dy);
        expect(pageView(grid).printRect).toEqual(original);
        expect(pageView(grid).dragCorner).toBeUndefined();
        expect(grid.wrapper.emitted("pageSetupChange")).toHaveLength(1);
        expect(grid.session.history.undoStack).toHaveLength(0);
      } finally {
        grid.wrapper.unmount();
      }
    },
  );

  test("shows adjustment cursors on all print-area sides at a changed zoom, including the gray side", async () => {
    const grid = await mountPreview({ start: { row: 1, column: 1 }, end: { row: 7, column: 4 } });
    try {
      await grid.wrapper.setProps({ zoom: 150 });
      const area = pageView(grid).printRect;
      const canvas = grid.wrapper.get<HTMLCanvasElement>("[data-sheet-surface]");
      for (const [x, y, cursor] of [
        [area.x, area.y + 30, "col-resize"],
        [area.x + area.width + 2, area.y + 30, "col-resize"],
        [area.x + 30, area.y, "row-resize"],
        [area.x + 30, area.y + area.height + 2, "row-resize"],
      ] as const) {
        await surfacePointer(grid, "pointermove", x, y);
        expect(canvas.element.style.cursor).toBe(cursor);
      }
    } finally {
      grid.wrapper.unmount();
    }
  });

  test("previews outer-boundary adjustments and restores the saved area on Escape or pointer cancellation", async () => {
    const grid = await mountPreview({ start: { row: 0, column: 0 }, end: { row: 9, column: 7 } });
    try {
      const area = { ...pageView(grid).printRect };
      await surfacePointer(grid, "pointerdown", area.width, 60);
      await windowPointer(grid, "pointermove", area.width - 96, 60);
      expect(pageView(grid).printRect.width).toBe(area.width - 96);
      expect(pageView(grid).dragBoundary?.offset).toBe(area.width - 96);
      expect(grid.sheet.pageSetup?.printArea?.end.column).toBe(7);
      expect(grid.wrapper.emitted("pageSetupChange")).toBeUndefined();

      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await nextTick();
      expect(pageView(grid).printRect).toEqual(area);
      expect(pageView(grid).dragBoundary).toBeUndefined();
      await windowPointer(grid, "pointerup", area.width - 96, 60);
      expect(grid.wrapper.emitted("pageSetupChange")).toBeUndefined();

      await surfacePointer(grid, "pointerdown", area.width, 60);
      await windowPointer(grid, "pointermove", area.width + 96, 60);
      expect(pageView(grid).printRect.width).toBe(area.width + 96);
      await windowPointer(grid, "pointercancel", area.width + 96, 60);
      expect(pageView(grid).printRect).toEqual(area);
      expect(grid.wrapper.emitted("pageSetupChange")).toBeUndefined();
    } finally {
      grid.wrapper.unmount();
    }
  });

  test("reflows outward while dragging and saves print scale plus the break in one undoable command", async () => {
    const grid = await mountPreview();
    try {
      await grid.wrapper.setProps({
        onPageSetupChange(setup: SheetPageSetup) {
          executeWorkbookCommand(
            grid.session,
            createSetSheetPageSetupCommand(grid.sheet.id, setup),
          );
        },
      });
      const initialCount = Number(grid.wrapper.attributes("data-page-count"));
      const line = pageView(grid).columnBreaks[0]!;
      await surfacePointer(grid, "pointerdown", line.offset, 100);
      await windowPointer(grid, "pointermove", line.offset + 96, 100);
      const firstPreviewScale = pageView(grid).millimetresPerUnit;
      expect(pageView(grid).columnBreaks[0]).toMatchObject({ index: 4, kind: "manual" });
      expect(pageView(grid).columnBreaks.some((item) => item.index === 3)).toBe(false);
      expect(Number(grid.wrapper.attributes("data-page-count"))).toBeLessThan(initialCount);
      expect(grid.sheet.pageSetup?.scale).toBe(200);
      expect(grid.session.history.undoStack).toHaveLength(0);

      await windowPointer(grid, "pointermove", line.offset + 192, 100);
      expect(pageView(grid).millimetresPerUnit).toBeLessThan(firstPreviewScale);
      await windowPointer(grid, "pointermove", line.offset + 96, 100);
      expect(pageView(grid).millimetresPerUnit).toBe(firstPreviewScale);
      await windowPointer(grid, "pointerup", line.offset + 96, 100);
      expect(grid.wrapper.emitted("pageSetupChange")).toHaveLength(1);
      expect(grid.sheet.pageSetup?.scale).toBeLessThan(200);
      expect(grid.sheet.pageSetup?.columnBreaks).toEqual([4]);
      expect(grid.session.history.undoStack).toHaveLength(1);
      expect(pageView(grid).dragBoundary).toBeUndefined();

      undoWorkbookCommand(grid.session);
      await nextTick();
      expect(grid.sheet.pageSetup?.scale).toBe(200);
      expect(grid.sheet.pageSetup?.columnBreaks).toEqual([]);
      expect(pageView(grid).columnBreaks[0]).toMatchObject({ index: 3, kind: "automatic" });
      redoWorkbookCommand(grid.session);
      await nextTick();
      expect(grid.sheet.pageSetup?.columnBreaks).toEqual([4]);
    } finally {
      grid.wrapper.unmount();
    }
  });

  test("cancels a draft when the sheet becomes read-only and leaves gray cells selectable", async () => {
    const grid = await mountPreview({ start: { row: 0, column: 0 }, end: { row: 9, column: 3 } });
    try {
      await triggerCell(grid.wrapper, { row: 2, column: 6 }, "mousedown", { button: 0 });
      expect(activeCell(grid.wrapper)).toBe("G3");
      const area = { ...pageView(grid).printRect };
      await surfacePointer(grid, "pointerdown", area.width, 60);
      await windowPointer(grid, "pointermove", area.width + 96, 60);
      expect(pageView(grid).printRect.width).toBe(area.width + 96);
      await grid.wrapper.setProps({ readOnly: true });
      expect(pageView(grid).printRect).toEqual(area);
      await windowPointer(grid, "pointerup", area.width + 96, 60);
      expect(grid.wrapper.emitted("pageSetupChange")).toBeUndefined();
    } finally {
      grid.wrapper.unmount();
    }
  });
});
