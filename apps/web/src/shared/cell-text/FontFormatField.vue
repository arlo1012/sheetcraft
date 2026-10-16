<script setup lang="ts">
import { SelectInput as TSelectInput } from "tdesign-vue-next/es/select-input";
import type { PopupProps } from "tdesign-vue-next/es/popup";
import type { SelectInputValueChangeContext } from "tdesign-vue-next/es/select-input";
import type { SelectInputBlurContext } from "tdesign-vue-next/es/select-input";
import { computed, nextTick, ref, useId, watch, watchPostEffect, reactive } from "vue";
import { vIconAction } from "../focus/icon-action";
import RibbonDropdownArrow from "../ribbon/RibbonDropdownArrow.vue";
import MenuSurface from "../menu/MenuSurface.vue";
import MenuRadioItem from "../menu/MenuRadioItem.vue";
import MenuSearch from "../menu/MenuSearch.vue";
import { filterFontFamilyOption } from "./font-catalog";
import { vNativeControl } from "../tdesign/native-control";
import type { FontFieldDraftBinding } from "./font-field-draft";

const props = defineProps<{
  modelValue?: string | number;
  /** Optional external draft: the domain remains the sole parser, lease owner and writer. */
  draft?: FontFieldDraftBinding;
  readOnly?: boolean;
  status?: "error" | "warning" | "success";
  nativeAttributes?: Record<string, string | number | boolean | null | undefined>;
  placeholder?: string;
  describedBy?: string;
  options: Array<{
    label: string;
    value: string | number;
    fontFamily?: string;
    aliases?: readonly string[];
  }>;
  label: string;
  disabled: boolean;
  popupAttach?: () => HTMLElement;
  matchPanelWidth?: boolean;
  searchLabel?: string;
  emptyLabel?: string;
}>();
defineSlots<{ searchAction?: (props: { close: () => void }) => unknown }>();
const emit = defineEmits<{ change: [value: string | number]; focusChange: [value: boolean] }>();
const displayValue = computed(
  () =>
    props.options.find((option) => option.value === props.modelValue)?.label ??
    String(props.modelValue ?? ""),
);
const control = ref<HTMLElement | null>(null);
const draft = ref("");
const inputText = computed(() => props.draft?.text ?? draft.value);
function updateDraft(value: string) {
  if (!props.draft) draft.value = value;
}
watch(
  () => props.modelValue,
  () => {
    if (!props.draft) draft.value = displayValue.value;
  },
  { immediate: true },
);
watch(displayValue, (value, previous) => {
  if (!props.draft && draft.value === previous) draft.value = value;
});
const triggerRef = ref<HTMLElement | null>(null);
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = useId();
const open = ref(false);
const query = ref("");
const filteringFromInput = ref(false);
const filteredOptions = computed(() => {
  const search = query.value.trim().toLowerCase();
  return search
    ? props.options.filter((option) => filterFontFamilyOption(search, option))
    : props.options;
});
watch(open, (visible) => {
  if (!visible) {
    query.value = "";
    filteringFromInput.value = false;
  }
});
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
  overlayInnerClassName: "sheetcraft-font-options-popup",
  ...(props.matchPanelWidth
    ? {
        overlayInnerStyle: (trigger: HTMLElement) => ({ width: `${trigger.offsetWidth}px` }),
      }
    : {}),
  overlayStyle: { zIndex: "var(--sheetcraft-layer-menu)" },
}));
let selectOnClick = false;
function focus(_value: unknown, { e }: { e: FocusEvent }): void {
  emit("focusChange", true);
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
function closeMenu(): void {
  open.value = false;
}
function inputChange(value: string, context?: SelectInputValueChangeContext): void {
  if (props.draft && !props.disabled && !props.readOnly && context?.trigger === "input")
    props.draft.edit(value);
  if (props.disabled || !props.searchLabel || context?.trigger !== "input") return;
  query.value = value;
  filteringFromInput.value = true;
  open.value = true;
}
function dismiss(): void {
  closeMenu();
  void nextTick(() =>
    props.draft
      ? control.value?.querySelector<HTMLInputElement>("input")?.focus()
      : triggerRef.value?.focus(),
  );
}
function toggleMenu(): void {
  if (props.disabled || props.readOnly) return;
  if (!open.value) {
    query.value = "";
    filteringFromInput.value = false;
  }
  open.value = !open.value;
}
function onTriggerKeydown(event: KeyboardEvent): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  if (props.disabled || props.readOnly) return;
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
  if (props.draft) {
    if (!props.draft.composing && props.draft.submit("enter")) closeMenu();
    return;
  }
  if (props.disabled || open.value || draft.value === displayValue.value) return;
  emit("change", draft.value);
  await nextTick();
  draft.value = displayValue.value;
}
function blur(_value: unknown, { e }: SelectInputBlurContext): void {
  if (props.draft) {
    if (containsTarget(e instanceof FocusEvent ? e.relatedTarget : null)) return;
    const binding = props.draft;
    void nextTick(() => {
      if (containsTarget(document.activeElement) || binding !== props.draft) return;
      closeMenu();
      emit("focusChange", false);
      if (!binding.submit("blur")) control.value?.querySelector<HTMLInputElement>("input")?.focus();
    });
    return;
  }
  emit("focusChange", false);
  if (
    e instanceof FocusEvent &&
    e.relatedTarget instanceof Node &&
    menuSurfaceRef.value?.rootElement?.contains(e.relatedTarget)
  )
    return;
  closeMenu();
  void commit();
}
function select(value: string | number): void {
  if (props.draft) {
    if (!props.disabled && !props.readOnly && !props.draft.composing && props.draft.select(value))
      dismiss();
    return;
  }
  draft.value = displayValue.value;
  emit("change", value);
  dismiss();
}
function keydown(_value: string | number, { e }: { e: KeyboardEvent }): void {
  if (e.isComposing || e.keyCode === 229 || props.draft?.composing) return;
  if (props.draft && e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    if (!props.disabled && !props.readOnly && props.draft.submit("enter")) closeMenu();
    return;
  }
  if (props.draft && e.key === "Escape") {
    e.preventDefault();
    e.stopPropagation();
    if (open.value) closeMenu();
    else props.draft.cancel();
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
    void commit();
  } else if (e.key === "Escape") {
    draft.value = displayValue.value;
    closeMenu();
    e.stopPropagation();
  } else if ((props.searchLabel || props.draft) && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
    onTriggerKeydown(e);
  }
}
function ownsDraftTarget(target: EventTarget | null) {
  return target !== null && target === control.value?.querySelector("input");
}
function containsTarget(target: EventTarget | null) {
  return (
    target instanceof Node &&
    (!!control.value?.contains(target) || !!menuSurfaceRef.value?.rootElement?.contains(target))
  );
}
function composition(event: CompositionEvent, active: boolean) {
  if (!props.draft || !ownsDraftTarget(event.target)) return;
  props.draft.setComposing(active, active ? undefined : (event.target as HTMLInputElement).value);
}
const nativeControlAttributes = computed(() => ({
  ...props.nativeAttributes,
  "aria-label": props.nativeAttributes?.["aria-label"] ?? props.label,
  "aria-describedby": props.describedBy || undefined,
  placeholder: props.placeholder || undefined,
  ...(props.draft
    ? {
        role: "combobox",
        "aria-autocomplete": "list",
        "aria-expanded": String(open.value),
        "aria-controls": open.value ? menuId : undefined,
        "aria-invalid": props.status === "error" ? "true" : undefined,
      }
    : {}),
}));
const inputProps = reactive({
  get onKeydown() {
    return keydown;
  },
  get readonly() {
    return props.readOnly;
  },
});
defineExpose({
  // Exact native main-input identity. Popup search/menu descendants are separate controls.
  ownsDraftTarget,
  // Exact focus-return trigger; consumers may own Escape without widening text input ownership.
  ownsTriggerTarget: (target: EventTarget | null) => target !== null && target === triggerRef.value,
  containsTarget,
  readDraft: () => inputText.value,
  hasDraft: () => inputText.value !== displayValue.value || !!props.draft?.composing,
  reset: () => {
    if (props.draft) props.draft.cancel();
    else draft.value = displayValue.value;
    closeMenu();
  },
  focus: () =>
    control.value?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true }),
});
</script>

