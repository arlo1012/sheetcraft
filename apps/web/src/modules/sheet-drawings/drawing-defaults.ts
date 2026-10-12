import type { CellAddress } from "@sheetcraft/core/workbook";
import type { SheetGraphicDrawing, SheetGraphicKind } from "@sheetcraft/core/sheet-drawings";
/** One initial graphic contract shared by dialog and direct canvas creation. */
export function createGraphicDrawing(
  id: string,
  kind: SheetGraphicKind,
  name: string,
  anchor: CellAddress,
  direction?: "horizontal" | "vertical",
): SheetGraphicDrawing {
  return {
    id: id,
    kind,
    name: name,
    anchor: { ...anchor },
    offsetX: 8,
    offsetY: 8,
    width: kind === "icon" ? 80 : 240,
    height: kind === "icon" ? 80 : 120,
    text:
      kind === "equation"
        ? "x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}"
        : kind === "textBox" || kind === "wordArt"
          ? name
          : "",
    shape: kind === "icon" ? "star" : "rectangle",
    ...(kind === "shape" ? { shapeGeometry: { preset: "rect" as const } } : {}),
    ...(kind === "textBox" && direction === "vertical"
      ? { textDirection: "vertical" as const }
      : {}),
    fill: kind === "shape" || kind === "icon" ? "#dbeafe" : "transparent",
    stroke: "#2563eb",
    strokeWidth: kind === "textBox" ? 0 : 1,
    color: "#1e3a8a",
    fontSize: kind === "wordArt" ? 36 : 20,
    bold: kind === "wordArt",
    italic: false,
    rotation: 0,
  };
}
