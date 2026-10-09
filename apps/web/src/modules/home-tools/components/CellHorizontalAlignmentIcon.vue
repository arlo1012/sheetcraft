<script setup lang="ts">
defineProps<{ alignment: "left" | "center" | "right" | "justify" | "distributed" }>();
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    style="stroke-width: var(--sheetcraft-icon-stroke-width)"
    aria-hidden="true"
    focusable="false"
  >
    <path v-if="alignment === 'left'" d="M3 3h18M3 9h12M3 15h18M3 21h12" />
    <path v-else-if="alignment === 'center'" d="M3 3h18M6 9h12M3 15h18M6 21h12" />
    <path v-else-if="alignment === 'right'" d="M3 3h18M9 9h12M3 15h18M9 21h12" />
    <path v-else-if="alignment === 'justify'" d="M3 3h18M3 9h18M3 15h18M3 21h9" />
    <path v-else d="M3 3h18M3 9h18M3 15h18M3 21h18" />
  </svg>
</template>
