import { computed } from "vue";
import { canEditCell, canUseSheetPermission } from "@sheetcraft/core";
import { createSetCellSparklinesCommand, type WorkbookCommand } from "@sheetcraft/core/commands";
import {
  normalizeCellSparkline,
  type CellSparkline,
  type SparklinePointKind,
  type SparklinePointStyle,
} from "@sheetcraft/core/sparklines";
import {
  getCellSparkline,
  type CellAddress,
  type CellRange,
  type Sheet,
  type Workbook,
} from "@sheetcraft/core/workbook";

export type SparklineStylePatch = Partial<Omit<CellSparkline, "source" | SparklinePointKind>> &
  Partial<Record<SparklinePointKind, Partial<SparklinePointStyle>>>;
export type SparklineToolContext = {
  key: string;
  value: CellSparkline;
  mixed: readonly (keyof CellSparkline)[];
  mixedPointVisibility: readonly SparklinePointKind[];
  disabled: boolean;
  apply: (patch: SparklineStylePatch) => boolean;
  edit: () => void;
  clear: () => boolean;
};
const points = ["highPoint", "lowPoint", "firstPoint", "lastPoint"] as const;
function mergeStyle(value: CellSparkline, patch: SparklineStylePatch): CellSparkline {
  const next = { ...value, ...patch, source: value.source } as CellSparkline;
  for (const key of points) {
    if (patch[key]) next[key] = { show: false, color: "#ef4444", ...value[key], ...patch[key] };
  }
  return normalizeCellSparkline(next)!;
}
function comparable(value: CellSparkline, key: keyof CellSparkline): unknown {
  if (points.includes(key as SparklinePointKind))
    return value[key] ?? { show: false, color: "#ef4444" };
  if (key === "negativePoints")
    return value.negativePoints ?? (value.type !== "line" || value.markers);
  if (key === "markerColor") return value.markerColor ?? value.color;
  return value[key];
}
export function useSparklineTools(options: {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getRange: () => CellRange;
  getAddress: () => CellAddress;
  getGeneration: () => number;
  getRevision: () => number;
  isBusy: () => boolean;
  flush: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  edit: (address: CellAddress) => void;
}) {
  return computed<SparklineToolContext | undefined>(() => {
    const workbook = options.getWorkbook();
    const sheet = options.getSheet();
    const generation = options.getGeneration();
    const revision = options.getRevision();
    const selection = options.getRange();
    const range = { start: { ...selection.start }, end: { ...selection.end } };
    const address = { ...options.getAddress() };
    const selected = [...sheet.cells].flatMap(([key, cell]) => {
      if (!cell.sparkline) return [];
      const [row, column] = key.split(":").map(Number) as [number, number];
      if (
        row < range.start.row ||
        row > range.end.row ||
        column < range.start.column ||
        column > range.end.column
      )
        return [];
      return [{ address: { row, column }, value: normalizeCellSparkline(cell.sparkline)! }];
    });
    if (!selected.length) return undefined;
    const primary =
      selected.find(
        (item) => item.address.row === address.row && item.address.column === address.column,
      ) ?? selected[0]!;
    const fields: (keyof CellSparkline)[] = [
      "type",
      "color",
      "negativeColor",
      "markers",
      "axis",
      "showHidden",
      "empty",
      "negativePoints",
      "markerColor",
      ...points,
    ];
    const mixed = fields.filter((key) =>
      selected.some(
        (item) =>
          JSON.stringify(comparable(item.value, key)) !==
          JSON.stringify(comparable(primary.value, key)),
      ),
    );
    const allowed = () =>
      !options.isBusy() &&
      canUseSheetPermission(sheet, "formatCells") &&
      selected.every((item) => canEditCell(sheet, item.address));
    const current = () =>
      options.getWorkbook() === workbook &&
      options.getSheet() === sheet &&
      workbook.sheets.get(sheet.id) === sheet &&
      options.getGeneration() === generation &&
      options.getRevision() === revision &&
      JSON.stringify(options.getRange()) === JSON.stringify(range) &&
      JSON.stringify(options.getAddress()) === JSON.stringify(address);
    function commit(patch: SparklineStylePatch | null): boolean {
      if (!current() || !allowed() || !options.flush() || !current() || !allowed()) return false;
      try {
        const changes = selected.map((item) => ({
          address: item.address,
          sparkline: patch === null ? null : mergeStyle(item.value, patch),
        }));
        const accepted = options.execute(createSetCellSparklinesCommand(sheet.id, changes));
        return (
          accepted ||
          changes.every(
            (item) =>
              JSON.stringify(
                normalizeCellSparkline(getCellSparkline(sheet, item.address)) ?? null,
              ) === JSON.stringify(item.sparkline),
          )
        );
      } catch {
        return false;
      }
    }
    return {
      key: JSON.stringify([generation, sheet.id, range, address]),
      value: {
        ...primary.value,
        negativePoints: comparable(primary.value, "negativePoints") as boolean,
      },
      mixed,
      mixedPointVisibility: points.filter((key) =>
        selected.some((item) => !!item.value[key]?.show !== !!primary.value[key]?.show),
      ),
      disabled: !allowed(),
      apply: (patch) => commit(patch),
      clear: () => commit(null),
      edit: () => {
        if (current() && allowed()) options.edit(primary.address);
      },
    };
  });
}
