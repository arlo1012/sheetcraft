import type { CellTextSpan } from "../cell-text-spans";
import type { CSSProperties } from "vue";
import type { CellNumberFormatPresentation } from "@idea10/core/number-format";
import type { CellAddress, ImageTransform } from "@idea10/core/workbook";
import type { Rect } from "@idea10/sheet-engine/geometry";
import type { FormulaValue } from "@idea10/core/formula";
import type { CellStyle } from "@idea10/core/style";

export type VisibleCellPaneId = "topLeft" | "top" | "left" | "body";

export type VisibleCell = {
  key: string;
  paneId: VisibleCellPaneId;
  address: CellAddress;
  rect: Rect;
  viewportTop: number;
  viewportHeight: number;
  text: string;
  displayText: string;
  value: FormulaValue;
  formatStyle?: Readonly<CellStyle>;
  textSpan?: CellTextSpan;
  spanning?: boolean;
  fill?: CellNumberFormatPresentation["fill"];
  image?: { assetId: string; altText: string; transform?: ImageTransform };
  imageTransformKey: string;
  multiline: boolean;
  wrapped: boolean;
  selected?: boolean;
  active?: boolean;
  editing?: boolean;
  style: CSSProperties;
};
