import { mount } from "@vue/test-utils";
import { nextTick, reactive } from "vue";
import { beforeEach, describe, expect, test, vi } from "vitest";

const harness = vi.hoisted(() => {
  return {
    createSheetEvaluator: vi.fn(),
    evaluatorFunctions: [] as Array<(address: { row: number; column: number }) => unknown>,
    reconciledInputs: [] as Array<{
      getComputedValue: (address: { row: number; column: number }) => unknown;
    }>,
    reconcile: vi.fn(
      (input: { getComputedValue: (address: { row: number; column: number }) => unknown }) => {
        harness.reconciledInputs.push(input);
        return new Map<number, number>();
      },
    ),
  };
});

vi.mock("@idea10/core/workbook", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@idea10/core/workbook")>();
  return {
    ...actual,
    createSheetEvaluator(sheet: Parameters<typeof actual.createSheetEvaluator>[0]) {
      const evaluator = actual.createSheetEvaluator(sheet);
      harness.createSheetEvaluator(sheet);
      harness.evaluatorFunctions.push(evaluator.getComputedValue);
      return evaluator;
    },
  };
});

vi.mock("@idea10/sheet-engine/row-height", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@idea10/sheet-engine/row-height")>();
  return {
    ...actual,
    createAutoRowHeightCalculator: () => ({ reconcile: harness.reconcile, clear: vi.fn() }),
  };
});

import {
  createWorkbook,
  getActiveSheet,
  setCellContent,
  setCellValue,
} from "@idea10/core/workbook";
import { createSheetGridViewState } from "@idea10/sheet-engine/view-state";
import SheetGrid from "../../../../../modules/sheet-grid/components/SheetGrid.vue";
import { createAppI18n } from "../../../../../shared/i18n";

describe("SheetGrid formula evaluation", () => {
  beforeEach(() => {
    harness.createSheetEvaluator.mockClear();
    harness.reconcile.mockClear();
    harness.reconciledInputs.splice(0);
    harness.evaluatorFunctions.splice(0);
  });

  test("shares one evaluator across grid consumers and refreshes existing cell updates", async () => {
    const workbook = reactive(createWorkbook({ id: "workbook-1", sheetId: "sheet-1" }));
    const sheet = getActiveSheet(workbook);
    setCellValue(sheet, { row: 0, column: 0 }, 1);
    setCellContent(
      sheet,
      { row: 0, column: 1 },
      {
        kind: "formula",
        formula: { source: "=A1 + 1" },
      },
    );
    const wrapper = mount(SheetGrid, {
      global: { plugins: [createAppI18n("en-US")] },
      props: {
        sheet,
        initialRowCount: 8,
        initialColumnCount: 4,
        viewState: createSheetGridViewState({
          selection: {
            active: { row: 0, column: 1 },
            anchor: { row: 0, column: 1 },
            focus: { row: 0, column: 1 },
            mode: "cells",
          },
        }),
      },
    });
    await nextTick();

    const input = harness.reconciledInputs.at(-1);
    expect(harness.createSheetEvaluator).toHaveBeenCalledTimes(1);
    expect(input?.getComputedValue).toBe(harness.evaluatorFunctions[0]);
    expect(wrapper.get('[data-row="0"][data-column="1"]').text()).toBe("2");

    setCellValue(sheet, { row: 0, column: 0 }, 2);
    await nextTick();

    expect(harness.createSheetEvaluator).toHaveBeenCalledTimes(2);
    expect(harness.reconciledInputs.at(-1)?.getComputedValue).toBe(harness.evaluatorFunctions[1]);
    expect(wrapper.get('[data-row="0"][data-column="1"]').text()).toBe("3");

    setCellContent(
      sheet,
      { row: 0, column: 1 },
      {
        kind: "formula",
        formula: { source: "=A1 + 2" },
      },
    );
    await nextTick();

    expect(harness.createSheetEvaluator).toHaveBeenCalledTimes(3);
    expect(wrapper.get('[data-row="0"][data-column="1"]').text()).toBe("4");

    wrapper.unmount();
  });
});
