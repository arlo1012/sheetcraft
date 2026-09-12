<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { List as TList, ListItem as TListItem } from "tdesign-vue-next/es/list";
import { Menu as TMenu, MenuItem as TMenuItem } from "tdesign-vue-next/es/menu";
import { Search } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import {
  FORMULA_CATEGORY_ORDER,
  getFormulaCatalogEntries,
  getFormulaCategoryLabel,
  type FormulaCatalogTranslator,
} from "../../../shared/formula-editing/function-catalog";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    recentFunctions?: readonly string[];
    editSessionId?: string;
  }>(),
  { recentFunctions: () => [], editSessionId: undefined },
);
const emit = defineEmits<{ close: []; insertFunction: [name: string] }>();
const { t } = useAppI18n();
const query = ref("");
const selectedCategory = ref<string | "recent" | "all">("all");
const selectedName = ref<string | undefined>();
const searchRef = ref<{ focus(): void } | null>(null);
const translate = ((key) => t(key)) as FormulaCatalogTranslator;
const entries = computed(() => getFormulaCatalogEntries(translate));
const visibleCategories = computed(() =>
  FORMULA_CATEGORY_ORDER.filter((category) =>
    entries.value.some((entry) => entry.category === category),
  ),
);
const categoryOptions = computed(() => [
  { value: "all", label: t("formulaTools.allFunctions") },
  ...(props.recentFunctions.length ? [{ value: "recent", label: t("formulaTools.recent") }] : []),
  ...visibleCategories.value.map((category) => ({
    value: category,
    label: getFormulaCategoryLabel(category, (key) => t(key)),
  })),
]);
const filteredEntries = computed(() => {
  const search = query.value.trim().toLowerCase();
  const recent = new Set(props.recentFunctions.map((name) => name.toUpperCase()));
  return entries.value.filter((entry) => {
    const inCategory =
      selectedCategory.value === "all" ||
      (selectedCategory.value === "recent"
        ? recent.has(entry.name)
        : entry.category === selectedCategory.value);
    return (
      inCategory &&
      (!search ||
        `${entry.name} ${entry.description} ${entry.signature}`.toLowerCase().includes(search))
    );
  });
});
const selectedEntry = computed(
  () =>
    filteredEntries.value.find((entry) => entry.name === selectedName.value) ??
    filteredEntries.value[0],
);
const selectedIndex = computed(() =>
  Math.max(
    0,
    filteredEntries.value.findIndex((entry) => entry.name === selectedEntry.value?.name),
  ),
);

watch(
  () => props.visible,
  (visible) => {
    if (visible) void nextTick(() => searchRef.value?.focus());
  },
);

function selectCategory(category: string | number): void {
  if (typeof category !== "string") return;
  selectedCategory.value = category;
  selectedName.value = undefined;
}
function insert(name = selectedEntry.value?.name): void {
  if (name) emit("insertFunction", name);
}
function moveResult(direction: -1 | 1): void {
  const count = filteredEntries.value.length;
  if (!count) return;
  const index = (selectedIndex.value + direction + count) % count;
  selectedName.value = filteredEntries.value[index]?.name;
  void nextTick(() =>
    document
      .querySelector<HTMLButtonElement>(`[data-formula-browser-result="${selectedName.value}"]`)
      ?.focus(),
  );
}
function onResultKeydown(event: KeyboardEvent): void {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    moveResult(event.key === "ArrowDown" ? 1 : -1);
  } else if (event.key === "Enter") {
    event.preventDefault();
    insert();
  }
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("close");
  }
}
</script>

