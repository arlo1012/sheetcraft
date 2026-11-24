<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Input } from "tdesign-vue-next/es/input";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import {
  SHAPE_GALLERY,
  SHAPE_GALLERY_COUNT,
  SHAPE_GALLERY_LABELS,
  filterShapeGallery,
  shapeGalleryPreview,
  type ShapeGalleryChoice,
  type ShapeGalleryLocale,
} from "../shape-gallery";

const SHAPE_BY_ID = new Map<string, ShapeGalleryChoice>(
  SHAPE_GALLERY.flatMap((group) => group.items).map((item) => [item.id, item]),
);

const props = withDefaults(
  defineProps<{
    selected?: ShapeGalleryChoice | null;
    locale?: ShapeGalleryLocale;
    disabled?: boolean;
    allowDrawingTools?: boolean;
    compact?: boolean;
    recentIds?: readonly string[];
  }>(),
  {
    locale: "en-US",
    disabled: false,
    allowDrawingTools: true,
    compact: false,
    recentIds: () => [],
  },
);
const emit = defineEmits<{ choose: [choice: ShapeGalleryChoice] }>();
const root = ref<HTMLElement | null>(null);
const query = ref("");
const activeKey = ref<string | null>(null);
const instanceId = useId();
const toolHintId = `shape-gallery-tools-${instanceId}`;
const searchInputId = `shape-gallery-search-${instanceId}`;
const labels = computed(() => SHAPE_GALLERY_LABELS[props.locale]);
const groups = computed(() => filterShapeGallery(query.value));
const recentChoices = computed(() => {
  if (query.value.trim() || !props.recentIds.length) return [];
  const seen = new Set<string>();
  const resolved: ShapeGalleryChoice[] = [];
  for (const id of props.recentIds) {
    if (seen.has(id)) continue;
    const found = SHAPE_BY_ID.get(id);
    if (found) {
      seen.add(id);
      resolved.push(found);
    }
  }
  return resolved;
});
const sections = computed(() => {
  const list: Array<{
    key: string;
    title: string;
    isRecent: boolean;
    categoryId?: string;
    items: readonly ShapeGalleryChoice[];
  }> = [];
  if (recentChoices.value.length) {
    list.push({
      key: "recent",
      title: labels.value.recent,
      isRecent: true,
      items: recentChoices.value,
    });
  }
  for (const group of groups.value) {
    list.push({
      key: group.id,
      title: group.label[props.locale],
      isRecent: false,
      categoryId: group.id,
      items: group.items,
    });
  }
  return list;
});
const visibleChoices = computed(() => groups.value.flatMap((group) => group.items));
const availableEntries = computed(() =>
  sections.value.flatMap((section) =>
    section.items
      .filter((choice) => choice.kind !== "drawingTool" || props.allowDrawingTools)
      .map((choice) => ({
        key: choiceKey(choice.id, section.isRecent),
        id: choice.id,
        isRecent: section.isRecent,
      })),
  ),
);
const selected = computed(() => (props.selected ? SHAPE_BY_ID.get(props.selected.id) : undefined));
const tabTargetKey = computed(() => {
  if (props.disabled) return null;
  const entries = availableEntries.value;
  return (
    entries.find((entry) => entry.key === activeKey.value)?.key ??
    entries.find((entry) => !entry.isRecent && entry.id === selected.value?.id)?.key ??
    entries[0]?.key ??
    null
  );
});
const selectedConnector = computed(
  () => selected.value?.kind === "line" && selected.value.preset !== "line",
);

