import {
  setChartFormatField,
  setChartTextFontFamily,
} from "../../../modules/charts/chart-format-pane";
import { describe, expect, test, vi } from "vitest";
import { normalizeSheetChart, type SheetChart } from "@sheetcraft/core/sheet-charts";
import { applyChartFormatIntent } from "../../../modules/charts/chart-format-intents";
import type {
  ChartFormatIntent,
  ChartFormatTarget,
} from "../../../modules/charts/chart-format-pane";

function chart(): SheetChart {
  return normalizeSheetChart({
    type: "column",
    range: null,
    title: "Sales",
    headerRow: true,
    headerColumn: true,
    seriesBy: "columns",
    legend: true,
    labels: false,
    stacked: false,
    showHidden: false,
    source: {
      kind: "series",
      categories: { kind: "generated" },
      series: [
        {
          id: "apples",
          colorIndex: 5,
          name: { kind: "literal", text: "Same name" },
          values: { kind: "literal", values: [10, 20] },
        },
        {
          id: "pears",
          colorIndex: 2,
          name: { kind: "literal", text: "Same name" },
          values: { kind: "literal", values: [30, 40] },
        },
      ],
    },
    elements: {
      titlePosition: "overlay",
      legendPosition: "right",
      legendOverlay: false,
      labelPosition: "outsideEnd",
    },
    format: {
      title: { color: "#123456", bold: true },
      plot: { fill: "transparent", stroke: "#234567", strokeWidth: 2 },
      categoryAxis: { title: "Region", reverse: true, text: { italic: true } },
      valueAxis: { title: "Primary", line: { stroke: "#345678" } },
      secondaryValueAxis: { title: "Secondary", text: { color: "#456789" } },
      bar: { gapWidth: 50, overlap: 25 },
      series: [
        { id: "apples", color: "#56789a", smooth: true, markers: false },
        { id: "pears", axis: "secondary", color: "#6789ab" },
        { id: "dormant", axis: "secondary", color: "#789abc", strokeWidth: 3 },
      ],
    },
  });
}

const branchIntents: Exclude<ChartFormatIntent, { kind: "series" | "elements" | "legend" }>[] = [
  { kind: "title", format: { fontSize: 24, color: "#abcdef" } },
  { kind: "plot", format: { fill: "#abcdef", strokeWidth: 0 } },
  { kind: "categoryAxis", format: { show: false, labelAngle: -45 } },
  { kind: "valueAxis", format: { min: -10, max: 100, majorUnit: 20, minorUnit: 5 } },
  { kind: "secondaryValueAxis", format: { reverse: true, linkedToSource: false } },
  { kind: "chart", format: { gapWidth: 125, overlap: -25 } },
];

