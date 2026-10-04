<script setup lang="ts">
import type { CellStyleDefinition } from "@idea10/core/cell-styles";
import { nextTick } from "vue";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import { useAppI18n } from "../../../shared/i18n";
import {
  CELL_STYLE_CATEGORIES,
  CELL_STYLE_CATEGORY_LABELS,
  cellStyleLabel,
} from "../cell-style-presentation";
import CellStylePreview from "./CellStylePreview.vue";

const props = withDefaults(
  defineProps<{ styles: readonly CellStyleDefinition[]; disabled?: boolean; columns?: 4 }>(),
  { disabled: false, columns: 4 },
);
const emit = defineEmits<{
  select: [style: CellStyleDefinition];
  edit: [style: CellStyleDefinition];
}>();
const { t } = useAppI18n();
const buttons = new Map<string, HTMLButtonElement>();

function focusFirstStyle(): void {
  const first = orderedStyles()[0];
  if (first) buttons.get(first.id)?.focus();
}

function label(style: CellStyleDefinition): string {
  return cellStyleLabel(style, t);
}
function styleRef(style: CellStyleDefinition) {
  return (element: unknown): void => {
    if (element instanceof HTMLButtonElement) buttons.set(style.id, element);
    else buttons.delete(style.id);
  };
}
function orderedStyles(): CellStyleDefinition[] {
  return CELL_STYLE_CATEGORIES.flatMap((category) =>
    props.styles.filter((style) => style.category === category),
  );
}
function onKeydown(event: KeyboardEvent, style: CellStyleDefinition): void {
  if (
    style.category === "custom" &&
    (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
  ) {
    event.preventDefault();
    emit("edit", style);
    return;
  }
  const styles = orderedStyles();
  const index = styles.findIndex((item) => item.id === style.id);
  const offset =
    event.key === "ArrowRight"
      ? 1
      : event.key === "ArrowLeft"
        ? -1
        : event.key === "ArrowDown"
          ? props.columns
          : event.key === "ArrowUp"
            ? -props.columns
            : 0;
  const next = event.key === "Home" ? 0 : event.key === "End" ? styles.length - 1 : index + offset;
  if (!offset && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  event.stopPropagation();
  const target = styles[Math.max(0, Math.min(styles.length - 1, next))];
  if (target) void nextTick(() => buttons.get(target.id)?.focus());
}

defineExpose({ focusFirstStyle });
</script>

<template>
  <div class="cell-style-gallery" :style="{ '--cell-style-columns': columns }">
    <template v-for="category in CELL_STYLE_CATEGORIES" :key="category">
      <GallerySection
        v-if="styles.some((style) => style.category === category)"
        :title="t(CELL_STYLE_CATEGORY_LABELS[category])"
      >
        <div
          class="cell-style-gallery__grid"
          role="group"
          :aria-label="t(CELL_STYLE_CATEGORY_LABELS[category])"
        >
          <button
            v-for="style in styles.filter((item) => item.category === category)"
            :key="style.id"
            :ref="styleRef(style)"
            type="button"
            class="cell-style-gallery__tile"
            :disabled="disabled"
            :aria-label="label(style)"
            :title="
              style.category === 'custom'
                ? `${label(style)} · ${t('cellStyles.actions.edit')}`
                : label(style)
            "
            :data-cell-style-id="style.id"
            @click="emit('select', style)"
            @contextmenu.prevent="style.category === 'custom' && emit('edit', style)"
            @keydown="onKeydown($event, style)"
          >
            <CellStylePreview :style="style" :label="label(style)" />
          </button>
        </div>
      </GallerySection>
    </template>
  </div>
</template>

<style scoped lang="scss">
.cell-style-gallery {
  display: grid;
}
.cell-style-gallery__grid {
  display: grid;
  grid-template-columns: repeat(var(--cell-style-columns), minmax(0, 1fr));
  gap: 4px;
}
.cell-style-gallery__tile {
  min-width: 0;
  padding: 3px;
  overflow: hidden;
  border: 0;
  border-radius: var(--idea-radius-small);
  background: transparent;
  cursor: pointer;
}
.cell-style-gallery__tile:hover {
  background: var(--idea-surface-secondary);
}
.cell-style-gallery__tile:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
