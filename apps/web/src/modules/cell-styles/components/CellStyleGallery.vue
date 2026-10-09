<script setup lang="ts">
import type { CellStyleDefinition } from "@sheetcraft/core/cell-styles";
import { nextTick, shallowRef } from "vue";
import { MoreHorizontal } from "lucide-vue-next";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import CustomStyleContextMenu from "../../../shared/gallery/CustomStyleContextMenu.vue";
import { useGalleryContextMenu } from "../../../shared/gallery/useGalleryContextMenu";
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
  delete: [style: CellStyleDefinition];
}>();
const { t } = useAppI18n();
const buttons = new Map<string, HTMLButtonElement>();
const {
  contextMenu,
  contextItem: contextStyle,
  openAtElement,
  openAtPoint,
  close: closeContextMenu,
} = useGalleryContextMenu<CellStyleDefinition>();
const contextMenuRef = shallowRef<InstanceType<typeof CustomStyleContextMenu> | null>(null);

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
function onTileContextMenu(event: MouseEvent, style: CellStyleDefinition): void {
  event.preventDefault();
  if (style.category !== "custom") return;
  event.stopPropagation();
  openAtPoint(style, event.currentTarget as HTMLButtonElement, event);
}
function onMoreClick(event: MouseEvent, style: CellStyleDefinition): void {
  event.preventDefault();
  event.stopPropagation();
  const trigger = event.currentTarget as HTMLElement;
  openAtElement(style, trigger);
}
function editContextStyle(): void {
  const style = contextStyle.value;
  closeContextMenu(false);
  if (style) emit("edit", style);
}
function deleteContextStyle(): void {
  const style = contextStyle.value;
  closeContextMenu(false);
  if (style) emit("delete", style);
}
function onKeydown(event: KeyboardEvent, style: CellStyleDefinition): void {
  if (
    style.category === "custom" &&
    (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey))
  ) {
    event.preventDefault();
    event.stopPropagation();
    openAtElement(style, event.currentTarget as HTMLButtonElement);
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

function contextMenuElement(): HTMLElement | null {
  return contextMenuRef.value?.rootElement ?? null;
}

defineExpose({ focusFirstStyle, contextMenuElement });
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
          <div
            v-for="style in styles.filter((item) => item.category === category)"
            :key="style.id"
            class="cell-style-gallery__item"
          >
            <button
              :ref="styleRef(style)"
              type="button"
              class="cell-style-gallery__tile"
              :disabled="disabled"
              :aria-label="label(style)"
              :title="label(style)"
              :data-cell-style-id="style.id"
              @click="emit('select', style)"
              @contextmenu="onTileContextMenu($event, style)"
              @keydown="onKeydown($event, style)"
            >
              <CellStylePreview :style="style" :label="label(style)" />
            </button>
            <button
              v-if="style.category === 'custom'"
              type="button"
              class="cell-style-gallery__more"
              :aria-label="`${label(style)} · ${t('cellStyles.actions.edit')}`"
              :disabled="disabled"
              @click="onMoreClick($event, style)"
            >
              <MoreHorizontal :size="14" />
            </button>
          </div>
        </div>
      </GallerySection>
    </template>
    <CustomStyleContextMenu
      v-if="contextMenu && contextStyle"
      ref="contextMenuRef"
      :anchor="contextMenu.anchor"
      :label="contextStyle.name"
      :edit-label="t('cellStyles.actions.edit')"
      :delete-label="t('cellStyles.actions.delete')"
      @edit="editContextStyle"
      @delete="deleteContextStyle"
      @close="closeContextMenu"
    />
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice";

.cell-style-gallery {
  display: grid;
}
.cell-style-gallery__grid {
  display: grid;
  grid-template-columns: repeat(var(--cell-style-columns), minmax(0, 1fr));
  gap: 4px;
}
.cell-style-gallery__item {
  position: relative;
  min-width: 0;
}
.cell-style-gallery__tile {
  @include gallery-choice.choice;

  width: 100%;
  min-width: 0;
  overflow: hidden;
}
.cell-style-gallery__more {
  position: absolute;
  top: 3px;
  right: 3px;
  display: grid;
  place-items: center;
  width: 18px;
  height: 18px;
  padding: 0;
  color: var(--sheetcraft-text-secondary);
  visibility: hidden;
  background: var(--sheetcraft-surface-panel);
  border: 1px solid var(--sheetcraft-border-subtle);
  border-radius: var(--sheetcraft-radius-small);
  cursor: pointer;
}
.cell-style-gallery__item:hover .cell-style-gallery__more,
.cell-style-gallery__item:focus-within .cell-style-gallery__more,
.cell-style-gallery__more:focus-visible {
  visibility: visible;
}
</style>
