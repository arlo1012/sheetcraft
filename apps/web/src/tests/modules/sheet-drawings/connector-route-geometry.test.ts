// @vitest-environment node
import { describe, expect, test } from "vitest";
import { resolvePictureLayout } from "@sheetcraft/core/picture-frame";
import {
  resolveShapeConnectorRoute,
  type ReadyShapeConnectorRoute,
} from "@sheetcraft/core/shape-connector-route";
import { shapeFrameLocalToWorld } from "@sheetcraft/core/shape-frame";
import {
  evaluateShapePresetAtDisplaySize,
  flattenShapePath,
  shapePresetPathToSvg,
  type EvaluatedShapePresetGeometry,
  type ShapePathCommand,
  type ShapePresetName,
  type ShapePresetParameters,
} from "@sheetcraft/core/shape-presets";
import { createGraphicDrawing } from "../../../modules/sheet-drawings/drawing-defaults";
import {
  getDrawingShapeGeometry,
  getStandardShapeLocalBounds,
  getStandardShapeSvgPaths,
  getStandardShapeWorldBounds,
  prepareResolvedShapeGeometry,
  STANDARD_SHAPE_GEOMETRY_LIMITS,
  standardShapeContainsLocalPoint,
  standardShapeContainsWorldPoint,
} from "../../../modules/sheet-drawings/shape-geometry";

type Point = Readonly<{ x: number; y: number }>;
const carrier = resolvePictureLayout({ x: 30, y: 40, width: 100, height: 60 }, 0);
const stroke = { fill: "transparent", stroke: "#123456", strokeWidth: 0.2 };
const presets: readonly ShapePresetName[] = [
  "line",
  "lineInv",
  "bentConnector2",
  "bentConnector3",
  "bentConnector4",
  "bentConnector5",
  "curvedConnector2",
  "curvedConnector3",
  "curvedConnector4",
  "curvedConnector5",
];
function ready(
  shape: ShapePresetParameters = { preset: "line" },
  begin: Point = { x: 10, y: 20 },
  end: Point = { x: 210, y: 140 },
  angleDeg = 0,
): ReadyShapeConnectorRoute {
  const route = resolveShapeConnectorRoute(shape, { ...carrier, angleDeg }, begin, end);
  if (route.status !== "ready") throw new Error("Expected a ready Core connector route.");
  return route;
}
function paintDrawing(route: ReadyShapeConnectorRoute, shape: ShapePresetParameters) {
  return {
    ...createGraphicDrawing("connector", "shape", "connector", { row: 0, column: 0 }),
    width: route.paintLayout.rect.width,
    height: route.paintLayout.rect.height,
    rotation: route.paintLayout.angleDeg,
    shapeGeometry: shape,
  };
}
function expectTips(route: ReadyShapeConnectorRoute, geometry: EvaluatedShapePresetGeometry) {
  const commands = geometry.paths[0]!.commands;
  expect(commands[0]!.slice(1)).toEqual([route.localEndpoints[0].x, route.localEndpoints[0].y]);
  expect(commands.at(-1)!.slice(-2)).toEqual([
    route.localEndpoints[1].x,
    route.localEndpoints[1].y,
  ]);
  for (const [local, expected] of [
    [route.localEndpoints[0], route.begin],
    [route.localEndpoints[1], route.end],
  ] as const) {
    const actual = shapeFrameLocalToWorld(
      route.paintLayout.rect,
      route.paintLayout.angleDeg,
      local,
    );
    expect(actual.x).toBeCloseTo(expected.x, 10);
    expect(actual.y).toBeCloseTo(expected.y, 10);
    expect(
      standardShapeContainsWorldPoint(
        geometry,
        stroke,
        route.paintLayout.rect,
        route.paintLayout.angleDeg,
        expected,
      ),
    ).toBe(true);
  }
}
function freezeData<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}
function candidate(overrides: Record<string, unknown>): EvaluatedShapePresetGeometry {
  return freezeData({
    ...structuredClone(ready().geometry),
    ...overrides,
  }) as EvaluatedShapePresetGeometry;
}

