<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from "vue";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

const props = withDefaults(defineProps<{ anchor: FloatingReference; readOnly?: boolean }>(), {
  readOnly: false,
});
const emit = defineEmits<{
  convertToCell: [];
  preview: [];
  copy: [];
  cut: [];
  paste: [];
  delete: [];
  close: [restoreFocus: boolean];
}>();

const { t } = useAppI18n();
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuRef = computed<HTMLElement | null>(() => menuSurfaceRef.value?.rootElement ?? null);
const menuAnchor = computed(() => props.anchor);
const menuOpen = computed(() => true);
const { floatingStyles } = useDismissibleFloatingPanel(menuAnchor, menuRef, menuOpen, {
  offset: 4,
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});

onMounted(() => void nextTick(() => menuSurfaceRef.value?.focusFirstItem()));

function onKeydown(event: KeyboardEvent): void {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
  const key = event.key.toLowerCase();
  if (key !== "c" && key !== "x" && key !== "v") return;
  event.preventDefault();
  if (key === "c") emit("copy");
  else if (key === "x" && !props.readOnly) emit("cut");
  else if (key === "v" && !props.readOnly) emit("paste");
}
</script>

<template>
  <Teleport to="body">
    <MenuSurface
      ref="menuSurfaceRef"
      class="sheet-floating-image-context-menu"
      :style="floatingStyles"
      :label="t('image.contextMenuActions')"
      @click.stop
      @keydown.stop="onKeydown"
      @contextmenu.prevent.stop
    >
      <MenuItem data-floating-image-action="preview" @select="emit('preview')">
        {{ t("image.preview") }}
      </MenuItem>
      <MenuItem data-floating-image-action="copy" @select="emit('copy')">
        {{ t("cellMenu.copy") }}
        <template #shortcut>{{ t("cellMenu.copyShortcut") }}</template>
      </MenuItem>
      <MenuItem data-floating-image-action="cut" :disabled="readOnly" @select="emit('cut')">
        {{ t("cellMenu.cut") }}
        <template #shortcut>{{ t("cellMenu.cutShortcut") }}</template>
      </MenuItem>
      <MenuItem data-floating-image-action="paste" :disabled="readOnly" @select="emit('paste')">
        {{ t("cellMenu.paste") }}
        <template #shortcut>{{ t("cellMenu.pasteShortcut") }}</template>
      </MenuItem>
      <MenuItem
        data-floating-image-action="convert-to-cell"
        :disabled="readOnly"
        @select="emit('convertToCell')"
      >
        {{ t("image.convertToCell") }}
      </MenuItem>
      <MenuItem
        danger
        data-floating-image-action="delete"
        :disabled="readOnly"
        @select="emit('delete')"
      >
        {{ t("image.deleteImage") }}
      </MenuItem>
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-floating-image-context-menu {
  z-index: 100;
}
</style>
