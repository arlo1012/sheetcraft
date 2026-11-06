<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import { Star } from "lucide-vue-next";
import type { DrawingShape } from "@sheetcraft/core/sheet-drawings";
import { useAppI18n } from "../../../shared/i18n";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import DrawingContent from "./DrawingContent.vue";
import { createGraphicDrawing } from "../drawing-defaults";

const props = defineProps<{
  disabled: boolean;
  ownerId?: string | number;
  handler: (shape: DrawingShape) => boolean;
}>();
const { t } = useAppI18n();
const button = ref<InstanceType<typeof RibbonMenuButton>>();
const surface = ref<InstanceType<typeof MenuSurface>>();
const menuId = `icon-insert-${useId().replaceAll(":", "")}`;
const rejected = ref(false);
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => button.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => surface.value ?? null),
  disabled: computed(() => props.disabled),
  onOpen: () => {
    rejected.value = false;
  },
});
const shapes: DrawingShape[] = [
  "star",
  "heart",
  "arrow",
  "ellipse",
  "triangle",
  "diamond",
  "rectangle",
  "roundedRectangle",
  "line",
];
const previews = shapes.map((shape) => ({
  ...createGraphicDrawing(`preview-${shape}`, "icon", "", { row: 0, column: 0 }),
  shape,
}));
function insert(shape: DrawingShape): void {
  if (!open.value || props.disabled) return;
  if (props.handler(shape)) dismiss("programmatic", false);
  else rejected.value = true;
}
watch(
  () => [props.ownerId, props.disabled],
  () => dismiss("programmatic", false),
);
</script>

<template>
  <span class="icon-insert-tool">
    <RibbonMenuButton
      ref="button"
      variant="tall"
      :label="t('drawing.icon')"
      :text="t('drawing.icon')"
      :disabled="disabled"
      :expanded="open"
      :menu-id="menuId"
      popup-role="menu"
      data-insert-tool="icon"
      @activate="toggleMenu"
      @keydown="onTriggerKeydown"
      ><Star aria-hidden="true"
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="surface"
        class="icon-insert-menu"
        :style="floatingStyles"
        :label="t('drawing.icon')"
      >
        <template #items>
          <MenuItem
            v-for="preview in previews"
            :key="preview.shape"
            :data-insert-icon="preview.shape"
            @select="insert(preview.shape)"
          >
            <template #icon
              ><span class="icon-insert-menu__preview"><DrawingContent :drawing="preview" /></span
            ></template>
            {{ t(`drawing.${preview.shape}`) }}
          </MenuItem>
        </template>
        <template v-if="rejected" #footer
          ><li role="alert" class="icon-insert-menu__error">
            {{ t("drawing.changeRejected") }}
          </li></template
        >
      </MenuSurface>
    </Teleport>
  </span>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.icon-insert-tool {
  @include ribbon.tool;
}
.icon-insert-menu {
  z-index: var(--sheetcraft-layer-menu);
  &__preview {
    display: block;
    width: 20px;
    height: 20px;
  }
  &__error {
    max-width: 240px;
    padding: 8px;
    color: var(--sheetcraft-status-error);
  }
}
</style>
