import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import {
  cloneSheetPageSetup,
  DEFAULT_SHEET_PAGE_SETUP,
  type SheetPageSetup,
} from "@idea10/core/page-setup";
import { createSetSheetPageSetupCommand } from "@idea10/core/commands";
import { executeWorkbookCommand, undoWorkbookCommand } from "@idea10/core/history";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import type { PageViewPaintState } from "../../../../../modules/page-layout/page-view-types";
import { activeCell, getCanvasLayout, getSheetRenderFrame, mountSheetGrid } from "./fixture";

type Grid = ReturnType<typeof mountSheetGrid>;
async function mountLayout(): Promise<Grid> {
  const grid = mountSheetGrid({
    beforeMount(sheet) {
      sheet.pageSetup = {
        ...cloneSheetPageSetup(DEFAULT_SHEET_PAGE_SETUP),
        scale: 200,
        printArea: { start: { row: 0, column: 0 }, end: { row: 59, column: 7 } },
      };
    },
  });
  await grid.wrapper.setProps({
    viewMode: "page-layout",
    showPageMargins: true,
    zoom: 150,
    onPageSetupChange(setup: SheetPageSetup) {
      executeWorkbookCommand(grid.session, createSetSheetPageSetupCommand(grid.sheet.id, setup));
    },
  });
  return grid;
}
function state(grid: Grid): PageViewPaintState {
  return grid.wrapper.getComponent(SheetSurface).props("pageView") as PageViewPaintState;
}
function pointer(grid: Grid, x: number, y: number) {
  const frame = getSheetRenderFrame(grid.wrapper);
  const bounds = grid.wrapper
    .get<HTMLCanvasElement>("[data-sheet-surface]")
    .element.getBoundingClientRect();
  return {
    clientX: bounds.left + (frame.body.x + x - frame.layout.bodyScrollPosition.x) * frame.scale,
    clientY: bounds.top + (frame.body.y + y - frame.layout.bodyScrollPosition.y) * frame.scale,
  };
}
async function dispatch(grid: Grid, type: "pointermove" | "pointerup", x: number, y: number) {
  const event = new MouseEvent(type, {
    ...pointer(grid, x, y),
    button: 0,
    buttons: type === "pointermove" ? 1 : 0,
  });
  Object.defineProperty(event, "pointerId", { value: 7 });
  window.dispatchEvent(event);
  await nextTick();
}
async function startLeft(grid: Grid) {
  const page = state(grid).pages[0]!;
  const x = page.paperRect.x + grid.sheet.pageSetup!.margins.left / state(grid).millimetresPerUnit;
  const y = page.contentRect.y + 30;
  await grid.wrapper
    .get('[data-page-margin="left"]')
    .trigger("pointerdown", { ...pointer(grid, x, y), button: 0, pointerId: 7 });
  return { x, y };
}

