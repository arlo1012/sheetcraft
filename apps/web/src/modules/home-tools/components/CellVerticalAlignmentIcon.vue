<script setup lang="ts">
defineProps<{ alignment: "top" | "middle" | "bottom" }>();
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="1.5"
    stroke-linecap="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-if="alignment === 'top'" d="M4 5h16M7 9h10M7 13h10" />
    <path v-else-if="alignment === 'middle'" d="M7 8h10M4 12h16M7 16h10" />
    <path v-else d="M7 11h10M7 15h10M4 19h16" />
  </svg>
</template>
