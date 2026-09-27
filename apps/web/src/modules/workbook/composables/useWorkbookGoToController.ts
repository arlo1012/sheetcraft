import { computed, ref, shallowRef, watch } from "vue";
import {
  findSheetGoToTargets,
  type SheetGoToOptions,
  type SheetGoToResult,
} from "@idea10/core/go-to";
import { formatCellAddress } from "@idea10/core/coordinates";
import { formatComputedValueForDisplay } from "@idea10/core/input";
import type { CellAddress, CellRange, SheetEvaluator, Workbook } from "@idea10/core/workbook";
import { useAppI18n } from "../../../shared/i18n";
import type { WorkbookFindResult } from "../workbook-find-types";

export function useWorkbookGoToController(deps: {
  getWorkbook: () => Workbook;
  getRevision: () => unknown;
  getSelection: () => CellRange;
  getAddress: () => CellAddress;
  getEvaluator: (sheetId: string) => SheetEvaluator;
  navigate: (sheetId: string, target: SheetGoToResult) => void;
}) {
  const { t } = useAppI18n();
  const results = shallowRef<WorkbookFindResult[]>([]);
  const resultCount = ref<number>();
  const failed = ref(false);
  const targets = new Map<string, { sheetId: string; target: SheetGoToResult }>();
  const status = computed(() =>
    failed.value
      ? t("navigation.goToFailed")
      : resultCount.value === undefined
        ? ""
        : resultCount.value
          ? t("navigation.goToMatches", { count: resultCount.value })
          : t("navigation.goToNoMatches"),
  );

  function reset(): void {
    targets.clear();
    results.value = [];
    resultCount.value = undefined;
    failed.value = false;
  }
  function selectResult(result: WorkbookFindResult): void {
    const entry = result.id ? targets.get(result.id) : undefined;
    if (!entry || !deps.getWorkbook().sheets.has(entry.sheetId)) return;
    deps.navigate(entry.sheetId, entry.target);
  }
  function locate(options: SheetGoToOptions): void {
    reset();
    const workbook = deps.getWorkbook();
    const sheet = workbook.sheets.get(workbook.activeSheetId);
    if (!sheet) return;
    const evaluator = deps.getEvaluator(sheet.id);
    let found: SheetGoToResult[];
    try {
      found = findSheetGoToTargets(sheet, options, {
        selection: deps.getSelection(),
        active: deps.getAddress(),
        evaluator,
      });
    } catch {
      failed.value = true;
      return;
    }
    resultCount.value = found.length;
    results.value = found.slice(0, 200).map((target) => {
      const id = `${sheet.id}:goto:${target.range.start.row}:${target.range.start.column}:${target.range.end.row}:${target.range.end.column}:${target.imageId ?? ""}`;
      targets.set(id, { sheetId: sheet.id, target });
      const address = target.range.start;
      const start = formatCellAddress(address);
      const end = formatCellAddress(target.range.end);
      const cell = sheet.cells.get(`${address.row}:${address.column}`);
      const image = target.imageId
        ? sheet.floatingImages.find((item) => item.id === target.imageId)
        : undefined;
      return {
        id,
        workbookName: t("navigation.findScopeWorkbook"),
        sheetId: sheet.id,
        sheetName: sheet.name,
        definedName: "",
        address,
        addressLabel: start === end ? start : `${start}:${end}`,
        value: image?.altText ?? formatComputedValueForDisplay(evaluator.getComputedValue(address)),
        formula: cell?.content?.kind === "formula" ? cell.content.formula.source : "",
      };
    });
    if (results.value[0]) selectResult(results.value[0]);
  }
  watch(() => deps.getRevision(), reset);
  watch(() => deps.getWorkbook(), reset);
  return {
    results,
    resultCount: computed(() => resultCount.value ?? 0),
    status,
    locate,
    selectResult,
    reset,
  };
}
