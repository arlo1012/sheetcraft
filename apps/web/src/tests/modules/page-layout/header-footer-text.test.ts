import { describe, expect, test } from "vitest";
import {
  applyHeaderFooterSectionFormat,
  parseHeaderFooterRuns,
  DEFAULT_HEADER_FOOTER_FORMAT,
  decodeHeaderFooterText,
  encodeHeaderFooterText,
  previewHeaderFooterRuns,
  type HeaderFooterFieldLabels,
} from "../../../modules/page-layout/header-footer-text";

const labels: HeaderFooterFieldLabels = {
  pageNumber: "Page",
  pageCount: "Pages",
  sheetName: "Sheet",
  fileName: "File",
  date: "Date",
  time: "Time",
};

describe("header and footer text", () => {
  test("round-trips fields, raw ampersands, line breaks and unknown controls through editor text", () => {
    const source = "Sales && Growth\n&P/&N &[literal] &Q";
    const editor = decodeHeaderFooterText(source, labels);
    expect(editor).toBe("Sales & Growth\n&[Page]/&[Pages] &[literal] &Q");
    expect(encodeHeaderFooterText(editor, labels)).toContain(
      "Sales && Growth\n&P/&N &&[literal] &&Q",
    );
  });

  test("parses OOXML formatting into styled preview runs", () => {
    const runs = previewHeaderFooterRuns('&"Calibri,Bold Italic"&12&Kff0000Title &P&BNext', {
      pageNumber: 3,
      pageCount: 8,
      sheetName: "Budget",
      fileName: "book.xlsx",
      now: new Date("2026-01-02T03:04:00Z"),
      locale: "en-US",
    });
    expect(runs).toEqual([
      {
        text: "Title ",
        format: {
          fontFamily: "Calibri",
          fontSize: 12,
          bold: true,
          italic: true,
          underline: false,
          color: "FF0000",
        },
      },
      {
        text: "3",
        format: {
          fontFamily: "Calibri",
          fontSize: 12,
          bold: true,
          italic: true,
          underline: false,
          color: "FF0000",
        },
      },
      {
        text: "Next",
        format: {
          fontFamily: "Calibri",
          fontSize: 12,
          bold: false,
          italic: true,
          underline: false,
          color: "FF0000",
        },
      },
    ]);
  });

  test("resolves every supported field in preview context", () => {
    const now = new Date("2026-01-02T03:04:00Z");
    const context = {
      pageNumber: 3,
      pageCount: 8,
      sheetName: "Budget",
      fileName: "book.xlsx",
      now,
      locale: "en-US",
    };
    const text = previewHeaderFooterRuns("&A|&F|&D|&T|&P/&N", context)
      .map((run) => run.text)
      .join("");
    expect(text).toContain("Budget|book.xlsx|");
    expect(text).toContain("|3/8");
    expect(text).toContain(new Intl.DateTimeFormat("en-US").format(now));
    expect(text).toContain(new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(now));
  });

  test("applies one format without losing field codes, newlines, or unsupported controls", () => {
    const formatted = applyHeaderFooterSectionFormat('&"Arial,Regular"&9Old\n&P&Q', {
      fontFamily: "Aptos",
      fontSize: 14,
      bold: true,
      italic: false,
      underline: true,
      color: "#123abc",
    });
    expect(formatted).toBe('&"Aptos,Bold"&14&K123ABC&UOld\n&P&Q');
  });
});

test("keeps underline, strike and script controls out of text and separates their runs", () => {
  const runs = parseHeaderFooterRuns(
    "Plain&Edouble&Edone&Sstrike&Sdone&Xsup&Yignored&Xnormal&Ysub&Yend",
  );
  expect(runs.map(({ text }) => text)).toEqual([
    "Plain",
    "double",
    "done",
    "strike",
    "done",
    "supignored",
    "normal",
    "sub",
    "end",
  ]);
  expect(runs[1]?.format.underline).toBe("double");
  expect(runs[2]?.format.underline).toBe(false);
  expect(runs[3]?.format.strikethrough).toBe(true);
  expect(runs[4]?.format.strikethrough).toBeUndefined();
  expect(runs[5]?.format.fontScript).toBe("superscript");
  expect(runs[6]?.format.fontScript).toBeUndefined();
  expect(runs[7]?.format.fontScript).toBe("subscript");
  expect(runs[8]?.format.fontScript).toBeUndefined();
});

test("replaces old font effects without consuming fields or escaped ampersands", () => {
  const format = {
    ...DEFAULT_HEADER_FOOTER_FORMAT,
    underline: "double" as const,
    strikethrough: true,
    fontScript: "subscript" as const,
  };
  const value = applyHeaderFooterSectionFormat(
    '&"Calibri,Bold"&96&K112233&U&S&XTitle && Co\n&P/&N &Q',
    format,
  );
  expect(value).toBe('&"Arial,Regular"&10&K000000&E&S&YTitle && Co\n&P/&N &Q');
  const runs = parseHeaderFooterRuns(value);
  expect(runs[0]?.format).toEqual(format);
  expect(decodeHeaderFooterText(value, labels)).toBe("Title & Co\n&[Page]/&[Pages] &Q");
  expect(encodeHeaderFooterText("&[Page]", labels, format)).toBe(
    '&"Arial,Regular"&10&K000000&E&S&Y&P',
  );
});
