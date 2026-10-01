import { describe, expect, test } from "vitest";
import {
  applyHeaderFooterSectionFormat,
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
