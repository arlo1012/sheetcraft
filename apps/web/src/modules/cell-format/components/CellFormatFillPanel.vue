<script setup lang="ts">
import type { CellStylePatch } from "@idea10/core/style";
import type { SelectionCellStyleState } from "@idea10/core/style-state";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{
  state: SelectionCellStyleState;
  patch: CellStylePatch;
  sampleValue: string | number | boolean | null;
}>();
const emit = defineEmits<{ "update:patch": [patch: CellStylePatch] }>();
const { t } = useAppI18n();
function fillColor(): string | null {
  return (
    ((Object.hasOwn(props.patch, "fillColor")
      ? props.patch.fillColor
      : props.state.fillColor.value) as string | null | undefined) ?? null
  );
}
function setColor(color: string | null): void {
  emit("update:patch", { fillColor: color ?? null });
}
</script>
<template>
  <section class="cell-format-fill" :aria-label="t('cellFormat.fill')">
    <div class="cell-format-fill__palette">
      <span>{{ t("format.fillColor") }}</span
      ><ColorPalette
        :model-value="fillColor()"
        default-color="#ffffff"
        :default-label="t('cellFormat.noFill')"
        :mixed="!Object.hasOwn(patch, 'fillColor') && state.fillColor.mixed"
        @select="setColor"
      />
    </div>
    <p
      class="cell-format-fill__preview"
      :style="{ backgroundColor: fillColor() ?? '#ffffff' }"
      data-cell-format-fill-preview
    >
      {{ sampleValue ?? t("cellFormat.previewText") }}
    </p>
  </section>
</template>
<style scoped lang="scss">
.cell-format-fill {
  display: grid;
  gap: 20px;
  padding: 8px 4px;
  &__palette {
    display: grid;
    grid-template-columns: 120px minmax(0, 1fr);
    gap: 12px;
    align-items: start;
    color: var(--idea-text-secondary);
    font-size: 13px;
  }
  &__preview {
    display: grid;
    place-items: center;
    min-height: 112px;
    margin: 0;
    color: var(--idea-text-primary);
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-default);
  }
}
@media (max-width: 480px) {
  .cell-format-fill {
    > label,
    &__field,
    &__color,
    &__palette,
    &__preview {
      grid-template-columns: minmax(0, 1fr);
      gap: 8px;
    }
    &__emphasis {
      padding-left: 0;
    }
  }
}
</style>
