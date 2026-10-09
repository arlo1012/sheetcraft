<script setup lang="ts">
import { Image as ImageIcon, PictureInPicture2 } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import { useMenu } from "../../../shared/menu/useMenu";

defineOptions({ inheritAttrs: false });

const props = withDefaults(defineProps<{ disabled: boolean; compact?: boolean; text?: string }>(), {
  compact: false,
});
const emit = defineEmits<{ insertImage: [mode: "cell" | "floating"] }>();
const { t } = useAppI18n();
const triggerComponentRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => triggerComponentRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `image-insert-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
});

function insertImage(mode: "cell" | "floating"): void {
  emit("insertImage", mode);
  dismiss("programmatic", true);
}
</script>

<template>
  <span v-bind="$attrs" class="ribbon-menu-tool">
    <RibbonMenuButton
      ref="triggerComponentRef"
      :label="t('image.insertMenu')"
      :text="text ?? t('ribbon.image')"
      :disabled="disabled"
      :variant="compact ? 'compact' : 'tall'"
      data-ribbon-action="image"
      :data-ribbon-layout="compact ? 'compact' : 'tall'"
      :data-ribbon-span="compact ? '1' : '2'"
      popup-role="menu"
      :expanded="open"
      :menu-id="menuId"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <ImageIcon aria-hidden="true" />
    </RibbonMenuButton>

    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="image-insert-menu"
        :style="floatingStyles"
        :label="t('image.insertMenu')"
      >
        <MenuItem data-image-insert-mode="cell" @select="insertImage('cell')">
          <template #icon><ImageIcon :size="15" /></template>
          {{ t("image.insertInCell") }}
        </MenuItem>
        <MenuItem data-image-insert-mode="floating" @select="insertImage('floating')">
          <template #icon><PictureInPicture2 :size="15" /></template>
          {{ t("image.insertFloating") }}
        </MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;

.ribbon-menu-tool {
  @include ribbon.tool;
}

.image-insert-menu {
  z-index: var(--sheetcraft-layer-menu);
}
</style>
