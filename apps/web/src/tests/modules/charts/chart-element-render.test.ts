import { describe, expect, test } from "vitest";
import type { ChartData, SheetChart } from "@sheetcraft/core/sheet-charts";
import { init } from "../../../modules/charts/chart-runtime";
import { createChartOption } from "../../../modules/charts/chart-option";

const source: ChartData = {
  categories: ["Positive", "Negative"],
  series: [
    { name: "Apples", values: [60, -45] },
    { name: "Pears", values: [30, -25] },
  ],
  records: [],
};
const chart: SheetChart = {
  type: "column",
  range: null,
  title: "Retained title",
  headerRow: true,
  headerColumn: true,
  seriesBy: "columns",
  legend: true,
  labels: false,
  stacked: false,
  showHidden: false,
};
type Rect = { x: number; y: number; width: number; height: number };
type MutableRect = Rect & { clone(): MutableRect; applyTransform(matrix: number[]): void };
type SceneElement = {
  getBoundingRect(): MutableRect;
  getComputedTransform(): number[] | null;
  getTextContent(): SceneElement;
};
type Component = { coordinateSystem: { getRect(): Rect } };
type Series = { getData(): { getItemGraphicEl(index: number): SceneElement } };
type RendererInternals = {
  getModel(): { getComponent(type: string): Component; getSeriesByIndex(index: number): Series };
  getViewOfComponentModel(model: Component): { group: SceneElement; _backgroundEl: SceneElement };
};
function bounds(element: SceneElement): Rect {
  const rectangle = element.getBoundingRect().clone();
  const transform = element.getComputedTransform();
  if (transform) rectangle.applyTransform(transform);
  return rectangle;
}
function render(
  changes: Partial<SheetChart>,
  inspect: (renderer: RendererInternals) => void,
  dimensions = { width: 480, height: 300 },
  data = source,
) {
  const instance = init(null, undefined, { renderer: "svg", ssr: true, ...dimensions });
  try {
    instance.setOption(createChartOption({ ...chart, ...changes }, data, dimensions));
    expect(instance.renderToSVGString()).toContain("<svg");
    inspect(instance as unknown as RendererInternals);
  } finally {
    instance.dispose();
  }
}
function overlaps(a: Rect, b: Rect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

describe("rendered chart element geometry", () => {
  test.each(["top", "bottom", "left", "right", "topRight"] as const)(
    "%s legend actually stays outside the plot when overlay is off",
    (legendPosition) => {
      for (const dimensions of [
        { width: 480, height: 300 },
        { width: 180, height: 140 },
      ]) {
        const data = {
          ...source,
          series: Array.from({ length: 24 }, (_, index) => ({
            ...source.series[index % 2]!,
            name: `${index} Very long legend name with\na newline and more text`.repeat(4),
          })),
        };
        render(
          { elements: { legendPosition } },
          (renderer) => {
            const model = renderer.getModel();
            const plot = model.getComponent("grid").coordinateSystem.getRect();
            const legend = bounds(
              renderer.getViewOfComponentModel(model.getComponent("legend"))._backgroundEl,
            );
            expect(legend.width).toBeGreaterThan(0);
            expect(legend.height).toBeGreaterThan(0);
            expect(overlaps(legend, plot)).toBe(false);
            expect(legend.x).toBeGreaterThanOrEqual(0);
            expect(legend.y).toBeGreaterThanOrEqual(0);
            expect(legend.x + legend.width).toBeLessThanOrEqual(dimensions.width + 0.5);
            expect(legend.y + legend.height).toBeLessThanOrEqual(dimensions.height + 0.5);
            expect(plot.width).toBeGreaterThan(dimensions.width * 0.2);
            expect(plot.height).toBeGreaterThan(dimensions.height * 0.2);
          },
          dimensions,
          data,
        );
      }
    },
  );
  test("overlay explicitly permits legend/plot overlap and right/top-right differ vertically", () => {
    const positions: number[] = [];
    for (const legendPosition of ["right", "topRight"] as const) {
      render({ elements: { legendPosition, legendOverlay: true } }, (renderer) => {
        const model = renderer.getModel();
        const legend = bounds(
          renderer.getViewOfComponentModel(model.getComponent("legend"))._backgroundEl,
        );
        expect(overlaps(legend, model.getComponent("grid").coordinateSystem.getRect())).toBe(true);
        positions.push(legend.y);
      });
    }
    expect(positions[0]).toBeGreaterThan(positions[1]!);
  });
  test.each(["column", "bar"] as const)(
    "%s sign-aware labels render at segment bases, ends, centers and outside signed stacks",
    (type) => {
      for (const stacked of [false, true]) {
        for (const labelPosition of ["center", "insideEnd", "insideBase", "outsideEnd"] as const) {
          render(
            {
              type,
              stacked,
              labels: true,
              elements: { titlePosition: "none", legendPosition: "right", labelPosition },
            },
            (renderer) => {
              const model = renderer.getModel();
              for (const seriesIndex of [0, 1]) {
                const data = model.getSeriesByIndex(seriesIndex).getData();
                for (const index of [0, 1]) {
                  const bar = bounds(data.getItemGraphicEl(index));
                  const label = bounds(data.getItemGraphicEl(index).getTextContent());
                  const center =
                    type === "bar" ? label.x + label.width / 2 : label.y + label.height / 2;
                  const start = type === "bar" ? bar.x : bar.y;
                  const end = start + (type === "bar" ? bar.width : bar.height);
                  const positive = index === 0;
                  const increasing = type === "bar" ? positive : !positive;
                  if (labelPosition === "outsideEnd") {
                    expect(increasing ? center > end : center < start).toBe(true);
                  } else if (labelPosition === "center") {
                    expect(center).toBeCloseTo((start + end) / 2, 0);
                  } else {
                    const towardEnd = labelPosition === "insideEnd";
                    expect(
                      increasing === towardEnd
                        ? center > (start + end) / 2
                        : center < (start + end) / 2,
                    ).toBe(true);
                  }
                }
              }
            },
          );
        }
      }
    },
  );
});
