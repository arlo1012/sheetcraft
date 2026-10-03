<script setup lang="ts">
import { computed, nextTick, onMounted, ref, toRaw } from "vue";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { TabPanel, Tabs } from "tdesign-vue-next/es/tabs";
import type { CellBorderAction, CellBorderFormatPatch, CellStylePatch } from "@idea10/core/style";
import type { CellFormatChange } from "@idea10/core/commands";
import type { SelectionBorderState, SelectionCellStyleState } from "@idea10/core/style-state";
import { useAppI18n } from "../../../shared/i18n";
import CellFormatAlignmentPanel from "./CellFormatAlignmentPanel.vue";
import CellFormatBorderPanel from "./CellFormatBorderPanel.vue";
import CellFormatFillPanel from "./CellFormatFillPanel.vue";
import CellFormatFontPanel from "./CellFormatFontPanel.vue";
import CellFormatNumberPanel from "./CellFormatNumberPanel.vue";
import { rememberCustomNumberFormat } from "../number-format/custom-formats";
import type { CellFormatBorderCapabilities } from "../border-capabilities";

export type CellFormatTab = "number" | "alignment" | "font" | "border" | "fill";

const props = withDefaults(
  defineProps<{
    state: SelectionCellStyleState;
    borderState: SelectionBorderState;
    borderCapabilities?: CellFormatBorderCapabilities;
    sampleValue: string | number | boolean | null;
    dateSystem?: "1900" | "1904";
    initialTab?: CellFormatTab;
    /** Allows differential-style consumers to expose a subset of the workbook format tabs. */
    availableTabs?: readonly CellFormatTab[];
    initialStylePatch?: CellStylePatch;
    mergeState?: {
      canMerge: boolean;
      canUnmerge: boolean;
      merged: "on" | "off" | "mixed";
    };
  }>(),
  {
    initialTab: "border",
    availableTabs: () => ["number", "alignment", "font", "border", "fill"],
    initialStylePatch: () => ({}),
  },
);
const emit = defineEmits<{ confirm: [change: CellFormatChange]; cancel: [] }>();
const { t } = useAppI18n();
const activeTab = ref<CellFormatTab>(
  props.availableTabs.includes(props.initialTab) ? props.initialTab : props.availableTabs[0]!,
);
const tabsRef = ref<{ $el: HTMLElement }>();
const tabOrder = computed(() => props.availableTabs);
onMounted(() => {
  void nextTick(() =>
    tabsRef.value?.$el
      .querySelector<HTMLElement>(`[data-cell-format-tab="${activeTab.value}"]`)
      ?.focus(),
  );
});

function onTabKeydown(event: KeyboardEvent): void {
  const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (!direction && event.key !== "Home" && event.key !== "End") return;
  event.preventDefault();
  const index =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? tabOrder.value.length - 1
        : (tabOrder.value.indexOf(activeTab.value) + direction + tabOrder.value.length) %
          tabOrder.value.length;
  activeTab.value = tabOrder.value[index]!;
  tabsRef.value?.$el
    .querySelector<HTMLElement>(`[data-cell-format-tab="${activeTab.value}"]`)
    ?.focus();
}
function onDialogKeydown(event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const root = tabsRef.value?.$el.closest('[role="dialog"]');
  const controls = Array.from(
    root?.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), [tabindex]:not([tabindex="-1"])',
    ) ?? [],
  ).filter((element) => element.tabIndex >= 0 && element.getClientRects().length > 0);
  const first = controls[0];
  const last = controls.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

const stylePatch = ref<CellStylePatch>(
  JSON.parse(JSON.stringify(toRaw(props.initialStylePatch))) as CellStylePatch,
);
const numberFormatValid = ref(true);
const borderActions = ref<CellBorderAction[]>([]);
const borderFormat = ref<CellBorderFormatPatch | undefined>();
const merge = ref<boolean | undefined>();
const displayedMergeState = computed(() =>
  merge.value === undefined ? props.mergeState?.merged : merge.value ? "on" : "off",
);

function updateStyle(patch: CellStylePatch): void {
  stylePatch.value = { ...stylePatch.value, ...patch };
}
function updateBorderActions(actions: CellBorderAction[]): void {
  borderActions.value = actions;
}
function updateBorderFormat(format: CellBorderFormatPatch | undefined): void {
  borderFormat.value = format ? { ...borderFormat.value, ...format } : undefined;
}
function updateMerge(next: boolean): void {
  if (!props.mergeState) return;
  const initial = props.mergeState.merged;
  merge.value = initial !== "mixed" && next === (initial === "on") ? undefined : next;
}
function confirm(): void {
  if (!numberFormatValid.value) return;
  if (stylePatch.value.numberFormat && stylePatch.value.numberFormat.kind === "custom")
    rememberCustomNumberFormat(stylePatch.value.numberFormat.code);
  const change: CellFormatChange = {};
  if (Object.keys(stylePatch.value).length > 0) change.style = stylePatch.value;
  if (borderActions.value.length > 0) change.borders = borderActions.value;
  if (borderFormat.value) change.borderFormat = borderFormat.value;
  if (merge.value !== undefined) change.merge = merge.value;
  emit("confirm", change);
}
</script>