describe("Core connector route numeric preparation", () => {
  test.each(presets)(
    "%s keeps exact Core commands and identity through SVG/hit/bounds",
    (preset) => {
      const route = ready({ preset });
      expect(getStandardShapeSvgPaths(route.geometry)).toEqual([]);
      const geometry = prepareResolvedShapeGeometry(route.geometry);
      expect(geometry).toBe(route.geometry);
      expect(prepareResolvedShapeGeometry(route.geometry)).toBe(geometry);
      expect(getStandardShapeSvgPaths(geometry)).toEqual([
        {
          d: shapePresetPathToSvg(route.geometry.paths[0]!),
          filled: route.geometry.paths[0]!.filled,
          fillMode: route.geometry.paths[0]!.fillMode,
          stroke: true,
        },
      ]);
      expect(Object.isFrozen(getStandardShapeSvgPaths(geometry))).toBe(true);
      expect(Object.isFrozen(getStandardShapeSvgPaths(geometry)[0])).toBe(true);
      expectTips(route, geometry!);
      expect(getStandardShapeLocalBounds(geometry, stroke)).toBeDefined();
      expect(
        getStandardShapeWorldBounds(
          geometry,
          stroke,
          route.paintLayout.rect,
          route.paintLayout.angleDeg,
        ),
      ).toBeDefined();
      expect(
        getStandardShapeLocalBounds(geometry, { ...stroke, stroke: "transparent" }),
      ).toBeUndefined();
    },
  );

  test.each([
    [
      { x: 10, y: 20 },
      { x: 110, y: 20 },
    ],
    [
      { x: 10, y: 20 },
      { x: 10, y: 120 },
    ],
    [
      { x: 10, y: 20 },
      { x: 110, y: 20.25 },
    ],
    [
      { x: 10, y: 20 },
      { x: 10.25, y: 120 },
    ],
  ])("zero/subpixel axes preserve actual tips inside the padded paint frame", (begin, end) => {
    for (const preset of ["line", "bentConnector3", "curvedConnector3"] as const) {
      const route = ready({ preset }, begin, end);
      const geometry = getDrawingShapeGeometry(
        paintDrawing(route, { preset }),
        false,
        route.geometry,
      );
      expect(geometry).toBe(route.geometry);
      expectTips(route, geometry!);
      expect(standardShapeContainsLocalPoint(geometry, stroke, { x: 0, y: 0 })).toBe(false);
      if (begin.y === end.y)
        expect(
          geometry!.paths[0]!.commands.every((command) =>
            command
              .slice(2)
              .filter((_, index) => index % 2 === 0)
              .every((y) => y === 0.5),
          ),
        ).toBe(true);
      if (begin.x === end.x)
        expect(
          geometry!.paths[0]!.commands.every((command) =>
            command
              .slice(1)
              .filter((_, index) => index % 2 === 0)
              .every((x) => x === 0.5),
          ),
        ).toBe(true);
      if (preset === "line") {
        const bounds = getStandardShapeWorldBounds(geometry, stroke, route.paintLayout.rect, 0)!;
        expect(bounds.x).toBeCloseTo(Math.min(begin.x, end.x) - 0.1, 10);
        expect(bounds.y).toBeCloseTo(Math.min(begin.y, end.y) - 0.1, 10);
        expect(bounds.width).toBeCloseTo(Math.abs(end.x - begin.x) + 0.2, 10);
        expect(bounds.height).toBeCloseTo(Math.abs(end.y - begin.y) + 0.2, 10);
      }
    }
  });

  test.each(["line", "lineInv"] as const)(
    "%s keeps swapped and source-flipped endpoint order without another reflection",
    (preset) => {
      const source = evaluateShapePresetAtDisplaySize(
        { preset },
        carrier.rect.width,
        carrier.rect.height,
      );
      const first = source.paths[0]!.commands[0]!,
        last = source.paths[0]!.commands.at(-1)!;
      for (const shapeFlipX of [false, true])
        for (const shapeFlipY of [false, true]) {
          const sourceTips = [first, last].map((command) =>
            shapeFrameLocalToWorld(carrier.rect, 37, {
              x: shapeFlipX
                ? source.width - (command.at(-2) as number)
                : (command.at(-2) as number),
              y: shapeFlipY
                ? source.height - (command.at(-1) as number)
                : (command.at(-1) as number),
            }),
          );
          for (const swapped of [false, true]) {
            const route = ready(
              { preset },
              sourceTips[swapped ? 1 : 0]!,
              sourceTips[swapped ? 0 : 1]!,
              37,
            );
            expect(route.shapeFlipX).toBe(false);
            expect(route.shapeFlipY).toBe(false);
            const geometry = prepareResolvedShapeGeometry(route.geometry)!;
            expectTips(route, geometry);
          }
        }
    },
  );

  test("curves and out-of-tip controls retain exact native paths and metadata", () => {
    const shape = { preset: "curvedConnector3" as const, adjustments: { adj1: 150000 } };
    const route = ready(shape, { x: 10, y: 20 }, { x: 110, y: 100 });
    const geometry = prepareResolvedShapeGeometry(route.geometry)!;
    expect(geometry.paths[0]!.commands.some((command) => command[0] === "C")).toBe(true);
    expect(geometry.paths).toBe(route.geometry.paths);
    expect(geometry.handles).toBe(route.geometry.handles);
    expect(geometry.adjustments).toBe(route.geometry.adjustments);
    expect(geometry.adjustments.adj1).toBe(150000);
    expect(getStandardShapeSvgPaths(geometry)[0]!.d).toContain("C");
    for (const point of flattenShapePath(
      geometry.paths[0]!,
      STANDARD_SHAPE_GEOMETRY_LIMITS.hitTolerance,
    )[0]!.points)
      expect(standardShapeContainsLocalPoint(geometry, stroke, point)).toBe(true);
    const bounds = getStandardShapeLocalBounds(geometry, stroke)!;
    expect(bounds.left + bounds.width).toBeGreaterThan(route.localEndpoints[1].x);
    expect(geometry.textRect).toBeNull();
    expect(geometry.connectionSites).toEqual([]);
  });

  test("runtime lookup leaves old callers and persisted source drawings unchanged", () => {
    const route = ready({ preset: "line" }, { x: 10, y: 20 }, { x: 110, y: 20 });
    const drawing = paintDrawing(route, { preset: "line" }),
      before = structuredClone(drawing);
    const old = getDrawingShapeGeometry(drawing)!;
    expect(old.paths[0]!.commands).toEqual([
      ["M", 0, 0],
      ["L", 100, 1],
    ]);
    expect(getDrawingShapeGeometry(drawing, false, undefined)).toBe(old);
    expect(getDrawingShapeGeometry(drawing, false, route.geometry)).toBe(route.geometry);
    expect(route.geometry.paths[0]!.commands).toEqual([
      ["M", 0, 0.5],
      ["L", 100, 0.5],
    ]);
    expect(drawing).toEqual(before);
    expect(
      getDrawingShapeGeometry({ ...drawing, height: 2 }, true, route.geometry),
    ).toBeUndefined();
    expect(getStandardShapeSvgPaths(route.geometry)).toHaveLength(1);
  });

  test("representable tiny components retain exact padded tip coordinates in SVG", () => {
    const route = ready({ preset: "line" }, { x: 0, y: 0 }, { x: 100, y: 2 ** -32 });
    const geometry = prepareResolvedShapeGeometry(route.geometry)!;
    const commands = getStandardShapeSvgPaths(geometry)[0]!.d.match(/[ML][^ML]*/g)!;
    const points = commands.map((command) => command.slice(1).split(" ").map(Number));
    expect(points).toEqual(route.localEndpoints.map((point) => [point.x, point.y]));
    expect(points[1]![1]! - points[0]![1]!).toBe(2 ** -32);
    expectTips(route, geometry);
  });
});

