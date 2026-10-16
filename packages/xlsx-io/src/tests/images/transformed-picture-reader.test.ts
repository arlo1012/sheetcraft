import { strToU8 } from "fflate/browser";
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  createWorkbook,
  getActiveSheet,
  setColumnWidth,
  setRowHeight,
} from "@sheetcraft/core/workbook";
import { createPictureSheetMetrics } from "@sheetcraft/core/picture-axis-metrics";
import { resolvePictureAnchorRect } from "@sheetcraft/core/picture-frame";
import type { FramedFloatingImage } from "@sheetcraft/core/picture-object";
import {
  inspectNativePicture,
  readXlsxPictures,
  type PictureAnchorKind,
} from "../../picture-reader.js";
import { child, parseXml } from "../../pivot-xml.js";
import { CompatibilityReportBuilder } from "../../report.js";

const location = "xl/drawings/drawing1.xml.picture";
const rect = { x: 110, y: 78, width: 120, height: 80 };
const kinds: PictureAnchorKind[] = ["oneCellAnchor", "twoCellAnchor", "absoluteAnchor"];
const emu = (pixels: number) => Math.round(pixels * 9525);
const marker = (
  tag: string,
  column: number,
  columnOffset: number,
  row: number,
  rowOffset: number,
) =>
  `<xdr:${tag}><xdr:col>${column}</xdr:col><xdr:colOff>${emu(columnOffset)}</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${emu(rowOffset)}</xdr:rowOff></xdr:${tag}>`;

type Options = {
  crop?: string;
  fill?: string;
  xfrmAttributes?: string;
  transform?: Partial<typeof rect> | false;
  editAs?: "oneCell" | "absolute";
};

/** Reader-unit fixture, not a claim about Excel or WPS producer behavior. */
function xml(kind: PictureAnchorKind = "oneCellAnchor", options: Options = {}) {
  const physical = { ...rect, ...options.transform };
  const extent = `<xdr:ext cx="${emu(rect.width)}" cy="${emu(rect.height)}"/>`;
  const anchor =
    kind === "absoluteAnchor"
      ? `<xdr:pos x="${emu(rect.x)}" y="${emu(rect.y)}"/>${extent}`
      : `${marker("from", 1, 10, 3, 6)}${kind === "oneCellAnchor" ? extent : marker("to", 2, 30, 6, 14)}`;
  const transform =
    options.transform === false
      ? ""
      : `<a:xfrm ${options.xfrmAttributes ?? ""}><a:off x="${emu(physical.x)}" y="${emu(physical.y)}"/><a:ext cx="${emu(physical.width)}" cy="${emu(physical.height)}"/></a:xfrm>`;
  return `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><xdr:${kind}${options.editAs ? ` editAs="${options.editAs}"` : ""}>${anchor}<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="1" name="Picture 1" descr="Native editable picture"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId1"/>${options.crop === undefined ? "" : `<a:srcRect ${options.crop}/>`}<a:stretch><a:fillRect ${options.fill ?? ""}/></a:stretch></xdr:blipFill><xdr:spPr>${transform}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:${kind}></xdr:wsDr>`;
}

function inspect(kind: PictureAnchorKind, source: string) {
  return inspectNativePicture(
    kind,
    child(child(parseXml(strToU8(source)), "wsDr"), kind),
    location,
  );
}

function read(kind: PictureAnchorKind, source: string) {
  const workbook = createWorkbook({ id: "transformed", sheetId: "s", sheetName: "Pictures" });
  const sheet = getActiveSheet(workbook);
  for (let column = 0; column < 12; column++) setColumnWidth(sheet, column, 100);
  for (let row = 0; row < 25; row++) setRowHeight(sheet, row, 24);
  const picture = { ...inspect(kind, source), sheetIndex: 0, assetId: "original-source" };
  const report = new CompatibilityReportBuilder();
  readXlsxPictures(workbook, [picture], [], report);
  return { sheet, picture: sheet.floatingImages[0] as FramedFloatingImage, report: report.build() };
}

function expectBlock(run: () => unknown, path?: string) {
  try {
    run();
    expect.fail("Expected a native-picture compatibility block.");
  } catch (error) {
    expect(error).toMatchObject({
      name: "XlsxCompatibilityError",
      report: {
        issues: [
          expect.objectContaining({
            code: "drawing-or-media",
            severity: "block",
            ...(path ? { locations: [path] } : {}),
          }),
        ],
      },
    });
  }
}

