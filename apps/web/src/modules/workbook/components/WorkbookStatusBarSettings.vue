<script setup lang="ts">
import { Check, ListChecks } from "lucide-vue-next";
import { computed, nextTick, ref, useId } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { StatusBarNumberFormat, StatusBarSettings } from "../composables/useStatusBarSettings";

const props = defineProps<{ modelValue: StatusBarSettings }>();
const emit = defineEmits<{ "update:modelValue": [value: StatusBarSettings] }>();
const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const menuId = `status-bar-settings-${useId().replaceAll(":", "")}`;
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
  placement: "top-start",
  onDismiss: () => {
    open.value = false;
  },
});

function openMenu(focus: "first" | "last" = "first"): void {
  open.value = true;
  void nextTick(() =>
    focus === "last"
      ? menuSurfaceRef.value?.focusLastItem()
      : menuSurfaceRef.value?.focusFirstItem(),
  );
}

function toggleMenu(): void {
  if (open.value) dismiss("programmatic", true);
  else openMenu();
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openMenu(event.key === "ArrowDown" ? "first" : "last");
}

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
  <button
    ref="triggerRef"
    class="workbook-status-bar-settings__trigger"
    type="button"
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
  </button>

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
    border-right: 1px solid var(--idea-border-subtle);
    background: transparent;
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
    min-width: 178px;
  }
}
</style>
