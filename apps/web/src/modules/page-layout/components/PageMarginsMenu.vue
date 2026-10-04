<script setup lang="ts">
import { Ruler, Settings2 } from "lucide-vue-next";
import { computed, ref, useId } from "vue";
import { getPagePaperSize, type SheetPageSetup } from "@idea10/core/page-setup";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import PageMarginsOption from "./PageMarginsOption.vue";
import {
  PAGE_MARGIN_PRESETS as presets,
  pageMarginsMatch,
  type PageMargins,
} from "../page-margin-presets";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";

const props = defineProps<{
  setup: SheetPageSetup;
  disabled: boolean;
  lastCustomMargins?: PageMargins;
}>();
const emit = defineEmits<{ change: [patch: Partial<SheetPageSetup>]; openSetup: [] }>();
const { t } = useAppI18n();
const buttonRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const triggerRef = computed(() => buttonRef.value?.rootElement ?? null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `page-margins-menu-${useId().replaceAll(":", "")}`;

const paper = computed(() => getPagePaperSize(props.setup));
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
});

function matches(value: SheetPageSetup["margins"]): boolean {
  return pageMarginsMatch(props.setup.margins, value);
}
function select(margins: PageMargins): void {
  emit("change", { margins: { ...margins } });
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
        <template #body>
          <GallerySection :title="t('pageTools.marginsPresets')" :content-inset="false">
            <ul class="page-margins-menu__options" role="presentation">
              <PageMarginsOption
                :label="t('pageTools.marginsNormal')"
                :margins="presets.normal"
                :paper="paper"
                :checked="matches(presets.normal)"
                data-page-margins="normal"
                @select="select(presets.normal)"
              />
              <PageMarginsOption
                :label="t('pageTools.marginsNarrow')"
                :margins="presets.narrow"
                :paper="paper"
                :checked="matches(presets.narrow)"
                data-page-margins="narrow"
                @select="select(presets.narrow)"
              />
              <PageMarginsOption
                :label="t('pageTools.marginsWide')"
                :margins="presets.wide"
                :paper="paper"
                :checked="matches(presets.wide)"
                data-page-margins="wide"
                @select="select(presets.wide)"
              />
            </ul>
          </GallerySection>
          <GallerySection
            v-if="lastCustomMargins"
            :title="t('pageTools.marginsCustomSettings')"
            :content-inset="false"
          >
            <ul class="page-margins-menu__options" role="presentation">
              <PageMarginsOption
                :label="t('pageTools.marginsLastCustom')"
                :margins="lastCustomMargins"
                :paper="paper"
                :checked="matches(lastCustomMargins)"
                custom
                data-page-margins="last-custom"
                @select="select(lastCustomMargins)"
              />
            </ul>
          </GallerySection>
        </template>
        <template #footer>
          <MenuSeparator />
          <MenuItem data-page-margins="custom" @select="openSetup">
            <template #icon><Settings2 /></template>
            {{ t("pageTools.customMargins") }}
          </MenuItem>
        </template>
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
    min-width: min(320px, calc(100vw - 32px));
  }
  &__options {
    padding: 0;
    margin: 0;
    list-style: none;
  }
}
</style>
