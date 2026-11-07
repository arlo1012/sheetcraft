<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { Search, Star } from "lucide-vue-next";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import IconGlyph from "./IconGlyph.vue";
import { catalogIcons, iconCategories, iconName, type IconFilter } from "../icon-catalog";
import type { SheetIconId } from "@sheetcraft/core/sheet-icons";
const props = defineProps<{
  full?: boolean;
  favorites: readonly SheetIconId[];
  rejected: boolean;
  storageFailed: boolean;
}>();
const emit = defineEmits<{ insert: [id: SheetIconId]; favorite: [id: SheetIconId] }>();
const query = defineModel<string>("query", { required: true });
const filter = defineModel<IconFilter>("filter", { required: true });
const active = ref<SheetIconId>();
const { t, locale } = useAppI18n();
const sections = computed(() => {
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return iconCategories.flatMap((category) => {
    if (filter.value !== "all" && filter.value !== "favorites" && filter.value !== category)
      return [];
    const icons = catalogIcons.filter(
      (icon) =>
        icon.category === category &&
        (filter.value !== "favorites" || props.favorites.includes(icon.id)) &&
        terms.every((term) =>
          (icon.search + " " + t(`drawing.icons.${category}`).toLowerCase()).includes(term),
        ),
    );
    if (!icons.length) return [];
    return [
      {
        category,
        icons: !props.full && filter.value === "all" && !terms.length ? icons.slice(0, 6) : icons,
      },
    ];
  });
});
const displayed = computed(() => sections.value.flatMap((section) => section.icons));
const preview = computed(
  () => displayed.value.find((icon) => icon.id === active.value) ?? displayed.value[0],
);
const browser = ref<HTMLElement>();
watch([query, filter], () => {
  active.value = undefined;
  if (browser.value) browser.value.scrollTop = 0;
});
function navigate(event: KeyboardEvent, id: SheetIconId) {
  const delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 6, ArrowUp: -6 }[
    event.key as "ArrowRight" | "ArrowLeft" | "ArrowDown" | "ArrowUp"
  ];
  if (!delta) return;
  event.preventDefault();
  event.stopPropagation();
  const cards = [
    ...(browser.value?.querySelectorAll<HTMLButtonElement>("[data-insert-icon]") ?? []),
  ];
  const index = cards.findIndex((card) => card.dataset.insertIcon === id);
  cards[Math.max(0, Math.min(cards.length - 1, index + delta))]?.focus();
}
</script>
<template>
  <div class="icon-library" :class="{ 'icon-library--full': full }">
    <div class="icon-library__search">
      <TInput
        v-model="query"
        clearable
        :placeholder="t('drawing.icons.search')"
        v-native-control="{ attributes: { 'aria-label': t('drawing.icons.search') } }"
      >
        <template #prefix-icon><Search :size="16" /></template>
      </TInput>
    </div>
    <nav class="icon-library__filters" :aria-label="t('drawing.icons.library')">
      <button
        v-for="category in ['all', 'favorites', ...iconCategories] as const"
        :key="category"
        type="button"
        :aria-pressed="filter === category"
        :data-icon-category="category"
        @click="filter = category"
      >
        <Star v-if="category === 'favorites'" :size="13" />{{ t(`drawing.icons.${category}`) }}
      </button>
    </nav>
    <div ref="browser" class="icon-library__results">
      <GallerySection
        v-for="section in sections"
        :key="section.category"
        :title="t(`drawing.icons.${section.category}`)"
        :content-inset="false"
      >
        <div class="icon-library__grid">
          <button
            v-for="icon in section.icons"
            :key="icon.id"
            type="button"
            :role="full ? undefined : 'menuitem'"
            :data-insert-icon="icon.id"
            :aria-label="iconName(icon.id, locale)"
            :title="iconName(icon.id, locale)"
            @mouseenter="active = icon.id"
            @focus="active = icon.id"
            @keydown="navigate($event, icon.id)"
            @click="emit('insert', icon.id)"
          >
            <IconGlyph :id="icon.id" /><Star
              v-if="favorites.includes(icon.id)"
              class="icon-library__mark"
              :size="10"
              fill="currentColor"
            />
          </button>
        </div>
      </GallerySection>
      <p v-if="!sections.length" class="icon-library__empty" role="status">
        {{
          t(
            filter === "favorites" && !query
              ? "drawing.icons.emptyFavorites"
              : "drawing.icons.empty",
          )
        }}
      </p>
    </div>
    <aside v-if="preview" class="icon-library__preview">
      <div class="icon-library__sample"><IconGlyph :id="preview.id" /></div>
      <strong>{{ iconName(preview.id, locale) }}</strong
      ><span>{{ t(`drawing.icons.${preview.category}`) }}</span>
      <TButton
        size="small"
        variant="outline"
        :data-icon-favorite="preview.id"
        :aria-pressed="favorites.includes(preview.id)"
        @click="emit('favorite', preview.id)"
      >
        <template #icon
          ><Star
            :size="14"
            :fill="favorites.includes(preview.id) ? 'currentColor' : 'none'" /></template
        >{{
          t(favorites.includes(preview.id) ? "drawing.icons.unfavorite" : "drawing.icons.favorite")
        }}
      </TButton>
    </aside>
    <p v-if="rejected || storageFailed" class="icon-library__error" role="alert">
      {{ t(rejected ? "drawing.changeRejected" : "drawing.icons.storageFailed") }}
    </p>
  </div>
