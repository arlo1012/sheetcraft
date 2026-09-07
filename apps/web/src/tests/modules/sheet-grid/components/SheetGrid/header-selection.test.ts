import { nextTick } from "vue";
import { describe, expect, test } from "vitest";
import { DEFAULT_COLUMN_WIDTH } from "@idea10/core/workbook";
import { mountSheetGrid } from "./fixture";

function dispatchMouse(type: string, options: MouseEventInit): void {
  window.dispatchEvent(new MouseEvent(type, options));
}

function rowHeader(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"], row: number) {
  return wrapper.get(`.sheet-row-headers__item[data-row="${row}"]`);
}

function columnHeader(wrapper: ReturnType<typeof mountSheetGrid>["wrapper"], column: number) {
  return wrapper.get(`.sheet-column-headers__item[data-column="${column}"]`);
}

describe("SheetGrid header selection indicator", () => {
  test("indicates the headers of a cell selection without presenting them as whole-axis selections", async () => {
    const { wrapper } = mountSheetGrid();

    await wrapper.get('[data-row="2"][data-column="3"]').trigger("mousedown", {
      button: 0,
      clientX: DEFAULT_COLUMN_WIDTH * 3 + 10,
      clientY: 24 * 2 + 10,
    });
    await nextTick();

    expect(rowHeader(wrapper, 2).classes()).toContain("is-in-selection");
    expect(columnHeader(wrapper, 3).classes()).toContain("is-in-selection");
    expect(rowHeader(wrapper, 1).classes()).not.toContain("is-in-selection");
    expect(columnHeader(wrapper, 2).classes()).not.toContain("is-in-selection");
    expect(wrapper.get('[data-select-row="2"]').attributes("aria-pressed")).toBe("false");
    expect(wrapper.get('[data-select-column="3"]').attributes("aria-pressed")).toBe("false");
  });

  test("indicates every header intersecting an extended cell range", async () => {
    const { wrapper } = mountSheetGrid();

    await wrapper.get('[data-row="1"][data-column="2"]').trigger("mousedown", {
      button: 0,
      buttons: 1,
      clientX: DEFAULT_COLUMN_WIDTH * 2 + 10,
      clientY: 24 + 10,
    });
    dispatchMouse("mousemove", {
      buttons: 1,
      clientX: DEFAULT_COLUMN_WIDTH * 4 + 10,
      clientY: 24 * 3 + 10,
    });
    dispatchMouse("mouseup", { button: 0 });
    await nextTick();

    for (const row of [1, 2, 3]) {
      expect(rowHeader(wrapper, row).classes()).toContain("is-in-selection");
      expect(wrapper.get(`[data-select-row="${row}"]`).attributes("aria-pressed")).toBe("false");
    }
    for (const column of [2, 3, 4]) {
      expect(columnHeader(wrapper, column).classes()).toContain("is-in-selection");
      expect(wrapper.get(`[data-select-column="${column}"]`).attributes("aria-pressed")).toBe(
        "false",
      );
    }
    expect(rowHeader(wrapper, 0).classes()).not.toContain("is-in-selection");
    expect(columnHeader(wrapper, 5).classes()).not.toContain("is-in-selection");
  });

  test("keeps header selection indicators when reading highlights are toggled", async () => {
    const { wrapper } = mountSheetGrid();
    await wrapper.get('[data-row="4"][data-column="5"]').trigger("mousedown", { button: 0 });
    await nextTick();

    expect(rowHeader(wrapper, 4).classes()).toContain("is-in-selection");
    expect(columnHeader(wrapper, 5).classes()).toContain("is-in-selection");

    await wrapper.setProps({ highlightEnabled: true });
    expect(rowHeader(wrapper, 4).classes()).toContain("is-in-selection");
    expect(columnHeader(wrapper, 5).classes()).toContain("is-in-selection");

    await wrapper.setProps({ highlightEnabled: false });
    expect(rowHeader(wrapper, 4).classes()).toContain("is-in-selection");
    expect(columnHeader(wrapper, 5).classes()).toContain("is-in-selection");
  });

  test("keeps whole-axis aria-pressed semantics while its range indicates perpendicular headers", async () => {
    const { wrapper } = mountSheetGrid();

    await wrapper.get('[data-select-row="2"]').trigger("mousedown", { button: 0 });
    expect(rowHeader(wrapper, 2).classes()).toEqual(
      expect.arrayContaining(["is-in-selection", "is-active"]),
    );
    expect(wrapper.get('[data-select-row="2"]').attributes("aria-pressed")).toBe("true");
    expect(columnHeader(wrapper, 4).classes()).toContain("is-in-selection");
    expect(wrapper.get('[data-select-column="4"]').attributes("aria-pressed")).toBe("false");

    await wrapper.get('[data-select-column="3"]').trigger("mousedown", { button: 0 });
    expect(columnHeader(wrapper, 3).classes()).toEqual(
      expect.arrayContaining(["is-in-selection", "is-active"]),
    );
    expect(wrapper.get('[data-select-column="3"]').attributes("aria-pressed")).toBe("true");
    expect(rowHeader(wrapper, 5).classes()).toContain("is-in-selection");
    expect(wrapper.get('[data-select-row="5"]').attributes("aria-pressed")).toBe("false");
  });
});
