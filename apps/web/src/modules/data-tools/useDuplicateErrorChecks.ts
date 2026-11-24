import { computed, ref, type ComputedRef } from "vue";
import { isCellInRange, normalizeCellRange } from "@sheetcraft/sheet-engine/selection";
import {
  createCellKey,
  type CellAddress,
  type CellRange,
  type Sheet,
  type SheetEvaluator,
  type Workbook,
} from "@sheetcraft/core/workbook";
import {
  ERROR_CHECK_RULE_KEYS,
  normalizeErrorCheckSettings,
  readDuplicateErrorChecks,
  writeDuplicateErrorChecks,
  type DuplicateErrorChecksPreferences,
  type ErrorCheckSettings,
} from "./duplicate-error-preferences";
import {
  collectSheetErrorIssues,
  ERROR_CHECK_KIND_TO_SETTING,
  pickPrimaryErrorCheckKind,
  stableErrorValue,
  type ErrorCheckIssue,
  type ErrorCheckKind,
} from "./error-check-rules";

export type { ErrorCheckKind };

type Options = {
  getWorkbook: () => Workbook;
  getSheet: () => Sheet;
  getEvaluator: () => SheetEvaluator;
  /** A document-display revision. It must change when content, formulas, or rules change. */
  getRevision: () => number;
  /** Allows embedding hosts and focused tests to supply storage explicitly. */
  storage?: Storage;
};

type CachedIssues = {
  workbook: Workbook;
  sheet: Sheet;
  revision: number;
  issues: ErrorCheckIssue[];
};

type CurrentIssues = CachedIssues & {
  errorKinds: Map<string, ErrorCheckKind>;
  signatures: Map<string, string>;
};

function sameScope(
  issue: { workbookId: string; sheetId: string },
  workbook: Workbook,
  sheet: Sheet,
) {
  return issue.workbookId === workbook.id && issue.sheetId === sheet.id;
}

/**
 * Browser-only presentation state for background cell error checks.
 * It never mutates sheet rules or command-time validation.
 */
