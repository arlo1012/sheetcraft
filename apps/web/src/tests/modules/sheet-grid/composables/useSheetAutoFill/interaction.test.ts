import { mount } from "@vue/test-utils";
import { createSetCellContentCommand } from "@idea10/core/commands";
import { createWorkbookSession, executeWorkbookCommand } from "@idea10/core/history";
import { getActiveSheet, type CellRange } from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import { defineComponent, ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import { useSheetAutoFill } from "../../../../../modules/sheet-grid/composables/useSheetAutoFill";
import { createAppI18n } from "../../../../../shared/i18n";
import { createBrowserIdFactory } from "../../../../../shared/runtime/browser-id-factory";

function createLayout(): SheetViewportLayout {
  return {
    getCellViewportRect: () => ({ x: 0, y: 0, width: 20, height: 20 }),
    getPaneForAddress: () => "body",
    panes: { body: { clip: { x: 0, y: 0, width: 20, height: 20 } } },
  } as unknown as SheetViewportLayout;
}

function mountAutoFill(range: CellRange) {
  const session = createWorkbookSession({ idFactory: createBrowserIdFactory() });
  const sheet = getActiveSheet(session.workbook);
  const selected = ref(range);
  const apply = vi.fn(() => ({
    ok: true as const,
    session: {
      id: 1,
      sheetId: sheet.id,
      range: selected.value,
      mode: "copy" as const,
      availableModes: ["copy" as const],
      revision: 1,
    },
  }));
  let control!: ReturnType<typeof useSheetAutoFill>;
  const wrapper = mount(
    defineComponent({
      setup() {
        control = useSheetAutoFill({
          getSheet: () => sheet,
          getRevision: () => 1,
          getRange: () => selected.value,
          getCanFill: () => true,
          getLayout: createLayout,
          getHeaderSize: () => ({ width: 0, height: 0 }),
          getRoot: () => null,
          getScroller: () => null,
          getViewportSize: () => ({ width: 10, height: 10 }),
          getScale: () => 0.5,
          getContentRowCount: () => 10,
          getCellAtClientPoint: () => null,
          apply,
          onBeforeStart: vi.fn(),
          onResult: vi.fn(),
          onFeedback: vi.fn(),
          onEndSession: vi.fn(),
          onEnsureGridExtentContains: vi.fn(),
          onEnsureGridExtentCoversViewport: vi.fn(),
          onScrollPositionChange: vi.fn(),
          focusGrid: vi.fn(),
        });
        return () => null;
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  return { session, sheet, selected, apply, control, wrapper };
}

describe("useSheetAutoFill", () => {
  test("double click stops before a hidden row instead of requesting a rejected range", () => {
    const { session, sheet, apply, control, wrapper } = mountAutoFill({
      start: { row: 0, column: 1 },
      end: { row: 0, column: 1 },
    });
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 1, column: 0 }, { kind: "literal", value: 1 }),
    );
    executeWorkbookCommand(
      session,
      createSetCellContentCommand(sheet.id, { row: 2, column: 0 }, { kind: "literal", value: 2 }),
    );
    sheet.hiddenRows?.add(2);

    control.doubleClick(new MouseEvent("dblclick"));

    expect(apply).toHaveBeenCalledWith(
      expect.objectContaining({
        source: { start: { row: 0, column: 1 }, end: { row: 0, column: 1 } },
        range: { start: { row: 0, column: 1 }, end: { row: 1, column: 1 } },
      }),
    );
    wrapper.unmount();
  });

  test("fills all four directions from the selection edge and skips a single axis", () => {
    const { apply, control, selected, wrapper } = mountAutoFill({
      start: { row: 3, column: 4 },
      end: { row: 5, column: 6 },
    });
    expect(control.fillSelection("down")).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: { start: { row: 3, column: 4 }, end: { row: 3, column: 6 } },
        range: { start: { row: 3, column: 4 }, end: { row: 5, column: 6 } },
        copy: true,
      }),
    );
    expect(control.fillSelection("right")).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: { start: { row: 3, column: 4 }, end: { row: 5, column: 4 } },
        copy: true,
      }),
    );
    expect(control.fillSelection("up")).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: { start: { row: 5, column: 4 }, end: { row: 5, column: 6 } },
        copy: true,
      }),
    );
    expect(control.fillSelection("left")).toBe(true);
    expect(apply).toHaveBeenLastCalledWith(
      expect.objectContaining({
        source: { start: { row: 3, column: 6 }, end: { row: 5, column: 6 } },
        copy: true,
      }),
    );
    selected.value = { start: { row: 3, column: 4 }, end: { row: 3, column: 6 } };
    expect(control.fillSelection("down")).toBe(false);
    expect(control.fillSelection("up")).toBe(false);
    selected.value = { start: { row: 3, column: 4 }, end: { row: 5, column: 4 } };
    expect(control.fillSelection("left")).toBe(false);
    expect(control.fillSelection("right")).toBe(false);
    expect(control.optionsPosition.value?.x).toBeGreaterThanOrEqual(0);
    expect(control.optionsPosition.value?.y).toBeGreaterThanOrEqual(0);
    wrapper.unmount();
  });
});
