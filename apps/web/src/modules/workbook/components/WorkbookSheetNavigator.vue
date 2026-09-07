<script setup lang="ts">
import { Check, EyeOff, Layers, Pin } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import type { Sheet } from "@idea10/core/workbook";
import { getVisibleSheets } from "../sheet-navigation";

const props = defineProps<{
  sheets: readonly Sheet[];
  activeSheetId: string;
}>();
const emit = defineEmits<{ select: [sheetId: string]; restore: [sheetId: string]; open: [] }>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const query = ref("");
const menuId = `workbook-sheet-navigator-${useId().replaceAll(":", "")}`;
const matchingSheets = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase();
  if (!normalizedQuery) return props.sheets;
  return props.sheets.filter((sheet) => sheet.name.toLocaleLowerCase().includes(normalizedQuery));
});
const visibleSheets = computed(() => getVisibleSheets(matchingSheets.value));
const hiddenSheets = computed(() =>
  matchingSheets.value.filter((sheet) => sheet.properties.hidden),
);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  placement: "top-start",
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});

function openMenu(): void {
  query.value = "";
  open.value = true;
  emit("open");
  void nextTick(() => searchInputRef.value?.focus());
}

function toggleMenu(): void {
  if (open.value) dismiss("programmatic", true);
  else openMenu();
}

function selectSheet(sheetId: string): void {
  dismiss("programmatic", true);
  emit("select", sheetId);
}

function restoreSheet(sheetId: string): void {
  dismiss("programmatic", true);
  emit("restore", sheetId);
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openMenu();
  void nextTick(() => {
    if (event.key === "ArrowDown") menuSurfaceRef.value?.focusFirstItem();
    else menuSurfaceRef.value?.focusLastItem();
  });
}

function onSearchKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" || matchingSheets.value.length === 0) return;
  event.preventDefault();
  menuSurfaceRef.value?.focusFirstItem();
}

watch(open, (isOpen) => {
  if (!isOpen) query.value = "";
});
</script>

<template>
  <button
    ref="triggerRef"
    class="workbook-sheet-navigator__trigger"
    type="button"
    :aria-label="t('sheetTabs.allSheets')"
    :title="t('sheetTabs.allSheets')"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    data-workbook-sheet-navigator="trigger"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <Layers :size="16" aria-hidden="true" />
  </button>

  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="workbook-sheet-navigator__menu"
      :style="floatingStyles"
      :label="t('sheetTabs.allSheets')"
    >
      <li class="workbook-sheet-navigator__controls" role="presentation">
        <div class="workbook-sheet-navigator__search">
          <input
            ref="searchInputRef"
            v-model="query"
            type="search"
            :aria-label="t('sheetTabs.search')"
            :placeholder="t('sheetTabs.search')"
            data-workbook-sheet-navigator="search"
            @keydown="onSearchKeydown"
          />
        </div>
      </li>
      <MenuItem
        v-for="sheet in visibleSheets"
        :key="sheet.id"
        class="workbook-sheet-navigator__item"
        :class="{ 'is-active': sheet.id === activeSheetId }"
        role="menuitemradio"
        :aria-checked="sheet.id === activeSheetId"
        :title="sheet.name"
        :data-workbook-sheet-id="sheet.id"
        @select="selectSheet(sheet.id)"
      >
        <template #icon>
          <Check v-if="sheet.id === activeSheetId" :size="15" />
          <Pin v-else-if="sheet.properties.pinned" :size="13" />
        </template>
        {{ sheet.name }}
        <template v-if="sheet.properties.tabColor" #shortcut>
          <span
            class="workbook-sheet-navigator__color"
            :style="{ background: sheet.properties.tabColor }"
          />
        </template>
      </MenuItem>
      <template v-if="hiddenSheets.length">
        <MenuSeparator v-if="visibleSheets.length" />
        <li class="workbook-sheet-navigator__hidden-heading" role="presentation">
          {{ t("sheetTabs.hiddenSheets") }}
        </li>
        <MenuItem
          v-for="sheet in hiddenSheets"
          :key="sheet.id"
          class="workbook-sheet-navigator__item"
          :aria-label="t('sheetTabs.restoreSheet', { name: sheet.name })"
          :title="sheet.name"
          :data-workbook-hidden-sheet-id="sheet.id"
          @select="restoreSheet(sheet.id)"
        >
          <template #icon><EyeOff :size="14" /></template>
          {{ sheet.name }}
          <template #shortcut>{{ t("sheetTabs.restoreAction") }}</template>
        </MenuItem>
      </template>
      <li
        v-if="matchingSheets.length === 0"
        class="workbook-sheet-navigator__empty"
        role="presentation"
      >
        {{ t("sheetTabs.noResults") }}
      </li>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.workbook-sheet-navigator {
  &__trigger {
    display: inline-grid;
    flex: 0 0 30px;
    width: 30px;
    height: 100%;
    place-items: center;
    padding: 0;
    background: transparent;
    border: 0;
    border-right: 1px solid var(--idea-sheet-bar-border);
    border-radius: 0;
    color: var(--idea-text-secondary);
    cursor: pointer;

    &:hover,
    &[aria-expanded="true"] {
      background: var(--idea-surface-hover);
      color: var(--idea-text-primary);
    }

    &:focus-visible {
      outline: 1px solid var(--idea-action-primary);
      outline-offset: -1px;
    }
  }

  &__menu {
    position: fixed;
    z-index: 80;
    display: flex;
    flex-direction: column;
    width: min(180px, calc(100vw - var(--idea-space-4) - var(--idea-space-4)));
    max-height: min(320px, calc(100vh - var(--idea-space-4) - var(--idea-space-4)));
  }

  &__controls {
    position: sticky;
    z-index: 1;
    top: 0;
    flex: 0 0 auto;
    background: var(--idea-surface-panel);
    list-style: none;
  }

  &__search {
    flex: 0 0 auto;
    padding: 0 0 6px;
    input {
      box-sizing: border-box;
      width: 100%;
      height: 26px;
      padding: 0 8px;
      background: var(--idea-surface-canvas);
      border: 1px solid var(--idea-border-control);
      border-radius: 3px;
      color: var(--idea-text-primary);
      font: inherit;
      font-size: var(--idea-font-size-body-small);

      &:focus-visible {
        border-color: var(--idea-action-primary);
        box-shadow: 0 0 0 2px var(--idea-action-focus);
        outline: none;
      }
    }
  }

  &__item {
    flex: 0 0 auto;
    min-width: 0;

    :deep(.idea-menu-item__label) {
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &.is-active {
      background: var(--idea-action-primary-subtle);
      color: var(--idea-action-primary);
    }
  }

  &__empty {
    padding: 6px;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
    list-style: none;
  }

  &__hidden-heading {
    flex: 0 0 auto;
    padding: 6px;
    list-style: none;
    color: var(--idea-text-muted);
    font-size: var(--idea-font-size-body-small);
  }

  &__color {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--idea-border-subtle);
  }
}
</style>
