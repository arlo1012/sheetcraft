<script setup lang="ts">
import { useAppI18n } from "../../../shared/i18n";
import SheetImageContent from "../../sheet-images/components/SheetImageContent.vue";
import type { CellAddress } from "@idea10/core/workbook";
import type { VisibleCell } from "./sheet-cell-view";
import CellTextContent from "../../../shared/cell-text/CellTextContent.vue";

const props = defineProps<{
  cells: readonly VisibleCell[];
  activeEditorId: string;
  locale: string;
  imageAssetUrls?: ReadonlyMap<string, string>;
  loadingImageAssetIds?: ReadonlySet<string>;
}>();
const emit = defineEmits<{
  cellMousedown: [address: CellAddress, event: MouseEvent];
  cellDoubleClick: [address: CellAddress, event: MouseEvent];
  cellContextmenu: [address: CellAddress, event: MouseEvent];
}>();
const { t } = useAppI18n();

function imageSource(cell: VisibleCell): string | undefined {
  return cell.image ? props.imageAssetUrls?.get(cell.image.assetId) : undefined;
}

function imageLoading(cell: VisibleCell): boolean {
  return Boolean(cell.image && props.loadingImageAssetIds?.has(cell.image.assetId));
}

function memoDependencies(cell: VisibleCell): readonly unknown[] {
  return [
    cell.style,
    cell.text,
    cell.displayText,
    cell.value,
    cell.formatStyle,
    cell.spanning,
    cell.fill,
    cell.image?.assetId,
    cell.image?.altText,
    cell.imageTransformKey,
    cell.multiline,
    cell.wrapped,
    cell.selected,
    cell.editing,
    imageSource(cell),
    imageLoading(cell),
    props.locale,
    cell.active,
  ];
}
</script>

<template>
  <div>
    <div
      v-for="cell in cells"
      :key="cell.key"
      v-memo="memoDependencies(cell)"
      class="sheet-cell-layer__cell"
      :class="{
        'has-value': cell.text.length > 0,
        'has-image': Boolean(cell.image),
        'is-multiline': cell.multiline,
        'is-wrapped': cell.wrapped,
        'is-active': cell.active,
        'is-editing': cell.editing,
        'is-selected': cell.selected,
      }"
      :style="cell.style"
      :data-row="cell.address.row"
      :data-column="cell.address.column"
      role="gridcell"
      :aria-rowindex="cell.address.row + 1"
      :aria-colindex="cell.address.column + 1"
      :aria-selected="cell.selected"
      :aria-label="cell.spanning ? cell.text : undefined"
      :aria-owns="cell.active ? activeEditorId : undefined"
      @mousedown.left.prevent="emit('cellMousedown', cell.address, $event)"
      @dblclick.left.prevent="emit('cellDoubleClick', cell.address, $event)"
      @contextmenu="emit('cellContextmenu', cell.address, $event)"
    >
      <SheetImageContent
        v-if="cell.image && imageSource(cell)"
        class="sheet-cell-layer__image"
        :src="imageSource(cell) ?? ''"
        :alt-text="cell.image.altText || t('image.cellAlt')"
        :transform="cell.image.transform"
        fit="contain"
      />
      <span
        v-else-if="cell.image"
        class="sheet-cell-layer__image-placeholder"
        role="img"
        :aria-label="imageLoading(cell) ? t('image.loading') : t('image.assetUnavailable')"
        >{{ imageLoading(cell) ? t("image.loading") : t("image.assetUnavailable") }}</span
      >
      <CellTextContent
        v-else-if="cell.displayText && !cell.spanning"
        class="sheet-cell-layer__value"
        :class="{ 'has-fill': Boolean(cell.fill) }"
        :text="cell.displayText"
        :value="cell.value"
        :cell-style="cell.formatStyle"
        :fill="cell.fill"
        :width="cell.rect.width - 1"
        :height="cell.rect.height - 1"
        :aria-hidden="cell.text ? undefined : true"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.sheet-cell-layer__cell {
  position: absolute;
  display: flex;
  align-items: flex-end;
  overflow: hidden;
  padding: 0;
  background: var(--idea-surface-panel);
  border-right: var(--sheet-gridline-width, 1px) solid transparent;
  border-bottom: var(--sheet-gridline-width, 1px) solid transparent;
  color: var(--idea-text-primary);
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  pointer-events: auto;
  user-select: none;
  &.is-active {
    overflow: visible;
  }
  &.is-multiline.is-active:not(.is-editing) {
    overflow: hidden;
  }
  &.has-image {
    padding: 2px;
    overflow: hidden;
  }
}
.sheet-cell-layer__image {
  display: block;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.sheet-cell-layer__image-placeholder {
  overflow: hidden;
  color: var(--idea-text-secondary);
  font-size: 11px;
  text-overflow: ellipsis;
}
.sheet-cell-layer__value {
  overflow: hidden;
  text-overflow: clip;
}
.sheet-cell-layer__value.has-fill {
  width: 100%;
  min-width: 0;
}
.sheet-cell-layer__cell.is-multiline .sheet-cell-layer__value {
  min-width: 0;
  max-width: 100%;
  overflow: visible;
}
</style>
