<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import GallerySection from "../../../../shared/gallery/GallerySection.vue";
import { useWorkbookTheme } from "../../../../shared/color/workbook-theme-context";
import { picturePresetPreview } from "../../picture-preset-preview";
import type { PictureFormatTranslate } from "../../picture-format-pane-model";
import type {
  PicturePresetGalleryGroup,
  PicturePresetGalleryItem,
} from "../../picture-preset-gallery-model";

const props = withDefaults(
  defineProps<{
    ownerKey: string;
    groups: readonly PicturePresetGalleryGroup[];
    selectedId?: string;
    disabled?: boolean;
    columns?: number;
    showLabels?: boolean;
    t: PictureFormatTranslate;
    onSelect: (id: string) => boolean;
  }>(),
  { columns: 3 },
);
const root = ref<HTMLElement>();
const theme = useWorkbookTheme();
const errors = new Set<string>();
const items = computed(() => props.groups.flatMap((group) => group.items));
let generation = 0;
let live = true;
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
function selectionAction(id: string) {
  const owner = props.ownerKey,
    token = generation,
    handler = props.onSelect;
  return () => {
    if (
      !live ||
      props.disabled ||
      owner !== props.ownerKey ||
      token !== generation ||
      handler !== props.onSelect ||
      !items.value.some((item) => item.id === id)
    )
      return;
    return handler(id);
  };
}
watch(
  () => [props.ownerKey, props.onSelect, props.disabled] as const,
  () => {
    generation++;
    errors.clear();
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  live = false;
  generation++;
});
function buttons() {
  return [...(root.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])];
}
function keydown(event: KeyboardEvent) {
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
    return;
  const button = event.target as HTMLElement;
  if (button.tagName !== "BUTTON") return;
  const choices = buttons(),
    index = choices.indexOf(button as HTMLButtonElement);
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
        ? choices.length - 1
        : Math.max(0, Math.min(choices.length - 1, index + delta));
  event.preventDefault();
  event.stopPropagation();
  choices[next]?.focus();
}
defineExpose({
  focusFirstItem: () => buttons()[0]?.focus(),
  focusLastItem: () => buttons().at(-1)?.focus(),
});
</script>
<template>
  <div
    ref="root"
    class="picture-preset-choices"
    :class="{ 'picture-preset-choices--labels': showLabels }"
    :style="{
      '--picture-preset-columns': columns,
      '--picture-preset-width': `${Math.max(228, columns * 58 + 12)}px`,
    }"
    @keydown="keydown"
  >
    <GallerySection v-for="group in groups" :key="group.labelKey" :title="t(group.labelKey)">
      <div class="picture-preset-choices__grid" role="group" :aria-label="t(group.labelKey)">
        <button
          v-for="item in group.items"
          :key="item.id"
          type="button"
          :disabled="disabled"
          :aria-label="itemLabel(item)"
          :title="itemLabel(item)"
          :aria-pressed="item.id === selectedId"
          :onClick="selectionAction(item.id)"
        >
          <img v-if="preview(item)" :src="preview(item)" alt="" /><span
            v-if="showLabels || !preview(item)"
            >{{ itemLabel(item) }}</span
          >
        </button>
      </div>
    </GallerySection>
  </div>
</template>
<style scoped lang="scss">
@use "../../../../shared/gallery/gallery-choice" as gallery;
.picture-preset-choices {
  width: var(--picture-preset-width);
  max-width: calc(100vw - 24px);
  max-height: min(480px, 65vh);
  overflow: auto;
  overscroll-behavior: contain;
  &--labels &__grid button {
    display: flex;
    justify-content: flex-start;
    gap: 12px;
  }
  &--labels &__grid img {
    width: 52px;
  }
  &__grid {
    display: grid;
    grid-template-columns: repeat(var(--picture-preset-columns), minmax(0, 1fr));
    gap: 6px;
  }
  &__grid button {
    @include gallery.choice(5px);
    display: grid;
    place-items: center;
    min-width: 0;
    height: 52px;
    font: inherit;
    overflow: hidden;
  }
  &__grid img {
    max-width: 100%;
    max-height: 40px;
    object-fit: contain;
  }
}
</style>
