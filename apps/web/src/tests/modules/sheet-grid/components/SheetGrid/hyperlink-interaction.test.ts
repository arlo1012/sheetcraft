import { describe, expect, test } from "vitest";
import { setCellHyperlink } from "@idea10/core/workbook";
import SheetSurface from "../../../../../modules/sheet-grid/components/SheetSurface.vue";
import { activeCell, mountSheetGrid, triggerCell } from "./fixture";

function cellClientPoint(
  wrapper: ReturnType<typeof mountSheetGrid>["wrapper"],
  address: { row: number; column: number },
): { clientX: number; clientY: number } {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame");
  const rect = frame.layout.getCellViewportRect(address);
  if (!rect) throw new Error("The test cell is outside the viewport.");
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  return {
    clientX: bounds.left + (frame.body.x + rect.x + rect.width / 2) * frame.scale,
    clientY: bounds.top + (frame.body.y + rect.y + rect.height / 2) * frame.scale,
  };
}

function dispatchPointer(type: "pointermove" | "pointerup", point: MouseEventInit): void {
  const event = new MouseEvent(type, point) as PointerEvent;
  Object.defineProperty(event, "pointerId", { value: 1 });
  window.dispatchEvent(event);
}

describe("SheetGrid hyperlinks", () => {
  test("opens a hyperlink after a completed primary click and still selects its cell", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    const address = { row: 1, column: 1 };
    setCellHyperlink(sheet, address, { target: "https://example.com", tooltip: "Open example" });
    const point = cellClientPoint(wrapper, address);

    await triggerCell(wrapper, address, "mousedown", { button: 0, buttons: 1, ...point });
    dispatchPointer("pointerup", { button: 0, ...point });
    await wrapper.vm.$nextTick();

    expect(activeCell(wrapper)).toBe("B2");
    expect(wrapper.emitted("openHyperlink")).toEqual([[address]]);
  });

  test("does not open a hyperlink when the pointer gesture becomes a selection drag", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    const address = { row: 0, column: 0 };
    setCellHyperlink(sheet, address, { target: "https://example.com" });
    const start = cellClientPoint(wrapper, address);
    const end = cellClientPoint(wrapper, { row: 1, column: 1 });

    await triggerCell(wrapper, address, "mousedown", { button: 0, buttons: 1, ...start });
    dispatchPointer("pointermove", { buttons: 1, ...end });
    dispatchPointer("pointerup", { button: 0, ...end });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("openHyperlink")).toBeUndefined();
  });

  test("keeps a hyperlink inert for a secondary-button click", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    const address = { row: 0, column: 0 };
    setCellHyperlink(sheet, address, { target: "https://example.com" });
    const point = cellClientPoint(wrapper, address);

    await triggerCell(wrapper, address, "mousedown", { button: 2, buttons: 2, ...point });
    dispatchPointer("pointerup", { button: 2, ...point });
    await wrapper.vm.$nextTick();

    expect(wrapper.emitted("openHyperlink")).toBeUndefined();
  });
});
