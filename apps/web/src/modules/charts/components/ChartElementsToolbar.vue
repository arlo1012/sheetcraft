<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from "vue";
import { ChartColumn, Database, ListPlus, Rows3, SlidersHorizontal } from "lucide-vue-next";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import type { SheetChart } from "@sheetcraft/core/sheet-charts";
import { useAppI18n } from "../../../shared/i18n";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import ChartElementsControls from "./ChartElementsControls.vue";
import type { ChartElementPatch } from "../chart-element-controls";
import { chartFormatTargetKey, type ChartFormatTarget } from "../chart-format-pane";

const props = defineProps<{
  chart: SheetChart;
  disabled: boolean;
  apply: (patch: ChartElementPatch) => boolean;
  applyAndRun?: (
    patch: ChartElementPatch,
    action: "edit" | "source" | "switchDirection",
  ) => boolean;
  onEdit?: () => void;
  onSource?: () => void;
  onSwitchDirection?: () => void;
  onFormat?: (target?: ChartFormatTarget) => void;
  applyAndFormat?: (patch: ChartElementPatch, target: ChartFormatTarget) => boolean;
  formatTarget?: ChartFormatTarget;
  formatTargets?: readonly { target: ChartFormatTarget; label: string }[];
}>();
const { t } = useAppI18n();
const toolbarRef = ref<InstanceType<typeof RibbonToolbar>>();
const trigger = ref<InstanceType<typeof RibbonMenuButton>>();
const controlsRef = ref<InstanceType<typeof ChartElementsControls>>();
const menuSurfaceRef = ref<InstanceType<typeof MenuSurface> | null>(null);
const menuId = `chart-elements-${useId()}`;
const failed = ref(false);
let lastRejectedTitle: string | undefined;
let shouldRestoreFocus = true;
type ElementSession = {
  apply: (patch: ChartElementPatch) => boolean;
  commit: (patch: ChartElementPatch) => void;
};
const session = shallowRef<ElementSession>();
const { open, floatingStyles, dismiss, toggleMenu, onTriggerKeydown } = useMenu({
  triggerRef: computed(() => trigger.value?.rootElement ?? null),
  menuSurfaceRef,
  disabled: computed(() => props.disabled),
  defaultFocus: "menu",
  additionalInside: () => [toolbarRef.value?.$el, ...(controlsRef.value?.popupElements() ?? [])],
  onOpen() {
    failed.value = false;
    lastRejectedTitle = undefined;
    const apply = props.apply;
    const current: ElementSession = {
      apply,
      commit(patch) {
        // A delayed blur or popup event must never use a newly selected chart's callback.
        if (!open.value || session.value !== current || props.disabled || props.apply !== apply) {
          return;
        }
        let applied = false;
        try {
          applied = apply(patch);
        } catch {
          // The host can reject a now-invalid owner or a protected/deleted target.
        }
        failed.value = !applied;
        lastRejectedTitle = applied ? undefined : patch.title;
        if (applied) dismiss("programmatic", shouldRestoreFocus);
      },
    };
    session.value = current;
  },
  onDismiss() {
    session.value = undefined;
  },
});
watch(
  () => props.apply,
  () => {
    if (open.value) dismiss("programmatic", false);
  },
  { flush: "sync" },
);
function containsTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  const toolbar = toolbarRef.value?.$el;
  return (
    (toolbar instanceof HTMLElement && toolbar.contains(target)) ||
    !!menuSurfaceRef.value?.rootElement?.contains(target) ||
    (controlsRef.value?.popupElements() ?? []).some((popup) => popup.contains(target))
  );
}
function flushPendingTitle(restoreFocus = true): boolean {
  const current = session.value;
  if (!open.value || !current) return true;
  if (props.disabled || props.apply !== current.apply) return false;
  const controls = controlsRef.value;
  if (controls?.isComposing()) {
    controls.blockComposition();
    return false;
  }
  const title = controls?.pendingTitle();
  if (title === undefined) return true;
  if (title === lastRejectedTitle) return false;
  const previous = shouldRestoreFocus;
  shouldRestoreFocus = restoreFocus;
  try {
    return !!controls?.commitTitle() && !failed.value;
  } finally {
    shouldRestoreFocus = previous;
  }
}
function onOutsidePointerCapture(event: PointerEvent): void {
  if (!open.value || containsTarget(event.target)) return;
  if (!flushPendingTitle(false)) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}
