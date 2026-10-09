import type { Rect } from "@sheetcraft/sheet-engine/geometry";
import type { SheetViewMode } from "@sheetcraft/sheet-engine/page-layout";

export type PageViewPage = {
  pageNumber?: number;
  paperRect: Rect;
  contentRect: Rect;
  /** Continuous grid coordinates for the page-break preview. */
  sheetRect: Rect;
};

export type PageViewBreak = {
  index: number;
  offset: number;
  kind: "automatic" | "manual";
};

export type PageViewPaintState = {
  mode: SheetViewMode;
  showWhiteSpace?: boolean;
  rulerSize?: number;
  uiScale?: number;
  pages: readonly PageViewPage[];
  printRect: Rect;
  rowBreaks: readonly PageViewBreak[];
  columnBreaks: readonly PageViewBreak[];
  dragBoundary?: { axis: "row" | "column"; offset: number; removing: boolean };
  dragCorner?: { x: number; y: number };
  pageLabel: (number: number) => string;
  millimetresPerUnit: number;
};
