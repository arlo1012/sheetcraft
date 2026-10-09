<script setup lang="ts">
import { computed } from "vue";
import { PAGE_PAPER_SIZES_MM, type SheetPaperSize } from "@sheetcraft/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { PAGE_PAPER_LABELS } from "../page-paper-labels";

const props = defineProps<{
  paperSize: Exclude<SheetPaperSize, "custom">;
  checked: boolean;
}>();
const emit = defineEmits<{ select: [] }>();
const { t, locale } = useAppI18n();
const paper = computed(() => PAGE_PAPER_SIZES_MM[props.paperSize]);
const dimensions = computed(() => {
  const formatter = new Intl.NumberFormat(locale.value, { maximumFractionDigits: 1 });
  const points = (mm: number) => `${formatter.format((mm * 72) / 25.4)} ${t("dimensionUnits.pt")}`;
  return `${points(paper.value.width)} × ${points(paper.value.height)}`;
});
</script>

<template>
  <MenuItem
    role="menuitemradio"
    :aria-checked="checked"
    :data-page-paper-size="paperSize"
    @select="emit('select')"
  >
    <span class="page-paper-size-option">
      <span
        class="page-paper-size-option__preview"
        :class="{ 'page-paper-size-option__preview--selected': checked }"
        aria-hidden="true"
      >
        <svg viewBox="0 0 44 44">
          <rect
            :x="(44 - paper.width / 10.5) / 2"
            :y="(44 - paper.height / 10.5) / 2"
            :width="paper.width / 10.5"
            :height="paper.height / 10.5"
          />
        </svg>
      </span>
      <span class="page-paper-size-option__details">
        <span class="page-paper-size-option__name">{{ t(PAGE_PAPER_LABELS[paperSize]) }}</span>
        <span>{{ dimensions }}</span>
      </span>
    </span>
  </MenuItem>
</template>

<style scoped lang="scss">
.page-paper-size-option {
  display: flex;
  align-items: center;
  gap: var(--sheetcraft-space-2);
  min-height: 48px;

  &__preview {
    display: grid;
    place-items: center;
    flex: 0 0 44px;
    width: 44px;
    height: 44px;

    &--selected {
      background: var(--sheetcraft-surface-hover);
    }

    svg {
      width: 44px;
      height: 44px;
      fill: var(--sheetcraft-surface-panel);
      stroke: var(--sheetcraft-text-primary);
      stroke-width: 1;
    }
  }

  &__details {
    display: flex;
    flex-direction: column;
    line-height: var(--sheetcraft-line-height-body-medium);
  }

  &__name {
    font-weight: 500;
  }
}
</style>
