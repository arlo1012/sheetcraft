<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { Settings } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import { useMenu } from "../../../shared/menu/useMenu";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
const props = defineProps<{ disabled: boolean; previewOnDoubleClick: boolean }>();
const emit = defineEmits<{ preview: []; change: [value: boolean] }>();
const { t } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const triggerRef = computed(() => button.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `picture-view-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
function change(value: boolean): void {
  emit("change", value);
  dismiss("programmatic", true);
}
function preview(): void {
  emit("preview");
  dismiss("programmatic", true);
}
</script>
<template>
  <span class="picture-view">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('picture.viewSettings')"
      :text="t('picture.viewSettings')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Settings
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="picture-view__menu"
        :style="floatingStyles"
        :label="t('picture.viewSettings')"
      >
        <MenuItem @select="preview">{{ t("image.preview") }}</MenuItem>
        <MenuRadioItem :checked="previewOnDoubleClick" @select="change(true)">{{
          t("picture.doubleClickPreview")
        }}</MenuRadioItem>
        <MenuRadioItem :checked="!previewOnDoubleClick" @select="change(false)">{{
          t("picture.doubleClickSelect")
        }}</MenuRadioItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.picture-view {
  @include ribbon.tool;
  &__menu {
    z-index: var(--sheetcraft-layer-menu);
  }
}
</style>
