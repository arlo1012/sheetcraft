<template>
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="3" y="3" width="18" height="18" rx="1" />
    <path d="M3 9h18M9 3v18" stroke-dasharray="2 3" />
  </svg>
</template>

<style scoped lang="scss">
svg {
  width: var(--idea-icon-size, var(--idea-action-icon-size));
  height: var(--idea-icon-size, var(--idea-action-icon-size));
  stroke-width: var(--idea-icon-stroke-width);
}
</style>
