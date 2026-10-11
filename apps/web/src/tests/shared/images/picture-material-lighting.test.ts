// @vitest-environment node
import { expect, test } from "vitest";
import {
  PICTURE_LIGHTING_IDS,
  PICTURE_MATERIAL_IDS,
} from "@sheetcraft/core/picture-detailed-style";
import {
  resolvePictureMaterialLighting,
  shadePictureMaterialColor,
  shadePictureMaterialSurface,
} from "../../../shared/images/picture-material-lighting";

test.each(PICTURE_MATERIAL_IDS)(
  "material %s has bounded distinct renderable coefficients",
  (material) => {
    const result = resolvePictureMaterialLighting(
      { material, lighting: "three-point", lightingAngleDeg: 30 },
      { x: 0.5, y: 0.25, z: 1 },
    );
    expect(result.multiply.every(Number.isFinite)).toBe(true);
    expect(result.add.every(Number.isFinite)).toBe(true);
    expect(result.alphaScale).toBeGreaterThanOrEqual(0);
    expect(result.alphaScale).toBeLessThanOrEqual(1);
    expect(
      shadePictureMaterialColor([100, 125, 150], result).every(
        (value) => value >= 0 && value <= 255,
      ),
    ).toBe(true);
  },
);

test.each(PICTURE_LIGHTING_IDS)("light rig %s has actual bounded surface lighting", (lighting) => {
  const result = resolvePictureMaterialLighting(
    { material: "plastic", lighting, lightingAngleDeg: 0 },
    { x: -0.5, y: 0.2, z: 1 },
  );
  expect(result.multiply.every(Number.isFinite)).toBe(true);
  expect(result.add.some((value) => value > 0)).toBe(true);
});

test("every material and rig produces its own coefficients rather than ignored fields", () => {
  const n = { x: 0.4, y: 0.7, z: 1 };
  const materials = PICTURE_MATERIAL_IDS.map((material) =>
    JSON.stringify(
      resolvePictureMaterialLighting({ material, lighting: "three-point", lightingAngleDeg: 0 }, n),
    ),
  );
  const lighting = PICTURE_LIGHTING_IDS.map((id) =>
    JSON.stringify(
      resolvePictureMaterialLighting({ material: "plastic", lighting: id, lightingAngleDeg: 0 }, n),
    ),
  );
  expect(new Set(materials).size).toBe(PICTURE_MATERIAL_IDS.length);
  expect(new Set(lighting).size).toBe(PICTURE_LIGHTING_IDS.length);
});

test("light rotation changes tilted-face illumination but leaves original format intact", () => {
  const format = {
    material: "plastic" as const,
    lighting: "three-point" as const,
    lightingAngleDeg: 0,
  };
  const first = resolvePictureMaterialLighting(format, { x: 1, y: 0, z: 1 });
  const rotated = resolvePictureMaterialLighting(
    { ...format, lightingAngleDeg: 90 },
    { x: 1, y: 0, z: 1 },
  );
  expect(rotated).not.toEqual(first);
  expect(format.lightingAngleDeg).toBe(0);
});

test("flat shading preserves pixels and all shading preserves transparent alpha", () => {
  const input = {
    width: 2,
    height: 1,
    data: new Uint8ClampedArray([25, 100, 200, 128, 255, 255, 255, 0]),
  };
  const before = new Uint8ClampedArray(input.data);
  const flat = resolvePictureMaterialLighting(
    { material: "flat", lighting: "harsh", lightingAngleDeg: 0 },
    { x: 0, y: 0, z: 1 },
  );
  const output = shadePictureMaterialSurface(input, flat);
  expect([...output.data]).toEqual([25, 100, 200, 128, 0, 0, 0, 0]);
  expect(input.data).toEqual(before);
  const wire = resolvePictureMaterialLighting(
    { material: "wire-frame", lighting: "flat", lightingAngleDeg: 0 },
    { x: 0, y: 0, z: 1 },
  );
  expect(wire.wireframe).toBe(true);
  expect([...shadePictureMaterialSurface(input, wire).data]).toEqual(Array(8).fill(0));
  const clear = resolvePictureMaterialLighting(
    { material: "clear", lighting: "flat", lightingAngleDeg: 0 },
    { x: 0, y: 0, z: 1 },
  );
  expect(shadePictureMaterialSurface(input, clear).data[3]).toBe(Math.round(128 * 0.28));
});

test.each([Number.NaN, Number.POSITIVE_INFINITY, 3601])(
  "rejects unsafe lighting angle %s",
  (lightingAngleDeg) => {
    expect(() =>
      resolvePictureMaterialLighting(
        { material: "matte", lighting: "flat", lightingAngleDeg },
        { x: 0, y: 0, z: 1 },
      ),
    ).toThrow();
  },
);
test("zero and nonfinite directions reject before shading", () => {
  const format = { material: "matte" as const, lighting: "flat" as const, lightingAngleDeg: 0 };
  expect(() => resolvePictureMaterialLighting(format, { x: 0, y: 0, z: 0 })).toThrow();
  expect(() => resolvePictureMaterialLighting(format, { x: Number.NaN, y: 0, z: 1 })).toThrow();
  expect(() =>
    shadePictureMaterialSurface(
      { width: 4096, height: 4096, data: new Uint8ClampedArray(0) },
      resolvePictureMaterialLighting(format, { x: 0, y: 0, z: 1 }),
    ),
  ).toThrow();
});
