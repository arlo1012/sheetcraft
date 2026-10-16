<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
import {
  BringToFront,
  FlipHorizontal2,
  FlipVertical2,
  Layers,
  ListTree,
  MoveDown,
  MoveUp,
  RotateCcw,
  RotateCw,
  SendToBack,
  SlidersHorizontal,
} from "lucide-vue-next";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import {
  shapeObjectControlsLabels,
  type ShapeObjectControlAction,
  type ShapeObjectToolsInput,
} from "../shape-object-controls-contract";

const props = withDefaults(defineProps<ShapeObjectToolsInput>(), {
  canFormat: true,
  locale: "en-US",
  unavailableReason: undefined,
});
const labels = computed(() => shapeObjectControlsLabels(props.locale));
const failure = ref("");
const ownerEpoch = ref(0);
const rotationToken = ref(0);
const orderToken = ref(0);
const rotationButton = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const orderButton = ref<InstanceType<typeof RibbonMenuButton> | null>(null);
const rotationSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const orderSurface = ref<InstanceType<typeof MenuSurface> | null>(null);
const id = useId();
const rotationMenuId = `shape-rotation-${id}`;
const orderMenuId = `shape-order-${id}`;
const rotationDisabled = computed(() => props.disabled || (!props.canRotate && !props.canFlip));
const orderDisabled = computed(() => props.disabled || !props.canOrder);
const rotationMenu = useMenu({
  triggerRef: computed(() => rotationButton.value?.rootElement ?? null),
  menuSurfaceRef: rotationSurface,
  disabled: rotationDisabled,
  onOpen() {
    rotationToken.value++;
    failure.value = "";
    orderMenu.dismiss("programmatic", false);
  },
  onDismiss() {
    rotationToken.value++;
  },
});
const orderMenu = useMenu({
  triggerRef: computed(() => orderButton.value?.rootElement ?? null),
  menuSurfaceRef: orderSurface,
  disabled: orderDisabled,
  onOpen() {
    orderToken.value++;
    failure.value = "";
    rotationMenu.dismiss("programmatic", false);
  },
  onDismiss() {
    orderToken.value++;
  },
});

watch(
  () => [
    props.ownerKey,
    props.actionHandler,
    props.formatHandler,
    props.selectionPaneHandler,
    props.disabled,
  ],
  () => {
    ownerEpoch.value++;
    failure.value = "";
    rotationMenu.dismiss("programmatic", false);
    orderMenu.dismiss("programmatic", false);
  },
  { flush: "sync" },
);

