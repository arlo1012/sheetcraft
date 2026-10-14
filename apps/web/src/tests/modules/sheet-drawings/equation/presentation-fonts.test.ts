import { afterEach, expect, test, vi } from "vitest";
import {
  awaitEquationFontFaces,
  equationFontUse,
} from "../../../../modules/sheet-drawings/equation/equation-presentation-fonts";

afterEach(() => vi.useRealTimers());
const use = { family: "KaTeX_Main", weight: "400", style: "normal", size: 24.2, text: "x" };
const face = {
  family: "KaTeX_Main",
  weight: "normal",
  style: "normal",
  status: "loaded",
} as FontFace;
const state = () => ({ isCurrent: () => true, now: () => Date.now(), deadline: Date.now() + 1000 });

test("font coverage rejects unknown system fonts and missing glyphs while preserving zero-width struts", () => {
  const style = {
    fontFamily: '"KaTeX_Main", serif',
    fontWeight: "normal",
    fontStyle: "normal",
    fontSize: "24.2px",
  } as CSSStyleDeclaration;
  expect(equationFontUse(style, "x\u200b").family).toBe("KaTeX_Main");
  expect(() =>
    equationFontUse({ ...style, fontFamily: "serif" } as CSSStyleDeclaration, "x"),
  ).toThrow(/bundled/u);
  expect(() => equationFontUse(style, "猫")).toThrow(/fallback/u);
});

test("actual loaded matching faces and check are required; fonts.ready alone cannot succeed", async () => {
  vi.useFakeTimers();
  const fonts = {
    load: vi.fn(async () => [face]),
    check: vi.fn(() => true),
  } as unknown as FontFaceSet;
  const pending = awaitEquationFontFaces(fonts, [use, { ...use, text: "y" }], state());
  await vi.advanceTimersByTimeAsync(20);
  await pending;
  expect(fonts.load).toHaveBeenCalledTimes(1);
  expect(fonts.load).toHaveBeenCalledWith('normal 400 24.2px "KaTeX_Main"', "xy");
  for (const loaded of [
    [],
    [{ ...face, status: "error" }],
    [{ ...face, family: "system" }],
    [face, { ...face }],
  ]) {
    const failure = awaitEquationFontFaces(
      { load: async () => loaded, check: () => true } as unknown as FontFaceSet,
      [use],
      state(),
    );
    const check = expect(failure).rejects.toMatchObject({ reason: "font" });
    await vi.advanceTimersByTimeAsync(20);
    await check;
  }
  await expect(
    awaitEquationFontFaces({ ready: Promise.resolve() } as unknown as FontFaceSet, [use], state()),
  ).rejects.toMatchObject({ reason: "font" });
});

test("font waits have bounded time and abort on captured-source staleness", async () => {
  vi.useFakeTimers();
  const fonts = { load: () => new Promise(() => {}), check: () => true } as unknown as FontFaceSet;
  const timeout = awaitEquationFontFaces(fonts, [use], { ...state(), deadline: Date.now() + 30 });
  const timed = expect(timeout).rejects.toMatchObject({ reason: "font" });
  await vi.advanceTimersByTimeAsync(40);
  await timed;
  let current = true;
  const stale = awaitEquationFontFaces(fonts, [use], { ...state(), isCurrent: () => current });
  const aborted = expect(stale).rejects.toMatchObject({ reason: "stale" });
  current = false;
  await vi.advanceTimersByTimeAsync(20);
  await aborted;
});
