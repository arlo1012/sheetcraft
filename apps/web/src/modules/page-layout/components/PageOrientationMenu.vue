<script setup lang="ts">
import { File } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import type { SheetPageSetup } from "@idea10/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

const props = defineProps<{ setup: SheetPageSetup; disabled: boolean }>();
const emit = defineEmits<{ change: [patch: Partial<SheetPageSetup>]; openSetup: [] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `page-orientation-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
});

function select(orientation: SheetPageSetup["orientation"]): void {
  emit("change", { orientation });
  dismiss("programmatic", true);
}
</script>

<template>
  <span class="page-orientation-menu">
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('pageLayout.orientation')"
      :text="t('pageLayout.orientation')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="orientation"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><File aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="page-orientation-menu__surface"
        :style="floatingStyles"
        :label="t('pageLayout.orientation')"
      >
        <MenuRadioItem
          :checked="setup.orientation === 'portrait'"
          data-page-orientation="portrait"
          @select="select('portrait')"
          >{{ t("pageLayout.portrait") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="setup.orientation === 'landscape'"
          data-page-orientation="landscape"
          @select="select('landscape')"
          >{{ t("pageLayout.landscape") }}</MenuRadioItem
        >
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-orientation-menu {
  @include ribbon.tool;
  &__surface {
    position: fixed;
    z-index: 80;
    min-width: 150px;
  }
}
</style>
