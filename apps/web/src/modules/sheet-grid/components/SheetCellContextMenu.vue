<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

const props = defineProps<{
  anchor: FloatingReference;
}>();

const emit = defineEmits<{
  cut: [];
  copy: [];
  paste: [];
  clear: [];
  close: [restoreFocus: boolean];
}>();

const { t } = useAppI18n();
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const menuOpen = computed(() => true);
const menuAnchor = computed(() => props.anchor);
const { floatingStyles } = useDismissibleFloatingPanel(menuAnchor, menuRef, menuOpen, {
  offset: 4,
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});

onMounted(() => {
  void nextTick(() => menuSurfaceRef.value?.focusFirstItem());
});

function onShortcutKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) {
    return;
  }
  const action = event.key.toLowerCase();
  if (action !== "x" && action !== "c" && action !== "v") {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  if (action === "x") {
    emit("cut");
  } else if (action === "c") {
    emit("copy");
  } else {
    emit("paste");
  }
}
</script>

<template>
  <Teleport to="body">
    <MenuSurface
      ref="menuSurfaceRef"
      class="sheet-cell-context-menu"
      :style="floatingStyles"
      :label="t('cellMenu.actions')"
      @keydown="onShortcutKeydown"
    >
      <MenuItem data-cell-action="cut" aria-keyshortcuts="Control+X Meta+X" @select="emit('cut')">
        {{ t("cellMenu.cut") }}
        <template #shortcut>{{ t("cellMenu.cutShortcut") }}</template>
      </MenuItem>
      <MenuItem data-cell-action="copy" aria-keyshortcuts="Control+C Meta+C" @select="emit('copy')">
        {{ t("cellMenu.copy") }}
        <template #shortcut>{{ t("cellMenu.copyShortcut") }}</template>
      </MenuItem>
      <MenuItem
        data-cell-action="paste"
        aria-keyshortcuts="Control+V Meta+V"
        @select="emit('paste')"
      >
        {{ t("cellMenu.paste") }}
        <template #shortcut>{{ t("cellMenu.pasteShortcut") }}</template>
      </MenuItem>
      <MenuSeparator />
      <MenuItem data-cell-action="clear" @select="emit('clear')">
        {{ t("cellMenu.clearContents") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-cell-context-menu {
  z-index: 100;
  width: 195px;
}
</style>
