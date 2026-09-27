<script setup lang="ts">
import { Columns3, Rows3, Snowflake, Table2 } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";

defineOptions({ inheritAttrs: false });

const props = defineProps<{
  disabled: boolean;
  activeCell: { row: number; column: number };
  freeze: { rows: number; columns: number };
}>();
const emit = defineEmits<{
  freeze: [mode: "panes" | "top-row" | "first-column"];
  unfreeze: [];
}>();
const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `freeze-menu-${useId().replaceAll(":", "")}`;
const hasFrozenPanes = computed(() => props.freeze.rows > 0 || props.freeze.columns > 0);
const canFreezePanes = computed(() => props.activeCell.row > 0 || props.activeCell.column > 0);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});

function select(mode: "panes" | "top-row" | "first-column"): void {
  emit("freeze", mode);
  dismiss("programmatic", true);
}

function unfreeze(): void {
  emit("unfreeze");
  dismiss("programmatic", true);
}
</script>

<template>
  <span v-bind="$attrs" class="ribbon-menu-tool">
    <RibbonMenuButton
      ref="triggerComponentRef"
      :label="t('ribbon.freeze')"
      :disabled="disabled"
      :pressed="hasFrozenPanes"
      data-ribbon-action="freeze"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <Snowflake aria-hidden="true" />
    </RibbonMenuButton>

    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="freeze-menu"
        :style="floatingStyles"
        :label="t('ribbon.freeze')"
      >
        <MenuItem data-freeze-action="panes" :disabled="!canFreezePanes" @select="select('panes')">
          <template #icon><Table2 :size="15" /></template>
          {{ t("ribbon.freezePanes") }}
        </MenuItem>
        <MenuItem data-freeze-action="top-row" @select="select('top-row')">
          <template #icon><Rows3 :size="15" /></template>
          {{ t("ribbon.freezeTopRow") }}
        </MenuItem>
        <MenuItem data-freeze-action="first-column" @select="select('first-column')">
          <template #icon><Columns3 :size="15" /></template>
          {{ t("ribbon.freezeFirstColumn") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem data-freeze-action="unfreeze" :disabled="!hasFrozenPanes" @select="unfreeze">
          {{ t("ribbon.unfreeze") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.ribbon-menu-tool {
  @include ribbon.tool;
}

.freeze-menu {
  position: fixed;
  z-index: 80;
  min-width: 190px;
}
</style>