describe("pure chart format intents", () => {
  test.each(branchIntents)(
    "$kind replaces only its sparse branch and preserves source identity",
    (intent) => {
      const original = chart(),
        before = structuredClone(original),
        branch = intent.kind === "chart" ? "bar" : intent.kind;
      const result = applyChartFormatIntent(original, { kind: intent.kind }, intent);
      expect(result).not.toBe(original);
      expect(result.format).toEqual({ ...before.format, [branch]: intent.format });
      expect({ ...result, format: before.format }).toEqual(before);
      expect(result.source?.series.map((entry) => [entry.id, entry.colorIndex])).toEqual([
        ["apples", 5],
        ["pears", 2],
      ]);
      expect(original).toEqual(before);
    },
  );

  test.each(branchIntents)("$kind reset deletes only the selected branch", (intent) => {
    const original = chart(),
      before = structuredClone(original),
      branch = intent.kind === "chart" ? "bar" : intent.kind;
    const result = applyChartFormatIntent(
      original,
      { kind: intent.kind },
      {
        ...intent,
        format: undefined,
      },
    );
    const expected = { ...before.format };
    delete expected[branch];
    expect(result.format).toEqual(expected);
    expect({ ...result, format: before.format }).toEqual(before);
    expect(original).toEqual(before);
  });

  test("equal branch replacement remains equal complete chart data", () => {
    const original = chart();
    expect(
      applyChartFormatIntent(
        original,
        { kind: "title" },
        {
          kind: "title",
          format: { ...original.format!.title! },
        },
      ),
    ).toEqual(original);
  });

  test("editing title text/position preserves format, source and unrelated element branches", () => {
    const original = chart(),
      before = structuredClone(original);
    const result = applyChartFormatIntent(
      original,
      { kind: "title" },
      {
        kind: "elements",
        patch: { title: "2026 Sales", elements: { titlePosition: "above" } },
      },
    );
    expect(result).toEqual({
      ...before,
      title: "2026 Sales",
      elements: { ...before.elements, titlePosition: "above" },
    });
    expect(original).toEqual(before);
  });

  test("series replacement follows stable source ID after reorder and preserves dormant settings", () => {
    const original = chart();
    original.source!.series.reverse();
    const before = structuredClone(original);
    const result = applyChartFormatIntent(
      original,
      { kind: "series", seriesId: "apples" },
      {
        kind: "series",
        seriesId: "apples",
        format: { axis: "primary", color: "#abcdef" },
      },
    );
    expect(result.source).toEqual(before.source);
    expect(result.source?.series.map((entry) => [entry.id, entry.colorIndex])).toEqual([
      ["pears", 2],
      ["apples", 5],
    ]);
    expect(result.format).toEqual({
      ...before.format,
      series: [
        { id: "apples", axis: "primary", color: "#abcdef" },
        ...before.format!.series!.slice(1),
      ],
    });
    expect(original).toEqual(before);
  });

  test("series reset removes only its stable ID and retains other and dormant formats", () => {
    const original = chart(),
      before = structuredClone(original);
    const result = applyChartFormatIntent(
      original,
      { kind: "series", seriesId: "apples" },
      {
        kind: "series",
        seriesId: "apples",
        format: undefined,
      },
    );
    expect(result.format).toEqual({ ...before.format, series: before.format!.series!.slice(1) });
    expect(result.source).toEqual(before.source);
    expect(original).toEqual(before);
  });

  test.each(["column", "bar"] as const)(
    "%s shared global bar intent is valid for a source-backed selected series",
    (type) => {
      const original = { ...chart(), type },
        before = structuredClone(original);
      const result = applyChartFormatIntent(
        original,
        { kind: "series", seriesId: "pears" },
        {
          kind: "chart",
          format: { gapWidth: 125, overlap: -25 },
        },
      );
      expect(result.format).toEqual({ ...before.format, bar: { gapWidth: 125, overlap: -25 } });
      expect({ ...result, format: before.format }).toEqual(before);
      expect(original).toEqual(before);
    },
  );

  test.each<ChartFormatTarget>([
    { kind: "title" },
    { kind: "plot" },
    { kind: "categoryAxis" },
    { kind: "valueAxis" },
    { kind: "secondaryValueAxis" },
    { kind: "series", seriesId: "foreign" },
    { kind: "series", seriesId: "dormant" },
  ])("shared bar intent rejects unrelated target $kind", (target) => {
    const original = chart(),
      before = structuredClone(original);
    expect(() =>
      applyChartFormatIntent(original, target, { kind: "chart", format: { gapWidth: 125 } }),
    ).toThrow();
    expect(original).toEqual(before);
  });

  test.each(["line", "area", "radar"] as const)(
    "%s never accepts chart-wide bar settings from a selected series",
    (type) => {
      const original = { ...chart(), type },
        before = structuredClone(original);
      expect(() =>
        applyChartFormatIntent(
          original,
          { kind: "series", seriesId: "apples" },
          {
            kind: "chart",
            format: { gapWidth: 125 },
          },
        ),
      ).toThrow();
      expect(original).toEqual(before);
    },
  );

  test.each([
    [
      "another series",
      { kind: "series", seriesId: "pears" },
      { kind: "series", seriesId: "apples", format: { color: "#abcdef" } },
    ],
    [
      "foreign series",
      { kind: "series", seriesId: "foreign" },
      { kind: "series", seriesId: "foreign", format: { color: "#abcdef" } },
    ],
    ["title branch", { kind: "plot" }, { kind: "title", format: { fontSize: 24 } }],
    ["plot branch", { kind: "title" }, { kind: "plot", format: { fill: "#abcdef" } }],
    ["axis branch", { kind: "valueAxis" }, { kind: "categoryAxis", format: { reverse: true } }],
    [
      "secondary axis branch",
      { kind: "valueAxis" },
      { kind: "secondaryValueAxis", format: { reverse: true } },
    ],
    ["title elements", { kind: "plot" }, { kind: "elements", patch: { title: "Rogue" } }],
  ] as const)("%s cannot alter a different captured target", (_name, target, intent) => {
    const original = chart(),
      before = structuredClone(original);
    expect(() => applyChartFormatIntent(original, target, intent)).toThrow();
    expect(original).toEqual(before);
  });

  test("series form data cannot forge a stable ID or mutate source/order", () => {
    const original = chart(),
      before = structuredClone(original);
    const intent = {
      kind: "series",
      seriesId: "apples",
      format: { id: "pears", color: "#abcdef" },
    } as unknown as ChartFormatIntent;
    expect(() =>
      applyChartFormatIntent(original, { kind: "series", seriesId: "apples" }, intent),
    ).toThrow();
    expect(original).toEqual(before);
  });

  test.each([
    { title: "Rogue", legend: false },
    { elements: { titlePosition: "above", legendPosition: "left" } },
    { elements: { titlePosition: "above", labelPosition: "center" } },
  ] as const)("title intent rejects unrelated element fields", (patch) => {
    const original = chart(),
      before = structuredClone(original);
    expect(() =>
      applyChartFormatIntent(original, { kind: "title" }, { kind: "elements", patch }),
    ).toThrow();
    expect(original).toEqual(before);
  });

  test("intent and nested accessors are rejected before executing any getter", () => {
    const original = chart(),
      before = structuredClone(original),
      getter = vi.fn(() => "#abcdef");
    const badIntents = [
      Object.defineProperty({}, "kind", { get: getter }),
      { kind: "title", format: Object.defineProperty({}, "color", { get: getter }) },
      {
        kind: "series",
        seriesId: "apples",
        format: Object.defineProperty({}, "color", { get: getter }),
      },
      { kind: "elements", patch: Object.defineProperty({}, "title", { get: getter }) },
    ];
    for (const intent of badIntents) {
      const target: ChartFormatTarget =
        "seriesId" in intent ? { kind: "series", seriesId: "apples" } : { kind: "title" };
      expect(() => applyChartFormatIntent(original, target, intent as ChartFormatIntent)).toThrow();
    }
    expect(getter).not.toHaveBeenCalled();
    expect(original).toEqual(before);
  });

  test("removing the final sparse branch removes the empty format container", () => {
    const original = { ...chart(), format: { title: { bold: true } } };
    const result = applyChartFormatIntent(
      original,
      { kind: "title" },
      {
        kind: "title",
        format: undefined,
      },
    );
    expect(result).not.toHaveProperty("format");
    expect(result.source).toEqual(original.source);
    expect(original.format).toEqual({ title: { bold: true } });
  });
});

