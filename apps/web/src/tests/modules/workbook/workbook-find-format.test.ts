import { describe, expect, test } from "vitest";
import type { SheetSearchFormat } from "@sheetcraft/core/search";
import type { CellStyle } from "@sheetcraft/core/style";
import {
  applyFindFormatChange,
  buildFindFormatFromCell,
  createFindFormatDraft,
} from "../../../modules/workbook/workbook-find-format";

describe("workbook find format", () => {
  test("copies the requested source fields, including a cleared field", () => {
    const source: CellStyle = {
      fontFamily: "Inter",
      textColor: "#112233",
      fillColor: "#aabbcc",
    };

    const format = buildFindFormatFromCell(source, "colors");
    source.textColor = "#ffffff";

    expect(format.keys).toEqual([
      "fillColor",
      "fillPattern",
      "fillPatternColor",
      "fillGradient",
      "textColor",
    ]);
    expect(format.style).toEqual({
      fillColor: "#aabbcc",
      fillPattern: undefined,
      fillPatternColor: undefined,
      fillGradient: undefined,
      textColor: "#112233",
    });
    expect(Object.hasOwn(format.style, "fillPatternColor")).toBe(true);
    expect(buildFindFormatFromCell(source, "font")).toEqual({
      keys: ["textColor"],
      style: { textColor: "#ffffff" },
    });
  });

  test("adapts an existing criterion to the standard format dialog state", () => {
    const draft = createFindFormatDraft({
      style: {
        fillColor: "#aabbcc",
        borderTop: { style: "thick", color: "#112233" },
      },
      keys: ["fillColor", "borderTop"],
    });

    expect(draft.state.fillColor).toEqual({ value: "#aabbcc", mixed: false });
    expect(draft.borderState.top).toEqual({
      value: { style: "thick", color: "#112233" },
      mixed: false,
    });
  });

  test("preserves selected keys and makes style clears explicit search criteria", () => {
    const initial: SheetSearchFormat = {
      style: { fontFamily: "Inter" },
      keys: ["fontFamily"],
    };

    const next = applyFindFormatChange(initial, {
      style: { bold: false, fillColor: "#aabbcc" },
    });

    expect(next.keys).toEqual(["fontFamily", "bold", "fillColor"]);
    expect(next.style).toEqual({
      fontFamily: "Inter",
      bold: undefined,
      fillColor: "#aabbcc",
    });
    expect(Object.hasOwn(next.style, "bold")).toBe(true);
  });

  test("uses Core border operations and only selects their affected border fields", () => {
    const cleared = applyFindFormatChange(
      {
        style: { borderTop: { style: "thin", color: "#112233" } },
        keys: ["borderTop"],
      },
      { borders: [{ preset: "top", border: null }] },
    );
    const added = applyFindFormatChange(undefined, {
      borders: [{ preset: "right", border: { style: "double", color: "#aabbcc" } }],
    });

    expect(cleared.keys).toEqual(["borderTop"]);
    expect(cleared.style).toEqual({ borderTop: undefined });
    expect(Object.hasOwn(cleared.style, "borderTop")).toBe(true);
    expect(added).toEqual({
      keys: ["borderRight"],
      style: { borderRight: { style: "double", color: "#aabbcc" } },
    });
  });

  test("does not turn a no-op inner border action into a cleared criterion", () => {
    const next = applyFindFormatChange(
      { style: { textColor: "#112233" }, keys: ["textColor"] },
      { borders: [{ preset: "inner", border: null }] },
    );

    expect(next).toEqual({
      keys: ["textColor"],
      style: { textColor: "#112233" },
    });
  });
});
