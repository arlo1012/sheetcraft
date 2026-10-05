<script setup lang="ts">
import { computed, ref, useId } from "vue";
import { RotateCw, RotateCcw, FlipHorizontal2, FlipVertical2 } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import { useMenu } from "../../../shared/menu/useMenu";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
const props = defineProps<{ disabled: boolean }>();
const emit = defineEmits<{
  rotate: [turns: -1 | 1 | 2];
  flip: [axis: "horizontal" | "vertical"];
}>();
const { t } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const triggerRef = computed(() => button.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `picture-rotation-${useId()}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});
function rotate(turns: -1 | 1 | 2): void {
  emit("rotate", turns);
  dismiss("programmatic", true);
}
function flip(axis: "horizontal" | "vertical"): void {
  emit("flip", axis);
  dismiss("programmatic", true);
}
</script>
<template>
  <span class="picture-rotation">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('image.rotate')"
      :text="t('image.rotate')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><RotateCw
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="picture-rotation__menu"
        :style="floatingStyles"
        :label="t('image.rotate')"
      >
        <MenuItem data-picture-tool="rotate-right" @select="rotate(1)"
          ><template #icon><RotateCw :size="16" /></template>{{ t("image.rotateRight") }}</MenuItem
        >
        <MenuItem data-picture-tool="rotate-left" @select="rotate(-1)"
          ><template #icon><RotateCcw :size="16" /></template>{{ t("image.rotateLeft") }}</MenuItem
        >
        <MenuItem data-picture-tool="flip-horizontal" @select="flip('horizontal')"
          ><template #icon><FlipHorizontal2 :size="16" /></template
          >{{ t("image.flipHorizontal") }}</MenuItem
        >
        <MenuItem data-picture-tool="flip-vertical" @select="flip('vertical')"
          ><template #icon><FlipVertical2 :size="16" /></template
          >{{ t("image.flipVertical") }}</MenuItem
        >
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.picture-rotation {
  @include ribbon.tool;
  &__menu {
    z-index: var(--idea-layer-menu);
  }
}
</style>
