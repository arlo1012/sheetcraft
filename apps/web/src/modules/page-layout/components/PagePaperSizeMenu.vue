<script setup lang="ts">
import { FileStack } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import type { SheetPageSetup, SheetPaperSize } from "@idea10/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

const props = defineProps<{ setup: SheetPageSetup; disabled: boolean }>();
const emit = defineEmits<{ change: [patch: Partial<SheetPageSetup>]; openSetup: [] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `page-paper-size-menu-${useId().replaceAll(":", "")}`;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
});

function select(paperSize: Exclude<SheetPaperSize, "custom">): void {
  emit("change", { paperSize });
  dismiss("programmatic", true);
}
function openSetup(): void {
  dismiss("programmatic", false);
  emit("openSetup");
}
</script>

<template>
  <span class="page-paper-size-menu">
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('pageLayout.paperSize')"
      :text="t('pageLayout.paperSize')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="paper-size"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><FileStack aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="page-paper-size-menu__surface"
        :style="floatingStyles"
        :label="t('pageLayout.paperSize')"
      >
        <MenuRadioItem
          :checked="setup.paperSize === 'a4'"
          data-page-paper-size="a4"
          @select="select('a4')"
          >{{ t("pageLayout.paperA4") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="setup.paperSize === 'a3'"
          data-page-paper-size="a3"
          @select="select('a3')"
          >{{ t("pageLayout.paperA3") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="setup.paperSize === 'letter'"
          data-page-paper-size="letter"
          @select="select('letter')"
          >{{ t("pageLayout.paperLetter") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="setup.paperSize === 'legal'"
          data-page-paper-size="legal"
          @select="select('legal')"
          >{{ t("pageLayout.paperLegal") }}</MenuRadioItem
        >
        <MenuSeparator />
        <MenuItem data-page-paper-size="custom" @select="openSetup">{{
          t("pageLayout.customPaper")
        }}</MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-paper-size-menu {
  @include ribbon.tool;
  &__surface {
    z-index: var(--idea-layer-menu);
    min-width: 150px;
  }
}
</style>
