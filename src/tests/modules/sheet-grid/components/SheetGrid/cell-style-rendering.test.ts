import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { setCellStyle, setCellValue } from "../../../../../modules/workbook/workbook";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid cell style rendering", () => {
  test("renders sparse cell formatting on visible values and empty cells", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        fontFamily: "Arial",
        fontSize: 18,
        bold: true,
        italic: true,
        underline: true,
        textColor: "#123456",
        fillColor: "#abcdef",
        horizontalAlign: "center",
        verticalAlign: "bottom",
      },
    );
    await nextTick();

    const cell = wrapper.get('[data-row="0"][data-column="0"]');
    const style = (cell.element as HTMLElement).style;
    expect(style.fontFamily).toBe("Arial");
    expect(style.fontSize).toBe("18px");
    expect(style.fontWeight).toBe("700");
    expect(style.fontStyle).toBe("italic");
    expect(style.textDecoration).toBe("underline");
    expect(style.color).toBe("#123456");
    expect(style.backgroundColor).toBe("#abcdef");
    expect(style.justifyContent).toBe("center");
    expect(style.alignItems).toBe("flex-end");
    expect(cell.text()).toBe("");

    setCellStyle(sheet, { row: 0, column: 0 }, null);
    await nextTick();
    expect(style.fontFamily).toBe("");
    expect(style.fontSize).toBe("");
    expect(style.fontWeight).toBe("");
    expect(style.fontStyle).toBe("");
    expect(style.textDecoration).toBe("");
    expect(style.color).toBe("");
    expect(style.backgroundColor).toBe("");
    expect(style.justifyContent).toBe("");
    expect(style.alignItems).toBe("");
  });

  test("applies the active cell style to the editor only while editing", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        fontFamily: "Courier New",
        fontSize: 20,
        textColor: "#654321",
        fillColor: "#fedcba",
        horizontalAlign: "right",
        verticalAlign: "top",
      },
    );
    await nextTick();

    const editor = wrapper.get("input.cell-editor");
    expect(editor.attributes("style")).toBeUndefined();

    await editor.trigger("keydown", { key: "x" });
    const style = (editor.element as HTMLInputElement).style;
    expect(style.fontFamily).toBe('"Courier New"');
    expect(style.fontSize).toBe("20px");
    expect(style.color).toBe("#654321");
    expect(style.backgroundColor).toBe("");
    expect(style.textAlign).toBe("right");
    const frameStyle = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element.style;
    expect(frameStyle.backgroundColor).toBe("#fedcba");
    expect(frameStyle.alignItems).toBe("flex-start");
  });

  test("sizes the editor to one formatted line at the maximum supported font size", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(sheet, { row: 0, column: 0 }, { fontSize: 72 });
    await nextTick();

    const editor = wrapper.get("input.cell-editor");
    await editor.trigger("keydown", { key: "A" });
    expect((editor.element as HTMLInputElement).style.minHeight).toBe("74px");
  });

  test("renders wrapped cell content with constrained multiline styles", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "A very long unbroken-value-that-must-wrap");
    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true, horizontalAlign: "right" });
    await nextTick();

    const cell = wrapper.get('[data-row="0"][data-column="0"]');
    const style = (cell.element as HTMLElement).style;
    expect(cell.classes()).toContain("is-wrapped");
    expect(style.whiteSpace).toBe("pre-wrap");
    expect(style.overflowWrap).toBe("anywhere");
    expect(style.textAlign).toBe("right");
    expect(cell.get(".sheet-cell-layer__value").attributes("style")).toBeUndefined();
    expect((cell.element.parentElement as HTMLElement).style.height).not.toBe("24px");

    setCellStyle(sheet, { row: 0, column: 0 }, null);
    await nextTick();
    expect(cell.classes()).not.toContain("is-wrapped");
    expect(style.whiteSpace).toBe("");
    expect((cell.element.parentElement as HTMLElement).style.height).toBe("24px");
  });
});
