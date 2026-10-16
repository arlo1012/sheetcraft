<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { provideNativePopupScope } from "../../../shared/floating/useNativePopupOwnership";
import { useShapeTextFieldDraft } from "../shape-text-field-drafts";
import { useMenu } from "../../../shared/menu/useMenu";
import ShapeFormatChoiceField from "./shape-format/ShapeFormatChoiceField.vue";
import type { ShapeFormatController } from "./shape-format/useShapeFormatPane";
const props = defineProps<{ controller: ShapeFormatController; sessionId?: number }>();
const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const id = `shape-ribbon-layout-${useId()}`;
const disabled = computed(() => !props.controller.fieldCapability("textDirection").enabled);
const label = computed(() => props.controller.s.value("textDirection"));
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
defineSlots<{ default: () => unknown }>();
</script>
<template>
  <span class="shape-ribbon-layout-menu">
    <RibbonMenuButton
      ref="trigger"
      :label="label"
      :text="label"
      :disabled="disabled"
      :expanded="menu.open.value"
      :menu-id="id"
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
        :style="menu.floatingStyles.value"
        class="shape-ribbon-layout-menu__panel"
        :data-shape-text-edit-session="sessionId"
      >
        <template #body>
          <ShapeFormatChoiceField :controller="controller" field="textDirection" />
          <ShapeFormatChoiceField :controller="controller" field="textVerticalAlignment" />
          <ShapeFormatChoiceField
            v-if="controller.props.snapshot?.values.textDirection === 'stacked'"
            :controller="controller"
            field="textLineOrder"
          />
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
.shape-ribbon-layout-menu {
  display: inline-flex;
  &__panel {
    width: 300px;
    z-index: var(--sheetcraft-layer-menu);
  }
}
</style>
