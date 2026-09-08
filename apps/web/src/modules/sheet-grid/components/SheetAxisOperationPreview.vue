<script setup lang="ts">
import type { SheetDimensionAxis } from "@idea10/core/workbook";
import type { Size } from "@idea10/sheet-engine/geometry";

defineProps<{
  axis: SheetDimensionAxis;
  offset: number;
  headerSize: Size;
  viewportSize: Size;
  label: string;
}>();
</script>

<template>
  <div class="sheet-axis-operation-preview" aria-hidden="true">
    <div
      class="sheet-axis-operation-preview__line"
      :class="{ 'is-row': axis === 'row' }"
      :style="
        axis === 'row'
          ? {
              left: `${headerSize.width}px`,
              top: `${headerSize.height + offset}px`,
              width: `${viewportSize.width}px`,
            }
          : {
              left: `${headerSize.width + offset}px`,
              top: `${headerSize.height}px`,
              height: `${viewportSize.height}px`,
            }
      "
    />
    <div
      class="sheet-axis-operation-preview__label"
      :style="
        axis === 'row'
          ? {
              left: `${headerSize.width + 8}px`,
              top: `${headerSize.height + Math.min(offset + 6, Math.max(0, viewportSize.height - 28))}px`,
            }
          : {
              left: `${headerSize.width + Math.min(offset + 6, Math.max(0, viewportSize.width - 180))}px`,
              top: `${headerSize.height + 8}px`,
            }
      "
    >
      {{ label }}
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-axis-operation-preview {
  position: absolute;
  inset: 0;
  z-index: 7;
  overflow: hidden;
  pointer-events: none;

  &__line {
    position: absolute;
    width: 2px;
    background: var(--idea-action-primary);
    &.is-row {
      width: auto;
      height: 2px;
    }
  }

  &__label {
    position: absolute;
    padding: 4px 7px;
    border: 1px solid var(--idea-action-primary);
    border-radius: var(--idea-radius-small);
    background: var(--idea-surface-panel);
    color: var(--idea-action-primary);
    font-size: 12px;
    white-space: nowrap;
  }
}
</style>
