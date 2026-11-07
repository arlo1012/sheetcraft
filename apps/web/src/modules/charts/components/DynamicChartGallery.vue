<script setup lang="ts">
import { computed, ref } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { useAppI18n } from "../../../shared/i18n";
import OptionList from "../../../shared/option-list/OptionList.vue";
import DynamicChartThumbnail from "./DynamicChartThumbnail.vue";
import {
  dynamicChartFamilies,
  galleryTypeLabel,
  templatesFor,
  type DynamicChartFamily,
} from "../dynamic-chart-gallery";
import type { DynamicChartTemplate } from "../chart-design-intents";
const emit = defineEmits<{ close: []; choose: [template: DynamicChartTemplate] }>();
const { t } = useAppI18n();
const family = ref<DynamicChartFamily>("column");
const choices = computed(() =>
  dynamicChartFamilies.map((value) => ({ value, label: t(galleryTypeLabel(value)) })),
);
const templates = computed(() => templatesFor(family.value));
</script>
<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('chart.dynamic')"
    :header="t('chart.dynamic')"
    visible
    width="min(940px, calc(100vw - 32px))"
    :footer="false"
    :close-on-overlay-click="false"
    @close="emit('close')"
  >
    <div class="dynamic-gallery">
      <OptionList
        :model-value="family"
        :options="choices"
        :label="t('chart.type')"
        variant="navigation"
        @select="family = $event"
      />
      <section class="dynamic-gallery__content">
        <h3>{{ t(galleryTypeLabel(family)) }}</h3>
        <p>{{ t("chart.templateHint") }}</p>
        <div class="dynamic-gallery__cards">
          <button
            v-for="template in templates"
            :key="template.style"
            type="button"
            @click="emit('choose', template)"
          >
            <DynamicChartThumbnail :template="template" />
            <span
              >{{ t(galleryTypeLabel(template.type)) }} ·
              {{ t(`chart.style.${template.style}`) }}</span
            >
          </button>
        </div>
      </section>
    </div>
  </Dialog>
</template>
<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;
.dynamic-gallery {
  display: grid;
  grid-template-columns: minmax(110px, 16%) minmax(0, 1fr);
  gap: 16px;
  height: min(535px, calc(100dvh - 158px));
  min-height: 180px;
  &__content {
    min-width: 0;
    overflow: auto;
    padding: 4px;
  }
  h3 {
    margin: 0;
    font-size: 16px;
  }
  p {
    margin: 6px 0 16px;
    color: var(--sheetcraft-text-secondary);
  }
  &__cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    align-content: start;
  }
  &__cards button {
    @include gallery.choice(0);
    min-width: 0;
    border: 1px solid var(--sheetcraft-border-subtle);
    text-align: start;
    overflow: hidden;
  }

  button span {
    display: block;
    padding: 8px 10px;
    font-weight: 500;
  }
  @media (max-width: 700px) {
    &__cards {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
}
</style>
