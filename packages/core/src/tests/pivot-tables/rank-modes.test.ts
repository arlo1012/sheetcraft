import { describe, expect, test } from "vitest";
import { buildPivotResult, type PivotValueCondition } from "../../pivot-tables.js";
import { fixture } from "./fixture.js";

function rank(condition: PivotValueCondition, amounts = [80, 10, 6, 4]) {
  const f = fixture([
    ["Region", "Quarter", "Amount"],
    ...amounts.map((amount, index) => [`Group${index + 1}`, "Q1", amount]),
  ]);
  return buildPivotResult(f.workbook, {
    ...f.table,
    axisFilters: [
      {
        axis: "rows",
        field: 0,
        valueCondition: { measure: 0, condition },
      },
    ],
  });
}
describe("pivot cumulative rank modes", () => {
  test("items mode retains the requested number of ranked members", () => {
    const result = rank({ kind: "rank", bottom: false, percent: false, mode: "items", count: 2 });
    expect(result.rowLabels).toEqual(["Group1", "Group2"]);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 90, 90]);
  });
  test("percent mode uses cumulative aggregate share rather than percent of member count", () => {
    const result = rank({ kind: "rank", bottom: false, percent: true, mode: "percent", count: 50 });
    expect(result.rowLabels).toEqual(["Group1"]);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 80, 80]);
  });
  test("sum mode includes the member crossing the cumulative aggregate threshold", () => {
    const result = rank({ kind: "rank", bottom: false, percent: false, mode: "sum", count: 85 });
    expect(result.rowLabels).toEqual(["Group1", "Group2"]);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 90, 90]);
  });
  test("bottom cumulative sum ranks the smallest aggregates first", () => {
    const result = rank({ kind: "rank", bottom: true, percent: false, mode: "sum", count: 8 });
    expect(result.rowLabels).toEqual(["Group3", "Group4"]);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 10, 10]);
  });
  test("cumulative thresholds include all ties at the cutoff", () => {
    const result = rank(
      { kind: "rank", bottom: false, percent: false, mode: "sum", count: 85 },
      [80, 10, 10],
    );
    expect(result.rowLabels).toEqual(["Group1", "Group2", "Group3"]);
    expect(result.matrix.at(-1)).toEqual(["Grand Total", 100, 100]);
  });
  test("legacy percent flag uses cumulative aggregate share without an explicit mode", () => {
    const result = rank({ kind: "rank", bottom: false, percent: true, count: 50 });
    expect(result.rowLabels).toEqual(["Group1"]);
  });
});
