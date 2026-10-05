<script setup lang="ts">
import { computed, ref, useId } from "vue";
import {
  AlignStartVertical,
  Group,
  Ungroup,
  BringToFront,
  SendToBack,
  List,
} from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import type { PictureAlignment, PictureLayerAction } from "../usePictureTools";
const props = defineProps<{ disabled: boolean; count: number; grouped: boolean }>();
const emit = defineEmits<{
  group: [];
  ungroup: [];
  align: [action: PictureAlignment];
  layer: [action: PictureLayerAction];
  selectionPane: [];
}>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `picture-align-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
function align(action: PictureAlignment): void {
  emit("align", action);
  dismiss("programmatic", true);
}
</script>
<template>
  <section class="picture-arrange" role="group" :aria-label="t('picture.arrange')">
    <div class="picture-arrange__stack">
      <RibbonButton
        :label="t('picture.group')"
        :text="t('picture.group')"
        :disabled="disabled || count < 2"
        @activate="emit('group')"
        ><Group
      /></RibbonButton>
      <RibbonButton
        :label="t('picture.ungroup')"
        :text="t('picture.ungroup')"
        :disabled="disabled || !grouped"
        @activate="emit('ungroup')"
        ><Ungroup
      /></RibbonButton>
    </div>
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('picture.align')"
      :text="t('picture.align')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><AlignStartVertical
    /></RibbonMenuButton>
    <div class="picture-arrange__stack">
      <RibbonButton
        :label="t('picture.forward')"
        :text="t('picture.forward')"
        :disabled="disabled"
        @activate="emit('layer', 'forward')"
        ><BringToFront
      /></RibbonButton>
      <RibbonButton
        :label="t('picture.backward')"
        :text="t('picture.backward')"
        :disabled="disabled"
        @activate="emit('layer', 'backward')"
        ><SendToBack
      /></RibbonButton>
    </div>
    <div class="picture-arrange__stack">
      <RibbonButton
        :label="t('picture.front')"
        :text="t('picture.front')"
        :disabled="disabled"
        @activate="emit('layer', 'front')"
        ><BringToFront
      /></RibbonButton>
      <RibbonButton
        :label="t('picture.back')"
        :text="t('picture.back')"
        :disabled="disabled"
        @activate="emit('layer', 'back')"
        ><SendToBack
      /></RibbonButton>
    </div>
    <RibbonButton
      variant="tall"
      :label="t('picture.selectionPane')"
      :text="t('picture.selectionPane')"
      @activate="emit('selectionPane')"
      ><List
    /></RibbonButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        :style="floatingStyles"
        class="picture-arrange__menu"
        :label="t('picture.align')"
      >
        <MenuItem :disabled="count < 2" @select="align('left')">{{
          t("picture.alignLeft")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('center')">{{
          t("picture.alignCenter")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('right')">{{
          t("picture.alignRight")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('top')">{{
          t("picture.alignTop")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('middle')">{{
          t("picture.alignMiddle")
        }}</MenuItem>
        <MenuItem :disabled="count < 2" @select="align('bottom')">{{
          t("picture.alignBottom")
        }}</MenuItem>
        <MenuItem :disabled="count < 3" @select="align('horizontal')">{{
          t("picture.distributeHorizontal")
        }}</MenuItem>
        <MenuItem :disabled="count < 3" @select="align('vertical')">{{
          t("picture.distributeVertical")
        }}</MenuItem>
        <MenuItem @select="align('grid')">{{ t("picture.snapGrid") }}</MenuItem>
      </MenuSurface>
    </Teleport>
  </section>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.picture-arrange {
  @include ribbon.columns;
  &__stack {
    @include ribbon.stack;
  }
  &__menu {
    z-index: var(--idea-layer-menu);
  }
}
</style>