describe("resolved connector geometry admission", () => {
  test.each([
    { width: 0 },
    { width: Infinity },
    { height: NaN },
    { height: STANDARD_SHAPE_GEOMETRY_LIMITS.extent + 1 },
    { textRect: { left: 0, top: 0, right: Infinity, bottom: 1 } },
    { adjustments: { adj1: NaN } },
    { adjustments: { adj1: 2_147_483_648 } },
    { adjustments: true },
    { handles: [{ kind: "xy", position: { x: 10_000_001, y: 0 }, fields: [] }] },
    { connectionSites: [{ position: { x: 0, y: 0 }, angle: Infinity }] },
    { paths: [] },
    {
      paths: Array.from(
        { length: STANDARD_SHAPE_GEOMETRY_LIMITS.paths + 1 },
        () => ready().geometry.paths[0],
      ),
    },
    {
      paths: [
        {
          filled: false,
          fillMode: "none",
          stroke: true,
          commands: [
            ["M", 0, 0],
            ["L", Infinity, 1],
          ],
        },
      ],
    },
    {
      paths: [
        {
          filled: false,
          fillMode: "none",
          stroke: true,
          commands: [
            ["M", 0, 0],
            ["L", 10_000_001, 1],
          ],
        },
      ],
    },
    {
      paths: [
        {
          filled: false,
          fillMode: "none",
          stroke: true,
          commands: [
            ["M", 0, 0],
            ["Q", 1, 2],
          ],
        },
      ],
    },
    {
      paths: [
        {
          filled: false,
          fillMode: "none",
          stroke: true,
          commands: [
            ["M", 0, 0],
            ["script", 1, 2],
          ],
        },
      ],
    },
    {
      paths: [
        {
          filled: false,
          fillMode: "xml",
          stroke: true,
          commands: [
            ["M", 0, 0],
            ["L", 1, 2],
          ],
        },
      ],
    },
    {
      paths: [
        {
          filled: false,
          fillMode: "none",
          stroke: "yes",
          commands: [
            ["M", 0, 0],
            ["L", 1, 2],
          ],
        },
      ],
    },
  ])("malformed finite/bounded input fails without paint or legacy fallback: %j", (overrides) => {
    const geometry = candidate(overrides);
    const drawing = paintDrawing(ready(), { preset: "rect" });
    expect(prepareResolvedShapeGeometry(geometry)).toBeUndefined();
    expect(getDrawingShapeGeometry(drawing, true, geometry)).toBeUndefined();
    expect(getStandardShapeSvgPaths(geometry)).toEqual([]);
    expect(getStandardShapeLocalBounds(geometry, stroke)).toBeUndefined();
    expect(standardShapeContainsLocalPoint(geometry, stroke, { x: 10, y: 10 })).toBe(false);
  });

  test("mutable roots and nested coordinates cannot leave stale WeakMap hits", () => {
    const geometry = structuredClone(ready().geometry);
    expect(prepareResolvedShapeGeometry(geometry)).toBeUndefined();
    Object.freeze(geometry);
    expect(prepareResolvedShapeGeometry(geometry)).toBeUndefined();
    freezeData(geometry);
    expect(prepareResolvedShapeGeometry(geometry)).toBe(geometry);
    expect(() => {
      (geometry.paths[0]!.commands[1] as ["L", number, number])[1] = 999;
    }).toThrow();
    expect(standardShapeContainsLocalPoint(geometry, stroke, { x: 0, y: 0 })).toBe(true);
  });

  test("frozen accessors are rejected without reading them", () => {
    let reads = 0;
    const geometry = Object.freeze(
      Object.defineProperty({ ...ready().geometry }, "width", {
        get() {
          reads++;
          return 200;
        },
        enumerable: true,
      }),
    );
    expect(prepareResolvedShapeGeometry(geometry)).toBeUndefined();
    expect(reads).toBe(0);
    expect(getStandardShapeSvgPaths(geometry)).toEqual([]);
  });

  test("command, aggregate-command and flattened-point work budgets remain bounded", () => {
    const line = ready().geometry.paths[0]!;
    const commands: ShapePathCommand[] = [
      ["M", 0, 0],
      ...Array.from({ length: 1024 }, (_, index): ShapePathCommand => [
        "L",
        index % 200,
        index % 120,
      ]),
    ];
    expect(
      prepareResolvedShapeGeometry(candidate({ paths: [{ ...line, commands }] })),
    ).toBeUndefined();
    const aggregate = candidate({
      paths: Array.from({ length: 3 }, () => ({ ...line, commands: commands.slice(0, 800) })),
    });
    expect(prepareResolvedShapeGeometry(aggregate)).toBeUndefined();
    const expensive = candidate({
      paths: [
        {
          ...line,
          commands: [
            ["M", 0, 0],
            ...Array.from({ length: 12 }, (): ShapePathCommand => [
              "C",
              10_000_000,
              10_000_000,
              -10_000_000,
              10_000_000,
              200,
              120,
            ]),
          ],
        },
      ],
    });
    expect(prepareResolvedShapeGeometry(expensive)).toBeUndefined();
    for (const geometry of [aggregate, expensive])
      expect(getStandardShapeSvgPaths(geometry)).toEqual([]);
    expect(prepareResolvedShapeGeometry(undefined)).toBeUndefined();
  });
});