function onOutsideFocusCapture(event: FocusEvent): void {
  if (!open.value || containsTarget(event.target)) return;
  if (!flushPendingTitle(false)) {
    event.preventDefault();
    event.stopImmediatePropagation();
    void nextTick(() => controlsRef.value?.focusTitle());
  }
}
function toggleElementsMenu(event?: MouseEvent): void {
  if (open.value) {
    if (!flushPendingTitle() || !open.value) return;
  }
  toggleMenu(event);
}
const ownerCallbacks = computed(() => {
  const apply = props.apply;
  const applyAndRun = props.applyAndRun;
  const edit = props.onEdit;
  const source = props.onSource;
  const switchDirection = props.onSwitchDirection;
  const format = props.onFormat;
  const applyAndFormat = props.applyAndFormat;
  function run(
    action: "edit" | "source" | "switchDirection",
    callback: (() => void) | undefined,
  ): void {
    if (props.disabled || props.apply !== apply || props.applyAndRun !== applyAndRun || !callback)
      return;
    if (
      (action === "edit" && props.onEdit !== edit) ||
      (action === "source" && props.onSource !== source) ||
      (action === "switchDirection" && props.onSwitchDirection !== switchDirection)
    )
      return;
    const controls = controlsRef.value;
    if (controls?.blockComposition()) return;
    const title = controls?.pendingTitle();
    if (title === undefined) {
      callback();
      return;
    }
    let applied = false;
    try {
      applied = applyAndRun?.({ title }, action) ?? false;
    } catch {
      // The same owner lease must approve both the title and subsequent action.
    }
    failed.value = !applied;
    lastRejectedTitle = applied ? undefined : title;
    if (applied) dismiss("programmatic", false);
  }
  return {
    edit: () => run("edit", edit),
    source: () => run("source", source),
    switchDirection: () => run("switchDirection", switchDirection),
    format: (target: ChartFormatTarget = props.formatTarget ?? { kind: "chart" }) => {
      if (
        props.disabled ||
        props.apply !== apply ||
        props.onFormat !== format ||
        props.applyAndFormat !== applyAndFormat ||
        !format
      )
        return;
      const controls = controlsRef.value;
      if (controls?.blockComposition()) return;
      const title = controls?.pendingTitle();
      if (title === undefined) {
        format(target);
        return;
      }
      let applied = false;
      try {
        applied = applyAndFormat?.({ title }, target) ?? false;
      } catch {
        /* owner rejects */
      }
      failed.value = !applied;
      lastRejectedTitle = applied ? undefined : title;
      if (applied) dismiss("programmatic", false);
    },
  };
});
const formatOptions = computed(() =>
  (props.formatTargets ?? []).map((entry) => ({
    value: chartFormatTargetKey(entry.target),
    label: entry.label,
  })),
);
const selectFormat = computed(() => {
  const choices = props.formatTargets,
    apply = props.apply,
    callback = props.onFormat,
    owner = ownerCallbacks.value;
  return (value: unknown) => {
    if (props.formatTargets !== choices || props.apply !== apply || props.onFormat !== callback)
      return;
    const entry = choices?.find((candidate) => chartFormatTargetKey(candidate.target) === value);
    if (entry) owner.format(entry.target);
  };
});
watch(
  open,
  (visible) => {
    if (visible) {
      document.addEventListener("pointerdown", onOutsidePointerCapture, true);
      document.addEventListener("focusin", onOutsideFocusCapture, true);
    } else {
      document.removeEventListener("pointerdown", onOutsidePointerCapture, true);
      document.removeEventListener("focusin", onOutsideFocusCapture, true);
    }
  },
  { flush: "sync" },
);
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onOutsidePointerCapture, true);
  document.removeEventListener("focusin", onOutsideFocusCapture, true);
});
</script>

