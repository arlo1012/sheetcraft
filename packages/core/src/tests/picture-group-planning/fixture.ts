import { createTestWorkbookSession } from "../helpers.js";
import { getActiveSheet } from "../../workbook.js";
import { createPictureSheetMetrics } from "../../picture-axis-metrics.js";
import type { FramedFloatingImage } from "../../picture-object.js";
import { groupPictureRoots } from "../../picture-group-planning.js";
import { isPictureGroup } from "../../picture-group.js";

export function picture(id: string, x: number, angleDeg = 0): FramedFloatingImage {
  return {
    id,
    assetId: `asset-${id}`,
    altText: id,
    frame: {
      kind: "object-frame-v1",
      anchor: { mode: "fixed", x, y: 74, size: { width: 216, height: 144 } },
      angleDeg,
      source: { widthRatio: 1.2, heightRatio: 0.8, offsetXRatio: -0.2, offsetYRatio: 0.3 },
      flipHorizontal: true,
    },
    transform: { appearance: { opacity: 0.5 } },
  };
}
export function fixture() {
  const session = createTestWorkbookSession();
  const sheet = getActiveSheet(session.workbook);
  sheet.floatingImages = [picture("a", 194, 37), picture("middle", 450), picture("b", 600)];
  return { session, sheet, metrics: createPictureSheetMetrics(sheet) };
}
export function groupedFixture() {
  const f = fixture();
  f.sheet.floatingImages = groupPictureRoots(
    f.sheet.floatingImages,
    ["a", "b"],
    { id: "group", altText: "Synthetic group" },
    f.metrics,
  );
  const group = f.sheet.floatingImages.find(isPictureGroup)!;
  return { ...f, group };
}
