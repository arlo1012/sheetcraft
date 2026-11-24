<script setup lang="ts">
import { ChevronRight } from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import { useSubmenu } from "../../../shared/menu/useSubmenu";
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
const submenuSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const baseId = useId().replaceAll(":", "");
const id = `shape-ribbon-layout-${baseId}`;
const submenuId = `shape-ribbon-layout-stacked-${baseId}`;
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

const stackedOption = computed(() =>
  directionOptions.value.find((option) => option.value === "stacked"),
);
const stackedDisabled = computed(() => disabled.value || stackedOption.value?.disabled === true);

const lineOrderOptions = computed<readonly ShapeFormatOption[]>(() => {
  const override = props.controller.props.options?.textLineOrder;
  if (override) return override;
  const s = props.controller.s.value;
  return [
    { value: "rtl", label: s("rightToLeft") },
    { value: "ltr", label: s("leftToRight") },
  ];
});

const menu = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef: surface,
  disabled,
  additionalInside: () => [submenuRef.value],
  defaultFocus: "selected",
  placement: "bottom-start",
  onDismiss: () => {
    closeSubmenu(false);
  },
  onOpen: () => {
    closeSubmenu(false);
  },
});

const {
  submenuOpen: stackedOpen,
  submenuElement: submenuRef,
  submenuStyles,
  openSubmenu,
  closeSubmenu,
  onParentKeydown,
  onParentFocusin,
  onParentMouseover,
  onSubmenuKeydown,
} = useSubmenu<"stacked">({
  parentOpen: menu.open,
  submenuSurfaceRef: submenuSurface,
  getAnchor: () =>
    surface.value?.rootElement?.querySelector<HTMLElement>(
      '[data-shape-text-direction="stacked"]',
    ) ?? null,
  offset: 4,
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
      (!!surface.value?.rootElement?.isConnected && surface.value.rootElement.contains(target)) ||
      (!!submenuRef.value?.isConnected && submenuRef.value.contains(target))),
});

watch(
  () => props.controller.ownerKey.value,
  () => menu.dismiss("programmatic", false),
);

function restore(): void {
  const owner = props.sessionId;
  if (owner !== undefined) void nextTick(() => focusShapeTextEditInput(owner));
}

function openStackedSubmenu(focus = true): void {
  if (stackedDisabled.value) return;
  openSubmenu("stacked", focus);
}

function onMenuKeydown(event: KeyboardEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const direction = target?.closest<HTMLElement>("[data-shape-text-direction]")?.dataset
    .shapeTextDirection;
  if (direction === "stacked" && !stackedDisabled.value) {
    onParentKeydown(event, "stacked");
  }
}

function onMenuFocusin(event: FocusEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const direction = target?.closest<HTMLElement>("[data-shape-text-direction]")?.dataset
    .shapeTextDirection;
  onParentFocusin(direction === "stacked" ? "stacked" : undefined);
}

function onMenuMouseover(event: MouseEvent): void {
  const target = event.target instanceof HTMLElement ? event.target : null;
  const item = target?.closest<HTMLElement>("[data-shape-text-direction]");
  if (!item) return;
  onParentMouseover(
    item.dataset.shapeTextDirection === "stacked" && !stackedDisabled.value ? "stacked" : undefined,
  );
}

function selectDirection(value: string): void {
  if (value === "stacked") {
    openStackedSubmenu(true);
    return;
  }
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

async function selectLineOrder(value: string): Promise<void> {
  const option = lineOrderOptions.value.find((item) => item.value === value);
  if (stackedDisabled.value || !option || option.disabled) return;
  const lineOrder = value as ShapeFormatValues["textLineOrder"];
  const alreadyStacked = !directionMixed.value && currentDirection.value === "stacked";
  if (alreadyStacked) {
    if (!lineOrderEnabled.value) return;
    if (props.controller.session.fieldAction("textLineOrder")(lineOrder)) {
      menu.dismiss("programmatic", props.sessionId === undefined);
      restore();
    }
    return;
  }
  const ownerBefore = props.controller.ownerKey.value;
  if (!props.controller.session.fieldAction("textDirection")("stacked")) return;
  await nextTick();
  if (
    props.controller.ownerKey.value === ownerBefore &&
    props.controller.fieldCapability("textLineOrder").enabled &&
    (props.controller.isMixedField("textLineOrder") ||
      props.controller.props.snapshot?.values.textLineOrder !== lineOrder)
  ) {
    props.controller.session.fieldAction("textLineOrder")(lineOrder);
  }
  menu.dismiss("programmatic", props.sessionId === undefined);
  restore();
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
        @focusin="onMenuFocusin"
        @mouseover="onMenuMouseover"
        @keydown="onMenuKeydown"
      >
        <MenuRadioItem
          v-for="option in directionOptions"
          :key="option.value"
          indicator="check"
          :checked="!directionMixed && currentDirection === option.value"
          :disabled="disabled || option.disabled"
          :aria-haspopup="option.value === 'stacked' ? 'menu' : undefined"
          :aria-expanded="option.value === 'stacked' ? stackedOpen : undefined"
          :aria-controls="option.value === 'stacked' && stackedOpen ? submenuId : undefined"
          :data-shape-text-direction="option.value"
          @select="selectDirection(option.value)"
        >
          {{ option.label }}
          <template v-if="option.value === 'stacked'" #shortcut>
            <ChevronRight :size="15" aria-hidden="true" />
          </template>
        </MenuRadioItem>
      </MenuSurface>
      <MenuSurface
        v-if="stackedOpen"
        :id="submenuId"
        ref="submenuSurface"
        :label="controller.fieldLabel('textLineOrder')"
        :style="submenuStyles"
        class="shape-ribbon-layout-menu__panel shape-ribbon-layout-menu__submenu"
        :data-shape-text-edit-session="sessionId"
        data-shape-text-stacked-submenu
        @keydown="onSubmenuKeydown"
      >
        <MenuRadioItem
          v-for="option in lineOrderOptions"
          :key="option.value"
          indicator="check"
          :checked="
            !directionMixed &&
            currentDirection === 'stacked' &&
            !lineOrderMixed &&
            currentLineOrder === option.value
          "
          :disabled="
            stackedDisabled ||
            (!directionMixed && currentDirection === 'stacked' && !lineOrderEnabled) ||
            option.disabled
          "
          :data-shape-text-line-order="option.value"
          @select="void selectLineOrder(option.value)"
        >
          {{ option.label }}
        </MenuRadioItem>
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
  &__submenu {
    z-index: var(--sheetcraft-layer-submenu);
  }
}
</style>
