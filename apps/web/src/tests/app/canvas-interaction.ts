import type { CellAddress } from "@idea10/core/workbook";
import type { SheetViewportLayout } from "@idea10/sheet-engine/viewport-layout";
import type { VueWrapper } from "@vue/test-utils";
import SheetCanvasLayer from "../../modules/sheet-grid/components/SheetCanvasLayer.vue";

export async function triggerCanvasCell(
  wrapper: VueWrapper,
  address: CellAddress,
  event: string,
  options: MouseEventInit = {},
): Promise<void> {
  const canvasLayer = wrapper.getComponent(SheetCanvasLayer);
  const layout = canvasLayer.props("layout") as SheetViewportLayout;
  const scale = (canvasLayer.props("scale") as number | undefined) ?? 1;
  const rect = layout.getCellViewportRect(address);
  if (!rect) throw new Error(`Cell ${address.row}:${address.column} is outside the viewport`);

  const canvas = canvasLayer.get<HTMLCanvasElement>("[data-sheet-canvas]");
  const bounds = canvas.element.getBoundingClientRect();
  await canvas.trigger(event, {
    ...options,
    clientX: bounds.left + (rect.x + rect.width / 2) * scale,
    clientY: bounds.top + (rect.y + rect.height / 2) * scale,
  });
}
