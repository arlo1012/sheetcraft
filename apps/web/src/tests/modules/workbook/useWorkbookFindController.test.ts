import { defineComponent, h, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import {
  createSheet,
  createWorkbook,
  createWorkbookEvaluator,
  getActiveSheet,
  setCellStyle,
  setCellValue,
  type CellAddress,
  type Workbook,
} from "@idea10/core/workbook";
import { useWorkbookFindController } from "../../../modules/workbook/composables/useWorkbookFindController";
import { DEFAULT_WORKBOOK_FIND_OPTIONS } from "../../../modules/workbook/workbook-find-types";
import { createAppI18n } from "../../../shared/i18n";

const mounted: Array<{ unmount(): void }> = [];

type FindController = ReturnType<typeof useWorkbookFindController>;

function createFindWorkbook(): Workbook {
  const workbook = createWorkbook({
    idFactory: createSequentialIdFactory(),
    sheetName: "Summary",
  });
  workbook.sheets.set("beta", createSheet("Beta", "beta"));
  workbook.sheets.set("gamma", createSheet("Gamma", "gamma"));
  workbook.sheets.set("hidden", createSheet("Hidden", "hidden"));
  workbook.sheets.get("hidden")!.properties.hidden = true;
  return workbook;
}

function mountController(
  workbook = createFindWorkbook(),
  address: CellAddress = { row: 0, column: 0 },
) {
  const revision = ref(0);
  const activeAddress = ref(address);
  const navigated: Array<{ sheetId: string; address: CellAddress }> = [];
  const feedback = vi.fn();
  let controller: FindController | undefined;
  const wrapper = mount(
    defineComponent({
      setup() {
        controller = useWorkbookFindController({
          getWorkbook: () => workbook,
          getRevision: () => revision.value,
          getAddress: () => activeAddress.value,
          getEvaluator: (sheetId) => createWorkbookEvaluator(workbook, sheetId),
          navigate: (result) => {
            workbook.activeSheetId = result.sheetId;
            activeAddress.value = result.address;
            revision.value += 1;
            navigated.push(result);
          },
          feedback,
        });
        return () => h("div");
      },
    }),
    { global: { plugins: [createAppI18n("en-US")] } },
  );
  mounted.push(wrapper);
  if (!controller) throw new Error("Missing workbook find controller");
  return { controller, workbook, navigated, feedback, revision };
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
  localStorage.removeItem("idea10.findHistory");
});

