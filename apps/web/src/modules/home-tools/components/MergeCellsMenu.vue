<script setup lang="ts">
import {
  ArrowDown,
  ArrowRight,
  ChevronRight,
  Combine,
  Equal,
  Rows3,
  SplitSquareVertical,
  TableCellsMerge,
  TextAlignCenter,
} from "lucide-vue-next";
import { computed, nextTick, ref, useId } from "vue";
import type { CellMergeMode } from "@idea10/core/commands";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonSplitButton from "../../../shared/ribbon/RibbonSplitButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type { MergeCellsState } from "./data-tool-state";

defineOptions({ inheritAttrs: false });

const props = defineProps<{ state: MergeCellsState; disabled: boolean }>();
const emit = defineEmits<{ merge: [mode: CellMergeMode]; unmerge: [] }>();
const { t } = useAppI18n();
const splitActionRef = ref<InstanceType<typeof RibbonSplitButton> | null>(null);
const triggerRef = computed(() => splitActionRef.value?.menuElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const sameSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const sameRef = computed<HTMLElement | null>(() => sameSurfaceRef.value?.rootElement ?? null);
const sameAnchorRef = computed<HTMLElement | null>(
  () => menuRef.value?.querySelector<HTMLElement>('[data-merge-action="same"]') ?? null,
);
const sameOpen = ref(false);
const menuId = `merge-cells-menu-${useId().replaceAll(":", "")}`;
const sameMenuId = `merge-cells-same-${useId().replaceAll(":", "")}`;

function isModeAvailable(mode: CellMergeMode): boolean {
  return props.state.availableModes?.[mode] ?? props.state.canMerge;
}

const sameEnabled = computed(() => isModeAvailable("same-columns") || isModeAvailable("same-rows"));
const menuDisabled = computed(
  () =>
    props.disabled ||
    (!isModeAvailable("center") &&
      !isModeAvailable("all") &&
      !sameEnabled.value &&
      !isModeAvailable("content") &&
      !isModeAvailable("across") &&
      !props.state.canUnmerge),
);
const mainDisabled = computed(() => props.disabled || !isModeAvailable("all"));
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: menuDisabled,
  additionalInside: () => [splitActionRef.value?.rootElement, sameRef.value],
  onDismiss: () => {
    sameOpen.value = false;
  },
  onOpen: () => {
    sameOpen.value = false;
  },
});
const { floatingStyles: sameStyles } = useFloatingPanel(sameAnchorRef, sameRef, sameOpen, {
  placement: "right-start",
  offset: 4,
});

function closeAll(restoreFocus: boolean): void {
  dismiss("programmatic", restoreFocus);
}

function openSameMenu(): void {
  if (!sameEnabled.value || props.disabled) return;
  sameOpen.value = true;
  void nextTick(() => sameSurfaceRef.value?.focusFirstItem());
}

function closeSameMenu(restoreFocus: boolean): void {
  sameOpen.value = false;
  if (restoreFocus) void nextTick(() => sameAnchorRef.value?.focus());
}

function merge(mode: CellMergeMode, restoreFocus = true): void {
  if (props.disabled || !isModeAvailable(mode)) return;
  emit("merge", mode);
  closeAll(restoreFocus);
}

function unmerge(): void {
  if (props.disabled || !props.state.canUnmerge) return;
  emit("unmerge");
  closeAll(true);
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    closeAll(true);
    return;
  }
  if (event.key === "ArrowRight" && document.activeElement === sameAnchorRef.value) {
    event.preventDefault();
    openSameMenu();
  }
}

function onMenuFocusin(event: FocusEvent): void {
  const target = event.target instanceof Element ? event.target : null;
  if (sameOpen.value && !target?.closest('[data-merge-action="same"]')) {
    closeSameMenu(false);
  }
}

function onSameMenuKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" && event.key !== "ArrowLeft") return;
  event.preventDefault();
  event.stopPropagation();
  closeSameMenu(true);
}
</script>

