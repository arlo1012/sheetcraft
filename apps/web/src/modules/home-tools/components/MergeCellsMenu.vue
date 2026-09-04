<script setup lang="ts">
import { Combine, SplitSquareVertical, TableCellsMerge } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import type { MergeCellsState } from "./data-tool-state";
import RibbonIconAction from "./RibbonIconAction.vue";

defineOptions({ inheritAttrs: false });

const props = defineProps<{ state: MergeCellsState; disabled: boolean }>();
const emit = defineEmits<{ merge: []; unmerge: [] }>();
const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonIconAction> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const open = ref(false);
const menuId = `merge-cells-menu-${useId().replaceAll(":", "")}`;
const menuDisabled = computed(
  () => props.disabled || (!props.state.canMerge && !props.state.canUnmerge),
);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
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

function merge(): void {
  emit("merge");
  dismiss("programmatic", true);
}

function unmerge(): void {
  emit("unmerge");
  dismiss("programmatic", true);
}

watch(menuDisabled, (disabled) => {
  if (disabled) dismiss("programmatic", false);
});
</script>

<template>
  <RibbonIconAction
    ref="triggerComponentRef"
    v-bind="$attrs"
    :label="t('ribbon.mergeCells')"
    :text="t('ribbon.mergeCells')"
    :disabled="menuDisabled"
    disclosure
    data-ribbon-action="merge-cells"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    @activate="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <TableCellsMerge :size="15" aria-hidden="true" />
  </RibbonIconAction>

  <Teleport to="body">
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      class="merge-cells-menu"
      :style="floatingStyles"
      :label="t('ribbon.mergeCells')"
    >
      <MenuItem data-merge-action="merge" :disabled="!state.canMerge" @select="merge">
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
