<script setup lang="ts">
import { Alert as TAlert } from "tdesign-vue-next/es/alert";

export type DialogFooterStatusTheme = "info" | "warning" | "error" | "success";

withDefaults(
  defineProps<{
    status?: string | null;
    theme?: DialogFooterStatusTheme;
    statusRole?: "alert" | "status";
    ariaLive?: "polite" | "assertive" | "off";
  }>(),
  {
    status: undefined,
    theme: "info",
    statusRole: undefined,
    ariaLive: undefined,
  },
);

defineSlots<{
  status?: () => unknown;
  default?: () => unknown;
}>();
</script>

<template>
  <div class="sheetcraft-dialog-footer">
    <slot name="status">
      <TAlert
        v-if="status"
        :theme="theme"
        :message="status"
        :role="statusRole ?? (theme === 'error' || theme === 'warning' ? 'alert' : 'status')"
        :aria-live="ariaLive"
      />
    </slot>
    <div class="sheetcraft-dialog-footer__actions">
      <slot />
    </div>
  </div>
</template>
