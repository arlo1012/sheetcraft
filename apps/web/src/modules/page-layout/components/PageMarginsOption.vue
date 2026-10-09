<script setup lang="ts">
import { computed } from "vue";
import { Star } from "lucide-vue-next";
import type { SheetCustomPaperSize } from "@sheetcraft/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import type { PageMargins } from "../page-margin-presets";

const props = defineProps<{
  label: string;
  margins: PageMargins;
  paper: SheetCustomPaperSize;
  checked: boolean;
  custom?: boolean;
}>();
const emit = defineEmits<{ select: [] }>();
const { t, locale } = useAppI18n();
const formatter = computed(() => new Intl.NumberFormat(locale.value, { maximumFractionDigits: 2 }));
function points(value: number): string {
  return `${formatter.value.format((value * 72) / 25.4)} ${t("dimensionUnits.pt")}`;
}
const preview = computed(() => {
  const ratio = Math.min(32 / props.paper.width, 44 / props.paper.height);
  const width = props.paper.width * ratio;
  const height = props.paper.height * ratio;
  const x = (44 - width) / 2;
  const y = (52 - height) / 2;
  return {
    x,
    y,
    width,
    height,
    left: x + Math.min(props.margins.left * ratio, width),
    right: x + Math.max(0, width - props.margins.right * ratio),
    top: y + Math.min(props.margins.top * ratio, height),
    bottom: y + Math.max(0, height - props.margins.bottom * ratio),
  };
});
</script>

<template>
  <MenuItem role="menuitemradio" :aria-checked="checked" @select="emit('select')">
    <span class="page-margins-option">
      <span
        class="page-margins-option__preview"
        :class="{ 'page-margins-option__preview--selected': checked }"
        aria-hidden="true"
      >
        <svg viewBox="0 0 44 52" class="page-margins-option__paper">
          <rect :x="preview.x" :y="preview.y" :width="preview.width" :height="preview.height" />
          <path
            :d="`M ${preview.left} ${preview.y} V ${preview.y + preview.height} M ${preview.right} ${preview.y} V ${preview.y + preview.height} M ${preview.x} ${preview.top} H ${preview.x + preview.width} M ${preview.x} ${preview.bottom} H ${preview.x + preview.width}`"
          />
        </svg>
        <Star v-if="custom" class="page-margins-option__custom" />
      </span>
      <span class="page-margins-option__details">
        <span class="page-margins-option__name">{{ label }}</span>
        <span class="page-margins-option__values">
          <span>{{ t("pageTools.marginTopLabel") }}: {{ points(margins.top) }}</span>
          <span>{{ t("pageTools.marginBottomLabel") }}: {{ points(margins.bottom) }}</span>
          <span>{{ t("pageTools.marginLeftLabel") }}: {{ points(margins.left) }}</span>
          <span>{{ t("pageTools.marginRightLabel") }}: {{ points(margins.right) }}</span>
          <span>{{ t("pageTools.marginHeaderLabel") }}: {{ points(margins.header) }}</span>
          <span>{{ t("pageTools.marginFooterLabel") }}: {{ points(margins.footer) }}</span>
        </span>
      </span>
    </span>
  </MenuItem>
</template>

<style scoped lang="scss">
.page-margins-option {
  display: flex;
  align-items: center;
  gap: var(--sheetcraft-space-2);
  padding-block: var(--sheetcraft-space-2);

  &__preview {
    position: relative;
    display: grid;
    place-items: center;
    flex: 0 0 44px;
    width: 44px;
    height: 64px;

    &--selected {
      background: var(--sheetcraft-surface-hover);
    }
  }

  &__paper {
    width: 44px;
    height: 52px;
    rect {
      fill: var(--sheetcraft-surface-panel);
      stroke: var(--sheetcraft-text-primary);
      stroke-width: 1;
    }
    path {
      fill: none;
      stroke: var(--sheetcraft-action-primary);
      stroke-width: 0.75;
    }
  }

  &__custom {
    position: absolute;
    right: 0;
    bottom: 2px;
    width: 18px;
    height: 18px;
    fill: var(--sheetcraft-surface-panel);
    stroke: var(--sheetcraft-text-primary);
  }

  &__details {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--sheetcraft-space-1);
  }

  &__name {
    font-weight: 500;
  }

  &__values {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--sheetcraft-space-4);
    row-gap: var(--sheetcraft-space-1);
    font-variant-numeric: tabular-nums;
  }
}
</style>
