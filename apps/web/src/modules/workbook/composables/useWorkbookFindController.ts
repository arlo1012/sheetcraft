import { computed, ref, shallowRef } from "vue";
import { formatCellAddress } from "@idea10/core/coordinates";
import { formatCellContentForInput, formatComputedValueForDisplay } from "@idea10/core/input";
import {
  findCellsByText,
  type SheetSearchDirection,
  type SheetSearchFormat,
} from "@idea10/core/search";
import {
  getWorkbookSheets,
  type CellAddress,
  type SheetEvaluator,
  type Workbook,
} from "@idea10/core/workbook";
import { useAppI18n, type MessageKey, type MessageParams } from "../../../shared/i18n";
import {
  DEFAULT_WORKBOOK_FIND_OPTIONS,
  type WorkbookFindOptions,
  type WorkbookFindResult,
} from "../workbook-find-types";

type Feedback = { key: MessageKey; params?: MessageParams };
export function useWorkbookFindController(deps: {
  getWorkbook: () => Workbook;
  getRevision: () => unknown;
  getAddress: () => CellAddress;
  getEvaluator: (sheetId: string) => SheetEvaluator;
  navigate: (result: WorkbookFindResult) => void;
  feedback: (value?: Feedback) => void;
}) {
  const { t } = useAppI18n();
  const query = ref("");
  const options = ref<WorkbookFindOptions>({ ...DEFAULT_WORKBOOK_FIND_OPTIONS });
  const format = shallowRef<SheetSearchFormat>();
  const formatSource = ref("");
  const hasSearchedAll = ref(false);
  const feedback = shallowRef<Feedback>();
  const status = computed(() =>
    feedback.value ? t(feedback.value.key, feedback.value.params) : "",
  );
  const formatSummary = computed(() =>
    !format.value
      ? ""
      : formatSource.value
        ? t("navigation.findFormatFromCell", { address: formatSource.value })
        : t("navigation.findCustomFormat"),
  );
  const matches = computed<WorkbookFindResult[]>(() => {
    void deps.getRevision();
    const workbook = deps.getWorkbook();
    if (query.value === "" && !format.value) return [];
    const sheets = getWorkbookSheets(workbook).filter(
      (sheet) =>
        !sheet.properties.hidden &&
        (options.value.scope === "workbook" || sheet.id === workbook.activeSheetId),
    );
    return sheets.flatMap((sheet) => {
      const evaluator = deps.getEvaluator(sheet.id);
      return findCellsByText(sheet, query.value, evaluator, {
        ...options.value,
        format: format.value,
      }).map((address) => ({
        sheetId: sheet.id,
        sheetName: sheet.name,
        address,
        addressLabel: formatCellAddress(address),
        value: formatComputedValueForDisplay(evaluator.getComputedValue(address)),
        formula: formatCellContentForInput(
          sheet.cells.get(`${address.row}:${address.column}`)?.content ?? null,
        ),
      }));
    });
  });
  const results = computed(() => (hasSearchedAll.value ? matches.value.slice(0, 200) : []));
  const resultCount = computed(() => (hasSearchedAll.value ? matches.value.length : 0));
  function report(value?: Feedback): void {
    feedback.value = value;
    deps.feedback(value);
  }
  function invalidate(): void {
    hasSearchedAll.value = false;
    report();
  }
  function updateQuery(value: string): void {
    query.value = value;
    invalidate();
  }
  function updateOptions(value: Partial<WorkbookFindOptions>): void {
    options.value = { ...options.value, ...value };
    invalidate();
  }
  function setFormat(value?: SheetSearchFormat, source = ""): void {
    format.value = value?.keys.length ? value : undefined;
    formatSource.value = source;
    invalidate();
  }
  function selectResult(result: WorkbookFindResult): void {
    const sheet = deps.getWorkbook().sheets.get(result.sheetId);
    if (!sheet || sheet.properties.hidden) return;
    deps.navigate(result);
    report({
      key: "workspace.found",
      params: {
        address:
          options.value.scope === "workbook"
            ? `${sheet.name}!${result.addressLabel}`
            : result.addressLabel,
      },
    });
  }
  function canSearch(): boolean {
    if (query.value !== "" || format.value) return true;
    report({ key: "workspace.enterSearchTerm" });
    return false;
  }
  function findAll(): void {
    if (!canSearch()) return;
    hasSearchedAll.value = true;
    report(matches.value.length ? undefined : { key: "workspace.noMatches" });
  }
  function find(direction: SheetSearchDirection): void {
    if (!canSearch()) return;
    const found = matches.value;
    if (!found.length) {
      report({ key: "workspace.noMatches" });
      return;
    }
    const workbook = deps.getWorkbook();
    const sheetOrder = getWorkbookSheets(workbook).map((sheet) => sheet.id);
    const currentSheet = sheetOrder.indexOf(workbook.activeSheetId);
    const current = deps.getAddress();
    const compare = (match: WorkbookFindResult): number =>
      sheetOrder.indexOf(match.sheetId) - currentSheet ||
      (options.value.order === "columns"
        ? match.address.column - current.column || match.address.row - current.row
        : match.address.row - current.row || match.address.column - current.column);
    const target =
      direction === "forward"
        ? (found.find((match) => compare(match) > 0) ?? found[0]!)
        : ([...found].reverse().find((match) => compare(match) < 0) ?? found.at(-1)!);
    selectResult(target);
  }
  function reset(): void {
    query.value = "";
    options.value = { ...DEFAULT_WORKBOOK_FIND_OPTIONS };
    setFormat();
  }
  return {
    query,
    options,
    format,
    formatSummary,
    hasSearchedAll,
    results,
    resultCount,
    status,
    updateQuery,
    updateOptions,
    setFormat,
    findAll,
    find,
    selectResult,
    reset,
  };
}
