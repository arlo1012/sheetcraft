<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import {
  getFormulaCatalogEntries,
  getFormulaCategoryLabel,
  type FormulaCatalogTranslator,
} from "../../../shared/formula-editing/function-catalog";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

const props = withDefaults(
  defineProps<{
    category: string;
    disabled?: boolean;
    editSessionId?: string;
  }>(),
  { disabled: false, editSessionId: undefined },
);
const emit = defineEmits<{ insertFunction: [name: string] }>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const panelRef = ref<HTMLElement | null>(null);
const menuRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const searchInputRef = ref<{ focus(): void } | null>(null);
const open = ref(false);
const query = ref("");
const panelId = `formula-category-${props.category.toLowerCase()}-${useId().replaceAll(":", "")}`;
const translate = ((key) => t(key)) as FormulaCatalogTranslator;
const functions = computed(() =>
  getFormulaCatalogEntries(translate).filter((entry) => entry.category === props.category),
);
const label = computed(() => getFormulaCategoryLabel(props.category, (key) => t(key)));
const hasSearch = computed(() => functions.value.length >= 8);
const matchingFunctions = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase();
  if (!normalizedQuery) return functions.value;
  return functions.value.filter((entry) =>
    `${entry.name} ${entry.description} ${entry.signature}`
      .toLocaleLowerCase()
      .includes(normalizedQuery),
  );
});
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, panelRef, open, {
  placement: "bottom-start",
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});

function choose(name: string): void {
  dismiss("programmatic", true);
  emit("insertFunction", name);
}

function openMenu(): void {
  query.value = "";
  open.value = true;
  if (hasSearch.value) void nextTick(() => searchInputRef.value?.focus());
}

function toggle(): void {
  if (props.disabled || !functions.value.length) return;
  if (open.value) dismiss("programmatic", true);
  else openMenu();
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (
    props.disabled ||
    !functions.value.length ||
    (event.key !== "ArrowDown" && event.key !== "ArrowUp")
  ) {
    return;
  }
  event.preventDefault();
  openMenu();
  void nextTick(() => {
    if (event.key === "ArrowDown") menuRef.value?.focusFirstItem();
    else menuRef.value?.focusLastItem();
  });
}

function onSearchKeydown(_value: string | number, { e: event }: { e: KeyboardEvent }): void {
  if (event.key === "ArrowDown" && matchingFunctions.value.length) {
    event.preventDefault();
    menuRef.value?.focusFirstItem();
  }
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) open.value = false;
  },
);
watch(open, (isOpen) => {
  if (!isOpen) query.value = "";
});
</script>

<template>
  <div v-if="functions.length" class="formula-category-menu">
    <button
      ref="triggerRef"
      class="formula-category-menu__trigger"
      type="button"
      :disabled="disabled"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      @click="toggle"
      @keydown="onTriggerKeydown"
    >
      <span class="formula-category-menu__icon" aria-hidden="true"><slot name="icon" /></span>
      <span class="formula-category-menu__label">{{ label }}</span>
      <ChevronDown :size="13" aria-hidden="true" />
    </button>
    <Teleport to="body">
      <div
        v-if="open"
        :id="panelId"
        ref="panelRef"
        class="formula-category-menu__panel"
        role="presentation"
        tabindex="-1"
        :style="floatingStyles"
        :data-cell-edit-session="editSessionId"
      >
        <MenuSurface ref="menuRef" :label="label">
          <li v-if="hasSearch" class="formula-category-menu__controls" role="presentation">
            <div class="formula-category-menu__search">
              <TInput
                ref="searchInputRef"
                v-model="query"
                type="search"
                clearable
                :aria-label="t('formulaTools.searchFunctions')"
                :placeholder="t('formulaTools.searchFunctions')"
                data-formula-category-search
                @keydown="onSearchKeydown"
              />
            </div>
          </li>
          <MenuItem
            v-for="entry in matchingFunctions"
            :key="entry.name"
            :data-formula-function="entry.name"
            @select="choose(entry.name)"
          >
            <span class="formula-category-menu__name">{{ entry.name }}</span>
            <span class="formula-category-menu__description">{{ entry.description }}</span>
          </MenuItem>
          <li
            v-if="matchingFunctions.length === 0"
            class="formula-category-menu__empty"
            role="presentation"
          >
            {{ t("formulaTools.noFunctions") }}
          </li>
        </MenuSurface>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.formula-category-menu {
  display: contents;

  &__trigger {
    display: inline-flex;
    align-items: center;
    width: 100%;
    min-height: 26px;
    gap: 5px;
    padding: 0 4px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--idea-text-primary);
    font: inherit;
    font-size: var(--idea-font-size-body-medium);
    line-height: var(--idea-line-height-body-medium);
    text-align: left;

    &:hover:not(:disabled),
    &[aria-expanded="true"] {
      background: var(--idea-icon-button-hover-bg);
    }

    &:focus-visible {
      border-color: var(--idea-action-primary);
      outline: none;
    }
  }

  &__icon {
    display: inline-flex;
    flex: 0 0 16px;
    align-items: center;
    justify-content: center;
  }

  &__label {
    flex: 1;
    white-space: nowrap;
  }

  &__panel {
    z-index: 40;

    :deep(.idea-menu-surface) {
      max-height: min(360px, calc(100vh - 24px));
    }
  }

  &__controls {
    position: sticky;
    z-index: 1;
    top: 0;
    background: var(--idea-surface-panel);
    list-style: none;
  }

  &__search {
    padding: 0 8px 6px;
  }

  &__empty {
    padding: 6px 14px;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
    list-style: none;
  }

  &__name {
    display: inline;
    font-weight: 500;
  }

  &__description {
    display: inline;
    max-width: 240px;
    overflow: hidden;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
    text-overflow: ellipsis;
    white-space: nowrap;

    &::before {
      content: " — ";
    }
  }
}
</style>
