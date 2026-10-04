<script setup lang="ts">
import { Maximize2 } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import type { SheetPageFitToPage, SheetPageSetup } from "@idea10/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

type FitPreset = "sheet" | "columns" | "rows";
const props = defineProps<{ setup: SheetPageSetup; disabled: boolean }>();
const emit = defineEmits<{ change: [patch: Partial<SheetPageSetup>]; openSetup: [] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `page-scaling-menu-${useId().replaceAll(":", "")}`;
const presets: Record<FitPreset, SheetPageFitToPage> = {
  sheet: { width: 1, height: 1 },
  columns: { width: 1, height: 0 },
  rows: { width: 0, height: 1 },
};
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
});

function matches(fit: SheetPageFitToPage): boolean {
  return props.setup.fitToPage?.width === fit.width && props.setup.fitToPage?.height === fit.height;
}
function selectNoScaling(): void {
  emit("change", { scale: 100, fitToPage: null });
  dismiss("programmatic", true);
}
function select(preset: FitPreset): void {
  emit("change", { fitToPage: { ...presets[preset] } });
  dismiss("programmatic", true);
}
function openSetup(): void {
  dismiss("programmatic", false);
  emit("openSetup");
}
</script>

<template>
  <span class="page-scaling-menu">
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('pageTools.printScaling')"
      :text="t('pageTools.printScaling')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="scaling"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Maximize2 aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="page-scaling-menu__surface"
        :style="floatingStyles"
        :label="t('pageTools.printScaling')"
      >
        <MenuRadioItem
          :checked="setup.fitToPage == null && setup.scale === 100"
          data-page-scaling="none"
          @select="selectNoScaling"
          >{{ t("pageTools.noScaling") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="matches(presets.sheet)"
          data-page-scaling="sheet"
          @select="select('sheet')"
          >{{ t("pageLayout.fitEntireSheet") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="matches(presets.columns)"
          data-page-scaling="columns"
          @select="select('columns')"
          >{{ t("pageLayout.fitAllColumns") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="matches(presets.rows)"
          data-page-scaling="rows"
          @select="select('rows')"
          >{{ t("pageLayout.fitAllRows") }}</MenuRadioItem
        >
        <MenuSeparator />
        <MenuItem data-page-scaling="custom" @select="openSetup">{{
          t("pageTools.customScaling")
        }}</MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-scaling-menu {
  @include ribbon.tool;
  &__surface {
    position: fixed;
    z-index: 80;
    min-width: 220px;
  }
}
</style>
