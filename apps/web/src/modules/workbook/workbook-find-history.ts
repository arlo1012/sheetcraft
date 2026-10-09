const FIND_HISTORY_VERSION = 1;
const FIND_HISTORY_LIMIT = 20;
export const WORKBOOK_FIND_HISTORY_STORAGE_KEY = "sheetcraft.findHistory";

type FindHistorySnapshot = {
  version: number;
  queries: string[];
};

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function readWorkbookFindHistory(): string[] {
  try {
    const stored = storage()?.getItem(WORKBOOK_FIND_HISTORY_STORAGE_KEY);
    if (!stored) return [];
    const snapshot = JSON.parse(stored) as Partial<FindHistorySnapshot>;
    if (snapshot.version !== FIND_HISTORY_VERSION || !Array.isArray(snapshot.queries)) return [];
    return [
      ...new Set(snapshot.queries.filter((query): query is string => typeof query === "string")),
    ]
      .filter((query) => query !== "")
      .slice(0, FIND_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function recordWorkbookFindHistory(history: readonly string[], query: string): string[] {
  if (!query) return [...history];
  const next = [query, ...history.filter((item) => item !== query)].slice(0, FIND_HISTORY_LIMIT);
  try {
    storage()?.setItem(
      WORKBOOK_FIND_HISTORY_STORAGE_KEY,
      JSON.stringify({
        version: FIND_HISTORY_VERSION,
        queries: next,
      } satisfies FindHistorySnapshot),
    );
  } catch {
    // Find remains available when private browsing or storage quotas reject persistence.
  }
  return next;
}
