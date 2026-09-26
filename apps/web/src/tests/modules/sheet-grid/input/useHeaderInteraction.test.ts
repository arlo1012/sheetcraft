import { describe, expect, test, vi } from "vitest";
import { MIN_COLUMN_WIDTH } from "@idea10/core/workbook";
import { createSheetGeometry } from "@idea10/sheet-engine/geometry";
import { createSheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { createRowVisibilityIndex } from "@idea10/sheet-engine/visibility";
import { createSheetRenderFrame } from "../../../../modules/sheet-grid/rendering/sheet-render-frame";
import { useHeaderInteraction } from "../../../../modules/sheet-grid/input/useHeaderInteraction";

function createFixture(options?: {
  hiddenRows?: number[];
  quickTools?: boolean;
  gutter?: number;
  rowOutlineGutter?: number;
  columnOutlineGutter?: number;
  canFocus?: boolean;
}) {
  const geometry = createSheetGeometry({
    rowCount: 8,
    columnCount: 8,
    rowHeight: 20,
    columnWidth: 40,
  });
  const rows = createRowVisibilityIndex({
    rowCount: 8,
    defaultRowHeight: 20,
    hiddenRows: options?.hiddenRows,
  });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    freeze: { rows: 1, columns: 1 },
    viewportSize: { width: 120, height: 80 },
  });
  const callbacks = {
    selectAxis: vi.fn(),
    selectAll: vi.fn(),
    resizeStart: vi.fn(),
    resize: vi.fn(),
    quickInsert: vi.fn(),
    quickInsertHover: vi.fn(),
    axisDragStart: vi.fn(),
    openContextMenu: vi.fn(),
  };
  const interaction = useHeaderInteraction({
    getFrame: () =>
      createSheetRenderFrame(
        layout,
        {
          width: 36 + (options?.rowOutlineGutter ?? 0),
          height: 24 + (options?.columnOutlineGutter ?? 0),
        },
        1,
      ),
    getSelection: () => ({
      startRow: 0,
      endRow: 0,
      startColumn: 0,
      endColumn: 0,
      mode: "cells",
    }),
    getQuickTools: () => ({
      enabled: options?.quickTools ?? false,
      rowOutlineGutter: options?.rowOutlineGutter,
      columnOutlineGutter: options?.columnOutlineGutter,
      gutter: options?.gutter ?? (options?.quickTools ? 16 : 0),
    }),
    getGeometry: () => geometry,
    callbacks,
    canFocus: () => options?.canFocus ?? true,
    onInvalidate: vi.fn(),
  });
  return { callbacks, interaction };
}