describe("SheetGrid page-layout interaction", () => {
  test("keeps the initial paper inset at 20 visual pixels while scaling document content", async () => {
    const grid = await mountLayout();
    try {
      const frame = getSheetRenderFrame(grid.wrapper);
      const paper = state(grid).pages[0]!.paperRect;
      expect(paper.x * frame.scale).toBeCloseTo(20 * 1.5);
      expect(paper.y * frame.scale).toBeCloseTo(20 * 1.5);
      expect(frame.headingOrigin.x * frame.scale).toBeCloseTo(26 * 1.5);
      expect(frame.headingOrigin.y * frame.scale).toBeCloseTo(26 * 1.5);
    } finally {
      grid.wrapper.unmount();
    }
  });

  test("ruler margin dragging works with paper handles hidden and removes feedback on release", async () => {
    const grid = await mountLayout();
    try {
      await grid.wrapper.setProps({ showPageMargins: false });
      expect(grid.wrapper.find("[data-page-margin-guide]").exists()).toBe(false);
      const original = grid.sheet.pageSetup!.margins.left;
      const unit = state(grid).millimetresPerUnit;
      const x = state(grid).pages[0]!.contentRect.x;
      const y = -getSheetRenderFrame(grid.wrapper).body.y + 5;
      await grid.wrapper.get('[data-page-ruler-margin="left"]').trigger("pointerdown", {
        ...pointer(grid, x, y),
        button: 0,
        pointerId: 7,
      });
      await dispatch(grid, "pointermove", x + 5 / unit, y);
      expect(grid.wrapper.find("[data-page-margin-guide]").exists()).toBe(true);
      expect(grid.sheet.pageSetup!.margins.left).toBe(original);
      await dispatch(grid, "pointerup", x + 5 / unit, y);
      expect(grid.sheet.pageSetup!.margins.left).toBe(Math.round((original + 5) * 10) / 10);
      expect(grid.session.history.undoStack).toHaveLength(1);
      expect(grid.wrapper.find("[data-page-margin-guide]").exists()).toBe(false);
    } finally {
      grid.wrapper.unmount();
    }
  });

  test("clicking a margin handle preserves its exact value and does not create history", async () => {
    const grid = await mountLayout();
    try {
      const original = grid.sheet.pageSetup!.margins.left;
      const point = await startLeft(grid);
      await dispatch(grid, "pointerup", point.x, point.y);
      expect(grid.sheet.pageSetup!.margins.left).toBe(original);
      expect(grid.wrapper.emitted("pageSetupChange")).toBeUndefined();
      expect(grid.session.history.undoStack).toHaveLength(0);
    } finally {
      grid.wrapper.unmount();
    }
  });
  test("starts a margin drag after saving a header draft without cancelling or overwriting it", async () => {
    const grid = await mountLayout();
    try {
      await grid.wrapper.setProps({
        onHeaderFooterChange(payload) {
          const setup = cloneSheetPageSetup(grid.sheet.pageSetup!);
          setup[payload.section][payload.part] = payload.value;
          executeWorkbookCommand(
            grid.session,
            createSetSheetPageSetupCommand(grid.sheet.id, setup),
          );
        },
      });
      await grid.wrapper
        .get('button[data-page-section="header"][data-page-part="center"]')
        .trigger("click");
      await grid.wrapper
        .get(".page-header-footer-field.is-editing textarea")
        .setValue("Draft title");
      const original = grid.sheet.pageSetup!.margins.left;
      const unit = state(grid).millimetresPerUnit;
      const point = await startLeft(grid);
      await dispatch(grid, "pointermove", point.x + 5 / unit, point.y);
      await dispatch(grid, "pointerup", point.x + 5 / unit, point.y);
      expect(grid.sheet.pageSetup!.header.center).toContain("Draft title");
      expect(grid.sheet.pageSetup!.margins.left).toBe(Math.round((original + 5) * 10) / 10);
    } finally {
      grid.wrapper.unmount();
    }
  });
  test("previews a physical margin at changed print scale and zoom, then commits one undoable change", async () => {
    const grid = await mountLayout();
    try {
      const original = grid.sheet.pageSetup!.margins.left;
      const unit = state(grid).millimetresPerUnit;
      const { x, y } = await startLeft(grid);
      await dispatch(grid, "pointermove", x + 10 / unit, y);
      expect(grid.sheet.pageSetup!.margins.left).toBe(original);
      expect(grid.session.history.undoStack).toHaveLength(0);
      expect(state(grid).pages[0]!.contentRect.x).toBeCloseTo(
        state(grid).pages[0]!.paperRect.x + Math.round((original + 10) * 10) / 10 / unit,
      );
      await dispatch(grid, "pointerup", x + 10 / unit, y);
      expect(grid.sheet.pageSetup!.margins.left).toBe(Math.round((original + 10) * 10) / 10);
      expect(grid.wrapper.emitted("pageSetupChange")).toHaveLength(1);
      expect(grid.session.history.undoStack).toHaveLength(1);
      undoWorkbookCommand(grid.session);
      await nextTick();
      expect(grid.sheet.pageSetup!.margins.left).toBe(original);
    } finally {
      grid.wrapper.unmount();
    }
  });

  test("Escape and read-only transitions discard margin drafts", async () => {
    const grid = await mountLayout();
    try {
      const original = grid.sheet.pageSetup!.margins.left;
      const unit = state(grid).millimetresPerUnit;
      let point = await startLeft(grid);
      await dispatch(grid, "pointermove", point.x + 10 / unit, point.y);
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await nextTick();
      await dispatch(grid, "pointerup", point.x + 10 / unit, point.y);
      expect(state(grid).pages[0]!.contentRect.x).toBeCloseTo(
        state(grid).pages[0]!.paperRect.x + original / unit,
      );
      point = await startLeft(grid);
      await dispatch(grid, "pointermove", point.x + 10 / unit, point.y);
      await grid.wrapper.setProps({ readOnly: true });
      await dispatch(grid, "pointerup", point.x + 10 / unit, point.y);
      expect(grid.wrapper.emitted("pageSetupChange")).toBeUndefined();
      expect(grid.session.history.undoStack).toHaveLength(0);
      await grid.wrapper.setProps({ readOnly: false });
      point = await startLeft(grid);
      await dispatch(grid, "pointermove", point.x + 10 / unit, point.y);
      await grid.wrapper.setProps({ viewMode: "normal" });
      await grid.wrapper.setProps({ viewMode: "page-layout" });
      expect(state(grid).pages[0]!.contentRect.x).toBeCloseTo(
        state(grid).pages[0]!.paperRect.x + original / unit,
      );
      await dispatch(grid, "pointerup", point.x + 10 / unit, point.y);
      expect(grid.wrapper.emitted("pageSetupChange")).toBeUndefined();
    } finally {
      grid.wrapper.unmount();
    }
  });

  test("folding white space preserves and reveals the selected far cell without document history", async () => {
    const grid = await mountLayout();
    try {
      grid.wrapper.vm.navigateToCell({ row: 79, column: 9 });
      await nextTick();
      await grid.wrapper.setProps({ showPageWhiteSpace: false });
      await nextTick();
      expect(activeCell(grid.wrapper)).toBe("J80");
      expect(grid.wrapper.find("[data-page-header-footer]").exists()).toBe(false);
      expect(grid.wrapper.find('[data-page-margin="top"]').exists()).toBe(false);
      const layout = getCanvasLayout(grid.wrapper);
      const rect = layout.getCellViewportRect({ row: 79, column: 9 })!;
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(layout.viewportSize.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(layout.viewportSize.height);
      expect(grid.session.history.undoStack).toHaveLength(0);
      await grid.wrapper.setProps({ showPageWhiteSpace: true });
      expect(activeCell(grid.wrapper)).toBe("J80");
    } finally {
      grid.wrapper.unmount();
    }
  });

  test("rulers reserve a constant visual lane and margin controls support keyboard adjustment", async () => {
    const grid = await mountLayout();
    try {
      const initialFrame = getSheetRenderFrame(grid.wrapper);
      expect(
        (initialFrame.body.x - initialFrame.headingSize.width) * initialFrame.scale,
      ).toBeCloseTo(26 * 1.5);
      const original = grid.sheet.pageSetup!.margins.left;
      await grid.wrapper
        .get('[data-page-margin="left"]')
        .trigger("keydown", { key: "ArrowRight", shiftKey: true });
      expect(grid.sheet.pageSetup!.margins.left).toBe(Math.round((original + 1) * 10) / 10);
      await grid.wrapper.setProps({ showPageRulers: false });
      expect(grid.wrapper.find("[data-page-layout-rulers]").exists()).toBe(false);
      const frame = getSheetRenderFrame(grid.wrapper);
      expect(frame.body.x).toBe(frame.headingSize.width);
    } finally {
      grid.wrapper.unmount();
    }
  });
});
