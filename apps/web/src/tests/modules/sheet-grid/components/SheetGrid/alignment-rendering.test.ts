import { nextTick } from "vue";
import { afterEach, describe, expect, test, vi } from "vitest";
import { getCellContent, setCellStyle, setCellValue } from "@idea10/core/workbook";
import { getCanvasLayout, mountSheetGrid } from "./fixture";
import { recordCanvasRenderPlans } from "./canvas-render-fixture";

describe("SheetGrid alignment spans", () => {
  afterEach(() => vi.restoreAllMocks());

  test("centers across blank formatted cells without merging and stops at another value", async () => {
    const plans = recordCanvasRenderPlans();
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        setCellValue(sheet, { row: 0, column: 0 }, "Heading");
        setCellValue(sheet, { row: 0, column: 3 }, "Next");
        for (let column = 0; column < 5; column += 1)
          setCellStyle(sheet, { row: 0, column }, { horizontalAlign: "centerContinuous" });
      },
    });
    await nextTick();
    const cell = (column: number) =>
      plans.scene.panes
        .flatMap((pane) => pane.cells)
        .find((cell) => cell.address.row === 0 && cell.address.column === column)!;
    expect(cell(0).content.text).toBe("Heading");
    expect(cell(0).contentRect.width).toBe(288);
    expect(cell(0).rect.width).toBe(96);
    expect(cell(0).content.textLayout?.horizontal).toBe("center");
    expect(cell(0).content).toBe(cell(1).content);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    expect(cell(3).contentRect.width).toBe(192);
    setCellValue(sheet, { row: 0, column: 1 }, "Break");
    await nextTick();
    expect(cell(0).contentRect.width).toBe(96);
    expect(cell(0).content.text).toBe("Heading");
    expect(cell(1).content.text).toBe("Break");
    wrapper.unmount();
  });

  test("keeps one logical center across frozen and scrolling panes", async () => {
    const plans = recordCanvasRenderPlans();
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.freezePanes = { rows: 0, columns: 1 };
        setCellValue(sheet, { row: 0, column: 0 }, "Heading");
        for (let column = 0; column < 4; column += 1)
          setCellStyle(sheet, { row: 0, column }, { horizontalAlign: "centerContinuous" });
      },
    });
    const spanPanes = () =>
      plans.scene.panes.filter((pane) =>
        pane.cells.some((cell) => cell.span?.source.row === 0 && cell.span.source.column === 0),
      );
    expect(spanPanes().map((pane) => pane.id)).toEqual(["left", "body"]);
    const contents = spanPanes().map((pane) => pane.cells.find((cell) => cell.span)?.content);
    expect(contents[0]).toBe(contents[1]);
    wrapper.vm.scrollHorizontally(96);
    await nextTick();
    expect(spanPanes().map((pane) => pane.cells.find((cell) => cell.span)?.contentRect)).toEqual([
      { x: 0, y: 0, width: 384, height: 24 },
      { x: 0, y: 0, width: 384, height: 24 },
    ]);
    expect(getCanvasLayout(wrapper).bodyScrollPosition.x).toBe(96);
    wrapper.unmount();
  });

  test("fill repeats into adjacent blank fill cells without changing their data", async () => {
    const plans = recordCanvasRenderPlans();
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        setCellValue(sheet, { row: 0, column: 0 }, "ab");
        for (let column = 0; column < 2; column += 1)
          setCellStyle(sheet, { row: 0, column }, { horizontalAlign: "fill" });
      },
    });
    await nextTick();
    const cells = plans.scene.panes.flatMap((pane) => pane.cells);
    const repeated = cells.find((cell) => cell.address.row === 0 && cell.address.column === 1)!;
    expect(repeated.content.textLayout?.lines[0]?.text).toMatch(/^(ab){2,}$/u);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    expect(
      cells.find((cell) => cell.address.row === 0 && cell.address.column === 2)?.content.text,
    ).toBe("");
    wrapper.unmount();
  });
});
