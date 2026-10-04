<script setup lang="ts">
import { computed, nextTick, ref, useId } from "vue";
import { Combine, Palette, Plus } from "lucide-vue-next";
import { createBuiltinCellStyles, type CellStyleDefinition } from "@idea10/core/cell-styles";
import type { WorkbookTheme } from "@idea10/core/workbook-theme";
import { useAppI18n } from "../../../shared/i18n";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import CellStyleGallery from "./CellStyleGallery.vue";

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    editSessionId?: string;
    customStyles?: readonly CellStyleDefinition[];
    theme?: WorkbookTheme;
  }>(),
  { disabled: false, editSessionId: undefined, customStyles: () => [] },
);
const emit = defineEmits<{
  apply: [style: CellStyleDefinition];
  create: [];
  edit: [style: CellStyleDefinition];
  merge: [];
}>();
const { t } = useAppI18n();
const triggerRef = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const triggerElement = computed(() => triggerRef.value?.rootElement ?? null);
const galleryRef = ref<{ focusFirstStyle: () => void } | null>(null);
const panelId = `cell-styles-menu-${useId().replaceAll(":", "")}`;
const styles = computed(() => [...createBuiltinCellStyles(props.theme), ...props.customStyles]);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: triggerElement,
  menuSurfaceRef: surfaceRef,
  disabled: computed(() => props.disabled),
  placement: "bottom-start",
  defaultFocus: "menu",
  onOpen: () => {
    void nextTick(() => nextTick(() => galleryRef.value?.focusFirstStyle()));
  },
});

function apply(style: CellStyleDefinition): void {
  dismiss("programmatic", true);
  emit("apply", style);
}
function create(): void {
  dismiss("programmatic", true);
  emit("create");
}
function edit(style: CellStyleDefinition): void {
  dismiss("programmatic", true);
  emit("edit", style);
}
function merge(): void {
  dismiss("programmatic", true);
  emit("merge");
}
</script>

<template>
  <div class="cell-styles-menu">
    <RibbonMenuButton
      ref="triggerRef"
      data-ribbon-action="cell-styles"
      :label="t('cellStyles.title')"
      :text="t('cellStyles.title')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="panelId"
      full-width
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Palette aria-hidden="true" />
    </RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="panelId"
        ref="surfaceRef"
        class="cell-styles-menu__surface"
        :style="floatingStyles"
        :label="t('cellStyles.title')"
        :data-cell-edit-session="editSessionId"
      >
        <CellStyleGallery
          ref="galleryRef"
          :styles="styles"
          :disabled="disabled"
          @select="apply"
          @edit="edit"
        />
        <MenuSeparator />
        <MenuItem @select="create"
          ><template #icon><Plus /></template>{{ t("cellStyles.actions.newStyle") }}</MenuItem
        >
        <MenuItem @select="merge"
          ><template #icon><Combine /></template>{{ t("cellStyles.actions.mergeStyles") }}</MenuItem
        >
      </MenuSurface>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.cell-styles-menu {
  display: contents;
}
.cell-styles-menu__surface {
  z-index: 50;
  width: min(440px, calc(100vw - 24px));
  max-height: calc(100vh - 32px);
  overflow-y: auto;
}
</style>
