import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellValue,
} from "@idea10/core/workbook";
import { useWorkbookGoToController } from "../../../modules/workbook/composables/useWorkbookGoToController";
import { createAppI18n } from "../../../shared/i18n";

const wrappers: Array<{ unmount(): void }> = [];
afterEach(() => {
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
});

function fixture() {
  const workbook = createWorkbook({ idFactory: createSequentialIdFactory() });
  const sheet = getActiveSheet(workbook);
  const revision = ref(0);
  const navigate = vi.fn();
  let controller!: ReturnType<typeof useWorkbookGoToController>;
  wrappers.push(
    mount(
      defineComponent({
        setup() {
          controller = useWorkbookGoToController({
            getWorkbook: () => workbook,
            getRevision: () => revision.value,
            getAddress: () => ({ row: 0, column: 0 }),
            getSelection: () => ({ start: { row: 0, column: 0 }, end: { row: 0, column: 0 } }),
            getEvaluator: (sheetId) => createWorkbookEvaluator(workbook, sheetId),
            navigate,
          });
          return () => h("div");
        },
      }),
      { global: { plugins: [createAppI18n("en-US")] } },
    ),
  );
  return { controller, sheet, revision, navigate };
}
const dataOptions = {
  kind: "data",
  constants: true,
  formulas: true,
  valueTypes: ["number", "text", "logical", "error"],
} as const;

describe("workbook go-to navigation", () => {
  test("navigates complete regions and merged ranges, and clears stale results after edits", async () => {
    const { controller, sheet, revision, navigate } = fixture();
    setCellValue(sheet, { row: 0, column: 0 }, "A");
    setCellValue(sheet, { row: 0, column: 1 }, "B");
    controller.locate({ ...dataOptions, kind: "current-region" });
    expect(navigate).toHaveBeenLastCalledWith(sheet.id, {
      range: { start: { row: 0, column: 0 }, end: { row: 0, column: 1 } },
    });
    expect(controller.results.value[0]?.addressLabel).toBe("A1:B1");
    sheet.mergedCells.push({ start: { row: 2, column: 0 }, end: { row: 3, column: 2 } });
    controller.locate({ ...dataOptions, kind: "merged" });
    expect(navigate.mock.lastCall?.[1].range).toEqual(sheet.mergedCells[0]);
    const stale = controller.results.value[0]!;
    revision.value += 1;
    await nextTick();
    expect(controller.results.value).toEqual([]);
    controller.selectResult(stale);
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  test("distinguishes floating objects sharing a cell and preserves their object identities", () => {
    const { controller, sheet, navigate } = fixture();
    for (const id of ["first", "second"])
      sheet.floatingImages.push({
        id,
        assetId: id,
        altText: id,
        anchor: { row: 1, column: 1 },
        offsetX: 0,
        offsetY: 0,
        width: 40,
        height: 40,
      });
    controller.locate({ ...dataOptions, kind: "objects" });
    const [first, second] = controller.results.value;
    expect(first?.id).not.toBe(second?.id);
    controller.selectResult(second!);
    expect(navigate.mock.lastCall?.[1].imageId).toBe("second");
  });

  test("caps displayed targets while retaining the full count and reports empty matches", () => {
    const { controller, sheet } = fixture();
    for (let row = 0; row < 205; row += 1) setCellValue(sheet, { row, column: 0 }, row);
    controller.locate(dataOptions);
    expect(controller.resultCount.value).toBe(205);
    expect(controller.results.value).toHaveLength(200);
    controller.locate({ ...dataOptions, valueTypes: ["text"] });
    expect(controller.results.value).toEqual([]);
    expect(controller.resultCount.value).toBe(0);
    expect(controller.status.value).toBeTruthy();
  });
});
