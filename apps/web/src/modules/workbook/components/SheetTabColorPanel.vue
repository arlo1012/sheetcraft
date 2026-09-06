<script setup lang="ts">
import { Button as TButton } from "tdesign-vue-next/es/button";
import { ColorPickerPanel } from "tdesign-vue-next/es/color-picker";
import { computed, nextTick, ref, toRef, watch } from "vue";
import { useDismissibleFloatingPanel } from "../../../shared/floating/useDismissibleFloatingPanel";
import { useAppI18n } from "../../../shared/i18n";

const SWATCH_COLORS = [
  "#ffffff",
  "#f87171",
  "#fb923c",
  "#facc15",
  "#4ade80",
  "#60a5fa",
  "#a78bfa",
  "#f472b6",
] as const;
const DISABLED_RECENT_COLORS = null as unknown as string[];
const props = defineProps<{ anchor: HTMLElement | null; open: boolean; value?: string }>();
const emit = defineEmits<{
  apply: [value: string | null];
  close: [
    reason: "escape" | "outside-pointer" | "outside-focus" | "programmatic",
    restoreFocus: boolean,
  ];
}>();
const { t } = useAppI18n();
const panelRef = ref<HTMLElement | null>(null);
const panelOpen = toRef(props, "open");
const anchorRef = computed(() => props.anchor);
const draft = ref(props.value ?? "#ffffff");
const { floatingStyles, dismiss } = useDismissibleFloatingPanel(anchorRef, panelRef, panelOpen, {
  placement: "top-start",
  offset: 4,
  onDismiss: ({ reason, restoreFocus }) => emit("close", reason, restoreFocus),
});

function normalizeColor(value: string): string | undefined {
  const normalized = value.trim().toUpperCase();
  return /^#[0-9A-F]{6}$/.test(normalized) ? normalized : undefined;
}

function updateDraft(value: string): void {
  const color = normalizeColor(value);
  if (color) draft.value = color;
}

function apply(): void {
  const color = normalizeColor(draft.value);
  if (!color) return;
  emit("apply", color);
}

function reset(): void {
  emit("apply", null);
}

function onKeydown(event: KeyboardEvent): void {
  event.stopPropagation();
  if (event.key === "Escape") {
    event.preventDefault();
    dismiss("escape", true);
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    draft.value = props.value ?? "#ffffff";
    void nextTick(() => panelRef.value?.focus());
  },
);

watch(
  () => props.value,
  (value) => {
    if (props.open) draft.value = value ?? "#ffffff";
  },
);

defineExpose({ dismiss, rootElement: panelRef });
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panelRef"
      class="sheet-tab-color-panel"
      :style="floatingStyles"
      role="dialog"
      :aria-label="t('sheetTabs.tabColorAction')"
      tabindex="-1"
      @keydown="onKeydown"
    >
      <ColorPickerPanel
        :model-value="draft"
        :color-modes="['monochrome']"
        format="HEX"
        :enable-alpha="false"
        :recent-colors="DISABLED_RECENT_COLORS"
        :show-primary-color-preview="false"
        :swatch-colors="[...SWATCH_COLORS]"
        @change="updateDraft"
      />
      <div class="sheet-tab-color-panel__actions">
        <TButton
          type="button"
          variant="text"
          size="small"
          data-tab-color-action="reset"
          @click="reset"
        >
          {{ t("format.resetColor") }}
        </TButton>
        <span aria-hidden="true" />
        <TButton
          type="button"
          variant="outline"
          size="small"
          data-tab-color-action="cancel"
          @click="dismiss('programmatic', true)"
        >
          {{ t("format.cancelColor") }}
        </TButton>
        <TButton
          type="button"
          theme="primary"
          size="small"
          data-tab-color-action="apply"
          @click="apply"
        >
          {{ t("format.applyColor") }}
        </TButton>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.sheet-tab-color-panel {
  z-index: 90;
  max-width: calc(100vw - var(--idea-space-4) - var(--idea-space-4));
  max-height: calc(100vh - var(--idea-space-4) - var(--idea-space-4));
  overflow: auto;
  background: var(--idea-surface-panel);
  border: 1px solid var(--idea-border-control);
  border-radius: var(--idea-radius-medium);
  box-shadow: var(--idea-shadow-floating);

  &:focus-visible {
    outline: 2px solid var(--idea-action-primary);
    outline-offset: 2px;
  }

  &__actions {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    gap: 6px;
    align-items: center;
    padding: 8px;
    border-top: 1px solid var(--idea-border-subtle);
  }
}
</style>
