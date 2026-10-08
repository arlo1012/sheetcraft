export type FilterPanelSettings = {
  showItemCount: boolean;
  showTotalCount: boolean;
  showCriteria: boolean;
  checkedFirst: boolean;
  allowMergedCells: boolean;
  sortField: "name" | "count";
  sortDirection: "ascending" | "descending";
};

export const FILTER_PANEL_SETTINGS_STORAGE_KEY = "idea10.filter.panel.settings";
const STORAGE_VERSION = 1;

const DEFAULT_FILTER_PANEL_SETTINGS: Readonly<FilterPanelSettings> = {
  showItemCount: true,
  showTotalCount: false,
  showCriteria: false,
  checkedFirst: false,
  allowMergedCells: true,
  sortField: "name",
  sortDirection: "ascending",
};

function defaults(): FilterPanelSettings {
  return { ...DEFAULT_FILTER_PANEL_SETTINGS };
}

function parse(value: unknown): FilterPanelSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return defaults();
  const record = value as Partial<FilterPanelSettings>;
  return {
    showItemCount:
      typeof record.showItemCount === "boolean"
        ? record.showItemCount
        : DEFAULT_FILTER_PANEL_SETTINGS.showItemCount,
    showTotalCount:
      typeof record.showTotalCount === "boolean"
        ? record.showTotalCount
        : DEFAULT_FILTER_PANEL_SETTINGS.showTotalCount,
    showCriteria:
      typeof record.showCriteria === "boolean"
        ? record.showCriteria
        : DEFAULT_FILTER_PANEL_SETTINGS.showCriteria,
    checkedFirst:
      typeof record.checkedFirst === "boolean"
        ? record.checkedFirst
        : DEFAULT_FILTER_PANEL_SETTINGS.checkedFirst,
    allowMergedCells:
      typeof record.allowMergedCells === "boolean"
        ? record.allowMergedCells
        : DEFAULT_FILTER_PANEL_SETTINGS.allowMergedCells,
    sortField:
      record.sortField === "name" || record.sortField === "count"
        ? record.sortField
        : DEFAULT_FILTER_PANEL_SETTINGS.sortField,
    sortDirection:
      record.sortDirection === "ascending" || record.sortDirection === "descending"
        ? record.sortDirection
        : DEFAULT_FILTER_PANEL_SETTINGS.sortDirection,
  };
}

/** Reads versioned browser-only filter-panel preferences, using defaults when unavailable. */
export function readFilterPanelSettings(): FilterPanelSettings {
  try {
    const stored = globalThis.localStorage?.getItem(FILTER_PANEL_SETTINGS_STORAGE_KEY);
    if (!stored) return defaults();
    const record = JSON.parse(stored) as { version?: unknown; settings?: unknown };
    return record.version === STORAGE_VERSION ? parse(record.settings) : defaults();
  } catch {
    return defaults();
  }
}

/** Writes the complete versioned preference record and reports unavailable browser storage. */
export function writeFilterPanelSettings(settings: FilterPanelSettings): boolean {
  try {
    const target = globalThis.localStorage;
    if (!target) return false;
    target.setItem(
      FILTER_PANEL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, settings }),
    );
    return true;
  } catch {
    return false;
  }
}
