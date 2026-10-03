<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Filter } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import { vIconAction } from "../../../shared/focus/icon-action";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type { FilterConditionAction } from "../filter-condition-actions";

const props = withDefaults(
  defineProps<{ kind: "text" | "number" | "date"; disabled?: boolean }>(),
  { disabled: false },
);
const emit = defineEmits<{ select: [action: FilterConditionAction] }>();
const { t } = useAppI18n();
const buttonRef = ref<HTMLElement | null>(null);
const triggerRef = computed<HTMLElement | null>(() => buttonRef.value);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `filter-condition-${useId().replaceAll(":", "")}`;
const label = computed(() => t(`dataTools.filter.${props.kind}Filters`));
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
  <span
    ref="buttonRef"
    v-icon-action="disabled"
    :aria-label="label"
    :title="label"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="menuId"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <Filter class="idea-action-icon" aria-hidden="true" />
    {{ label }}
  </span>
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
      <template v-if="kind === 'text'">
        <MenuSeparator />
        <MenuItem data-filter-condition-action="contains" @select="select('contains')">{{
          t("dataTools.filter.contains")
        }}</MenuItem>
        <MenuItem
          data-filter-condition-action="doesNotContain"
          @select="select('doesNotContain')"
          >{{ t("dataTools.filter.doesNotContain") }}</MenuItem
        >
        <MenuItem data-filter-condition-action="beginsWith" @select="select('beginsWith')">{{
          t("dataTools.filter.beginsWith")
        }}</MenuItem>
        <MenuItem data-filter-condition-action="endsWith" @select="select('endsWith')">{{
          t("dataTools.filter.endsWith")
        }}</MenuItem>
      </template>
      <template v-else>
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
        <template v-if="kind === 'number'">
          <MenuSeparator />
          <MenuItem data-filter-condition-action="rank" @select="select('rank')">{{
            t("dataTools.filter.topItems")
          }}</MenuItem>
          <MenuItem data-filter-condition-action="aboveAverage" @select="select('aboveAverage')">{{
            t("dataTools.filter.aboveAverage")
          }}</MenuItem>
          <MenuItem data-filter-condition-action="belowAverage" @select="select('belowAverage')">{{
            t("dataTools.filter.belowAverage")
          }}</MenuItem>
        </template>
      </template>
      <MenuSeparator />
      <MenuItem data-filter-condition-action="custom" @select="select('custom')">{{
        t("dataTools.filter.customFilter")
      }}</MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.filter-condition-menu {
  z-index: 2201;
}
</style>
