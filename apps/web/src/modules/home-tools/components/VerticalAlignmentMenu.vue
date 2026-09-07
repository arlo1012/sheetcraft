<script setup lang="ts">
import {
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
  AlignVerticalJustifyStart,
  Check,
  ChevronDown,
} from "lucide-vue-next";
import { computed, nextTick, ref, useId, watch } from "vue";
import type { CellStylePatch, VerticalCellAlignment } from "@idea10/core/style";
import type { StyleValueState } from "@idea10/core/style-state";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useRovingFocus } from "../../../shared/focus/useRovingFocus";
import { useAppI18n } from "../../../shared/i18n";

const props = defineProps<{
  state: StyleValueState<VerticalCellAlignment>;
  disabled: boolean;
}>();

const emit = defineEmits<{
  applyStyle: [patch: CellStylePatch];
}>();

const { t } = useAppI18n();
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLDivElement | null>(null);
const open = ref(false);
const menuId = `vertical-alignment-menu-${useId().replaceAll(":", "")}`;
const DOCUMENT_FOCUS_TARGET_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not(:disabled):not([tabindex="-1"])',
  'input:not(:disabled):not([tabindex="-1"])',
  'select:not(:disabled):not([tabindex="-1"])',
  'textarea:not(:disabled):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"]):not([aria-disabled="true"])',
].join(", ");
const currentAlignment = computed<VerticalCellAlignment>(() => props.state.value ?? "middle");
const currentAlignmentLabel = computed(() => {
  if (currentAlignment.value === "top") {
    return t("format.alignTop");
  }
  if (currentAlignment.value === "bottom") {
    return t("format.alignBottom");
  }
  return t("format.alignMiddle");
});
const triggerLabel = computed(() =>
  props.state.mixed
    ? t("format.verticalAlignmentMixed")
    : t("format.verticalAlignmentValue", { value: currentAlignmentLabel.value }),
);
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(triggerRef, menuRef, open, {
  offset: 4,
  onDismiss: () => {
    open.value = false;
  },
});
const { move: moveRovingFocus } = useRovingFocus();

function menuItems(): HTMLButtonElement[] {
  return Array.from(
    menuRef.value?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [],
  );
}

function focusMenuItem(preferred: "selected" | "first" | "last"): void {
  const items = menuItems();
  if (items.length === 0) {
    return;
  }
  if (preferred === "first") {
    items[0]?.focus();
    return;
  }
  if (preferred === "last") {
    items.at(-1)?.focus();
    return;
  }
  const selected = items.find((item) => item.getAttribute("aria-checked") === "true");
  (selected ?? items[1] ?? items[0])?.focus();
}

function openMenu(preferred: "selected" | "first" | "last" = "selected"): void {
  if (props.disabled) {
    return;
  }
  open.value = true;
  void nextTick(() => focusMenuItem(preferred));
}

function toggleMenu(): void {
  if (open.value) {
    dismiss("programmatic", true);
  } else {
    openMenu();
  }
}

function isSelected(alignment: VerticalCellAlignment): boolean {
  return !props.state.mixed && currentAlignment.value === alignment;
}

function selectAlignment(alignment: VerticalCellAlignment): void {
  emit("applyStyle", { verticalAlign: alignment === "middle" ? null : alignment });
  dismiss("programmatic", true);
}

function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
    return;
  }
  event.preventDefault();
  openMenu(event.key === "ArrowDown" ? "first" : "last");
}

function moveFocusFromTrigger(direction: -1 | 1): void {
  const trigger = triggerRef.value;
  if (!trigger) {
    dismiss("programmatic", false);
    return;
  }
  const focusTargets = Array.from(
    document.querySelectorAll<HTMLElement>(DOCUMENT_FOCUS_TARGET_SELECTOR),
  );
  const triggerIndex = focusTargets.indexOf(trigger);
  const target = triggerIndex < 0 ? undefined : focusTargets[triggerIndex + direction];
  dismiss("programmatic", false);
  void nextTick(() => target?.focus());
}

function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key === "Tab") {
    event.preventDefault();
    moveFocusFromTrigger(event.shiftKey ? -1 : 1);
    return;
  }
  moveRovingFocus(event, menuItems());
}

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      dismiss("programmatic", false);
    }
  },
);
</script>

