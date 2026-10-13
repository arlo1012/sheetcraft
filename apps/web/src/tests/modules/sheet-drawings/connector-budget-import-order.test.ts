// @vitest-environment node
import { expect, test, vi } from "vitest";

test("workbook-first loading preserves concrete connector ownership budgets", async () => {
  vi.resetModules();
  // This is the ordinary Web consumer order, not a layout-first ideal entry.
  await import("@sheetcraft/core/workbook");
  await import("@sheetcraft/core/picture-axis-metrics");
  await import("@sheetcraft/core/sheet-drawings");
  const { SHAPE_CONNECTOR_LAYOUT_LIMITS } = await import("@sheetcraft/core/shape-connector-layout");
  const { MAX_SHAPE_GROUP_NODES, MAX_SHAPE_GROUP_DEPTH } =
    await import("@sheetcraft/core/shape-group");
  expect(SHAPE_CONNECTOR_LAYOUT_LIMITS.nodes).toBe(10_000);
  expect(SHAPE_CONNECTOR_LAYOUT_LIMITS.depth).toBe(32);
  expect(SHAPE_CONNECTOR_LAYOUT_LIMITS.nodes).toBe(MAX_SHAPE_GROUP_NODES);
  expect(SHAPE_CONNECTOR_LAYOUT_LIMITS.depth).toBe(MAX_SHAPE_GROUP_DEPTH);
  expect(Object.isFrozen(SHAPE_CONNECTOR_LAYOUT_LIMITS)).toBe(true);
});
