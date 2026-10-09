<script setup lang="ts">
defineProps<{ increase: boolean }>();
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    style="stroke-width: var(--sheetcraft-icon-stroke-width)"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <circle cx="4" cy="10" r="0.75" fill="currentColor" stroke="none" />
    <rect x="7" y="3" width="5" height="8" rx="2" />
    <rect v-if="increase" x="16" y="3" width="5" height="8" rx="2" />
    <path v-if="increase" d="M20 18H4m4-4-4 4 4 4" />
    <path v-else d="M4 18h16m-4-4 4 4-4 4" />
  </svg>
</template>
