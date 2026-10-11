<script setup lang="ts">
import { computed, ref, useId, watch } from "vue";
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
} from "lucide-vue-next";
import {
  useFloatingPanel,
  type FloatingReference,
} from "../../../shared/floating/useFloatingPanel";
import { useMenu } from "../../../shared/menu/useMenu";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import { useAppI18n } from "../../../shared/i18n";
import type { PictureAlignment, PictureAlignmentReference } from "../usePictureTools";
const props = defineProps<{
  anchor: FloatingReference;
  selectionKey: string;
  count: number;
  disabled: boolean;
}>();
const emit = defineEmits<{
  align: [action: PictureAlignment, reference: PictureAlignmentReference, selectionKey: string];
  group: [selectionKey: string];
  dismiss: [selectionKey: string];
}>();
const { t } = useAppI18n();
const toolbarRef = ref<HTMLElement | null>(null);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `picture-selection-reference-${useId()}`;
const reference = ref<PictureAlignmentReference>("selection");
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
});
function chooseReference(next: PictureAlignmentReference): void {
  reference.value = next;
  dismiss("programmatic", true);
}
function align(action: PictureAlignment): void {
  if (!props.disabled) emit("align", action, reference.value, props.selectionKey);
}
function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    event.preventDefault();
    emit("dismiss", props.selectionKey);
    return;
  }
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  const buttons = Array.from(
    toolbarRef.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [],
  );
  if (!buttons.length) return;
  const index = buttons.indexOf(event.target as HTMLButtonElement);
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? buttons.length - 1
        : (index + (event.key === "ArrowLeft" ? -1 : 1) + buttons.length) % buttons.length;
  buttons[next]?.focus();
}
watch(
  () => [props.selectionKey, props.disabled],
  () => dismiss("programmatic", false),
);
</script>

<template>
  <Teleport to="body">
    <div
      ref="toolbarRef"
      class="sheet-picture-selection-toolbar"
      :style="floatingStyles"
      role="toolbar"
      :aria-label="t('picture.quickActions')"
      data-picture-selection-toolbar
      @pointerdown.stop
      @click.stop
      @keydown.stop="onKeydown"
    >
      <button
        ref="triggerRef"
        type="button"
        :disabled="disabled"
        :aria-label="t('picture.alignReference')"
        :title="t('picture.alignReference')"
        aria-haspopup="menu"
        :aria-expanded="open"
        :aria-controls="open ? menuId : undefined"
        data-picture-selection-action="reference"
        @click="toggleMenu"
        @keydown="onTriggerKeydown"
      >
        <AlignHorizontalJustifyStart /><ChevronDown
          class="sheet-picture-selection-toolbar__chevron"
        />
      </button>
      <span class="sheet-picture-selection-toolbar__separator" aria-hidden="true" />
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('picture.alignLeft')"
        :title="t('picture.alignLeft')"
        data-picture-selection-action="left"
        @click="align('left')"
      >
        <AlignHorizontalJustifyStart />
      </button>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('picture.alignCenter')"
        :title="t('picture.alignCenter')"
        data-picture-selection-action="center"
        @click="align('center')"
      >
        <AlignHorizontalJustifyCenter />
      </button>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('picture.alignRight')"
        :title="t('picture.alignRight')"
        data-picture-selection-action="right"
        @click="align('right')"
      >
        <AlignHorizontalJustifyEnd />
      </button>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('picture.alignTop')"
        :title="t('picture.alignTop')"
        data-picture-selection-action="top"
        @click="align('top')"
      >
        <AlignVerticalJustifyStart />
      </button>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('picture.alignMiddle')"
        :title="t('picture.alignMiddle')"
        data-picture-selection-action="middle"
        @click="align('middle')"
      >
        <AlignVerticalJustifyCenter />
      </button>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('picture.alignBottom')"
        :title="t('picture.alignBottom')"
        data-picture-selection-action="bottom"
        @click="align('bottom')"
      >
        <AlignVerticalJustifyEnd />
      </button>
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('picture.alignBoth')"
        :title="t('picture.alignBoth')"
        data-picture-selection-action="both"
        @click="align('both')"
      >
        <Crosshair />
      </button>
      <span class="sheet-picture-selection-toolbar__separator" aria-hidden="true" />
      <button
        type="button"
        :disabled="disabled || count < 3"
        :aria-label="t('picture.distributeHorizontal')"
        :title="t('picture.distributeHorizontal')"
        data-picture-selection-action="horizontal"
        @click="align('horizontal')"
      >
        <AlignHorizontalDistributeCenter />
      </button>
      <button
        type="button"
        :disabled="disabled || count < 3"
        :aria-label="t('picture.distributeVertical')"
        :title="t('picture.distributeVertical')"
        data-picture-selection-action="vertical"
        @click="align('vertical')"
      >
        <AlignVerticalDistributeCenter />
      </button>
      <span class="sheet-picture-selection-toolbar__separator" aria-hidden="true" />
      <button
        type="button"
        :disabled="disabled || count < 2"
        :aria-label="t('picture.group')"
        :title="t('picture.group')"
        data-picture-selection-action="group"
        @click="emit('group', selectionKey)"
      >
        <Group />
      </button>
    </div>
    <MenuSurface
      v-if="open"
      :id="menuId"
      ref="menuSurfaceRef"
      :style="menuStyles"
      class="sheet-picture-selection-toolbar__menu"
      :label="t('picture.alignReference')"
      @pointerdown.stop
      @click.stop
    >
      <MenuRadioItem
        :checked="reference === 'selection'"
        data-picture-selection-reference="selection"
        @select="chooseReference('selection')"
        >{{ t("picture.alignToSelection") }}</MenuRadioItem
      >
      <MenuRadioItem
        :checked="reference === 'last-selected'"
        data-picture-selection-reference="last-selected"
        @select="chooseReference('last-selected')"
        >{{ t("picture.alignToLastSelected") }}</MenuRadioItem
      >
    </MenuSurface>
  </Teleport>
</template>

<style scoped lang="scss">
@use "../../../shared/floating/floating-panel" as panel;
.sheet-picture-selection-toolbar {
  @include panel.toolbar-surface(var(--sheetcraft-layer-toolbar));
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  max-width: calc(100vw - 16px);
  overflow-x: auto;
  button {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 4px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--sheetcraft-text-primary);
    cursor: pointer;
    &:first-child {
      width: 38px;
    }
    &:hover:not(:disabled) {
      background: var(--sheetcraft-surface-hover);
    }
    &:focus-visible {
      outline: 2px solid var(--sheetcraft-action-primary);
      outline-offset: -2px;
    }
    &:disabled {
      color: var(--sheetcraft-text-secondary);
      opacity: 0.45;
      cursor: default;
    }
    svg {
      width: 16px;
      height: 16px;
      flex-shrink: 0;
    }
  }
  button .sheet-picture-selection-toolbar__chevron {
    width: 10px;
  }
  &__separator {
    width: 1px;
    height: 18px;
    margin: 0 2px;
    flex: 0 0 auto;
    background: var(--sheetcraft-border-strong);
  }
  &__menu {
    z-index: var(--sheetcraft-layer-sheet-menu);
  }
}
</style>
