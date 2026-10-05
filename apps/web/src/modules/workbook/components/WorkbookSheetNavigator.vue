<script setup lang="ts">
import { EyeOff, Layers, Pin } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { vIconAction } from "../../../shared/focus/icon-action";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuSearch from "../../../shared/menu/MenuSearch.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import type { Sheet } from "@idea10/core/workbook";
import { getVisibleSheets } from "../sheet-navigation";

const props = defineProps<{
  sheets: readonly Sheet[];
  activeSheetId: string;
  structureProtected?: boolean;
}>();
const emit = defineEmits<{ select: [sheetId: string]; restore: [sheetId: string]; open: [] }>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const searchInputRef = ref<InstanceType<typeof MenuSearch> | null>(null);
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
  if (props.structureProtected) return;
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
  <span
    v-icon-action
    ref="triggerRef"
    class="workbook-sheet-navigator__trigger"
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
  </span>

  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="workbook-sheet-navigator__menu"
      :style="floatingStyles"
      :label="t('sheetTabs.allSheets')"
    >
      <MenuSearch
        ref="searchInputRef"
        v-model="query"
        :label="t('sheetTabs.search')"
        data-workbook-sheet-navigator="search"
        @keydown="onSearchKeydown"
      />
      <MenuRadioItem
        v-for="sheet in visibleSheets"
        :key="sheet.id"
        class="workbook-sheet-navigator__item"
        :checked="sheet.id === activeSheetId"
        :title="sheet.name"
        :data-workbook-sheet-id="sheet.id"
        @select="selectSheet(sheet.id)"
      >
        {{ sheet.name }}
        <template
          v-if="
            sheet.properties.tabColor || (sheet.properties.pinned && sheet.id !== activeSheetId)
          "
          #shortcut
        >
          <Pin v-if="sheet.properties.pinned && sheet.id !== activeSheetId" :size="13" />
          <span
            v-if="sheet.properties.tabColor"
            class="workbook-sheet-navigator__color"
            :style="{ background: sheet.properties.tabColor }"
          />
        </template>
      </MenuRadioItem>
      <template v-if="hiddenSheets.length">
        <MenuSeparator v-if="visibleSheets.length" />
        <li class="workbook-sheet-navigator__hidden-heading" role="presentation">
          {{ t("sheetTabs.hiddenSheets") }}
        </li>
        <MenuItem
          v-for="sheet in hiddenSheets"
          :key="sheet.id"
          class="workbook-sheet-navigator__item"
          :disabled="structureProtected"
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
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);

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
      background: var(--idea-icon-button-hover-bg);
    }
  }

  &__menu {
    position: fixed;
    z-index: var(--idea-layer-menu);
    display: flex;
    flex-direction: column;
    width: min(180px, calc(100vw - var(--idea-space-4) - var(--idea-space-4)));
    max-height: min(320px, calc(100vh - var(--idea-space-4) - var(--idea-space-4)));
  }

  &__item {
    flex: 0 0 auto;
    min-width: 0;
  }

  &__empty {
    padding: 6px 14px;
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
    list-style: none;
  }

  &__hidden-heading {
    flex: 0 0 auto;
    padding: 6px 14px;
    list-style: none;
    color: var(--idea-text-muted);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
    font-weight: var(--idea-font-weight-medium);
  }

  &__color {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 1px solid var(--idea-border-subtle);
  }
}
</style>
