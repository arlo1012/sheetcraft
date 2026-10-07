<script setup lang="ts">
defineProps<{ alignment: "top" | "middle" | "bottom" }>();
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    style="stroke-width: var(--idea-icon-stroke-width)"
    stroke-linecap="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-if="alignment === 'top'" d="M3 3h18M3 8h18M3 13h18" />
    <path v-else-if="alignment === 'middle'" d="M3 7h18M3 12h18M3 17h18" />
    <path v-else d="M3 11h18M3 16h18M3 21h18" />
  </svg>
</template>