describe("legend layout intents", () => {
  test("layout edits preserve unrelated fields and sparse reset removes only legend layout", () => {
    const original = chart();
    const changed = applyChartFormatIntent(
      original,
      { kind: "legend" },
      {
        kind: "elements",
        patch: { elements: { legendPosition: "topRight", legendOverlay: true } },
      },
    );
    expect(changed.elements).toEqual({
      ...original.elements,
      legendPosition: "topRight",
      legendOverlay: true,
    });
    expect(changed.format).toEqual(original.format);
    const reset = applyChartFormatIntent(
      changed,
      { kind: "legend" },
      { kind: "legend", reset: true },
    );
    expect(reset.elements).toEqual({ titlePosition: "overlay", labelPosition: "outsideEnd" });
    expect(reset.legend).toBe(true);
    expect(reset.format).toEqual(original.format);
    expect(
      applyChartFormatIntent(
        { ...original, elements: { legendPosition: "right" } },
        { kind: "legend" },
        { kind: "legend", reset: true },
      ).elements,
    ).toBeUndefined();
  });
  test("legend edits cannot cross target boundaries or mutate hidden or unsupported legends", () => {
    for (const patch of [
      { legend: false },
      { title: "Wrong" },
      { labels: true },
      { elements: { titlePosition: "none" } },
      { elements: { labelPosition: "center" } },
    ]) {
      expect(() =>
        applyChartFormatIntent(chart(), { kind: "legend" }, {
          kind: "elements",
          patch,
        } as ChartFormatIntent),
      ).toThrow();
    }
    const layout: ChartFormatIntent = {
      kind: "elements",
      patch: { elements: { legendPosition: "left" } },
    };
    expect(() => applyChartFormatIntent(chart(), { kind: "title" }, layout)).toThrow();
    for (const original of [
      { ...chart(), legend: false },
      { ...chart(), type: "wordCloud" as const },
    ]) {
      expect(() => applyChartFormatIntent(original, { kind: "legend" }, layout)).toThrow();
      expect(() =>
        applyChartFormatIntent(original, { kind: "legend" }, { kind: "legend", reset: true }),
      ).toThrow();
    }
    expect(() =>
      applyChartFormatIntent(chart(), { kind: "chart" }, { kind: "legend", reset: true }),
    ).toThrow();
  });
});

