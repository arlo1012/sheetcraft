<script setup lang="ts">
import { computed, ref } from "vue";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useContextMenu } from "../../../shared/menu/useContextMenu";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import { useAppI18n } from "../../../shared/i18n";
const props = defineProps<{ anchor: FloatingReference; readOnly: boolean; canUngroup: boolean }>();
const emit = defineEmits<{
  copy: [];
  cut: [];
  paste: [];
  delete: [];
  format: [];
  ungroup: [];
  close: [restoreFocus: boolean];
}>();
const { t } = useAppI18n();
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const { floatingStyles } = useContextMenu({
  anchor: computed(() => props.anchor),
  panelRef: computed(() => surface.value?.rootElement ?? null),
  open: computed(() => true),
  surfaceRef: surface,
  offset: 4,
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});
function onKeydown(event: KeyboardEvent): void {
  if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
  if (
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey &&
    (event.key === "Delete" || event.key === "Backspace")
  ) {
    event.preventDefault();
    if (!props.readOnly) emit("delete");
    return;
  }
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if (!["c", "x", "v"].includes(key)) return;
  event.preventDefault();
  if (key === "c") emit("copy");
  else if (!props.readOnly && key === "x") emit("cut");
  else if (!props.readOnly && key === "v") emit("paste");
}
</script>
<template>
  <Teleport to="body">
    <MenuSurface
      ref="surface"
      class="sheet-owned-picture-context-menu"
      :style="floatingStyles"
      :label="t('image.contextMenuActions')"
      data-owned-picture-context-menu
      @click.stop
      @keydown.stop="onKeydown"
      @contextmenu.prevent.stop
    >
      <MenuItem data-owned-picture-action="copy" @select="emit('copy')">
        {{ t("cellMenu.copy") }}<template #shortcut>{{ t("cellMenu.copyShortcut") }}</template>
      </MenuItem>
      <MenuItem data-owned-picture-action="cut" :disabled="readOnly" @select="emit('cut')">
        {{ t("cellMenu.cut") }}<template #shortcut>{{ t("cellMenu.cutShortcut") }}</template>
      </MenuItem>
      <MenuItem data-owned-picture-action="paste" :disabled="readOnly" @select="emit('paste')">
        {{ t("cellMenu.paste") }}<template #shortcut>{{ t("cellMenu.pasteShortcut") }}</template>
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        v-if="canUngroup"
        data-owned-picture-action="ungroup"
        :disabled="readOnly"
        @select="emit('ungroup')"
      >
        {{ t("picture.ungroup") }}
      </MenuItem>
      <MenuItem data-owned-picture-action="format" @select="emit('format')">
        {{ t("pictureFormat.paneTitle") }}
      </MenuItem>
      <MenuItem
        danger
        data-owned-picture-action="delete"
        :disabled="readOnly"
        @select="emit('delete')"
      >
        {{ t("image.deleteImage") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>
<style scoped lang="scss">
.sheet-owned-picture-context-menu {
  z-index: var(--sheetcraft-layer-context-menu);
}
</style>
