import type { CellAddress } from "@idea10/core/workbook";
import type { VueWrapper } from "@vue/test-utils";
import SheetSurface from "../../modules/sheet-grid/components/SheetSurface.vue";
import type { SheetRenderFrame } from "../../modules/sheet-grid/rendering/sheet-render-frame";

export async function triggerCanvasCell(
  wrapper: VueWrapper,
  address: CellAddress,
  event: string,
  options: MouseEventInit = {},
): Promise<void> {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as SheetRenderFrame;
  const layout = frame.layout;
  const scale = frame.scale;
  const rect = layout.getCellViewportRect(address);
  if (!rect) throw new Error(`Cell ${address.row}:${address.column} is outside the viewport`);

  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  const scroller = wrapper.get<HTMLElement>(".sheet-grid__scroller").element;
  if (scroller.getBoundingClientRect().width === 0) {
    // Happy DOM has no layout: keep the native body's bounds aligned with the
    // surface header insets so window-level drag events use real browser geometry.
    scroller.getBoundingClientRect = () => {
      const current = surface.props("frame") as SheetRenderFrame;
      const origin = canvas.element.getBoundingClientRect();
      return new DOMRect(
        origin.left + current.body.x * current.scale,
        origin.top + current.body.y * current.scale,
        current.body.width * current.scale,
        current.body.height * current.scale,
      );
    };
  }
  await canvas.trigger(event.replace(/^mouse(down|move|up)$/, "pointer$1"), {
    ...options,
    pointerId: (options as MouseEventInit & { pointerId?: number }).pointerId ?? 1,
    clientX: bounds.left + (frame.body.x + rect.x + rect.width / 2) * scale,
    clientY: bounds.top + (frame.body.y + rect.y + rect.height / 2) * scale,
  });
}

export async function triggerCanvasHeader(
  wrapper: VueWrapper,
  axis: "row" | "column",
  index: number,
  event: "mousedown" | "contextmenu",
  options: MouseEventInit = {},
): Promise<void> {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as SheetRenderFrame;
  const panes = axis === "row" ? frame.rowHeaders : frame.columnHeaders;
  const item = panes.flatMap((pane) => pane.items).find((candidate) => candidate.index === index);
  if (!item) throw new Error(`Header ${axis}:${index} is outside the viewport`);
  const point =
    axis === "row"
      ? { x: frame.headerSize.width / 2, y: item.offset + item.size / 2 }
      : { x: item.offset + item.size / 2, y: frame.headerSize.height / 2 };
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  await canvas.trigger(event.replace(/^mouse(down|move|up)$/, "pointer$1"), {
    ...options,
    pointerId: (options as MouseEventInit & { pointerId?: number }).pointerId ?? 1,
    clientX: bounds.left + point.x * frame.scale,
    clientY: bounds.top + point.y * frame.scale,
  });
}

export async function triggerCanvasCorner(
  wrapper: VueWrapper,
  event: "mousedown" | "contextmenu",
  options: MouseEventInit = {},
): Promise<void> {
  const surface = wrapper.getComponent(SheetSurface);
  const frame = surface.props("frame") as SheetRenderFrame;
  const canvas = surface.get<HTMLCanvasElement>("[data-sheet-surface]");
  const bounds = canvas.element.getBoundingClientRect();
  await canvas.trigger(event.replace(/^mouse(down|move|up)$/, "pointer$1"), {
    ...options,
    pointerId: (options as MouseEventInit & { pointerId?: number }).pointerId ?? 1,
    clientX: bounds.left + (frame.headerSize.width / 2) * frame.scale,
    clientY: bounds.top + (frame.headerSize.height / 2) * frame.scale,
  });
}
