<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Radio as TRadio, RadioGroup as TRadioGroup } from "tdesign-vue-next/es/radio";
import { cloneCellFillGradient, type CellFillGradient } from "@idea10/core/style";
import { getCellFillStyle } from "../../../shared/cell-fill/fill-presentation";
import { useAppI18n } from "../../../shared/i18n";
import CellFormatColorControl from "./CellFormatColorControl.vue";
import {
  buildGradientPreset,
  gradientVariantCount,
  recognizeGradientPreset,
  type GradientPresetStyle,
} from "../fill/gradient-presets";

const DEFAULT_SECOND_COLOR = "#4472c4";
const styleKeys: GradientPresetStyle[] = [
  "horizontal",
  "vertical",
  "diagonalUp",
  "diagonalDown",
  "corner",
  "center",
];

const props = withDefaults(defineProps<{ gradient?: CellFillGradient; defaultColor?: string }>(), {
  defaultColor: "#ffffff",
});
const emit = defineEmits<{
  confirm: [gradient: CellFillGradient];
  cancel: [];
}>();
const { t } = useAppI18n();

const color1 = ref(props.defaultColor);
const color2 = ref(DEFAULT_SECOND_COLOR);
const selectedStyle = ref<GradientPresetStyle>("horizontal");
const selectedVariant = ref(0);
const draft = ref<CellFillGradient>(
  buildGradientPreset("horizontal", 0, color1.value, color2.value),
);

function resetDraft(): void {
  const imported = props.gradient ? cloneCellFillGradient(props.gradient) : undefined;
  const recognized = imported ? recognizeGradientPreset(imported) : undefined;
  color1.value = recognized?.color1 ?? imported?.stops[0]?.color ?? props.defaultColor;
  color2.value =
    recognized?.color2 ??
    imported?.stops.at(-1)?.color ??
    (props.defaultColor.toLowerCase() === DEFAULT_SECOND_COLOR ? "#ffffff" : DEFAULT_SECOND_COLOR);
  selectedStyle.value = recognized?.style ?? "horizontal";
  selectedVariant.value = recognized?.variant ?? 0;
  draft.value = imported ?? buildGradientPreset("horizontal", 0, color1.value, color2.value);
}

function applyPreset(): void {
  draft.value = buildGradientPreset(
    selectedStyle.value,
    selectedVariant.value,
    color1.value,
    color2.value,
  );
}

function selectStyle(style: GradientPresetStyle): void {
  selectedStyle.value = style;
  selectedVariant.value = 0;
  applyPreset();
}

function selectVariant(variant: number): void {
  selectedVariant.value = variant;
  applyPreset();
}

function selectColor1(color: string): void {
  color1.value = color;
  applyPreset();
}

function selectColor2(color: string): void {
  color2.value = color;
  applyPreset();
}

function labelForStyle(style: GradientPresetStyle): string {
  const labels: Record<GradientPresetStyle, string> = {
    horizontal: t("cellFormat.fillHorizontal"),
    vertical: t("cellFormat.fillVertical"),
    diagonalUp: t("cellFormat.fillDiagonalUp"),
    diagonalDown: t("cellFormat.fillDiagonalDown"),
    corner: t("cellFormat.fillFromCorner"),
    center: t("cellFormat.fillFromCenter"),
  };
  return labels[style];
}

const previewStyle = computed(() => getCellFillStyle({ fillGradient: draft.value }));
const variants = computed(() =>
  Array.from({ length: gradientVariantCount(selectedStyle.value) }, (_, variant) => ({
    variant,
    style: getCellFillStyle({
      fillGradient: buildGradientPreset(selectedStyle.value, variant, color1.value, color2.value),
    }),
  })),
);

function confirm(): void {
  emit("confirm", cloneCellFillGradient(draft.value)!);
}

