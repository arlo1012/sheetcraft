<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Droplets } from "lucide-vue-next";
import { DEFAULT_SHEET_WATERMARK, type SheetWatermark } from "@idea10/core/page-decoration";
import { useAppI18n } from "../../../shared/i18n";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import { useMenu } from "../../../shared/menu/useMenu";
const props = defineProps<{ disabled: boolean; watermark?: SheetWatermark }>();
const emit = defineEmits<{ apply: [watermark: SheetWatermark]; custom: []; remove: [] }>();
const { t } = useAppI18n();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `page-watermark-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled: computed(() => props.disabled),
});
function apply(text: string): void {
  dismiss("programmatic", true);
  emit("apply", { ...DEFAULT_SHEET_WATERMARK, text });
}
function custom(): void {
  dismiss("programmatic", false);
  emit("custom");
}
function remove(): void {
  dismiss("programmatic", true);
  emit("remove");
}
</script>
<template>
  <span class="page-watermark-menu">
    <RibbonMenuButton
      ref="trigger"
      variant="tall"
      :label="t('pageDecoration.watermark')"
      :text="t('pageDecoration.watermark')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="watermark"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Droplets
    /></RibbonMenuButton>
    <Teleport to="body"
      ><MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        :style="floatingStyles"
        :label="t('pageDecoration.watermark')"
        class="page-watermark-menu__surface"
      >
        <MenuItem @select="apply(t('pageDecoration.confidential'))">{{
          t("pageDecoration.confidential")
        }}</MenuItem>
        <MenuItem @select="apply(t('pageDecoration.topSecret'))">{{
          t("pageDecoration.topSecret")
        }}</MenuItem>
        <MenuItem @select="apply(t('pageDecoration.noCopy'))">{{
          t("pageDecoration.noCopy")
        }}</MenuItem>
        <MenuItem @select="apply(t('pageDecoration.internalUse'))">{{
          t("pageDecoration.internalUse")
        }}</MenuItem>
        <MenuSeparator />
        <MenuItem @select="custom">{{ t("pageDecoration.customWatermark") }}</MenuItem>
        <MenuItem :disabled="!watermark" @select="remove">{{
          t("pageDecoration.removeWatermark")
        }}</MenuItem>
      </MenuSurface></Teleport
    >
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-watermark-menu {
  @include ribbon.tool;
  &__surface {
    position: fixed;
    z-index: 80;
  }
}
</style>
