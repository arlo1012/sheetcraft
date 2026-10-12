<script setup lang="ts">
import { computed, ref } from "vue";
import type { FloatingReference } from "../../../shared/floating/useFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";
import { useContextMenu } from "../../../shared/menu/useContextMenu";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";

const props = withDefaults(
  defineProps<{
    anchor: FloatingReference;
    readOnly?: boolean;
    sourceOperationsDisabled?: boolean;
    previewDisabled?: boolean;
    sourceUnavailable?: boolean;
    sourceToolsDisabled?: boolean;
  }>(),
  {
    readOnly: false,
  },
);
const emit = defineEmits<{
  convertToCell: [];
  preview: [];
  replace: [];
  save: [];
  crop: [];
  annotate: [];
  format: [];
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
const { floatingStyles } = useContextMenu({
  anchor: menuAnchor,
  panelRef: menuRef,
  open: menuOpen,
  surfaceRef: menuSurfaceRef,
  offset: 4,
  onDismiss: ({ restoreFocus }) => emit("close", restoreFocus),
});

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
      data-floating-image-context-menu
      :style="floatingStyles"
      :label="t('image.contextMenuActions')"
      @click.stop
      @keydown.stop="onKeydown"
      @contextmenu.prevent.stop
    >
      <MenuItem
        data-floating-image-action="preview"
        :disabled="sourceToolsDisabled || (previewDisabled ?? sourceOperationsDisabled)"
        :title="
          sourceToolsDisabled || (previewDisabled ?? sourceOperationsDisabled)
            ? t('image.sourceOperationsUnavailable')
            : undefined
        "
        @select="emit('preview')"
      >
        {{ t("image.preview") }}
      </MenuItem>
      <MenuItem
        data-floating-image-action="replace"
        :disabled="readOnly || sourceToolsDisabled"
        @select="emit('replace')"
        >{{ t("image.replace") }}</MenuItem
      >
      <MenuItem
        data-floating-image-action="save"
        :disabled="sourceUnavailable || sourceToolsDisabled"
        @select="emit('save')"
        >{{ t("picture.saveAsPicture") }}</MenuItem
      >
      <MenuItem
        data-floating-image-action="crop"
        :disabled="readOnly || sourceUnavailable || sourceToolsDisabled"
        @select="emit('crop')"
        >{{ t("image.crop") }}</MenuItem
      >
      <MenuItem
        data-floating-image-action="annotate"
        :disabled="readOnly || sourceUnavailable || sourceToolsDisabled"
        @select="emit('annotate')"
        >{{ t("picture.annotate") }}</MenuItem
      >
      <MenuItem
        data-floating-image-action="format"
        :disabled="sourceToolsDisabled"
        @select="emit('format')"
        >{{ t("pictureFormat.paneTitle") }}</MenuItem
      >
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
        :disabled="readOnly || sourceOperationsDisabled"
        :title="sourceOperationsDisabled ? t('image.sourceOperationsUnavailable') : undefined"
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
  z-index: var(--sheetcraft-layer-context-menu);
}
</style>