test("legend style replaces only its sparse branch and layout reset preserves styles", () => {
  const original = {
    ...chart(),
    elements: { legendPosition: "left" as const },
    format: {
      title: { bold: true },
      legend: {
        text: { fontSize: 18, italic: true },
        surface: { fill: "#abcdef", stroke: "transparent", strokeWidth: 2 },
      },
    },
  };
  const next = applyChartFormatIntent(
    original,
    { kind: "legend" },
    { kind: "legend", format: { surface: original.format.legend.surface } },
  );
  expect(next.format).toEqual({
    title: { bold: true },
    legend: { surface: original.format.legend.surface },
  });
  expect(next.elements).toEqual(original.elements);
  const reset = applyChartFormatIntent(
    original,
    { kind: "legend" },
    { kind: "legend", reset: true },
  );
  expect(reset.format).toEqual(original.format);
  expect(reset.elements).toBeUndefined();
  const cleared = applyChartFormatIntent(
    original,
    { kind: "legend" },
    { kind: "legend", format: undefined },
  );
  expect(cleared.format).toEqual({ title: { bold: true } });
  expect(cleared.elements).toEqual(original.elements);
  expect(original.format.legend.text.fontSize).toBe(18);
});
test("legend styles reject wrong targets, hidden/unsupported legends and mixed intents", () => {
  const intent: ChartFormatIntent = { kind: "legend", format: { text: { bold: true } } };
  expect(() => applyChartFormatIntent(chart(), { kind: "title" }, intent)).toThrow();
  expect(() =>
    applyChartFormatIntent({ ...chart(), legend: false }, { kind: "legend" }, intent),
  ).toThrow();
  expect(() =>
    applyChartFormatIntent({ ...chart(), type: "wordCloud" }, { kind: "legend" }, intent),
  ).toThrow();
  expect(() =>
    applyChartFormatIntent(chart(), { kind: "legend" }, {
      kind: "legend",
      reset: true,
      format: {},
    } as ChartFormatIntent),
  ).toThrow();
});