<template>
  <RibbonToolbar ref="toolbarRef" :label="t('chart.contextTools')" data-chart-tools-toolbar>
    <section v-if="onFormat" class="chart-elements-toolbar__group" data-ribbon-group="chart-format">
      <TSelect
        :aria-label="t('chart.formatElement')"
        :value="formatTarget ? chartFormatTargetKey(formatTarget) : 'chart'"
        :options="formatOptions"
        :disabled="disabled"
        :popup-props="{ overlayClassName: 'chart-format-options-popup' }"
        style="width: 190px"
        :onChange="selectFormat"
      />
      <RibbonButton
        variant="tall"
        :label="t('chart.formatSelection')"
        :text="t('chart.formatSelection')"
        :disabled="disabled"
        @activate="ownerCallbacks.format()"
        ><SlidersHorizontal
      /></RibbonButton>
    </section>
    <section class="chart-elements-toolbar__group" data-ribbon-group="chart-elements">
      <div class="chart-elements-toolbar__menu">
        <RibbonMenuButton
          ref="trigger"
          variant="tall"
          :label="t('chart.addElement')"
          :text="t('chart.addElement')"
          :disabled="disabled"
          :expanded="open"
          :menu-id="menuId"
          popup-role="menu"
          @activate="toggleElementsMenu"
          @keydown="onTriggerKeydown"
          ><ListPlus
        /></RibbonMenuButton>
        <Teleport to="body">
          <MenuSurface
            v-if="open && session"
            :id="menuId"
            ref="menuSurfaceRef"
            :style="floatingStyles"
            :label="t('chart.elements')"
          >
            <template #body>
              <div class="chart-elements-toolbar__content">
                <ChartElementsControls
                  ref="controlsRef"
                  :chart="chart"
                  :disabled="disabled"
                  @patch="session.commit"
                />
                <p v-if="failed" class="chart-elements-toolbar__error" role="alert">
                  {{ t("chart.elementApplyFailed") }}
                </p>
              </div>
            </template>
          </MenuSurface>
        </Teleport>
      </div>
    </section>
    <section
      v-if="onEdit || onSource || onSwitchDirection"
      class="chart-elements-toolbar__group"
      data-ribbon-group="chart-data"
    >
      <RibbonButton
        v-if="onEdit"
        variant="tall"
        :label="t('chart.changeType')"
        :text="t('chart.changeType')"
        :disabled="disabled"
        @activate="ownerCallbacks.edit"
        ><ChartColumn
      /></RibbonButton>
      <RibbonButton
        v-if="onSwitchDirection"
        variant="tall"
        :label="t('chart.switchDirection')"
        :text="t('chart.switchDirection')"
        :disabled="disabled"
        @activate="ownerCallbacks.switchDirection"
        ><Rows3
      /></RibbonButton>
      <RibbonButton
        v-if="onSource"
        variant="tall"
        :label="t('chart.selectData')"
        :text="t('chart.selectData')"
        :disabled="disabled"
        @activate="ownerCallbacks.source"
        ><Database
      /></RibbonButton>
    </section>
    <p v-if="failed && !open" class="chart-elements-toolbar__error" role="alert">
      {{ t("chart.elementApplyFailed") }}
    </p>
  </RibbonToolbar>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
.chart-elements-toolbar {
  &__group {
    @include ribbon.columns;
  }

  &__menu {
    display: flex;
    align-items: stretch;
  }

  &__content {
    width: min(360px, calc(100vw - 32px));
    padding-inline: var(--sheetcraft-tool-panel-padding);
  }

  &__error {
    align-self: center;
    margin: 8px 0 0;
    color: var(--sheetcraft-color-error);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
</style>
