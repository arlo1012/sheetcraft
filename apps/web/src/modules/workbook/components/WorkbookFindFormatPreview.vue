<script setup lang="ts">
import { computed } from "vue";
import { formatCellNumberValue } from "@sheetcraft/core/number-format";
import type { CellBorder, CellStyle } from "@sheetcraft/core/style";
import type { SheetSearchFormat } from "@sheetcraft/core/search";
import { getBorderLinePresentation } from "../../../shared/borders/borderPresentation";
import { getCellFillStyle } from "../../../shared/cell-fill/fill-presentation";
import {
  getCellTextDecorationStyle,
  getCellTextScriptStyle,
  getCellTextTypographyStyle,
} from "../../../shared/cell-text/font-presentation";
import { useAppI18n } from "../../../shared/i18n";

type BorderSide =
  | "borderTop"
  | "borderRight"
  | "borderBottom"
  | "borderLeft"
  | "borderDiagonalUp"
  | "borderDiagonalDown";

type PreviewBorderLine = {
  key: string;
  border: CellBorder;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
  dashArray?: string;
  lineCap: "butt" | "round";
};

const props = withDefaults(
  defineProps<{
    format?: SheetSearchFormat;
    /** Brief criterion summary, shown through the native tooltip. */
    title?: string;
    /** Allows the owner to supply its localized unset-format text. */
    emptyLabel?: string;
  }>(),
  { title: undefined, emptyLabel: undefined },
);
const { t } = useAppI18n();

const style = computed<CellStyle | undefined>(() => props.format?.style);
const hasFormat = computed(() => Boolean(props.format?.keys.length));
const emptyLabel = computed(() => props.emptyLabel ?? t("navigation.findFormatUnset"));
const numberPresentation = computed(() => {
  const numberFormat = style.value?.numberFormat;
  return numberFormat ? formatCellNumberValue(1234.5, numberFormat) : undefined;
});
const previewText = computed(() => numberPresentation.value?.text ?? "Aa 123");
const previewTextStyle = computed(() => ({
  ...getCellTextTypographyStyle(style.value, { includeDecorations: false }),
  ...getCellTextDecorationStyle(style.value),
  ...getCellTextScriptStyle(style.value),
  ...(numberPresentation.value?.color ? { color: numberPresentation.value.color } : {}),
}));
const previewFrameStyle = computed(() => getCellFillStyle(style.value));

const BORDER_COORDINATES: Record<BorderSide, readonly [number, number, number, number]> = {
  borderTop: [1, 1, 99, 1],
  borderRight: [99, 1, 99, 51],
  borderBottom: [1, 51, 99, 51],
  borderLeft: [1, 1, 1, 51],
  borderDiagonalUp: [1, 51, 99, 1],
  borderDiagonalDown: [1, 1, 99, 51],
};
const BORDER_SIDES: readonly BorderSide[] = [
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "borderDiagonalUp",
  "borderDiagonalDown",
];

function offsetCoordinates(
  side: BorderSide,
  offset: number,
): readonly [number, number, number, number] {
  const [x1, y1, x2, y2] = BORDER_COORDINATES[side];
  const length = Math.hypot(x2 - x1, y2 - y1);
  const normalX = -(y2 - y1) / length;
  const normalY = (x2 - x1) / length;
  return [
    x1 + normalX * offset,
    y1 + normalY * offset,
    x2 + normalX * offset,
    y2 + normalY * offset,
  ];
}

const borderLines = computed<PreviewBorderLine[]>(() => {
  const lines: PreviewBorderLine[] = [];
  for (const side of BORDER_SIDES) {
    const border = style.value?.[side];
    if (!border) continue;
    const presentation = getBorderLinePresentation(border.style);
    for (const offset of presentation.offsets) {
      const [x1, y1, x2, y2] = offsetCoordinates(side, offset);
      lines.push({
        key: `${side}-${offset}`,
        border,
        x1,
        y1,
        x2,
        y2,
        strokeWidth: presentation.strokeWidth,
        dashArray: presentation.dashArray,
        lineCap: presentation.lineCap,
      });
    }
  }
  return lines;
});
</script>

<template>
  <div
    class="workbook-find-format-preview"
    :class="{ 'is-unset': !hasFormat }"
    :title="title"
    :aria-label="title ?? (hasFormat ? previewText : emptyLabel)"
  >
    <span v-if="!hasFormat" class="workbook-find-format-preview__empty">{{ emptyLabel }}</span>
    <template v-else>
      <span class="workbook-find-format-preview__sample" :style="previewFrameStyle">
        <span class="workbook-find-format-preview__text" :style="previewTextStyle">{{
          numberPresentation ? previewText : t("navigation.findFormatPreview")
        }}</span>
        <svg
          v-if="borderLines.length"
          class="workbook-find-format-preview__borders"
          viewBox="0 0 100 52"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line
            v-for="line in borderLines"
            :key="line.key"
            :x1="line.x1"
            :y1="line.y1"
            :x2="line.x2"
            :y2="line.y2"
            :stroke="line.border.color"
            :stroke-width="line.strokeWidth"
            :stroke-dasharray="line.dashArray"
            :stroke-linecap="line.lineCap"
            vector-effect="non-scaling-stroke"
          />
        </svg>
      </span>
    </template>
  </div>
</template>

<style scoped lang="scss">
.workbook-find-format-preview {
  display: flex;
  align-items: center;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 28px;
  overflow: hidden;
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-default);
  background: var(--td-bg-color-container);
  color: var(--sheetcraft-text-primary);
  font-size: var(--sheetcraft-font-size-body-small);

  &.is-unset {
    color: var(--sheetcraft-text-secondary);
  }
  &__empty {
    display: grid;
    flex: 1;
    place-items: center;
    padding-inline: var(--sheetcraft-space-2);
  }
  &__sample {
    position: relative;
    display: grid;
    flex: 1;
    place-items: center;
    min-width: 0;
    height: 100%;
    overflow: hidden;
    border-radius: inherit;
    padding: 3px var(--sheetcraft-space-2);
    white-space: nowrap;
  }
  &__text {
    position: relative;
    z-index: 1;
    overflow: hidden;
    max-width: 100%;
    text-overflow: ellipsis;
  }
  &__borders {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }
}
</style>
