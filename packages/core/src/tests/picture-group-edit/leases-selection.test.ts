import { describe, expect, test, vi } from "vitest";
import { deduplicatePictureGroupPaths, leasePictureGroupNode } from "../../picture-group-edit.js";
import { fixture } from "./fixture.js";

describe("exact owned picture identity leases and selections", () => {
  test("leases the actual leaf source and detached exact root/owner path", () => {
    const f = fixture();
    const lease = leasePictureGroupNode(f.root, f.path);
    expect(lease.kind).toBe("grouped-picture-v1");
    if (lease.kind !== "grouped-picture-v1") throw new Error("Expected a leaf lease.");
    expect(lease.assetId).toBe("shared-asset");
    expect(lease.source).toEqual(f.picture.frame.source);
    expect(lease.path).toEqual(["root", "inner", "picture"]);
    expect(lease.source).not.toBe(f.picture.frame.source);
    expect(lease.path).not.toBe(f.path);
    f.picture.assetId = "changed";
    f.picture.frame.source.offsetXRatio = 0.9;
    f.path[1] = "changed-owner";
    expect(lease.assetId).toBe("shared-asset");
    expect(lease.source.offsetXRatio).toBe(-0.2);
    expect(lease.path[1]).toBe("inner");
  });
  test.each([["root"], ["root", "inner"]])(
    "containers never lease a fabricated asset: %s",
    (...path) => {
      const f = fixture();
      const lease = leasePictureGroupNode(f.root, path);
      expect(lease).not.toHaveProperty("assetId");
      expect(lease).not.toHaveProperty("source");
      if (lease.kind === "grouped-picture-v1") throw new Error("Expected a container lease.");
      expect(lease.sources[0]!.path).toEqual(f.path);
      expect(lease.sources[0]!.assetId).toBe("shared-asset");
      expect(lease.sources.map((source) => source.path.at(-1))).toEqual(
        path.length === 1
          ? ["picture", "inner-sibling", "root-sibling"]
          : ["picture", "inner-sibling"],
      );
    },
  );
  test.each([
    [],
    ["missing", "inner", "picture"],
    ["root", "picture"],
    ["root", "missing-owner", "picture"],
    ["root", "inner", "missing"],
  ])("missing/rootless/reparented paths have no fallback: %s", (...path) => {
    expect(() => leasePictureGroupNode(fixture().root, path)).toThrow();
  });
  test("array path getters are rejected without execution", () => {
    const getter = vi.fn(() => "root");
    const path: string[] = [];
    Object.defineProperty(path, "0", { get: getter });
    expect(() => leasePictureGroupNode(fixture().root, path)).toThrow(/accessors|data/);
    expect(getter).not.toHaveBeenCalled();
  });
  test("selected ancestors deduplicate descendants regardless of selection order", () => {
    const f = fixture();
    const selected = [f.path, ["root", "root-sibling"], ["root", "inner"], f.path];
    expect(deduplicatePictureGroupPaths(f.root, selected)).toEqual([
      ["root", "root-sibling"],
      ["root", "inner"],
    ]);
    expect(deduplicatePictureGroupPaths(f.root, [...selected, ["root"]])).toEqual([["root"]]);
    expect(deduplicatePictureGroupPaths(f.root, [])).toEqual([]);
    expect(selected[0]).toBe(f.path);
  });
  test("a missing descendant is rejected even if a selected root would hide it", () => {
    const f = fixture();
    expect(() => deduplicatePictureGroupPaths(f.root, [["root"], ["root", "missing"]])).toThrow(
      /missing|reparented/,
    );
  });
});
