<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ShapeTextWarp } from "@sheetcraft/core/text-warps";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import WordArtTransformPreview from "./WordArtTransformPreview.vue";
import {
  WORDART_ENVELOPE_PRESETS,
  WORDART_FOLLOW_PATH_PRESETS,
  WORDART_NO_TRANSFORM_PRESET,
  WORDART_TRANSFORM_GALLERY_LABELS,
  getWordArtTransformPreset,
  type WordArtTransformLocale,
  type WordArtTransformPreset,
  type WordArtTransformSelectionContext,
} from "../wordart-transform-presets";

/** Content for a shared MenuSurface body or an existing formatting pane. */
const props = withDefaults(
  defineProps<{
    /** Absence selects No transform. Adjusted presets retain their gallery identity. */
    selectedWarp?: ShapeTextWarp;
    mixed?: boolean;
    /** False gives standalone formatting-pane radiogroup semantics. */
    menu?: boolean;
    locale?: WordArtTransformLocale;
    disabled?: boolean;
    disabledReason?: string;
    ownerId?: string | number;
    /** Only a true owner result accepts this intent; selection remains controlled. */
    onSelect?: (
      choice: WordArtTransformPreset,
      context: WordArtTransformSelectionContext,
    ) => boolean | Promise<boolean>;
  }>(),
  { locale: "en-US", disabled: false, menu: true, mixed: false },
);
const emit = defineEmits<{
  choose: [choice: WordArtTransformPreset];
  applied: [choice: WordArtTransformPreset];
  failed: [choice: WordArtTransformPreset, message: string];
}>();
const root = ref<HTMLElement | null>(null);
const activeId = ref<string>();
const pendingId = ref<string>();
const rejected = ref(false);
const labels = computed(() => WORDART_TRANSFORM_GALLERY_LABELS[props.locale]);
const selected = computed(() =>
  props.mixed
    ? undefined
    : props.selectedWarp
      ? getWordArtTransformPreset(props.selectedWarp.preset)
      : WORDART_NO_TRANSFORM_PRESET,
);
const unavailable = computed(() => props.disabled || !!pendingId.value);
const tabChoiceId = computed(() =>
  unavailable.value
    ? undefined
    : (getWordArtTransformPreset(activeId.value ?? "")?.id ??
      selected.value?.id ??
      WORDART_NO_TRANSFORM_PRESET.id),
);
let generation = 0;

async function select(choice: WordArtTransformPreset): Promise<void> {
  if (unavailable.value) return;
  rejected.value = false;
  const handler = props.onSelect;
  if (!handler) {
    emit("choose", choice);
    return;
  }
  const token = ++generation;
  const ownerId = props.ownerId;
  const isCurrent = () =>
    token === generation &&
    !props.disabled &&
    props.ownerId === ownerId &&
    props.onSelect === handler;
  const context: WordArtTransformSelectionContext = Object.freeze({ ownerId, isCurrent });
  pendingId.value = choice.id;
  let accepted = false;
  try {
    accepted = (await handler(choice, context)) === true;
  } catch {
    // Keep the gallery and controlled selection available for the next attempt.
  }
  if (!isCurrent()) return;
  pendingId.value = undefined;
  if (accepted) emit("applied", choice);
  else {
    rejected.value = true;
    emit("failed", choice, labels.value.rejected);
  }
}

function buttons(): HTMLButtonElement[] {
  return [
    ...(root.value?.querySelectorAll<HTMLButtonElement>(
      "button[data-wordart-transform-choice]:not(:disabled)",
    ) ?? []),
  ];
}
function focusChoice(button: HTMLButtonElement | undefined): void {
  if (!button) return;
  activeId.value = button.dataset.wordartTransformChoice;
  button.focus();
  button.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}
