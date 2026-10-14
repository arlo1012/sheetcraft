import { normalizeChartFormat } from "@sheetcraft/core/chart-format";
import { normalizeSheetChart, type SheetChart } from "@sheetcraft/core/sheet-charts";
import type { ChartFormatIntent, ChartFormatTarget } from "./chart-format-pane";
import { applyElementPatch } from "./useChartObjectControls";

function validateDataRecord(value: unknown, keys: readonly string[]): void {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("Chart format changes require ordinary data.");
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    throw new TypeError("Chart format changes require ordinary data.");
  for (const key of Reflect.ownKeys(value)) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== "string" || !keys.includes(key) || !field || !("value" in field))
      throw new TypeError("Chart format changes require known own data fields.");
  }
  for (const key of keys)
    if (key in value && !Object.hasOwn(value, key))
      throw new TypeError("Chart format changes require own data fields.");
}

/** Replace only the selected element's sparse branch, never its source or another element. */
export function applyChartFormatIntent(
  chart: SheetChart,
  target: ChartFormatTarget,
  intent: ChartFormatIntent,
): SheetChart {
  validateDataRecord(intent, ["kind", "format", "seriesId", "patch"]);
  if (intent.kind === "elements") {
    validateDataRecord(intent, ["kind", "patch"]);
    if (target.kind !== "title") throw new TypeError("Title edit belongs to another element.");
    validateDataRecord(intent.patch, ["title", "elements"]);
    if (intent.patch.elements) validateDataRecord(intent.patch.elements, ["titlePosition"]);
    return applyElementPatch(chart, intent.patch);
  }
  validateDataRecord(
    intent,
    intent.kind === "series" ? ["kind", "format", "seriesId"] : ["kind", "format"],
  );
  const sharedBarControls =
    intent.kind === "chart" &&
    target.kind === "series" &&
    (chart.type === "column" || chart.type === "bar") &&
    chart.source?.series.some((entry) => entry.id === target.seriesId);
  if (intent.kind !== target.kind && !sharedBarControls)
    throw new TypeError("Chart format belongs to another element.");
  const format = normalizeChartFormat(chart.format ?? {});
  if (intent.kind === "series") {
    if (
      target.kind !== "series" ||
      intent.seriesId !== target.seriesId ||
      !chart.source?.series.some((entry) => entry.id === intent.seriesId)
    )
      throw new TypeError("Chart series identity is unavailable.");
    const remaining = format.series ?? [];
    const index = remaining.findIndex((entry) => entry.id === intent.seriesId);
    if (intent.format !== undefined) {
      validateDataRecord(intent.format, ["axis", "color", "strokeWidth", "smooth", "markers"]);
      // The stable ID is supplied by the captured target, never by form data.
      const next = { ...intent.format, id: intent.seriesId };
      if (index < 0) remaining.push(next);
      else remaining[index] = next;
    } else if (index >= 0) remaining.splice(index, 1);
    if (remaining.length) format.series = remaining;
    else delete format.series;
  } else if (intent.kind === "chart") {
    if (chart.type !== "column" && chart.type !== "bar")
      throw new TypeError("Only bars have a chart-wide gap and overlap.");
    if (intent.format === undefined) delete format.bar;
    else format.bar = intent.format;
  } else if (intent.kind === "title") {
    if (intent.format === undefined) delete format.title;
    else format.title = intent.format;
  } else if (intent.kind === "plot") {
    if (intent.format === undefined) delete format.plot;
    else format.plot = intent.format;
  } else if (intent.kind === "categoryAxis") {
    if (intent.format === undefined) delete format.categoryAxis;
    else format.categoryAxis = intent.format;
  } else if (intent.kind === "valueAxis") {
    if (chart.presentation?.percentStacked && intent.format?.linkedToSource === true)
      throw new TypeError("A percentage axis uses ratios, not the source cell number format.");
    if (intent.format === undefined) delete format.valueAxis;
    else format.valueAxis = intent.format;
  } else if (intent.kind === "secondaryValueAxis") {
    if (chart.presentation?.percentStacked && intent.format?.linkedToSource === true)
      throw new TypeError("A percentage axis uses ratios, not the source cell number format.");
    if (intent.format === undefined) delete format.secondaryValueAxis;
    else format.secondaryValueAxis = intent.format;
  } else throw new TypeError("Unknown chart format target.");
  const next = normalizeSheetChart(chart);
  if (Object.keys(format).length) next.format = normalizeChartFormat(format);
  else delete next.format;
  return normalizeSheetChart(next);
}
