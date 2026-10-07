<script setup lang="ts">
import { SelectInput as TSelectInput } from "tdesign-vue-next/es/select-input";
import type { PopupProps } from "tdesign-vue-next/es/popup";
import { computed, nextTick, ref, useId, watch, watchPostEffect } from "vue";
import { vIconAction } from "../../../shared/focus/icon-action";
import RibbonDropdownArrow from "../../../shared/ribbon/RibbonDropdownArrow.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";

const props = defineProps<{
  modelValue?: string | number;
  options: Array<{ label: string; value: string | number }>;
  label: string;
  disabled: boolean;
  popupAttach?: () => HTMLElement;
  matchPanelWidth?: boolean;
}>();
const emit = defineEmits<{ change: [value: string | number] }>();
const displayValue = computed(
  () =>
    props.options.find((option) => option.value === props.modelValue)?.label ??
    String(props.modelValue ?? ""),
);
const control = ref<HTMLElement | null>(null);
watchPostEffect(() => {
  control.value?.querySelector("input")?.setAttribute("aria-label", props.label);
});
const draft = ref("");
watch(
  displayValue,
  (value) => {
    draft.value = value;
  },
  { immediate: true },
);
const triggerRef = ref<HTMLElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = useId();
const open = ref(false);
const focusMenuOnMount = ref(false);
watchPostEffect(() => {
  if (open.value && focusMenuOnMount.value && menuSurfaceRef.value?.rootElement) {
    menuSurfaceRef.value.focusFirstItem();
    focusMenuOnMount.value = false;
  }
});
const popupProps = computed<PopupProps>(() => ({
  attach: props.popupAttach,
  placement: "bottom-left",
  trigger: "click",
  overlayInnerClassName: "idea-font-options-popup",
  ...(props.matchPanelWidth
    ? {
        overlayInnerStyle: (trigger: HTMLElement) => ({ width: `${trigger.offsetWidth}px` }),
      }
    : {}),
  overlayStyle: { zIndex: "var(--idea-layer-menu)" },
}));
let selectOnClick = false;
function focus(_value: unknown, { e }: { e: FocusEvent }): void {
  const input = e.target;
  if (input instanceof HTMLInputElement) {
    input.select();
    selectOnClick = true;
  }
}
function clickInput(event: MouseEvent): void {
  if (selectOnClick && event.target instanceof HTMLInputElement) {
    event.target.select();
    selectOnClick = false;
  }
}
function dismiss(): void {
  open.value = false;
  void nextTick(() => triggerRef.value?.focus());
}
function toggleMenu(): void {
  if (!props.disabled) open.value = !open.value;
}
function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  if (props.disabled) return;
  open.value = true;
  focusMenuOnMount.value = true;
}
function onMenuKeydown(event: KeyboardEvent): void {
  if (event.key !== "Escape") return;
  event.preventDefault();
  event.stopPropagation();
  dismiss();
}
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) open.value = false;
  },
);
async function commit(): Promise<void> {
  if (props.disabled || open.value || draft.value === displayValue.value) return;
  emit("change", draft.value);
  await nextTick();
  draft.value = displayValue.value;
}
function select(value: string | number): void {
  draft.value = displayValue.value;
  emit("change", value);
  dismiss();
}
function keydown(_value: string | number, { e }: { e: KeyboardEvent }): void {
  if (e.key === "Enter" && !e.isComposing) {
    e.preventDefault();
    e.stopPropagation();
    void commit();
  } else if (e.key === "Escape") {
    draft.value = displayValue.value;
    e.stopPropagation();
  }
}
</script>

<template>
  <div
    ref="control"
    class="font-format-field"
    :class="{ 'is-disabled': disabled, 'is-open': open }"
    @click="clickInput"
  >
    <TSelectInput
      class="idea-ribbon-font-input"
      :value="draft"
      v-model:input-value="draft"
      allow-input
      size="small"
      :popup-visible="open"
      :popup-props="popupProps"
      :input-props="{ onKeydown: keydown }"
      :aria-label="label"
      :disabled="disabled"
      @popup-visible-change="
        (visible, context) => {
          if (!visible && context.trigger !== 'trigger-element-hover') open = false;
        }
      "
      @focus="focus"
      @blur="commit"
      @enter="(_value, context) => keydown(draft, context)"
    >
      <template #suffixIcon>
        <span
          ref="triggerRef"
          v-icon-action="disabled"
          class="font-format-field__arrow"
          :aria-label="label"
          aria-haspopup="menu"
          :aria-expanded="open"
          :aria-controls="open ? menuId : undefined"
          @mousedown.prevent
          @click.stop="toggleMenu"
          @keydown.stop="onTriggerKeydown"
          ><RibbonDropdownArrow :expanded="open"
        /></span>
      </template>
      <template #panel>
        <MenuSurface
          v-if="open"
          :id="menuId"
          ref="menuSurfaceRef"
          class="font-format-field__menu"
          :style="
            matchPanelWidth
              ? {
                  width: '100%',
                  minWidth: '0',
                  boxSizing: 'border-box',
                  '--idea-menu-item-padding-inline': '6px',
                }
              : { minWidth: `${control?.offsetWidth ?? 48}px` }
          "
          @keydown="onMenuKeydown"
          :label="label"
        >
          <MenuRadioItem
            v-for="option in options"
            :key="option.value"
            :checked="option.value === modelValue"
            indicator="none"
            @select="select(option.value)"
            >{{ option.label }}</MenuRadioItem
          >
        </MenuSurface>
      </template>
    </TSelectInput>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-actions" as ribbon;

.font-format-field {
  position: relative;
  width: 100%;
  min-width: 0;

  &:not(.is-disabled):is(:hover, .is-open)::after {
    position: absolute;
    inset: 1px;
    border-radius: var(--idea-radius-default);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--idea-text-primary) 14%, transparent);
    content: "";
    pointer-events: none;
  }

  &__arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: var(--ribbon-control-height, 26px);
    background: transparent;
    cursor: pointer;
    @include ribbon.feedback;
    --ribbon-feedback-inset: 1px 1px 1px 0;

    &::before {
      border-radius: 0 var(--idea-radius-default) var(--idea-radius-default) 0;
    }

    &[aria-disabled="true"] {
      cursor: not-allowed;
    }
  }

  &__menu {
    z-index: var(--idea-layer-menu);
    min-width: 48px;
    max-height: min(360px, calc(100vh - 32px));
  }
}
</style>