function rows(choices: HTMLButtonElement[]): HTMLButtonElement[][] {
  const measured = choices.map((button) => button.getBoundingClientRect());
  const result: HTMLButtonElement[][] = [];
  if (measured.some((rect) => rect.width > 0 && rect.height > 0)) {
    let lastTop: number | undefined;
    choices.forEach((button, index) => {
      const top = measured[index]!.top;
      if (lastTop === undefined || Math.abs(top - lastTop) > 1) {
        result.push([]);
        lastTop = top;
      }
      result.at(-1)!.push(button);
    });
    return result;
  }
  // Layout-less DOM fallback mirrors the three concrete sections, not one 41-cell row.
  let previousGroup: string | undefined;
  for (const button of choices) {
    const group = button.dataset.wordartTransformFamily;
    const grid = button.parentElement;
    const template = grid ? getComputedStyle(grid).gridTemplateColumns : "";
    const repeat = /^repeat\(\s*(\d+)/.exec(template);
    const columns = repeat
      ? Number(repeat[1])
      : template.split(" ").filter((value) => /^\d/.test(value)).length || 4;
    if (group !== previousGroup || result.at(-1)!.length >= columns) result.push([]);
    result.at(-1)!.push(button);
    previousGroup = group;
  }
  return result;
}
function onKeydown(event: KeyboardEvent): void {
  if (
    unavailable.value ||
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  const active =
    event.target instanceof HTMLElement
      ? event.target.closest<HTMLButtonElement>("button[data-wordart-transform-choice]")
      : null;
  if (!active || active.disabled) return;
  if (event.key === "Enter" || event.key === " ") {
    const choice = getWordArtTransformPreset(active.dataset.wordartTransformChoice ?? "");
    if (choice) {
      event.preventDefault();
      event.stopPropagation();
      void select(choice);
    }
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key))
    return;
  const choices = buttons();
  const index = choices.indexOf(active);
  if (index < 0) return;
  let next = active;
  if (event.key === "Home") next = choices[0]!;
  else if (event.key === "End") next = choices.at(-1)!;
  else if (event.key === "ArrowLeft") next = choices[Math.max(0, index - 1)]!;
  else if (event.key === "ArrowRight") next = choices[Math.min(choices.length - 1, index + 1)]!;
  else {
    const gridRows = rows(choices);
    const row = gridRows.findIndex((items) => items.includes(active));
    const column = gridRows[row]!.indexOf(active);
    const targetRow =
      gridRows[
        Math.max(0, Math.min(gridRows.length - 1, row + (event.key === "ArrowUp" ? -1 : 1)))
      ]!;
    next = targetRow[Math.min(targetRow.length - 1, column)]!;
  }
  event.preventDefault();
  event.stopPropagation();
  focusChoice(next);
}

watch(
  () => [props.ownerId, props.onSelect, props.disabled],
  () => {
    generation++;
    pendingId.value = undefined;
    rejected.value = false;
    activeId.value = undefined;
  },
  { flush: "sync" },
);
onBeforeUnmount(() => generation++);
defineExpose({
  focusSelected: () => {
    const choices = buttons();
    focusChoice(
      choices.find((button) => button.dataset.wordartTransformChoice === selected.value?.id) ??
        choices[0],
    );
  },
  focusFirst: () => focusChoice(buttons()[0]),
  focusLast: () => focusChoice(buttons().at(-1)),
});
</script>

<template>
  <div
    ref="root"
    class="wordart-transform-gallery"
    :role="menu ? 'group' : 'radiogroup'"
    :aria-label="labels.gallery"
    :aria-busy="!!pendingId"
    @keydown="onKeydown"
  >
    <p class="wordart-transform-gallery__hint">{{ labels.diagrams }}</p>
    <p
      v-if="pendingId || rejected"
      class="wordart-transform-gallery__status"
      :class="{ 'wordart-transform-gallery__status--rejected': rejected }"
      role="status"
      aria-live="polite"
    >
      {{ pendingId ? labels.pending : labels.rejected }}
    </p>
    <p v-if="disabled && disabledReason" class="wordart-transform-gallery__hint" role="status">
      {{ disabledReason }}
    </p>
    <GallerySection :title="labels.none">
      <div class="wordart-transform-gallery__grid">
        <button
          type="button"
          class="wordart-transform-gallery__choice"
          :role="menu ? 'menuitemradio' : 'radio'"
          :data-wordart-transform-choice="WORDART_NO_TRANSFORM_PRESET.id"
          data-wordart-transform-family="none"
          :disabled="unavailable"
          :aria-disabled="unavailable"
          :aria-checked="selected?.id === WORDART_NO_TRANSFORM_PRESET.id"
          :aria-label="WORDART_NO_TRANSFORM_PRESET.label[locale]"
          :title="WORDART_NO_TRANSFORM_PRESET.label[locale]"
          :tabindex="tabChoiceId === WORDART_NO_TRANSFORM_PRESET.id ? 0 : -1"
          @focus="activeId = WORDART_NO_TRANSFORM_PRESET.id"
          @click="select(WORDART_NO_TRANSFORM_PRESET)"
        >
          <WordArtTransformPreview :choice="WORDART_NO_TRANSFORM_PRESET" />
          <span class="wordart-transform-gallery__label">{{
            WORDART_NO_TRANSFORM_PRESET.label[locale]
          }}</span>
        </button>
      </div>
    </GallerySection>
    <GallerySection :title="labels.followPath">
      <div class="wordart-transform-gallery__grid">
        <button
          v-for="choice in WORDART_FOLLOW_PATH_PRESETS"
          :key="choice.id"
          type="button"
          class="wordart-transform-gallery__choice"
          :role="menu ? 'menuitemradio' : 'radio'"
          :data-wordart-transform-choice="choice.id"
          data-wordart-transform-family="follow-path"
          :disabled="unavailable"
          :aria-disabled="unavailable"
          :aria-checked="selected?.id === choice.id"
          :aria-label="choice.label[locale]"
          :title="`${choice.label[locale]} (${choice.id})`"
          :tabindex="tabChoiceId === choice.id ? 0 : -1"
          @focus="activeId = choice.id"
          @click="select(choice)"
        >
          <WordArtTransformPreview :choice="choice" />
          <span class="wordart-transform-gallery__label">{{ choice.label[locale] }}</span>
        </button>
      </div>
      <p class="wordart-transform-gallery__note">{{ labels.followPathNote }}</p>
    </GallerySection>
    <GallerySection :title="labels.envelope">
      <div class="wordart-transform-gallery__grid">
        <button
          v-for="choice in WORDART_ENVELOPE_PRESETS"
          :key="choice.id"
          type="button"
          class="wordart-transform-gallery__choice"
          :role="menu ? 'menuitemradio' : 'radio'"
          :data-wordart-transform-choice="choice.id"
          data-wordart-transform-family="envelope"
          :disabled="unavailable"
          :aria-disabled="unavailable"
          :aria-checked="selected?.id === choice.id"
          :aria-label="choice.label[locale]"
          :title="`${choice.label[locale]} (${choice.id})`"
          :tabindex="tabChoiceId === choice.id ? 0 : -1"
          @focus="activeId = choice.id"
          @click="select(choice)"
        >
          <WordArtTransformPreview :choice="choice" />
          <span class="wordart-transform-gallery__label">{{ choice.label[locale] }}</span>
        </button>
      </div>
      <p class="wordart-transform-gallery__note">{{ labels.envelopeNote }}</p>
    </GallerySection>
    <p v-if="selected" class="wordart-transform-gallery__hint" role="status">
      {{ labels.selected }}: {{ selected.label[locale] }}
    </p>
    <p v-else-if="mixed" class="wordart-transform-gallery__hint" role="status">
      {{ labels.mixed }}
    </p>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;

.wordart-transform-gallery {
  width: 448px;
  max-width: 100%;
  min-width: 0;
  container-type: inline-size;

  &__grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--sheetcraft-space-1);
  }

  &__choice {
    @include gallery.choice;

    display: grid;
    min-width: 0;
    min-height: 72px;
    justify-items: center;
    align-content: center;
    color: var(--sheetcraft-text-primary);
    font-family: var(--sheetcraft-font-sans);
  }

  &__label {
    display: block;
    width: 100%;
    min-width: 0;
    overflow: hidden;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-medium);
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &__hint,
  &__status,
  &__note {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }

  &__status {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--sheetcraft-surface-panel);
  }

  &__hint,
  &__status {
    padding: var(--sheetcraft-space-2) var(--sheetcraft-tool-panel-padding);
  }

  &__note {
    margin-top: var(--sheetcraft-space-2);
  }

  &__status--rejected {
    color: var(--sheetcraft-status-error);
  }
}

@container (max-width: 335px) {
  .wordart-transform-gallery__grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
