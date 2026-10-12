import { flushPromises, mount } from "@vue/test-utils";
import { describe, expect, test } from "vitest";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import DrawingContent from "../../../modules/sheet-drawings/components/DrawingContent.vue";
import { createPictureRotation3d } from "../../../modules/sheet-images/picture-effect-edit";
import { createAppI18n } from "../../../shared/i18n";
import { getStandardShapeGeometry } from "../../../modules/sheet-drawings/shape-geometry";
import {
  getShapeEndPaint,
  shapeDrawingContainsWorldPoint,
  standardShapeAppearance,
} from "../../../modules/sheet-drawings/shape-line-paint";
const shape: SheetGraphicDrawing = {
  id: "s",
  kind: "shape",
  name: "s",
  anchor: { row: 0, column: 0 },
  offsetX: 0,
  offsetY: 0,
  width: 180,
  height: 90,
  text: "",
  shape: "rectangle",
  shapeGeometry: { preset: "roundRect" },
  fill: "#abcdef",
  stroke: "#123456",
  strokeWidth: 2,
  color: "#123456",
  fontSize: 14,
  bold: false,
  italic: false,
  rotation: 37,
};
function render(drawing = shape) {
  return mount(DrawingContent, {
    props: { drawing },
    global: { plugins: [createAppI18n("en-US")] },
  });
}
describe("standard drawing pixel consumers", () => {
  test("uses native actual-sized path and keeps old nine renderer opt-in", () => {
    const w = render();
    expect(w.findAll("[data-standard-shape-path]")).toHaveLength(1);
    expect(w.get("svg").attributes("viewBox")).toBe("0 0 180 90");
    expect(w.attributes("style")).toContain("rotate(37deg)");
    expect(w.find("rect").exists()).toBe(false);
    w.unmount();
    const { shapeGeometry: _shapeGeometry, ...legacy } = shape;
    const old = render(legacy);
    expect(old.get("svg").attributes("viewBox")).toBe("0 0 100 100");
    expect(old.find("rect").exists()).toBe(true);
    old.unmount();
  });
  test("transparent fill and stroke become none rather than transparent painted hit surfaces", () => {
    const w = render({ ...shape, fill: "transparent", stroke: "transparent" });
    expect(w.get("[data-standard-shape-path]").attributes()).toMatchObject({
      fill: "none",
      stroke: "none",
      "fill-rule": "nonzero",
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    });
    w.unmount();
  });
  test("uses textRect and per-path shading, does not silently substitute invalid preset", () => {
    const w = render({ ...shape, text: "label", shapeGeometry: { preset: "bevel" } });
    expect(
      w
        .findAll("[data-standard-shape-path]")
        .map((p) => p.attributes("fill"))
        .some((fill) => fill !== "#abcdef"),
    ).toBe(true);
    const g = getStandardShapeGeometry({ preset: "bevel" }, 180, 90)!;
    expect(w.get("[data-standard-shape-text]").attributes("style")).toContain(
      `left: ${(g.textRect!.left / 180) * 100}%`,
    );
    w.unmount();
    const bad = render({
      ...shape,
      shapeGeometry: { preset: "roundRect", adjustments: { adj: Number.NaN } },
    });
    expect(bad.get('[role="status"]').text()).toContain("cannot be displayed");
    expect(bad.find("svg").exists()).toBe(false);
    bad.unmount();
  });
  test.each(["triangle", "open", "stealth", "diamond", "oval"] as const)(
    "renders/hits %s line endpoints with no connector fill",
    (kind) => {
      const d: SheetGraphicDrawing = {
        ...shape,
        rotation: 0,
        shapeGeometry: { preset: "line" },
        shapeLineEnds: { begin: { kind }, end: { kind } },
        fill: "#abcdef",
      };
      const g = getStandardShapeGeometry(d.shapeGeometry, 180, 90)!;
      expect(standardShapeAppearance(d).fill).toBe("transparent");
      const markers = getShapeEndPaint(d, g);
      expect(markers).toHaveLength(2);
      for (const m of markers) {
        expect(
          [m.bounds.x, m.bounds.y, m.bounds.width, m.bounds.height].every(Number.isFinite),
        ).toBe(true);
      }
      const w = render(d);
      expect(w.get("[data-standard-shape-path]").attributes("fill")).toBe("none");
      expect(w.findAll("[data-shape-line-end]")).toHaveLength(2);
      expect(w.findAll("[data-shape-line-end]")[0]!.attributes("fill")).toBe(
        kind === "open" ? "none" : "#123456",
      );
      expect(
        shapeDrawingContainsWorldPoint(
          d,
          g,
          { x: 0, y: 0, width: 180, height: 90 },
          { x: 90, y: 45 },
        ),
      ).toBe(true);
      expect(
        shapeDrawingContainsWorldPoint(
          d,
          g,
          { x: 0, y: 0, width: 180, height: 90 },
          { x: 10, y: 80 },
        ),
      ).toBe(false);
      w.unmount();
    },
  );
  test("vertical text only changes explicitly opted-in text boxes", () => {
    const { shapeGeometry: _shapeGeometry, ...base } = shape;
    const w = render({ ...base, kind: "textBox", textDirection: "vertical", text: "中文" });
    expect(w.get(".drawing-content__text").attributes("style")).toContain(
      "writing-mode: vertical-rl",
    );
    w.unmount();
    const old = render({ ...base, kind: "textBox", text: "中文" });
    expect(old.get(".drawing-content__text").attributes("style")).not.toContain("writing-mode");
    old.unmount();
  });
});

test.each([0, 100000])("connector adjusted to%d retains both decorated endpoints", (adj1) => {
  const d: SheetGraphicDrawing = {
    ...shape,
    shapeGeometry: { preset: "bentConnector3", adjustments: { adj1 } },
    shapeLineEnds: { begin: { kind: "triangle" }, end: { kind: "triangle" } },
  };
  const g = getStandardShapeGeometry(d.shapeGeometry, 180, 90)!;
  expect(getShapeEndPaint(d, g)).toHaveLength(2);
  const w = render(d);
  expect(w.findAll("[data-shape-line-end]")).toHaveLength(2);
  w.unmount();
});

test("transparent text does not create an invisible hit layer over a donut hole", () => {
  const w = render({
    ...shape,
    shapeGeometry: { preset: "donut" },
    text: "hidden label",
    color: "transparent",
  });
  expect(w.find("[data-standard-shape-text]").exists()).toBe(false);
  w.unmount();
});

test("unsupported restored 3D text shows an explicit error instead of an unprojected text overlay", async () => {
  const drawing = {
    ...shape,
    text: "preserved label",
    shapeStyle: {
      rotation3d: { kind: "value" as const, value: createPictureRotation3d("parallel") },
    },
  };
  const original = structuredClone(drawing);
  const w = render(drawing);
  await flushPromises();
  expect(w.find("[data-standard-shape-text]").exists()).toBe(false);
  expect(w.get('[role="status"]').text()).toContain("3D shape text is not available yet");
  expect(drawing).toEqual(original);
  w.unmount();
});
