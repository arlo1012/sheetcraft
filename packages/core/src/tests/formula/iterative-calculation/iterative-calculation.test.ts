import { describe, expect, test } from "vitest";
import { createFormulaError, type FormulaValue } from "../../../formula/types.js";
import { calculateIterativeComponents } from "../../../formula/iterative-calculation.js";

function calculate(
  dependencies: ReadonlyMap<string, ReadonlySet<string>>,
  evaluate: (key: string, read: (key: string) => FormulaValue) => FormulaValue,
  initialValues = new Map<string, FormulaValue>(),
  options: Partial<{ maxIterations: number; maxChange: number }> = {},
) {
  return calculateIterativeComponents({
    dependencies,
    initialValue: (key) => initialValues.get(key) ?? initial(key),
    evaluate,
    maxIterations: options.maxIterations ?? 100,
    maxChange: options.maxChange ?? 0.000_001,
  });
}

function initial(_key: string): FormulaValue {
  return null;
}

describe("iterative calculation", () => {
  test("converges a self-referencing formula from zero", () => {
    const values = calculate(new Map([["x", new Set(["x"])]]), (_key, read) => (read("x") as number + 1) / 2);
    expect(values.get("x")).toBeCloseTo(1, 5);
  });

  test("converges a mutual cycle", () => {
    const values = calculate(
      new Map([["a", new Set(["b"])], ["b", new Set(["a"])]]),
      (key, read) => key === "a" ? ((read("b") as number) + 2) / 2 : ((read("a") as number) + 2) / 2,
    );
    expect(values.get("a")).toBeCloseTo(2, 5);
    expect(values.get("b")).toBeCloseTo(2, 5);
  });

  test("resolves dependent cyclic components before their consumers", () => {
    const values = calculate(
      new Map([
        ["a", new Set(["a"])],
        ["b", new Set(["b", "a"])],
      ]),
      (key, read) => key === "a" ? ((read("a") as number) + 1) / 2 : ((read("b") as number) + (read("a") as number)) / 2,
    );
    expect(values.get("a")).toBeCloseTo(1, 5);
    expect(values.get("b")).toBeCloseTo(1, 5);
  });

  test("resolves an acyclic bridge before a downstream cyclic component", () => {
    const values = calculate(
      new Map([
        ["a", new Set(["a"])],
        ["bridge", new Set(["a"])],
        ["c", new Set(["c", "bridge"])],
      ]),
      (key, read) => {
        if (key === "a") return ((read("a") as number) + 1) / 2;
        if (key === "bridge") return (read("a") as number) + 1;
        return ((read("c") as number) + (read("bridge") as number)) / 2;
      },
    );
    expect(values.get("a")).toBeCloseTo(1, 5);
    expect(values.get("c")).toBeCloseTo(2, 5);
    expect(values.has("bridge")).toBe(false);
  });

  test("returns the exact final pass when the iteration limit is reached", () => {
    const values = calculate(
      new Map([["x", new Set(["x"])]]),
      (_key, read) => (read("x") as number) + 1,
      new Map(),
      { maxIterations: 3, maxChange: 0 },
    );
    expect(values.get("x")).toBe(3);
  });

  test("preserves formula errors and converts non-finite results to NUM", () => {
    const errors = calculate(new Map([["x", new Set(["x"])]]), () => createFormulaError("DIV0"));
    expect(errors.get("x")).toEqual(createFormulaError("DIV0"));
    const invalid = calculate(new Map([["x", new Set(["x"])]]), () => Number.POSITIVE_INFINITY);
    expect(invalid.get("x")).toEqual(createFormulaError("NUM"));
  });

  test("converges stable nonnumeric values by equality", () => {
    const values = calculate(new Map([["x", new Set(["x"])]]), () => "complete");
    expect(values.get("x")).toBe("complete");
  });

  test("keeps calculated acyclic nodes internal to the result", () => {
    const values = calculate(
      new Map([["a", new Set(["b"])], ["b", new Set()]]),
      (key, read) => key === "a" ? (read("b") as number) + 1 : 1,
    );
    expect(values).toEqual(new Map());
  });

  test("handles a 15,000 node dependency chain without recursion", () => {
    const dependencies = new Map<string, ReadonlySet<string>>();
    for (let index = 0; index < 15_000; index += 1) {
      dependencies.set(`n${index}`, index === 0 ? new Set() : new Set([`n${index - 1}`]));
    }
    expect(calculate(dependencies, () => 0)).toEqual(new Map());
  });
});
