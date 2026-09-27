import { computed, nextTick, ref, watch } from "vue";
import {
  createApplyDataProofreadingCommand,
  scanDataProofreading,
  type DataProofreadingIssue as CoreDataProofreadingIssue,
} from "@idea10/core/data-proofreading";
import { formatCellAddress } from "@idea10/core/coordinates";
import type { WorkbookCommand } from "@idea10/core/commands";
import { WorkbookDomainError } from "@idea10/core/errors";
import {
  getActiveSheet,
  MAX_SHEET_COLUMNS,
  MAX_SHEET_ROWS,
  type CellAddress,
  type CellRange,
  type Workbook,
} from "@idea10/core/workbook";
import { useAppI18n } from "../../shared/i18n";
import {
  formatRangeReference,
  resolveRangeReference,
} from "../../shared/range-reference/formatRangeReference";
import type {
  DataProofreadingDraft,
  DataProofreadingIssue,
  DataProofreadingIssueKind,
} from "./data-proofreading-types";

type Options = {
  getWorkbook: () => Workbook;
  getGeneration: () => number;
  /** Revision is optional so isolated controller tests can use the existing workspace fixture. */
  getRevision?: () => number;
  isBusy: () => boolean;
  execute: (command: WorkbookCommand) => boolean;
  flush: () => boolean;
  focusSheet: () => void;
  navigateToCell?: (sheetId: string, address: CellAddress) => void;
};

type ScanTarget = {
  workbook: Workbook;
  generation: number;
  revision?: number;
  sheetId: string;
};

const emptyDraft = (): DataProofreadingDraft => ({ range: "" });
const issueId = (issue: CoreDataProofreadingIssue): string =>
  `${issue.sheetId}:${issue.address.row}:${issue.address.column}:${issue.reason}`;
const normalizeRange = (range: CellRange): CellRange => ({
  start: {
    row: Math.min(range.start.row, range.end.row),
    column: Math.min(range.start.column, range.end.column),
  },
  end: {
    row: Math.max(range.start.row, range.end.row),
    column: Math.max(range.start.column, range.end.column),
  },
});

