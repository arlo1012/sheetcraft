import { describe, expect, test } from "vitest";
import { formulaAdapter } from "../src/probes/formula-adapter.js";

describe("Formula.js 4.6.1 direct representative probes", () => {
  test("observes direct math, criteria, and rounding behavior", () => {
    expect(formulaAdapter.sum([1, 2, 3])).toBe(6);
    expect(formulaAdapter.round(1.235, 2)).toBe(1.24);
    // This records Formula.js's direct result, not an Excel parity assertion.
    expect(formulaAdapter.countIf(["North", "south", "NORTH"], "North")).toBe(1);
    expect(formulaAdapter.sumIfs([10, 20, 30], ["x", "y", "x"], "x")).toBe(40);
  });

  test("observes representative logic, lookup, date, financial, and text calls", () => {
    expect(formulaAdapter.if(false, "wrong", "right")).toBe("right");
    expect(formulaAdapter.match("b", ["a", "b", "c"], 0)).toBe(2);
    expect(formulaAdapter.date(2024, 2, 29)).toEqual(new Date(2024, 1, 29));
    expect(formulaAdapter.workday(new Date(2024, 0, 5), 1)).toEqual(new Date(2024, 0, 8));
    expect(formulaAdapter.payment(0.1 / 12, 12, 1000)).toBeCloseTo(-87.9159, 4);
    expect(formulaAdapter.text(12.5, "0.00")).toBe("12.50");
    const notAvailable = formulaAdapter.notAvailable();
    expect(notAvailable).toBeInstanceOf(Error);
    expect(notAvailable.message).toBe("#N/A");
  });
});