<template>
  <Dialog
    role="dialog"
    aria-modal="true"
    :aria-label="t('cellFormat.title')"
    :visible="true"
    @keydown="onDialogKeydown"
    :header="t('cellFormat.title')"
    :confirm-btn="{
      content: t('cellFormat.confirm'),
      disabled: !numberFormatValid,
    }"
    :cancel-btn="t('cellFormat.cancel')"
    :close-on-overlay-click="false"
    :destroy-on-close="true"
    :confirm-on-enter="false"
    width="min(640px, calc(100vw - 32px))"
    placement="center"
    class="cell-format-dialog"
    @confirm="confirm"
    @close="emit('cancel')"
  >
    <Tabs
      ref="tabsRef"
      v-model="activeTab"
      class="cell-format-dialog__tabs"
      :class="{
        'cell-format-dialog__tabs--number': activeTab === 'number',
        'cell-format-dialog__tabs--alignment': activeTab === 'alignment',
        'cell-format-dialog__tabs--font': activeTab === 'font',
        'cell-format-dialog__tabs--border': activeTab === 'border',
        'cell-format-dialog__tabs--fill': activeTab === 'fill',
      }"
    >
      <TabPanel v-if="availableTabs.includes('number')" value="number" :destroy-on-hide="false">
        <template #label
          ><button
            type="button"
            class="cell-format-dialog__tab"
            data-cell-format-tab="number"
            :aria-pressed="activeTab === 'number'"
            :tabindex="activeTab === 'number' ? 0 : -1"
            @keydown="onTabKeydown"
          >
            {{ t("cellFormat.number") }}
          </button></template
        ><CellFormatNumberPanel
          :state="state"
          :patch="stylePatch"
          :sample-value="sampleValue"
          :date-system="dateSystem"
          @update:patch="updateStyle"
          @validity-change="numberFormatValid = $event"
      /></TabPanel>
      <TabPanel v-if="availableTabs.includes('alignment')" value="alignment">
        <template #label
          ><button
            type="button"
            class="cell-format-dialog__tab"
            data-cell-format-tab="alignment"
            :aria-pressed="activeTab === 'alignment'"
            :tabindex="activeTab === 'alignment' ? 0 : -1"
            @keydown="onTabKeydown"
          >
            {{ t("cellFormat.alignment") }}
          </button></template
        ><CellFormatAlignmentPanel
          :state="state"
          :patch="stylePatch"
          :sample-value="sampleValue"
          :merge-state="displayedMergeState"
          :merge-enabled="mergeState?.canMerge || mergeState?.canUnmerge"
          @update:patch="updateStyle"
          @update:merge="updateMerge"
      /></TabPanel>
      <TabPanel v-if="availableTabs.includes('font')" value="font">
        <template #label
          ><button
            type="button"
            class="cell-format-dialog__tab"
            data-cell-format-tab="font"
            :aria-pressed="activeTab === 'font'"
            :tabindex="activeTab === 'font' ? 0 : -1"
            @keydown="onTabKeydown"
          >
            {{ t("cellFormat.font") }}
          </button></template
        ><CellFormatFontPanel
          :state="state"
          :patch="stylePatch"
          :sample-value="sampleValue"
          @update:patch="updateStyle"
      /></TabPanel>
      <TabPanel v-if="availableTabs.includes('border')" value="border">
        <template #label
          ><button
            type="button"
            class="cell-format-dialog__tab"
            data-cell-format-tab="border"
            :aria-pressed="activeTab === 'border'"
            :tabindex="activeTab === 'border' ? 0 : -1"
            @keydown="onTabKeydown"
          >
            {{ t("cellFormat.border") }}
          </button></template
        ><CellFormatBorderPanel
          :state="borderState"
          :capabilities="borderCapabilities"
          :actions="borderActions"
          :format="borderFormat"
          @update:actions="updateBorderActions"
          @update:format="updateBorderFormat"
      /></TabPanel>
      <TabPanel v-if="availableTabs.includes('fill')" value="fill">
        <template #label
          ><button
            type="button"
            class="cell-format-dialog__tab"
            data-cell-format-tab="fill"
            :aria-pressed="activeTab === 'fill'"
            :tabindex="activeTab === 'fill' ? 0 : -1"
            @keydown="onTabKeydown"
          >
            {{ t("cellFormat.fill") }}
          </button></template
        ><CellFormatFillPanel
          :state="state"
          :patch="stylePatch"
          :sample-value="sampleValue"
          @update:patch="updateStyle"
      /></TabPanel>
    </Tabs>
  </Dialog>
</template>

<style scoped lang="scss">
.cell-format-dialog__tab {
  font: inherit;
  color: inherit;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.cell-format-dialog__tabs {
  display: flex;
  flex-direction: column;
  height: min(380px, calc(100dvh - 240px));

  &--number {
    height: min(508px, calc(100dvh - 192px));
  }

  &--alignment,
  &--font,
  &--border,
  &--fill {
    height: auto;
    max-height: calc(100dvh - 192px);
  }
}
</style>
