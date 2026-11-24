<script setup lang="ts">
import TextHorizontalAlignmentIcon from "../../../shared/text-format/TextHorizontalAlignmentIcon.vue";

defineProps<{ alignment: "left" | "center" | "right" | "justify" | "distributed" }>();
</script>

<template>
  <TextHorizontalAlignmentIcon :alignment="alignment" />
</template>
