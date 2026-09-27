import { normalizeColor } from "../../shared/color/palette";

/** User-configurable presentation and rule switches for cell error checks. */
export type ErrorCheckSettings = {
  enabled: boolean;
  indicatorColor: string | null;
  duplicateEntries: boolean;
  numberStoredAsText: boolean;
};

export const DEFAULT_ERROR_CHECK_SETTINGS: Readonly<ErrorCheckSettings> = {
  enabled: true,
  indicatorColor: null,
  duplicateEntries: true,
  numberStoredAsText: true,
};

export type DuplicateErrorIgnoredIssue = {
  workbookId: string;
  sheetId: string;
  cellKey: string;
  signature: string;
};

export type DuplicateErrorChecksPreferences = ErrorCheckSettings & {
  ignored: DuplicateErrorIgnoredIssue[];
};

export const DUPLICATE_ERROR_CHECKS_STORAGE_KEY = "idea10.duplicateErrorChecks";
const STORAGE_VERSION = 3;

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

function isLegacyPreferences(value: unknown): value is {
  enabled: boolean;
  ignored: DuplicateErrorIgnoredIssue[];
} {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.enabled === "boolean" &&
    Array.isArray(record.ignored) &&
    record.ignored.every(isIgnoredIssue)
  );
}

/** Validates and normalizes the presentation settings used by browser-only checks. */
export function normalizeErrorCheckSettings(value: unknown): ErrorCheckSettings | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.enabled !== "boolean" ||
    typeof record.duplicateEntries !== "boolean" ||
    typeof record.numberStoredAsText !== "boolean"
  )
    return undefined;
  const indicatorColor =
    record.indicatorColor === null
      ? null
      : typeof record.indicatorColor === "string"
        ? normalizeColor(record.indicatorColor)
        : undefined;
  if (indicatorColor === undefined) return undefined;
  return {
    enabled: record.enabled,
    indicatorColor,
    duplicateEntries: record.duplicateEntries,
    numberStoredAsText: record.numberStoredAsText,
  };
}

function normalizeLegacyErrorCheckSettings(value: unknown): ErrorCheckSettings | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return normalizeErrorCheckSettings({
    ...record,
    numberStoredAsText:
      record.numberStoredAsText ?? DEFAULT_ERROR_CHECK_SETTINGS.numberStoredAsText,
  });
}

function parsePreferences(value: unknown): DuplicateErrorChecksPreferences | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const settings = normalizeErrorCheckSettings(record);
  if (!settings || !Array.isArray(record.ignored) || !record.ignored.every(isIgnoredIssue))
    return undefined;
  return {
    ...settings,
    ignored: record.ignored.map((issue) => ({ ...issue })),
  };
}

function parseLegacyPreferences(value: unknown): DuplicateErrorChecksPreferences | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const settings = normalizeLegacyErrorCheckSettings(record);
  if (!settings || !Array.isArray(record.ignored) || !record.ignored.every(isIgnoredIssue))
    return undefined;
  return {
    ...settings,
    ignored: record.ignored.map((issue) => ({ ...issue })),
  };
}

function defaultPreferences(): DuplicateErrorChecksPreferences {
  return { ...DEFAULT_ERROR_CHECK_SETTINGS, ignored: [] };
}

function clonePreferences(
  preferences: DuplicateErrorChecksPreferences,
): DuplicateErrorChecksPreferences {
  return {
    enabled: preferences.enabled,
    indicatorColor: preferences.indicatorColor,
    duplicateEntries: preferences.duplicateEntries,
    numberStoredAsText: preferences.numberStoredAsText,
    ignored: preferences.ignored.map((issue) => ({ ...issue })),
  };
}

/** Reads browser-only warning preferences. Invalid or unavailable storage uses safe defaults. */
export function readDuplicateErrorChecks(
  storage: Storage | undefined = getStorage(),
): DuplicateErrorChecksPreferences {
  if (!storage) return defaultPreferences();
  try {
    const stored: unknown = JSON.parse(
      storage.getItem(DUPLICATE_ERROR_CHECKS_STORAGE_KEY) ?? "null",
    );
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) return defaultPreferences();
    const record = stored as Record<string, unknown>;
    const preferences =
      record.version === 1 && isLegacyPreferences(record.preferences)
        ? {
            ...DEFAULT_ERROR_CHECK_SETTINGS,
            enabled: record.preferences.enabled,
            ignored: record.preferences.ignored.map((issue) => ({ ...issue })),
          }
        : record.version === 2
          ? parseLegacyPreferences(record.preferences)
          : record.version === STORAGE_VERSION
            ? parsePreferences(record.preferences)
            : undefined;
    if (!preferences) return defaultPreferences();
    const keys = preferences.ignored.map(
      (issue) => `${issue.workbookId}|${issue.sheetId}|${issue.cellKey}|${issue.signature}`,
    );
    return new Set(keys).size === keys.length ? preferences : defaultPreferences();
  } catch {
    return defaultPreferences();
  }
}

/** Writes a complete, versioned browser preference record without throwing in restricted hosts. */
export function writeDuplicateErrorChecks(
  preferences: DuplicateErrorChecksPreferences,
  storage: Storage | undefined = getStorage(),
): boolean {
  const parsed = parsePreferences(preferences);
  if (!parsed || !storage) return false;
  const keys = parsed.ignored.map(
    (issue) => `${issue.workbookId}|${issue.sheetId}|${issue.cellKey}|${issue.signature}`,
  );
  if (new Set(keys).size !== keys.length) return false;
  try {
    storage.setItem(
      DUPLICATE_ERROR_CHECKS_STORAGE_KEY,
      JSON.stringify({
        version: STORAGE_VERSION,
        preferences: clonePreferences(parsed),
      }),
    );
    return true;
  } catch {
    return false;
  }
}
