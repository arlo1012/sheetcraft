import { computed, readonly, ref, shallowRef } from "vue";
import { formatFormulaAddress } from "@idea10/core/formula";
import { formatComputedValueForDisplay, parseCellContent } from "@idea10/core/input";
import type { CellContentChange } from "@idea10/core/commands";
import { isTextCellNumberFormat } from "@idea10/core/number-format";
import {
  findCellsByText,
  buildSheetTextReplacements,
  findSheetTextReplacementAddresses,
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
  applyReplacements: (
    changes: readonly CellContentChange[],
    replacementFormat?: SheetSearchFormat,
  ) => boolean;
}) {
  const { t } = useAppI18n();
  const query = ref("");
  const replacement = ref("");
  const history = ref(readWorkbookFindHistory());
  const options = ref<WorkbookFindOptions>({ ...DEFAULT_WORKBOOK_FIND_OPTIONS });
  const optionsExpanded = ref(false);
  const format = shallowRef<SheetSearchFormat>();
  const activeFormat = computed(() => (optionsExpanded.value ? format.value : undefined));
  const formatSource = ref("");
  const replacementFormat = shallowRef<SheetSearchFormat>();
  const activeReplacementFormat = computed(() =>
    optionsExpanded.value ? replacementFormat.value : undefined,
  );
  const replacementFormatSource = ref("");
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
  const replacementFormatSummary = computed(() =>
    !replacementFormat.value
      ? ""
      : replacementFormatSource.value
        ? t("navigation.findFormatFromCell", { address: replacementFormatSource.value })
        : t("navigation.findCustomFormat"),
  );
  const matches = computed<WorkbookFindResult[]>(() => {
    void deps.getRevision();
    const workbook = deps.getWorkbook();
    if (query.value === "" && !activeFormat.value) return [];
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
        format: activeFormat.value,
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
  function setOptionsExpanded(value: boolean): void {
    if (optionsExpanded.value === value) return;
    optionsExpanded.value = value;
    invalidate();
  }
  function setFormat(value?: SheetSearchFormat, source = ""): void {
    format.value = value?.keys.length ? value : undefined;
    formatSource.value = source;
    invalidate();
  }
  function setReplacementFormat(value?: SheetSearchFormat, source = ""): void {
    replacementFormat.value = value?.keys.length ? value : undefined;
    replacementFormatSource.value = source;
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
    if (query.value !== "" || activeFormat.value) return true;
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
  function replace(all = false): void {
    if (!query.value && !activeFormat.value) {
      report({ key: "workspace.enterSearchTerm" });
      return;
    }
    const workbook = deps.getWorkbook();
    const queryText = decodeFindQuery(query.value);
    const replacementText = decodeFindQuery(replacement.value);
    const candidates = getWorkbookSheets(workbook)
      .filter(
        (sheet) =>
          !sheet.properties.hidden &&
          (options.value.scope === "workbook" || sheet.id === workbook.activeSheetId),
      )
      .flatMap((sheet) => {
        const evaluator = deps.getEvaluator(sheet.id);
        const searchOptions = { ...options.value, format: activeFormat.value };
        const changes = new Map<string, CellContentChange>();
        for (const { address, input } of buildSheetTextReplacements(
          sheet,
          queryText,
          replacementText,
          evaluator,
          searchOptions,
        )) {
          const cell = sheet.cells.get(`${address.row}:${address.column}`);
          changes.set(`${address.row}:${address.column}`, {
            sheetId: sheet.id,
            address,
            content:
              input === ""
                ? null
                : cell?.content?.kind === "literal" && typeof cell.content.value === "string"
                  ? { kind: "literal" as const, value: input }
                  : parseCellContent(input, {
                      asText: isTextCellNumberFormat(cell?.style?.numberFormat),
                    }),
          });
        }
        if (activeReplacementFormat.value) {
          const matchedAddresses = queryText
            ? findSheetTextReplacementAddresses(sheet, queryText, evaluator, searchOptions)
            : findCellsByText(sheet, "", evaluator, searchOptions);
          for (const address of matchedAddresses) {
            const key = `${address.row}:${address.column}`;
            if (changes.has(key)) continue;
            changes.set(key, {
              sheetId: sheet.id,
              address,
              content: sheet.cells.get(key)?.content ?? null,
            });
          }
        }
        return [...changes.values()];
      });
    const address = deps.getAddress();
    const changes = all
      ? candidates
      : candidates.filter(
          (candidate) =>
            candidate.sheetId === workbook.activeSheetId &&
            candidate.address.row === address.row &&
            candidate.address.column === address.column,
        );
    if (!changes.length) {
      if (!all && candidates.length) {
        const candidateKeys = new Set(
          candidates.map(
            (candidate) =>
              `${candidate.sheetId}:${candidate.address.row}:${candidate.address.column}`,
          ),
        );
        const found = matches.value.filter((match) =>
          candidateKeys.has(`${match.sheetId}:${match.address.row}:${match.address.column}`),
        );
        const currentIndex = getWorkbookSheets(workbook).findIndex(
          (sheet) => sheet.id === workbook.activeSheetId,
        );
        const sheetIndexes = new Map(
          getWorkbookSheets(workbook).map((sheet, index) => [sheet.id, index]),
        );
        const next =
          found.find(
            (match) =>
              (sheetIndexes.get(match.sheetId)! - currentIndex ||
                (options.value.order === "columns"
                  ? match.address.column - address.column || match.address.row - address.row
                  : match.address.row - address.row || match.address.column - address.column)) > 0,
          ) ?? found[0];
        if (next) selectResult(next);
      } else report({ key: "workspace.noReplaceMatches" });
      return;
    }
    try {
      if (!deps.applyReplacements(changes, activeReplacementFormat.value)) {
        report({ key: "workspace.replaceFailed" });
        return;
      }
    } catch {
      report({ key: "workspace.replaceFailed" });
      return;
    }
    recordQuery();
    invalidate();
    if (!all && matches.value.length) find("forward");
    report({ key: "workspace.replacedCells", params: { count: changes.length } });
  }
  function reset(): void {
    query.value = "";
    replacement.value = "";
    options.value = { ...DEFAULT_WORKBOOK_FIND_OPTIONS };
    optionsExpanded.value = false;
    setFormat();
    setReplacementFormat();
  }
  return {
    query,
    replacement,
    history: readonly(history),
    options,
    optionsExpanded: readonly(optionsExpanded),
    format,
    formatSummary,
    replacementFormat,
    replacementFormatSummary,
    hasSearchedAll,
    results,
    resultCount,
    status,
    updateQuery,
    updateOptions,
    setOptionsExpanded,
    setFormat,
    setReplacementFormat,
    findAll,
    find,
    replace: () => replace(false),
    replaceAll: () => replace(true),
    selectResult,
    reset,
  };
}
