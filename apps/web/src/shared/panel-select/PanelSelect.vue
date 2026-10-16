<script setup lang="ts">
import { computed, nextTick, ref, useId, watch, watchPostEffect } from "vue";
import TSelectArrow from "tdesign-vue-next/es/common-components/fake-arrow";
import { SelectInput as TSelectInput } from "tdesign-vue-next/es/select-input";
import type { PopupProps } from "tdesign-vue-next/es/popup";

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    label: string;
    valueLabel: string;
    disabled?: boolean;
    panelWidth?: "trigger" | "content";
    panelClass?: string;
  }>(),
  { disabled: false, panelWidth: "trigger" },
);
const emit = defineEmits<{ "open-change": [open: boolean] }>();
defineSlots<{
  value(): unknown;
  panel(props: { close: () => void }): unknown;
}>();

const open = ref(false);
const composing = ref(false);
const control = ref<HTMLElement>();
const panel = ref<HTMLElement>();
const panelId = useId();
const inputAttributes = computed(() => ({
  id: `panel-select-${panelId}`,
  "data-panel-select-control": composing.value ? undefined : "readonly-combobox",
  role: "combobox",
  "aria-label": `${props.label}: ${props.valueLabel}`,
  "aria-expanded": String(open.value),
  "aria-haspopup": "dialog",
  "aria-controls": open.value ? panelId : undefined,
}));
const popupProps = computed<PopupProps>(() => ({
  placement: "bottom-left",
  // Like shared floating surfaces, a body popup must not enlarge document scroll
  // overflow. A transient scrollbar would resize the grid and revoke its owner lease.
  popperOptions: {
    strategy: "fixed",
    modifiers: [
      { name: "flip", options: { padding: 8 } },
      { name: "preventOverflow", options: { padding: 8, altAxis: true } },
    ],
  },
  // TDesign applies overlayInnerStyle after mounting. Bound the outer popup in
  // its first render, before that delayed update can affect worksheet geometry.
  overlayStyle: (triggerElement) => {
    const rect = triggerElement.getBoundingClientRect();
    const viewportHeight = document.documentElement.clientHeight || window.innerHeight;
    const availableHeight = Math.max(rect.top, viewportHeight - rect.bottom) - 16;
    return {
      position: "fixed",
      width: props.panelWidth === "content" ? "max-content" : `${triggerElement.offsetWidth}px`,
      maxWidth: "calc(100vw - 16px)",
      maxHeight: `${Math.max(0, availableHeight)}px`,
      overflow: "auto",
      overscrollBehavior: "contain",
    };
  },
  overlayInnerStyle: { padding: "0" },
}));

// TDesign forwards extra inputProps attributes to the wrapper, not the input.
watchPostEffect(() => {
  const input = control.value?.querySelector<HTMLInputElement>("input");
  if (!input) return;
  for (const [name, value] of Object.entries(inputAttributes.value)) {
    if (value === undefined) input.removeAttribute(name);
    else input.setAttribute(name, value);
  }
});

function close(): void {
  open.value = false;
  void nextTick(() => {
    if (!props.disabled) control.value?.querySelector<HTMLInputElement>("input")?.focus();
  });
}

// The library also has a native ArrowDown listener. During IME, keep those
// keys within the browser composition session without cancelling its default.
function guardCompositionKeydown(event: KeyboardEvent): void {
  if (
    event.target === control.value?.querySelector("input") &&
    (composing.value || event.isComposing || event.keyCode === 229)
  )
    event.stopPropagation();
}

function onTriggerKeydown(_value: string | number, { e }: { e: KeyboardEvent }): void {
  if (props.disabled || composing.value || e.isComposing || e.keyCode === 229) return;
  if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
    e.stopPropagation();
    open.value = true;
  } else if (e.key === "Escape" && open.value) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }
}

function onPanelKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape" || event.defaultPrevented) return;
  event.preventDefault();
  event.stopPropagation();
  close();
}

watch(open, (visible) => {
  emit("open-change", visible);
  if (visible) {
    void nextTick(() => {
      if (!open.value) return;
      panel.value
        ?.querySelector<HTMLElement>(
          "input:not([disabled]), button:not([disabled]), [tabindex='0']",
        )
        ?.focus();
    });
  }
});
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) open.value = false;
  },
);
</script>

<template>
  <div
    ref="control"
    class="panel-select sheetcraft-panel-select"
    @keydown.capture="guardCompositionKeydown"
    @compositionstart.capture="composing = true"
    @compositionend.capture="composing = false"
  >
    <TSelectInput
      :value="{ value: modelValue, label: valueLabel }"
      :disabled="disabled"
      :popup-visible="open"
      :popup-props="popupProps"
      :input-props="{ onKeydown: onTriggerKeydown, onEnter: onTriggerKeydown }"
      @popup-visible-change="open = !disabled && $event"
    >
      <template #valueDisplay>
        <span class="panel-select__value"><slot name="value" /></span>
      </template>
      <template #suffixIcon>
        <TSelectArrow :is-active="open" aria-hidden="true" />
      </template>
      <template #panel>
        <div
          v-if="open"
          :id="panelId"
          ref="panel"
          class="panel-select__panel"
          :class="panelClass"
          role="dialog"
          :aria-label="label"
          @keydown="onPanelKeydown"
        >
          <slot name="panel" :close="close" />
        </div>
      </template>
    </TSelectInput>
  </div>
</template>

<style scoped lang="scss">
.panel-select {
  width: 100%;
  min-width: 0;

  &__value {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-width: 0;
  }

  &__panel {
    width: 100%;
    min-width: 0;
  }
}
</style>
