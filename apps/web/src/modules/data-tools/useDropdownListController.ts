import { ref, watch } from "vue";
import {
  createSetSheetDataValidationsCommand,
  subtractSheetDataValidation,
  type WorkbookCommand,
} from "@idea10/core/commands";
import {
  getActiveSheet,
  type CellRange,
  type SheetDataValidation,
  type Workbook,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import { resolveRangeReference } from "../../shared/range-reference/formatRangeReference";
import { createBrowserIdFactory } from "../../shared/runtime/browser-id-factory";
import type { DropdownListDraft, DropdownListInitial } from "./dropdown-list-types";

type Options = {
  getWorkbook: () => Workbook;
  getSelection: () => { range: CellRange };
  getGeneration: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
};

function normalizeRange(range: CellRange): CellRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      column: Math.min(range.start.column, range.end.column),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      column: Math.max(range.start.column, range.end.column),
    },
  };
}

function contains(outer: CellRange, inner: CellRange): boolean {
  return (
    outer.start.row <= inner.start.row &&
    outer.end.row >= inner.end.row &&
    outer.start.column <= inner.start.column &&
    outer.end.column >= inner.end.column
  );
}

/** Compare validation settings only; cell coverage and rule IDs do not identify a list. */
function settingsKey(rule: SheetDataValidation): string {
  return JSON.stringify([
    rule.type,
    rule.list ?? null,
    rule.formula1 ?? "",
    rule.formula2 ?? "",
    rule.operator ?? "between",
    rule.allowBlank,
    rule.showDropdown !== false,
    rule.showInput === true,
    rule.showError !== false,
    rule.promptTitle ?? "",
    rule.prompt ?? "",
    rule.errorTitle ?? "",
    rule.error ?? "",
    rule.errorStyle ?? "stop",
  ]);
}

const empty = (): DropdownListInitial => ({
  mode: "manual",
  items: [],
  source: "",
  applyToMatching: false,
  clear: false,
  canApplyToMatching: false,
});

export function useDropdownListController(options: Options) {
  const { t } = useAppI18n();
  const createId = createBrowserIdFactory();
  const dropdownListVisible = ref(false);
  const dropdownListInitial = ref<DropdownListInitial>(empty());
  const dropdownListError = ref("");
  let target:
    | {
        workbook: Workbook;
        generation: number;
        sheetId: string;
        range: CellRange;
        rulesSnapshot: string;
        original?: SheetDataValidation;
        matchingIds: Set<string>;
      }
    | undefined;

  function openDropdownList(): void {
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const sheet = getActiveSheet(workbook);
    if (sheet.properties.protected) return;
    const range = normalizeRange(options.getSelection().range);
    const rules = sheet.dataValidations ?? [];
    const original = rules.find((rule) => contains(rule.range, range));
    const listRule = original?.type === "list" ? original : undefined;
    const matchingIds = new Set(
      listRule
        ? rules.filter((rule) => settingsKey(rule) === settingsKey(listRule)).map((rule) => rule.id)
        : [],
    );
    target = {
      workbook,
      generation: options.getGeneration(),
      sheetId: sheet.id,
      range,
      rulesSnapshot: JSON.stringify(rules),
      original,
      matchingIds,
    };
    dropdownListInitial.value = {
      ...empty(),
      mode: listRule && !listRule.list ? "range" : "manual",
      items: listRule?.list ? [...listRule.list] : [],
      source: listRule?.formula1 ?? "",
      canApplyToMatching: Boolean(listRule),
    };
    dropdownListError.value = "";
    dropdownListVisible.value = true;
  }

  function closeDropdownList(): void {
    dropdownListVisible.value = false;
    dropdownListError.value = "";
    target = undefined;
  }

  function applyDropdownList(draft: DropdownListDraft): void {
    dropdownListError.value = "";
    if (!target || options.isBusy() || !options.flush()) return;
    const sheet = options.getWorkbook().sheets.get(target.sheetId);
    if (
      target.workbook !== options.getWorkbook() ||
      target.generation !== options.getGeneration() ||
      !sheet ||
      sheet.properties.protected ||
      getActiveSheet(options.getWorkbook()).id !== target.sheetId ||
      JSON.stringify(sheet.dataValidations ?? []) !== target.rulesSnapshot
    ) {
      dropdownListError.value = t("dataTools.dropdown.rangeChanged");
      return;
    }
    const source = draft.source.trim();
    if (!draft.clear) {
      if (
        draft.mode === "manual" &&
        (!draft.items.length || draft.items.some((item) => !item.trim()))
      ) {
        dropdownListError.value = t("dataTools.dropdown.invalidItems");
        return;
      }
      if (draft.mode === "range") {
        const reference = resolveRangeReference(options.getWorkbook(), source, sheet.id);
        if (
          !reference ||
          (reference.range.start.row !== reference.range.end.row &&
            reference.range.start.column !== reference.range.end.column)
        ) {
          dropdownListError.value = t("dataTools.dropdown.invalidRange");
          return;
        }
      }
    }
    const rules = sheet.dataValidations ?? [];
    const applyToMatching = draft.applyToMatching && target.matchingIds.size > 0;
    const matching = applyToMatching
      ? rules.filter((rule) => target!.matchingIds.has(rule.id))
      : [];
    const ids = new Set(rules.map((rule) => rule.id));
    // Subtract the captured selection even when it crosses a non-list rule. Matching
    // lists use their full ranges and keep the operation in a single Core command.
    const retained = rules
      .filter((rule) => !applyToMatching || !target!.matchingIds.has(rule.id))
      .flatMap((rule) =>
        draft.clear && rule.type !== "list"
          ? [rule]
          : subtractSheetDataValidation(rule, target!.range, ids),
      );
    const destinations = matching.length ? matching.map((rule) => rule.range) : [target.range];
    const created = draft.clear
      ? []
      : destinations.map((range): SheetDataValidation => {
          const base = target!.original;
          return {
            id: createId("validation"),
            range: normalizeRange(range),
            type: "list",
            allowBlank: base?.allowBlank ?? true,
            showDropdown: true,
            showInput: base?.showInput ?? false,
            showError: base?.showError !== false,
            promptTitle: base?.promptTitle,
            prompt: base?.prompt,
            errorTitle: base?.errorTitle,
            error: base?.error,
            errorStyle: base?.errorStyle ?? "stop",
            ...(draft.mode === "manual"
              ? { list: [...draft.items] }
              : { formula1: source.startsWith("=") ? source : `=${source}` }),
          };
        });
    try {
      const command = createSetSheetDataValidationsCommand(sheet.id, [...retained, ...created]);
      if (!options.execute(command) && JSON.stringify(command.rules) !== target.rulesSnapshot) {
        dropdownListError.value = t("dataTools.dropdown.failed");
        return;
      }
      closeDropdownList();
      options.focusSheet();
    } catch {
      dropdownListError.value = t("dataTools.dropdown.failed");
    }
  }

  watch(() => options.getGeneration(), closeDropdownList);
  return {
    dropdownListVisible,
    dropdownListInitial,
    dropdownListError,
    openDropdownList,
    closeDropdownList,
    applyDropdownList,
  };
}
