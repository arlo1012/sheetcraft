// @vitest-environment node
import { expect, test } from "vitest";
import { TEXT_WARP_PRESET_NAMES, evaluateTextWarp } from "@sheetcraft/core/text-warps";
import {
  WORDART_ENVELOPE_PRESETS,
  WORDART_FOLLOW_PATH_PRESETS,
  WORDART_NO_TRANSFORM_PRESET,
  WORDART_TRANSFORM_PRESET_COUNT,
  WORDART_TRANSFORM_PRESETS,
  getWordArtTransformDiagram,
  getWordArtTransformPreset,
  materializeWordArtTransformPreset,
} from "../../../modules/sheet-drawings/wordart-transform-presets";

test("41 product-labelled choices are exactly absence, four tracks, and all 36 standard envelopes", () => {
  expect(WORDART_TRANSFORM_PRESET_COUNT).toBe(41);
  expect(WORDART_TRANSFORM_PRESETS).toHaveLength(41);
  expect(WORDART_FOLLOW_PATH_PRESETS.map((choice) => choice.id)).toEqual([
    "textArchUp",
    "textArchDown",
    "textCircle",
    "textButton",
  ]);
  expect(WORDART_ENVELOPE_PRESETS).toHaveLength(36);
  expect(WORDART_TRANSFORM_PRESETS[0]).toBe(WORDART_NO_TRANSFORM_PRESET);
  expect(
    WORDART_TRANSFORM_PRESETS.slice(1)
      .map((choice) => choice.id)
      .sort(),
  ).toEqual([...TEXT_WARP_PRESET_NAMES].sort());
  for (const choice of WORDART_TRANSFORM_PRESETS) {
    expect(getWordArtTransformPreset(choice.id)).toBe(choice);
    expect(choice.label["en-US"]).toMatch(/[A-Za-z]/);
    expect(choice.label["zh-CN"]).toMatch(/[\u4e00-\u9fff]/u);
    expect(Object.isFrozen(choice)).toBe(true);
    if (choice.warp) expect(evaluateTextWarp(choice.warp, 120, 50).family).toBe(choice.family);
  }
});

test("No transform materializes as absence and transformed intents are detached catalog identities", () => {
  expect(WORDART_NO_TRANSFORM_PRESET).not.toHaveProperty("warp");
  expect(materializeWordArtTransformPreset("textNoShape")).toBeUndefined();
  for (const choice of WORDART_TRANSFORM_PRESETS.slice(1)) {
    expect(materializeWordArtTransformPreset(choice)).toEqual({ preset: choice.id });
    expect(materializeWordArtTransformPreset(choice)).not.toBe(choice.warp);
  }
  expect(getWordArtTransformPreset("rectangle")).toBeUndefined();
  expect(() => materializeWordArtTransformPreset("rectangle")).toThrow(RangeError);
});

test("every standard choice has a distinct safe bounded geometry diagram with exact source roles", () => {
  const signatures = new Set<string>();
  for (const choice of WORDART_TRANSFORM_PRESETS) {
    const diagram = getWordArtTransformDiagram(choice);
    expect(Object.isFrozen(diagram)).toBe(true);
    expect(getWordArtTransformDiagram(choice)).toBe(diagram);
    signatures.add(JSON.stringify(diagram));
    if (!choice.warp) {
      expect(diagram).toEqual({ untransformed: true, tracks: [], bands: [] });
      continue;
    }
    const geometry = evaluateTextWarp(choice.warp, 120, 50);
    expect(diagram.tracks).toHaveLength(geometry.tracks.length);
    expect(diagram.bands).toHaveLength(geometry.bands.length);
    expect(diagram.untransformed).toBe(false);
    const paths = [
      ...diagram.tracks.flatMap((track) => [track.boundary, track.ticks, track.direction]),
      ...diagram.bands.flatMap((band) => [band.top, band.bottom, band.rungs]),
    ];
    for (const path of paths) {
      expect(path).toMatch(/^[MLQCA\d .-]+$/);
      expect(path).not.toMatch(/NaN|Infinity|undefined|<|>/);
      expect(path.length).toBeLessThan(4096);
    }
  }
  expect(signatures.size).toBe(41);
});

test("diagram geometry admits catalog identities only, never supplied path markup or altered adjustments", () => {
  const standard = WORDART_FOLLOW_PATH_PRESETS[0]!;
  const forged = { ...standard, warp: { preset: "textArchUp" as const, adjustments: { adj: 0 } } };
  expect(getWordArtTransformDiagram(forged)).toBe(getWordArtTransformDiagram(standard));
  expect(() =>
    getWordArtTransformDiagram({ ...standard, id: "<svg>" as typeof standard.id }),
  ).toThrow(RangeError);
});