test.each(["title", "legend", "categoryAxis", "valueAxis", "secondaryValueAxis"] as const)(
  "%s text edits retain bindings, family/default replacement deletes them without affecting siblings",
  (kind) => {
    const scriptFonts = {
      latin: { kind: "theme", role: "minor", slot: "latin" },
      eastAsia: { kind: "family", family: "宋体" },
      complexScript: { kind: "automatic" },
    } as const;
    const text = { scriptFonts, bold: true, fontSize: 16 };
    const original = chart();
    original.format = {
      title: text,
      legend: { text },
      categoryAxis: { text, title: "Category" },
      valueAxis: { text, title: "Value" },
      secondaryValueAxis: { text, title: "Secondary" },
    };
    const originalBranch = original.format[kind];
    const apply = (next: typeof text | ReturnType<typeof setChartTextFontFamily>) =>
      applyChartFormatIntent(original, { kind }, {
        kind,
        format: kind === "title" ? next : { ...originalBranch, text: next },
      } as ChartFormatIntent);
    for (const [field, value] of [
      ["fontSize", 18],
      ["bold", false],
      ["italic", true],
      ["color", "#123456"],
    ] as const) {
      const next = setChartFormatField<
        import("@sheetcraft/core/chart-format").ChartTextFormat,
        typeof field
      >(text, field, value);
      const changed = apply(next);
      const actual = kind === "title" ? changed.format!.title : changed.format![kind]!.text;
      expect(actual?.scriptFonts).toEqual(scriptFonts);
    }
    for (const family of ["Arial", undefined]) {
      const changed = apply(setChartTextFontFamily(text, family));
      const actual = kind === "title" ? changed.format!.title : changed.format![kind]!.text;
      expect(actual).toEqual({
        bold: true,
        fontSize: 16,
        ...(family ? { fontFamily: family } : {}),
      });
      expect({ ...changed.format, [kind]: originalBranch }).toEqual(original.format);
    }
    expect(() => apply({ ...text, fontFamily: "Arial" } as typeof text)).toThrow();
    expect(() => apply({ ...text, scriptFonts: undefined } as unknown as typeof text)).toThrow();
  },
);

test("value-axis number transitions replace sparsely and reject own undefined number leaves", () => {
  const original = chart();
  original.format!.valueAxis = {
    title: "Primary",
    min: 20,
    numberFormat: { kind: "percent", fractionDigits: 2 },
    linkedToSource: false,
  };
  const next = applyChartFormatIntent(
    original,
    { kind: "valueAxis" },
    { kind: "valueAxis", format: { title: "Primary", min: 20, linkedToSource: true } },
  );
  expect(next.format!.valueAxis).toEqual({ title: "Primary", min: 20, linkedToSource: true });
  expect(next.format!.valueAxis).not.toHaveProperty("numberFormat");
  expect({ ...next.format, valueAxis: original.format!.valueAxis }).toEqual(original.format);
  for (const field of ["numberFormat", "linkedToSource"]) {
    expect(() =>
      applyChartFormatIntent(
        original,
        { kind: "valueAxis" },
        { kind: "valueAxis", format: { min: 20, [field]: undefined } },
      ),
    ).toThrow();
  }
});

