<script setup lang="ts">
import { computed } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { useWorkbookTheme } from "../../../shared/color/workbook-theme-context";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import type { SparklineToolContext } from "../useSparklineTools";
import {
  getSparklineStylePresets,
  matchesSparklineStyle,
  sparklineStylePatch,
  type SparklineStylePreset,
} from "../sparkline-style-presets";
import SparklineStylePreview from "./SparklineStylePreview.vue";

const props = defineProps<{ context: SparklineToolContext }>();
const emit = defineEmits<{ failed: [] }>();
const { t } = useAppI18n();
const theme = useWorkbookTheme();
const presets = computed(() => getSparklineStylePresets(theme?.value));
const select = computed(() => {
  const owner = props.context;
  return (preset: SparklineStylePreset) => {
    if (owner !== props.context || owner.disabled) return;
    if (!owner.apply(sparklineStylePatch(preset))) emit("failed");
  };
});
</script>
<template>
  <GallerySection inline>
    <div class="sparkline-style-gallery" role="group" :aria-label="t('sparkline.styles')">
      <button
        v-for="preset in presets"
        :key="preset.id"
        type="button"
        :aria-label="t('sparkline.themeStyle', { index: preset.id })"
        :title="t('sparkline.themeStyle', { index: preset.id })"
        :aria-pressed="matchesSparklineStyle(context.value, context.mixed, preset)"
        :disabled="context.disabled"
        @click="select(preset)"
      >
        <SparklineStylePreview :definition="{ ...context.value, ...sparklineStylePatch(preset) }" />
      </button>
    </div>
  </GallerySection>
</template>
<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;
.sparkline-style-gallery {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 2px;
  border: 1px solid var(--sheetcraft-border-subtle);
  border-radius: var(--sheetcraft-radius-small);
  button {
    @include gallery.choice;
  }
}
</style>
