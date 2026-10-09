<script setup lang="ts">
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    danger?: boolean;
    disabled?: boolean;
    role?: "menuitem" | "menuitemcheckbox" | "menuitemradio";
  }>(),
  {
    danger: false,
    disabled: false,
    role: "menuitem",
  },
);

const emit = defineEmits<{
  select: [event: MouseEvent | KeyboardEvent];
}>();

function requestSelect(event: MouseEvent | KeyboardEvent): void {
  if (props.disabled) {
    event.preventDefault();
    return;
  }
  emit("select", event);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }
  if (!props.disabled) {
    event.preventDefault();
  }
  requestSelect(event);
}
</script>

<template>
  <li
    v-if="$slots.trailing"
    class="idea-menu-item"
    :class="{
      'idea-menu-item--danger': danger,
      'idea-menu-item--disabled': disabled,
      'idea-menu-item--with-icon': $slots.icon,
      'idea-menu-item--compound': $slots.trailing,
    }"
    role="none"
  >
    <span
      v-bind="$attrs"
      class="idea-menu-item__command"
      :role="role"
      tabindex="-1"
      :aria-disabled="disabled"
      @click="requestSelect"
      @keydown="onKeydown"
    >
      <span v-if="$slots.icon" class="idea-menu-item__icon" aria-hidden="true">
        <slot name="icon" />
      </span>
      <span class="idea-menu-item__label"><slot /></span>
    </span>
    <span class="idea-menu-item__trailing">
      <slot name="trailing" />
    </span>
  </li>
  <li
    v-else
    v-bind="$attrs"
    class="idea-menu-item"
    :class="{
      'idea-menu-item--danger': danger,
      'idea-menu-item--disabled': disabled,
      'idea-menu-item--with-icon': $slots.icon,
    }"
    :role="role"
    tabindex="-1"
    :aria-disabled="disabled"
    @click="requestSelect"
    @keydown="onKeydown"
  >
    <span v-if="$slots.icon" class="idea-menu-item__icon" aria-hidden="true">
      <slot name="icon" />
    </span>
    <span class="idea-menu-item__label"><slot /></span>
    <span v-if="$slots.shortcut" class="idea-menu-item__trailing" aria-hidden="true">
      <slot name="shortcut" />
    </span>
  </li>
</template>

<style scoped lang="scss">
.idea-menu-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: 30px;
  gap: 8px;
  padding: 0 var(--sheetcraft-menu-item-padding-inline, 14px);
  color: var(--sheetcraft-text-primary);
  font: inherit;
  font-size: var(--sheetcraft-font-size-body-medium);
  line-height: var(--sheetcraft-line-height-body-medium);
  letter-spacing: 0;
  list-style: none;
  text-align: left;
  white-space: nowrap;
  cursor: default;
  user-select: none;

  &--with-icon {
    grid-template-columns: 16px minmax(0, 1fr) auto;
  }

  &--compound {
    grid-template-columns: minmax(0, 1fr) auto;

    &.idea-menu-item--with-icon {
      grid-template-columns: minmax(0, 1fr) auto;
    }
  }

  &:hover:not(&--disabled),
  &:focus-visible:not(&--disabled) {
    background: var(--sheetcraft-surface-hover);
    outline: none;
  }

  &:focus-visible:not(&--disabled) {
    background: var(--sheetcraft-keyboard-focus-bg);
  }

  &--compound:has(&__command:focus-visible):not(&--disabled) {
    background: var(--sheetcraft-keyboard-focus-bg);
  }

  &--danger:not(&--disabled) {
    color: var(--sheetcraft-status-error);
  }

  &--disabled {
    color: var(--sheetcraft-text-disabled);
  }

  &__icon {
    --sheetcraft-icon-size: var(--sheetcraft-menu-icon-size);

    :deep(svg.lucide) {
      width: var(--sheetcraft-icon-size);
      height: var(--sheetcraft-icon-size);
      stroke-width: var(--sheetcraft-icon-stroke-width);
    }

    display: grid;
    width: 16px;
    place-items: center;
  }

  &__command {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: center;
    min-width: 0;
    align-self: stretch;

    .idea-menu-item--with-icon & {
      grid-template-columns: 16px minmax(0, 1fr);
      gap: 8px;
    }

    &:focus-visible {
      outline: none;
    }
  }

  &__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &__trailing {
    display: inline-flex;
    align-items: center;
    justify-content: flex-end;
    gap: 5px;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);

    :deep(svg.lucide) {
      width: var(--sheetcraft-menu-icon-size);
      height: var(--sheetcraft-menu-icon-size);
      stroke-width: var(--sheetcraft-icon-stroke-width);
    }
  }
}
</style>
