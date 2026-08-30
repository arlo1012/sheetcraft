import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { setCellStyle } from "../../../../../modules/workbook/workbook";
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
});
