<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Drawer } from "tdesign-vue-next/es/drawer";
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
  <Drawer
    v-if="visible"
    :visible="visible"
    :header="t('formulaTools.functionBrowser')"
    :close-btn="true"
    placement="right"
    mode="overlay"
    size="min(740px, calc(100vw - 24px))"
    :show-overlay="false"
    :close-on-overlay-click="false"
    :close-on-esc-keydown="false"
    drawer-class-name="formula-function-browser"
    :aria-label="t('formulaTools.functionBrowser')"
    :data-cell-edit-session="editSessionId"
    @close="emit('close')"
    @keydown="onKeydown"
  >
    <div class="formula-function-browser__content">
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
      <div class="formula-function-browser__body">
        <section class="formula-function-browser__group">
          <h3>{{ t("formulaTools.categories") }}</h3>
          <TMenu
            class="formula-function-browser__categories narrow-scrollbar"
            :value="selectedCategory"
            width="100%"
            :aria-label="t('formulaTools.categories')"
            @change="selectCategory"
          >
            <TMenuItem value="all">{{ t("formulaTools.allFunctions") }}</TMenuItem>
            <TMenuItem v-if="recentFunctions.length" value="recent">
              {{ t("formulaTools.recent") }}
            </TMenuItem>
            <TMenuItem v-for="category in visibleCategories" :key="category" :value="category">
              {{ getFormulaCategoryLabel(category, (key) => t(key)) }}
            </TMenuItem>
          </TMenu>
        </section>
        <section class="formula-function-browser__group">
          <h3>
            {{
              selectedCategory === "all"
                ? t("formulaTools.allFunctions")
                : selectedCategory === "recent"
                  ? t("formulaTools.recent")
                  : getFormulaCategoryLabel(selectedCategory, (key) => t(key))
            }}
          </h3>
          <TList
            class="formula-function-browser__results narrow-scrollbar"
            role="listbox"
            :aria-label="t('formulaTools.allFunctions')"
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
                  <strong>{{ entry.name }}</strong>
                  <span>{{ entry.description }}</span>
                </span>
              </TButton>
            </TListItem>
            <p v-if="!filteredEntries.length" class="formula-function-browser__empty" role="status">
              {{ t("formulaTools.noFunctions") }}
            </p>
          </TList>
        </section>
      </div>
      <section v-if="selectedEntry" class="formula-function-browser__details narrow-scrollbar">
        <div class="formula-function-browser__detail-heading">
          <h3>{{ selectedEntry.name }}</h3>
          <span>{{ getFormulaCategoryLabel(selectedEntry.category, (key) => t(key)) }}</span>
        </div>
        <p class="formula-function-browser__description">{{ selectedEntry.description }}</p>
        <dl class="formula-function-browser__examples">
          <div>
            <dt>{{ t("formulaTools.syntax") }}</dt>
            <dd>
              <code>{{ selectedEntry.signature }}</code>
            </dd>
          </div>
          <div>
            <dt>{{ t("formulaTools.example") }}</dt>
            <dd>
              <code>{{ selectedEntry.example }}</code>
            </dd>
          </div>
        </dl>
      </section>
    </div>
    <template #footer>
      <div class="formula-function-browser__actions" :data-cell-edit-session="editSessionId">
        <TButton variant="outline" @click="emit('close')">{{ t("formulaTools.cancel") }}</TButton>
        <TButton theme="primary" :disabled="!selectedEntry" @click="insert()">
          {{ t("formulaTools.insertFunction") }}
        </TButton>
      </div>
    </template>
  </Drawer>
</template>

<style scoped lang="scss">
.formula-function-browser {
  &__content {
    display: flex;
    flex-direction: column;
    gap: 16px;
    height: 100%;
    min-height: 0;
    color: var(--idea-text-primary);
    font: inherit;
  }
  &__body {
    display: grid;
    flex: 1;
    grid-template-columns: 144px minmax(0, 1fr);
    gap: 16px;
    min-height: 180px;
  }
  &__group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
    min-height: 0;
    h3 {
      margin: 0;
      font-size: var(--idea-font-size-body-medium);
      font-weight: var(--idea-font-weight-semibold);
      line-height: var(--idea-line-height-body-medium);
    }
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
    justify-content: flex-start;
    width: 100%;
    height: auto;
    min-height: 48px;
    padding: 5px 8px;
    text-align: left;
    white-space: normal;
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
    display: grid;
    gap: 2px;
    min-width: 0;
    text-align: left;
    strong {
      font-weight: var(--idea-font-weight-semibold);
      line-height: var(--idea-line-height-body-medium);
    }
    span {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 1;
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-body-small);
      line-height: var(--idea-line-height-body-small);
    }
  }
  &__empty {
    margin: 0;
    padding: 24px 8px;
    color: var(--idea-text-secondary);
    text-align: center;
  }
  &__details {
    flex: none;
    max-height: 32vh;
    overflow: auto;
    padding: 16px;
    background: var(--idea-surface-secondary);
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
  }
  &__detail-heading {
    display: flex;
    align-items: baseline;
    gap: 12px;
    h3 {
      margin: 0;
      font-size: var(--idea-font-size-heading);
      line-height: var(--idea-line-height-heading);
      font-weight: var(--idea-font-weight-semibold);
    }
    > span {
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-body-small);
    }
  }
  &__description {
    margin: 8px 0 12px;
    line-height: var(--idea-line-height-body-medium);
  }
  &__examples {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    margin: 0;
    dt {
      margin-bottom: 4px;
      color: var(--idea-text-secondary);
      font-size: var(--idea-font-size-body-small);
    }
    dd {
      margin: 0;
      padding: 8px;
      background: var(--idea-surface-panel);
      border: 1px solid var(--idea-border-subtle);
      border-radius: var(--idea-radius-small);
      line-height: var(--idea-line-height-body-medium);
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    code {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: var(--idea-font-size-body-medium);
    }
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
}
@media (max-width: 480px) {
  .formula-function-browser {
    &__body {
      grid-template-columns: 112px minmax(0, 1fr);
      gap: 8px;
    }
    &__examples {
      grid-template-columns: minmax(0, 1fr);
    }
  }
}
</style>
