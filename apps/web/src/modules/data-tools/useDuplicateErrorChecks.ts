import { computed, ref, type ComputedRef } from "vue";
import { getDuplicateEntryIssues } from "@idea10/core/duplicate-values";
import {
  createCellKey,
  type CellAddress,
  type Sheet,
  type SheetEvaluator,
  type Workbook,
} from "@idea10/core/workbook";
import {
  readDuplicateErrorChecks,
  writeDuplicateErrorChecks,
  type DuplicateErrorChecksPreferences,
  type ErrorCheckSettings,
  normalizeErrorCheckSettings,
} from "./duplicate-error-preferences";

type DuplicateIssue = ReturnType<typeof getDuplicateEntryIssues>[number];

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
  issues: DuplicateIssue[];
  signatures: Map<string, string>;
};

function stableValue(value: unknown): string {
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function issueSignature(sheet: Sheet, evaluator: SheetEvaluator, issue: DuplicateIssue): string {
  const rules = (sheet.duplicateRules ?? [])
    .filter((rule) => issue.ruleIds.includes(rule.id))
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((rule) => ({ id: rule.id, range: rule.range }));
  return stableValue({
    valueKey: issue.valueKey,
    content: sheet.cells.get(createCellKey(issue.address))?.content ?? null,
    computedValue: evaluator.getComputedValue(issue.address),
    rules,
  });
}

function sameScope(
  issue: { workbookId: string; sheetId: string },
  workbook: Workbook,
  sheet: Sheet,
) {
  return issue.workbookId === workbook.id && issue.sheetId === sheet.id;
}

/**
 * Browser-only presentation state for existing duplicate-entry violations.
 * It never changes duplicate rules or the command-time rejection validation.
 */
export function useDuplicateErrorChecks(options: Options): {
  errorCells: ComputedRef<ReadonlySet<string>>;
  settings: ComputedRef<ErrorCheckSettings>;
  enabled: ComputedRef<boolean>;
  ignoredCount: ComputedRef<number>;
  ignoreCell: (address: CellAddress) => void;
  ignoreAll: () => void;
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
    const issues = getDuplicateEntryIssues(sheet, evaluator);
    const signatures = new Map(
      issues.map((issue) => [
        createCellKey(issue.address),
        issueSignature(sheet, evaluator, issue),
      ]),
    );
    cache = { workbook, sheet, revision, issues, signatures };

    // An exception only represents the exact current issue. Removing or changing the
    // issue discards it so a later return to the same value is warned again.
    const valid = new Map(signatures);
    const retained = preferences.ignored.filter(
      (ignored) =>
        !sameScope(ignored, workbook, sheet) || valid.get(ignored.cellKey) === ignored.signature,
    );
    if (retained.length !== preferences.ignored.length)
      updatePreferences({ ...preferences, ignored: retained });
    return cache;
  }

  function ignoredKeys(snapshot: CachedIssues): Set<string> {
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
    const { enabled, indicatorColor, duplicateEntries } = preferences;
    return { enabled, indicatorColor, duplicateEntries };
  });

  const errorCells = computed<ReadonlySet<string>>(() => {
    void stateVersion.value;
    // Continue diagnosing while the display is disabled. This invalidates stale
    // exceptions before the user enables warnings again.
    const snapshot = currentIssues();
    if (!settings.value.enabled || !settings.value.duplicateEntries) return new Set();
    const ignored = ignoredKeys(snapshot);
    return new Set(
      snapshot.issues
        .map((issue) => createCellKey(issue.address))
        .filter((key) => !ignored.has(key)),
    );
  });

  const ignoredCount = computed(() => {
    void stateVersion.value;
    const snapshot = currentIssues();
    return ignoredKeys(snapshot).size;
  });

  function ignoreCell(address: CellAddress): void {
    const snapshot = currentIssues();
    const cellKey = createCellKey(address);
    const signature = snapshot.signatures.get(cellKey);
    if (!signature || ignoredKeys(snapshot).has(cellKey)) return;
    updatePreferences({
      ...preferences,
      ignored: [
        ...preferences.ignored,
        {
          workbookId: snapshot.workbook.id,
          sheetId: snapshot.sheet.id,
          cellKey,
          signature,
        },
      ],
    });
  }

  function ignoreAll(): void {
    const snapshot = currentIssues();
    const ignored = ignoredKeys(snapshot);
    const additions = snapshot.issues
      .map((issue) => createCellKey(issue.address))
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
    const snapshot = currentIssues();
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
    const changed =
      preferences.enabled !== normalized.enabled ||
      preferences.indicatorColor !== normalized.indicatorColor ||
      preferences.duplicateEntries !== normalized.duplicateEntries ||
      ignored !== preferences.ignored;
    if (changed) updatePreferences({ ...normalized, ignored });
    return true;
  }

  return {
    errorCells,
    settings,
    enabled,
    ignoredCount,
    ignoreCell,
    ignoreAll,
    resetIgnored,
    setEnabled,
    applySettings,
  };
}
