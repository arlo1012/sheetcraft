import type { PageMargins } from "./page-margin-presets";

const PAGE_MARGIN_HISTORY_VERSION = 1;
export const PAGE_MARGIN_HISTORY_STORAGE_KEY = "sheetcraft.pageMarginHistory";

type PageMarginHistorySnapshot = {
  version: number;
  margins: PageMargins;
};

function storage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function isMarginValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 5000;
}

function parseMargins(value: unknown): PageMargins | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const margins = value as Partial<PageMargins>;
  if (
    !isMarginValue(margins.top) ||
    !isMarginValue(margins.bottom) ||
    !isMarginValue(margins.left) ||
    !isMarginValue(margins.right) ||
    !isMarginValue(margins.header) ||
    !isMarginValue(margins.footer) ||
    margins.header > margins.top ||
    margins.footer > margins.bottom
  )
    return undefined;
  return {
    top: margins.top,
    bottom: margins.bottom,
    left: margins.left,
    right: margins.right,
    header: margins.header,
    footer: margins.footer,
  };
}

export function readPageMarginHistory(): PageMargins | undefined {
  try {
    const stored = storage()?.getItem(PAGE_MARGIN_HISTORY_STORAGE_KEY);
    if (!stored) return undefined;
    const snapshot = JSON.parse(stored) as Partial<PageMarginHistorySnapshot>;
    if (snapshot.version !== PAGE_MARGIN_HISTORY_VERSION) return undefined;
    return parseMargins(snapshot.margins);
  } catch {
    return undefined;
  }
}

export function recordPageMarginHistory(margins: PageMargins): PageMargins {
  const snapshot = { ...margins };
  try {
    storage()?.setItem(
      PAGE_MARGIN_HISTORY_STORAGE_KEY,
      JSON.stringify({
        version: PAGE_MARGIN_HISTORY_VERSION,
        margins: snapshot,
      } satisfies PageMarginHistorySnapshot),
    );
  } catch {
    // Custom margins remain available for this workspace when browser storage is unavailable.
  }
  return snapshot;
}
