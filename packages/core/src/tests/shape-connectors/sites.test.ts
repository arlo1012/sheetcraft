import { describe, expect, test } from "vitest";
import { shapeFrameLocalToWorld } from "../../shape-frame.js";
import {
  projectShapePresetConnectionSites,
  SHAPE_CONNECTION_SITE_REVISION,
} from "../../shape-connection-sites.js";
import { evaluateShapePresetAtDisplaySize } from "../../shape-presets.js";

const rect = { x: 100, y: 80, width: 360, height: 240 };
describe("exact preset connection-site projection", () => {
  test("keeps pinned source order and exact cardinal midpoint directions", () => {
    const result = projectShapePresetConnectionSites({ preset: "rect" }, rect);
    expect(result.status).toBe("ready");
    expect(result.sites.map((site) => site.identity)).toEqual(
      [0, 1, 2, 3].map((index) => ({
        revision: SHAPE_CONNECTION_SITE_REVISION,
        preset: "rect",
        index,
      })),
    );
    expect(result.sites.map((site) => site.position)).toEqual([
      { x: 280, y: 80 },
      { x: 100, y: 200 },
      { x: 280, y: 320 },
      { x: 460, y: 200 },
    ]);
    expect(result.sites.map((site) => site.direction)).toEqual([
      { x: 0, y: -1 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 0 },
    ]);
  });
  test("reflects positions and directions before the already-composed world angle, once", () => {
    for (const rotation of [0, 37, 90, -90, 180, 360])
      for (const shapeFlipX of [false, true])
        for (const shapeFlipY of [false, true]) {
          const sites = projectShapePresetConnectionSites({ preset: "rect" }, rect, rotation, {
            shapeFlipX,
            shapeFlipY,
          }).sites;
          const local = { x: shapeFlipX ? 0 : rect.width, y: rect.height / 2 };
          const point = shapeFrameLocalToWorld(rect, rotation, local);
          expect(sites[3]!.position.x).toBeCloseTo(point.x, 10);
          expect(sites[3]!.position.y).toBeCloseTo(point.y, 10);
          const sign = shapeFlipX ? -1 : 1;
          expect(sites[3]!.direction.x).toBeCloseTo(
            sign * Math.cos((rotation * Math.PI) / 180),
            10,
          );
          expect(sites[3]!.direction.y).toBeCloseTo(
            sign * Math.sin((rotation * Math.PI) / 180),
            10,
          );
          expect(Math.hypot(sites[3]!.direction.x, sites[3]!.direction.y)).toBeCloseTo(1, 12);
        }
  });
  test("retains actual adjustment-dependent sites and sites outside the shape frame", () => {
    const input = {
      preset: "wedgeRectCallout" as const,
      adjustments: { adj1: -100000, adj2: 150000 },
    };
    const before = structuredClone(input);
    const result = projectShapePresetConnectionSites(input, rect);
    expect(result.sites.at(-1)!.localPosition).toEqual({ x: -180, y: 480 });
    expect(result.sites.at(-1)!.position).toEqual({ x: -80, y: 560 });
    expect(input).toEqual(before);
    input.adjustments.adj1 = 50000;
    const changed = projectShapePresetConnectionSites(input, rect);
    expect(changed.sites.at(-1)!.identity).toEqual(result.sites.at(-1)!.identity);
    expect(changed.sites.at(-1)!.position).not.toEqual(result.sites.at(-1)!.position);
  });
  test("uses the same common-scale metadata for large actual frames", () => {
    const frame = { x: -200, y: 400, width: 16384, height: 8192 };
    const geometry = evaluateShapePresetAtDisplaySize(
      { preset: "ellipse" },
      frame.width,
      frame.height,
    );
    const result = projectShapePresetConnectionSites({ preset: "ellipse" }, frame);
    expect(result.sites).toHaveLength(8);
    for (const [index, site] of result.sites.entries()) {
      expect(site.position.x).toBeCloseTo(frame.x + geometry.connectionSites[index]!.position.x, 9);
      expect(site.position.y).toBeCloseTo(frame.y + geometry.connectionSites[index]!.position.y, 9);
    }
  });
  test("reports collapsed extents explicitly without epsilon evaluation or fabricated sites", () => {
    for (const frame of [
      { ...rect, width: 0 },
      { ...rect, height: 0 },
      { ...rect, width: 0, height: 0 },
    ])
      expect(projectShapePresetConnectionSites({ preset: "ellipse" }, frame)).toEqual({
        status: "collapsed",
        sites: [],
      });
    expect(projectShapePresetConnectionSites({ preset: "line" }, rect).sites).toHaveLength(2);
  });
  test("returns deeply immutable numeric data detached from all source objects", () => {
    const result = projectShapePresetConnectionSites({ preset: "rect" }, { ...rect });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.sites)).toBe(true);
    for (const site of result.sites) {
      expect(Object.isFrozen(site)).toBe(true);
      expect(Object.isFrozen(site.identity)).toBe(true);
      expect(Object.isFrozen(site.position)).toBe(true);
      expect(Object.isFrozen(site.direction)).toBe(true);
      expect(Object.isFrozen(site.localPosition)).toBe(true);
    }
  });
  test("rejects nonfinite, excessive and malformed geometry before any source getter runs", () => {
    for (const frame of [
      { ...rect, width: -1 },
      { ...rect, height: 16385 },
      { ...rect, x: Infinity },
      { ...rect, y: NaN },
    ])
      expect(() => projectShapePresetConnectionSites({ preset: "rect" }, frame)).toThrow();
    for (const rotation of [NaN, Infinity, 361])
      expect(() => projectShapePresetConnectionSites({ preset: "rect" }, rect, rotation)).toThrow();
    let reads = 0;
    const malformed = { ...rect };
    Object.defineProperty(malformed, "width", {
      get() {
        reads++;
        return 360;
      },
    });
    expect(() => projectShapePresetConnectionSites({ preset: "rect" }, malformed)).toThrow(
      /data fields/,
    );
    expect(() =>
      projectShapePresetConnectionSites({ preset: "rect" }, rect, 0, { shapeFlipX: 1 } as never),
    ).toThrow(/booleans/);
    expect(reads).toBe(0);
  });
  test("refuses world-coordinate overflow rather than clamping a visible attachment", () => {
    expect(() =>
      projectShapePresetConnectionSites({ preset: "rect" }, { ...rect, x: 9_999_999 }),
    ).toThrow(/coordinate budget/);
  });
});
