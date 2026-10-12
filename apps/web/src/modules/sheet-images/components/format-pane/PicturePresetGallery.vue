<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from "vue";
import type { PictureFormatTranslate } from "../../picture-format-pane-model";
import { useWorkbookTheme } from "../../../../shared/color/workbook-theme-context";
import PanelSelect from "../../../../shared/panel-select/PanelSelect.vue";
import GallerySection from "../../../../shared/gallery/GallerySection.vue";
import { picturePresetPreview } from "../../picture-preset-preview";
import PictureFormatField from "./PictureFormatField.vue";
import type {
  PicturePresetGalleryItem,
  PicturePresetGalleryGroup,
} from "../../picture-preset-gallery-model";
const props = withDefaults(
  defineProps<{
    ownerKey: string;
    groups: readonly PicturePresetGalleryGroup[];
    selectedId?: string;
    disabled?: boolean;
    t: PictureFormatTranslate;
    onSelect: (id: string) => boolean;
    columns?: number;
    label?: string;
    emptyLabel?: string;
  }>(),
  { columns: 3 },
);
const theme = useWorkbookTheme(),
  opening = ref<string>(),
  callbackGeneration = ref(0);
let generation = 0;
const flattened = computed(() => props.groups.flatMap((group) => group.items));
const selected = computed(() => flattened.value.find((item) => item.id === props.selectedId));
const errors = new Set<string>();
function itemLabel(item: PicturePresetGalleryItem) {
  return (
    props.t(item.labelKey) +
    (item.ordinal === undefined ? "" : ` ${item.ordinal}`) +
    (item.unitKey ? ` ${props.t(item.unitKey)}` : "")
  );
}
function preview(item: PicturePresetGalleryItem) {
  if (errors.has(item.id)) return;
  try {
    return picturePresetPreview(item.previewStyle, theme?.value);
  } catch {
    errors.add(item.id);
    return;
  }
}
function selectionAction(id: string, close: () => void) {
  const key = props.ownerKey,
    token = generation,
    handler = props.onSelect;
  return () => {
    if (
      props.disabled ||
      opening.value !== key ||
      props.ownerKey !== key ||
      generation !== token ||
      props.onSelect !== handler ||
      !flattened.value.some((item) => item.id === id)
    )
      return;
    if (handler(id) === true) close();
  };
}
watch(
  () => props.ownerKey,
  () => {
    generation++;
    opening.value = undefined;
    errors.clear();
  },
);
watch(
  () => props.onSelect,
  () => {
    generation++;
    callbackGeneration.value++;
    opening.value = undefined;
  },
  { flush: "sync" },
);
onUnmounted(() => {
  generation++;
  opening.value = undefined;
});
function open(value: boolean) {
  generation++;
  opening.value = value ? props.ownerKey : undefined;
}
function keydown(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
    return;
  const button = event.target as HTMLButtonElement;
  if (button.tagName !== "BUTTON") return;
  const container = event.currentTarget as HTMLElement,
    buttons = [...container.querySelectorAll<HTMLButtonElement>("button:not([disabled])")],
    index = buttons.indexOf(button);
  if (index < 0) return;
  const delta =
    event.key === "ArrowLeft"
      ? -1
      : event.key === "ArrowRight"
        ? 1
        : event.key === "ArrowUp"
          ? -props.columns
          : props.columns;
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : Math.max(0, Math.min(buttons.length - 1, index + delta));
  event.preventDefault();
  event.stopPropagation();
  buttons[next]?.focus();
}
</script>
<template>
  <PictureFormatField :label="label ?? t('preset')">
    <PanelSelect
      :key="`${ownerKey}:${callbackGeneration}`"
      :model-value="selectedId"
      :label="label ?? t('preset')"
      :value-label="selected ? itemLabel(selected) : (emptyLabel ?? t('effectCustom'))"
      :disabled="disabled"
      panel-width="content"
      @open-change="open"
    >
      <template #value
        ><img
          v-if="selected && preview(selected)"
          :src="preview(selected)"
          alt=""
          class="picture-preset-gallery__selected"
        /><span>{{
          selected ? itemLabel(selected) : (emptyLabel ?? t("effectCustom"))
        }}</span></template
      >
      <template #panel="{ close }"
        ><div class="picture-preset-gallery" @keydown="keydown">
          <GallerySection v-for="group in groups" :key="group.labelKey" :title="t(group.labelKey)"
            ><div
              class="picture-preset-gallery__grid"
              :style="{ '--picture-preset-columns': columns }"
              role="group"
              :aria-label="t(group.labelKey)"
            >
              <button
                v-for="item in group.items"
                :key="item.id"
                type="button"
                :disabled="disabled"
                :aria-label="itemLabel(item)"
                :title="itemLabel(item)"
                :aria-pressed="item.id === selectedId"
                :onClick="selectionAction(item.id, close)"
              >
                <img v-if="preview(item)" :src="preview(item)" alt="" /><span v-else>{{
                  itemLabel(item)
                }}</span>
              </button>
            </div></GallerySection
          >
        </div></template
      >
    </PanelSelect>
  </PictureFormatField>
</template>
<style scoped lang="scss">
.picture-preset-gallery {
  width: 228px;
  max-width: calc(100vw - 24px);
  max-height: min(480px, 65vh);
  overflow: auto;
  overscroll-behavior: contain;
  &__grid {
    display: grid;
    grid-template-columns: repeat(var(--picture-preset-columns), minmax(0, 1fr));
    gap: 6px;
  }
  &__grid button {
    display: grid;
    place-items: center;
    min-width: 0;
    height: 52px;
    padding: 5px;
    border: 1px solid var(--sheetcraft-border-subtle);
    border-radius: var(--sheetcraft-radius-small);
    background: var(--sheetcraft-surface-panel);
    font: inherit;
    color: inherit;
    cursor: pointer;
    overflow: hidden;
  }
  &__grid button:hover:not(:disabled) {
    background: var(--sheetcraft-surface-hover);
  }
  &__grid button[aria-pressed="true"] {
    outline: 2px solid var(--sheetcraft-text-primary);
    outline-offset: -2px;
  }
  &__grid img {
    max-width: 100%;
    max-height: 40px;
    object-fit: contain;
  }
  &__selected {
    max-width: 28px;
    max-height: 20px;
    object-fit: contain;
  }
}
</style>
