import { describe, expect, test } from "vitest";
import {
  areShapeConnectorsEqual,
  cloneShapeConnector,
  normalizeShapeConnector,
  type ShapeConnector,
} from "../../shape-connector.js";

function connector(): ShapeConnector {
  return {
    kind: "shape-connector-v1",
    begin: { kind: "free", xRatio: 0, yRatio: 0.5 },
    end: { kind: "site", targetId: "target", preset: "ellipse", siteIndex: 2 },
  };
}

describe("shape connector endpoint contract", () => {
  test("ordered endpoints are deeply detached and caller mutation cannot change normalized data", () => {
    const input = connector();
    const result = normalizeShapeConnector(input);
    expect(result).toEqual(input);
    expect(result).not.toBe(input);
    expect(result.begin).not.toBe(input.begin);
    expect(result.end).not.toBe(input.end);
    if (input.begin.kind === "free") input.begin.xRatio = 7;
    if (input.end.kind === "site") input.end.targetId = "changed";
    expect(result.begin).toEqual({ kind: "free", xRatio: 0, yRatio: 0.5 });
    expect(result.end).toEqual({
      kind: "site",
      targetId: "target",
      preset: "ellipse",
      siteIndex: 2,
    });
    if (result.end.kind === "site") result.end.siteIndex = 3;
    expect(input.end).toEqual({
      kind: "site",
      targetId: "changed",
      preset: "ellipse",
      siteIndex: 2,
    });
  });

  test("two attached endpoints can reference different sites on the same target", () => {
    const input = {
      kind: "shape-connector-v1",
      begin: { kind: "site", targetId: " same target ", preset: "rect", siteIndex: 0 },
      end: { kind: "site", targetId: " same target ", preset: "rect", siteIndex: 3 },
    };
    expect(normalizeShapeConnector(input)).toEqual(input);
  });

  test("two free endpoints keep signed ratios and canonicalize all zero fields", () => {
    const value = normalizeShapeConnector({
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: -0, yRatio: -1_000_000 },
      end: { kind: "free", xRatio: 1_000_000, yRatio: -0 },
    });
    expect(value).toEqual({
      kind: "shape-connector-v1",
      begin: { kind: "free", xRatio: 0, yRatio: -1_000_000 },
      end: { kind: "free", xRatio: 1_000_000, yRatio: 0 },
    });
    if (value.begin.kind === "free") expect(Object.is(value.begin.xRatio, -0)).toBe(false);
    if (value.end.kind === "free") expect(Object.is(value.end.yRatio, -0)).toBe(false);
    const site = normalizeShapeConnector({
      ...connector(),
      end: { kind: "site", targetId: "target", preset: "rect", siteIndex: -0 },
    });
    if (site.end.kind === "site") expect(Object.is(site.end.siteIndex, -0)).toBe(false);
  });

  test("normalization preserves target text and remains separate from forest reference validation", () => {
    const input = {
      ...connector(),
      end: { kind: "site", targetId: "  target\t", preset: "line", siteIndex: 15 },
    };
    expect(normalizeShapeConnector(input)).toEqual(input);
  });

  test("clone and canonical equality preserve end identity and detach shared input records", () => {
    const original = connector();
    const copy = cloneShapeConnector(original);
    expect(areShapeConnectorsEqual(original, copy)).toBe(true);
    expect(copy.begin).not.toBe(original.begin);
    expect(copy.end).not.toBe(original.end);
    expect(areShapeConnectorsEqual(original, { ...copy, begin: copy.end, end: copy.begin })).toBe(
      false,
    );
    if (copy.end.kind === "site") copy.end.targetId = "other";
    expect(areShapeConnectorsEqual(original, copy)).toBe(false);
    const endpoint = { kind: "free" as const, xRatio: 0, yRatio: 1 };
    const shared = normalizeShapeConnector({
      kind: "shape-connector-v1",
      begin: endpoint,
      end: endpoint,
    });
    expect(shared.begin).not.toBe(shared.end);
    expect(shared.begin).not.toBe(endpoint);
    expect(
      areShapeConnectorsEqual(
        { kind: "shape-connector-v1", begin: endpoint, end: endpoint },
        { kind: "shape-connector-v1", begin: { ...endpoint, xRatio: -0 }, end: endpoint },
      ),
    ).toBe(true);
  });

  test.each([undefined, null, [], 1, "connector", new Date(), () => connector()])(
    "rejects absent or non-record connector input %#",
    (value) => expect(() => normalizeShapeConnector(value)).toThrow(TypeError),
  );

  test("requires both endpoints and the exact version and endpoint kinds", () => {
    for (const value of [
      {},
      { ...connector(), kind: "shape-connector-v2" },
      { kind: "shape-connector-v1", end: connector().end },
      { kind: "shape-connector-v1", begin: connector().begin },
      { ...connector(), begin: undefined },
      { ...connector(), end: null },
      { ...connector(), begin: { kind: "free", xRatio: 0 } },
      { ...connector(), end: { kind: "site", targetId: "target", preset: "rect" } },
      {
        ...connector(),
        end: { kind: "attached", targetId: "target", preset: "rect", siteIndex: 1 },
      },
      { ...connector(), end: [connector().end] },
    ])
      expect(() => normalizeShapeConnector(value)).toThrow();
  });

  test.each([NaN, Infinity, -Infinity, 1_000_001, -1_000_001, "0", null, undefined, {}])(
    "rejects invalid ratio %# on either free axis",
    (value) => {
      for (const axis of ["xRatio", "yRatio"])
        expect(() =>
          normalizeShapeConnector({
            ...connector(),
            begin: { kind: "free", xRatio: 0, yRatio: 0, [axis]: value },
          }),
        ).toThrow(RangeError);
    },
  );

  test.each([-1, 16, 0.5, NaN, Infinity, -Infinity, "0", null, undefined])(
    "rejects invalid site index %#",
    (siteIndex) =>
      expect(() =>
        normalizeShapeConnector({
          ...connector(),
          end: { kind: "site", targetId: "target", preset: "rect", siteIndex },
        }),
      ).toThrow(RangeError),
  );

  test("rejects invalid target IDs and catalog presets without rewriting identities", () => {
    for (const targetId of ["", " \t\n", 7, null, undefined])
      expect(() =>
        normalizeShapeConnector({
          ...connector(),
          end: { kind: "site", targetId, preset: "rect", siteIndex: 0 },
        }),
      ).toThrow(/target ID/);
    for (const preset of ["rectangle", "RECT", "__proto__", "toString", 0, null, undefined])
      expect(() =>
        normalizeShapeConnector({
          ...connector(),
          end: { kind: "site", targetId: "target", preset, siteIndex: 0 },
        }),
      ).toThrow(/preset/);
  });

  test("rejects unknown and conflicting fields, including absent-valued fallback data", () => {
    for (const value of [
      { ...connector(), route: undefined },
      { ...connector(), family: "elbow" },
      { ...connector(), begin: { kind: "free", xRatio: 0, yRatio: 0, targetId: undefined } },
      {
        ...connector(),
        end: { kind: "site", targetId: "target", preset: "rect", siteIndex: 0, xRatio: 0 },
      },
      {
        ...connector(),
        end: {
          kind: "site",
          targetId: "target",
          preset: "rect",
          siteIndex: 0,
          fallback: undefined,
        },
      },
      {
        ...connector(),
        end: {
          kind: "site",
          targetId: "target",
          preset: "rect",
          siteIndex: 0,
          path: ["root", "target"],
        },
      },
    ])
      expect(() => normalizeShapeConnector(value)).toThrow(/Unknown/);
    const root = connector();
    Object.defineProperty(root, Symbol("hidden"), { value: 1 });
    expect(() => normalizeShapeConnector(root)).toThrow(/Unknown/);
    const endpoint = connector();
    Object.defineProperty(endpoint.end, Symbol("hidden"), { value: 1 });
    expect(() => normalizeShapeConnector(endpoint)).toThrow(/Unknown/);
  });

  test("rejects inherited/class records and accepts detached null-prototype data", () => {
    expect(() =>
      normalizeShapeConnector(Object.assign(Object.create({ inherited: true }), connector())),
    ).toThrow(/ordinary/);
    expect(() =>
      normalizeShapeConnector({
        ...connector(),
        end: Object.assign(Object.create({ inherited: true }), connector().end),
      }),
    ).toThrow(/ordinary/);
    class Endpoint {
      kind = "free";
      xRatio = 0;
      yRatio = 0;
    }
    expect(() => normalizeShapeConnector({ ...connector(), begin: new Endpoint() })).toThrow(
      /ordinary/,
    );
    const input = Object.assign(Object.create(null) as Record<string, unknown>, connector());
    input.begin = Object.assign(Object.create(null) as Record<string, unknown>, connector().begin);
    const result = normalizeShapeConnector(input);
    expect(result).toEqual(connector());
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(result.begin)).toBe(Object.prototype);
  });

  test("never executes connector or endpoint accessors", () => {
    let reads = 0;
    for (const field of ["kind", "begin", "end"]) {
      const value = connector();
      Object.defineProperty(value, field, {
        get() {
          reads++;
          return connector();
        },
      });
      expect(() => normalizeShapeConnector(value)).toThrow(/accessors/);
    }
    for (const field of ["kind", "targetId", "preset", "siteIndex"]) {
      const value = connector();
      Object.defineProperty(value.end, field, {
        get() {
          reads++;
          return 0;
        },
      });
      expect(() => normalizeShapeConnector(value)).toThrow(/accessors/);
    }
    for (const field of ["xRatio", "yRatio"]) {
      const value = connector();
      Object.defineProperty(value.begin, field, {
        get() {
          reads++;
          return 0;
        },
      });
      expect(() => normalizeShapeConnector(value)).toThrow(/accessors/);
    }
    const setter = connector();
    Object.defineProperty(setter, "end", {
      set() {
        reads++;
      },
    });
    expect(() => normalizeShapeConnector(setter)).toThrow(/accessors/);
    expect(reads).toBe(0);
  });

  test("does not execute functions supplied as numeric or identity data", () => {
    let calls = 0;
    const executable = () => {
      calls++;
      return 0;
    };
    expect(() =>
      normalizeShapeConnector({
        ...connector(),
        begin: { kind: "free", xRatio: executable, yRatio: 0 },
      }),
    ).toThrow();
    expect(() =>
      normalizeShapeConnector({
        ...connector(),
        end: { kind: "site", targetId: "target", preset: "rect", siteIndex: executable },
      }),
    ).toThrow();
    expect(calls).toBe(0);
  });
});
