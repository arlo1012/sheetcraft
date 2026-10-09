<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Check, ListFilter } from "lucide-vue-next";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import type { FilterPanelSettings } from "../filter-panel-settings";

const props = withDefaults(
  defineProps<{
    settings: FilterPanelSettings;
    disabled?: boolean;
    mergedCellSettings?: boolean;
  }>(),
  { mergedCellSettings: true },
);
const emit = defineEmits<{ change: [settings: FilterPanelSettings] }>();
const { t } = useAppI18n();
const buttonRef = ref<HTMLElement | null>(null);
const triggerRef = computed<HTMLElement | null>(() => buttonRef.value);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `filter-settings-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => Boolean(props.disabled)),
  placement: "bottom-end",
});
defineExpose({ rootElement: computed(() => surfaceRef.value?.rootElement ?? null) });

function toggle(
  key: "showItemCount" | "showTotalCount" | "showCriteria" | "checkedFirst" | "allowMergedCells",
): void {
  emit("change", { ...props.settings, [key]: !props.settings[key] });
}

function sort(sortField: "name" | "count", sortDirection: "ascending" | "descending"): void {
  emit("change", { ...props.settings, sortField, sortDirection });
  dismiss("programmatic", true);
}

function isSelectedSort(
  sortField: "name" | "count",
  sortDirection: "ascending" | "descending",
): boolean {
  return props.settings.sortField === sortField && props.settings.sortDirection === sortDirection;
}
</script>

<template>
  <span
    ref="buttonRef"
    v-icon-action="disabled"
    class="filter-settings-menu__trigger"
    :aria-label="t('dataTools.filter.settings')"
    :title="t('dataTools.filter.settings')"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="menuId"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <ListFilter class="idea-action-icon" aria-hidden="true" />
  </span>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="surfaceRef"
      class="filter-settings-menu"
      :label="t('dataTools.filter.settings')"
      :style="floatingStyles"
      @keydown.esc.stop.prevent="dismiss('escape', true)"
    >
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="settings.showItemCount"
        @select="toggle('showItemCount')"
      >
        <template #icon><Check v-if="settings.showItemCount" /></template>
        {{ t("dataTools.filter.showItemCount") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="settings.showTotalCount"
        @select="toggle('showTotalCount')"
      >
        <template #icon><Check v-if="settings.showTotalCount" /></template>
        {{ t("dataTools.filter.showTotalCount") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="settings.showCriteria"
        @select="toggle('showCriteria')"
      >
        <template #icon><Check v-if="settings.showCriteria" /></template>
        {{ t("dataTools.filter.showCriteria") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="settings.checkedFirst"
        @select="toggle('checkedFirst')"
      >
        <template #icon><Check v-if="settings.checkedFirst" /></template>
        {{ t("dataTools.filter.checkedFirst") }}
      </MenuItem>
      <template v-if="mergedCellSettings">
        <MenuSeparator />
        <MenuItem
          role="menuitemcheckbox"
          :aria-checked="settings.allowMergedCells"
          @select="toggle('allowMergedCells')"
        >
          <template #icon><Check v-if="settings.allowMergedCells" /></template>
          {{ t("dataTools.filter.allowMergedCells") }}
        </MenuItem>
      </template>
      <MenuSeparator />
      <MenuItem
        role="menuitemradio"
        :aria-checked="isSelectedSort('count', 'descending')"
        @select="sort('count', 'descending')"
      >
        <template #icon><Check v-if="isSelectedSort('count', 'descending')" /></template>
        {{ t("dataTools.filter.sortCountDescending") }}
      </MenuItem>
      <MenuItem
        role="menuitemradio"
        :aria-checked="isSelectedSort('name', 'ascending')"
        @select="sort('name', 'ascending')"
      >
        <template #icon><Check v-if="isSelectedSort('name', 'ascending')" /></template>
        {{ t("dataTools.filter.sortNameAscending") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.filter-settings-menu {
  z-index: var(--sheetcraft-layer-popover-submenu);

  &__trigger {
    width: 24px;
    height: 24px;
  }
}
</style>
