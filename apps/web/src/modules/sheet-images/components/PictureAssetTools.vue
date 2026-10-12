<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Minimize2, Images, Download, Printer } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type { PictureFileFormat } from "../picture-asset-conversion";
const props = defineProps<{
  disabled: boolean;
  busy: boolean;
  exportDisabled?: boolean;
  printDisabled?: boolean;
  ownerKey?: string | number;
}>();
const emit = defineEmits<{
  compress: [];
  batchSize: [];
  export: [format: PictureFileFormat, all?: boolean];
  preview: [];
  print: [];
}>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `picture-export-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.busy || props.exportDisabled),
});
watch(
  () => props.ownerKey,
  () => dismiss("programmatic", false),
);
const exportCallbacks = computed(() => {
  const owner = props.ownerKey;
  function exportImage(format: PictureFileFormat, all = false): void {
    if (owner !== props.ownerKey || props.busy || props.exportDisabled) return;
    emit("export", format, all);
    dismiss("programmatic", true);
  }
  return {
    png: () => exportImage("png"),
    jpeg: () => exportImage("jpeg"),
    webp: () => exportImage("webp"),
    all: () => exportImage("png", true),
  };
});
</script>
<template>
  <section class="picture-asset-tools" role="group" :aria-label="t('picture.files')">
    <RibbonButton
      variant="tall"
      :label="t('picture.compress')"
      :text="t('picture.compress')"
      :disabled="disabled"
      @activate="emit('compress')"
      ><Minimize2
    /></RibbonButton>
    <RibbonButton
      variant="tall"
      :label="t('picture.batchSize')"
      :text="t('picture.batchSize')"
      :disabled="disabled"
      @activate="emit('batchSize')"
      ><Images
    /></RibbonButton>
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('picture.convert')"
      :text="t('picture.convert')"
      :disabled="busy || exportDisabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Download
    /></RibbonMenuButton>
    <RibbonButton
      variant="tall"
      :label="t('picture.print')"
      :text="t('picture.print')"
      :disabled="busy || printDisabled"
      @activate="!busy && !printDisabled && emit('print')"
      ><Printer
    /></RibbonButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        :style="floatingStyles"
        class="picture-asset-tools__menu"
        :label="t('picture.convert')"
      >
        <MenuItem @select="exportCallbacks.png">PNG</MenuItem>
        <MenuItem @select="exportCallbacks.jpeg">JPEG</MenuItem>
        <MenuItem @select="exportCallbacks.webp">WebP</MenuItem>
        <MenuItem @select="exportCallbacks.all">{{ t("picture.exportAll") }}</MenuItem>
      </MenuSurface>
    </Teleport>
  </section>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.picture-asset-tools {
  @include ribbon.columns;
  &__menu {
    z-index: var(--sheetcraft-layer-menu);
  }
}
</style>
