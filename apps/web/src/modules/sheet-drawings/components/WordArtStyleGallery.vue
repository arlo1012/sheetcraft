<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import { useWorkbookTheme } from "../../../shared/color/workbook-theme-context";
import WordArtStylePreview from "./WordArtStylePreview.vue";
import {
  WORDART_STYLE_GALLERY_LABELS,
  WORDART_STYLE_PRESETS,
  getWordArtStylePreset,
  type WordArtStyleLocale,
  type WordArtStylePreset,
} from "../wordart-style-presets";

const props = withDefaults(
  defineProps<{
    selectedId?: string;
    locale?: WordArtStyleLocale;
    disabled?: boolean;
    /** Invalidate pending results when the document/object owner changes. */
    ownerId?: string | number;
    /** The owner performs insertion/reapply; only true signals success/closure. */
    onSelect?: (choice: WordArtStylePreset) => boolean | Promise<boolean>;
  }>(),
  { locale: "en-US", disabled: false },
);
const emit = defineEmits<{
  /** Simple controlled use without an onSelect callback. */
  choose: [choice: WordArtStylePreset];
  applied: [choice: WordArtStylePreset];
  failed: [choice: WordArtStylePreset];
}>();
const theme = useWorkbookTheme();
const previewTheme = computed(() => theme?.value);
const root = ref<HTMLElement | null>(null);
const activeId = ref<string>();
const pendingId = ref<string>();
const rejected = ref(false);
const labels = computed(() => WORDART_STYLE_GALLERY_LABELS[props.locale]);
const selected = computed(() =>
  props.selectedId ? getWordArtStylePreset(props.selectedId) : undefined,
);
const tabChoiceId = computed(() =>
  props.disabled
    ? undefined
    : (getWordArtStylePreset(activeId.value ?? "")?.id ??
      selected.value?.id ??
      WORDART_STYLE_PRESETS[0]?.id),
);
let generation = 0;

async function select(choice: WordArtStylePreset): Promise<void> {
  if (props.disabled || pendingId.value) return;
  rejected.value = false;
  const handler = props.onSelect;
  if (!handler) {
    emit("choose", choice);
    return;
  }
  const token = ++generation;
  const ownerId = props.ownerId;
  pendingId.value = choice.id;
  let accepted = false;
  try {
    accepted = (await handler(choice)) === true;
  } catch {
    // Keep the gallery open and available for a retry after owner rejection.
  }
  if (
    token !== generation ||
    props.disabled ||
    props.ownerId !== ownerId ||
    props.onSelect !== handler
  )
    return;
  pendingId.value = undefined;
  if (accepted) emit("applied", choice);
  else {
    rejected.value = true;
    emit("failed", choice);
  }
}

function buttons(): HTMLButtonElement[] {
  return [
    ...(root.value?.querySelectorAll<HTMLButtonElement>(
      "button[data-wordart-style-choice]:not(:disabled)",
    ) ?? []),
  ];
}
function focusChoice(button: HTMLButtonElement | undefined): void {
  if (!button) return;
  activeId.value = button.dataset.wordartStyleChoice;
  button.focus();
  button.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}
function onKeydown(event: KeyboardEvent): void {
  if (
    props.disabled ||
    pendingId.value ||
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
  )
    return;
  const active =
    event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>("button[data-wordart-style-choice]")
      : null;
  if (!active || active.disabled) return;
  const choices = buttons();
  const index = choices.indexOf(active);
  if (index < 0) return;
  const first = choices[0];
  const nextRow = choices.findIndex((button) => button.offsetTop !== first?.offsetTop);
  // The real responsive grid determines rows. Layout-less DOM uses ten columns.
  const columns = nextRow > 0 ? nextRow : 10;
  const row = Math.floor(index / columns);
  const column = index % columns;
  let next = index;
  if (event.key === "Home") next = 0;
  else if (event.key === "End") next = choices.length - 1;
  else if (event.key === "ArrowLeft") next = Math.max(0, index - 1);
  else if (event.key === "ArrowRight") next = Math.min(choices.length - 1, index + 1);
  else {
    const nextRowIndex = Math.max(
      0,
      Math.min(Math.ceil(choices.length / columns) - 1, row + (event.key === "ArrowUp" ? -1 : 1)),
    );
    next = Math.min(choices.length - 1, nextRowIndex * columns + column);
  }
  event.preventDefault();
  event.stopPropagation();
  focusChoice(choices[next]);
}

watch(
  () => [props.ownerId, props.onSelect, props.disabled],
  () => {
    generation++;
    pendingId.value = undefined;
    rejected.value = false;
  },
  { flush: "sync" },
);
onBeforeUnmount(() => generation++);
defineExpose({
  focusSelected: () => {
    const choices = buttons();
    focusChoice(
      choices.find((button) => button.dataset.wordartStyleChoice === selected.value?.id) ??
        choices[0],
    );
  },
  focusLast: () => focusChoice(buttons().at(-1)),
});
</script>

<template>
  <div
    ref="root"
    class="wordart-style-gallery"
    role="group"
    :aria-label="labels.gallery"
    :aria-busy="!!pendingId"
    @keydown="onKeydown"
  >
    <GallerySection :title="labels.gallery">
      <div class="wordart-style-gallery__grid">
        <button
          v-for="choice in WORDART_STYLE_PRESETS"
          :key="choice.id"
          type="button"
          class="wordart-style-gallery__choice"
          :data-wordart-style-choice="choice.id"
          :disabled="disabled || !!pendingId"
          :aria-pressed="choice.id === selectedId"
          :aria-label="choice.label[locale]"
          :title="choice.label[locale]"
          :tabindex="choice.id === tabChoiceId ? 0 : -1"
          @focus="activeId = choice.id"
          @click="select(choice)"
        >
          <WordArtStylePreview
            :choice="choice"
            :label="choice.label[locale]"
            :theme="previewTheme"
          />
        </button>
      </div>
    </GallerySection>
    <p
      v-if="pendingId || rejected"
      class="wordart-style-gallery__status"
      role="status"
      aria-live="polite"
    >
      {{ pendingId ? labels.pending : labels.rejected }}
    </p>
    <span v-if="selected" class="wordart-style-gallery__selection" role="status">
      {{ labels.selected }}: {{ selected.label[locale] }}
    </span>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;

.wordart-style-gallery {
  width: 528px;
  max-width: 100%;
  min-width: 0;

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(48px, 100%), 1fr));
    gap: var(--sheetcraft-space-1);
  }

  &__choice {
    @include gallery.choice;

    display: grid;
    min-width: 0;
    height: 54px;
    place-items: center;
  }

  &__status {
    margin: 0;
    padding: var(--sheetcraft-space-2) var(--sheetcraft-tool-panel-padding);
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }

  &__selection {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
}
</style>
