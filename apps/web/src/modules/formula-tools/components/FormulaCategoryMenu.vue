<script setup lang="ts">
import { Input as TInput } from "tdesign-vue-next/es/input";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
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
const panelSurfaceRef = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const panelRef = computed(() => panelSurfaceRef.value?.rootElement ?? null);
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
      class="formula-category-menu__trigger"
      :label="label"
      :text="label"
      :disabled="disabled"
      :expanded="open"
      :menu-id="panelId"
      full-width
      @activate="toggle"
      @keydown="onTriggerKeydown"
    >
      <slot name="icon" />
    </RibbonMenuButton>
    <Teleport to="body">
      <FloatingPanelSurface
        v-if="open"
        :id="panelId"
        ref="panelSurfaceRef"
        class="formula-category-menu__panel"
        :label="label"
        :style="floatingStyles"
        padding="menu"
        :scrollable="false"
        :data-cell-edit-session="editSessionId"
      >
        <div v-if="hasSearch" class="formula-category-menu__search">
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
        <MenuSurface
          ref="menuRef"
          class="formula-category-menu__list narrow-scrollbar"
          :label="label"
        >
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
      </FloatingPanelSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.formula-category-menu {
  display: contents;

  &__trigger {
    --ribbon-labeled-action-justify: flex-start;
    --ribbon-labeled-action-padding: 4px;

    padding: 0 4px;
    text-align: left;
  }

  &__panel {
    display: flex;
    flex-direction: column;
    max-width: calc(100vw - 24px);
    max-height: min(360px, calc(100vh - 24px));
  }

  &__list {
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  &__search {
    flex: none;
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