<template>
  <button
    ref="triggerRef"
    type="button"
    class="vertical-alignment-menu__trigger"
    :class="{ 'is-expanded': open, 'is-mixed': state.mixed }"
    data-vertical-alignment-trigger
    :disabled="disabled"
    :aria-label="triggerLabel"
    :title="triggerLabel"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? menuId : undefined"
    @click="toggleMenu"
    @keydown="onTriggerKeydown"
  >
    <span class="vertical-alignment-menu__trigger-icon" aria-hidden="true">
      <AlignVerticalJustifyStart
        v-if="!state.mixed && currentAlignment === 'top'"
        :size="17"
        :stroke-width="2"
      />
      <AlignVerticalJustifyEnd
        v-else-if="!state.mixed && currentAlignment === 'bottom'"
        :size="17"
        :stroke-width="2"
      />
      <AlignVerticalJustifyCenter v-else :size="17" :stroke-width="2" />
    </span>
    <ChevronDown
      class="vertical-alignment-menu__disclosure"
      :class="{ 'is-expanded': open }"
      :size="10"
      aria-hidden="true"
    />
  </button>

  <Teleport to="body">
    <div
      v-if="open"
      :id="menuId"
      ref="menuRef"
      class="vertical-alignment-menu__panel"
      :style="floatingStyles"
      role="menu"
      :aria-label="t('format.verticalAlignment')"
      @keydown="onMenuKeydown"
    >
      <button
        type="button"
        role="menuitemradio"
        tabindex="-1"
        data-vertical-alignment-option="top"
        :aria-checked="isSelected('top')"
        @click="selectAlignment('top')"
      >
        <AlignVerticalJustifyStart :size="17" :stroke-width="2" aria-hidden="true" />
        <span>{{ t("format.alignTop") }}</span>
        <Check
          class="vertical-alignment-menu__check"
          :class="{ 'is-visible': isSelected('top') }"
          :size="15"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        role="menuitemradio"
        tabindex="-1"
        data-vertical-alignment-option="middle"
        :aria-checked="isSelected('middle')"
        @click="selectAlignment('middle')"
      >
        <AlignVerticalJustifyCenter :size="17" :stroke-width="2" aria-hidden="true" />
        <span>{{ t("format.alignMiddle") }}</span>
        <Check
          class="vertical-alignment-menu__check"
          :class="{ 'is-visible': isSelected('middle') }"
          :size="15"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        role="menuitemradio"
        tabindex="-1"
        data-vertical-alignment-option="bottom"
        :aria-checked="isSelected('bottom')"
        @click="selectAlignment('bottom')"
      >
        <AlignVerticalJustifyEnd :size="17" :stroke-width="2" aria-hidden="true" />
        <span>{{ t("format.alignBottom") }}</span>
        <Check
          class="vertical-alignment-menu__check"
          :class="{ 'is-visible': isSelected('bottom') }"
          :size="15"
          aria-hidden="true"
        />
      </button>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.vertical-alignment-menu {
  &__trigger {
    position: relative;
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 26px;
    gap: 2px;
    padding: 0 3px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 2px;
    color: var(--idea-text-primary);
    cursor: pointer;

    &:hover:not(:disabled),
    &.is-expanded {
      background: var(--idea-surface-hover);
    }

    &:focus-visible:not(.is-expanded) {
      border-color: var(--idea-action-primary);
      outline: none;
      box-shadow: 0 0 0 2px var(--idea-action-focus);
    }

    &.is-expanded {
      outline: none;
    }

    &.is-mixed::after {
      position: absolute;
      right: 7px;
      bottom: 2px;
      left: 7px;
      height: 2px;
      background: var(--idea-text-muted);
      content: "";
      pointer-events: none;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }

  &__trigger-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 17px;
    height: 17px;
  }

  &__disclosure {
    flex: 0 0 auto;
    color: var(--idea-text-muted);
    transition: transform 120ms ease;

    &.is-expanded {
      transform: rotate(180deg);
    }
  }

  &__panel {
    z-index: 100;
    display: grid;
    min-width: 156px;
    padding: var(--idea-menu-padding);
    background: var(--idea-surface-panel);
    border: 1px solid var(--idea-border-control);
    border-radius: var(--idea-radius-medium);
    box-shadow: var(--idea-shadow-floating);

    > button {
      display: grid;
      grid-template-columns: 18px minmax(0, 1fr) 16px;
      align-items: center;
      width: 100%;
      height: 30px;
      gap: 8px;
      padding: 0 14px;
      background: transparent;
      border: 0;
      border-radius: 2px;
      color: var(--idea-text-primary);
      cursor: pointer;
      font: inherit;
      text-align: left;

      &:hover,
      &:focus-visible {
        background: var(--idea-surface-hover);
        outline: none;
      }
    }
  }

  &__check {
    opacity: 0;

    &.is-visible {
      opacity: 1;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .vertical-alignment-menu__disclosure {
    transition: none;
  }
}
</style>