describe("useWorkbookFindController", () => {
  test("moves through visible sheets and wraps next and previous in row order", () => {
    const { controller, workbook, navigated } = mountController();
    const summary = getActiveSheet(workbook);
    setCellValue(summary, { row: 0, column: 1 }, "needle");
    setCellValue(workbook.sheets.get("beta")!, { row: 0, column: 0 }, "needle");
    setCellValue(workbook.sheets.get("gamma")!, { row: 0, column: 0 }, "needle");
    setCellValue(workbook.sheets.get("hidden")!, { row: 0, column: 0 }, "needle");

    controller.updateQuery("needle");
    controller.updateOptions({ scope: "workbook" });
    controller.find("forward");
    controller.find("forward");
    controller.find("forward");
    controller.find("forward");
    controller.find("backward");

    expect(navigated.map(({ sheetId, address }) => ({ sheetId, address }))).toEqual([
      { sheetId: summary.id, address: { row: 0, column: 1 } },
      { sheetId: "beta", address: { row: 0, column: 0 } },
      { sheetId: "gamma", address: { row: 0, column: 0 } },
      { sheetId: summary.id, address: { row: 0, column: 1 } },
      { sheetId: "gamma", address: { row: 0, column: 0 } },
    ]);
  });

  test("uses column order within a sheet and excludes hidden sheets from workbook results", () => {
    const { controller, workbook, navigated } = mountController();
    const summary = getActiveSheet(workbook);
    setCellValue(summary, { row: 2, column: 0 }, "needle");
    setCellValue(summary, { row: 0, column: 1 }, "needle");
    setCellValue(workbook.sheets.get("beta")!, { row: 0, column: 0 }, "needle");
    setCellValue(workbook.sheets.get("hidden")!, { row: 0, column: 0 }, "needle");

    controller.updateQuery("needle");
    controller.updateOptions({ scope: "workbook", order: "columns" });
    controller.find("forward");
    controller.find("backward");
    controller.findAll();

    expect(navigated.map((result) => result.address)).toEqual([
      { row: 2, column: 0 },
      { row: 0, column: 0 },
    ]);
    expect(navigated[1]?.sheetId).toBe("beta");
    expect(controller.results.value.map((result) => result.sheetId)).toEqual([
      summary.id,
      summary.id,
      "beta",
    ]);

    controller.updateOptions({ scope: "sheet" });
    controller.findAll();
    expect(controller.results.value.map((result) => result.sheetId)).toEqual(["beta"]);
  });

  test("caps rendered find-all results at 200 while retaining the total count", () => {
    const { controller, workbook } = mountController();
    const summary = getActiveSheet(workbook);
    for (let row = 0; row < 205; row += 1) setCellValue(summary, { row, column: 0 }, "needle");

    controller.updateQuery("needle");
    controller.findAll();

    expect(controller.results.value).toHaveLength(200);
    expect(controller.resultCount.value).toBe(205);
  });

  test("invalidates find-all output whenever the query, options, or format changes", () => {
    const { controller, workbook } = mountController();
    setCellValue(getActiveSheet(workbook), { row: 0, column: 0 }, "needle");

    controller.updateQuery("needle");
    controller.findAll();
    expect(controller.hasSearchedAll.value).toBe(true);
    expect(controller.results.value).toHaveLength(1);

    controller.updateQuery("other");
    expect(controller.hasSearchedAll.value).toBe(false);
    expect(controller.results.value).toEqual([]);
    controller.findAll();
    controller.updateOptions({ matchCase: true });
    expect(controller.hasSearchedAll.value).toBe(false);

    controller.setFormat({ style: { fillColor: "#ff0000" }, keys: ["fillColor"] }, "Summary!A1");
    expect(controller.hasSearchedAll.value).toBe(false);
    expect(controller.formatSummary.value).toBe("Format from Summary!A1");
  });

  test("supports format-only find-all and resets after a workbook replacement", () => {
    const { controller, workbook, revision } = mountController();
    const summary = getActiveSheet(workbook);
    setCellStyle(summary, { row: 3, column: 2 }, { fillColor: "#ff0000" });

    controller.setFormat({ style: { fillColor: "#ff0000" }, keys: ["fillColor"] });
    controller.findAll();
    expect(controller.results.value.map((result) => result.address)).toEqual([
      { row: 3, column: 2 },
    ]);

    controller.updateQuery("needle");
    controller.updateOptions({ scope: "workbook", matchCase: true });
    controller.reset();
    revision.value += 1;

    expect(controller.query.value).toBe("");
    expect(controller.options.value).toEqual(DEFAULT_WORKBOOK_FIND_OPTIONS);
    expect(controller.format.value).toBeUndefined();
    expect(controller.hasSearchedAll.value).toBe(false);
    expect(controller.results.value).toEqual([]);
  });

  test("normalizes newline shortcuts for display and decodes them before searching", () => {
    const { controller, workbook } = mountController();
    const summary = getActiveSheet(workbook);
    setCellValue(summary, { row: 0, column: 0 }, "first\nsecond");
    setCellValue(summary, { row: 1, column: 0 }, "^l");

    controller.updateQuery("first\nsecond");
    expect(controller.query.value).toBe("first^lsecond");
    controller.findAll();
    expect(controller.results.value.map((result) => result.address)).toEqual([
      { row: 0, column: 0 },
    ]);

    controller.updateQuery("^^l");
    controller.findAll();
    expect(controller.results.value.map((result) => result.address)).toEqual([
      { row: 1, column: 0 },
    ]);
  });

  test("records a deduplicated MRU text history without recording format-only finds", () => {
    const { controller } = mountController();

    controller.updateQuery("first");
    controller.find("forward");
    controller.updateQuery("second");
    controller.findAll();
    controller.updateQuery("first");
    controller.findAll();
    expect(controller.history.value).toEqual(["first", "second"]);

    controller.updateQuery("");
    controller.setFormat({ style: { fillColor: "#ff0000" }, keys: ["fillColor"] });
    controller.findAll();
    expect(controller.history.value).toEqual(["first", "second"]);

    controller.reset();
    expect(controller.history.value).toEqual(["first", "second"]);
    expect(mountController().controller.history.value).toEqual(["first", "second"]);
    expect(JSON.parse(localStorage.getItem("idea10.findHistory") ?? "{}")).toMatchObject({
      version: 1,
      queries: ["first", "second"],
    });
  });

  test("limits persisted history to 20 most recent queries", () => {
    const { controller } = mountController();
    for (let index = 0; index < 21; index += 1) {
      controller.updateQuery(`query ${index}`);
      controller.findAll();
    }

    expect(controller.history.value).toHaveLength(20);
    expect(controller.history.value[0]).toBe("query 20");
    expect(controller.history.value.at(-1)).toBe("query 1");
  });
});