watch(() => props.gradient, resetDraft, { immediate: true });
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('cellFormat.fillEffects')"
    :visible="true"
    :header="t('cellFormat.fillEffects')"
    :confirm-btn="t('cellFormat.confirm')"
    :cancel-btn="t('cellFormat.cancel')"
    :close-on-overlay-click="false"
    :destroy-on-close="true"
    :confirm-on-enter="false"
    width="min(400px, calc(100vw - 32px))"
    placement="center"
    class="cell-format-fill-effects"
    data-cell-format-fill-effects
    @confirm="confirm"
    @close="emit('cancel')"
  >
    <div class="cell-format-fill-effects__body">
      <section
        class="cell-format-fill-effects__colors"
        :aria-label="t('cellFormat.fillEffectsColors')"
      >
        <h3>{{ t("cellFormat.fillEffectsColors") }}</h3>
        <div class="cell-format-fill-effects__color" data-fill-effects-color="1">
          <span>{{ t("cellFormat.fillColor1") }}</span>
          <CellFormatColorControl
            :model-value="color1"
            :default-color="defaultColor"
            :label="t('cellFormat.fillColor1')"
            @select="selectColor1"
          />
        </div>
        <div class="cell-format-fill-effects__color" data-fill-effects-color="2">
          <span>{{ t("cellFormat.fillColor2") }}</span>
          <CellFormatColorControl
            :model-value="color2"
            :default-color="DEFAULT_SECOND_COLOR"
            :label="t('cellFormat.fillColor2')"
            @select="selectColor2"
          />
        </div>
      </section>

      <section
        class="cell-format-fill-effects__style"
        :aria-label="t('cellFormat.fillShadingStyle')"
      >
        <h3>{{ t("cellFormat.fillShadingStyle") }}</h3>
        <TRadioGroup
          :model-value="selectedStyle"
          direction="vertical"
          @change="(value) => selectStyle(value as GradientPresetStyle)"
        >
          <TRadio
            v-for="style in styleKeys"
            :key="style"
            :value="style"
            :data-fill-effects-style="style"
            >{{ labelForStyle(style) }}</TRadio
          >
        </TRadioGroup>
      </section>

      <section
        class="cell-format-fill-effects__variants"
        :aria-label="t('cellFormat.fillVariants')"
      >
        <h3>{{ t("cellFormat.fillVariants") }}</h3>
        <div class="cell-format-fill-effects__variant-list">
          <button
            v-for="item in variants"
            :key="item.variant"
            type="button"
            class="cell-format-fill-effects__variant"
            :class="{
              'cell-format-fill-effects__variant--selected': item.variant === selectedVariant,
            }"
            :style="item.style"
            :aria-label="t('cellFormat.fillVariantLabel', { value: item.variant + 1 })"
            :aria-pressed="item.variant === selectedVariant"
            :data-fill-effects-variant="item.variant"
            @click="selectVariant(item.variant)"
          />
        </div>
      </section>

      <section
        class="cell-format-fill-effects__preview-group"
        :aria-label="t('cellFormat.preview')"
      >
        <h3>{{ t("cellFormat.preview") }}</h3>
        <div
          class="cell-format-fill-effects__preview"
          :style="previewStyle"
          data-fill-effects-preview
        />
      </section>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.cell-format-fill-effects {
  &__body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 16px 20px;
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
  }
  h3 {
    margin: 0;
    font: inherit;
    font-weight: var(--idea-font-weight-semibold);
  }
  &__colors,
  &__style,
  &__variants,
  &__preview-group {
    display: grid;
    align-content: start;
    gap: 4px;
    min-width: 0;
  }
  &__colors {
    grid-column: 1 / -1;
  }
  &__style {
    grid-column: 1;
    grid-row: 2 / span 2;
  }
  &__variants {
    grid-column: 2;
    grid-row: 2;
  }
  &__preview-group {
    grid-column: 2;
    grid-row: 3;
  }
  &__color {
    display: grid;
    grid-template-columns: 56px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
  }
  &__variant-list {
    display: grid;
    grid-template-columns: repeat(2, 48px);
    gap: 8px;
  }
  &__variant {
    width: 48px;
    height: 38px;
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-default);
    background-color: var(--idea-surface-panel);
    cursor: pointer;
    &:hover {
      border-color: var(--idea-action-primary-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--idea-action-focus);
      outline-offset: 2px;
    }
    &--selected {
      border: 2px solid var(--idea-action-primary);
    }
  }
  &__preview {
    height: 68px;
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-default);
  }
}
@media (max-width: 420px) {
  .cell-format-fill-effects {
    &__body {
      grid-template-columns: minmax(0, 1fr);
    }
    &__colors,
    &__style,
    &__variants,
    &__preview-group {
      grid-column: auto;
      grid-row: auto;
    }
  }
}
</style>
