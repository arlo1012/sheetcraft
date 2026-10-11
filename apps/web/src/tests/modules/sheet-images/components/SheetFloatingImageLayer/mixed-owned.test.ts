import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSheet, type FloatingImage } from "@sheetcraft/core/workbook";
import { createSheetGeometry } from "@sheetcraft/sheet-engine/geometry";
import { createRowVisibilityIndex } from "@sheetcraft/sheet-engine/visibility";
import { createSheetViewportLayout } from "@sheetcraft/sheet-engine/viewport-layout";
import { createPictureViewMetrics } from "@sheetcraft/sheet-engine/picture-frame-layout";
import SheetFloatingImageLayer from "../../../../../modules/sheet-images/components/SheetFloatingImageLayer.vue";
import { getPictureViewRect } from "../../../../../modules/sheet-images/picture-view-operations";
import { createAppI18n } from "../../../../../shared/i18n";
import { framedPicture } from "../../framed-picture-fixture";
import { pictureGroup } from "../../picture-group-fixture";
const mounted: VueWrapper[] = [];
afterEach(() => mounted.splice(0).forEach((wrapper) => wrapper.unmount()));
function fixture() {
  const sheet = createSheet("Synthetic", "s"),
    geometry = createSheetGeometry({ rowCount: 30, columnCount: 20 }),
    rows = createRowVisibilityIndex({ rowCount: 30, defaultRowHeight: 24 });
  const layout = createSheetViewportLayout({
    geometry,
    rows,
    viewportSize: { width: 600, height: 400 },
  });
  const frameContext = { layout, metrics: createPictureViewMetrics(sheet, geometry, rows) };
  const frame = framedPicture(),
    group = pictureGroup(),
    hidden = { ...framedPicture(), id: "hidden", assetId: "hidden-asset", hidden: true };
  group.frame.anchor = { mode: "fixed", x: 400, y: 200, size: { width: 120, height: 80 } };
  const roots = [group, hidden, frame],
    apply = vi.fn((_images: readonly FloatingImage[]) => true);
  const wrapper = mount(SheetFloatingImageLayer, {
    attachTo: document.body,
    props: {
      images: [hidden, frame],
      selectionRoots: roots,
      owner: sheet,
      layout,
      frameContext,
      assetUrls: new Map(),
      selectedImageId: frame.id,
      selectedImageIds: [frame.id, group.id],
      applyUpdateMany: apply,
    },
    global: { plugins: [createAppI18n("en-US")] },
  });
  mounted.push(wrapper);
  const api = wrapper.vm as unknown as {
    handleSurfacePointerDown: (event: PointerEvent, point: { x: number; y: number }) => boolean;
    handleSurfacePointerMove: (event: PointerEvent, point: { x: number; y: number }) => boolean;
    handleSurfacePointerUp: (event: PointerEvent) => boolean;
    getPaintState: () => { images: FloatingImage[] };
  };
  function event(type: string) {
    const e = new MouseEvent(type, { button: 0, bubbles: true }) as PointerEvent;
    Object.defineProperties(e, {
      pointerId: { value: 1 },
      currentTarget: { value: wrapper.element },
    });
    return e;
  }
  return { wrapper, api, event, frameContext, frame, group, hidden, roots, apply, layout };
}
describe("standalone handle bridge to the complete owned forest", () => {
  test("moves both roots from a standalone body in one command and keeps unrelated hidden paint state", () => {
    const f = fixture(),
      before = structuredClone(f.roots);
    expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 254, y: 114 })).toBe(true);
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 274, y: 144 });
    const preview = f.api.getPaintState().images;
    expect(preview.map((root) => root.id)).toEqual(f.roots.map((root) => root.id));
    expect(preview[1]).toEqual(f.hidden);
    expect(getPictureViewRect(preview[0]!, f.layout, f.frameContext)).toEqual({
      x: 420,
      y: 230,
      width: 120,
      height: 80,
    });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.apply.mock.calls[0]![0].map((root) => root.id)).toEqual([f.group.id, f.frame.id]);
    expect(f.roots).toEqual(before);
  });
  test("a standalone side handle uses the same local factor for an owned root", async () => {
    const f = fixture();
    await f.wrapper
      .get('[data-image-resize="e"]')
      .trigger("pointerdown", { button: 0, pointerId: 1, clientX: 0, clientY: 0 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 30, y: 10 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).toHaveBeenCalledOnce();
    const next = f.apply.mock.calls[0]![0];
    const group = getPictureViewRect(
      next.find((root) => root.id === f.group.id)!,
      f.layout,
      f.frameContext,
    )!;
    const frame = getPictureViewRect(
      next.find((root) => root.id === f.frame.id)!,
      f.layout,
      f.frameContext,
    )!;
    expect(group.width / 120).toBeCloseTo(frame.width / 120, 10);
    expect(group.height).toBe(80);
    expect(frame.height).toBe(80);
  });
  test("a foreground owned leaf cannot be hit by the standalone layer", async () => {
    const f = fixture();
    const group = {
      ...f.group,
      frame: {
        ...f.group.frame,
        angleDeg: 0,
        anchor: { mode: "fixed" as const, x: 194, y: 74, size: { width: 120, height: 80 } },
      },
    };
    group.members[0]!.frame.angleDeg = 0;
    await f.wrapper.setProps({ selectionRoots: [f.frame, f.hidden, group] });
    expect(f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 254, y: 114 })).toBe(false);
    expect(f.apply).not.toHaveBeenCalled();
  });
  test("a changed owned leaf cancels the earlier mixed preview without a partial commit", async () => {
    const f = fixture();
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 254, y: 114 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 274, y: 144 });
    const changed = structuredClone(f.group);
    if (changed.members[0]!.kind !== "grouped-picture-v1") throw new Error("Expected leaf.");
    changed.members[0]!.assetId = "replacement";
    await f.wrapper.setProps({ selectionRoots: [changed, f.hidden, f.frame] });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).not.toHaveBeenCalled();
    expect(f.api.getPaintState().images).toEqual([changed, f.hidden, f.frame]);
  });
  test("a rejected mixed command leaves complete roots and history unchanged", () => {
    const f = fixture();
    f.apply.mockReturnValue(false);
    f.api.handleSurfacePointerDown(f.event("pointerdown"), { x: 254, y: 114 });
    f.api.handleSurfacePointerMove(f.event("pointermove"), { x: 274, y: 144 });
    f.api.handleSurfacePointerUp(f.event("pointerup"));
    expect(f.apply).toHaveBeenCalledOnce();
    expect(f.wrapper.emitted("updateMany")).toBeUndefined();
    expect(f.wrapper.emitted("feedback")).toEqual([["picture.operationFailed"]]);
    expect(f.api.getPaintState().images).toEqual(f.roots);
  });
});
