<script setup lang="ts">
import { computed, ref, useId } from "vue";
import {
  Collapse as TCollapse,
  CollapsePanel as TCollapsePanel,
} from "tdesign-vue-next/es/collapse";
const props = withDefaults(defineProps<{ title: string; initiallyOpen?: boolean }>(), {
  initiallyOpen: false,
});
const open = ref(props.initiallyOpen);
const contentId = `format-section-${useId()}`;
const expanded = computed({
  get: () => (open.value ? [contentId] : []),
  set: (values: (string | number)[]) => {
    open.value = values.includes(contentId);
  },
});
defineExpose({
  expand: () => {
    open.value = true;
  },
});
</script>
<template>
  <section class="format-section">
    <TCollapse
      class="sheetcraft-collapse--format-section"
      v-model="expanded"
      borderless
      :expand-on-row-click="true"
    >
      <TCollapsePanel :value="contentId" :destroy-on-collapse="false">
        <template #header>
          <button
            type="button"
            class="format-section__heading"
            :aria-expanded="open"
            :aria-controls="contentId"
            :title="title"
          >
            {{ title }}
          </button>
        </template>
        <template v-if="$slots.control" #headerRightContent>
          <div class="format-section__control"><slot name="control" /></div>
        </template>
        <div :id="contentId" class="format-section__body"><slot /></div>
      </TCollapsePanel>
    </TCollapse>
  </section>
</template>
<style scoped lang="scss">
@use "../tabs/tab-label";

.format-section {
  &__heading {
    @include tab-label.label;
  }
  &__control {
    width: 132px;
    min-width: 0;
  }
  &__body {
    display: grid;
    gap: 6px;
  }
}
</style>