function choiceKey(id: string, isRecent: boolean): string {
  return `${isRecent ? "recent" : "choice"}:${id}`;
}
function isTabTarget(id: string, isRecent: boolean): boolean {
  return tabTargetKey.value === choiceKey(id, isRecent);
}
function title(choice: ShapeGalleryChoice): string {
  if (props.compact && choice.kind === "drawingTool" && props.allowDrawingTools)
    return `${choice.label[props.locale]}: ${labels.value.drawingToolHint}`;
  if (props.compact && choice.kind === "line" && choice.preset !== "line")
    return `${choice.label[props.locale]}: ${labels.value.connectorHint}`;
  return choice.kind === "drawingTool" && !props.allowDrawingTools
    ? `${choice.label[props.locale]}: ${labels.value.drawingToolFromMenuHint}`
    : choice.label[props.locale];
}
function choose(choice: ShapeGalleryChoice): void {
  if (!props.disabled && (choice.kind !== "drawingTool" || props.allowDrawingTools))
    emit("choose", choice);
}
function focusChoice(button: HTMLButtonElement | undefined): void {
  if (!button) return;
  activeKey.value = button.dataset.shapeChoice
    ? choiceKey(button.dataset.shapeChoice, "shapeRecent" in button.dataset)
    : null;
  button.focus();
  button.scrollIntoView?.({ block: "nearest", inline: "nearest" });
}
function galleryButtons(): HTMLButtonElement[] {
  return [
    ...(root.value?.querySelectorAll<HTMLButtonElement>(
      "button[data-shape-choice]:not(:disabled)",
    ) ?? []),
  ];
}
function onSearchKeydown(event: KeyboardEvent): void {
  if (
    !props.disabled &&
    !event.defaultPrevented &&
    !event.isComposing &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    (event.key === "ArrowDown" || event.key === "ArrowUp")
  ) {
    event.preventDefault();
    const buttons = galleryButtons();
    focusChoice(event.key === "ArrowUp" ? buttons.at(-1) : buttons[0]);
  }
}
function onGalleryKeydown(event: KeyboardEvent): void {
  if (
    props.disabled ||
    event.defaultPrevented ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey ||
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
  )
    return;
  const target = event.target;
  const active =
    target instanceof HTMLElement
      ? target.closest<HTMLButtonElement>("button[data-shape-choice]")
      : null;
  if (!active || active.disabled) return;
  const rows: HTMLButtonElement[][] = [];
  for (const grid of root.value?.querySelectorAll<HTMLElement>(".shape-gallery__grid") ?? []) {
    const buttons = [...grid.querySelectorAll<HTMLButtonElement>("button:not(:disabled)")];
    const first = buttons[0];
    if (!first) continue;
    const newRow = buttons.findIndex((button) => button.offsetTop !== first.offsetTop);
    // Layout-less DOM tests use ten columns; in the browser actual wrapping wins.
    const columns = newRow > 0 ? newRow : Math.min(10, buttons.length);
    for (let index = 0; index < buttons.length; index += columns)
      rows.push(buttons.slice(index, index + columns));
  }
  const buttons = rows.flat();
  const index = buttons.indexOf(active);
  if (index < 0) return;
  let next: HTMLButtonElement | undefined;
  if (event.key === "Home") next = buttons[0];
  else if (event.key === "End") next = buttons.at(-1);
  else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
    next =
      buttons[
        Math.max(0, Math.min(buttons.length - 1, index + (event.key === "ArrowLeft" ? -1 : 1)))
      ];
  else {
    const rowIndex = rows.findIndex((row) => row.includes(active));
    const column = rows[rowIndex]!.indexOf(active);
    const row =
      rows[Math.max(0, Math.min(rows.length - 1, rowIndex + (event.key === "ArrowUp" ? -1 : 1)))];
    next = row?.[Math.min(column, row.length - 1)];
  }
  event.preventDefault();
  event.stopPropagation();
  focusChoice(next);
}

watch(
  () => props.selected?.id,
  () => {
    activeKey.value = null;
  },
);
watch(query, () => {
  activeKey.value = null;
});
defineExpose({
  focusSelected: () => {
    const buttons = galleryButtons();
    focusChoice(
      buttons.find(
        (button) =>
          !("shapeRecent" in button.dataset) && button.dataset.shapeChoice === selected.value?.id,
      ) ?? buttons[0],
    );
  },
});
</script>

