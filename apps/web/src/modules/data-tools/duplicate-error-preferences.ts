export type DuplicateErrorIgnoredIssue = {
  workbookId: string;
  sheetId: string;
  cellKey: string;
  signature: string;
};

export type DuplicateErrorChecksPreferences = {
  enabled: boolean;
  ignored: DuplicateErrorIgnoredIssue[];
};

export const DUPLICATE_ERROR_CHECKS_STORAGE_KEY = "idea10.duplicateErrorChecks";
const STORAGE_VERSION = 1;

function getStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function isIgnoredIssue(value: unknown): value is DuplicateErrorIgnoredIssue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const issue = value as Record<string, unknown>;
  return (
    typeof issue.workbookId === "string" &&
    issue.workbookId.length > 0 &&
    typeof issue.sheetId === "string" &&
    issue.sheetId.length > 0 &&
    typeof issue.cellKey === "string" &&
    /^\d+:\d+$/.test(issue.cellKey) &&
    typeof issue.signature === "string" &&
    issue.signature.length > 0
  );
}

function isPreferences(value: unknown): value is DuplicateErrorChecksPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.enabled === "boolean" &&
    Array.isArray(record.ignored) &&
    record.ignored.every(isIgnoredIssue)
  );
}

function clonePreferences(
  preferences: DuplicateErrorChecksPreferences,
): DuplicateErrorChecksPreferences {
  return {
    enabled: preferences.enabled,
    ignored: preferences.ignored.map((issue) => ({ ...issue })),
  };
}

/** Reads browser-only warning preferences. Invalid or unavailable storage uses safe defaults. */
export function readDuplicateErrorChecks(
  storage: Storage | undefined = getStorage(),
): DuplicateErrorChecksPreferences {
  if (!storage) return { enabled: true, ignored: [] };
  try {
    const stored: unknown = JSON.parse(
      storage.getItem(DUPLICATE_ERROR_CHECKS_STORAGE_KEY) ?? "null",
    );
    if (!stored || typeof stored !== "object" || Array.isArray(stored))
      return { enabled: true, ignored: [] };
    const record = stored as Record<string, unknown>;
    if (record.version !== STORAGE_VERSION || !isPreferences(record.preferences))
      return { enabled: true, ignored: [] };
    const preferences = clonePreferences(record.preferences);
    const keys = preferences.ignored.map(
      (issue) => `${issue.workbookId}|${issue.sheetId}|${issue.cellKey}|${issue.signature}`,
    );
    return new Set(keys).size === keys.length ? preferences : { enabled: true, ignored: [] };
  } catch {
    return { enabled: true, ignored: [] };
  }
}

/** Writes a complete, versioned browser preference record without throwing in restricted hosts. */
export function writeDuplicateErrorChecks(
  preferences: DuplicateErrorChecksPreferences,
  storage: Storage | undefined = getStorage(),
): boolean {
  if (!isPreferences(preferences) || !storage) return false;
  const keys = preferences.ignored.map(
    (issue) => `${issue.workbookId}|${issue.sheetId}|${issue.cellKey}|${issue.signature}`,
  );
  if (new Set(keys).size !== keys.length) return false;
  try {
    storage.setItem(
      DUPLICATE_ERROR_CHECKS_STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        preferences: clonePreferences(preferences),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
