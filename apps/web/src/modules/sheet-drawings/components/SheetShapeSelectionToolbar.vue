<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import {
  AlignHorizontalJustifyStart,
  AlignHorizontalJustifyCenter,
  AlignHorizontalJustifyEnd,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignHorizontalDistributeCenter,
  AlignVerticalDistributeCenter,
  Crosshair,
  Group,
  ChevronDown,
  Equal,
  MoveHorizontal,
  MoveVertical,
} from "lucide-vue-next";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import {
  useFloatingPanel,
  type FloatingReference,
} from "../../../shared/floating/useFloatingPanel";
import { useMenu } from "../../../shared/menu/useMenu";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { EqualShapeDimensionsAction } from "../shape-root-selection-planning";
import type { ShapeAlignment, ShapeAlignmentReference } from "../shape-selection-actions";

const props = defineProps<{
  anchor: FloatingReference;
  selectionKey: string;
  count: number;
  disabled: boolean;
  canGroup?: boolean;
  alignmentReference?: ShapeAlignmentReference;
  label: string;
  failure?: string;
}>();
const emit = defineEmits<{
  align: [action: ShapeAlignment, reference: ShapeAlignmentReference, selectionKey: string];
  group: [selectionKey: string];
  equalize: [action: EqualShapeDimensionsAction, selectionKey: string];
  dismiss: [selectionKey: string];
  reference: [reference: ShapeAlignmentReference, selectionKey: string];
}>();

type ToolbarAction = ShapeAlignment | EqualShapeDimensionsAction | "reference" | "group";
const { t } = useAppI18n();
const surfaceRef = ref<InstanceType<typeof FloatingPanelSurface> | null>(null);
const toolbarRef = computed(() => surfaceRef.value?.rootElement ?? null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `shape-selection-reference-${useId()}`;
const failureId = `shape-selection-failure-${useId()}`;
const activeAction = ref<ToolbarAction>("reference");
const localReference = ref<ShapeAlignmentReference>("selection");
const reference = computed(() => props.alignmentReference ?? localReference.value);
const menuSession = ref({ selectionKey: props.selectionKey, generation: 0 });
let generation = 0;
const { floatingStyles } = useFloatingPanel(
  computed(() => props.anchor),
  toolbarRef,
  computed(() => true),
  { placement: "top-end", offset: 32 },
);
const {
  open,
  floatingStyles: menuStyles,
  dismiss,
  toggleMenu,
  onTriggerKeydown,
} = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
  onOpen() {
    menuSession.value = { selectionKey: props.selectionKey, generation: ++generation };
  },
  onDismiss() {
    generation++;
  },
});

function enabled(action: ToolbarAction): boolean {
  if (props.disabled) return false;
  if (action === "horizontal" || action === "vertical") return props.count >= 3;
  if (action === "group") return props.canGroup === true && props.count >= 2;
  if (action.startsWith("equal-")) return props.count >= 2;
  return true;
}
function tabIndex(action: ToolbarAction): number {
  return enabled(action) && activeAction.value === action ? 0 : -1;
}
function align(action: ShapeAlignment, selectionKey: string): void {
  if (selectionKey !== props.selectionKey || !enabled(action)) return;
  emit("align", action, reference.value, selectionKey);
}
function group(selectionKey: string): void {
  if (selectionKey !== props.selectionKey || !enabled("group")) return;
  emit("group", selectionKey);
}
function chooseReference(
  next: ShapeAlignmentReference,
  session: { selectionKey: string; generation: number },
): void {
  if (
    props.disabled ||
    !open.value ||
    session.selectionKey !== props.selectionKey ||
    session.generation !== generation
  )
    return;
  localReference.value = next;
  emit("reference", next, session.selectionKey);
  dismiss("programmatic", true);
}
const referenceActions = computed(() => {
  const session = menuSession.value;
  return {
    selection: () => chooseReference("selection", session),
    lastSelected: () => chooseReference("last-selected", session),
  };
});

function onFocusin(event: FocusEvent): void {
  if (!(event.target instanceof HTMLButtonElement)) return;
  const action = event.target.dataset.shapeSelectionAction as ToolbarAction | undefined;
  if (action && enabled(action)) activeAction.value = action;
}
function onKeydown(event: KeyboardEvent, selectionKey: string): void {
  if (selectionKey !== props.selectionKey || event.defaultPrevented) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (open.value) dismiss("escape", true);
    else emit("dismiss", selectionKey);
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = Array.from(
    toolbarRef.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
  );
  if (!buttons.length) return;
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : event.key === "ArrowLeft"
          ? index <= 0
            ? buttons.length - 1
            : index - 1
          : index < 0 || index === buttons.length - 1
            ? 0
            : index + 1;
  buttons[next]?.focus();
}