/** Each rendered callback keeps its own owner and handler identities. */
const owner = computed(() => {
  const key = props.ownerKey;
  const epoch = ownerEpoch.value;
  const action = props.actionHandler;
  const format = props.formatHandler;
  const selectionPane = props.selectionPaneHandler;
  function current(): boolean {
    return key === props.ownerKey && epoch === ownerEpoch.value;
  }
  function request(handler: () => boolean, message: string): boolean {
    let accepted = false;
    try {
      accepted = handler() === true;
    } catch {
      /* Rejected host commands keep the current document and display feedback. */
    }
    if (current()) failure.value = accepted ? "" : message;
    return accepted;
  }
  return {
    current,
    action: (value: ShapeObjectControlAction): boolean => {
      const available = value.startsWith("flip-")
        ? props.canFlip
        : value.startsWith("rotate-")
          ? props.canRotate
          : props.canOrder;
      if (!current() || props.disabled || !available || action !== props.actionHandler)
        return false;
      return request(() => action(value), labels.value.rejected);
    },
    format: () => {
      if (!current() || props.disabled || !props.canFormat || format !== props.formatHandler)
        return;
      request(format, labels.value.openRejected);
    },
    selectionPane: () => {
      if (!current() || props.disabled || selectionPane !== props.selectionPaneHandler) return;
      request(selectionPane, labels.value.openRejected);
    },
    rotationToggle: () => {
      if (current() && !rotationDisabled.value) rotationMenu.toggleMenu();
    },
    rotationKeydown: (event: KeyboardEvent) => {
      if (current() && !rotationDisabled.value) rotationMenu.onTriggerKeydown(event);
    },
    orderToggle: () => {
      if (current() && !orderDisabled.value) orderMenu.toggleMenu();
    },
    orderKeydown: (event: KeyboardEvent) => {
      if (current() && !orderDisabled.value) orderMenu.onTriggerKeydown(event);
    },
  };
});
const rotationActions = computed(() => {
  const renderedOwner = owner.value;
  const token = rotationToken.value;
  function submit(action: ShapeObjectControlAction) {
    if (!rotationMenu.open.value || token !== rotationToken.value || !renderedOwner.current())
      return;
    if (renderedOwner.action(action) && token === rotationToken.value && renderedOwner.current()) {
      rotationMenu.dismiss("programmatic", true);
    }
  }
  return {
    left: () => submit("rotate-left"),
    right: () => submit("rotate-right"),
    horizontal: () => submit("flip-horizontal"),
    vertical: () => submit("flip-vertical"),
  };
});
const orderActions = computed(() => {
  const renderedOwner = owner.value;
  const token = orderToken.value;
  function submit(action: ShapeObjectControlAction) {
    if (!orderMenu.open.value || token !== orderToken.value || !renderedOwner.current()) return;
    if (renderedOwner.action(action) && token === orderToken.value && renderedOwner.current()) {
      orderMenu.dismiss("programmatic", true);
    }
  }
  return {
    forward: () => submit("bring-forward"),
    backward: () => submit("send-backward"),
    front: () => submit("bring-front"),
    back: () => submit("send-back"),
  };
});
function toolTitle(label: string, disabled: boolean) {
  return disabled && props.unavailableReason ? props.unavailableReason : label;
}
</script>

