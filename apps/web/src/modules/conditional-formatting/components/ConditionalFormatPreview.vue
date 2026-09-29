<script setup lang="ts">
import type {
  ConditionalFormatCondition,
  ConditionalFormatStyle,
} from "@idea10/core/conditional-formatting";
import { applyConditionalFormatStyle } from "@idea10/core/conditional-formatting";
import { formatCellNumberValue } from "@idea10/core/number-format";
import type { CellStyle } from "@idea10/core/style";
import { computed, onBeforeUnmount, ref, watchPostEffect } from "vue";
import { getCellBorderCss } from "../../../shared/borders/borderPresentation";
import { getCellFillStyle } from "../../../shared/cell-fill/fill-presentation";
import {
  getCellTextDecorationStyle,
  getCellTextScriptStyle,
  getCellTextTypographyStyle,
} from "../../../shared/cell-text/font-presentation";
import { paintConditionalFormatVisual } from "../../../shared/conditional-formatting/conditional-format-painter";
import { useAppI18n } from "../../../shared/i18n";

const props = withDefaults(
  defineProps<{
    condition?: ConditionalFormatCondition;
    format?: ConditionalFormatStyle;
    /** Uses the dialog-width visual sample while preserving the manager's compact default. */
    wide?: boolean;
    compact?: boolean;
    /** Renders one icon-set glyph for a threshold row instead of the complete icon set. */
    iconIndex?: number;
  }>(),
  { wide: false, iconIndex: undefined },
);
const { t } = useAppI18n();
const canvas = ref<HTMLCanvasElement>();
const visual = computed(
  () => props.condition?.kind === "dataBar" || props.condition?.kind === "iconSet",
);
const dimensions = ref({ width: 90, height: 24 });
let observer: ResizeObserver | undefined;

const effectiveStyle = computed<Readonly<CellStyle> | undefined>(() =>
  applyConditionalFormatStyle(undefined, props.format),
);
const numberPresentation = computed(() => {
  const numberFormat = effectiveStyle.value?.numberFormat;
  return numberFormat ? formatCellNumberValue(1234.5, numberFormat) : undefined;
});
const swatchStyle = computed(() => ({
  ...getCellFillStyle(effectiveStyle.value),
  ...getCellTextTypographyStyle(effectiveStyle.value, { includeDecorations: false }),
  ...getCellTextDecorationStyle(effectiveStyle.value),
  ...getCellTextScriptStyle(effectiveStyle.value),
  ...(effectiveStyle.value?.borderTop
    ? { borderTop: getCellBorderCss(effectiveStyle.value.borderTop) }
    : {}),
  ...(effectiveStyle.value?.borderRight
    ? { borderRight: getCellBorderCss(effectiveStyle.value.borderRight) }
    : {}),
  ...(effectiveStyle.value?.borderBottom
    ? { borderBottom: getCellBorderCss(effectiveStyle.value.borderBottom) }
    : {}),
  ...(effectiveStyle.value?.borderLeft
    ? { borderLeft: getCellBorderCss(effectiveStyle.value.borderLeft) }
    : {}),
  ...(!effectiveStyle.value?.textColor && numberPresentation.value?.color
    ? { color: numberPresentation.value.color }
    : {}),
  ...(props.condition?.kind === "colorScale"
    ? {
        background: `linear-gradient(90deg, ${props.condition.stops.map((stop) => stop.color).join(", ")})`,
      }
    : {}),
}));
const previewText = computed(
  () => numberPresentation.value?.text ?? t("conditionalFormatting.preview"),
);

function setDimensions(): void {
  if (!canvas.value) return;
  dimensions.value =
    props.iconIndex !== undefined
      ? { width: 24, height: 24 }
      : props.wide
        ? {
            width: Math.max(120, Math.round(canvas.value.clientWidth)),
            height: 40,
          }
        : { width: 90, height: 24 };
}

watchPostEffect((cleanup) => {
  const element = canvas.value;
  if (!element || !props.wide || props.iconIndex !== undefined) return;
  observer?.disconnect();
  observer = new ResizeObserver(setDimensions);
  observer.observe(element);
  setDimensions();
  cleanup(() => observer?.disconnect());
});
onBeforeUnmount(() => observer?.disconnect());

watchPostEffect(() => {
  // Recompute fixed variants whenever their props change; this does not observe
  // dimensions, so it cannot create a canvas resize loop.
  void props.wide;
  void props.iconIndex;
  setDimensions();
});

watchPostEffect(() => {
  const element = canvas.value;
  const context = element?.getContext("2d");
  if (!context || !element) return;
  const { width, height } = dimensions.value;
  const ratio = globalThis.devicePixelRatio || 1;
  element.width = width * ratio;
  element.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const condition = props.condition;
  if (condition?.kind === "dataBar") {
    const end = condition.negativeColor ? 0.68 : 0.8;
    paintConditionalFormatVisual(
      context,
      { x: 0, y: 0, width, height },
      {
        dataBar: {
          start: 0,
          end,
          axis: 0,
          color: condition.color,
          negativeColor: condition.negativeColor,
          gradient: condition.gradient !== false,
          showValue: condition.showValue !== false,
        },
      },
    );
    if (props.wide && condition.showValue !== false) {
      context.fillStyle = "#525a65";
      context.font = "12px sans-serif";
      context.textBaseline = "middle";
      context.fillText("80", Math.min(width - 22, width * end + 7), height / 2);
    }
  }
  if (condition?.kind === "iconSet") {
    const count = condition.thresholds.length;
    const indexes =
      props.iconIndex === undefined
        ? Array.from({ length: count }, (_, index) => index)
        : [props.iconIndex];
    indexes.forEach((index, position) => {
      const renderedIndex = condition.reverse ? count - index - 1 : index;
      paintConditionalFormatVisual(
        context,
        {
          x: (position * width) / indexes.length,
          y: 0,
          width: width / indexes.length,
          height,
        },
        {
          iconSet: {
            iconSet: condition.iconSet,
            iconIndex: renderedIndex,
            showValue: condition.showValue !== false,
          },
        },
      );
    });
  }
});
</script>

<template>
  <span
    class="conditional-format-preview"
    :class="{
      'conditional-format-preview--wide': wide,
      'conditional-format-preview--compact': compact,
      'conditional-format-preview--single-icon': iconIndex !== undefined,
    }"
    :style="swatchStyle"
    role="img"
    :aria-label="t('conditionalFormatting.preview')"
  >
    <canvas
      v-if="visual"
      ref="canvas"
      class="conditional-format-preview__visual"
      aria-hidden="true"
    />
    <span v-else-if="condition?.kind !== 'colorScale'">{{ previewText }}</span>
  </span>
</template>

<style scoped lang="scss">
.conditional-format-preview {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 100px;
  height: 30px;
  flex: 0 0 auto;
  border: 1px solid var(--idea-border-subtle);
  border-radius: var(--idea-radius-small);

  &__visual {
    width: 90px;
    height: 24px;
  }

  &--wide {
    width: 100%;
    height: 46px;
    .conditional-format-preview__visual {
      width: 100%;
      height: 40px;
    }
  }

  &--compact {
    width: 90px;
    height: 24px;
    border: 0;
  }

  &--single-icon {
    width: 28px;
    height: 28px;
    .conditional-format-preview__visual {
      width: 24px;
      height: 24px;
    }
  }
}
</style>
