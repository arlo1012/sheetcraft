<script setup lang="ts">
import { Search, X } from "lucide-vue-next";
import { computed, ref } from "vue";
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
const translate = ((key) => t(key)) as FormulaCatalogTranslator;
const entries = computed(() => getFormulaCatalogEntries(translate));
const visibleCategories = computed(() =>
  FORMULA_CATEGORY_ORDER.filter((category) =>
    entries.value.some((entry) => entry.category === category),
  ),
);
const filteredEntries = computed(() => {
  const search = query.value.trim().toLowerCase();
  const recent = new Set(
    props.recentFunctions.map((name) => name.toUpperCase()),
  );
  return entries.value.filter((entry) => {
    const inCategory =
      selectedCategory.value === "all" ||
      (selectedCategory.value === "recent"
        ? recent.has(entry.name)
        : entry.category === selectedCategory.value);
    return (
      inCategory &&
      (!search ||
        `${entry.name} ${entry.description} ${entry.signature}`
          .toLowerCase()
          .includes(search))
    );
  });
});
const selectedEntry = computed(
  () =>
    filteredEntries.value.find((entry) => entry.name === selectedName.value) ??
    filteredEntries.value[0],
);

function selectCategory(category: string | "recent" | "all"): void {
  selectedCategory.value = category;
  selectedName.value = undefined;
}
function insert(name = selectedEntry.value?.name): void {
  if (name) emit("insertFunction", name);
}
</script>

<template>
  <Teleport to="body">
    <aside
      v-if="visible"
      class="formula-function-browser"
      role="dialog"
      aria-modal="false"
      tabindex="-1"
      :aria-label="t('formulaTools.functionBrowser')"
      :data-cell-edit-session="editSessionId"
    >
      <header class="formula-function-browser__header">
        <h2>{{ t("formulaTools.functionBrowser") }}</h2>
        <button
          type="button"
          :aria-label="t('formulaTools.cancel')"
          @click="emit('close')"
        >
          <X :size="16" />
        </button>
      </header>
      <label class="formula-function-browser__search">
        <Search :size="15" aria-hidden="true" />
        <input
          v-model="query"
          type="search"
          :placeholder="t('formulaTools.searchFunctions')"
        />
      </label>
      <div class="formula-function-browser__body">
        <nav :aria-label="t('formulaTools.categories')">
          <button
            :class="{ active: selectedCategory === 'all' }"
            type="button"
            @click="selectCategory('all')"
          >
            {{ t("formulaTools.allFunctions") }}
          </button>
          <button
            v-if="recentFunctions.length"
            :class="{ active: selectedCategory === 'recent' }"
            type="button"
            @click="selectCategory('recent')"
          >
            {{ t("formulaTools.recent") }}
          </button>
          <button
            v-for="category in visibleCategories"
            :key="category"
            :class="{ active: selectedCategory === category }"
            type="button"
            @click="selectCategory(category)"
          >
            {{ getFormulaCategoryLabel(category, (key) => t(key)) }}
          </button>
        </nav>
        <div class="formula-function-browser__results" role="listbox">
          <button
            v-for="entry in filteredEntries"
            :key="entry.name"
            :class="{ active: selectedEntry?.name === entry.name }"
            type="button"
            role="option"
            :aria-selected="selectedEntry?.name === entry.name"
            @click="selectedName = entry.name"
            @dblclick="insert(entry.name)"
          >
            <strong>{{ entry.name }}</strong
            ><span>{{ entry.description }}</span>
          </button>
          <p v-if="!filteredEntries.length">
            {{ t("formulaTools.noFunctions") }}
          </p>
        </div>
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
          <button
            type="button"
            class="formula-function-browser__insert"
            @click="insert()"
          >
            {{ t("formulaTools.insertFunction") }}
          </button>
        </section>
      </div>
    </aside>
  </Teleport>
</template>

<style scoped lang="scss">
.formula-function-browser {
  position: fixed;
  z-index: 50;
  top: 0;
  right: 0;
  bottom: 0;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  width: min(740px, calc(100vw - 24px));
  background: var(--idea-surface-panel);
  border-left: 1px solid var(--idea-border-subtle);
  box-shadow: var(--idea-shadow-dialog);
  color: var(--idea-text-primary);
  font: inherit;
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 8px;
    h2 {
      margin: 0;
      font-size: var(--idea-font-size-heading);
      line-height: var(--idea-line-height-heading);
    }
    button {
      display: grid;
      width: 28px;
      height: 28px;
      place-items: center;
      padding: 0;
      background: transparent;
      border: 0;
      border-radius: var(--idea-radius-default);
      color: inherit;
      &:hover {
        background: var(--idea-icon-button-hover-bg);
      }
    }
  }
  &__search {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0 16px 12px;
    padding: 3px 8px;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-default);
    color: var(--idea-text-secondary);
    input {
      width: 100%;
      height: 26px;
      padding: 0;
      background: transparent;
      border: 0;
      color: var(--idea-text-primary);
      font: inherit;
      outline: none;
    }
  }
  &__body {
    display: grid;
    grid-template-columns: 150px minmax(190px, 1fr) minmax(220px, 1.1fr);
    min-height: 0;
    border-top: 1px solid var(--idea-border-subtle);
  }
  nav {
    display: grid;
    align-content: start;
    gap: 2px;
    padding: 8px;
    border-right: 1px solid var(--idea-border-subtle);
    button {
      min-height: 28px;
      padding: 0 8px;
      overflow: hidden;
      background: transparent;
      border: 0;
      border-radius: 2px;
      color: var(--idea-text-primary);
      font: inherit;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
      &:hover,
      &.active {
        background: var(--idea-surface-hover);
      }
      &.active {
        color: var(--idea-action-primary);
        font-weight: 500;
      }
    }
  }
  &__results {
    min-height: 0;
    padding: var(--idea-menu-padding);
    overflow: auto;
    border-right: 1px solid var(--idea-border-subtle);
    button {
      display: grid;
      width: 100%;
      min-height: 48px;
      padding: 6px 8px;
      background: transparent;
      border: 0;
      border-radius: 2px;
      color: var(--idea-text-primary);
      font: inherit;
      text-align: left;
      &:hover,
      &.active {
        background: var(--idea-surface-hover);
      }
      strong {
        line-height: 20px;
      }
      span,
      p {
        color: var(--idea-text-secondary);
        font-size: var(--idea-font-size-supporting);
        line-height: var(--idea-line-height-supporting);
      }
    }
    p {
      padding: 8px;
    }
  }
  &__details {
    padding: 16px;
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
      font-size: var(--idea-font-size-supporting);
      line-height: var(--idea-line-height-supporting);
    }
    dd {
      margin: 0;
      line-height: var(--idea-line-height-body-medium);
      white-space: pre-wrap;
    }
  }
  &__insert {
    width: 100%;
    height: 28px;
    margin-top: 18px;
    background: var(--idea-action-primary);
    border: 1px solid var(--idea-action-primary);
    border-radius: var(--idea-radius-default);
    color: var(--idea-text-on-primary);
    font: inherit;
  }
}
</style>
