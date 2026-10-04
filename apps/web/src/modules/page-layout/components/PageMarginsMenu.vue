<script setup lang="ts">
import { Ruler } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { DEFAULT_SHEET_PAGE_SETUP, type SheetPageSetup } from "@idea10/core/page-setup";
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
const menuId = `page-margins-menu-${useId().replaceAll(":", "")}`;

const presets = {
  normal: DEFAULT_SHEET_PAGE_SETUP.margins,
  narrow: { top: 12.7, bottom: 12.7, left: 12.7, right: 12.7, header: 7.62, footer: 7.62 },
  wide: { top: 25.4, bottom: 25.4, left: 50.8, right: 50.8, header: 7.62, footer: 7.62 },
} satisfies Record<string, SheetPageSetup["margins"]>;
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
});

function matches(value: SheetPageSetup["margins"]): boolean {
  return (Object.keys(value) as Array<keyof SheetPageSetup["margins"]>).every(
    (key) => props.setup.margins[key] === value[key],
  );
}
function select(preset: keyof typeof presets): void {
  emit("change", { margins: { ...presets[preset] } });
  dismiss("programmatic", true);
}
function openSetup(): void {
  dismiss("programmatic", false);
  emit("openSetup");
}
</script>

<template>
  <span class="page-margins-menu">
    <RibbonMenuButton
      ref="buttonRef"
      variant="tall"
      :label="t('pageLayout.margins')"
      :text="t('pageLayout.margins')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      data-page-tool="margins"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Ruler aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="page-margins-menu__surface"
        :style="floatingStyles"
        :label="t('pageLayout.margins')"
      >
        <MenuRadioItem
          :checked="matches(presets.normal)"
          data-page-margins="normal"
          @select="select('normal')"
          >{{ t("pageTools.marginsNormal") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="matches(presets.narrow)"
          data-page-margins="narrow"
          @select="select('narrow')"
          >{{ t("pageTools.marginsNarrow") }}</MenuRadioItem
        >
        <MenuRadioItem
          :checked="matches(presets.wide)"
          data-page-margins="wide"
          @select="select('wide')"
          >{{ t("pageTools.marginsWide") }}</MenuRadioItem
        >
        <MenuSeparator />
        <MenuItem data-page-margins="custom" @select="openSetup">{{
          t("pageTools.customMargins")
        }}</MenuItem>
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.page-margins-menu {
  @include ribbon.tool;
  &__surface {
    z-index: var(--idea-layer-menu);
    min-width: 180px;
  }
}
</style>
