<script setup lang="ts">
import type { CellStyleDefinition } from "@idea10/core/cell-styles";
import { computed } from "vue";
import { cellStylePreviewCss } from "../cell-style-presentation";

const props = defineProps<{ style: CellStyleDefinition; label: string }>();
const previewStyle = computed(() => cellStylePreviewCss(props.style.style));
</script>

<template>
  <span class="cell-style-preview" :style="previewStyle" aria-hidden="true">
    <span>{{ label }}</span>
  </span>
</template>

<style scoped lang="scss">
.cell-style-preview {
  display: flex;
  min-width: 0;
  min-height: 24px;
  align-items: center;
  justify-content: flex-start;
  padding: 3px 7px;
  overflow: hidden;
  background: var(--idea-surface-panel);
  color: var(--idea-text-primary);
  font-size: var(--idea-font-size-body-small);
  line-height: 1.2;
  text-align: left;

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
</style>
