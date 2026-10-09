<script setup lang="ts">
import { Checkbox } from "tdesign-vue-next/es/checkbox";
import type { usePivotActions } from "../usePivotActions";
import { useAppI18n } from "../../../shared/i18n";

defineProps<{
  error: boolean;
  errorReason?: ReturnType<typeof usePivotActions>["errorReason"]["value"];
  newSheet: boolean;
  disabled: boolean;
}>();
const overwrite = defineModel<boolean>({ required: true });
const { t } = useAppI18n();
</script>

<template>
  <Checkbox
    v-if="error && (!errorReason || errorReason === 'overwrite') && !newSheet"
    v-model="overwrite"
    :disabled="disabled"
    >{{ t("pivot.overwrite") }}</Checkbox
  >
  <p v-if="error && errorReason" role="alert">
    {{ t(errorReason === "invalid" ? "pivot.invalid" : `pivot.error.${errorReason}`) }}
  </p>
</template>

<style scoped lang="scss">
[role="alert"] {
  margin: 0;
  color: var(--sheetcraft-status-error);
}
</style>
