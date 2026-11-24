<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSeparator from "../../../shared/menu/MenuSeparator.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useShapeTextFieldDraft } from "../shape-text-field-drafts";
import { focusShapeTextEditInput } from "../shape-text-edit-ownership";
import type { ShapeFormatOption, ShapeFormatValues } from "../shape-format-pane-model";
import type { ShapeFormatController } from "./shape-format/useShapeFormatPane";

const props = defineProps<{
  controller: ShapeFormatController;
  sessionId?: number;
  fullWidth?: boolean;
}>();

const trigger = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const surface = ref<InstanceType<typeof MenuSurface> | null>(null);
const id = `shape-ribbon-layout-${useId()}`;
const disabled = computed(() => !props.controller.fieldCapability("textDirection").enabled);
const lineOrderEnabled = computed(() => props.controller.fieldCapability("textLineOrder").enabled);
const label = computed(() => props.controller.s.value("textDirection"));
const directionMixed = computed(() => props.controller.isMixedField("textDirection"));
const lineOrderMixed = computed(() => props.controller.isMixedField("textLineOrder"));
const currentDirection = computed(() => props.controller.props.snapshot?.values.textDirection);
const currentLineOrder = computed(() => props.controller.props.snapshot?.values.textLineOrder);

const directionOptions = computed<readonly ShapeFormatOption[]>(() => {
  const override = props.controller.props.options?.textDirection;
  if (override) return override;
  const s = props.controller.s.value;
  return [
    { value: "horizontal", label: s("horizontal") },
    { value: "vertical-rl", label: s("verticalRightToLeft") },
    { value: "vertical-lr", label: s("verticalLeftToRight") },
    { value: "rotate-90", label: s("rotate90") },
    { value: "rotate-270", label: s("rotate270") },
    { value: "stacked", label: s("stacked") },
  ];
});

const lineOrderOptions = computed<readonly ShapeFormatOption[]>(() => {
  const override = props.controller.props.options?.textLineOrder;
  if (override) return override;
  const s = props.controller.s.value;
  return [
    { value: "rtl", label: s("rightToLeft") },
    { value: "ltr", label: s("leftToRight") },
  ];
});

useShapeTextFieldDraft({
  owner: () => props.controller.props.snapshot?.owner.sessionId,
  flush: () => true,
  focus: () => {},
  containsTarget: (target) =>
    !!props.controller.props.snapshot &&
    !disabled.value &&
    target instanceof Node &&
    target.isConnected &&
    ((!!trigger.value?.rootElement?.isConnected && trigger.value.rootElement.contains(target)) ||
      (!!surface.value?.rootElement?.isConnected && surface.value.rootElement.contains(target))),
});

const menu = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled,
  defaultFocus: "selected",
  placement: "bottom-start",
});

watch(
  () => props.controller.ownerKey.value,
  () => menu.dismiss("programmatic", false),
);

function restore(): void {
  const owner = props.sessionId;
  if (owner !== undefined) void nextTick(() => focusShapeTextEditInput(owner));
}

function selectDirection(value: string): void {
  if (disabled.value) return;
  const option = directionOptions.value.find((item) => item.value === value);
  if (!option || option.disabled) return;
  if (
    props.controller.session.fieldAction("textDirection")(
      value as ShapeFormatValues["textDirection"],
    )
  ) {
    menu.dismiss("programmatic", props.sessionId === undefined);
    restore();
  }
}

function selectLineOrder(value: string): void {
  if (!lineOrderEnabled.value) return;
  const option = lineOrderOptions.value.find((item) => item.value === value);
  if (!option || option.disabled) return;
  if (
    props.controller.session.fieldAction("textLineOrder")(
      value as ShapeFormatValues["textLineOrder"],
    )
  ) {
    menu.dismiss("programmatic", props.sessionId === undefined);
    restore();
  }
}

defineSlots<{ default: () => unknown }>();
</script>
<template>
  <span class="shape-ribbon-layout-menu" :class="{ 'is-full-width': fullWidth }">
    <RibbonMenuButton
      ref="trigger"
      :label="label"
      :text="label"
      :full-width="fullWidth"
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
        <MenuRadioItem
          v-for="option in directionOptions"
          :key="option.value"
          indicator="check"
          :checked="!directionMixed && currentDirection === option.value"
          :disabled="disabled || option.disabled"
          :data-shape-text-direction="option.value"
          @select="selectDirection(option.value)"
        >
          {{ option.label }}
        </MenuRadioItem>
        <template v-if="!directionMixed && currentDirection === 'stacked'">
          <MenuSeparator />
          <li class="shape-ribbon-layout-menu__section-label" role="none" aria-hidden="true">
            {{ controller.fieldLabel("textLineOrder") }}
          </li>
          <MenuRadioItem
            v-for="option in lineOrderOptions"
            :key="option.value"
            indicator="check"
            :checked="!lineOrderMixed && currentLineOrder === option.value"
            :disabled="!lineOrderEnabled || option.disabled"
            :data-shape-text-line-order="option.value"
            @select="selectLineOrder(option.value)"
          >
            {{ option.label }}
          </MenuRadioItem>
        </template>
      </MenuSurface>
    </Teleport>
  </span>
</template>
<style scoped lang="scss">
.shape-ribbon-layout-menu {
  display: inline-flex;
  min-width: 0;
  &.is-full-width {
    display: flex;
    width: 100%;
  }
  &__panel {
    z-index: var(--sheetcraft-layer-menu);
  }
  &__section-label {
    padding: 4px var(--sheetcraft-tool-panel-padding) 2px;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    font-weight: var(--sheetcraft-font-weight-medium);
    list-style: none;
  }
}
</style>
