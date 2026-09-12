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
    :footer="false"
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
        <TMenu
          class="formula-function-browser__categories"
          :value="selectedCategory"
          :width="150"
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
        <TList class="formula-function-browser__results" role="listbox" :split="false">
          <TListItem
            v-for="(entry, index) in filteredEntries"
            :key="entry.name"
            class="formula-function-browser__result-item"
          >
            <TButton
              class="formula-function-browser__result"
              :theme="selectedEntry?.name === entry.name ? 'primary' : 'default'"
              :variant="selectedEntry?.name === entry.name ? 'base' : 'text'"
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
          <p v-if="!filteredEntries.length" class="formula-function-browser__empty">
            {{ t("formulaTools.noFunctions") }}
          </p>
        </TList>
        <section v-if="selectedEntry" class="formula-function-browser__details">
          <h3>{{ selectedEntry.name }}</h3>
          <dl>
            <dt>{{ t("formulaTools.syntax") }}</dt>
            <dd>{{ selectedEntry.signature }}</dd>
            <dt>{{ t("formulaTools.description") }}</dt>
            <dd>{{ selectedEntry.description }}</dd>
            <dt>{{ t("formulaTools.example") }}</dt>
            <dd>{{ selectedEntry.example }}</dd>
          </dl>
          <div class="formula-function-browser__insert-action">
            <TButton block theme="primary" type="button" @click="insert()">
              {{ t("formulaTools.insertFunction") }}
            </TButton>
          </div>
        </section>
      </div>
    </div>
  </Drawer>
</template>

<style scoped lang="scss">
.formula-function-browser__content {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  color: var(--idea-text-primary);
  font: inherit;
}
.formula-function-browser__body {
  display: grid;
  grid-template-columns: 150px minmax(190px, 1fr) minmax(220px, 1.1fr);
  min-height: 0;
  margin-top: 12px;
  border-top: 1px solid var(--idea-border-subtle);
}
.formula-function-browser__categories,
.formula-function-browser__results {
  min-height: 0;
  overflow: auto;
  border-right: 1px solid var(--idea-border-subtle);
}
.formula-function-browser__result {
  width: 100%;
  min-height: 48px;
  padding: 6px 8px;
  text-align: left;
}
.formula-function-browser__result-item {
  padding: 0;
}
.formula-function-browser__result-content {
  display: grid;
  text-align: left;
  & strong {
    line-height: var(--idea-line-height-body-medium);
  }
  & span {
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
  }
}
.formula-function-browser__empty {
  padding: 8px;
  color: var(--idea-text-secondary);
}
.formula-function-browser__details {
  padding-left: 16px;
  overflow: auto;
  h3 {
    margin: 0 0 12px;
    font-size: var(--idea-font-size-heading);
    line-height: var(--idea-line-height-heading);
  }
  dl {
    display: grid;
    gap: 3px;
    margin: 0;
  }
  dt {
    margin-top: 10px;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
  }
  dd {
    margin: 0;
    line-height: var(--idea-line-height-body-medium);
    white-space: pre-wrap;
  }
}
.formula-function-browser__insert-action {
  margin-top: 18px;
}
</style>