<template>
  <div class="shape-tools-toolbar" data-shape-tools-toolbar :data-shape-controls-owner="ownerKey">
    <section
      class="shape-tools-toolbar__columns"
      data-ribbon-group="shape-format"
      :aria-label="labels.format"
    >
      <RibbonButton
        variant="tall"
        :label="labels.format"
        :text="labels.format"
        :disabled="disabled || !canFormat"
        :title="toolTitle(labels.format, disabled || !canFormat)"
        data-shape-control="format"
        @activate="owner.format"
        ><SlidersHorizontal
      /></RibbonButton>
    </section>
    <section
      class="shape-tools-toolbar__columns"
      data-ribbon-group="shape-arrange"
      :aria-label="labels.order"
    >
      <span class="shape-tools-toolbar__tool">
        <RibbonMenuButton
          ref="rotationButton"
          variant="tall"
          :label="labels.rotate"
          :text="labels.rotate"
          :disabled="rotationDisabled"
          :title="toolTitle(labels.rotate, rotationDisabled)"
          :expanded="rotationMenu.open.value"
          :menu-id="rotationMenuId"
          data-shape-control="rotation"
          @activate="owner.rotationToggle"
          @keydown="owner.rotationKeydown"
          ><RotateCw
        /></RibbonMenuButton>
        <Teleport to="body">
          <MenuSurface
            v-if="rotationMenu.open.value"
            :id="rotationMenuId"
            ref="rotationSurface"
            class="shape-tools-toolbar__menu"
            :style="rotationMenu.floatingStyles.value"
            :label="labels.rotate"
            :data-shape-controls-owner="ownerKey"
            data-shape-rotation-menu
          >
            <template #header
              ><p
                v-if="failure"
                class="shape-tools-toolbar__failure"
                role="status"
                aria-live="polite"
              >
                {{ failure }}
              </p></template
            >
            <template #items>
              <MenuItem
                :disabled="disabled || !canRotate"
                :title="toolTitle(labels.rotateLeft, disabled || !canRotate)"
                data-shape-control-action="rotate-left"
                @select="rotationActions.left"
                ><template #icon><RotateCcw /></template>{{ labels.rotateLeft }}</MenuItem
              >
              <MenuItem
                :disabled="disabled || !canRotate"
                :title="toolTitle(labels.rotateRight, disabled || !canRotate)"
                data-shape-control-action="rotate-right"
                @select="rotationActions.right"
                ><template #icon><RotateCw /></template>{{ labels.rotateRight }}</MenuItem
              >
              <MenuItem
                :disabled="disabled || !canFlip"
                :title="toolTitle(labels.flipHorizontal, disabled || !canFlip)"
                data-shape-control-action="flip-horizontal"
                @select="rotationActions.horizontal"
                ><template #icon><FlipHorizontal2 /></template>{{ labels.flipHorizontal }}</MenuItem
              >
              <MenuItem
                :disabled="disabled || !canFlip"
                :title="toolTitle(labels.flipVertical, disabled || !canFlip)"
                data-shape-control-action="flip-vertical"
                @select="rotationActions.vertical"
                ><template #icon><FlipVertical2 /></template>{{ labels.flipVertical }}</MenuItem
              >
            </template>
          </MenuSurface>
        </Teleport>
      </span>
      <span class="shape-tools-toolbar__tool">
        <RibbonMenuButton
          ref="orderButton"
          variant="tall"
          :label="labels.order"
          :text="labels.order"
          :disabled="orderDisabled"
          :title="toolTitle(labels.order, orderDisabled)"
          :expanded="orderMenu.open.value"
          :menu-id="orderMenuId"
          data-shape-control="order"
          @activate="owner.orderToggle"
          @keydown="owner.orderKeydown"
          ><Layers
        /></RibbonMenuButton>
        <Teleport to="body">
          <MenuSurface
            v-if="orderMenu.open.value"
            :id="orderMenuId"
            ref="orderSurface"
            class="shape-tools-toolbar__menu"
            :style="orderMenu.floatingStyles.value"
            :label="labels.order"
            :data-shape-controls-owner="ownerKey"
            data-shape-order-menu
          >
            <template #header
              ><p
                v-if="failure"
                class="shape-tools-toolbar__failure"
                role="status"
                aria-live="polite"
              >
                {{ failure }}
              </p></template
            >
            <template #items>
              <MenuItem
                :disabled="orderDisabled"
                data-shape-control-action="bring-front"
                @select="orderActions.front"
                ><template #icon><BringToFront /></template>{{ labels.bringFront }}</MenuItem
              >
              <MenuItem
                :disabled="orderDisabled"
                data-shape-control-action="bring-forward"
                @select="orderActions.forward"
                ><template #icon><MoveUp /></template>{{ labels.bringForward }}</MenuItem
              >
              <MenuItem
                :disabled="orderDisabled"
                data-shape-control-action="send-backward"
                @select="orderActions.backward"
                ><template #icon><MoveDown /></template>{{ labels.sendBackward }}</MenuItem
              >
              <MenuItem
                :disabled="orderDisabled"
                data-shape-control-action="send-back"
                @select="orderActions.back"
                ><template #icon><SendToBack /></template>{{ labels.sendBack }}</MenuItem
              >
            </template>
          </MenuSurface>
        </Teleport>
      </span>
    </section>
    <section
      class="shape-tools-toolbar__columns"
      data-ribbon-group="shape-selection"
      :aria-label="labels.selectionPane"
    >
      <RibbonButton
        variant="tall"
        :label="labels.selectionPane"
        :text="labels.selectionPane"
        :disabled="disabled"
        data-shape-control="selection-pane"
        @activate="owner.selectionPane"
        ><ListTree
      /></RibbonButton>
    </section>
    <p
      v-if="failure && !rotationMenu.open.value && !orderMenu.open.value"
      class="shape-tools-toolbar__failure"
      role="status"
      aria-live="polite"
    >
      {{ failure }}
    </p>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.shape-tools-toolbar {
  display: flex;
  align-items: stretch;
  min-width: 0;
  &__columns {
    @include ribbon.columns;
  }
  &__tool {
    @include ribbon.tool;
  }
  &__menu {
    z-index: var(--sheetcraft-layer-menu);
  }
  &__failure {
    margin: var(--sheetcraft-space-2) var(--sheetcraft-space-3);
    max-width: 340px;
    color: var(--sheetcraft-status-error);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    overflow-wrap: anywhere;
  }
}
</style>