// Each rendered callback keeps its selection owner, including delayed events.
const toolbarActions = computed(() => {
  const selectionKey = props.selectionKey;
  return {
    reference: (event: MouseEvent) => {
      if (selectionKey === props.selectionKey && enabled("reference")) toggleMenu(event);
    },
    triggerKeydown: (event: KeyboardEvent) => {
      if (selectionKey === props.selectionKey && enabled("reference")) onTriggerKeydown(event);
    },
    left: () => align("left", selectionKey),
    center: () => align("center", selectionKey),
    right: () => align("right", selectionKey),
    top: () => align("top", selectionKey),
    middle: () => align("middle", selectionKey),
    bottom: () => align("bottom", selectionKey),
    both: () => align("both", selectionKey),
    horizontal: () => align("horizontal", selectionKey),
    vertical: () => align("vertical", selectionKey),
    group: () => group(selectionKey),
    equalHeight: () => {
      if (selectionKey === props.selectionKey && enabled("equal-height"))
        emit("equalize", "equal-height", selectionKey);
    },
    equalWidth: () => {
      if (selectionKey === props.selectionKey && enabled("equal-width"))
        emit("equalize", "equal-width", selectionKey);
    },
    equalSize: () => {
      if (selectionKey === props.selectionKey && enabled("equal-size"))
        emit("equalize", "equal-size", selectionKey);
    },
    keydown: (event: KeyboardEvent) => onKeydown(event, selectionKey),
  };
});

watch(
  () => [props.selectionKey, props.disabled] as const,
  () => {
    generation++;
    dismiss("programmatic", false);
  },
  { flush: "sync" },
);
watch(
  () => [props.disabled, props.count, props.canGroup] as const,
  () => {
    if (!enabled(activeAction.value)) activeAction.value = "reference";
  },
);
onBeforeUnmount(() => generation++);
</script>