/** Keeps the scan read-only and only builds core's atomic command for explicit safe proposals. */
export function useDataProofreadingController(options: Options) {
  const { t } = useAppI18n();
  const proofreadingVisible = ref(false);
  const proofreadingDraft = ref<DataProofreadingDraft>(emptyDraft());
  const proofreadingError = ref("");
  const proofreadingBusy = ref(false);
  const proofreadingHasScanned = ref(false);
  const selectedProofreadingIssueIds = ref<string[]>([]);
  const rawIssues = ref<CoreDataProofreadingIssue[]>([]);
  let target: ScanTarget | undefined;

  const proofreadingIssues = computed<DataProofreadingIssue[]>(() =>
    rawIssues.value.map((issue) => ({
      id: issueId(issue),
      type: issue.kind,
      reason: issue.reason,
      address: formatCellAddress(issue.address),
      currentValue: issue.display.current,
      ...(issue.display.proposed === undefined ? {} : { proposedValue: issue.display.proposed }),
      safe: Boolean(issue.proposed),
    })),
  );

  function isCurrentTarget(): boolean {
    return Boolean(
      target &&
      target.workbook === options.getWorkbook() &&
      target.generation === options.getGeneration() &&
      options.getWorkbook().sheets.has(target.sheetId) &&
      (target.revision === undefined || options.getRevision?.() === target.revision),
    );
  }

  function openDataProofreading(): void {
    if (options.isBusy() || !options.flush()) return;
    const workbook = options.getWorkbook();
    const sheet = getActiveSheet(workbook);
    target = {
      workbook,
      generation: options.getGeneration(),
      ...(options.getRevision ? { revision: options.getRevision() } : {}),
      sheetId: sheet.id,
    };
    proofreadingDraft.value = emptyDraft();
    rawIssues.value = [];
    proofreadingHasScanned.value = false;
    selectedProofreadingIssueIds.value = [];
    proofreadingError.value = "";
    proofreadingVisible.value = true;
  }

  function updateDataProofreadingDraft(draft: DataProofreadingDraft): void {
    if (draft.range !== proofreadingDraft.value.range) {
      rawIssues.value = [];
      proofreadingHasScanned.value = false;
      selectedProofreadingIssueIds.value = [];
    }
    proofreadingDraft.value = { range: draft.range };
    proofreadingError.value = "";
  }

  function closeDataProofreading(): void {
    const wasVisible = proofreadingVisible.value;
    proofreadingVisible.value = false;
    proofreadingBusy.value = false;
    proofreadingError.value = "";
    target = undefined;
    if (wasVisible) void nextTick(options.focusSheet);
  }

  function scanDataProofreadingResults(draft = proofreadingDraft.value): void {
    updateDataProofreadingDraft(draft);
    if (
      !target ||
      target.workbook !== options.getWorkbook() ||
      target.generation !== options.getGeneration()
    ) {
      proofreadingError.value = t("proofreading.rangeChanged");
      return;
    }
    if (options.isBusy() || !options.flush()) return;
    const wholeSheet = !draft.range.trim();
    const source = wholeSheet
      ? {
          sheetId: getActiveSheet(options.getWorkbook()).id,
          range: {
            start: { row: 0, column: 0 },
            end: { row: MAX_SHEET_ROWS - 1, column: MAX_SHEET_COLUMNS - 1 },
          },
        }
      : resolveRangeReference(options.getWorkbook(), draft.range, target.sheetId);
    if (!source) {
      proofreadingError.value = t("proofreading.invalidRange");
      return;
    }
    try {
      proofreadingBusy.value = true;
      const result = scanDataProofreading(
        options.getWorkbook(),
        source.sheetId,
        normalizeRange(source.range),
      );
      rawIssues.value = result.issues;
      proofreadingHasScanned.value = true;
      selectedProofreadingIssueIds.value = [];
      target = {
        workbook: options.getWorkbook(),
        generation: options.getGeneration(),
        ...(options.getRevision ? { revision: options.getRevision() } : {}),
        sheetId: source.sheetId,
      };
      proofreadingDraft.value = {
        range: wholeSheet
          ? ""
          : formatRangeReference(
              options.getWorkbook().sheets.get(source.sheetId)!.name,
              source.range,
            ),
      };
    } catch (cause) {
      const isTooLarge =
        cause instanceof WorkbookDomainError &&
        cause.data.details?.field === "range" &&
        /at most/.test(cause.message);
      proofreadingError.value = isTooLarge
        ? t("proofreading.scanTooLarge")
        : t("proofreading.scanFailed");
    } finally {
      proofreadingBusy.value = false;
    }
  }

  function applyIssues(ids: readonly string[]): void {
    if (!isCurrentTarget()) {
      proofreadingError.value = t("proofreading.rangeChanged");
      return;
    }
    if (options.isBusy() || !options.flush()) return;
    const candidates = new Set(ids);
    const issues = rawIssues.value.filter(
      (issue) => candidates.has(issueId(issue)) && issue.proposed,
    );
    if (!issues.length) {
      proofreadingError.value = t("proofreading.noSafeSelection");
      return;
    }
    try {
      proofreadingBusy.value = true;
      const executed = options.execute(
        createApplyDataProofreadingCommand(options.getWorkbook(), target!.sheetId, issues),
      );
      if (!executed) {
        proofreadingError.value = t("proofreading.applyFailed");
        return;
      }
      const applied = new Set(issues.map(issueId));
      rawIssues.value = rawIssues.value.filter((issue) => !applied.has(issueId(issue)));
      selectedProofreadingIssueIds.value = selectedProofreadingIssueIds.value.filter(
        (id) => !applied.has(id),
      );
      target = { ...target!, ...(options.getRevision ? { revision: options.getRevision() } : {}) };
    } catch {
      // Keep scan results for review when core rejects stale or unsafe changes.
      proofreadingError.value = t("proofreading.applyFailed");
    } finally {
      proofreadingBusy.value = false;
    }
  }

  function applyDataProofreadingIssue(id: string): void {
    applyIssues([id]);
  }
  function applyDataProofreadingType(type: DataProofreadingIssueKind): void {
    applyIssues(
      proofreadingIssues.value
        .filter((issue) => issue.type === type && issue.safe)
        .map((issue) => issue.id),
    );
  }
  function applySelectedDataProofreadingIssues(): void {
    applyIssues(selectedProofreadingIssueIds.value);
  }
  function ignoreDataProofreadingIssue(id: string): void {
    rawIssues.value = rawIssues.value.filter((issue) => issueId(issue) !== id);
    selectedProofreadingIssueIds.value = selectedProofreadingIssueIds.value.filter(
      (item) => item !== id,
    );
  }
  function ignoreDataProofreadingType(type: DataProofreadingIssueKind): void {
    const ignored = new Set(
      proofreadingIssues.value.filter((issue) => issue.type === type).map((issue) => issue.id),
    );
    rawIssues.value = rawIssues.value.filter((issue) => !ignored.has(issueId(issue)));
    selectedProofreadingIssueIds.value = selectedProofreadingIssueIds.value.filter(
      (id) => !ignored.has(id),
    );
  }
  function selectDataProofreadingIssue(id: string): void {
    const issue = rawIssues.value.find((item) => issueId(item) === id);
    if (!issue) return;
    options.navigateToCell?.(issue.sheetId, issue.address);
    // Sheet navigation can revise the workspace without changing a scanned cell.
    // Refresh after its synchronous/queued selection update; core still verifies originals on apply.
    queueMicrotask(() => {
      if (
        target &&
        target.workbook === options.getWorkbook() &&
        target.generation === options.getGeneration() &&
        options.getRevision
      ) {
        target = { ...target, revision: options.getRevision() };
      }
    });
  }

  watch(options.getGeneration, closeDataProofreading);
  return {
    proofreadingVisible,
    proofreadingDraft,
    proofreadingIssues,
    proofreadingError,
    proofreadingBusy,
    proofreadingHasScanned,
    selectedProofreadingIssueIds,
    openDataProofreading,
    closeDataProofreading,
    updateDataProofreadingDraft,
    scanDataProofreadingResults,
    setSelectedProofreadingIssueIds: (ids: string[]) => {
      selectedProofreadingIssueIds.value = [...new Set(ids)];
    },
    selectDataProofreadingIssue,
    applyDataProofreadingIssue,
    applyDataProofreadingType,
    applySelectedDataProofreadingIssues,
    ignoreDataProofreadingIssue,
    ignoreDataProofreadingType,
  };
}
