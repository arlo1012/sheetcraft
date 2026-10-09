<script setup lang="ts">
import { Check, ListChecks } from "lucide-vue-next";
import { ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type { StatusBarNumberFormat, StatusBarSettings } from "../composables/useStatusBarSettings";

const props = defineProps<{ modelValue: StatusBarSettings }>();
const emit = defineEmits<{ "update:modelValue": [value: StatusBarSettings] }>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `status-bar-settings-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  offset: 4,
  placement: "top-start",
});

function toggleStatistic(
  statistic: "average" | "count" | "numericCount" | "minimum" | "maximum" | "sum",
): void {
  emit("update:modelValue", { ...props.modelValue, [statistic]: !props.modelValue[statistic] });
}

function selectNumberFormat(numberFormat: StatusBarNumberFormat): void {
  emit("update:modelValue", {
    ...props.modelValue,
    numberFormat: props.modelValue.numberFormat === numberFormat ? "none" : numberFormat,
  });
}
</script>

<template>
  <span
    v-icon-action
    ref="triggerRef"
    class="workbook-status-bar-settings__trigger"
    :aria-label="t('statusBar.statisticsSettings')"
    :title="t('statusBar.statisticsSettings')"
    :aria-controls="open ? menuId : undefined"
    :aria-expanded="open"
    aria-haspopup="menu"
    data-status-bar-settings-trigger
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <ListChecks :size="16" aria-hidden="true" />
  </span>

  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="workbook-status-bar-settings__menu"
      :style="floatingStyles"
      :label="t('statusBar.statisticsOptions')"
      data-status-bar-settings-menu
    >
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="modelValue.average"
        data-status-bar-statistic="average"
        @select="toggleStatistic('average')"
      >
        <template #icon><Check v-if="modelValue.average" :size="15" /></template>
        {{ t("statusBar.settings.average") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="modelValue.count"
        data-status-bar-statistic="count"
        @select="toggleStatistic('count')"
      >
        <template #icon><Check v-if="modelValue.count" :size="15" /></template>
        {{ t("statusBar.settings.count") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="modelValue.numericCount"
        data-status-bar-statistic="numeric-count"
        @select="toggleStatistic('numericCount')"
      >
        <template #icon><Check v-if="modelValue.numericCount" :size="15" /></template>
        {{ t("statusBar.settings.numericCount") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="modelValue.minimum"
        data-status-bar-statistic="minimum"
        @select="toggleStatistic('minimum')"
      >
        <template #icon><Check v-if="modelValue.minimum" :size="15" /></template>
        {{ t("statusBar.settings.minimum") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="modelValue.maximum"
        data-status-bar-statistic="maximum"
        @select="toggleStatistic('maximum')"
      >
        <template #icon><Check v-if="modelValue.maximum" :size="15" /></template>
        {{ t("statusBar.settings.maximum") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="modelValue.sum"
        data-status-bar-statistic="sum"
        @select="toggleStatistic('sum')"
      >
        <template #icon><Check v-if="modelValue.sum" :size="15" /></template>
        {{ t("statusBar.settings.sum") }}
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="modelValue.numberFormat === 'chinese-unit'"
        data-status-bar-number-format="chinese-unit"
        @select="selectNumberFormat('chinese-unit')"
      >
        <template #icon
          ><Check v-if="modelValue.numberFormat === 'chinese-unit'" :size="15"
        /></template>
        {{ t("statusBar.useChineseUnitGrouping") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="modelValue.numberFormat === 'thousands'"
        data-status-bar-number-format="thousands"
        @select="selectNumberFormat('thousands')"
      >
        <template #icon
          ><Check v-if="modelValue.numberFormat === 'thousands'" :size="15"
        /></template>
        {{ t("statusBar.useThousandsSeparator") }}
      </MenuItem>
      <MenuItem
        role="menuitemcheckbox"
        :aria-checked="modelValue.numberFormat === 'ten-thousands'"
        data-status-bar-number-format="ten-thousands"
        @select="selectNumberFormat('ten-thousands')"
      >
        <template #icon
          ><Check v-if="modelValue.numberFormat === 'ten-thousands'" :size="15"
        /></template>
        {{ t("statusBar.useTenThousandsGrouping") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.workbook-status-bar-settings {
  &__trigger {
    display: grid;
    width: 30px;
    height: 100%;
    padding: 0;
    place-items: center;
    border: 0;
    border-right: 1px solid var(--sheetcraft-sheet-bar-border);
    background: transparent;
    color: var(--sheetcraft-text-secondary);
    cursor: pointer;
  }

  &__menu {
    z-index: var(--sheetcraft-layer-menu);
  }
}
</style>
