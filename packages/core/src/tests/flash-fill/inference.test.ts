import { describe, expect, test } from "vitest";
import { FlashFillPatternError, inferFlashFill } from "../../flash-fill.js";

const infer = (
  examples: ReadonlyArray<{ inputs: readonly string[]; output: string }>,
  targets: ReadonlyArray<readonly string[]>,
) => inferFlashFill(examples, targets);

describe("Flash Fill inference", () => {
  test("extracts delimiter tokens", () => {
    expect(
      infer(
        [
          { inputs: ["Ada Lovelace"], output: "Ada" },
          { inputs: ["Grace Hopper"], output: "Grace" },
        ],
        [["Alan Turing"]],
      ),
    ).toEqual(["Alan"]);
  });

  test("extracts email names and numeric runs", () => {
    expect(
      infer(
        [
          { inputs: ["ada.lovelace@example.com", "INV-0042"], output: "ada.lovelace #0042" },
          { inputs: ["grace.hopper@example.com", "INV-0017"], output: "grace.hopper #0017" },
        ],
        [["alan.turing@example.com", "INV-0009"]],
      ),
    ).toEqual(["alan.turing #0009"]);
  });

  test("concatenates source cells with a constant separator and prefix", () => {
    expect(
      infer(
        [
          { inputs: ["Ada", "Lovelace"], output: "Dr. Ada Lovelace" },
          { inputs: ["Grace", "Hopper"], output: "Dr. Grace Hopper" },
        ],
        [["Alan", "Turing"]],
      ),
    ).toEqual(["Dr. Alan Turing"]);
  });

  test("uses Unicode delimiter tokens", () => {
    expect(
      infer(
        [
          { inputs: ["张三-研发"], output: "研发" },
          { inputs: ["李四-产品"], output: "产品" },
        ],
        [["王五-设计"]],
      ),
    ).toEqual(["设计"]);
  });

  test("preserves a demonstrated case transformation", () => {
    expect(
      infer(
        [
          { inputs: ["ada"], output: "ADA" },
          { inputs: ["Grace"], output: "GRACE" },
        ],
        [["Alan"]],
      ),
    ).toEqual(["ALAN"]);
  });

  test("supports a fixed slice when two examples establish it", () => {
    expect(
      infer(
        [
          { inputs: ["ABC-2025"], output: "ABC" },
          { inputs: ["XYZ-2026"], output: "XYZ" },
        ],
        [["QWE-2027"]],
      ),
    ).toEqual(["QWE"]);
  });

  test("uses a unique one-example concatenation and constant prefix", () => {
    expect(
      infer([{ inputs: ["Ada", "Lovelace"], output: "Lovelace, Ada" }], [["Grace", "Hopper"]]),
    ).toEqual(["Hopper, Grace"]);
    expect(infer([{ inputs: ["0007"], output: "ID-0007" }], [["0012"]])).toEqual(["ID-0012"]);
  });

  test("requires two examples for arbitrary fixed slices and slices Unicode by code point", () => {
    expect(() => infer([{ inputs: ["😀A"], output: "😀" }], [["😎B"]])).toThrow(/pattern/i);
    expect(
      infer(
        [
          { inputs: ["😀A"], output: "😀" },
          { inputs: ["😎B"], output: "😎" },
        ],
        [["🤖C"]],
      ),
    ).toEqual(["🤖"]);
  });

  test("rejects a target row missing the inferred token", () => {
    expect(() =>
      infer(
        [
          { inputs: ["Ada Lovelace"], output: "Lovelace" },
          { inputs: ["Grace Hopper"], output: "Hopper" },
        ],
        [["Plato"]],
      ),
    ).toThrow(/missing/i);
    expect(() =>
      infer(
        [
          { inputs: ["Ada Lovelace"], output: "Ada" },
          { inputs: ["Grace Hopper"], output: "Grace" },
        ],
        [["Plato"]],
      ),
    ).toThrow(/missing/i);
  });

  test("rejects equally simple ambiguous transformations", () => {
    expect(() =>
      infer(
        [
          { inputs: ["Anna", "Alice"], output: "A" },
          { inputs: ["Alex", "Amy"], output: "A" },
        ],
        [["Bert", "Clare"]],
      ),
    ).toThrow(FlashFillPatternError);
    try {
      infer(
        [
          { inputs: ["Anna", "Alice"], output: "A" },
          { inputs: ["Alex", "Amy"], output: "A" },
        ],
        [["Bert", "Clare"]],
      );
    } catch (error) {
      expect((error as FlashFillPatternError).reason).toBe("ambiguous");
    }
  });

  test("rejects examples that conflict", () => {
    expect(() =>
      infer(
        [
          { inputs: ["Ada"], output: "A" },
          { inputs: ["Grace"], output: "Gx" },
        ],
        [["Alan"]],
      ),
    ).toThrow(FlashFillPatternError);
  });

  test("bounds input width and text length", () => {
    expect(() =>
      infer([{ inputs: Array.from({ length: 9 }, () => "x"), output: "x" }], [["x"]]),
    ).toThrow(/too many/i);
    expect(() => infer([{ inputs: ["x".repeat(257)], output: "x" }], [["x"]])).toThrow(/too long/i);
  });
});
