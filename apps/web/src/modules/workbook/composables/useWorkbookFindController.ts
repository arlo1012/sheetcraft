import { computed, readonly, ref, shallowRef } from "vue";
import { formatFormulaAddress } from "@idea10/core/formula";
import { formatComputedValueForDisplay } from "@idea10/core/input";
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
import { readWorkbookFindHistory, recordWorkbookFindHistory } from "../workbook-find-history";

type Feedback = { key: MessageKey; params?: MessageParams };

function formatAbsoluteAddress(address: CellAddress): string {
  const label = formatFormulaAddress(address);
  const rowStart = label.search(/\d/);
  return `$${label.slice(0, rowStart)}$${label.slice(rowStart)}`;
}

function normalizeFindQuery(value: string): string {
  return value.replace(/\r\n?|\n/g, "^l");
}

function decodeFindQuery(value: string): string {
  let decoded = "";
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index]!;
    const next = value[index + 1];
    if (character !== "^") {
      decoded += character;
    } else if (next === "^") {
      decoded += "^";
      index += 1;
    } else if (next === "l" || next === "L") {
      decoded += "\n";
      index += 1;
    } else {
      decoded += character;
    }
  }
  return decoded;
}

function findDefinedNames(workbook: Workbook, sheetId: string, address: CellAddress): string {
  return [...workbook.definedNames.values()]
    .filter(
      (definition) =>
        definition.reference.sheetId === sheetId &&
        (definition.scopeSheetId === undefined || definition.scopeSheetId === sheetId) &&
        address.row >= definition.reference.start.row &&
        address.row <= definition.reference.end.row &&
        address.column >= definition.reference.start.column &&
        address.column <= definition.reference.end.column,
    )
    .map((definition) => definition.name)
    .join(", ");
}

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
  const history = ref(readWorkbookFindHistory());
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
    const searchQuery = decodeFindQuery(query.value);
    const sheets = getWorkbookSheets(workbook).filter(
      (sheet) =>
        !sheet.properties.hidden &&
        (options.value.scope === "workbook" || sheet.id === workbook.activeSheetId),
    );
    return sheets.flatMap((sheet) => {
      const evaluator = deps.getEvaluator(sheet.id);
      return findCellsByText(sheet, searchQuery, evaluator, {
        ...options.value,
        format: format.value,
      }).map((address) => {
        const content = sheet.cells.get(`${address.row}:${address.column}`)?.content;
        return {
          workbookName: t("navigation.findScopeWorkbook"),
          sheetId: sheet.id,
          sheetName: sheet.name,
          definedName: findDefinedNames(workbook, sheet.id, address),
          address,
          addressLabel: formatAbsoluteAddress(address),
          value: formatComputedValueForDisplay(evaluator.getComputedValue(address)),
          formula: content?.kind === "formula" ? content.formula.source : "",
        };
      });
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
    query.value = normalizeFindQuery(value);
    invalidate();
  }
  function recordQuery(): void {
    if (query.value) history.value = recordWorkbookFindHistory(history.value, query.value);
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
    recordQuery();
    hasSearchedAll.value = true;
    report(matches.value.length ? undefined : { key: "workspace.noMatches" });
  }
  function find(direction: SheetSearchDirection): void {
    if (!canSearch()) return;
    recordQuery();
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
    history: readonly(history),
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
