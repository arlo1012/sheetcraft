// 未执行：按用户要求仅编写测试，不运行检查。
import { describe, expect, test, vi } from "vitest";
import { ref } from "vue";
import type { CellSparkline } from "@sheetcraft/core/sparklines";
import { DEFAULT_WORKBOOK_THEME, type WorkbookTheme } from "@sheetcraft/core/workbook-theme";
import {
  createWorkbookSession,
  executeWorkbookCommand,
  undoWorkbookCommand,
} from "@sheetcraft/core/history";
import { createSequentialIdFactory } from "@sheetcraft/core/runtime";
import { serializeWorkbook } from "@sheetcraft/core/serialization";
import {
  createWorkbook,
  getActiveSheet,
  getCellSparkline,
  setCellSparkline,
} from "@sheetcraft/core/workbook";
import {
  getSparklineStylePresets,
  matchesSparklineStyle,
  sparklineStylePatch,
} from "../../../modules/sparklines/sparkline-style-presets";
import { useSparklineTools } from "../../../modules/sparklines/useSparklineTools";

function theme(): WorkbookTheme {
  return {
    ...DEFAULT_WORKBOOK_THEME,
    id: "custom",
    name: "Current workbook",
    accentColors: ["#a1b2c3", "#102030", "#d4e5f6", "#445566", "#778899", "#abcdef"],
  };
}

function sparkline(patch: Partial<CellSparkline> = {}): CellSparkline {
  return {
    type: "line",
    source: { start: { row: 4, column: 0 }, end: { row: 4, column: 2 } },
    color: "#a1b2c3",
    negativeColor: "#c0504d",
    markers: false,
    axis: false,
    showHidden: false,
    empty: "gap",
    ...patch,
  };
}

describe("sparkline appearance presets", () => {
  test("uses all six accents from the supplied current workbook theme", () => {
    const current = theme();
    const before = structuredClone(current);
    const presets = getSparklineStylePresets(current);

    expect(presets).toHaveLength(6);
    expect(presets.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(presets.map(({ color }) => color)).toEqual([
      "#a1b2c3",
      "#102030",
      "#d4e5f6",
      "#445566",
      "#778899",
      "#abcdef",
    ]);
    expect(presets.map(({ markerColor }) => markerColor)).toEqual(current.accentColors);
    expect(presets.every(({ negativeColor }) => negativeColor === "#c0504d")).toBe(true);
    expect(current).toEqual(before);
    const changed = {
      ...current,
      accentColors: [...current.accentColors] as WorkbookTheme["accentColors"],
    };
    changed.accentColors[0] = "#ff8800";
    expect(getSparklineStylePresets(changed)[0]?.color).toBe("#ff8800");
    expect(presets[0]?.color).toBe("#a1b2c3");
  });

  test("returns independent appearance-only patches without preset identity or chart settings", () => {
    const preset = getSparklineStylePresets(theme())[0]!;
    const first = sparklineStylePatch(preset);
    const second = sparklineStylePatch(preset);

    expect(first).toEqual({ color: "#a1b2c3", markerColor: "#a1b2c3", negativeColor: "#c0504d" });
    expect(Object.keys(first).sort()).toEqual(["color", "markerColor", "negativeColor"]);
    expect(first).not.toBe(second);
    first.color = "#000000";
    expect(second.color).toBe("#a1b2c3");
    expect(preset.color).toBe("#a1b2c3");
  });

  test("matches case-insensitively and treats an absent marker color as the series color", () => {
    const preset = getSparklineStylePresets(theme())[0]!;
    const legacy = sparkline({ color: "#A1B2C3", negativeColor: "#C0504D" });

    expect(matchesSparklineStyle(legacy, [], preset)).toBe(true);
    expect(matchesSparklineStyle({ ...legacy, markerColor: "#A1B2C3" }, [], preset)).toBe(true);
    expect(Object.hasOwn(legacy, "markerColor")).toBe(false);
  });

  test.each(["color", "markerColor", "negativeColor"] as const)(
    "does not select a preset when %s differs or is mixed",
    (field) => {
      const preset = getSparklineStylePresets(theme())[0]!;
      expect(matchesSparklineStyle(sparkline(), [field], preset)).toBe(false);
      expect(matchesSparklineStyle(sparkline({ [field]: "#000000" }), [], preset)).toBe(false);
    },
  );

  test("allows a matching appearance when chart type, markers or other non-color settings are mixed", () => {
    const preset = getSparklineStylePresets(theme())[0]!;
    expect(
      matchesSparklineStyle(sparkline(), ["type", "markers", "axis", "empty", "highPoint"], preset),
    ).toBe(true);
  });

  test("applies one appearance batch through real tools without replacing sources, flags or point colors, then undoes it", () => {
    const workbook = createWorkbook({ id: "style-presets", sheetId: "sheet" });
    workbook.theme = theme();
    const sheet = getActiveSheet(workbook);
    const firstAddress = { row: 0, column: 0 };
    const secondAddress = { row: 0, column: 1 };
    const first = sparkline({
      color: "#112233",
      negativeColor: "#ff0000",
      negativePoints: false,
      highPoint: { show: true, color: "#aa0000" },
      lowPoint: { show: false, color: "#0000aa" },
    });
    const second = sparkline({
      type: "winLoss",
      source: { start: { row: 6, column: 3 }, end: { row: 8, column: 3 } },
      color: "#445566",
      markerColor: "#778899",
      negativeColor: "#00ff00",
      markers: true,
      axis: true,
      showHidden: true,
      empty: "connect",
      negativePoints: true,
      highPoint: { show: false, color: "#00bb00" },
      lastPoint: { show: true, color: "#bbbb00" },
    });
    setCellSparkline(sheet, firstAddress, first);
    setCellSparkline(sheet, secondAddress, second);
    const session = createWorkbookSession({ workbook, idFactory: createSequentialIdFactory() });
    const revision = ref(0);
    const execute = vi.fn((command: Parameters<typeof executeWorkbookCommand>[1]) => {
      const changed = executeWorkbookCommand(session, command);
      if (changed) revision.value++;
      return changed;
    });
    const tools = useSparklineTools({
      getWorkbook: () => workbook,
      getSheet: () => sheet,
      getRange: () => ({ start: firstAddress, end: secondAddress }),
      getAddress: () => firstAddress,
      getGeneration: () => 0,
      getRevision: () => revision.value,
      isBusy: () => false,
      flush: () => true,
      execute,
      edit: vi.fn(),
    });
    const before = serializeWorkbook(workbook);
    const preset = getSparklineStylePresets(workbook.theme)[2]!;
    const patch = sparklineStylePatch(preset);

    expect(tools.value!.apply(patch)).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(session.history.undoStack).toHaveLength(1);
    expect(getCellSparkline(sheet, firstAddress)).toEqual({ ...first, ...patch });
    expect(getCellSparkline(sheet, secondAddress)).toEqual({ ...second, ...patch });
    const current = tools.value!;
    expect(current.mixed).toEqual(expect.arrayContaining(["type", "markers", "highPoint"]));
    expect(matchesSparklineStyle(current.value, current.mixed, preset)).toBe(true);
    expect(undoWorkbookCommand(session)).toBe(true);
    expect(session.history.undoStack).toHaveLength(0);
    expect(serializeWorkbook(workbook)).toEqual(before);
  });
});