<template>
  <Teleport to="body">
    <FloatingPanelSurface
      ref="surfaceRef"
      class="sheet-shape-selection-toolbar"
      :style="floatingStyles"
      role="toolbar"
      :label="label"
      padding="compact"
      layer="toolbar"
      :aria-describedby="failure ? failureId : undefined"
      :data-shape-selection-owner="selectionKey"
      data-shape-selection-toolbar
      @pointerdown.stop
      @click.stop
      @focusin="onFocusin"
      @keydown.stop="toolbarActions.keydown"
    >
      <div class="sheet-shape-selection-toolbar__actions">
        <button
          ref="triggerRef"
          type="button"
          :disabled="disabled"
          :tabindex="tabIndex('reference')"
          :aria-label="t('picture.alignReference')"
          :title="t('picture.alignReference')"
          aria-haspopup="menu"
          :aria-expanded="open"
          :aria-controls="open ? menuId : undefined"
          data-shape-selection-action="reference"
          @click="toolbarActions.reference"
          @keydown="toolbarActions.triggerKeydown"
        >
          <AlignHorizontalJustifyStart aria-hidden="true" /><ChevronDown
            class="sheet-shape-selection-toolbar__chevron"
            aria-hidden="true"
          />
        </button>
        <span class="sheet-shape-selection-toolbar__separator" aria-hidden="true" />
        <button
          type="button"
          :disabled="disabled"
          :tabindex="tabIndex('left')"
          :aria-label="t('picture.alignLeft')"
          :title="t('picture.alignLeft')"
          data-shape-selection-action="left"
          @click="toolbarActions.left"
        >
          <AlignHorizontalJustifyStart aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="disabled"
          :tabindex="tabIndex('center')"
          :aria-label="t('picture.alignCenter')"
          :title="t('picture.alignCenter')"
          data-shape-selection-action="center"
          @click="toolbarActions.center"
        >
          <AlignHorizontalJustifyCenter aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="disabled"
          :tabindex="tabIndex('right')"
          :aria-label="t('picture.alignRight')"
          :title="t('picture.alignRight')"
          data-shape-selection-action="right"
          @click="toolbarActions.right"
        >
          <AlignHorizontalJustifyEnd aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="disabled"
          :tabindex="tabIndex('top')"
          :aria-label="t('picture.alignTop')"
          :title="t('picture.alignTop')"
          data-shape-selection-action="top"
          @click="toolbarActions.top"
        >
          <AlignVerticalJustifyStart aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="disabled"
          :tabindex="tabIndex('middle')"
          :aria-label="t('picture.alignMiddle')"
          :title="t('picture.alignMiddle')"
          data-shape-selection-action="middle"
          @click="toolbarActions.middle"
        >
          <AlignVerticalJustifyCenter aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="disabled"
          :tabindex="tabIndex('bottom')"
          :aria-label="t('picture.alignBottom')"
          :title="t('picture.alignBottom')"
          data-shape-selection-action="bottom"
          @click="toolbarActions.bottom"
        >
          <AlignVerticalJustifyEnd aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="disabled"
          :tabindex="tabIndex('both')"
          :aria-label="t('picture.alignBoth')"
          :title="t('picture.alignBoth')"
          data-shape-selection-action="both"
          @click="toolbarActions.both"
        >
          <Crosshair aria-hidden="true" />
        </button>
        <span class="sheet-shape-selection-toolbar__separator" aria-hidden="true" />
        <button
          type="button"
          :disabled="disabled || count < 3"
          :tabindex="tabIndex('horizontal')"
          :aria-label="t('picture.distributeHorizontal')"
          :title="t('picture.distributeHorizontal')"
          data-shape-selection-action="horizontal"
          @click="toolbarActions.horizontal"
        >
          <AlignHorizontalDistributeCenter aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="disabled || count < 3"
          :tabindex="tabIndex('vertical')"
          :aria-label="t('picture.distributeVertical')"
          :title="t('picture.distributeVertical')"
          data-shape-selection-action="vertical"
          @click="toolbarActions.vertical"
        >
          <AlignVerticalDistributeCenter aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="!enabled('equal-height')"
          :tabindex="tabIndex('equal-height')"
          :aria-label="t('drawing.equalHeight')"
          :title="t('drawing.equalHeight')"
          data-shape-selection-action="equal-height"
          @click="toolbarActions.equalHeight"
        >
          <MoveVertical aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="!enabled('equal-width')"
          :tabindex="tabIndex('equal-width')"
          :aria-label="t('drawing.equalWidth')"
          :title="t('drawing.equalWidth')"
          data-shape-selection-action="equal-width"
          @click="toolbarActions.equalWidth"
        >
          <MoveHorizontal aria-hidden="true" />
        </button>
        <button
          type="button"
          :disabled="!enabled('equal-size')"
          :tabindex="tabIndex('equal-size')"
          :aria-label="t('drawing.equalSize')"
          :title="t('drawing.equalSize')"
          data-shape-selection-action="equal-size"
          @click="toolbarActions.equalSize"
        >
          <Equal aria-hidden="true" />
        </button>
        <span class="sheet-shape-selection-toolbar__separator" aria-hidden="true" />
        <button
          type="button"
          :disabled="disabled || canGroup !== true || count < 2"
          :tabindex="tabIndex('group')"
          :aria-label="t('picture.group')"
          :title="t('picture.group')"
          data-shape-selection-action="group"
          @click="toolbarActions.group"
        >
          <Group aria-hidden="true" />
        </button>
      </div>
      <p
        v-if="failure"
        :id="failureId"
        class="sheet-shape-selection-toolbar__failure"
        role="status"
        aria-live="polite"
        data-shape-selection-failure
      >
        {{ failure }}
      </p>
    </FloatingPanelSurface>
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      :style="menuStyles"
      class="sheet-shape-selection-toolbar__menu"
      :label="t('picture.alignReference')"
      :data-shape-selection-owner="menuSession.selectionKey"
      data-shape-selection-reference-menu
      @pointerdown.stop
      @click.stop
    >
      <MenuRadioItem
        :checked="reference === 'selection'"
        :disabled="disabled"
        data-shape-selection-reference="selection"
        @select="referenceActions.selection"
        >{{ t("picture.alignToSelection") }}</MenuRadioItem
      >
      <MenuRadioItem
        :checked="reference === 'last-selected'"
        :disabled="disabled"
        data-shape-selection-reference="last-selected"
        @select="referenceActions.lastSelected"
        >{{ t("picture.alignToLastSelected") }}</MenuRadioItem
      >
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-shape-selection-toolbar {
  width: max-content;

  &__actions {
    display: flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
    overflow-x: auto;
    overscroll-behavior: contain;

    button {
      display: inline-flex;
      flex: 0 0 auto;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      padding: var(--sheetcraft-space-2);
      border: 1px solid transparent;
      border-radius: var(--sheetcraft-radius-small);
      background: transparent;
      color: var(--sheetcraft-text-primary);
      cursor: pointer;

      &:first-child {
        width: 38px;
      }
      &:hover:not(:disabled) {
        background: var(--sheetcraft-surface-hover);
      }
      &:disabled {
        color: var(--sheetcraft-text-disabled);
        cursor: default;
      }
      svg {
        width: var(--sheetcraft-action-icon-size);
        height: var(--sheetcraft-action-icon-size);
        flex-shrink: 0;
      }
    }
    button .sheet-shape-selection-toolbar__chevron {
      width: 10px;
    }
  }

  &__separator {
    width: 1px;
    height: 18px;
    margin: 0 var(--sheetcraft-space-1);
    flex: 0 0 auto;
    background: var(--sheetcraft-border-strong);
  }
  &__failure {
    margin: var(--sheetcraft-space-2) 0 0;
    max-width: 340px;
    color: var(--sheetcraft-status-error);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    overflow-wrap: anywhere;
  }
  &__menu {
    z-index: var(--sheetcraft-layer-sheet-menu);
  }
}
</style>
