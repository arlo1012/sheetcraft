import { nextTick } from "vue";
import { afterEach, describe, expect, test } from "vitest";
import { setCellStyle, setCellValue } from "@sheetcraft/core/workbook";
import { recordCanvasRenderPlans } from "./canvas-render-fixture";
import { mountSheetGrid } from "./fixture";

const recorders: Array<ReturnType<typeof recordCanvasRenderPlans>> = [];

function recordCanvas() {
  const recorder = recordCanvasRenderPlans();
  recorders.push(recorder);
  return recorder;
}

function getCell(
  scene: ReturnType<typeof recordCanvasRenderPlans>["scene"],
  row: number,
  column: number,
) {
  const cell = scene.panes
    .flatMap((pane) => pane.cells)
    .find((candidate) => candidate.address.row === row && candidate.address.column === column);
  if (!cell) throw new Error(`Canvas scene does not contain ${row}:${column}.`);
  return cell;
}

afterEach(() => {
  for (const recorder of recorders.splice(0)) recorder.restore();
});

describe("SheetGrid cell style rendering", () => {
  test("passes patterned and gradient fills to the Canvas scene", async () => {
    const recorder = recordCanvas();
    const { sheet } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        fillColor: "#fef3c7",
        fillPattern: "darkTrellis",
        fillPatternColor: "#b91c1c",
      },
    );
    setCellStyle(
      sheet,
      { row: 0, column: 1 },
      {
        fillGradient: {
          type: "linear",
          angle: 0,
          stops: [
            { position: 0, color: "#ffffff" },
            { position: 1, color: "#4472c4" },
          ],
        },
      },
    );
    await nextTick();

    expect(getCell(recorder.scene, 0, 0).style).toMatchObject({
      fillColor: "#fef3c7",
      fillPattern: "darkTrellis",
      fillPatternColor: "#b91c1c",
    });
    expect(getCell(recorder.scene, 0, 1).style?.fillGradient).toEqual({
      type: "linear",
      angle: 0,
      stops: [
        { position: 0, color: "#ffffff" },
        { position: 1, color: "#4472c4" },
      ],
    });
  });

  test("passes sparse formatting to Canvas text layout for empty cells", async () => {
    const recorder = recordCanvas();
    const { sheet } = mountSheetGrid();
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

    const cell = getCell(recorder.scene, 0, 0);
    expect(cell.style).toMatchObject({
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
    });
    expect(cell.content).toMatchObject({ text: "" });

    setCellStyle(sheet, { row: 0, column: 0 }, null);
    await nextTick();
    expect(getCell(recorder.scene, 0, 0).style).toBeUndefined();
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

  test("lays out wrapped content in the Canvas scene", async () => {
    const recorder = recordCanvas();
    const { sheet } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "A very long unbroken-value-that-must-wrap");
    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true, horizontalAlign: "right" });
    await nextTick();

    const layout = getCell(recorder.scene, 0, 0).content.textLayout;
    expect(layout).toMatchObject({ horizontal: "right" });
    expect(layout?.lines.length).toBeGreaterThan(1);
    expect(layout?.width).toBeLessThanOrEqual(90);
  });

  test("preserves explicit line breaks without enabling soft wrapping", async () => {
    const recorder = recordCanvas();
    const { sheet } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "first\nsecond");
    await nextTick();

    const layout = getCell(recorder.scene, 0, 0).content.textLayout;
    expect(layout?.lines.map((line) => line.text)).toEqual(["first", "second"]);
    expect(layout?.horizontal).toBe("left");
  });

  test("uses the full trailing edge for single-line overflow", async () => {
    const recorder = recordCanvas();
    const { sheet } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, "A long single-line value");
    await nextTick();

    expect(getCell(recorder.scene, 0, 0).content.textLayout?.x).toBe(5);
    setCellStyle(sheet, { row: 0, column: 0 }, { horizontalAlign: "right" });
    await nextTick();
    const layout = getCell(recorder.scene, 0, 0).content.textLayout;
    expect(layout?.horizontal).toBe("right");
    expect(layout?.x).toBeLessThan(0);

    setCellStyle(sheet, { row: 0, column: 0 }, { wrapText: true });
    await nextTick();
    expect(getCell(recorder.scene, 0, 0).content.textLayout?.x).toBe(5);
  });

  test("uses number-format colors and fill characters in Canvas text", async () => {
    const recorder = recordCanvas();
    const { sheet } = mountSheetGrid();
    setCellValue(sheet, { row: 0, column: 0 }, -123);
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        numberFormat: { kind: "custom", code: "0;[Red]*x0;*y0;*@" },
      },
    );
    await nextTick();

    const cell = getCell(recorder.scene, 0, 0);
    expect(cell.content.style?.textColor).toBe("red");
    expect(cell.content.textLayout?.lines.map((line) => line.text).join("")).toContain("x");
    expect(cell.content.textLayout?.lines.map((line) => line.text).join("")).toContain("123");
  });

  test("builds explicit borders into the Canvas border plan", async () => {
    const recorder = recordCanvas();
    const { sheet } = mountSheetGrid();
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

    const panes = recorder.borderPlan.panes;
    const lines = panes.flatMap((pane) => pane.lines);
    expect(lines).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ color: "#112233", strokeWidth: 2 }),
        expect.objectContaining({ color: "#445566", strokeWidth: 2 }),
        expect.objectContaining({ color: "#778899", parts: expect.any(Array) }),
        expect.objectContaining({ color: "#aabbcc", parts: expect.any(Array) }),
      ]),
    );
    expect(lines.find(({ color }) => color === "#778899")?.parts).toHaveLength(2);
    expect(panes.flatMap((pane) => pane.junctions)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rowEdge: 1, columnEdge: 1, color: "#778899" }),
      ]),
    );
  });

  test("builds both diagonal border directions into the Canvas border plan", async () => {
    const recorder = recordCanvas();
    const { sheet } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderDiagonalUp: { style: "thin", color: "#112233" },
        borderDiagonalDown: { style: "double", color: "#445566" },
      },
    );
    await nextTick();

    const lines = recorder.borderPlan.panes.flatMap((pane) => pane.lines);
    const up = lines.find(({ color }) => color === "#112233");
    const down = lines.find(({ color }) => color === "#445566");
    expect(up).toMatchObject({
      strokeWidth: 1,
      lineCap: "butt",
      parts: [{ x1: -0.5, y1: 23.5 }],
    });
    expect(up?.parts[0]).toMatchObject({ x2: 95.5, y2: -0.5 });
    expect(down).toMatchObject({ strokeWidth: 1, lineCap: "butt" });
    expect(down?.parts).toHaveLength(2);
  });

  test("maps dashed and dotted diagonal borders to Canvas dash arrays", async () => {
    const recorder = recordCanvas();
    const { sheet } = mountSheetGrid();
    setCellStyle(
      sheet,
      { row: 0, column: 0 },
      {
        borderDiagonalUp: { style: "dashed", color: "#112233" },
        borderDiagonalDown: { style: "dotted", color: "#445566" },
      },
    );
    await nextTick();

    const lines = recorder.borderPlan.panes.flatMap((pane) => pane.lines);
    expect(lines.find(({ color }) => color === "#112233")).toMatchObject({
      dashArray: [6, 3],
      lineCap: "butt",
    });
    expect(lines.find(({ color }) => color === "#445566")).toMatchObject({
      dashArray: [0, 2],
      lineCap: "round",
    });
  });
});
