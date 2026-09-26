import type { SheetDimensionAxis } from "@idea10/core/workbook";
import type { HeaderPane } from "./rendering/sheet-render-frame";

export const OUTLINE_LEVEL_STEP = 20;
export const OUTLINE_CONTROL_SIZE = 16;
export const OUTLINE_CONTROL_INSET = 2;

export type OutlineGroup = Readonly<{
  id: string;
  axis: SheetDimensionAxis;
  start: number;
  end: number;
  collapsed: boolean;
}>;

type OutlineTrack = Readonly<{
  group: OutlineGroup;
  lane: number;
  offset: number;
  length: number;
  start: boolean;
  end: boolean;
  button: boolean;
  buttonAtStart: boolean;
}>;

/** Reserve the same spacing on both axes, including the expand-all level. */
export function getOutlineGutterSize(depth: number): number {
  return depth > 0 ? (depth + 1) * OUTLINE_LEVEL_STEP + OUTLINE_CONTROL_INSET * 2 : 0;
}

export function getOutlineParents(group: OutlineGroup, groups: readonly OutlineGroup[]) {
  return groups.filter(
    (candidate) =>
      candidate.axis === group.axis &&
      candidate.id !== group.id &&
      candidate.start <= group.start &&
      candidate.end >= group.end,
  );
}

/** Axis-neutral tracks; the Vue overlay projects these horizontally or vertically. */
export function createOutlinePanes(
  axis: SheetDimensionAxis,
  panes: readonly HeaderPane[],
  groups: readonly OutlineGroup[],
  subtotalSummaryBelow: Readonly<Record<string, boolean>> = {},
) {
  const items = panes.flatMap((pane) => pane.items).sort((a, b) => a.index - b.index);
  const visibleGroups = groups
    .filter((group) => group.axis === axis)
    .flatMap((group) => {
      const parents = getOutlineParents(group, groups);
      if (parents.some((parent) => parent.collapsed)) return [];
      const separator = group.id.lastIndexOf("-group-");
      const summaryBelow =
        axis === "row" && separator > 0
          ? subtotalSummaryBelow[group.id.slice(0, separator)]
          : undefined;
      const summaryIndex =
        summaryBelow === undefined ? undefined : summaryBelow ? group.end + 1 : group.start - 1;
      const previous = group.collapsed
        ? [...items].reverse().find((item) => item.index < group.start)
        : undefined;
      const anchor =
        summaryIndex !== undefined
          ? items.find((item) => item.index === summaryIndex)
          : group.collapsed
            ? (previous ?? items.find((item) => item.index > group.end))
            : items.find((item) => item.index === group.end);
      const buttonOffset = anchor
        ? summaryIndex !== undefined
          ? anchor.offset + (anchor.size - OUTLINE_CONTROL_SIZE) / 2
          : group.collapsed && !previous
            ? anchor.offset + OUTLINE_CONTROL_INSET
            : anchor.offset + anchor.size - OUTLINE_CONTROL_SIZE - OUTLINE_CONTROL_INSET
        : undefined;
      return [
        {
          group,
          lane: OUTLINE_CONTROL_INSET + parents.length * OUTLINE_LEVEL_STEP,
          summaryIndex,
          summaryBelow,
          anchor,
          buttonOffset,
        },
      ];
    });

  return panes.flatMap((pane) => {
    const offset = axis === "row" ? pane.clip.y : pane.clip.x;
    const size = axis === "row" ? pane.clip.height : pane.clip.width;
    if (size <= 0) return [];
    const tracks = visibleGroups.flatMap(
      ({ group, lane, summaryIndex, summaryBelow, anchor, buttonOffset }): OutlineTrack[] => {
        const button = anchor !== undefined && pane.items.includes(anchor);
        if (group.collapsed) {
          return button && buttonOffset !== undefined
            ? [
                {
                  group,
                  lane,
                  offset: buttonOffset - offset,
                  length: OUTLINE_CONTROL_SIZE,
                  start: false,
                  end: false,
                  button: true,
                  buttonAtStart: false,
                },
              ]
            : [];
        }
        const firstIndex = Math.min(group.start, summaryIndex ?? group.start);
        const lastIndex = Math.max(group.end, summaryIndex ?? group.end);
        const fragment = pane.items.filter(
          (item) => item.index >= firstIndex && item.index <= lastIndex,
        );
        if (!fragment.length) return [];
        const first = fragment[0]!;
        const last = fragment[fragment.length - 1]!;
        const start =
          button && summaryBelow === false ? buttonOffset! : first.offset + OUTLINE_CONTROL_INSET;
        const end = button
          ? summaryBelow === false
            ? last.offset + last.size - OUTLINE_CONTROL_INSET
            : buttonOffset! + OUTLINE_CONTROL_SIZE
          : last.offset + last.size - OUTLINE_CONTROL_INSET;
        return [
          {
            group,
            lane,
            offset: start - offset,
            length: Math.max(OUTLINE_CONTROL_SIZE, end - start),
            start: summaryBelow !== false && first.index === group.start,
            end: summaryBelow === false && last.index === group.end,
            button,
            buttonAtStart: summaryBelow === false,
          },
        ];
      },
    );
    return [{ id: pane.id, offset, size, tracks }];
  });
}
