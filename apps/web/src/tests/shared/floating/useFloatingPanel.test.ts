import { ref } from "vue";
import { describe, expect, test, vi } from "vitest";
import { computePosition, platform, type Middleware } from "@floating-ui/vue";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
const captured = vi.hoisted(() => ({ middleware: [] as unknown[] }));
vi.mock("@floating-ui/vue", async (original) => ({
  ...(await original<object>()),
  useFloating: (_reference: unknown, _floating: unknown, options: { middleware: unknown[] }) => {
    captured.middleware = options.middleware;
    return {};
  },
}));
function middleware(avoidReferenceOverlap?: boolean) {
  useFloatingPanel(ref(null), ref(null), ref(true), {
    placement: "right-start",
    avoidReferenceOverlap,
  });
  return captured.middleware as Middleware[];
}
describe("outside-reference positioning is opt-in", () => {
  test("default shared behavior retains cross-axis shifting and original flip candidates", () => {
    const items = middleware();
    expect(items.find((entry) => entry.name === "shift")?.options).toEqual({
      padding: 8,
      crossAxis: true,
    });
    expect(items.find((entry) => entry.name === "flip")?.options).toEqual({ padding: 8 });
    expect(middleware(true).find((entry) => entry.name === "shift")?.options).toEqual({
      padding: 8,
      crossAxis: false,
    });
  });
  test("each positioning pass refreshes clipping bounds even when placement coordinates do not change", async () => {
    let clip = { x: 0, y: 0, width: 1000, height: 700 };
    const reference = document.createElement("div"),
      floating = document.createElement("div");
    const run = () =>
      computePosition(reference, floating, {
        placement: "right-start",
        middleware: middleware(true),
        platform: {
          ...platform,
          getOffsetParent: async () => window,
          isRTL: async () => false,
          isElement: async () => false,
          convertOffsetParentRelativeRectToViewportRelativeRect: async ({ rect }) => rect,
          getElementRects: async () => ({
            reference: { x: 200, y: 200, width: 200, height: 200 },
            floating: { x: 0, y: 0, width: 24, height: 24 },
          }),
          getClippingRect: async () => clip,
          getDimensions: async () => ({ width: 24, height: 24 }),
        },
      });
    const first = await run();
    clip = { x: 0, y: 140, width: 1000, height: 560 };
    const second = await run();
    expect([first.x, first.y]).toEqual([second.x, second.y]);
    expect(first.middlewareData.referenceClip.y).toBe(0);
    expect(second.middlewareData.referenceClip.y).toBe(140);
  });
  test.each([
    { x: 100, y: 100, width: 200, height: 200 },
    { x: 760, y: 100, width: 200, height: 200 },
    { x: 0, y: 100, width: 1000, height: 200 },
    { x: 0, y: 450, width: 1000, height: 200 },
  ])("viewport edges flip outside reference %o", async (reference) => {
    const floating = { x: 0, y: 0, width: 24, height: 24 };
    const result = await computePosition(
      document.createElement("div"),
      document.createElement("div"),
      {
        placement: "right-start",
        middleware: middleware(true),
        platform: {
          ...platform,
          getOffsetParent: async () => window,
          isRTL: async () => false,
          isElement: async () => false,
          convertOffsetParentRelativeRectToViewportRelativeRect: async ({ rect }) => rect,
          getElementRects: async () => ({ reference, floating }),
          getClippingRect: async () => ({ x: 0, y: 0, width: 1000, height: 700 }),
          getDimensions: async () => ({ width: 24, height: 24 }),
        },
      },
    );
    expect(result.x >= 8 && result.y >= 8 && result.x + 24 <= 992 && result.y + 24 <= 692).toBe(
      true,
    );
    expect(
      result.x + 24 <= reference.x ||
        result.x >= reference.x + reference.width ||
        result.y + 24 <= reference.y ||
        result.y >= reference.y + reference.height,
    ).toBe(true);
  });
});
