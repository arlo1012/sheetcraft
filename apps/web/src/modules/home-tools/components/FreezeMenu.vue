<script setup lang="ts">
import { Columns3, Rows3, Snowflake, Table2 } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonIconAction from "./RibbonIconAction.vue";

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
const triggerComponentRef = ref<InstanceType<typeof RibbonIconAction> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const menuId = `freeze-menu-${useId().replaceAll(":", "")}`;
const hasFrozenPanes = computed(() => props.freeze.rows > 0 || props.freeze.columns > 0);
const canFreezePanes = computed(() => props.activeCell.row > 0 || props.activeCell.column > 0);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});

function openMenu(focus: "first" | "last" = "first"): void {
  if (props.disabled) return;
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

function select(mode: "panes" | "top-row" | "first-column"): void {
  emit("freeze", mode);
  dismiss("programmatic", true);
}

function unfreeze(): void {
  emit("unfreeze");
  dismiss("programmatic", true);
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) dismiss("programmatic", false);
  },
);
</script>

<template>
  <RibbonIconAction
    ref="triggerComponentRef"
    v-bind="$attrs"
    :label="t('ribbon.freeze')"
    :disabled="disabled"
    :pressed="hasFrozenPanes"
    disclosure
    data-ribbon-action="freeze"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    @activate="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <Snowflake :size="15" aria-hidden="true" />
  </RibbonIconAction>

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
</template>

<style scoped lang="scss">
.freeze-menu {
  position: fixed;
  z-index: 80;
  min-width: 190px;
}
</style>
