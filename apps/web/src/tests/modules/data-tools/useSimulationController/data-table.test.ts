import { defineComponent, nextTick, reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import type { WorkbookCommand } from "@sheetcraft/core/commands";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import {
  getActiveSheet,
  getCellContent,
  setCellContent,
  setCellValue,
} from "@sheetcraft/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useSimulationController } from "../../../../modules/data-tools/useSimulationController";
import type { DataTableDraft } from "../../../../modules/data-tools/data-table-types";

const { runSimulation } = vi.hoisted(() => ({ runSimulation: vi.fn() }));
vi.mock("../../../../modules/data-tools/simulation-runner", () => ({ runSimulation }));

const mounted: Array<{ unmount(): void }> = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function fixture() {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const sheet = getActiveSheet(session.workbook);
  // A one-variable row data table: top row holds trial values and the first
  // column holds formulas whose values are sampled for each trial.
  setCellContent(sheet, { row: 1, column: 0 }, { kind: "formula", formula: { source: "=D1*2" } });
  setCellContent(sheet, { row: 2, column: 0 }, { kind: "formula", formula: { source: "=D1*3" } });
  setCellValue(sheet, { row: 0, column: 1 }, 1);
  setCellValue(sheet, { row: 0, column: 2 }, 2);
  setCellValue(sheet, { row: 0, column: 3 }, 5);

  const generation = ref(0);
  const revision = ref(0);
  const execute = vi.fn((command: WorkbookCommand) => executeWorkbookCommand(session, command));
  let controller!: ReturnType<typeof useSimulationController>;
  mounted.push(
    mount(
      defineComponent({
        setup() {
          controller = useSimulationController({
            getWorkbook: () => session.workbook,
            getSelection: () => ({
              address: { row: 0, column: 0 },
              range: { start: { row: 0, column: 0 }, end: { row: 2, column: 2 } },
            }),
            getGeneration: () => generation.value,
            getRevision: () => revision.value,
            isBusy: () => false,
            execute,
            flush: () => true,
            focusSheet: () => undefined,
          });
          return () => null;
        },
      }),
      { global: { plugins: [createAppI18n("en-US")] } },
    ),
  );
  const reference = (column: string, row: number) => `=${sheet.name}!$${column}$${row}`;
  const draft = (): DataTableDraft => ({
    range: `=${sheet.name}!$A$1:$C$3`,
    rowInput: reference("D", 1),
    columnInput: "",
  });
  return { session, sheet, controller, generation, revision, execute, draft };
}

describe("data table simulation controller", () => {
  beforeEach(() => runSimulation.mockReset());

  test("discards a preview that resolves after the workbook generation changes", async () => {
    const f = fixture();
    const pending = deferred<{ ok: true; rows: number; columns: number; values: number[][] }>();
    runSimulation.mockReturnValue(pending.promise);
    f.controller.openDataTable();
    f.controller.updateDataTableDraft(f.draft());
    const solving = f.controller.solveDataTable(f.draft());
    f.generation.value += 1;
    pending.resolve({
      ok: true,
      rows: 2,
      columns: 2,
      values: [
        [2, 4],
        [3, 6],
      ],
    });
    await solving;

    expect(f.controller.dataTablePreview.value).toBeUndefined();
    expect(f.controller.simulationError.value).toContain("changed");
    expect(f.controller.simulationDialog.value).toBeUndefined();
  });

  test("clears a solved preview when its draft changes", async () => {
    const f = fixture();
    runSimulation.mockResolvedValue({
      ok: true,
      rows: 2,
      columns: 2,
      values: [
        [2, 4],
        [3, 6],
      ],
    });
    f.controller.openDataTable();
    f.controller.updateDataTableDraft(f.draft());
    await f.controller.solveDataTable(f.draft());
    expect(f.controller.dataTablePreview.value?.values).toEqual([
      [2, 4],
      [3, 6],
    ]);

    f.controller.updateDataTableDraft({ ...f.draft(), rowInput: "" });
    f.controller.applyDataTable();

    expect(f.controller.dataTablePreview.value).toBeUndefined();
    expect(f.controller.simulationError.value).toBe("");
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("invalidates a solved preview when the revision changes", async () => {
    const f = fixture();
    runSimulation.mockResolvedValue({
      ok: true,
      rows: 2,
      columns: 2,
      values: [
        [2, 4],
        [3, 6],
      ],
    });
    f.controller.openDataTable();
    f.controller.updateDataTableDraft(f.draft());
    await f.controller.solveDataTable(f.draft());
    f.revision.value += 1;
    await nextTick();

    f.controller.applyDataTable();
    expect(f.controller.dataTablePreview.value).toBeUndefined();
    expect(f.controller.simulationError.value).toContain("changed");
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("surfaces an invalid worker response without retaining an applicable preview", async () => {
    const f = fixture();
    runSimulation.mockResolvedValue({
      get ok() {
        throw new Error("worker unavailable");
      },
    });
    f.controller.openDataTable();
    f.controller.updateDataTableDraft(f.draft());
    await f.controller.solveDataTable(f.draft());

    expect(f.controller.dataTablePreview.value).toBeUndefined();
    expect(f.controller.simulationError.value).toContain("could not be completed");
    f.controller.applyDataTable();
    expect(f.execute).not.toHaveBeenCalled();
  });

  test("applies the preview as one undoable set of dynamic formulas", async () => {
    const f = fixture();
    runSimulation.mockResolvedValue({
      ok: true,
      rows: 2,
      columns: 2,
      values: [
        [2, 4],
        [3, 6],
      ],
    });
    f.controller.openDataTable();
    f.controller.updateDataTableDraft(f.draft());
    await f.controller.solveDataTable(f.draft());
    f.controller.applyDataTable();

    expect(f.execute).toHaveBeenCalledTimes(1);
    expect(f.controller.simulationDialog.value).toBeUndefined();
    expect(getCellContent(f.sheet, { row: 1, column: 1 })).toMatchObject({
      kind: "formula",
      formula: { source: "=SIMTABLE($A$2,$D$1,$B$1)" },
    });
    expect(getCellContent(f.sheet, { row: 2, column: 2 })).toMatchObject({
      kind: "formula",
      formula: { source: "=SIMTABLE($A$3,$D$1,$C$1)" },
    });
    expect(undoWorkbookCommand(f.session)).toBe(true);
    expect(getCellContent(f.sheet, { row: 1, column: 1 })).toBeNull();
    expect(getCellContent(f.sheet, { row: 2, column: 2 })).toBeNull();
    expect(undoWorkbookCommand(f.session)).toBe(false);
  });
});
