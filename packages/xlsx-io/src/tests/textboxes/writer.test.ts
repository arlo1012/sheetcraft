import { describe, expect, test, vi } from "vitest";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import type { SheetDrawing, SheetFramedGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import { serializeWorkbook, deserializeWorkbook } from "@sheetcraft/core/serialization";
import {
  getNativeTextBoxUnsupportedPath,
  assertSupportedNativeTextBox,
} from "../../textbox-capabilities.js";
import { nativeTextBoxAnchorXml } from "../../native/writer-textboxes.js";
import { webCreatedTextBox, secondWebCreatedTextBox } from "./web-created-textbox.js";
const sheet = () => getActiveSheet(createWorkbook({ id: "w", sheetId: "s", sheetName: "Test" }));
const drawing = () => structuredClone(webCreatedTextBox);
function output(d = drawing()) {
  return nativeTextBoxAnchorXml(d, sheet(), 7);
}
function document(d = drawing()) {
  return `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${output(d)}</xdr:wsDr>`;
}
describe("native rectangular text box writer", () => {
  test("admits the real Web-created model after Core serialization, without mutation", () => {
    const workbook = createWorkbook({ id: "w", sheetId: "s", sheetName: "Test" });
    getActiveSheet(workbook).drawings = [drawing(), structuredClone(secondWebCreatedTextBox)];
    const before = serializeWorkbook(workbook),
      restored = deserializeWorkbook(before),
      restoredSheet = getActiveSheet(restored);
    expect(
      getNativeTextBoxUnsupportedPath(restoredSheet.drawings![1]!, restoredSheet),
    ).toBeUndefined();
    const d = restoredSheet.drawings![0]!;
    expect(getNativeTextBoxUnsupportedPath(d, restoredSheet)).toBeUndefined();
    const xml = nativeTextBoxAnchorXml(d as SheetFramedGraphicDrawing, restoredSheet, 7);
    expect(xml).toContain('sz="1100"');
    expect(xml).toContain('typeface="Inter"');
    expect(xml).toContain('<xdr:cNvPr id="7"');
    expect(xml).toContain("<xdr:twoCellAnchor>");
    expect(serializeWorkbook(workbook)).toEqual(before);
    expect(XMLValidator.validate(document())).toBe(true);
  });
  test("uses pt margins and px base stroke while preserving body/text settings", () => {
    const d = drawing();
    d.shapeText!.layout.blockAlignment = "end";
    d.shapeText!.layout.wrap = false;
    d.shapeText!.layout.overflow = true;
    const xml = output(d);
    expect(xml).toContain('lIns="91440"');
    expect(xml).toContain('tIns="45720"');
    expect(xml).toContain('<a:ln w="9525"');
    expect(xml).toContain('anchor="b"');
    expect(xml).toContain('wrap="none"');
    expect(xml).toContain('horzOverflow="overflow" vertOverflow="overflow"');
    expect(xml).toContain("<a:noAutofit/>");
  });
  test.each(["fixed", "move-only", "move-and-size"] as const)(
    "preserves %s native anchor semantics",
    (mode) => {
      const d = drawing();
      if (mode === "fixed")
        d.shapeFrame.anchor = { mode, x: 12.5, y: 20, size: { width: 240, height: 120 } };
      if (mode === "move-only")
        d.shapeFrame.anchor = {
          mode,
          origin: { column: { index: 1, offset: 4 }, row: { index: 2, offset: 3 } },
          size: { width: 240, height: 120 },
        };
      const xml = output(d);
      expect(xml).toContain(
        mode === "fixed"
          ? '<xdr:absoluteAnchor><xdr:pos x="119063" y="190500"/>'
          : mode === "move-only"
            ? "<xdr:oneCellAnchor>"
            : "<xdr:twoCellAnchor>",
      );
      expect(xml).toContain("<a:xfrm><a:off");
    },
  );
  test("keeps empty paragraphs, spaces, literal escapes and UTF-16 run intervals", () => {
    const d = drawing();
    d.text = " A😀B \n\n_x0041_ & <last>\n";
    d.shapeText!.characterRuns = [{ start: 2, end: 4, bold: true, fontSize: 16, color: "#112233" }];
    const xml = output(d),
      parsed = new XMLParser({
        ignoreAttributes: false,
        removeNSPrefix: true,
        trimValues: false,
      }).parse(document(d));
    expect(parsed.wsDr.twoCellAnchor.sp.txBody.p).toHaveLength(4);
    expect(xml).toContain('<a:t xml:space="preserve">😀</a:t>');
    expect(xml).toContain('<a:t xml:space="preserve"> A</a:t>');
    expect(xml).toContain('<a:t xml:space="preserve">B </a:t>');
    expect(xml).toContain("_x0041_ &amp; &lt;last&gt;");
    expect(xml).toContain('sz="1200" b="1"');
  });
  test("writes typed solid RGB exact pt line and explicit noFill/noLine", () => {
    const d = drawing();
    d.shapeStyle = {
      fill: { kind: "none" },
      line: {
        kind: "value",
        value: {
          paint: { kind: "solid", color: { kind: "rgb", rgb: "#ABCDEF" }, opacity: 1 },
          widthPt: 2.25,
          dash: "solid",
          compound: "single",
          cap: "butt",
          join: "miter",
          miterLimit: 4,
        },
      },
      shadow: { kind: "none" },
    };
    expect(output(d)).toContain('<a:ln w="28575" cap="flat" cmpd="sng"');
    expect(output(d)).toContain('<a:miter lim="400000"/>');
    d.shapeStyle.line = { kind: "none" };
    expect(output(d)).toContain("<a:ln><a:noFill/></a:ln>");
    d.shapeProperties = {};
    expect(getNativeTextBoxUnsupportedPath(d, sheet())).toBeUndefined();
  });
  test.each([
    [
      "rotation",
      (d: SheetFramedGraphicDrawing) => {
        d.rotation = 30;
      },
    ],
    [
      "shapeText.fontFamily",
      (d: SheetFramedGraphicDrawing) => {
        delete d.shapeText!.fontFamily;
      },
    ],
    [
      "shapeText.fontFamily",
      (d: SheetFramedGraphicDrawing) => {
        d.shapeText!.fontFamily = "Arial, sans-serif";
      },
    ],
    [
      "shapeText.layout.autoFit",
      (d: SheetFramedGraphicDrawing) => {
        d.shapeText!.layout.autoFit = "resize-shape";
      },
    ],
    [
      "shapeText.characterRuns[0].underline",
      (d: SheetFramedGraphicDrawing) => {
        d.shapeText!.characterRuns = [{ start: 0, end: 1, underline: true }];
      },
    ],
    [
      "shapeProperties.locked",
      (d: SheetFramedGraphicDrawing) => {
        d.shapeProperties = { locked: false };
      },
    ],
    [
      "fontSize",
      (d: SheetFramedGraphicDrawing) => {
        d.fontSize = 12.345;
      },
    ],
    [
      "shapeStyle.fill.value.kind",
      (d: SheetFramedGraphicDrawing) => {
        d.shapeStyle = { fill: { kind: "value", value: { kind: "picture" } as never } };
      },
    ],
    [
      "shapeStyle.shadow",
      (d: SheetFramedGraphicDrawing) => {
        d.shapeStyle = { shadow: { kind: "value", value: {} as never } };
      },
    ],
  ] as const)("blocks unsupported source at %s", (path, edit) => {
    const d = drawing();
    edit(d);
    expect(getNativeTextBoxUnsupportedPath(d, sheet())).toBe(path);
    expect(() => assertSupportedNativeTextBox(d, sheet(), 'Test.drawings["box"]')).toThrow();
    try {
      assertSupportedNativeTextBox(d, sheet(), 'Test.drawings["box"]');
    } catch (e) {
      expect(e).toMatchObject({
        report: { issues: [{ severity: "block", locations: [`Test.drawings["box"].${path}`] }] },
      });
    }
  });
  test("preserves a common whole-selection rich run across two nonempty paragraphs", () => {
    const d = drawing();
    d.shapeText!.characterRuns = [{ start: 0, end: d.text.length, bold: true, fontSize: 20 }];
    expect(getNativeTextBoxUnsupportedPath(d, sheet())).toBeUndefined();
    const xml = output(d);
    expect(xml).toContain('<a:endParaRPr sz="1500" b="1" i="0">');
    expect(xml).toContain('<a:endParaRPr sz="1100" b="0" i="0">');
    d.text += "\n";
    d.shapeText!.characterRuns = [{ start: 0, end: d.text.length, bold: true, fontSize: 20 }];
    expect(getNativeTextBoxUnsupportedPath(d, sheet())).toBe("shapeText.characterRuns[0]");
  });
  test("rejects rich newline formatting, unknown nested fields and unrepresentable precision", () => {
    const d = drawing();
    const newline = d.text.indexOf("\n");
    d.shapeText!.characterRuns = [{ start: newline, end: newline + 1, fontSize: 20 }];
    expect(getNativeTextBoxUnsupportedPath(d, sheet())).toBe("shapeText.characterRuns[0]");
    delete d.shapeText!.characterRuns;
    Object.assign(d.shapeText!.layout, { manualLayout: {} });
    expect(getNativeTextBoxUnsupportedPath(d, sheet())).toBe("shapeText.layout.manualLayout");
    const unknownStyle = drawing();
    Object.assign(unknownStyle, { shapeStyle: { mystery: { kind: "none" } } });
    expect(getNativeTextBoxUnsupportedPath(unknownStyle, sheet())).toBe("shapeStyle.mystery");
    const precise = drawing();
    precise.shapeText!.layout.marginsPt.leftPt = 1 / 3;
    expect(getNativeTextBoxUnsupportedPath(precise, sheet())).toBe(
      "shapeText.layout.marginsPt.leftPt",
    );
  });
  test("rejects getters without invoking them, unknown fields and clamped/hidden anchors", () => {
    const d = drawing(),
      getter = vi.fn(() => "#FFFFFF");
    Object.defineProperty(d, "fill", { get: getter });
    expect(getNativeTextBoxUnsupportedPath(d, sheet())).toBe("fill");
    expect(getter).not.toHaveBeenCalled();
    const unknown = { ...drawing(), mysteryEffect: true } as SheetDrawing;
    expect(getNativeTextBoxUnsupportedPath(unknown, sheet())).toBe("mysteryEffect");
    const clamped = drawing();
    clamped.shapeFrame.anchor = {
      mode: "move-only",
      origin: { column: { index: 1, offset: 999 }, row: { index: 2, offset: 0 } },
      size: { width: 120, height: 60 },
    };
    expect(getNativeTextBoxUnsupportedPath(clamped, sheet())).toBe("shapeFrame.anchor");
  });
});
