<script setup lang="ts">
import { ref } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input } from "tdesign-vue-next/es/input";
import { useAppI18n } from "../../../shared/i18n";
import { vNativeControl } from "../../../shared/tdesign/native-control";

defineProps<{
  visible: boolean;
  query: string;
}>();
const emit = defineEmits<{
  updateQuery: [query: string];
  find: [direction: "forward" | "backward"];
  close: [];
  closed: [];
}>();
const { t } = useAppI18n();
const input = ref<InstanceType<typeof Input>>();

function onKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" || event.isComposing) return;
  event.preventDefault();
  emit("find", event.shiftKey ? "backward" : "forward");
}
</script>

<template>
  <Dialog
    :visible="visible"
    :header="t('navigation.findInSheet')"
    mode="modeless"
    draggable
    top="160px"
    width="min(440px, calc(100vw - 32px))"
    :show-overlay="false"
    :prevent-scroll-through="false"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    @opened="input?.focus()"
    @close="emit('close')"
    @closed="emit('closed')"
  >
    <div class="workbook-find-dialog" @keydown="onKeydown">
      <Input
        ref="input"
        :value="query"
        v-native-control="{ attributes: { 'aria-label': t('navigation.findInSheet') } }"
        :placeholder="t('navigation.findPlaceholder')"
        autocomplete="off"
        :spell-check="false"
        clearable
        data-search-input
        @update:value="emit('updateQuery', String($event))"
      />
    </div>
    <template #footer>
      <div class="workbook-find-dialog__actions">
        <Button variant="outline" :disabled="!query.trim()" @click="emit('find', 'backward')">
          {{ t("navigation.findPrevious") }}
        </Button>
        <Button theme="primary" :disabled="!query.trim()" @click="emit('find', 'forward')">
          {{ t("navigation.findNext") }}
        </Button>
      </div>
    </template>
  </Dialog>
</template>

<style scoped lang="scss">
.workbook-find-dialog {
  min-width: 0;

  &__actions {
    display: flex;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: var(--idea-space-4);
  }
}
</style>
