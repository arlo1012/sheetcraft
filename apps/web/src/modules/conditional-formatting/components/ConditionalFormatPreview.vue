<script setup lang="ts">
import type {
  ConditionalFormatCondition,
  ConditionalFormatStyle,
} from "@idea10/core/conditional-formatting";
import {
  applyConditionalFormatStyle,
  getConditionalFormatIcon,
} from "@idea10/core/conditional-formatting";
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
    text?: string;
    /** Uses the dialog-width visual sample while preserving the manager's compact default. */
    wide?: boolean;
    compact?: boolean;
    /** Insets a formatted text sample inside the standard preview control frame. */
    control?: boolean;
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
const insetColorScale = computed(() => props.wide && props.condition?.kind === "colorScale");
const insetDataBar = computed(() => props.wide && props.condition?.kind === "dataBar");
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
  () => props.text ?? numberPresentation.value?.text ?? t("conditionalFormatting.preview"),
);

function setDimensions(): void {
  if (!canvas.value) return;
  dimensions.value =
    props.iconIndex !== undefined
      ? { width: 24, height: 24 }
      : props.wide
        ? {
            width: Math.max(120, Math.round(canvas.value.clientWidth)),
            height: insetDataBar.value ? 22 : 40,
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
  void insetDataBar.value;
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
    const axis = condition.axisPosition === "middle" ? 0.5 : 0;
    const end = axis + (1 - axis) * 0.9;
    const rtl = condition.direction === "rightToLeft";
    paintConditionalFormatVisual(
      context,
      { x: 0, y: 0, width, height },
      {
        dataBar: {
          start: rtl ? 1 - end : axis,
          end: rtl ? 1 - axis : end,
          axis: rtl ? 1 - axis : axis,
          color: condition.color,
          negativeColor: condition.negativeColor,
          borderColor: condition.borderColor,
          negativeBorderColor: condition.negativeBorderColor,
          direction: condition.direction,
          axisPosition: condition.axisPosition,
          axisColor: condition.axisColor,
          negative: false,
          gradient: condition.gradient !== false,
          showValue: condition.showValue !== false,
        },
      },
    );
  }
  if (condition?.kind === "iconSet") {
    const count = condition.thresholds.length;
    const indexes =
      props.iconIndex === undefined
        ? Array.from({ length: count }, (_, index) => index)
        : [props.iconIndex];
    indexes.forEach((index, position) => {
      const icon = getConditionalFormatIcon(condition, index);
      if (!icon) return;
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
            ...icon,
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
      'conditional-format-preview--color-control': insetColorScale || insetDataBar || control,
      'conditional-format-preview--data-bar': insetDataBar,
    }"
    :style="insetColorScale || control ? undefined : swatchStyle"
    role="img"
    :aria-label="t('conditionalFormatting.preview')"
  >
    <span
      v-if="insetColorScale"
      class="conditional-format-preview__swatch"
      :style="swatchStyle"
      aria-hidden="true"
    />
    <canvas
      v-else-if="visual"
      ref="canvas"
      class="conditional-format-preview__visual"
      aria-hidden="true"
    />
    <span
      v-else-if="condition?.kind !== 'colorScale'"
      :class="{ 'conditional-format-preview__sample': control }"
      :style="control ? swatchStyle : undefined"
      >{{ previewText }}</span
    >
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
    display: flex;
    width: 90px;
    height: 24px;
    border: 0;
  }

  &--color-control {
    box-sizing: border-box;
    height: 28px;
    padding: 0 8px;
    border-color: var(--idea-border-strong);
    border-radius: var(--idea-radius-default);
    background: var(--idea-surface-special);
  }

  &__swatch {
    flex: 1;
    min-width: 0;
    height: 16px;
    border-radius: var(--idea-radius-small);
  }

  &__sample {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-width: 0;
    height: 20px;
  }

  &--data-bar {
    // The canvas painter supplies the remaining 2px of the control's 8px inset.
    padding-inline: 6px;
    .conditional-format-preview__visual {
      height: 22px;
    }
  }

  &--single-icon {
    width: 28px;
    height: 28px;
    .conditional-format-preview__visual {
      width: 24px;
      height: 24px;
    }
    &.conditional-format-preview--compact {
      width: 24px;
      height: 24px;
    }
  }
}
</style>
