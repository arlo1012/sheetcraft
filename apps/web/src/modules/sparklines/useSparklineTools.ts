import { computed } from "vue";
import { canEditCell, canUseSheetPermission } from "@sheetcraft/core";
import {
  createSetCellSparklinesCommand,
  createGroupCellSparklinesCommand,
  createUngroupCellSparklinesCommand,
  type WorkbookCommand,
} from "@sheetcraft/core/commands";
import {
  normalizeCellSparkline,
  getSheetSparklines,
  expandSparklineGroups,
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

import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";

export type SparklineStylePatch = Partial<
  Omit<CellSparkline, "source" | "groupId" | SparklinePointKind>
> &
  Partial<Record<SparklinePointKind, Partial<SparklinePointStyle>>>;
export type SparklineToolContext = {
  key: string;
  value: CellSparkline;
  mixed: readonly (keyof CellSparkline)[];
  mixedPointVisibility: readonly SparklinePointKind[];
  mixedAxisModes: readonly ("minAxis" | "maxAxis")[];
  disabled: boolean;
  apply: (patch: SparklineStylePatch) => boolean;
  edit: () => void;
  clear: () => boolean;
  clearGroup: () => boolean;
  canGroup: boolean;
  canUngroup: boolean;
  group: () => boolean;
  ungroup: () => boolean;
};
const points = ["highPoint", "lowPoint", "firstPoint", "lastPoint"] as const;
function mergeStyle(value: CellSparkline, patch: SparklineStylePatch): CellSparkline {
  const next = { ...value, ...patch, source: value.source } as CellSparkline;
  if (next.dateRange === undefined) delete next.dateSheetId;
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
  if (key === "rightToLeft") return value.rightToLeft ?? false;
  if (key === "minAxis" || key === "maxAxis") return value[key] ?? { type: "individual" };
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
  const idFactory = createBrowserIdFactory();
  return computed<SparklineToolContext | undefined>(() => {
    const workbook = options.getWorkbook();
    const sheet = options.getSheet();
    const generation = options.getGeneration();
    const revision = options.getRevision();
    const selection = options.getRange();
    const range = { start: { ...selection.start }, end: { ...selection.end } };
    const address = { ...options.getAddress() };
    const selected = getSheetSparklines(sheet, range);
    const affected = expandSparklineGroups(sheet, selected);
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
      "rightToLeft",
      "dateRange",
      "dateSheetId",
      "minAxis",
      "maxAxis",
      "showHidden",
      "empty",
      "negativePoints",
      "markerColor",
      ...points,
    ];
    const mixed = fields.filter((key) =>
      affected.some(
        (item) =>
          JSON.stringify(comparable(item.value, key)) !==
          JSON.stringify(comparable(primary.value, key)),
      ),
    );
    const allowed = () =>
      !options.isBusy() &&
      canUseSheetPermission(sheet, "formatCells") &&
      affected.every((item) => canEditCell(sheet, item.address));
    const current = () =>
      options.getWorkbook() === workbook &&
      options.getSheet() === sheet &&
      workbook.sheets.get(sheet.id) === sheet &&
      options.getGeneration() === generation &&
      options.getRevision() === revision &&
      JSON.stringify(options.getRange()) === JSON.stringify(range) &&
      JSON.stringify(options.getAddress()) === JSON.stringify(address);
    function commit(
      patch: SparklineStylePatch | null,
      entries = patch === null ? selected : affected,
    ): boolean {
      if (!current() || !allowed() || !options.flush() || !current() || !allowed()) return false;
      try {
        const changes = entries.map((item) => ({
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
    const sameGroup = selected[0]?.value.groupId;
    const canGroup =
      selected.length > 1 &&
      (!sameGroup || selected.some((item) => item.value.groupId !== sameGroup));
    const canUngroup = selected.some((item) => item.value.groupId !== undefined);
    function changeGroup(group: boolean): boolean {
      if (
        !(group ? canGroup : canUngroup) ||
        !current() ||
        !allowed() ||
        !options.flush() ||
        !current() ||
        !allowed()
      )
        return false;
      const command = group
        ? createGroupCellSparklinesCommand(
            workbook,
            sheet.id,
            range,
            primary.address,
            idFactory("sparkline-group"),
          )
        : createUngroupCellSparklinesCommand(workbook, sheet.id, range);
      return !!command && options.execute(command);
    }
    return {
      key: JSON.stringify([generation, sheet.id, range, address]),
      value: {
        ...primary.value,
        negativePoints: comparable(primary.value, "negativePoints") as boolean,
      },
      mixed,
      mixedAxisModes: (["minAxis", "maxAxis"] as const).filter((end) =>
        affected.some(
          (item) =>
            (item.value[end]?.type ?? "individual") !== (primary.value[end]?.type ?? "individual"),
        ),
      ),
      mixedPointVisibility: points.filter((key) =>
        affected.some((item) => !!item.value[key]?.show !== !!primary.value[key]?.show),
      ),
      disabled: !allowed(),
      apply: (patch) => commit(patch),
      clear: () => commit(null),
      clearGroup: () => commit(null, affected),
      canGroup,
      canUngroup,
      group: () => changeGroup(true),
      ungroup: () => changeGroup(false),
      edit: () => {
        if (current() && allowed()) options.edit(primary.address);
      },
    };
  });
}