export function useDuplicateErrorChecks(options: Options): {
  errorCells: ComputedRef<ReadonlySet<string>>;
  errorKinds: ComputedRef<ReadonlyMap<string, ErrorCheckKind>>;
  settings: ComputedRef<ErrorCheckSettings>;
  enabled: ComputedRef<boolean>;
  ignoredCount: ComputedRef<number>;
  ignoreCell: (address: CellAddress) => void;
  ignoreRange: (range: CellRange) => void;
  ignoreAll: (kind?: ErrorCheckKind) => void;
  resetIgnored: () => void;
  setEnabled: (enabled: boolean) => void;
  applySettings: (settings: ErrorCheckSettings, resetIgnored?: boolean) => boolean;
} {
  let preferences: DuplicateErrorChecksPreferences = readDuplicateErrorChecks(options.storage);
  let cache: CachedIssues | undefined;
  const stateVersion = ref(0);

  function persist(): void {
    writeDuplicateErrorChecks(preferences, options.storage);
  }

  function updatePreferences(next: DuplicateErrorChecksPreferences, save = true): void {
    preferences = next;
    stateVersion.value += 1;
    if (save) persist();
  }

  function currentIssues(): CachedIssues {
    const workbook = options.getWorkbook();
    const sheet = options.getSheet();
    const revision = options.getRevision();
    if (cache?.workbook === workbook && cache.sheet === sheet && cache.revision === revision)
      return cache;
    const evaluator = options.getEvaluator();
    const issues = collectSheetErrorIssues(workbook, sheet, evaluator);
    cache = { workbook, sheet, revision, issues };
    return cache;
  }

  function visibleIssues(snapshot: CachedIssues): CurrentIssues {
    const byCell = new Map<string, ErrorCheckIssue[]>();
    for (const issue of snapshot.issues) {
      const settingKey = ERROR_CHECK_KIND_TO_SETTING[issue.kind];
      if (!preferences[settingKey]) continue;
      const cellKey = createCellKey(issue.address);
      const issues = byCell.get(cellKey);
      if (issues) issues.push(issue);
      else byCell.set(cellKey, [issue]);
    }
    const errorKinds = new Map<string, ErrorCheckKind>();
    const signatures = new Map<string, string>();
    for (const [cellKey, issues] of byCell) {
      issues.sort((left, right) => left.kind.localeCompare(right.kind));
      errorKinds.set(cellKey, pickPrimaryErrorCheckKind(issues));
      signatures.set(
        cellKey,
        issues.length === 1 && issues[0]!.kind === "duplicate"
          ? issues[0]!.signature
          : stableErrorValue(issues.map(({ kind, signature }) => ({ kind, signature }))),
      );
    }

    // An exception only represents the exact current issue. Removing or changing the
    // issue discards it so a later return to the same value is warned again.
    const valid = new Map(signatures);
    const retained = preferences.ignored.filter(
      (ignored) =>
        !sameScope(ignored, snapshot.workbook, snapshot.sheet) ||
        valid.get(ignored.cellKey) === ignored.signature,
    );
    if (retained.length !== preferences.ignored.length)
      updatePreferences({ ...preferences, ignored: retained });
    return { ...snapshot, errorKinds, signatures };
  }

  function ignoredKeys(snapshot: CurrentIssues): Set<string> {
    const ignored = new Set<string>();
    for (const item of preferences.ignored) {
      if (!sameScope(item, snapshot.workbook, snapshot.sheet)) continue;
      if (snapshot.signatures.get(item.cellKey) === item.signature) ignored.add(item.cellKey);
    }
    return ignored;
  }

  const enabled = computed(() => {
    void stateVersion.value;
    return preferences.enabled;
  });

  const settings = computed<ErrorCheckSettings>(() => {
    void stateVersion.value;
    const { ignored: _ignored, ...rest } = preferences;
    return { ...rest };
  });

  const errorKinds = computed<ReadonlyMap<string, ErrorCheckKind>>(() => {
    void stateVersion.value;
    // Continue diagnosing while the display is disabled. This invalidates stale
    // exceptions before the user enables warnings again.
    const snapshot = visibleIssues(currentIssues());
    if (!settings.value.enabled) return new Map();
    const ignored = ignoredKeys(snapshot);
    return new Map([...snapshot.errorKinds].filter(([cellKey]) => !ignored.has(cellKey)));
  });

  const errorCells = computed<ReadonlySet<string>>(() => {
    return new Set(errorKinds.value.keys());
  });

  const ignoredCount = computed(() => {
    void stateVersion.value;
    const snapshot = visibleIssues(currentIssues());
    return ignoredKeys(snapshot).size;
  });

  function ignoreCell(address: CellAddress): void {
    ignoreRange({ start: address, end: address });
  }

  function ignoreRange(range: CellRange): void {
    const normalized = normalizeCellRange(range.start, range.end);
    ignoreMatchingIssues((cellKey) => isCellInRange(addressFromCellKey(cellKey), normalized));
  }

  function ignoreAll(kind?: ErrorCheckKind): void {
    ignoreMatchingIssues((_cellKey, issueKind) => kind === undefined || issueKind === kind);
  }

  function addressFromCellKey(cellKey: string): CellAddress {
    const [row, column] = cellKey.split(":").map(Number) as [number, number];
    return { row, column };
  }

  function ignoreMatchingIssues(matches: (cellKey: string, kind: ErrorCheckKind) => boolean): void {
    if (!preferences.enabled) return;
    const snapshot = visibleIssues(currentIssues());
    const ignored = ignoredKeys(snapshot);
    const additions = [...snapshot.errorKinds.keys()]
      .filter((cellKey) => matches(cellKey, snapshot.errorKinds.get(cellKey)!))
      .filter((cellKey) => !ignored.has(cellKey))
      .map((cellKey) => ({
        workbookId: snapshot.workbook.id,
        sheetId: snapshot.sheet.id,
        cellKey,
        signature: snapshot.signatures.get(cellKey)!,
      }));
    if (additions.length)
      updatePreferences({
        ...preferences,
        ignored: [...preferences.ignored, ...additions],
      });
  }

  function resetIgnored(): void {
    const snapshot = visibleIssues(currentIssues());
    const ignored = preferences.ignored.filter(
      (item) => !sameScope(item, snapshot.workbook, snapshot.sheet),
    );
    if (ignored.length !== preferences.ignored.length)
      updatePreferences({ ...preferences, ignored });
  }

  function setEnabled(value: boolean): void {
    applySettings({ ...settings.value, enabled: value });
  }

  function applySettings(nextSettings: ErrorCheckSettings, resetIgnored = false): boolean {
    const normalized = normalizeErrorCheckSettings(nextSettings);
    if (!normalized) return false;
    const snapshot = resetIgnored ? currentIssues() : undefined;
    const ignored = snapshot
      ? preferences.ignored.filter((item) => !sameScope(item, snapshot.workbook, snapshot.sheet))
      : preferences.ignored;
    const rulesChanged = ERROR_CHECK_RULE_KEYS.some((key) => preferences[key] !== normalized[key]);
    const changed =
      preferences.enabled !== normalized.enabled ||
      preferences.indicatorColor !== normalized.indicatorColor ||
      rulesChanged ||
      ignored !== preferences.ignored;
    if (changed) updatePreferences({ ...normalized, ignored });
    return true;
  }

  return {
    errorCells,
    errorKinds,
    settings,
    enabled,
    ignoredCount,
    ignoreCell,
    ignoreRange,
    ignoreAll,
    resetIgnored,
    setEnabled,
    applySettings,
  };
}