</template>
<style scoped lang="scss">
.icon-library {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 128px;
  grid-template-areas: "search search" "filters filters" "results preview" "error error";
  padding: 8px 12px;
  gap: 8px;
  &__search {
    grid-area: search;
  }
  &__filters {
    grid-area: filters;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 4px;
  }
  &__filters button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 0;
    padding: 4px 7px;
    border-radius: 4px;
    background: transparent;
    color: var(--sheetcraft-text-secondary);
    font: inherit;
    cursor: pointer;
  }
  &__filters button:hover,
  &__filters button:focus-visible {
    background: var(--td-bg-color-container-hover);
  }
  &__filters button[aria-pressed="true"] {
    background: var(--td-brand-color-light);
    color: var(--td-brand-color);
  }
  &__results {
    grid-area: results;
    overflow: auto;
    min-width: 0;
    height: min(350px, 38vh);
    scrollbar-width: thin;
  }
  &__grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 3px;
    padding: 4px 2px 8px;
  }
  &__grid button {
    position: relative;
    display: grid;
    place-items: center;
    min-width: 0;
    aspect-ratio: 1;
    color: var(--sheetcraft-text-primary);
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    cursor: pointer;
  }
  &__grid button:hover,
  &__grid button:focus-visible {
    background: var(--td-brand-color-light);
    border-color: var(--td-brand-color);
  }
  &__grid button svg:not(.icon-library__mark) {
    width: 64%;
    height: 64%;
    max-width: 34px;
    max-height: 34px;
  }
  &__mark {
    position: absolute;
    right: 2px;
    bottom: 2px;
    color: var(--td-brand-color);
  }
  &__preview {
    grid-area: preview;
    display: flex;
    align-items: center;
    flex-direction: column;
    gap: 8px;
    border-inline-start: 1px solid var(--td-component-border);
    padding: 12px 0 0 8px;
    text-align: center;
  }
  &__preview span,
  &__empty {
    color: var(--sheetcraft-text-secondary);
  }
  &__sample {
    display: grid;
    place-items: center;
    width: 100%;
    aspect-ratio: 1;
    max-height: 110px;
    background: var(--td-bg-color-secondarycontainer);
    border-radius: 5px;
  }
  &__sample svg {
    width: 65%;
    height: 65%;
  }
  &__error {
    grid-area: error;
    color: var(--sheetcraft-status-error);
    margin: 0;
  }
  &__empty {
    padding: 8px;
  }
  &--full {
    grid-template-columns: 136px minmax(0, 1fr) 170px;
    grid-template-areas: "search search search" "filters results preview" "error error error";
    padding: 0;
  }
  &--full &__filters {
    align-self: start;
    flex-direction: column;
    align-items: stretch;
  }
  &--full &__filters button {
    justify-content: flex-start;
    min-height: 30px;
  }
  &--full &__results {
    height: min(480px, 50vh);
  }
  @media (max-width: 650px) {
    &--full {
      grid-template-columns: minmax(0, 1fr) 120px;
      grid-template-areas: "search search" "filters filters" "results preview" "error error";
    }
    &--full &__filters {
      flex-direction: row;
    }
  }
  @media (max-width: 420px) {
    grid-template-columns: minmax(0, 1fr) 94px;
    &--full {
      grid-template-columns: minmax(0, 1fr) 94px;
    }
  }
}
</style>
