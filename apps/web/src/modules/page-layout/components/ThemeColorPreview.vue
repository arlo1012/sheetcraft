<script setup lang="ts">
import { useAppI18n } from "../../../shared/i18n";

defineProps<{
  label: string;
  background: string;
  foreground: string;
  accentColors: readonly string[];
}>();

const { t } = useAppI18n();
const barHeights = [14, 26, 36, 30, 20, 10];
</script>

<template>
  <figure class="theme-color-preview">
    <div
      class="theme-color-preview__sample"
      :style="{ backgroundColor: background, color: foreground }"
    >
      <span>{{ t("pageTools.colorPreviewText") }}</span>
      <div class="theme-color-preview__chart" aria-hidden="true">
        <i
          v-for="(color, index) in accentColors"
          :key="index"
          :style="{ backgroundColor: color, height: `${barHeights[index]}px` }"
        />
      </div>
    </div>
    <figcaption>{{ label }}</figcaption>
  </figure>
</template>

<style scoped lang="scss">
.theme-color-preview {
  display: grid;
  min-width: 0;
  gap: 4px;
  margin: 0;

  &__sample {
    display: flex;
    min-height: 150px;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 12px;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-small);
    font-size: 14px;
    line-height: 22px;
  }

  &__chart {
    display: flex;
    align-items: flex-end;
    width: 100%;
    max-width: 88px;

    i {
      flex: 1;
      border: 1px solid currentColor;

      + i {
        border-left: 0;
      }
    }
  }

  figcaption {
    font-size: 12px;
    line-height: 20px;
  }
}
</style>
