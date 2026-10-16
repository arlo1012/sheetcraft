import type { NativePictureGeometry } from "../picture-frame-geometry.js";
/** Product-owned, sparse OOXML exchange model. No third-party workbook engine. */
export type NativeStyle = Record<string, unknown>;
export type NativeCell = {
  address: string;
  value: unknown;
  formula?: string;
  result?: unknown;
  style: NativeStyle;
  numFmt?: string;
  note?: string | { texts?: Array<{ text: string }> };
};
export type NativeRow = {
  number: number;
  height?: number;
  hidden?: boolean;
  cells: Map<number, NativeCell>;
};
export type NativeColumn = { number: number; width?: number; hidden?: boolean };
export type NativeImage = { buffer: Uint8Array; extension: "png" | "jpeg" | "gif" };
export type NativeImageAnchor = {
  tl: { nativeCol: number; nativeColOff: number; nativeRow: number; nativeRowOff: number };
  ext: { width: number; height: number };
  placement?:
    | { kind: "twoCell"; end: NativeImageAnchor["tl"] }
    | { kind: "absolute"; x: number; y: number };
  geometry?: NativePictureGeometry;
  transformOrigin?: { x: number; y: number };
  lockAspectRatio?: boolean;
  altText?: string;
  /** Source placement context for diagnostics; never serialized into the drawing. */
  issueLocation?: string;
};
export type NativeSheetState = "visible" | "hidden" | "veryHidden";
export type NativeSheetData = {
  name: string;
  state?: NativeSheetState;
  properties: { defaultRowHeight?: number; defaultColWidth?: number; tabColor?: { argb?: string } };
  views?: Array<Record<string, unknown>> | null;
  rows: Map<number, NativeRow>;
  columns: Map<number, NativeColumn>;
  merges: string[];
  autoFilter?: unknown;
  images: Array<{ imageId: number; range: NativeImageAnchor }>;
};
export type NativeWorkbookData = {
  properties: { date1904?: boolean };
  calcProperties: { fullCalcOnLoad: boolean };
  views?: Array<Record<string, unknown>> | null;
  sheets: NativeSheetData[];
  images: NativeImage[];
};
