import { describe, expect, test } from "vitest";
import type { TableStyleDefinition } from "@sheetcraft/core/table-styles";
import {
  cellStyleToCss,
  previewCells,
  tablePreviewDimensions,
} from "../../../modules/table-styles/table-style-presentation";

const style: TableStyleDefinition = {
  id: "table-custom-preview",
  name: "Preview",
  category: "custom",
  elements: {
    wholeTable: { style: { fillColor: "#ffffff" } },
    firstColumnStripe: { style: { fillColor: "#4f81bd" }, stripeSize: 2 },
    secondColumnStripe: { style: { fillColor: "#c0504d" }, stripeSize: 6 },
    firstRowStripe: { style: { fillColor: "#9bbb59" }, stripeSize: 3 },
    secondRowStripe: { style: { fillColor: "#8064a2" }, stripeSize: 5 },
    firstColumn: { style: { fillColor: "#4bacc6", bold: true } },
    lastColumn: { style: { fillColor: "#f79646", bold: true } },
  },
};

describe("table-style presentation", () => {
  test("keeps the gallery preview at its standard five-by-seven dimensions", () => {
    expect(tablePreviewDimensions(style)).toEqual({ rows: 7, columns: 5 });
    expect(previewCells(style)).toHaveLength(35);
  });

  test("expands selected column stripes to include both stripe regions", () => {
    expect(tablePreviewDimensions(style, "secondColumnStripe")).toEqual({
      rows: 7,
      columns: 8,
    });

    const cells = previewCells(style, "secondColumnStripe");
    expect(cells).toHaveLength(56);
    expect(cells[8 + 1]?.style?.fillColor).toBe("#4f81bd");
    expect(cells[8 + 2]?.style?.fillColor).toBe("#c0504d");
    expect(cells[8 + 6]?.style?.fillColor).toBe("#c0504d");
  });

  test("expands selected row stripes to include both stripe regions", () => {
    expect(tablePreviewDimensions(style, "secondRowStripe")).toEqual({
      rows: 10,
      columns: 5,
    });

    const cells = previewCells(style, "secondRowStripe");
    expect(cells).toHaveLength(50);
    expect(cells[6]?.style?.fillColor).toBe("#9bbb59");
    expect(cells[5 * 5 + 1]?.style?.fillColor).toBe("#8064a2");
    expect(cells[8 * 5 + 1]?.style?.fillColor).toBe("#8064a2");
  });

  test("keeps defined first and last column elements throughout editor previews", () => {
    const optionStyle: TableStyleDefinition = {
      ...style,
      elements: {
        wholeTable: { style: { fillColor: "#ffffff" } },
        firstColumn: { style: { bold: true } },
        lastColumn: { style: { fillColor: "#f79646", bold: true } },
      },
    };
    expect(previewCells(optionStyle)[5]?.style?.bold).toBeUndefined();
    expect(previewCells(optionStyle, "firstColumn")[5]?.style?.bold).toBe(true);
    expect(previewCells(optionStyle, "lastColumn")[9]?.style).toMatchObject({
      fillColor: "#f79646",
      bold: true,
    });
    expect(previewCells(optionStyle, "wholeTable")[5]?.style?.bold).toBe(true);
    expect(previewCells(optionStyle, "wholeTable")[9]?.style).toMatchObject({
      fillColor: "#f79646",
      bold: true,
    });
  });

  test("shows defined column stripes in editor previews except while editing row stripes", () => {
    expect(previewCells(style, "wholeTable")[6]?.style?.fillColor).toBe("#4f81bd");
    expect(previewCells(style, "firstRowStripe")[6]?.style?.fillColor).toBe("#9bbb59");
  });

  test("renders fill and text decorations through the shared cell presentation helpers", () => {
    const css = cellStyleToCss({
      fillColor: "#ffffff",
      fillPattern: "darkGrid",
      fillPatternColor: "#4f81bd",
      underline: "double",
      strikethrough: true,
    });
    expect(css.backgroundColor).toBe("#ffffff");
    expect(css.backgroundImage).toContain("data:image/svg+xml");
    expect(css.textDecoration).toBe("underline line-through double");
  });
});
