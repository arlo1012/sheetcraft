import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import type { CellBorderLineStyle } from "@idea10/core/style";
import { setCellStyle, setCellValue } from "@idea10/core/workbook";
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
        underline: "doubleAccounting",
        strikethrough: true,
        fontScript: "superscript",
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
    expect(style.fontSize).toBe("13.5px");
    expect(style.fontWeight).toBe("700");
    expect(style.fontStyle).toBe("italic");
    expect(style.textDecoration).toBe("");
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
    expect(style.justifyContent).toBe("flex-start");
    expect(style.alignItems).toBe("flex-end");
  });

  test("applies the active cell style to the editor only while editing", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        fontFamily: "Courier New",
        fontSize: 20,
        underline: true,
        strikethrough: true,
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
    expect(style.textDecoration).toBe("underline line-through");
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
    const value = cell.get(".sheet-cell-layer__value");
    const content = () => value.get(".cell-text__content").element as HTMLElement;
    expect(content().style.left).toBe("5px");

    setCellStyle(sheet, { row: 0, column: 0 }, { horizontalAlign: "right" });
    await nextTick();
    expect(
      Number.parseFloat(content().style.left) + Number.parseFloat(content().style.width),
    ).toBeCloseTo(90, 4);
    expect(Number.parseFloat(content().style.left)).toBeLessThan(0);
    expect(cell.findComponent({ name: "CellTextContent" }).props("width")).toBe(95);
    expect(value.classes()).toContain("sheet-cell-layer__value");

    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true });
    await nextTick();
    expect(content().style.left).toBe("5px");
  });

  test("renders number-format colors and fill characters for the selected section", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, -123);
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        numberFormat: { kind: "custom", code: "0;[Red]*x0;*y0;*@" },
      },
    );
    await nextTick();

    const cell = wrapper.get<HTMLElement>('[data-row="0"][data-column="0"]');
    expect(cell.element.style.color).toBe("red");
    expect(cell.get(".sheet-cell-layer__value").classes()).toContain("has-fill");
    expect(cell.get(".cell-text__line").text()).toContain("x");
    expect(cell.text().endsWith("123")).toBe(true);
  });

  test("renders explicit borders on a shared sheet layer", async () => {
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

    const getSegment = (orientation: string, edge: number) =>
      wrapper.get(
        `[data-sheet-border-segment][data-border-orientation="${orientation}"][data-border-edge="${edge}"]`,
      );
    expect(getSegment("horizontal", 0).get("line").attributes()).toMatchObject({
      stroke: "#112233",
      "stroke-width": "2",
      y1: "1",
      x2: "96",
    });
    expect(getSegment("vertical", 1).get("line").attributes()).toMatchObject({
      stroke: "#445566",
      "stroke-width": "2",
      x1: "95",
      y2: "24",
    });
    expect(getSegment("horizontal", 1).findAll("line")).toHaveLength(2);
    expect(getSegment("vertical", 0).findAll("line")).toHaveLength(2);
    expect(
      wrapper.get<HTMLElement>('[data-border-row-edge="1"][data-border-column-edge="1"]').element
        .style.backgroundColor,
    ).toBe("#778899");
    expect(wrapper.find(".sheet-cell-layer__border").exists()).toBe(false);
  });

  test("renders both diagonal border directions inside their cell", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderDiagonalUp: { style: "thin", color: "#112233" },
        borderDiagonalDown: { style: "double", color: "#445566" },
      },
    );
    await nextTick();

    const up = wrapper.get<HTMLElement>(
      '[data-sheet-diagonal-border-segment][data-border-direction="up"]',
    );
    const down = wrapper.get<HTMLElement>(
      '[data-sheet-diagonal-border-segment][data-border-direction="down"]',
    );
    expect(up.attributes()).toMatchObject({
      "data-border-row": "0",
      "data-border-column": "0",
    });
    const upLines = up.findAll(".sheet-border-layer__diagonal-line");
    const downLines = down.findAll(".sheet-border-layer__diagonal-line");
    expect(upLines).toHaveLength(1);
    expect(upLines[0]?.attributes()).toMatchObject({
      x1: "-0.5",
      y1: "23.5",
      x2: "95.5",
      y2: "-0.5",
      stroke: "#112233",
      "stroke-width": "1",
      "stroke-linecap": "butt",
      "data-diagonal-line-offset": "0",
    });
    expect(downLines).toHaveLength(2);
    expect(downLines.map((line) => line.attributes("data-diagonal-line-offset"))).toEqual([
      "-1",
      "1",
    ]);
    for (const line of downLines) {
      expect(line.attributes()).toMatchObject({
        stroke: "#445566",
        "stroke-width": "1",
        "stroke-linecap": "butt",
      });
      expect(
        Number.parseFloat(line.attributes("x2") ?? "") -
          Number.parseFloat(line.attributes("x1") ?? ""),
      ).toBeCloseTo(96, 5);
      expect(
        Number.parseFloat(line.attributes("y2") ?? "") -
          Number.parseFloat(line.attributes("y1") ?? ""),
      ).toBeCloseTo(24, 5);
    }
    const firstDown = downLines[0];
    const secondDown = downLines[1];
    expect(
      (Number.parseFloat(firstDown?.attributes("x1") ?? "") +
        Number.parseFloat(secondDown?.attributes("x1") ?? "")) /
        2,
    ).toBeCloseTo(-0.5, 5);
    expect(
      (Number.parseFloat(firstDown?.attributes("y2") ?? "") +
        Number.parseFloat(secondDown?.attributes("y2") ?? "")) /
        2,
    ).toBeCloseTo(23.5, 5);
  });

  test("maps dashed and dotted diagonal borders to svg strokes", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderDiagonalUp: { style: "dashed", color: "#112233" },
        borderDiagonalDown: { style: "dotted", color: "#445566" },
      },
    );
    await nextTick();

    expect(
      wrapper
        .get('[data-sheet-diagonal-border-segment][data-border-direction="up"] line')
        .attributes(),
    ).toMatchObject({ "stroke-dasharray": "6 3", "stroke-linecap": "butt" });
    expect(
      wrapper
        .get('[data-sheet-diagonal-border-segment][data-border-direction="down"] line')
        .attributes(),
    ).toMatchObject({ "stroke-dasharray": "0 2", "stroke-linecap": "round" });
  });

  test("renders adjacent diagonal endpoints in the same svg layer", async () => {
    const { sheet, wrapper } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderDiagonalDown: { style: "thin", color: "#112233" },
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        borderDiagonalUp: { style: "thin", color: "#112233" },
      },
    );
    await nextTick();

    const layer = wrapper.get('[data-sheet-diagonal-border-layer][data-border-thickness="1"]');
    const first = layer.get(
      '[data-border-row="0"][data-border-column="0"][data-border-direction="down"] line',
    );
    const second = layer.get(
      '[data-border-row="0"][data-border-column="1"][data-border-direction="up"] line',
    );
    expect(first.attributes()).toMatchObject({ x2: "95.5", y2: "23.5" });
    expect(second.attributes()).toMatchObject({ x1: "95.5", y1: "23.5" });
  });

  test("keeps borders independent from active multiline content clipping", async () => {
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
    expect(
      wrapper
        .get(
          '[data-sheet-border-segment][data-border-orientation="vertical"][data-border-edge="1"] line',
        )
        .attributes("stroke"),
    ).toBe("#112233");
    expect(
      wrapper
        .get(
          '[data-sheet-border-segment][data-border-orientation="horizontal"][data-border-edge="1"] line',
        )
        .attributes("stroke"),
    ).toBe("#445566");
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

    expect(
      wrapper
        .find(`[data-border-orientation="horizontal"][data-border-edge="${firstVirtualRow}"]`)
        .exists(),
    ).toBe(true);
    expect(
      wrapper
        .find(`[data-border-orientation="vertical"][data-border-edge="${firstVirtualColumn}"]`)
        .exists(),
    ).toBe(true);
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

    expect(
      wrapper
        .get(
          '[data-sheet-border-segment][data-border-orientation="horizontal"][data-border-edge="1"] line',
        )
        .attributes("stroke-width"),
    ).toBe("2");
    expect(
      wrapper
        .get(
          '[data-sheet-border-segment][data-border-orientation="vertical"][data-border-edge="1"]',
        )
        .findAll("line"),
    ).toHaveLength(2);
  });

  test("renders every supported line style as matching orthogonal and diagonal SVG strokes", async () => {
    const styles = [
      "hair",
      "thin",
      "medium",
      "thick",
      "dotted",
      "dashed",
      "mediumDashed",
      "dashDot",
      "mediumDashDot",
      "dashDotDot",
      "mediumDashDotDot",
      "slantDashDot",
      "double",
    ] as const satisfies readonly CellBorderLineStyle[];
    const { sheet, wrapper } = mountSheetGrid();
    for (const [row, style] of styles.entries()) {
      setCellStyle(
        sheet,
        { row, column: 0 },
        {
          borderRight: { style, color: "#123456" },
          borderDiagonalDown: { style, color: "#654321" },
        },
      );
    }
    await nextTick();

    for (const style of styles) {
      const orthogonal = wrapper.get(`[data-sheet-border-segment][data-border-style="${style}"]`);
      const diagonal = wrapper.get(
        `[data-sheet-diagonal-border-segment][data-border-style="${style}"]`,
      );
      expect(orthogonal.findAll("line")).toHaveLength(style === "double" ? 2 : 1);
      expect(diagonal.findAll("line")).toHaveLength(style === "double" ? 2 : 1);
      expect(orthogonal.get("line").attributes("stroke")).toBe("#123456");
      expect(diagonal.get("line").attributes("stroke")).toBe("#654321");
    }
    expect(
      wrapper
        .get('[data-sheet-border-segment][data-border-style="dashDot"] line')
        .attributes("stroke-dasharray"),
    ).toBe("6 3 1 3");
    expect(
      wrapper
        .get('[data-sheet-diagonal-border-segment][data-border-style="dashDotDot"] line')
        .attributes("stroke-dasharray"),
    ).toBe("6 2 1 2 1 2");
  });
});
