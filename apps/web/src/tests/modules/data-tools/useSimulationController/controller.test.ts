import { defineComponent, reactive, ref } from "vue";
import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createWorkbookSession } from "@idea10/core/history";
import { createSequentialIdFactory } from "@idea10/core/runtime";
import { getActiveSheet } from "@idea10/core/workbook";
import { createAppI18n } from "../../../../shared/i18n";
import { useSimulationController } from "../../../../modules/data-tools/useSimulationController";

const { runSimulation } = vi.hoisted(() => ({ runSimulation: vi.fn() }));
vi.mock("../../../../modules/data-tools/simulation-runner", () => ({ runSimulation }));

function fixture() {
  const session = reactive(createWorkbookSession({ idFactory: createSequentialIdFactory() }));
  const generation = ref(0);
  const revision = ref(0);
  const execute = vi.fn(() => true);
  let controller!: ReturnType<typeof useSimulationController>;
  mount(
    defineComponent({
      setup: () => {
        controller = useSimulationController({
          getWorkbook: () => session.workbook,
          getSelection: () => ({
            address: { row: 0, column: 0 },
            range: { start: { row: 0, column: 0 }, end: { row: 0, column: 0 } },
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
  );
  const sheet = getActiveSheet(session.workbook);
  const cell = (column: string, row = 1) => `=${sheet.name}!$${column}$${row}`;
  const range = (first: string, last: string, firstRow = 1, lastRow = 1) =>
    `=${sheet.name}!$${first}$${firstRow}:$${last}$${lastRow}`;
  return { controller, generation, revision, execute, cell, range };
}

describe("useSimulationController", () => {
  beforeEach(() => runSimulation.mockReset());

  test("expands variable ranges, retains zero bounds, and requires same-shaped constraint ranges", async () => {
    const f = fixture();
    f.controller.openPlanning();
    runSimulation.mockResolvedValue({
      status: "feasible",
      changes: [],
      diagnostics: [{ code: "feasible-not-proven-optimal", message: "Core diagnostic" }],
    });
    await f.controller.solvePlanning({
      objective: f.cell("D"),
      direction: "maximize",
      method: "simplex",
      targetValue: "",
      nonnegative: false,
      variables: [{ id: "v", cell: f.range("A", "B"), kind: "continuous", lower: "0", upper: "0" }],
      constraints: [],
    });
    expect(f.controller.simulationResult.value?.diagnostics).toEqual([
      "A feasible integer solution was found; optimality has not been proven.",
    ]);
    const request = runSimulation.mock.calls[0]?.[0].request;
    expect(request.variables).toHaveLength(2);
    expect(
      request.variables.map((item: { lower: number; upper: number }) => [item.lower, item.upper]),
    ).toEqual([
      [0, 0],
      [0, 0],
    ]);

    await f.controller.solvePlanning({
      objective: f.cell("D"),
      direction: "maximize",
      method: "simplex",
      targetValue: "",
      nonnegative: false,
      variables: [{ id: "v", cell: f.cell("A"), kind: "continuous", lower: "", upper: "" }],
      constraints: [
        { id: "c", left: f.range("A", "B"), relation: "lte", right: f.range("C", "C", 1, 2) },
      ],
    });
    expect(f.controller.simulationError.value).toContain("valid");
  });

  test("normalizes integer and binary constraints into the declared changing variables", async () => {
    const f = fixture();
    f.controller.openPlanning();
    runSimulation.mockResolvedValue({ status: "optimal", changes: [], diagnostics: [] });
    await f.controller.solvePlanning({
      objective: f.cell("D"),
      direction: "maximize",
      method: "simplex",
      targetValue: "",
      nonnegative: true,
      variables: [{ id: "v", cell: f.range("A", "B"), kind: "continuous", lower: "", upper: "" }],
      constraints: [
        { id: "integer", left: f.range("A", "B"), relation: "integer", right: "" },
        { id: "binary", left: f.cell("B"), relation: "binary", right: "ignored" },
        { id: "scalar", left: f.range("A", "B"), relation: "lte", right: "2" },
      ],
    });

    const request = runSimulation.mock.calls[0]?.[0].request;
    expect(request.method).toBe("simplex");
    expect(request.variables.map((item: { kind: string }) => item.kind)).toEqual([
      "integer",
      "binary",
    ]);
    expect(request.constraints).toHaveLength(2);
    expect(
      request.constraints.map((item: { relation: string; right: number }) => [
        item.relation,
        item.right,
      ]),
    ).toEqual([
      ["lte", 2],
      ["lte", 2],
    ]);
  });

  test("requires integer and binary constraint cells to be changing variables", async () => {
    const f = fixture();
    f.controller.openPlanning();
    await f.controller.solvePlanning({
      objective: f.cell("D"),
      direction: "maximize",
      method: "simplex",
      targetValue: "",
      nonnegative: true,
      variables: [{ id: "v", cell: f.cell("A"), kind: "continuous", lower: "", upper: "" }],
      constraints: [{ id: "binary", left: f.cell("B"), relation: "binary", right: "" }],
    });

    expect(runSimulation).not.toHaveBeenCalled();
    expect(f.controller.simulationError.value).toContain("must be included as variable cells");
  });

  test("retains an unsolved draft across a revision, invalidates solved preview, and closes on generation", async () => {
    const f = fixture();
    f.controller.openGoalSeek();
    runSimulation.mockResolvedValue({
      status: "success",
      value: 2,
      achievedValue: 10,
      iterations: 3,
    });
    await f.controller.solveGoalSeek({
      formulaCell: f.cell("B"),
      changingCell: f.cell("A"),
      targetValue: "10",
    });
    f.controller.updateGoalSeekDraft({
      formulaCell: f.cell("B"),
      changingCell: f.cell("A"),
      targetValue: "11",
    });
    expect(f.controller.simulationResult.value).toBeUndefined();
    f.revision.value += 1;
    await Promise.resolve();
    expect(f.controller.simulationDialog.value).toBe("goalSeek");
    await f.controller.solveGoalSeek({
      formulaCell: f.cell("B"),
      changingCell: f.cell("A"),
      targetValue: "10",
    });
    expect(f.controller.simulationResult.value?.status).toBe("optimal");
    f.revision.value += 1;
    await Promise.resolve();
    expect(f.controller.simulationResult.value).toBeUndefined();
    expect(f.controller.simulationDialog.value).toBe("goalSeek");
    f.generation.value += 1;
    await Promise.resolve();
    expect(f.controller.simulationDialog.value).toBeUndefined();
  });
});