function pointerEvent(overrides?: Partial<PointerEvent>): PointerEvent {
  return {
    button: 0,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as PointerEvent;
}

function keyboardEvent(key: string, overrides?: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    key,
    shiftKey: false,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as KeyboardEvent;
}

const trigger = {
  focus: vi.fn(),
  getBoundingClientRect: () => ({ left: 10, top: 20, width: 120, height: 80 }),
} as unknown as HTMLElement;

describe("useHeaderInteraction", () => {
  test.each([false, true])(
    "excludes outline space from row actions with quick tools %s",
    (quickTools) => {
      const { interaction } = createFixture({ quickTools, rowOutlineGutter: 48 });
      const gutter = quickTools ? 16 : 0;
      expect(interaction.hitTest({ x: gutter + 20, y: 12 })).toBeUndefined();
      expect(interaction.hitTest({ x: gutter + 20, y: 32 })).toBeUndefined();
      expect(interaction.hitTest({ x: gutter + 20, y: 43 })).toBeUndefined();
      expect(interaction.onPointerMove({ x: 76, y: 32 })).toMatchObject({
        axis: "row",
        action: "axis",
      });
      expect(interaction.hitTest({ x: 76, y: 43 })).toMatchObject({
        axis: "row",
        action: "resize",
      });
      if (quickTools) {
        expect(interaction.hitTest({ x: 8, y: 24 })).toMatchObject({
          axis: "row",
          action: "quickInsert",
        });
        interaction.onPointerLeave();
        expect(interaction.hitTest({ x: 8, y: 34 })).toMatchObject({ axis: "row", action: "grip" });
      }
    },
  );

  test("does not expand header hit areas into the reserved gutter when controls are disabled", () => {
    const { interaction } = createFixture({ quickTools: false, gutter: 16 });

    expect(interaction.hitTest({ x: 8, y: 12 })).toBeUndefined();
    expect(interaction.hitTest({ x: 8, y: 32 })).toBeUndefined();
    expect(interaction.hitTest({ x: 50, y: 8 })).toBeUndefined();
    expect(interaction.hitTest({ x: 24, y: 32 })).toMatchObject({ axis: "row", action: "axis" });
    expect(interaction.hitTest({ x: 50, y: 20 })).toMatchObject({ axis: "column", action: "axis" });
  });

  test("keeps the column outline tracks out of column-header actions", () => {
    const { interaction } = createFixture({ columnOutlineGutter: 44 });

    expect(interaction.hitTest({ x: 50, y: 12 })).toBeUndefined();
    expect(interaction.hitTest({ x: 50, y: 43 })).toBeUndefined();
    expect(interaction.hitTest({ x: 50, y: 44 })).toMatchObject({
      axis: "column",
      action: "axis",
    });
  });

  test("uses the render frame for row and column hits", () => {
    const { interaction } = createFixture();

    expect(interaction.hitTest({ x: 50, y: 12 })).toMatchObject({
      axis: "column",
      index: 0,
      action: "axis",
    });
    expect(interaction.hitTest({ x: 20, y: 32 })).toMatchObject({
      axis: "row",
      index: 0,
      action: "axis",
    });
  });

  test("ties resize to its visible row item instead of an insertion boundary", () => {
    const { interaction } = createFixture({ hiddenRows: [1] });

    // Frozen row 0 occupies 24..44. The next visible header is logical row 2.
    expect(interaction.hitTest({ x: 24, y: 43 })).toMatchObject({
      axis: "row",
      index: 0,
      action: "resize",
    });
    expect(interaction.hitTest({ x: 24, y: 45 })).toMatchObject({
      axis: "row",
      index: 2,
    });
  });

  test("keeps quick tools on the revealed header and inserts its actual boundary", () => {
    const { callbacks, interaction } = createFixture({ quickTools: true });
    interaction.onPointerMove({ x: 24, y: 32 });

    expect(interaction.hitTest({ x: 8, y: 24 })).toMatchObject({
      axis: "row",
      index: 0,
      action: "quickInsert",
    });
    interaction.onPointerDown({ x: 8, y: 24 }, pointerEvent(), trigger);
    expect(callbacks.quickInsert).toHaveBeenCalledWith("row", 0);
  });

  test("selects the corner and retains a single focused header target for keyboard commands", () => {
    const { callbacks, interaction } = createFixture();
    interaction.onPointerDown({ x: 20, y: 12 }, pointerEvent(), trigger);
    expect(callbacks.selectAll).toHaveBeenCalledOnce();

    interaction.onPointerDown({ x: 50, y: 12 }, pointerEvent(), trigger);
    const key = keyboardEvent("ContextMenu");
    expect(interaction.onKeyDown(key, trigger)).toBe(true);
    expect(callbacks.openContextMenu).toHaveBeenCalledWith("column", 0, 66, 32, trigger);
  });

  test("adjusts the focused resize boundary with keyboard limits", () => {
    const { callbacks, interaction } = createFixture();
    interaction.onPointerDown({ x: 74, y: 12 }, pointerEvent(), trigger);
    expect(interaction.state.focused).toMatchObject({ axis: "column", index: 0, action: "resize" });

    expect(interaction.onKeyDown(keyboardEvent("ArrowRight"), trigger)).toBe(true);
    expect(callbacks.resize).toHaveBeenCalledWith("column", 0, 48);
    expect(interaction.onKeyDown(keyboardEvent("Home"), trigger)).toBe(true);
    expect(callbacks.resize).toHaveBeenLastCalledWith("column", 0, MIN_COLUMN_WIDTH);
  });

  test("navigates only logical rows that have a rendered visible header", () => {
    const { interaction } = createFixture({ hiddenRows: [1] });
    interaction.focus({ axis: "row", index: 0, action: "axis" });

    expect(interaction.onKeyDown(keyboardEvent("ArrowDown"), trigger)).toBe(true);
    expect(interaction.state.focused).toMatchObject({ axis: "row", index: 2, action: "axis" });
  });

  test("consumes axis navigation at a rendered edge so it cannot fall through to cell navigation", () => {
    const { interaction } = createFixture();
    interaction.focus({ axis: "row", index: 0, action: "axis" });
    const event = keyboardEvent("ArrowUp");

    expect(interaction.onKeyDown(event, trigger)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(interaction.state.focused).toMatchObject({ axis: "row", index: 0 });
  });

  test("does not move DOM focus away from a formula reference editor", () => {
    const { interaction } = createFixture({ canFocus: false });
    vi.mocked(trigger.focus).mockClear();
    interaction.onPointerDown({ x: 20, y: 32 }, pointerEvent(), trigger);

    expect(trigger.focus).not.toHaveBeenCalled();
    expect(interaction.state.focused).toBeUndefined();
  });
});