<template>
  <span v-bind="$attrs" class="ribbon-menu-tool ribbon-menu-tool--full-width">
    <RibbonSplitButton
      ref="splitActionRef"
      :label="t('ribbon.mergeCells')"
      :menu-label="t('ribbon.moreOptions', { tool: t('ribbon.mergeCells') })"
      :text="t('ribbon.merge')"
      :disabled="mainDisabled"
      :menu-disabled="menuDisabled"
      :expanded="open"
      :menu-id="menuId"
      data-ribbon-action="merge-cells"
      full-width
      @activate="merge('all', false)"
      @toggle-menu="toggleMenu"
      @menu-keydown="onTriggerKeydown"
    >
      <TableCellsMerge aria-hidden="true" />
    </RibbonSplitButton>

    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="merge-cells-menu"
        :style="floatingStyles"
        :label="t('ribbon.mergeCells')"
        @focusin="onMenuFocusin"
        @keydown="onMenuKeydown"
      >
        <MenuItem
          data-merge-action="center"
          :disabled="!isModeAvailable('center')"
          @select="merge('center')"
        >
          <template #icon><TextAlignCenter :size="15" /></template>
          {{ t("ribbon.mergeCenter") }}
        </MenuItem>
        <MenuItem
          data-merge-action="merge"
          :disabled="!isModeAvailable('all')"
          @select="merge('all')"
        >
          <template #icon><TableCellsMerge :size="15" :stroke-width="1.5" /></template>
          {{ t("ribbon.mergeCells") }}
        </MenuItem>
        <MenuItem
          data-merge-action="same"
          aria-haspopup="menu"
          :aria-expanded="sameOpen"
          :aria-controls="sameOpen ? sameMenuId : undefined"
          :disabled="!sameEnabled"
          @select="openSameMenu"
        >
          <template #icon><Equal :size="15" /></template>
          {{ t("ribbon.mergeSame") }}
          <template #shortcut><ChevronRight :size="15" aria-hidden="true" /></template>
        </MenuItem>
        <MenuItem
          data-merge-action="content"
          :disabled="!isModeAvailable('content')"
          @select="merge('content')"
        >
          <template #icon><Combine :size="15" /></template>
          {{ t("ribbon.mergeContent") }}
        </MenuItem>
        <MenuItem
          data-merge-action="across"
          :disabled="!isModeAvailable('across')"
          :title="t('ribbon.mergeAcrossDescription')"
          :aria-description="t('ribbon.mergeAcrossDescription')"
          @select="merge('across')"
        >
          <template #icon><Rows3 :size="15" /></template>
          {{ t("ribbon.mergeAcross") }}
        </MenuItem>
        <MenuSeparator />
        <MenuItem data-merge-action="unmerge" :disabled="!state.canUnmerge" @select="unmerge">
          <template #icon><SplitSquareVertical :size="15" :stroke-width="1.5" /></template>
          {{ t("ribbon.unmergeCells") }}
        </MenuItem>
      </MenuSurface>

      <MenuSurface
        v-if="sameOpen"
        :id="sameMenuId"
        ref="sameSurfaceRef"
        class="merge-cells-menu merge-cells-menu--same"
        :style="sameStyles"
        :label="t('ribbon.mergeSame')"
        data-merge-submenu="same"
        @keydown="onSameMenuKeydown"
      >
        <MenuItem
          data-merge-action="same-columns"
          :disabled="!isModeAvailable('same-columns')"
          @select="merge('same-columns')"
        >
          <template #icon><ArrowDown :size="15" /></template>
          {{ t("ribbon.mergeSameColumns") }}
        </MenuItem>
        <MenuItem
          data-merge-action="same-rows"
          :disabled="!isModeAvailable('same-rows')"
          @select="merge('same-rows')"
        >
          <template #icon><ArrowRight :size="15" /></template>
          {{ t("ribbon.mergeSameRows") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.ribbon-menu-tool {
  @include ribbon.tool;

  &--full-width {
    width: 100%;
  }
}

.merge-cells-menu {
  position: fixed;
  z-index: 80;

  &--same {
    z-index: 81;
  }
}
</style>
