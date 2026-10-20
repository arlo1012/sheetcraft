import { expect, test, vi } from "vitest";
import { nativeColumnFixture } from "./native-column-fixture.js";

vi.mock("../../codec.js", () => {
  throw new Error("UI capabilities must not initialize the codec.");
});
vi.mock("fflate/browser", () => {
  throw new Error("UI capabilities must not initialize ZIP support.");
});
vi.mock("fast-xml-parser", () => {
  throw new Error("UI capabilities must not initialize XML support.");
});

test("the lightweight capability entry initializes without codec, ZIP or XML", async () => {
  const entry = await import("../../chart-capabilities.js");
  expect(Object.keys(entry)).toEqual([
    "unsupportedNativeChartElements",
    "supportsNativeLineSeriesStyles",
    "unsupportedNativeChartStyles",
  ]);
  const f = nativeColumnFixture();
  f.drawing.chart.elements = { titlePosition: "overlay", legendPosition: "left" };
  expect(entry.unsupportedNativeChartElements(f.drawing.chart)).toEqual([]);
});
