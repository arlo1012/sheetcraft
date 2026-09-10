import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { getCellContent, setCellStyle, setCellValue } from "@idea10/core/workbook";
import { mountSheetGrid } from "./fixture";

describe("SheetGrid alignment spans", () => {
  test("centers across blank formatted cells without merging and stops at another value", async () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        setCellValue(sheet, { row: 0, column: 0 }, "Heading");
        setCellValue(sheet, { row: 0, column: 3 }, "Next");
        for (let column = 0; column < 5; column += 1)
          setCellStyle(sheet, { row: 0, column }, { horizontalAlign: "centerContinuous" });
      },
    });
    const first = wrapper.get<HTMLElement>('[data-center-across-source="0:0"]');
    expect(first.text()).toBe("Heading");
    expect(first.element.style.width).toBe("287px");
    expect(wrapper.get<HTMLElement>('[data-row="0"][data-column="0"]').element.style.width).toBe(
      "96px",
    );
    expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    expect(wrapper.get<HTMLElement>('[data-center-across-source="0:3"]').element.style.width).toBe(
      "191px",
    );
    setCellValue(sheet, { row: 0, column: 1 }, "Break");
    await nextTick();
    expect(wrapper.find('[data-center-across-source="0:0"]').exists()).toBe(false);
    expect(wrapper.get('[data-row="0"][data-column="0"] .cell-text').text()).toBe("Heading");
    wrapper.unmount();
  });

  test("keeps one logical center across frozen and scrolling panes", async () => {
    const { wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        sheet.freezePanes = { rows: 0, columns: 1 };
        setCellValue(sheet, { row: 0, column: 0 }, "Heading");
        for (let column = 0; column < 4; column += 1)
          setCellStyle(sheet, { row: 0, column }, { horizontalAlign: "centerContinuous" });
      },
    });
    const spans = () => wrapper.findAll<HTMLElement>('[data-center-across-source="0:0"]');
    expect(spans()).toHaveLength(2);
    expect(spans().map((span) => span.element.style.width)).toEqual(["383px", "383px"]);
    wrapper.vm.scrollHorizontally(96);
    await nextTick();
    expect(spans().map((span) => span.element.style.left)).toEqual(["0px", "-192px"]);
    wrapper.unmount();
  });

  test("fill repeats into adjacent blank fill cells without changing their data", () => {
    const { sheet, wrapper } = mountSheetGrid({
      beforeMount(sheet) {
        setCellValue(sheet, { row: 0, column: 0 }, "ab");
        for (let column = 0; column < 2; column += 1)
          setCellStyle(sheet, { row: 0, column }, { horizontalAlign: "fill" });
      },
    });
    expect(wrapper.get('[data-row="0"][data-column="1"] .cell-text').text()).toMatch(/^(ab){2,}$/u);
    expect(getCellContent(sheet, { row: 0, column: 1 })).toBeNull();
    expect(wrapper.get('[data-row="0"][data-column="2"]').text()).toBe("");
    wrapper.unmount();
  });
});
