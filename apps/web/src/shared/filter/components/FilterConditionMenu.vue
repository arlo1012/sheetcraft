<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Filter } from "lucide-vue-next";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type { FilterConditionAction } from "../filter-condition-actions";

const props = withDefaults(
  defineProps<{
    kind: "text" | "number" | "date";
    disabled?: boolean;
    label?: string;
    statistics?: boolean;
    filterTarget?: "label" | "value";
    rankLabel?: string;
  }>(),
  { disabled: false, statistics: true },
);
const emit = defineEmits<{ select: [action: FilterConditionAction] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof TButton> | null>(null);
const triggerRef = computed<HTMLElement | null>(() => buttonRef.value?.$el ?? null);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `filter-condition-${useId().replaceAll(":", "")}`;
const label = computed(() => props.label ?? t(`dataTools.filter.${props.kind}Filters`));
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => props.disabled),
  placement: "bottom-start",
});
defineExpose({ rootElement: computed(() => surfaceRef.value?.rootElement ?? null) });

function select(action: FilterConditionAction): void {
  dismiss("programmatic", false);
  emit("select", action);
}
</script>

<template>
  <TButton
    ref="buttonRef"
    variant="text"
    theme="default"
    size="small"
    :disabled="disabled"
    :aria-label="label"
    :title="label"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="menuId"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <template #icon><Filter class="sheetcraft-action-icon" aria-hidden="true" /></template>
    {{ label }}
  </TButton>
  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="surfaceRef"
      class="filter-condition-menu"
      :label="label"
      :style="floatingStyles"
      @keydown.esc.stop.prevent="dismiss('escape', true)"
    >
      <MenuItem data-filter-condition-action="equals" @select="select('equals')">{{
        t("dataTools.filter.equals")
      }}</MenuItem>
      <MenuItem data-filter-condition-action="notEquals" @select="select('notEquals')">{{
        t("dataTools.filter.notEquals")
      }}</MenuItem>
      <template v-if="filterTarget === 'label' || kind === 'text'">
        <MenuSeparator />
        <MenuItem data-filter-condition-action="beginsWith" @select="select('beginsWith')">{{
          t("dataTools.filter.beginsWith")
        }}</MenuItem>
        <MenuItem
          data-filter-condition-action="doesNotBeginWith"
          @select="select('doesNotBeginWith')"
          >{{ t("dataTools.filter.doesNotBeginWith") }}</MenuItem
        >
        <MenuItem data-filter-condition-action="endsWith" @select="select('endsWith')">{{
          t("dataTools.filter.endsWith")
        }}</MenuItem>
        <MenuItem
          data-filter-condition-action="doesNotEndWith"
          @select="select('doesNotEndWith')"
          >{{ t("dataTools.filter.doesNotEndWith") }}</MenuItem
        >
        <MenuItem data-filter-condition-action="contains" @select="select('contains')">{{
          t("dataTools.filter.contains")
        }}</MenuItem>
        <MenuItem
          data-filter-condition-action="doesNotContain"
          @select="select('doesNotContain')"
          >{{ t("dataTools.filter.doesNotContain") }}</MenuItem
        >
      </template>
      <MenuSeparator />
      <MenuItem data-filter-condition-action="greaterThan" @select="select('greaterThan')">{{
        t("dataTools.filter.greaterThan")
      }}</MenuItem>
      <MenuItem
        data-filter-condition-action="greaterThanOrEqual"
        @select="select('greaterThanOrEqual')"
        >{{ t("dataTools.filter.greaterThanOrEqual") }}</MenuItem
      >
      <MenuItem data-filter-condition-action="lessThan" @select="select('lessThan')">{{
        t("dataTools.filter.lessThan")
      }}</MenuItem>
      <MenuItem
        data-filter-condition-action="lessThanOrEqual"
        @select="select('lessThanOrEqual')"
        >{{ t("dataTools.filter.lessThanOrEqual") }}</MenuItem
      >
      <MenuSeparator />
      <MenuItem data-filter-condition-action="between" @select="select('between')">{{
        t("dataTools.filter.between")
      }}</MenuItem>
      <MenuItem data-filter-condition-action="notBetween" @select="select('notBetween')">{{
        t("dataTools.filter.notBetween")
      }}</MenuItem>
      <template
        v-if="
          (kind === 'number' && statistics && filterTarget !== 'label') || filterTarget === 'value'
        "
      >
        <MenuSeparator />
        <MenuItem data-filter-condition-action="rank" @select="select('rank')">{{
          rankLabel ?? t("dataTools.filter.topItems")
        }}</MenuItem>
        <template v-if="!filterTarget">
          <MenuItem data-filter-condition-action="aboveAverage" @select="select('aboveAverage')">{{
            t("dataTools.filter.aboveAverage")
          }}</MenuItem>
          <MenuItem data-filter-condition-action="belowAverage" @select="select('belowAverage')">{{
            t("dataTools.filter.belowAverage")
          }}</MenuItem>
        </template>
      </template>
      <template v-if="!filterTarget">
        <MenuSeparator />
        <MenuItem data-filter-condition-action="custom" @select="select('custom')">{{
          t("dataTools.filter.customFilter")
        }}</MenuItem>
      </template>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.filter-condition-menu {
  z-index: var(--sheetcraft-layer-popover-submenu);
}
</style>
