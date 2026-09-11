<script setup lang="ts">
import { Combine, SplitSquareVertical, TableCellsMerge } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { MergeCellsState } from "./data-tool-state";
import RibbonSplitAction from "./RibbonSplitAction.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{ state: MergeCellsState; disabled: boolean }>();
const emit = defineEmits<{ merge: []; unmerge: [] }>();
const { t } = useAppI18n();
const splitActionRef = ref<InstanceType<typeof RibbonSplitAction> | null>(null);
const triggerRef = computed(() => splitActionRef.value?.menuElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const menuId = `merge-cells-menu-${useId().replaceAll(":", "")}`;
const menuDisabled = computed(
  () => props.disabled || (!props.state.canMerge && !props.state.canUnmerge),
);
const mainDisabled = computed(() => props.disabled || !props.state.canMerge);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
  additionalInside: () => [splitActionRef.value?.rootElement],
  onDismiss: () => {
    open.value = false;
  },
});

function openMenu(focus: "first" | "last" = "first"): void {
  if (menuDisabled.value) return;
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

function merge(restoreFocus = true): void {
  if (props.disabled || !props.state.canMerge) return;
  emit("merge");
  dismiss("programmatic", restoreFocus);
}

function unmerge(): void {
  if (props.disabled || !props.state.canUnmerge) return;
  emit("unmerge");
  dismiss("programmatic", true);
}

watch(menuDisabled, (disabled) => {
  if (disabled) dismiss("programmatic", false);
});
</script>

<template>
  <RibbonSplitAction
    ref="splitActionRef"
    v-bind="$attrs"
    :label="t('ribbon.mergeCells')"
    :menu-label="t('ribbon.moreOptions', { tool: t('ribbon.mergeCells') })"
    :text="t('ribbon.mergeCells')"
    :disabled="mainDisabled"
    :menu-disabled="menuDisabled"
    :expanded="open"
    :menu-id="menuId"
    data-ribbon-action="merge-cells"
    @activate="merge(false)"
    @toggle-menu="toggleMenu"
    @menu-keydown="onTriggerKeydown"
  >
    <TableCellsMerge :size="15" aria-hidden="true" />
  </RibbonSplitAction>

  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="merge-cells-menu"
      :style="floatingStyles"
      :label="t('ribbon.mergeCells')"
    >
      <MenuItem data-merge-action="merge" :disabled="!state.canMerge" @select="merge()">
        <template #icon><Combine :size="15" /></template>
        {{ t("ribbon.mergeCells") }}
      </MenuItem>
      <MenuItem data-merge-action="unmerge" :disabled="!state.canUnmerge" @select="unmerge">
        <template #icon><SplitSquareVertical :size="15" /></template>
        {{ t("ribbon.unmergeCells") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.merge-cells-menu {
  position: fixed;
  z-index: 80;
  min-width: 168px;
}
</style>
