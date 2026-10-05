import { afterEach, expect, test, vi } from "vitest";
import type {
  TextReviewRequest,
  TextReviewResult,
} from "../../../modules/review-tools/text-review";

const conversion = vi.hoisted(() => ({
  simplified: vi.fn((text: string) => text.replaceAll("漢", "汉")),
  traditional: vi.fn((text: string) => text.replaceAll("汉", "漢")),
  makeSimplified: vi.fn(),
  makeTraditional: vi.fn(),
}));
vi.mock("opencc-js/t2cn", () => ({ Converter: conversion.makeSimplified }));
vi.mock("opencc-js/cn2t", () => ({ Converter: conversion.makeTraditional }));
vi.mock("nspell", () => {
  throw new Error("Conversion must not load spelling dependencies");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

test("reuses converters, converts repeated text once, and skips non-Han cells", async () => {
  conversion.makeSimplified.mockReturnValue(conversion.simplified);
  conversion.makeTraditional.mockReturnValue(conversion.traditional);
  const worker = {
    onmessage: undefined as undefined | ((event: { data: TextReviewRequest }) => Promise<void>),
    postMessage: vi.fn(),
  };
  vi.stubGlobal("self", worker);
  await import("../../../modules/review-tools/textReview.worker");
  const run = async (mode: TextReviewRequest["mode"], texts: string[]) => {
    await worker.onmessage!({
      data: {
        mode,
        language: "en-US",
        ignored: [],
        cells: texts.map((text, row) => ({
          sheetId: "sheet",
          sheetName: "Sheet",
          address: { row, column: 0 },
          text,
        })),
      },
    });
    return worker.postMessage.mock.lastCall![0] as { ok: boolean; result: TextReviewResult };
  };
  expect((await run("to-traditional", ["hello", "123"])).result.conversions).toEqual([]);
  expect(conversion.makeTraditional).not.toHaveBeenCalled();
  expect((await run("to-traditional", ["汉语", "汉语", "hello"])).result.conversions).toEqual([
    { cell: 0, text: "漢语" },
    { cell: 1, text: "漢语" },
  ]);
  expect(conversion.traditional).toHaveBeenCalledTimes(1);
  await run("to-traditional", ["汉字"]);
  expect(conversion.makeTraditional).toHaveBeenCalledTimes(1);
  expect((await run("to-simplified", ["漢字"])).result.conversions).toEqual([
    { cell: 0, text: "汉字" },
  ]);
  expect(conversion.makeSimplified).toHaveBeenCalledTimes(1);
});
