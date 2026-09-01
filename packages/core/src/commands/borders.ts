import { isCellAddressInBounds, type CellAddress } from "../workbook.js";
import type { CellStylePatch } from "../style.js";

export type CellBorderSide = "borderTop" | "borderRight" | "borderBottom" | "borderLeft";
export type CellBorderPatch = Pick<CellStylePatch, CellBorderSide>;

const CELL_BORDER_SIDES = [
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
] as const satisfies readonly CellBorderSide[];

const OPPOSITE_CELL_BORDER_SIDES: Record<CellBorderSide, CellBorderSide> = {
  borderTop: "borderBottom",
  borderRight: "borderLeft",
  borderBottom: "borderTop",
  borderLeft: "borderRight",
};

export function getCellBorderTargetKey(address: CellAddress): string {
  return `${address.row}:${address.column}`;
}

function getNeighborAddress(address: CellAddress, side: CellBorderSide): CellAddress | undefined {
  const offset =
    side === "borderTop"
      ? { row: -1, column: 0 }
      : side === "borderRight"
        ? { row: 0, column: 1 }
        : side === "borderBottom"
          ? { row: 1, column: 0 }
          : { row: 0, column: -1 };
  const neighbor = { row: address.row + offset.row, column: address.column + offset.column };
  return isCellAddressInBounds(neighbor) ? neighbor : undefined;
}

function hasMatchingCellBorder(
  left: CellStylePatch[CellBorderSide],
  right: CellStylePatch[CellBorderSide],
): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  return left.style === right.style && left.color === right.color;
}

function hasCellBorder(value: CellStylePatch[CellBorderSide]): boolean {
  return Boolean(value && typeof value === "object");
}

export function getExplicitCellBorderPatch(style: CellStylePatch): CellBorderPatch {
  const patch: CellBorderPatch = {};
  for (const side of CELL_BORDER_SIDES) {
    if (side in style) Object.assign(patch, { [side]: style[side] });
  }
  return patch;
}

export function getExactCellBorderPatch(
  style: { [Key in CellBorderSide]?: CellStylePatch[Key] } | undefined,
): CellBorderPatch {
  return {
    borderTop: style?.borderTop ?? null,
    borderRight: style?.borderRight ?? null,
    borderBottom: style?.borderBottom ?? null,
    borderLeft: style?.borderLeft ?? null,
  };
}

export function reconcileCellBorderTargets(
  targets: ReadonlyMap<string, { address: CellAddress; patch: CellBorderPatch }>,
  addPatch: (address: CellAddress, patch: CellStylePatch) => void,
): void {
  const processedEdges = new Set<string>();
  for (const target of targets.values()) {
    for (const side of CELL_BORDER_SIDES) {
      if (!(side in target.patch)) continue;
      const neighbor = getNeighborAddress(target.address, side);
      if (!neighbor) continue;
      const oppositeSide = OPPOSITE_CELL_BORDER_SIDES[side];
      const ownerAddress =
        side === "borderTop" || side === "borderLeft" ? neighbor : target.address;
      const ownerSide = side === "borderTop" || side === "borderLeft" ? oppositeSide : side;
      const edgeKey = `${getCellBorderTargetKey(ownerAddress)}:${ownerSide}`;
      if (processedEdges.has(edgeKey)) continue;
      processedEdges.add(edgeKey);

      const ownerTarget = targets.get(getCellBorderTargetKey(ownerAddress));
      const fallbackAddress = getNeighborAddress(ownerAddress, ownerSide);
      if (!fallbackAddress) continue;
      const fallbackSide = OPPOSITE_CELL_BORDER_SIDES[ownerSide];
      const fallbackTarget = targets.get(getCellBorderTargetKey(fallbackAddress));
      const ownerBorder = ownerTarget?.patch[ownerSide];
      const fallbackBorder = fallbackTarget?.patch[fallbackSide];
      const winnerIsOwner =
        hasCellBorder(ownerBorder) ||
        (!hasCellBorder(fallbackBorder) &&
          !(fallbackTarget && fallbackSide in fallbackTarget.patch));
      const winnerSide = winnerIsOwner ? ownerSide : fallbackSide;
      const winnerBorder = winnerIsOwner ? ownerBorder : fallbackBorder;
      const loserAddress = winnerIsOwner ? fallbackAddress : ownerAddress;
      const loserSide = OPPOSITE_CELL_BORDER_SIDES[winnerSide];
      const intendedLoserBorder = targets.get(getCellBorderTargetKey(loserAddress))?.patch[
        loserSide
      ];
      if (hasMatchingCellBorder(winnerBorder, intendedLoserBorder)) continue;
      addPatch(loserAddress, { [loserSide]: null });
    }
  }
}
