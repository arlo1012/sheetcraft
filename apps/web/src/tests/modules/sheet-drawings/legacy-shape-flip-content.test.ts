import { mount, type VueWrapper } from "@vue/test-utils";
import { toRaw } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import type { DrawingShape, SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import StandardShapeContent from "../../../modules/sheet-drawings/components/StandardShapeContent.vue";
import ShapeDetailedContent from "../../../modules/sheet-drawings/components/ShapeDetailedContent.vue";
import ShapeTextContent from "../../../modules/sheet-drawings/components/ShapeTextContent.vue";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import { getDrawingShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import { getLegacyShapeGeometry } from "../../../modules/sheet-drawings/legacy-shape-geometry";
import { createDefaultShapeText } from "../../../modules/sheet-drawings/shape-text-options";
import { createAppI18n } from "../../../shared/i18n";

const wrappers = new Set<VueWrapper>();
const flags = [
  { shapeFlipX: true },
  { shapeFlipY: true },
  { shapeFlipX: true, shapeFlipY: true },
] as const;
function drawing(changes: Partial<SheetGraphicDrawing> = {}): SheetGraphicDrawing {
  return {
    ...createGraphicDrawing("legacy", "shape", "Legacy", { row: 0, column: 0 }),
    shapeGeometry: undefined,
    shapeText: undefined,
    width: 150,
    height: 70,
    rotation: 37,
    text: "abr123",
    ...changes,
  };
}
function render(source: SheetGraphicDrawing) {
  const wrapper = mount(DrawingContent, {
    props: { drawing: source, legacyHitSurface: true },
    global: {
      plugins: [createAppI18n("en-US")],
      stubs: { ShapeDetailedContent: true, ShapeTextContent: true },
    },
  });
  wrappers.add(wrapper);
  return wrapper;
}
afterEach(() => {
  for (const wrapper of wrappers) wrapper.unmount();
  wrappers.clear();
});
describe("existing legacy shape flip content", () => {
  test.each([
    "rectangle",
    "roundedRectangle",
    "ellipse",
    "triangle",
    "diamond",
    "arrow",
    "line",
    "star",
    "heart",
  ] satisfies DrawingShape[])(
    "%s mirrors its original viewBox100 body inside outer37deg and keeps separate readable text",
    async (shape) => {
      const source = drawing({ shape }),
        before = structuredClone(source),
        wrapper = render(source),
        originalBody = wrapper.get("svg g").element.innerHTML;
      expect(wrapper.get("svg").attributes("viewBox")).toBe("0 0 100 100");
      for (const flip of flags) {
        await wrapper.setProps({ drawing: { ...source, ...flip } });
        const horizontal = "shapeFlipX" in flip,
          vertical = "shapeFlipY" in flip;
        expect(wrapper.get("svg g").attributes("transform")).toBe(
          `translate(${horizontal ? 100 : 0} ${vertical ? 100 : 0}) scale(${horizontal ? -1 : 1} ${vertical ? -1 : 1})`,
        );
        expect(wrapper.get("svg g").element.innerHTML).toBe(originalBody);
        expect((wrapper.get(".drawing-content").element as HTMLElement).style.transform).toBe(
          "rotate(37deg)",
        );
        expect((wrapper.get(".drawing-content__text").element as HTMLElement).style.transform).toBe(
          vertical ? "rotate(180deg)" : "",
        );
        expect(wrapper.get(".drawing-content__text").text()).toBe("abr123");
        expect(wrapper.get("svg").attributes("style")).toContain("visiblePainted");
      }
      await wrapper.setProps({ drawing: source });
      expect(wrapper.get("svg g").attributes("transform")).toBeUndefined();
      expect((wrapper.get(".drawing-content__text").element as HTMLElement).style.transform).toBe(
        "",
      );
      expect(source).toEqual(before);
    },
  );
  test.each([undefined, "vertical"] as const)(
    "old textBox direction=%s retains its symmetric inside fill/border and dedicated V180 text",
    async (textDirection) => {
      const source = drawing({
          kind: "textBox",
          textDirection,
          fill: "#eeeeee",
          stroke: "#111111",
          strokeWidth: 3,
        }),
        before = structuredClone(source),
        wrapper = render(source);
      const originalBackground = (wrapper.get(".drawing-content__text").element as HTMLElement)
        .style.background;
      for (const flip of flags) {
        await wrapper.setProps({ drawing: { ...source, ...flip } });
        const style = (wrapper.get(".drawing-content__text").element as HTMLElement).style;
        expect(style.transform).toBe("shapeFlipY" in flip ? "rotate(180deg)" : "");
        expect(style.writingMode).toBe(textDirection ? "vertical-rl" : "");
        expect(style.textOrientation).toBe(textDirection ? "mixed" : "");
        expect(style.borderWidth).toBe("3px");
        expect(style.background).toBe(originalBackground);
        expect(wrapper.find("svg").exists()).toBe(false);
      }
      expect(source).toEqual(before);
      expect(source.shapeText).toBeUndefined();
    },
  );
  test("styled legacy shape retains its actual geometry and existing detailed paint/text consumers", () => {
    const source = drawing({ shape: "arrow", shapeStyle: {}, shapeFlipX: true, shapeFlipY: true }),
      before = structuredClone(source),
      wrapper = render(source);
    expect(toRaw(wrapper.getComponent(StandardShapeContent).props("drawing"))).toBe(source);
    expect(toRaw(wrapper.getComponent(ShapeDetailedContent).props("drawing"))).toBe(source);
    expect(getDrawingShapeGeometry(source)).toBe(getLegacyShapeGeometry("arrow", 150, 70));
    expect((wrapper.get("[data-standard-shape-text]").element as HTMLElement).style.transform).toBe(
      "rotate(180deg)",
    );
    expect(source).toEqual(before);
    expect(source.shapeGeometry).toBeUndefined();
    expect(source.shapeText).toBeUndefined();
  });
  test("detailed vertical legacy text retains its original model and canvas text consumer", () => {
    const shapeText = createDefaultShapeText();
    shapeText.layout.direction = "vertical-rl";
    const source = drawing({ shape: "heart", shapeText, shapeFlipX: true, shapeFlipY: true }),
      before = structuredClone(source),
      wrapper = render(source);
    expect(toRaw(wrapper.getComponent(ShapeTextContent).props("drawing"))).toBe(source);
    expect(wrapper.find("[data-standard-shape-text]").exists()).toBe(false);
    expect(getDrawingShapeGeometry(source)).toBe(getLegacyShapeGeometry("heart", 150, 70));
    expect(source).toEqual(before);
  });
  test("standard plain text uses the existing asymmetric preset text rectangle with V180", () => {
    const source = drawing({ shapeGeometry: { preset: "triangle" }, shapeFlipY: true }),
      wrapper = render(source),
      rect = getDrawingShapeGeometry(source)!.textRect!,
      style = (wrapper.get("[data-standard-shape-text]").element as HTMLElement).style;
    expect(parseFloat(style.top)).toBeCloseTo(
      ((source.height - rect.bottom) / source.height) * 100,
    );
    expect(style.transform).toBe("rotate(180deg)");
    expect(source.shapeText).toBeUndefined();
  });
});
