<script setup lang="ts">
import { Input as TInput } from "tdesign-vue-next/es/input";
import { computed, nextTick, ref, useId, watch, watchPostEffect } from "vue";
import { vIconAction } from "../../../shared/focus/icon-action";
import RibbonDropdownArrow from "../../../shared/ribbon/RibbonDropdownArrow.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import { useMenu } from "../../../shared/menu/useMenu";

const props = defineProps<{
  modelValue?: string | number;
  options: Array<{ label: string; value: string | number }>;
  label: string;
  disabled: boolean;
  popupAttach?: () => HTMLElement;
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
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef,
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "selected",
  pointerFocus: "menu",
  placement: "bottom-end",
});
async function commit(): Promise<void> {
  if (props.disabled || open.value || draft.value === displayValue.value) return;
  emit("change", draft.value);
  await nextTick();
  draft.value = displayValue.value;
}
function select(value: string | number): void {
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
  <div ref="control" class="font-format-field">
    <TInput
      class="idea-ribbon-font-input"
      v-model="draft"
      borderless
      size="small"
      :aria-label="label"
      :disabled="disabled"
      @blur="commit"
      @keydown="keydown"
      @enter="keydown"
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
    </TInput>
    <Teleport :to="popupAttach?.() ?? 'body'">
      <MenuSurface
        v-if="open"
        :id="menuId"
        ref="menuSurfaceRef"
        class="font-format-field__menu"
        :style="{ ...floatingStyles, minWidth: `${control?.offsetWidth ?? 64}px` }"
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
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.font-format-field {
  width: 100%;
  min-width: 0;

  &__arrow {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 20px;
    background: transparent;
    cursor: pointer;
    border-radius: var(--idea-radius-small);

    &[aria-disabled="true"] {
      cursor: not-allowed;
    }
  }

  &__menu {
    z-index: var(--idea-layer-menu);
    min-width: 64px;
    max-height: min(360px, calc(100vh - 32px));
  }
}
</style>
