<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import { provideNativePopupScope } from "../../../shared/floating/useNativePopupOwnership";
import { useShapeTextFieldDraft } from "../shape-text-field-drafts";
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
  fullWidth?: boolean;
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
const popupScopeActive = ref(false);
const popups = provideNativePopupScope({
  owner: () => (props.controller.props.snapshot ? props.controller.ownerKey.value : undefined),
  active: () => popupScopeActive.value,
});
useShapeTextFieldDraft({
  owner: () => props.controller.props.snapshot?.owner.sessionId,
  flush: () => true,
  focus: () => {},
  containsTarget: (target) =>
    popups.containsTarget(target) ||
    (!!props.controller.props.snapshot &&
      !disabled.value &&
      target instanceof Node &&
      target.isConnected &&
      !!trigger.value?.rootElement?.isConnected &&
      trigger.value.rootElement.contains(target)),
});
const menu = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled,
  additionalInside: popups.popupElements,
  defaultFocus: "menu",
  placement: "bottom-start",
});
watch(
  menu.open,
  (value) => {
    popupScopeActive.value = value;
  },
  { flush: "sync" },
);
watch(
  () => props.controller.ownerKey.value,
  () => menu.dismiss("programmatic", false),
);
const fill = computed(() => props.controller.styleBinding(props.target, "fill"));
const line = computed(() => props.controller.styleBinding(props.target, "line"));
const styles = computed(() => props.controller.wordArtStyleBinding());
</script>
<template>
  <span class="shape-ribbon-style-menu" :class="{ 'is-full-width': fullWidth }">
    <RibbonMenuButton
      ref="trigger"
      :label="label"
      :text="label"
      :full-width="fullWidth"
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
        :class="[
          'shape-ribbon-style-menu__panel',
          { 'shape-ribbon-style-menu__panel--gallery': category === 'styles' },
        ]"
        :style="menu.floatingStyles.value"
        :data-shape-text-edit-session="sessionId"
        data-shape-ribbon-style-panel
      >
        <template #body>
          <WordArtStyleGallery
            v-if="category === 'styles'"
            v-bind="styles"
            @applied="menu.dismiss('programmatic', true)"
          />
          <GallerySection v-else :title="label">
            <div
              class="shape-ribbon-style-menu__body"
              :class="{ 'shape-ribbon-style-menu__body--effects': category === 'effects' }"
            >
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
              <ShapeFormatEffects v-else :controller="controller" :target="target" available-only />
            </div>
          </GallerySection>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
.shape-ribbon-style-menu {
  display: inline-flex;
  min-width: 0;
  &.is-full-width {
    display: flex;
    width: 100%;
  }
  &__panel {
    width: 330px;
    max-height: min(540px, 75vh);
    z-index: var(--sheetcraft-layer-menu);

    &--gallery {
      width: 544px;
      max-width: calc(100vw - var(--sheetcraft-space-4) * 2);
    }
  }
  &__body {
    padding: var(--sheetcraft-space-2) var(--sheetcraft-space-2) var(--sheetcraft-space-1);

    &--effects {
      --sheetcraft-gallery-header-inset: 0;

      padding: 0 var(--sheetcraft-space-2) var(--sheetcraft-space-1);
    }
  }
}
</style>
