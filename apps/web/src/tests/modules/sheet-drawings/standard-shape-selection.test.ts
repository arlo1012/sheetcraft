import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { pictureFrameLocalToWorld } from "@sheetcraft/core/picture-frame";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import * as textWarps from "@sheetcraft/core/text-warps";
import type { FloatingImageViewportFragment } from "@sheetcraft/sheet-engine/floating-image-layout";
import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import StandardShapeSelection from "../../../modules/sheet-drawings/components/StandardShapeSelection.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { getDrawingShapeTextWarpAdjustments } from "../../../modules/sheet-drawings/shape-text-warp-adjustment";
import { createAppI18n } from "../../../shared/i18n";

const wrappers: VueWrapper[] = [];
afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.restoreAllMocks();
});
const fragment: FloatingImageViewportFragment = {
  paneId: "body",
  rect: { x: 160, y: 120, width: 240, height: 160 },
  clippedRect: { x: 130, y: 90, width: 320, height: 240 },
};
const paneClip: Rect = { x: 0, y: 0, width: 800, height: 600 };
function drawing(overrides: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  const base = createGraphicDrawing("selected", "shape", "WordArt", { row: 2, column: 2 });
  return {
    ...base,
    width: 240,
    height: 160,
    rotation: 37,
    text: "Native WordArt",
    shapeGeometry: { preset: "wedgeRectCallout" },
    shapeText: { ...base.shapeText!, warp: { preset: "textWave1" } },
    ...overrides,
  };
}
function fixture(source = drawing(), clip = paneClip) {
  const wrapper = mount(StandardShapeSelection, {
    props: { drawing: source, fragment, paneClip: clip },
    global: { plugins: [createAppI18n("en-US")] },
  });
  wrappers.push(wrapper);
  return wrapper;
}
function key(element: HTMLElement, name: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  element.dispatchEvent(event);
  return event;
}

describe("standard selection glyph-warp controls", () => {
  test.each([
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const)(
    "places native glyph controls through full body flip and rotation X%s Y%s",
    (x, y) => {
      const source = drawing({
        shapeGeometry: { preset: "triangle" },
        ...(x ? { shapeFlipX: true } : {}),
        ...(y ? { shapeFlipY: true } : {}),
      });
      const wrapper = fixture(source);
      for (const handle of getDrawingShapeTextWarpAdjustments(source)) {
        const world = pictureFrameLocalToWorld(
          fragment.rect,
          source.rotation,
          handle.paintedPosition,
        );
        const element = wrapper.get(`[data-shape-text-warp-adjustment="${handle.index}"]`)
          .element as HTMLElement;
        expect(parseFloat(element.style.left)).toBeCloseTo(world.x - fragment.clippedRect.x, 5);
        expect(parseFloat(element.style.top)).toBeCloseTo(world.y - fragment.clippedRect.y, 5);
        expect(element.tagName).toBe("BUTTON");
        expect(element.getAttribute("aria-label")).toBeTruthy();
      }
    },
  );

  test("keeps body handles and emits independent pointer and keyboard events", async () => {
    const wrapper = fixture();
    const body = wrapper.get('[data-shape-adjustment="0"]');
    const warp = wrapper.get('[data-shape-text-warp-adjustment="0"]');
    expect(wrapper.findAll("[data-shape-resize]")).toHaveLength(8);
    expect(wrapper.find("[data-shape-rotate]").exists()).toBe(true);
    await warp.trigger("pointerdown", { pointerId: 4 });
    expect(wrapper.emitted("warpAdjust")?.[0]?.[0]).toBe(0);
    expect(wrapper.emitted("adjust")).toBeUndefined();
    await body.trigger("pointerdown", { pointerId: 5 });
    expect(wrapper.emitted("adjust")?.[0]?.[0]).toBe(0);
    const warpKey = key(warp.element as HTMLElement, "ArrowRight", { shiftKey: true });
    expect(warpKey.defaultPrevented).toBe(true);
    expect(wrapper.emitted("nudgeWarpAdjustment")).toEqual([[0, { x: 10, y: 0 }]]);
    expect(wrapper.emitted("nudgeAdjustment")).toBeUndefined();
    key(body.element as HTMLElement, "ArrowDown");
    expect(wrapper.emitted("nudgeAdjustment")).toEqual([[0, { x: 0, y: 1 }]]);
  });

  test("leaves composition, modified navigation and other keys untouched", () => {
    const wrapper = fixture();
    const handle = wrapper.get('[data-shape-text-warp-adjustment="0"]').element as HTMLElement;
    for (const extra of [
      { isComposing: true },
      { ctrlKey: true },
      { metaKey: true },
      { altKey: true },
    ]) {
      expect(key(handle, "ArrowRight", extra).defaultPrevented).toBe(false);
    }
    expect(key(handle, "Enter").defaultPrevented).toBe(false);
    expect(wrapper.emitted("nudgeWarpAdjustment")).toBeUndefined();
  });

  test("assigns pane-edge ownership once and suppresses invalid singular controls", () => {
    const source = drawing();
    const first = getDrawingShapeTextWarpAdjustments(source)[0]!;
    const world = pictureFrameLocalToWorld(fragment.rect, source.rotation, first.paintedPosition);
    const left = fixture(source, { x: 0, y: 0, width: world.x, height: 600 });
    const right = fixture(source, { x: world.x, y: 0, width: 800 - world.x, height: 600 });
    expect(left.find('[data-shape-text-warp-adjustment="0"]').exists()).toBe(false);
    expect(right.find('[data-shape-text-warp-adjustment="0"]').exists()).toBe(true);
    const actual = textWarps.evaluateTextWarp;
    vi.spyOn(textWarps, "evaluateTextWarp").mockImplementation((input, width, height) => {
      const geometry = actual(input, width, height);
      return {
        ...geometry,
        handles: geometry.handles.map((handle, index) => ({
          ...handle,
          fields: handle.fields.map((field) => ({
            ...field,
            ...(index === 0 ? { disabled: true } : {}),
          })),
        })),
      };
    });
    const singular = fixture(source);
    expect(singular.find('[data-shape-text-warp-adjustment="0"]').exists()).toBe(false);
    expect(singular.find('[data-shape-text-warp-adjustment="1"]').exists()).toBe(true);
    expect(singular.find('[data-shape-adjustment="0"]').exists()).toBe(true);
  });

  test("has no glyph controls when the warp is inactive or the real text domain is missing", () => {
    const inactive = drawing();
    delete inactive.shapeText!.warp;
    expect(fixture(inactive).findAll("[data-shape-text-warp-adjustment]")).toHaveLength(0);
    const open = drawing({ shapeGeometry: { preset: "line" } });
    expect(fixture(open).findAll("[data-shape-text-warp-adjustment]")).toHaveLength(0);
  });
});
