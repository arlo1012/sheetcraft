import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { createSheet } from "@sheetcraft/core/workbook";
import { nativeDrawingAnchor, readNativeChartGeometry } from "../../drawing-geometry.js";
import { child, parseXml } from "../../pivot-xml.js";

// Extracted without rewriting from the synthetic axis-title column's WPS saveback.
const actual = readFileSync(new URL("./fixtures/wps-one-cell-chart.xml", import.meta.url));
function read(xml: Uint8Array = actual, wps = true) {
  const sheet = createSheet("Anchor", "anchor");
  sheet.defaultColumnWidth = 96;
  sheet.defaultRowHeight = 24;
  const anchor = child(child(parseXml(xml), "wsDr"), "oneCellAnchor");
  return readNativeChartGeometry(
    sheet,
    "oneCellAnchor",
    anchor,
    child(anchor, "graphicFrame"),
    wps,
  );
}

test("WPS saveback retains the one-cell marker instead of reinterpreting cached physical origin", () => {
  const geometry = read();
  expect(geometry).toEqual({
    anchor: { row: 6, column: 3 },
    offsetX: 8,
    offsetY: 8,
    width: 640,
    height: 400,
    approximated: false,
  });
  const sheet = createSheet("Export", "export");
  expect(
    nativeDrawingAnchor(
      sheet,
      6,
      3,
      geometry.offsetX,
      geometry.offsetY,
      geometry.width,
      geometry.height,
    ),
  ).toEqual({
    tl: { nativeCol: 3, nativeColOff: 76200, nativeRow: 6, nativeRowOff: 76200 },
    ext: { width: 640, height: 400 },
  });
});

test("canonical zero-frame and WPS physical-frame one-cell variants have the same anchor", () => {
  const canonical = new TextEncoder().encode(
    actual.toString().replace('x="3994785" y="1447800"', 'x="0" y="0"'),
  );
  expect(read(canonical, false)).toEqual(read());
});

test("nonzero one-cell transform still requires the recognized WPS properties gate", () => {
  expect(() => read(actual, false)).toThrow("Unsupported one-cell frame transform");
});

test.each(["-1", "1.5", "NaN", "9525000001", "9007199254740992"])(
  "rejects invalid cached origin %s even when marker is valid",
  (offset) => {
    expect(() =>
      read(new TextEncoder().encode(actual.toString().replace('x="3994785"', `x="${offset}"`))),
    ).toThrow();
  },
);

test("one-cell extent disagreement remains blocked", () => {
  expect(() =>
    read(
      new TextEncoder().encode(
        actual.toString().replace('<a:ext cx="6096000"', '<a:ext cx="6096001"'),
      ),
    ),
  ).toThrow();
});
