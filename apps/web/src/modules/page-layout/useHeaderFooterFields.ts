import type { MessageKey } from "../../shared/i18n";
import {
  DEFAULT_HEADER_FOOTER_FORMAT,
  type HeaderFooterFieldLabels,
  type HeaderFooterFormat,
} from "./header-footer-text";

export function headerFooterLabels(t: (key: MessageKey) => string): HeaderFooterFieldLabels {
  return {
    pageNumber: t("pageLayout.headerFooterPageNumber"),
    pageCount: t("pageLayout.headerFooterPageCount"),
    sheetName: t("pageLayout.headerFooterSheetName"),
    fileName: t("pageLayout.headerFooterFileName"),
    date: t("pageLayout.headerFooterDate"),
    time: t("pageLayout.headerFooterTime"),
  };
}

export function mergeHeaderFooterFormat(
  current: HeaderFooterFormat | undefined,
  patch: Partial<HeaderFooterFormat>,
): HeaderFooterFormat {
  return { ...(current ?? DEFAULT_HEADER_FOOTER_FORMAT), ...patch };
}

export function insertAtSelection(
  value: string,
  start: number,
  end: number,
  insertion: string,
): {
  value: string;
  caret: number;
} {
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  return {
    value: `${value.slice(0, safeStart)}${insertion}${value.slice(safeEnd)}`,
    caret: safeStart + insertion.length,
  };
}