<template>
  <div
    ref="control"
    class="font-format-field"
    :class="{ 'is-disabled': disabled, 'is-open': open }"
    @click="clickInput"
    @compositionstart.capture="composition($event, true)"
    @compositionend.capture="composition($event, false)"
  >
    <TSelectInput
      class="sheetcraft-ribbon-font-input"
      v-native-control="{ attributes: nativeControlAttributes }"
      :value="inputText"
      :input-value="inputText"
      @update:input-value="updateDraft"
      allow-input
      size="small"
      :popup-visible="open"
      :popup-props="popupProps"
      :input-props="inputProps"
      :readonly="readOnly"
      :status="status"
      :aria-label="label"
      :disabled="disabled"
      @popup-visible-change="
        (visible, context) => {
          if (!visible && context.trigger !== 'trigger-element-hover') open = false;
        }
      "
      @focus="focus"
      @input-change="inputChange"
      @blur="blur"
      @enter="(_value, context) => keydown(inputText, context)"
    >
      <template #suffixIcon>
        <span
          ref="triggerRef"
          v-icon-action="disabled || readOnly"
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
                  '--sheetcraft-menu-item-padding-inline': '6px',
                }
              : {
                  minWidth: `${control?.offsetWidth ?? 48}px`,
                  ...(searchLabel ? { width: '280px' } : {}),
                }
          "
          @keydown="onMenuKeydown"
          :label="label"
        >
          <template v-if="searchLabel && !filteringFromInput" #header>
            <ul class="font-format-field__search" role="presentation">
              <MenuSearch
                v-model="query"
                :label="searchLabel"
                @keydown="
                  (event) => {
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      menuSurfaceRef?.focusFirstItem();
                    }
                  }
                "
              >
                <template v-if="$slots.searchAction" #action>
                  <slot name="searchAction" :close="closeMenu" />
                </template>
              </MenuSearch>
            </ul>
          </template>
          <template #items>
            <MenuRadioItem
              v-for="option in filteredOptions"
              :key="option.value"
              :checked="option.value === modelValue"
              indicator="none"
              @select="select(option.value)"
              ><span :style="{ fontFamily: option.fontFamily }">{{
                option.label
              }}</span></MenuRadioItem
            >
            <li
              v-if="!filteredOptions.length && emptyLabel"
              class="font-format-field__empty"
              role="none"
            >
              {{ emptyLabel }}
            </li>
          </template>
        </MenuSurface>
      </template>
    </TSelectInput>
  </div>
