<script setup lang="ts">
import ColorPalette from "../../../shared/color/ColorPalette.vue";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  update: [color: string];
}>();

const DEFAULT_BORDER_COLOR = "#20242c";

function selectColor(color: string | null): void {
  emit("update", color ?? DEFAULT_BORDER_COLOR);
}
</script>

<template>
  <ColorPalette
    class="border-color-panel"
    :model-value="modelValue"
    :default-color="DEFAULT_BORDER_COLOR"
    @select="selectColor"
  />
</template>
