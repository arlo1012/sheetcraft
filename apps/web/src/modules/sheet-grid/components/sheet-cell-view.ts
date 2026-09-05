import type { CSSProperties } from "vue";
import type { CellAddress, ImageTransform } from "@idea10/core/workbook";
import type { Rect } from "@idea10/sheet-engine/geometry";

export type VisibleCellPaneId = "topLeft" | "top" | "left" | "body";

export type VisibleCell = {
  key: string;
  paneId: VisibleCellPaneId;
  address: CellAddress;
  rect: Rect;
  viewportTop: number;
  viewportHeight: number;
  text: string;
  image?: { assetId: string; altText: string; transform?: ImageTransform };
  imageTransformKey: string;
  multiline: boolean;
  wrapped: boolean;
  selected?: boolean;
  active?: boolean;
  editing?: boolean;
  style: CSSProperties;
};
