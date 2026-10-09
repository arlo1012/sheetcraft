<script setup lang="ts">
import { Input as TInput } from "tdesign-vue-next/es/input";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
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
const triggerRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerElement = computed(() => triggerRef.value?.rootElement ?? null);
const menuRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const panelRef = computed(() => menuRef.value?.rootElement ?? null);
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
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerElement, panelRef, open, {
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
    <RibbonMenuButton
      ref="triggerRef"
      variant="tall"
      :label="label"
      :text="label"
      :disabled="disabled"
      :expanded="open"
      :menu-id="panelId"
      @activate="toggle"
      @keydown="onTriggerKeydown"
    >
      <slot name="icon" />
    </RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="panelId"
        ref="menuRef"
        class="formula-category-menu__panel"
        :class="{ 'formula-category-menu__panel--searchable': hasSearch }"
        :label="label"
        :style="floatingStyles"
        :data-cell-edit-session="editSessionId"
      >
        <template v-if="hasSearch" #header>
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
        </template>
        <template #items>
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
        </template>
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.formula-category-menu {
  display: contents;

  &__panel {
    max-width: calc(100vw - 24px);
    max-height: min(360px, calc(100vh - 24px));

    &--searchable {
      width: min(320px, calc(100vw - var(--sheetcraft-space-4) - var(--sheetcraft-space-4)));
    }
  }

  &__search {
    flex: none;
    padding: 0 8px 6px;
  }

  &__empty {
    padding: 6px 14px;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
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
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    text-overflow: ellipsis;
    white-space: nowrap;

    &::before {
      content: " — ";
    }
  }
}
</style>
