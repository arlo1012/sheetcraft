<script setup lang="ts">
import TextVerticalAlignmentIcon from "../../../shared/text-format/TextVerticalAlignmentIcon.vue";

defineProps<{ alignment: "top" | "middle" | "bottom" }>();
</script>

<template>
  <TextVerticalAlignmentIcon :alignment="alignment" />
</template>