<template>
  <div
    ref="root"
    class="shape-gallery"
    :class="{ 'shape-gallery--compact': compact }"
    role="group"
    :aria-label="labels.gallery"
  >
    <div class="shape-gallery__search">
      <Input
        v-model="query"
        v-native-control="{
          attributes: {
            id: searchInputId,
            name: 'shape-gallery-search',
            'aria-label': labels.search,
          },
        }"
        type="search"
        clearable
        :disabled="disabled"
        :aria-label="labels.search"
        :placeholder="labels.search"
        @keydown="(_value, { e }) => onSearchKeydown(e)"
      />
      <span class="shape-gallery__total" aria-live="polite"
        >{{ visibleChoices.length }}{{ query.trim() ? ` / ${SHAPE_GALLERY_COUNT}` : "" }}
        {{ labels.count }}</span
      >
    </div>
    <div class="shape-gallery__scroll" @keydown="onGalleryKeydown">
      <GallerySection
        v-for="section in sections"
        :key="section.key"
        :title="section.title"
        :content-inset="!compact"
      >
        <template #actions>
          <span class="shape-gallery__category-count">{{ section.items.length }}</span>
        </template>
        <div
          class="shape-gallery__grid"
          role="group"
          :aria-label="section.title"
          :data-shape-category="section.categoryId"
          :data-shape-recent-group="section.isRecent ? '' : undefined"
        >
          <button
            v-for="choice in section.items"
            :key="choiceKey(choice.id, section.isRecent)"
            type="button"
            class="shape-gallery__choice"
            :data-shape-choice="choice.id"
            :data-shape-recent="section.isRecent ? '' : undefined"
            :data-shape-kind="choice.kind"
            :disabled="disabled || (choice.kind === 'drawingTool' && !allowDrawingTools)"
            :aria-disabled="disabled || (choice.kind === 'drawingTool' && !allowDrawingTools)"
            :aria-pressed="!section.isRecent && choice.id === selected?.id"
            :aria-label="choice.label[locale]"
            :aria-describedby="
              choice.kind === 'drawingTool' && allowDrawingTools ? toolHintId : undefined
            "
            :title="title(choice)"
            :tabindex="isTabTarget(choice.id, section.isRecent) ? 0 : -1"
            @focus="activeKey = choiceKey(choice.id, section.isRecent)"
            @click="choose(choice)"
          >
            <svg
              :viewBox="shapeGalleryPreview(choice).viewBox"
              aria-hidden="true"
              focusable="false"
            >
              <path
                v-for="(path, index) in shapeGalleryPreview(choice).paths"
                :key="index"
                :d="path.d"
                :fill="
                  path.filled && choice.kind !== 'textBox'
                    ? 'var(--sheetcraft-action-primary-subtle)'
                    : 'none'
                "
                :stroke="path.stroke ? 'var(--sheetcraft-action-primary)' : 'none'"
                stroke-width="1"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
              <path
                v-for="(arrow, index) in shapeGalleryPreview(choice).arrows"
                :key="`arrow-${index}`"
                :d="arrow"
                fill="var(--sheetcraft-action-primary)"
              />
              <template v-if="choice.kind === 'textBox'">
                <text
                  :x="choice.direction === 'vertical' ? 16 : 9"
                  :y="choice.direction === 'vertical' ? 10 : 16"
                  fill="var(--sheetcraft-action-primary)"
                  font-size="12"
                  text-anchor="middle"
                >
                  A
                </text>
                <path
                  :d="
                    choice.direction === 'vertical'
                      ? 'M12 14 H20 M12 18 H20'
                      : 'M17 9 H27 M17 13 H27 M17 17 H27'
                  "
                  fill="none"
                  stroke="var(--sheetcraft-action-primary)"
                  stroke-width="1"
                />
              </template>
            </svg>
          </button>
        </div>
      </GallerySection>
      <p v-if="!groups.length" class="shape-gallery__empty" role="status">{{ labels.noMatches }}</p>
    </div>
    <div
      v-if="!compact || selected"
      class="shape-gallery__feedback"
      role="status"
      aria-live="polite"
    >
      <span>{{
        selected ? `${labels.selected}: ${selected.label[locale]}` : labels.noSelection
      }}</span>
      <span v-if="selectedConnector">{{ labels.connectorHint }}</span>
    </div>
    <p :id="toolHintId" class="shape-gallery__hint" :class="{ 'ui-visually-hidden': compact }">
      {{ labels.drawingToolHint }}
    </p>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/gallery/gallery-choice" as gallery;
@use "../../../shared/option-list/option-list" as option-list;

.shape-gallery {
  display: flex;
  width: 100%;
  max-width: 440px;
  min-width: 0;
  flex-direction: column;
  gap: var(--sheetcraft-space-2);

  &__search {
    display: flex;
    align-items: center;
    gap: var(--sheetcraft-space-2);

    > :first-child {
      flex: 1;
      min-width: 0;
    }
  }

  &__total,
  &__category-count {
    flex: none;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    white-space: nowrap;
  }

  &__scroll {
    @include option-list.scrollbar;

    max-height: 320px;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scroll-padding-block: var(--sheetcraft-space-2);
  }

  &__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(38px, 1fr));
    gap: var(--sheetcraft-space-1);
  }

  &__choice {
    @include gallery.choice;

    display: grid;
    height: 34px;
    min-width: 0;
    place-items: center;

    svg {
      display: block;
      width: 28px;
      height: 26px;
    }
  }

  &__feedback {
    display: flex;
    flex-direction: column;
    gap: var(--sheetcraft-space-1);
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }

  &__hint,
  &__empty {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }

  &--compact {
    max-width: none;
    min-height: 0;
    gap: 0;
  }

  &--compact &__search {
    padding: 0 var(--sheetcraft-tool-panel-padding) var(--sheetcraft-space-2);
  }

  &--compact &__scroll {
    flex: 1 1 auto;
    max-height: 460px;
  }

  &--compact &__grid {
    grid-template-columns: repeat(auto-fill, minmax(24px, 1fr));
    gap: var(--sheetcraft-space-1);
    padding: var(--sheetcraft-space-2) var(--sheetcraft-tool-panel-padding);
  }

  &--compact &__choice {
    height: 24px;
    padding: var(--sheetcraft-space-1);

    svg {
      width: 20px;
      height: 18px;
    }
  }

  &__empty {
    padding: var(--sheetcraft-space-3) var(--sheetcraft-tool-panel-padding);
  }
}
</style>
