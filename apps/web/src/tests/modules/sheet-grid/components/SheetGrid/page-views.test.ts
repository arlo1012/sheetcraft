import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { DEFAULT_SHEET_PAGE_SETUP } from "@idea10/core/page-setup";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import {
  activeCell,
  getCanvasLayout,
  getSheetRenderFrame,
  mountSheetGrid,
  triggerCell,
} from "./fixture";

type PageView = {
  printRect: { x: number; y: number; width: number; height: number };
  pages: readonly {
    paperRect: { x: number; y: number; width: number; height: number };
    contentRect: { x: number; y: number; width: number; height: number };
  }[];
  rowBreaks: readonly { index: number; offset: number }[];
};

function pageView(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"]): PageView {
  return wrapper.getComponent(SheetSurface).props("pageView") as PageView;
}

async function triggerSurfacePoint(
  wrapper: ReturnType<typeof mountSheetGrid>["wrapper"],
  point: { x: number; y: number },
  options: PointerEventInit = {},
): Promise<void> {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = getSheetRenderFrame(wrapper);
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  await canvas.trigger("pointerdown", {
    button: 0,
    pointerId: 1,
    ...options,
    clientX: bounds.left + point.x * frame.scale,
    clientY: bounds.top + point.y * frame.scale,
  });
}

function dispatchPointer(
  type: "pointermove" | "pointerup",
  options: MouseEventInit & { pointerId: number },
): void {
  const event = new MouseEvent(type, options) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: options.pointerId });
  window.dispatchEvent(event);
}

describe("SheetGrid page views", () => {
  test("maps a page-layout cell click to its logical address while paper margins and gaps keep the selection", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.setProps({ viewMode: "page-layout" });
    await nextTick();

    await triggerCell(wrapper, { row: 3, column: 2 }, "mousedown", { button: 0 });
    expect(activeCell(wrapper)).toBe("C4");

    const state = pageView(wrapper);
    const first = state.pages[0]!;
    expect(state.pages).toHaveLength(1);

    await triggerSurfacePoint(wrapper, {
      x: getSheetRenderFrame(wrapper).body.x + first.paperRect.x + 1,
      y: getSheetRenderFrame(wrapper).body.y + first.paperRect.y + 1,
    });
    expect(activeCell(wrapper)).toBe("C4");

    await triggerSurfacePoint(wrapper, {
      x: getSheetRenderFrame(wrapper).body.x + first.paperRect.x + first.paperRect.width + 16,
      y: getSheetRenderFrame(wrapper).body.y + first.contentRect.y + 10,
    });
    expect(activeCell(wrapper)).toBe("C4");
  });

  test("preserves the selected far cell and underlying freeze state across page-layout mode", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(currentSheet) {
        currentSheet.freezePanes = { rows: 2, columns: 1 };
      },
    });
    wrapper.vm.navigateToCell({ row: 79, column: 9 });
    await nextTick();

    await wrapper.setProps({ viewMode: "page-layout" });
    await nextTick();
    await nextTick();

    const pageLayout = getCanvasLayout(wrapper);
    const farCell = pageLayout.getCellViewportRect({ row: 79, column: 9 });
    expect(activeCell(wrapper)).toBe("J80");
    expect(sheet.freezePanes).toEqual({ rows: 2, columns: 1 });
    expect(pageLayout.freeze).toEqual({ rows: 0, columns: 0 });
    expect(farCell).not.toBeNull();
    expect(farCell!.x).toBeGreaterThanOrEqual(0);
    expect(farCell!.y).toBeGreaterThanOrEqual(0);
    expect(farCell!.x + farCell!.width).toBeLessThanOrEqual(pageLayout.viewportSize.width);
    expect(farCell!.y + farCell!.height).toBeLessThanOrEqual(pageLayout.viewportSize.height);

    await wrapper.setProps({ viewMode: "normal" });
    await nextTick();
    expect(activeCell(wrapper)).toBe("J80");
    expect(getCanvasLayout(wrapper).freeze).toEqual({ rows: 2, columns: 1 });
  });

  test("turns a dragged automatic row break into one manual page-setup update", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(currentSheet) {
        currentSheet.pageSetup = {
          ...DEFAULT_SHEET_PAGE_SETUP,
          scale: 400,
          printArea: {
            start: { row: 0, column: 0 },
            end: { row: 59, column: 3 },
          },
        };
      },
    });
    await wrapper.setProps({ viewMode: "page-break-preview" });
    await nextTick();

    const state = pageView(wrapper);
    const line = state.rowBreaks[0];
    expect(line).toBeDefined();
    const frame = getSheetRenderFrame(wrapper);
    const x = frame.body.x + state.printRect.x + Math.min(24, state.printRect.width / 2);
    const startY = frame.body.y + line!.offset;
    await triggerSurfacePoint(wrapper, { x, y: startY }, { pointerId: 7 });
    dispatchPointer("pointermove", { buttons: 1, pointerId: 7, clientX: x, clientY: startY + 32 });
    dispatchPointer("pointerup", { pointerId: 7, clientX: x, clientY: startY + 32 });
    await nextTick();

    const update = wrapper.emitted("pageSetupChange")?.at(-1)?.[0] as
      | { rowBreaks: number[] }
      | undefined;
    expect(update).toBeDefined();
    expect(update!.rowBreaks).not.toContain(line!.index);
    expect(update!.rowBreaks).toHaveLength(1);
    expect(sheet.pageSetup?.rowBreaks).toEqual([]);
  });
});
