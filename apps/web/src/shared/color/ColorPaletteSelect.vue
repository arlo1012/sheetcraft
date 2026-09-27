<script setup lang="ts">
import { ChevronDown } from "lucide-vue-next";
import { SelectInput as TSelectInput } from "tdesign-vue-next/es/select-input";
import type { PopupProps } from "tdesign-vue-next/es/popup";
import { computed, nextTick, ref, useId, watch, watchPostEffect } from "vue";
import ColorPalette from "./ColorPalette.vue";

const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    label: string;
    defaultColor: string;
    defaultLabel: string;
  }>(),
  { modelValue: undefined },
);
const emit = defineEmits<{ select: [color: string | null] }>();
const open = ref(false);
const control = ref<HTMLElement>();
const panelId = useId();
const color = computed(() => props.modelValue ?? props.defaultColor);
const popupProps = computed<PopupProps>(() => ({
  placement: "bottom-left",
  overlayInnerStyle: {
    width: "max-content",
    padding: "0",
    maxHeight: "min(360px, calc(100vh - 32px))",
  },
}));

watchPostEffect(() => {
  const input = control.value?.querySelector<HTMLInputElement>("input");
  if (!input) return;
  input.setAttribute("aria-label", props.label);
  input.setAttribute("aria-expanded", String(open.value));
  input.setAttribute("aria-haspopup", "dialog");
  if (open.value) input.setAttribute("aria-controls", panelId);
  else input.removeAttribute("aria-controls");
});

function close(): void {
  open.value = false;
  void nextTick(() => control.value?.querySelector<HTMLInputElement>("input")?.focus());
}
function select(value: string | null): void {
  emit("select", value);
  close();
}
function onKeydown(_value: string | number, { e }: { e: KeyboardEvent }): void {
  if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key)) {
    e.preventDefault();
    open.value = true;
  } else if (e.key === "Escape") close();
}
watch(open, (visible) => {
  if (!visible) return;
  void nextTick(() =>
    document.getElementById(panelId)?.querySelector<HTMLElement>("button:not([disabled])")?.focus(),
  );
});
</script>

<template>
  <div ref="control" class="color-palette-select">
    <TSelectInput
      :value="{ value: modelValue, label: color.toUpperCase() }"
      :popup-visible="open"
      :popup-props="popupProps"
      :input-props="{ onKeydown }"
      @popup-visible-change="open = $event"
    >
      <template #valueDisplay
        ><span class="color-palette-select__value"
          ><span
            class="color-palette-select__swatch"
            :style="{ backgroundColor: color }"
            aria-hidden="true"
          /><span>{{ color.toUpperCase() }}</span></span
        ></template
      >
      <template #suffixIcon><ChevronDown :size="14" aria-hidden="true" /></template>
      <template #panel>
        <div
          v-if="open"
          :id="panelId"
          class="color-palette-select__panel"
          role="dialog"
          :aria-label="label"
        >
          <ColorPalette
            :model-value="modelValue"
            :default-color="defaultColor"
            :default-label="defaultLabel"
            compact
            @select="select"
          />
        </div>
      </template>
    </TSelectInput>
  </div>
</template>

<style scoped lang="scss">
.color-palette-select {
  min-width: 0;
  &__value {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  &__swatch {
    width: 14px;
    height: 14px;
    border: 1px solid var(--idea-border-subtle);
    border-radius: var(--idea-radius-small);
  }
  &__panel {
    max-height: min(360px, calc(100vh - 32px));
    overflow: auto;
  }
}
</style>
