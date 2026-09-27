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
  padding: 0 14px;
  color: var(--idea-text-primary);
  font: inherit;
  font-size: var(--idea-font-size-body-medium);
  line-height: var(--idea-line-height-body-medium);
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
    background: var(--idea-surface-hover);
    outline: none;
  }

  &:focus-visible:not(&--disabled) {
    box-shadow: inset 0 0 0 1px var(--idea-action-primary);
  }

  &--compound:has(&__command:focus-visible):not(&--disabled) {
    background: var(--idea-surface-hover);
    box-shadow: inset 0 0 0 1px var(--idea-action-primary);
  }

  &--danger:not(&--disabled) {
    color: var(--idea-status-error);
  }

  &--disabled {
    color: var(--idea-text-disabled);
  }

  &__icon {
    --idea-icon-size: var(--idea-menu-icon-size);

    :deep(svg.lucide) {
      width: var(--idea-icon-size);
      height: var(--idea-icon-size);
      stroke-width: var(--idea-icon-stroke-width);
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
    color: var(--idea-text-secondary);
    font-size: var(--idea-font-size-body-small);
    line-height: var(--idea-line-height-body-small);
  }
}
</style>
