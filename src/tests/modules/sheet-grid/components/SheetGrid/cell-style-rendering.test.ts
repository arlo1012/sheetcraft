import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { setCellStyle, setCellValue } from "../../../../../modules/workbook/workbook";
import { getCellBorderEdges } from "../../../../../modules/sheet-grid/cell-presentation";
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

    const editor = wrapper.get("textarea.cell-editor");
    const frameStyle = wrapper.get<HTMLElement>("[data-cell-editor-frame]").element.style;
    expect(editor.attributes("style")).toBeUndefined();
    expect(frameStyle.backgroundColor).toBe("");
    expect(frameStyle.alignItems).toBe("");

    await editor.trigger("keydown", { key: "x" });
    const style = (editor.element as HTMLTextAreaElement).style;
    expect(style.fontFamily).toBe('"Courier New"');
    expect(style.fontSize).toBe("20px");
    expect(style.color).toBe("#654321");
    expect(style.backgroundColor).toBe("");
    expect(style.textAlign).toBe("right");
    expect(frameStyle.backgroundColor).toBe("#fedcba");
    expect(frameStyle.alignItems).toBe("flex-start");
  });

  test("sizes the editor to one formatted line at the maximum supported font size", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(sheet, { row: 0, column: 0 }, { fontSize: 72 });
    await nextTick();

    const editor = wrapper.get("textarea.cell-editor");
    await editor.trigger("keydown", { key: "A" });
    expect((editor.element as HTMLTextAreaElement).style.minHeight).toBe("74px");
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

  test("preserves explicit line breaks without enabling soft wrapping", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "first\nsecond");
    await nextTick();

    const cell = wrapper.get('[data-row="0"][data-column="0"]');
    const style = (cell.element as HTMLElement).style;
    expect(cell.classes()).toContain("is-multiline");
    expect(cell.classes()).not.toContain("is-wrapped");
    expect(style.whiteSpace).toBe("pre");
    expect(style.overflowWrap).toBe("");
    expect(
      Number.parseFloat((cell.element.parentElement as HTMLElement).style.height),
    ).toBeGreaterThan(24);
  });

  test("uses the full trailing edge for single-line overflow", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "A long single-line value");
    await nextTick();

    const cell = wrapper.get('[data-row="0"][data-column="0"]');
    const style = (cell.element as HTMLElement).style;
    expect(style.paddingRight).toBe("0px");
    expect(style.paddingLeft).toBe("");

    setCellStyle(sheet, { row: 0, column: 0 }, { horizontalAlign: "right" });
    await nextTick();
    expect(style.paddingLeft).toBe("0px");
    expect(style.paddingRight).toBe("");

    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true });
    await nextTick();
    expect(style.paddingLeft).toBe("");
    expect(style.paddingRight).toBe("");
  });

  test("maps border styles and resolves shared edge conflicts consistently", () => {
    expect(
      getCellBorderEdges(
        {
          borderTop: { style: "dotted", color: "#445566" },
          borderRight: { style: "thin", color: "#112233" },
          borderBottom: { style: "dashed", color: "#778899" },
          borderLeft: { style: "double", color: "#aabbcc" },
        },
        {
          top: { borderBottom: { style: "medium", color: "#010203" } },
          right: { borderLeft: { style: "double", color: "#040506" } },
          bottom: { borderTop: { style: "medium", color: "#070809" } },
          left: { borderRight: { style: "thin", color: "#0a0b0c" } },
        },
        true,
        true,
      ),
    ).toEqual({
      top: "2px solid #010203",
      right: "1px solid #112233",
      bottom: "1px dashed #778899",
      left: "1px solid #0a0b0c",
    });

    expect(
      getCellBorderEdges(
        undefined,
        {
          right: { borderLeft: { style: "dotted", color: "#102030" } },
          bottom: { borderTop: { style: "double", color: "#405060" } },
        },
        false,
        false,
      ),
    ).toEqual({
      right: "1px dotted #102030",
      bottom: "3px double #405060",
    });
  });

  test("renders explicit borders as shared layout-independent cell overlays", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderTop: { style: "medium", color: "#112233" },
        borderRight: { style: "medium", color: "#445566" },
        borderBottom: { style: "double", color: "#778899" },
        borderLeft: { style: "double", color: "#aabbcc" },
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        borderLeft: { style: "double", color: "#ddeeff" },
      },
    );
    setCellStyle(
      sheet,
      { row: 1, column: 0 },
      {
        borderTop: { style: "dotted", color: "#010203" },
      },
    );
    await nextTick();

    const cell = wrapper.get('[data-row="0"][data-column="0"]');
    const topBorder = cell.get<HTMLElement>(".sheet-cell-layer__border--top").element.style;
    const rightBorderElement = cell.get<HTMLElement>(".sheet-cell-layer__border--right").element;
    const bottomBorderElement = cell.get<HTMLElement>(".sheet-cell-layer__border--bottom").element;
    const rightBorder = rightBorderElement.style;
    const bottomBorder = bottomBorderElement.style;
    const leftBorder = cell.get<HTMLElement>(".sheet-cell-layer__border--left").element.style;
    expect(topBorder.borderTop).toBe("2px solid #112233");
    expect(rightBorder.borderRight).toBe("2px solid #445566");
    expect(bottomBorder.borderBottom).toBe("3px double #778899");
    expect(leftBorder.borderLeft).toBe("3px double #aabbcc");
    expect(rightBorder.right).toBe("-1px");
    expect(bottomBorder.bottom).toBe("-1px");
    expect((cell.element as HTMLElement).style.height).toBe("100%");
    expect((cell.element as HTMLElement).style.borderRight).toBe("");

    const rightCell = wrapper.get('[data-row="0"][data-column="1"]');
    expect(rightCell.find(".sheet-cell-layer__border--left").exists()).toBe(false);
  });

  test("keeps trailing borders visible on the active multiline cell", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "first\nsecond");
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderRight: { style: "thin", color: "#112233" },
        borderBottom: { style: "thin", color: "#445566" },
      },
    );
    await nextTick();

    const cell = wrapper.get<HTMLElement>('[data-row="0"][data-column="0"]');
    expect(cell.classes()).toContain("is-active");
    expect(cell.classes()).toContain("is-multiline");
    expect(cell.get<HTMLElement>(".sheet-cell-layer__border--right").element.style.right).toBe(
      "-1px",
    );
    expect(cell.get<HTMLElement>(".sheet-cell-layer__border--bottom").element.style.bottom).toBe(
      "-1px",
    );
  });

  test("keeps top and left borders at the virtual range boundary", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    for (let row = 1; row < 16; row += 1) {
      for (let column = 1; column < 16; column += 1) {
        setCellStyle(
          sheet,
          { row, column },
          {
            borderTop: { style: "thin", color: "#112233" },
            borderLeft: { style: "thin", color: "#445566" },
          },
        );
      }
    }
    await nextTick();

    const scroller = wrapper.get(".sheet-grid__scroller");
    const scrollerElement = scroller.element as HTMLDivElement;
    scrollerElement.scrollTop = 120;
    scrollerElement.scrollLeft = 480;
    await scroller.trigger("scroll");
    await nextTick();

    const renderedCells = wrapper.findAll<HTMLElement>("[data-row][data-column]");
    const firstVirtualRow = Math.min(
      ...renderedCells.map((cell) => Number(cell.attributes("data-row"))).filter((row) => row > 0),
    );
    const firstVirtualColumn = Math.min(
      ...renderedCells
        .filter((cell) => Number(cell.attributes("data-row")) === firstVirtualRow)
        .map((cell) => Number(cell.attributes("data-column"))),
    );
    expect(firstVirtualRow).toBeGreaterThan(0);
    expect(firstVirtualColumn).toBeGreaterThan(0);

    const boundaryCell = wrapper.get(
      `[data-row="${firstVirtualRow}"][data-column="${firstVirtualColumn}"]`,
    );
    expect(boundaryCell.find(".sheet-cell-layer__border--top").exists()).toBe(true);
    expect(boundaryCell.find(".sheet-cell-layer__border--left").exists()).toBe(true);
  });

  test("does not let an off-range active cell suppress an unrelated boundary edge", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 1, column: 1 },
      {
        borderTop: { style: "medium", color: "#112233" },
        borderLeft: { style: "double", color: "#445566" },
      },
    );
    await nextTick();

    const scroller = wrapper.get(".sheet-grid__scroller");
    const scrollerElement = scroller.element as HTMLDivElement;
    scrollerElement.scrollTop = 72;
    scrollerElement.scrollLeft = 360;
    await scroller.trigger("scroll");
    await nextTick();

    expect(wrapper.find('[data-row="0"][data-column="1"]').exists()).toBe(false);
    expect(wrapper.find('[data-row="1"][data-column="0"]').exists()).toBe(false);

    const boundaryCell = wrapper.get('[data-row="1"][data-column="1"]');
    expect(
      boundaryCell.get<HTMLElement>(".sheet-cell-layer__border--top").element.style.borderTop,
    ).toBe("2px solid #112233");
    expect(
      boundaryCell.get<HTMLElement>(".sheet-cell-layer__border--left").element.style.borderLeft,
    ).toBe("3px double #445566");
  });
});