</template>

<style scoped lang="scss">
@use "../ribbon/ribbon-actions" as ribbon;

.font-format-field {
  position: relative;
  width: 100%;
  min-width: 0;

  &:not(.is-disabled):is(:hover, .is-open)::after {
    position: absolute;
    inset: 1px;
    border-radius: var(--sheetcraft-radius-default);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--sheetcraft-text-primary) 14%, transparent);
    content: "";
    pointer-events: none;
  }

  &__arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 12px;
    padding-right: 1px;
    height: var(--ribbon-control-height, 26px);
    background: transparent;
    cursor: pointer;
    @include ribbon.feedback;
    --ribbon-feedback-inset: 1px 1px 1px 0;

    &::before {
      border-radius: 0 var(--sheetcraft-radius-default) var(--sheetcraft-radius-default) 0;
    }

    &[aria-disabled="true"] {
      cursor: not-allowed;
    }
  }

  &__menu {
    z-index: var(--sheetcraft-layer-menu);
    min-width: 48px;
    max-height: min(360px, calc(100vh - 32px));
  }
  &__search {
    padding: 0;
    margin: 0;
    list-style: none;
  }
  &__empty {
    padding: 8px 14px;
    color: var(--sheetcraft-text-secondary);
    list-style: none;
  }
}
</style>
