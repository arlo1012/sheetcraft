import { expect, test, vi } from "vitest";
import { resolvePictureSourceLayout } from "@sheetcraft/core/picture-frame";
import { getPictureDetailedWorldBounds } from "../../../shared/images/picture-detailed-bounds";
import { createPicturePaintResources } from "../../../shared/images/picture-paint-resources";

const geometry = resolvePictureSourceLayout({ x: 100, y: 200, width: 120, height: 80 }, 37, {
  widthRatio: 1,
  heightRatio: 1,
  offsetXRatio: 0,
  offsetYRatio: 0,
});
test("detailed effects expand only paint bounds, preserving canonical selection and source", () => {
  const before = structuredClone(geometry);
  const expanded = getPictureDetailedWorldBounds(
    geometry,
    {
      detailedStyle: {
        glow: {
          kind: "value",
          value: { color: { kind: "rgb", rgb: "#FF0000" }, opacity: 1, sizePt: 10 },
        },
      },
    },
    undefined,
    undefined,
    2,
  )!;
  expect(expanded.x).toBeLessThan(geometry.bounds.x);
  expect(expanded.y).toBeLessThan(geometry.bounds.y);
  expect(expanded.width).toBeGreaterThan(geometry.bounds.width);
  expect(expanded.height).toBeGreaterThan(geometry.bounds.height);
  expect(geometry).toEqual(before);
});
test("legacy fast-path selection and hidden collapsed frames are unchanged", () => {
  expect(
    getPictureDetailedWorldBounds(geometry, { shadow: "soft" }, undefined, undefined, 2),
  ).toBeUndefined();
  expect(
    getPictureDetailedWorldBounds(
      { ...geometry, collapsed: true },
      { detailedStyle: { fill: { kind: "none" } } },
      undefined,
      undefined,
      2,
    ),
  ).toBeUndefined();
});
test("pure resource metadata only peeks; an explicit pixel lookup starts at most the requested asset", () => {
  const image = { naturalWidth: 30, naturalHeight: 20 } as HTMLImageElement;
  const cache = { peek: vi.fn(() => image), get: vi.fn(() => image) };
  const resources = createPicturePaintResources(
    undefined,
    new Map([["paint", "blob:paint"]]),
    cache,
  );
  expect(resources.getAssetSize?.("paint")).toEqual({ width: 30, height: 20 });
  expect(cache.get).not.toHaveBeenCalled();
  expect(resources.getAssetSize?.("unknown")).toBeUndefined();
  expect(cache.peek).toHaveBeenCalledOnce();
  expect(resources.getAssetImage?.("paint")).toBe(image);
  expect(cache.get).toHaveBeenCalledExactlyOnceWith("blob:paint");
});
