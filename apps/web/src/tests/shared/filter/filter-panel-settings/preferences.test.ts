import { afterEach, describe, expect, test, vi } from "vitest";
import {
  FILTER_PANEL_SETTINGS_STORAGE_KEY,
  readFilterPanelSettings,
  writeFilterPanelSettings,
  type FilterPanelSettings,
} from "../../../../shared/filter/filter-panel-settings";

const defaults: FilterPanelSettings = {
  showItemCount: true,
  showTotalCount: false,
  showCriteria: false,
  checkedFirst: false,
  allowMergedCells: true,
  sortField: "name",
  sortDirection: "ascending",
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("filter-panel settings", () => {
  test("uses defaults when no browser preference exists", () => {
    expect(readFilterPanelSettings()).toEqual(defaults);
  });

  test("round-trips a complete versioned preference", () => {
    const settings: FilterPanelSettings = {
      showItemCount: false,
      showTotalCount: true,
      showCriteria: true,
      checkedFirst: true,
      allowMergedCells: false,
      sortField: "count",
      sortDirection: "descending",
    };
    expect(writeFilterPanelSettings(settings)).toBe(true);
    expect(readFilterPanelSettings()).toEqual(settings);
  });

  test("defaults invalid or missing fields without accepting a different record version", () => {
    localStorage.setItem(
      FILTER_PANEL_SETTINGS_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        settings: { showItemCount: false, showTotalCount: "yes", sortField: "other" },
      }),
    );
    expect(readFilterPanelSettings()).toEqual({ ...defaults, showItemCount: false });
    localStorage.setItem(
      FILTER_PANEL_SETTINGS_STORAGE_KEY,
      JSON.stringify({ version: 2, settings: { ...defaults, showItemCount: false } }),
    );
    expect(readFilterPanelSettings()).toEqual(defaults);
  });

  test("returns defaults and false when storage cannot be used", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(readFilterPanelSettings()).toEqual(defaults);
    expect(writeFilterPanelSettings({ ...defaults })).toBe(false);
  });
});
