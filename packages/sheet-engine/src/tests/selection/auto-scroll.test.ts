import { describe, expect, test } from "vitest";
import { getSelectionAutoScrollDelta } from "../../selection.js";

describe("selection auto scroll", () => {
  const viewport = { left: 100, top: 50, right: 500, bottom: 350 };

  test("returns no movement away from the viewport edges", () => {
    expect(getSelectionAutoScrollDelta({ x: 300, y: 200 }, viewport)).toEqual({ x: 0, y: 0 });
  });

  test("scrolls in both axes near a corner and caps the speed", () => {
    const delta = getSelectionAutoScrollDelta({ x: 600, y: 400 }, viewport);
    expect(delta.x).toBe(24);
    expect(delta.y).toBe(24);
    expect(getSelectionAutoScrollDelta({ x: 0, y: 0 }, viewport)).toEqual({ x: -24, y: -24 });
  });

  test("uses a smaller step inside an edge band", () => {
    const delta = getSelectionAutoScrollDelta({ x: 110, y: 200 }, viewport);
    expect(delta.x).toBeLessThan(0);
    expect(delta.x).toBeGreaterThan(-24);
    expect(delta.y).toBe(0);
  });
});