describe("transformed native picture reader", () => {
  test.each(kinds)("imports crop, signed rotation and flips with %s semantics", (kind) => {
    const result = read(
      kind,
      xml(kind, {
        crop: 'l="10000" t="20%" r="30000" b="10%"',
        xfrmAttributes: 'rot="-5400000" flipH="true" flipV="1"',
      }),
    );
    const { frame } = result.picture;
    expect(frame.anchor.mode).toBe(
      kind === "absoluteAnchor"
        ? "fixed"
        : kind === "oneCellAnchor"
          ? "move-only"
          : "move-and-size",
    );
    expect(frame.angleDeg).toBe(270);
    expect(frame.flipHorizontal).toBe(true);
    expect(frame.flipVertical).toBe(true);
    expect(frame.source.widthRatio).toBeCloseTo(5 / 3, 12);
    expect(frame.source.heightRatio).toBeCloseTo(10 / 7, 12);
    expect(frame.source.offsetXRatio).toBeCloseTo(-1 / 6, 12);
    expect(frame.source.offsetYRatio).toBeCloseTo(1 / 14, 12);
    expect(resolvePictureAnchorRect(frame.anchor, createPictureSheetMetrics(result.sheet))).toEqual(
      rect,
    );
    expect(result.picture.assetId).toBe("original-source");
    expect(result.picture.transform).toEqual({
      appearance: {
        suppressThemeEffects: { shadow: true, outline: true, reflection: true, bevel: true },
      },
    });
    expect(result.report.issues).toEqual([]);
  });

  test.each([undefined, "", 'l="0%" t="0" r="0.000%" b="0"'])(
    "treats absent or zero srcRect as identity: %s",
    (crop) => {
      const { picture, report } = read(
        "oneCellAnchor",
        xml("oneCellAnchor", { crop, transform: false }),
      );
      expect(picture.frame.source).toEqual({
        widthRatio: 1,
        heightRatio: 1,
        offsetXRatio: 0,
        offsetYRatio: 0,
      });
      expect(picture.frame.angleDeg).toBe(0);
      expect(picture.frame.flipHorizontal).toBeUndefined();
      expect(picture.frame.flipVertical).toBeUndefined();
      expect(report.issues).toEqual([]);
    },
  );

  test("retains decimal-percent precision and default omitted crop edges", () => {
    const picture = inspect("oneCellAnchor", xml("oneCellAnchor", { crop: 'l="12.34567%"' }));
    expect(picture.geometry.crop.left).toBeCloseTo(12345.67, 10);
    expect(picture.geometry.crop).toMatchObject({ top: 0, right: 0, bottom: 0 });
  });

  test.each([
    ["0", 0],
    ["21600000", 0],
    ["-21600000", 0],
    ["60000", 1],
    ["-60000", 359],
    ["2147483647", (2147483647 % 21600000) / 60000],
    ["-2147483648", ((-2147483648 % 21600000) + 21600000) / 60000],
  ] as const)("normalizes schema-range angle %s", (angle, expected) => {
    const result = read(
      "oneCellAnchor",
      xml("oneCellAnchor", { xfrmAttributes: `rot="${angle}"` }),
    );
    expect(result.picture.frame.angleDeg).toBeCloseTo(expected, 12);
  });

  test.each([
    "",
    "1.0",
    "6e4",
    "60000px",
    "NaN",
    "Infinity",
    " 60000",
    "60000 ",
    "2147483648",
    "-2147483649",
  ])("blocks malformed or out-of-range angle %s", (angle) =>
    expectBlock(
      () => inspect("oneCellAnchor", xml("oneCellAnchor", { xfrmAttributes: `rot="${angle}"` })),
      `${location}.xfrm.rot`,
    ),
  );

  test.each([
    "",
    "-1",
    "-0.001%",
    "100000",
    "100%",
    "1.5",
    "1e3",
    "1e-2%",
    "10%junk",
    "NaN",
    "Infinity",
    " 1",
    "1 ",
  ])("blocks malformed, negative or exhausted crop %s", (value) =>
    expectBlock(() => inspect("oneCellAnchor", xml("oneCellAnchor", { crop: `l="${value}"` }))),
  );

  test.each(['l="60000" r="40000"', 't="50%" b="50%"', 'l="60000" r="50000"'])(
    "blocks nonpositive remaining crop extent %s",
    (crop) =>
      expectBlock(
        () => inspect("oneCellAnchor", xml("oneCellAnchor", { crop })),
        `${location}.srcRect`,
      ),
  );

  test.each(['l="1"', 't="-1"', 'r="0.01%"', 'b="1e0"'])("keeps fillRect zero-only: %s", (fill) => {
    expectBlock(() => inspect("oneCellAnchor", xml("oneCellAnchor", { fill })));
  });

  test.each(["0", "false", "1", "true"])("accepts exact XML boolean %s", (value) => {
    const { picture } = read(
      "oneCellAnchor",
      xml("oneCellAnchor", { xfrmAttributes: `flipH="${value}" flipV="${value}"` }),
    );
    expect(!!picture.frame.flipHorizontal).toBe(value === "1" || value === "true");
    expect(!!picture.frame.flipVertical).toBe(value === "1" || value === "true");
  });

  test.each(["TRUE", "False", "yes", "2", "", " true"])(
    "blocks other boolean lexical forms: %s",
    (value) => {
      expectBlock(
        () =>
          inspect("oneCellAnchor", xml("oneCellAnchor", { xfrmAttributes: `flipH="${value}"` })),
        `${location}.xfrm.flipH`,
      );
    },
  );

  test.each(kinds)("warns on legal redundant transformed xfrm differences for %s", (kind) => {
    for (const options of [
      { crop: 'l="10000"', transform: { width: 121 } },
      { xfrmAttributes: 'flipH="1"', transform: { x: 0, y: 0 } },
      { xfrmAttributes: 'rot="5400000"', transform: { width: 80, height: 120 } },
    ]) {
      const { picture, sheet, report } = read(kind, xml(kind, options));
      expect(
        resolvePictureAnchorRect(picture.frame.anchor, createPictureSheetMetrics(sheet)),
      ).toEqual(rect);
      expect(picture.frame.anchor.mode).toBe(
        kind === "absoluteAnchor"
          ? "fixed"
          : kind === "oneCellAnchor"
            ? "move-only"
            : "move-and-size",
      );
      expect(picture.frame.angleDeg).toBe(options.xfrmAttributes === 'rot="5400000"' ? 90 : 0);
      expect(!!picture.frame.flipHorizontal).toBe(options.xfrmAttributes === 'flipH="1"');
      expect(picture.frame.source.widthRatio).toBeCloseTo(options.crop ? 10 / 9 : 1, 12);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          code: "picture-geometry-approximated",
          severity: "warning",
          count: 1,
        }),
      );
    }
  });

  test("allows one EMU of encoding roundoff and warns on a two-EMU redundant difference", () => {
    const options = { xfrmAttributes: 'rot="60000"', transform: { x: rect.x + 1 / 9525 } };
    const rounded = read("oneCellAnchor", xml("oneCellAnchor", options));
    expect(rounded.picture.frame.angleDeg).toBe(1);
    expect(rounded.report.issues).toEqual([]);
    options.transform.x = rect.x + 2 / 9525;
    const different = read("oneCellAnchor", xml("oneCellAnchor", options));
    expect(different.picture.frame.angleDeg).toBe(1);
    expect(
      resolvePictureAnchorRect(
        different.picture.frame.anchor,
        createPictureSheetMetrics(different.sheet),
      ),
    ).toEqual(rect);
    expect(different.report.issues).toContainEqual(
      expect.objectContaining({
        code: "picture-geometry-approximated",
        severity: "warning",
        count: 1,
      }),
    );
  });

  test.each(["oneCell", "absolute"] as const)(
    "preserves editAs=%s and selects its own frame despite redundant differences",
    (editAs) => {
      const baseline = read(
        "twoCellAnchor",
        xml("twoCellAnchor", { editAs, xfrmAttributes: 'rot="1800000"' }),
      );
      expect(baseline.picture.frame.anchor.mode).toBe(
        editAs === "absolute" ? "fixed" : "move-only",
      );
      expect(baseline.picture.frame.angleDeg).toBe(30);
      const { picture, sheet, report } = read(
        "twoCellAnchor",
        xml("twoCellAnchor", { editAs, crop: 'l="10000"', transform: { width: 121 } }),
      );
      expect(picture.frame.anchor).toEqual(
        editAs === "absolute"
          ? { mode: "fixed", x: 110, y: 78, size: { width: 121, height: 80 } }
          : {
              mode: "move-only",
              offsetMode: "free-pixels",
              origin: { column: { index: 1, offset: 10 }, row: { index: 3, offset: 6 } },
              size: { width: 121, height: 80 },
            },
      );
      expect(
        resolvePictureAnchorRect(picture.frame.anchor, createPictureSheetMetrics(sheet)),
      ).toEqual({ ...rect, width: 121 });
      expect(picture.frame.source.widthRatio).toBeCloseTo(10 / 9, 12);
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          code: "picture-geometry-approximated",
          severity: "warning",
          count: 1,
        }),
      );
    },
  );

  test("free relative markers retain raw overflowing offsets rather than fitting the grid", () => {
    const source = xml("twoCellAnchor", { transform: false })
      .replace(marker("from", 1, 10, 3, 6), marker("from", 1, 110.2, 3, 30.4))
      .replace(marker("to", 2, 30, 6, 14), marker("to", 3, 135.8, 7, 36.8));
    const { picture, sheet, report } = read("twoCellAnchor", source);
    expect(picture.frame.anchor).toEqual({
      mode: "move-and-size",
      offsetMode: "free-pixels",
      start: { column: { index: 1, offset: 110.2 }, row: { index: 3, offset: 30.4 } },
      end: { column: { index: 3, offset: 135.8 }, row: { index: 7, offset: 36.8 } },
    });
    expect(
      resolvePictureAnchorRect(picture.frame.anchor, createPictureSheetMetrics(sheet)),
    ).toEqual({
      x: expect.closeTo(210.2, 10),
      y: expect.closeTo(102.4, 10),
      width: expect.closeTo(225.6, 10),
      height: expect.closeTo(102.4, 10),
    });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "picture-geometry-approximated",
        severity: "warning",
        count: 1,
      }),
    );
  });

  test("fixed complete xfrm bypasses an unselected physically collapsed marker span", () => {
    const source = xml("twoCellAnchor", { editAs: "absolute", xfrmAttributes: 'rot="2220000"' })
      .replace(marker("from", 1, 10, 3, 6), marker("from", 1, 200, 3, 6))
      .replace(marker("to", 2, 30, 6, 14), marker("to", 2, 0, 6, 14));
    const { picture, report } = read("twoCellAnchor", source);
    expect(picture.frame.anchor).toEqual({
      mode: "fixed",
      x: 110,
      y: 78,
      size: { width: 120, height: 80 },
    });
    expect(picture.frame.angleDeg).toBe(37);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "picture-geometry-approximated",
        severity: "warning",
        count: 1,
      }),
    );
    expectBlock(() => read("twoCellAnchor", source.replace(' editAs="absolute"', "")));
    const moving = read("twoCellAnchor", source.replace('editAs="absolute"', 'editAs="oneCell"'));
    expect(moving.picture.frame.anchor).toEqual({
      mode: "move-only",
      offsetMode: "free-pixels",
      origin: { column: { index: 1, offset: 200 }, row: { index: 3, offset: 6 } },
      size: { width: 120, height: 80 },
    });
    expect(moving.report.issues).toContainEqual(
      expect.objectContaining({ code: "picture-geometry-approximated" }),
    );
    expectBlock(() =>
      read(
        "twoCellAnchor",
        source
          .replace('editAs="absolute"', 'editAs="oneCell"')
          .replace(/<a:xfrm[^>]*>.*?<\/a:xfrm>/, ""),
      ),
    );
  });

  test("oneCell editAs keeps from binding, ignores redundant off, and falls back only when xfrm is absent", () => {
    const chosen = read(
      "twoCellAnchor",
      xml("twoCellAnchor", {
        editAs: "oneCell",
        transform: { x: 999, y: 999, width: 121, height: 81 },
      }),
    );
    expect(chosen.picture.frame.anchor).toEqual({
      mode: "move-only",
      offsetMode: "free-pixels",
      origin: { column: { index: 1, offset: 10 }, row: { index: 3, offset: 6 } },
      size: { width: 121, height: 81 },
    });
    const fallback = read(
      "twoCellAnchor",
      xml("twoCellAnchor", { editAs: "oneCell", transform: false }),
    );
    expect(fallback.picture.frame.anchor).toMatchObject({
      mode: "move-only",
      size: { width: 120, height: 80 },
    });
    for (const invalid of [
      xml("twoCellAnchor", { editAs: "oneCell" }).replace('<a:ext cx="1143000"', '<a:ext cx="0"'),
      xml("twoCellAnchor", { editAs: "oneCell" }).replace('<a:ext cx="1143000"', '<a:ext cx="-1"'),
      xml("twoCellAnchor", { editAs: "oneCell" }).replace(
        "<xdr:col>1</xdr:col>",
        "<xdr:col>-1</xdr:col>",
      ),
      xml("twoCellAnchor", { editAs: "oneCell" }).replace(
        marker("to", 2, 30, 6, 14),
        marker("to", 0, 0, 0, 0),
      ),
    ])
      expectBlock(() => read("twoCellAnchor", invalid));
  });

  test("absolute editAs without xfrm freezes parsed markers with a warning", () => {
    const { picture, report } = read(
      "twoCellAnchor",
      xml("twoCellAnchor", { editAs: "absolute", transform: false }),
    );
    expect(picture.frame.anchor).toEqual({
      mode: "fixed",
      x: 110,
      y: 78,
      size: { width: 120, height: 80 },
    });
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "picture-geometry-approximated",
        severity: "warning",
        count: 1,
      }),
    );
  });

  test("retains true move-and-size behavior after rotation", () => {
    const { picture, sheet } = read(
      "twoCellAnchor",
      xml("twoCellAnchor", { xfrmAttributes: 'rot="5400000"' }),
    );
    setColumnWidth(sheet, 1, 140);
    setRowHeight(sheet, 3, 30);
    expect(picture.frame.anchor.mode).toBe("move-and-size");
    expect(
      resolvePictureAnchorRect(picture.frame.anchor, createPictureSheetMetrics(sheet)),
    ).toEqual({ ...rect, width: 160, height: 86 });
  });

  test("preserves the measured B1 WPS fixed physical route with supported rotation", () => {
    const source = readFileSync(
      new URL("./fixtures/wps-fixed-picture.xml", import.meta.url),
      "utf8",
    );
    const { picture, report } = read("twoCellAnchor", source);
    expect(picture.frame.anchor).toEqual({
      mode: "fixed",
      x: 710,
      y: 78,
      size: { width: 120, height: 80 },
    });
    expect(report.issues).toContainEqual(
      expect.objectContaining({ code: "picture-geometry-approximated" }),
    );
    const rotated = read("twoCellAnchor", source.replace("<a:xfrm>", '<a:xfrm rot="5400000">'));
    expect(rotated.picture.frame.anchor).toEqual(picture.frame.anchor);
    expect(rotated.picture.frame.angleDeg).toBe(90);
    expect(rotated.report.issues).toContainEqual(
      expect.objectContaining({
        code: "picture-geometry-approximated",
        severity: "warning",
        count: 1,
      }),
    );
  });

  test.each([
    [
      "unknown crop field",
      (source: string) => source.replace("<a:stretch>", '<a:srcRect custom="0"/><a:stretch>'),
    ],
    [
      "duplicate crop",
      (source: string) => source.replace("<a:stretch>", "<a:srcRect/><a:srcRect/><a:stretch>"),
    ],
    [
      "effect child",
      (source: string) => source.replace("</xdr:spPr>", "<a:effectLst/></xdr:spPr>"),
    ],
    ["shape preset", (source: string) => source.replace('prst="rect"', 'prst="ellipse"')],
    [
      "transform child",
      (source: string) => source.replace("</a:xfrm>", '<a:chOff x="0" y="0"/></a:xfrm>'),
    ],
  ] as const)("retains strict B1 allowlists: %s", (_name, mutate) => {
    expectBlock(() =>
      inspect("oneCellAnchor", mutate(xml("oneCellAnchor", { xfrmAttributes: 'rot="60000"' }))),
    );
  });
});
