import { expect, test, vi } from "vitest";
import { createWorkbook, getActiveSheet } from "@sheetcraft/core/workbook";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import { assertExternalPictureGroupSupport } from "../../../modules/sheet-images/picture-document-support";
import {
  downloadWorkbookBundle,
  parseWorkbookJson,
} from "../../../modules/workbook-persistence/workbookJsonTransfer";
import { groupAtDepth } from "./group-json-fixture";

function fixture(depth = 1) {
  const workbook = createWorkbook({ id: "safety", sheetId: "sheet" });
  const group = groupAtDepth(depth);
  getActiveSheet(workbook).floatingImages = [group];
  return { workbook, group };
}

test("Core's 32-owner depth is distinct from the portable data depth budget", () => {
  const { workbook } = fixture(32);
  expect(() => assertExternalPictureGroupSupport(workbook)).not.toThrow();
  const snapshot = serializeWorkbook(workbook);
  expect(serializeWorkbook(parseWorkbookJson(JSON.stringify(snapshot)))).toEqual(snapshot);
  expect(() => assertExternalPictureGroupSupport(fixture(33).workbook)).toThrow(/depth/);
});

test.each(["members", "frame", "source", "appearance", "detailed-style", "array-entry"])(
  "rejects group %s accessors without execution or asset reads",
  async (kind) => {
    const { workbook, group } = fixture();
    const leaf = group.members[0]!;
    if (leaf.kind !== "grouped-picture-v1") throw Error("fixture");
    const getter = vi.fn(() => {
      throw Error("must not execute");
    });
    if (kind === "members") Object.defineProperty(group, "members", { get: getter });
    if (kind === "frame") Object.defineProperty(leaf, "frame", { get: getter });
    if (kind === "source") Object.defineProperty(leaf.frame, "source", { get: getter });
    if (kind === "appearance") {
      leaf.transform = {};
      Object.defineProperty(leaf.transform, "appearance", { get: getter });
    }
    if (kind === "detailed-style") {
      leaf.transform = { appearance: {} };
      Object.defineProperty(leaf.transform.appearance!, "detailedStyle", { get: getter });
    }
    if (kind === "array-entry") Object.defineProperty(group.members, "0", { get: getter });
    const store = { get: vi.fn(), put: vi.fn() };
    await expect(downloadWorkbookBundle(workbook, store)).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(store.get).not.toHaveBeenCalled();
  },
);

test.each([
  "cycle",
  "shared-node",
  "duplicate-id",
  "unknown-kind",
  "unknown-frame",
  "sparse",
  "iterator",
  "overflow",
  "data-cycle",
  "data-depth",
])("rejects invalid group %s before resource access", async (kind) => {
  const { workbook, group } = fixture();
  const leaf = group.members[0]!;
  if (leaf.kind !== "grouped-picture-v1") throw Error("fixture");
  if (kind === "cycle") group.members.push(group as never);
  if (kind === "shared-node") group.members.push(leaf);
  if (kind === "duplicate-id") group.members.push(structuredClone(leaf));
  if (kind === "unknown-kind") Object.assign(leaf, { kind: "future-child" });
  if (kind === "unknown-frame") Object.assign(leaf.frame, { kind: "future-frame" });
  if (kind === "sparse") delete group.members[0];
  if (kind === "iterator")
    Object.defineProperty(group.members, Symbol.iterator, { value: () => [] });
  if (kind === "overflow") leaf.frame.rect.widthRatio = Number.MAX_VALUE;
  if (kind === "data-cycle") Object.assign(leaf.frame.source, { cycle: leaf.frame.source });
  if (kind === "data-depth") {
    let nested: object = {};
    for (let index = 0; index < 34; index++) nested = { nested };
    Object.assign(leaf.frame.source, { nested });
  }
  const store = { get: vi.fn(), put: vi.fn() };
  await expect(downloadWorkbookBundle(workbook, store)).rejects.toThrow();
  expect(store.get).not.toHaveBeenCalled();
  expect(store.put).not.toHaveBeenCalled();
});

test("forest-wide node IDs and count stay bounded", () => {
  const { workbook, group } = fixture();
  const leaf = group.members[0]!;
  group.members = Array.from({ length: 10_000 }, (_, index) => ({
    ...structuredClone(leaf),
    id: `leaf-${index}`,
  }));
  expect(() => assertExternalPictureGroupSupport(workbook)).toThrow(/budget/);
});

test("individually valid group trees still share one forest node budget", async () => {
  const { workbook, group } = fixture();
  const other = groupAtDepth(1);
  other.id = "other-owner";
  for (const [prefix, root] of [
    ["first", group],
    ["second", other],
  ] as const) {
    const leaf = root.members[0]!;
    root.members = Array.from({ length: 5000 }, (_, index) => ({
      ...structuredClone(leaf),
      id: `${prefix}-${index}`,
    }));
  }
  getActiveSheet(workbook).floatingImages = [group, other];
  expect(() => assertExternalPictureGroupSupport(workbook)).toThrow(/budget/);
  const store = { get: vi.fn(), put: vi.fn() };
  await expect(downloadWorkbookBundle(workbook, store)).rejects.toThrow(/budget/);
  expect(store.get).not.toHaveBeenCalled();
  expect(store.put).not.toHaveBeenCalled();
});