<template>
  <Dialog
    v-if="visible"
    class="formula-function-browser"
    :visible="visible"
    :header="t('formulaTools.functionBrowser')"
    width="min(720px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false"
    :confirm-on-enter="false"
    :confirm-btn="{ content: t('formulaTools.insertFunction'), disabled: !selectedEntry }"
    :cancel-btn="t('formulaTools.cancel')"
    :aria-label="t('formulaTools.functionBrowser')"
    :data-cell-edit-session="editSessionId"
    @confirm="insert()"
    @close="emit('close')"
    @keydown="onKeydown"
  >
    <div class="formula-function-browser__content" :data-cell-edit-session="editSessionId">
      <div class="formula-function-browser__body">
        <section class="formula-function-browser__field">
          <span>{{ t("formulaTools.categories") }}</span>
          <TMenu
            class="formula-function-browser__categories narrow-scrollbar"
            :value="selectedCategory"
            width="100%"
            :aria-label="t('formulaTools.categories')"
            @change="selectCategory"
          >
            <TMenuItem
              v-for="category in categoryOptions"
              :key="category.value"
              :value="category.value"
            >
              {{ category.label }}
            </TMenuItem>
          </TMenu>
        </section>
        <section class="formula-function-browser__field">
          <span>{{ t("formulaTools.selectFunction") }}</span>
          <TInput
            ref="searchRef"
            v-model="query"
            type="search"
            clearable
            :aria-label="t('formulaTools.searchFunctions')"
            :placeholder="t('formulaTools.searchFunctions')"
          >
            <template #prefix-icon><Search :size="15" aria-hidden="true" /></template>
          </TInput>
          <TList
            class="formula-function-browser__results narrow-scrollbar"
            role="listbox"
            :aria-label="t('formulaTools.selectFunction')"
            :split="false"
          >
            <TListItem
              v-for="(entry, index) in filteredEntries"
              :key="entry.name"
              class="formula-function-browser__result-item"
            >
              <TButton
                class="formula-function-browser__result"
                theme="default"
                variant="text"
                type="button"
                role="option"
                :tabindex="selectedIndex === index ? 0 : -1"
                :aria-selected="selectedEntry?.name === entry.name"
                :data-formula-browser-result="entry.name"
                @keydown="onResultKeydown"
                @click="selectedName = entry.name"
                @dblclick="insert(entry.name)"
              >
                <span class="formula-function-browser__result-content">
                  <span class="formula-function-browser__result-name">{{ entry.name }}</span>
                  <span class="formula-function-browser__result-description">{{
                    entry.description
                  }}</span>
                </span>
              </TButton>
            </TListItem>
            <p v-if="!filteredEntries.length" class="formula-function-browser__empty" role="status">
              {{ t("formulaTools.noFunctions") }}
            </p>
          </TList>
        </section>
      </div>
      <section class="formula-function-browser__details narrow-scrollbar">
        <template v-if="selectedEntry">
          <strong class="formula-function-browser__signature">{{ selectedEntry.signature }}</strong>
          <p>{{ selectedEntry.description }}</p>
          <p class="formula-function-browser__example">
            {{ t("formulaTools.example") }}：<code>{{ selectedEntry.example }}</code>
          </p>
        </template>
      </section>
    </div>
  </Dialog>
</template>

<style scoped lang="scss">
.formula-function-browser {
  &__content {
    display: grid;
    gap: 12px;
    min-width: 0;
    color: var(--idea-text-primary);
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
  }
  &__body {
    display: grid;
    grid-template-columns: 144px minmax(0, 1fr);
    gap: 12px;
    height: min(360px, 48vh);
    min-height: 0;
  }
  &__field {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
  }
  &__categories,
  &__results {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
  }
  &__categories {
    --td-comp-size-l: 28px;
    --td-brand-color: var(--idea-text-primary);
    --td-brand-color-light: var(--idea-surface-active);
  }
  &__results {
    padding: 4px;
  }
  &__result-item {
    padding: 0;
  }
  &__result {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    height: 28px;
    padding: 4px 8px;
    text-align: left;
    border-radius: var(--idea-radius-small);
    &:hover {
      background: var(--idea-surface-secondary);
    }
    &[aria-selected="true"] {
      color: var(--idea-text-primary);
      background: var(--idea-surface-active);
    }
    &:focus-visible {
      outline: 2px solid var(--idea-action-primary);
      outline-offset: -2px;
    }
  }
  &__result-content {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
    width: 100%;
    text-align: left;
  }
  &__result-name {
    flex: none;
  }
  &__result-description {
    min-width: 0;
    overflow: hidden;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__empty {
    margin: 0;
    padding: 24px 8px;
    color: var(--idea-text-secondary);
    text-align: center;
  }
  &__details {
    min-height: 76px;
    max-height: 120px;
    overflow: auto;
    p {
      margin: 4px 0 0;
    }
  }
  &__signature {
    font-weight: var(--idea-font-weight-semibold);
    overflow-wrap: anywhere;
  }
  &__example {
    color: var(--idea-text-secondary);
    code {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: inherit;
      overflow-wrap: anywhere;
    }
  }
}
@media (max-width: 480px) {
  .formula-function-browser__body {
    grid-template-columns: 112px minmax(0, 1fr);
    gap: 8px;
  }
}
</style>