describe("marker size intent contract", () => {
  const target = { kind: "series", seriesId: "apples" } as const;
  test("accepts a point size on only the captured ID and preserves it when hiding markers", () => {
    const original = { ...chart(), type: "line" as const };
    const sized = applyChartFormatIntent(original, target, {
      kind: "series",
      seriesId: "apples",
      format: { markerSizePt: 9, markers: true, color: "#123456" },
    });
    const hidden = applyChartFormatIntent(sized, target, {
      kind: "series",
      seriesId: "apples",
      format: { markerSizePt: 9, markers: false, color: "#123456" },
    });
    expect(hidden.format?.series?.[0]).toEqual({
      id: "apples",
      markerSizePt: 9,
      markers: false,
      color: "#123456",
    });
    expect(hidden.format?.series?.slice(1)).toEqual(original.format?.series?.slice(1));
    expect(hidden.source).toEqual(original.source);
    const reset = applyChartFormatIntent(hidden, target, {
      kind: "series",
      seriesId: "apples",
      format: { markers: false, color: "#123456" },
    });
    expect(reset.format?.series?.[0]).toEqual({ id: "apples", markers: false, color: "#123456" });
  });
  test.each([undefined, null, "9", 1, 73, 5.5, NaN, Infinity])(
    "rejects explicit invalid size %s",
    (markerSizePt) => {
      expect(() =>
        applyChartFormatIntent(chart(), target, {
          kind: "series",
          seriesId: "apples",
          format: { markerSizePt },
        } as ChartFormatIntent),
      ).toThrow();
    },
  );
  test("rejects size accessors without evaluating them and unknown aliases", () => {
    const read = vi.fn(() => 9);
    const format = Object.defineProperty({}, "markerSizePt", { enumerable: true, get: read });
    expect(() =>
      applyChartFormatIntent(chart(), target, { kind: "series", seriesId: "apples", format }),
    ).toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(() =>
      applyChartFormatIntent(chart(), target, {
        kind: "series",
        seriesId: "apples",
        format: { markerSize: 9 },
      } as unknown as ChartFormatIntent),
    ).toThrow();
  });
});

describe("marker shape intent contract", () => {
  const target = { kind: "series", seriesId: "apples" } as const;
  test("shape edits and reset preserve size, visibility, line attributes and other series", () => {
    const original = { ...chart(), type: "line" as const };
    const baseline = {
      color: "#123456",
      markerSizePt: 9,
      markers: false,
      smooth: true,
      strokeWidth: 3,
    };
    let current: SheetChart = original;
    for (const markerSymbol of ["circle", "square", undefined] as const) {
      current = applyChartFormatIntent(current, target, {
        kind: "series",
        seriesId: "apples",
        format: { ...baseline, ...(markerSymbol === undefined ? {} : { markerSymbol }) },
      });
      expect(current.format?.series?.[0]).toEqual({
        id: "apples",
        ...baseline,
        ...(markerSymbol === undefined ? {} : { markerSymbol }),
      });
      expect(current.format?.series?.slice(1)).toEqual(original.format?.series?.slice(1));
      expect(current.source).toEqual(original.source);
    }
    expect(current.format?.series?.[0]).not.toHaveProperty("markerSymbol");
  });
  test.each([undefined, null, "none", "auto", "rect", "diamond", "", 1, true])(
    "rejects explicit invalid shape %s",
    (markerSymbol) => {
      expect(() =>
        applyChartFormatIntent(chart(), target, {
          kind: "series",
          seriesId: "apples",
          format: { markerSymbol },
        } as ChartFormatIntent),
      ).toThrow();
    },
  );
  test("rejects accessors without evaluating them, aliases and foreign target IDs", () => {
    const read = vi.fn(() => "square");
    const format = Object.defineProperty({}, "markerSymbol", { enumerable: true, get: read });
    expect(() =>
      applyChartFormatIntent(chart(), target, { kind: "series", seriesId: "apples", format }),
    ).toThrow();
    expect(read).not.toHaveBeenCalled();
    expect(() =>
      applyChartFormatIntent(chart(), target, {
        kind: "series",
        seriesId: "apples",
        format: { markerShape: "square" },
      } as unknown as ChartFormatIntent),
    ).toThrow();
    expect(() =>
      applyChartFormatIntent(chart(), target, {
        kind: "series",
        seriesId: "pears",
        format: { markerSymbol: "square" },
      }),
    ).toThrow();
  });
});
