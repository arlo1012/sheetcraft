<script setup lang="ts">
import { computed, ref } from "vue";
import FloatingPanelSurface from "../floating/FloatingPanelSurface.vue";
import { useFloatingPanel } from "../floating/useFloatingPanel";
const props = withDefaults(
  defineProps<{
    id: string;
    message?: string;
    invalid?: boolean;
    status?: boolean;
    presentation?: "inline" | "floating";
    anchor?: HTMLElement | null;
    active?: boolean;
    descriptionOnly?: boolean;
  }>(),
  { presentation: "inline", active: false, invalid: false, descriptionOnly: false },
);
const surface = ref<InstanceType<typeof FloatingPanelSurface>>();
const visibleFloating = computed(
  () =>
    !!props.message && props.presentation === "floating" && props.active && !props.descriptionOnly,
);
const descriptionOnly = computed(
  () => props.descriptionOnly || (props.presentation === "floating" && !visibleFloating.value),
);
const { floatingStyles } = useFloatingPanel(
  computed(() => props.anchor ?? null),
  computed(() => surface.value?.rootElement ?? null),
  visibleFloating,
  { placement: "bottom-start", offset: 6 },
);
</script>
<template>
  <Teleport v-if="visibleFloating" to="body">
    <FloatingPanelSurface
      ref="surface"
      role="presentation"
      :label="message || ''"
      padding="compact"
      layer="popover"
      appearance="note"
      class="field-feedback-float"
      :style="floatingStyles"
      data-field-feedback-floating
    >
      <p :id="id" class="field-feedback" :role="invalid ? 'alert' : 'status'">{{ message }}</p>
    </FloatingPanelSurface>
  </Teleport>
  <p
    v-else-if="message"
    :id="id"
    class="field-feedback"
    :class="{ 'field-feedback--description-only': descriptionOnly }"
    :role="invalid ? 'alert' : status ? 'status' : undefined"
  >
    {{ message }}
  </p>
</template>
<style scoped lang="scss">
.field-feedback {
  grid-column: 1 / -1;
  margin: 4px 0 0;
  font-size: var(--sheetcraft-font-size-body-small);
  line-height: var(--sheetcraft-line-height-body-small);
  overflow-wrap: anywhere;
  &--description-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }
}
.field-feedback-float {
  // Informational only: never steal a pointer/focus or obstruct an outside action.
  pointer-events: none;
  width: max-content;
  max-width: min(280px, calc(100vw - 16px));
  .field-feedback {
    margin: 0;
  }
}
</style>
