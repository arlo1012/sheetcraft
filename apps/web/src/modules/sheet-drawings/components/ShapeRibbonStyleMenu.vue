<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import PicturePaintEditor from "../../sheet-images/components/format-pane/PicturePaintEditor.vue";
import PictureLineEditor from "../../sheet-images/components/format-pane/PictureLineEditor.vue";
import ShapeFormatEffects from "./shape-format/ShapeFormatEffects.vue";
import WordArtStyleGallery from "./WordArtStyleGallery.vue";
import type { ShapeFormatController } from "./shape-format/useShapeFormatPane";
import type { ShapeFormatMode } from "../shape-format-pane-model";
const props = defineProps<{
  controller: ShapeFormatController;
  target: ShapeFormatMode;
  category: "fill" | "line" | "effects" | "styles";
  label: string;
  sessionId?: number;
}>();
defineSlots<{ default: () => unknown }>();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const id = `shape-ribbon-style-${useId()}`;
const disabled = computed(() => {
  const c = props.controller;
  if (props.category === "styles") return !c.wordArtStyleCapability().enabled;
  if (props.category === "effects")
    return (
      !["shadow", "reflection", "glow"].some(
        (category) =>
          c.styleCapability(props.target, category as "shadow" | "reflection" | "glow").enabled,
      ) && !(props.target === "text" && c.textWarpCapability().enabled)
    );
  return !c.styleCapability(props.target, props.category).enabled;
});
const menu = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled,
  defaultFocus: "menu",
  placement: "bottom-start",
});
watch(
  () => props.controller.ownerKey.value,
  () => menu.dismiss("programmatic", false),
);
const fill = computed(() => props.controller.styleBinding(props.target, "fill"));
const line = computed(() => props.controller.styleBinding(props.target, "line"));
const styles = computed(() => props.controller.wordArtStyleBinding());
</script>
<template>
  <span class="shape-ribbon-style-menu">
    <RibbonMenuButton
      ref="trigger"
      :label="label"
      :text="label"
      :disabled="disabled"
      :expanded="menu.open.value"
      :menu-id="id"
      data-shape-ribbon-style-trigger
      @activate="menu.toggleMenu()"
      @keydown="menu.onTriggerKeydown"
      ><slot
    /></RibbonMenuButton>
    <Teleport to="body">
      <MenuSurface
        v-if="menu.open.value"
        :id="id"
        ref="surface"
        :label="label"
        class="shape-ribbon-style-menu__panel"
        :style="menu.floatingStyles.value"
        :data-shape-text-edit-session="sessionId"
        data-shape-ribbon-style-panel
      >
        <template #body>
          <PicturePaintEditor
            v-if="category === 'fill'"
            v-bind="fill"
            :load-asset="controller.assetLoader(target, 'fill')"
          />
          <PictureLineEditor
            v-else-if="category === 'line'"
            v-bind="line"
            :load-asset="controller.assetLoader(target, 'line')"
          />
          <ShapeFormatEffects
            v-else-if="category === 'effects'"
            :controller="controller"
            :target="target"
            available-only
          />
          <WordArtStyleGallery
            v-else
            v-bind="styles"
            @applied="menu.dismiss('programmatic', true)"
          />
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
.shape-ribbon-style-menu {
  display: inline-flex;
  &__panel {
    width: 330px;
    max-height: min(540px, 75vh);
    z-index: var(--sheetcraft-layer-menu);
  }
}
</style>
