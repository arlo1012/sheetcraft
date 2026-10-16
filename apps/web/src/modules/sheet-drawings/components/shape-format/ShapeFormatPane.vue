<script setup lang="ts">
import { computed, nextTick, ref, useId, watch, type ComponentPublicInstance } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { RadioGroup as TRadioGroup, RadioButton as TRadioButton } from "tdesign-vue-next/es/radio";
import { Tabs as TTabs, TabPanel as TTabPanel } from "tdesign-vue-next/es/tabs";
import { PaintBucket, Ruler, Sparkles, Type, X } from "lucide-vue-next";
import type { PictureFormatLengthUnit } from "../../../sheet-images/picture-format-pane-model";
import type { ShapeFormatMode, ShapeFormatTab } from "../../shape-format-pane-model";
import { useShapeFormatPane, type ShapeFormatPaneInput } from "./useShapeFormatPane";
import {
  provideNativePopupScope,
  useNativePopupOwnership,
} from "../../../../shared/floating/useNativePopupOwnership";
import { useShapeTextFieldDraft } from "../../shape-text-field-drafts";
import ShapeFormatFillLine from "./ShapeFormatFillLine.vue";
import ShapeFormatEffects from "./ShapeFormatEffects.vue";
import ShapeFormatSizeProperties from "./ShapeFormatSizeProperties.vue";
import type { ShapeFormatPresentation } from "../../useShapeFormatPresentation";
import ShapeFormatTextBox from "./ShapeFormatTextBox.vue";
const props = withDefaults(
  defineProps<
    ShapeFormatPaneInput & {
      presentationState?: ShapeFormatPresentation;
      initialMode?: ShapeFormatMode;
      initialTab?: ShapeFormatTab;
      initialUnit?: PictureFormatLengthUnit;
      beforeInteraction?: () => boolean;
      beforeTabChange?: (tab: ShapeFormatTab) => boolean;
    }
  >(),
  { initialMode: "shape", initialTab: "size-properties", initialUnit: "pt", locale: "en-US" },
);
const emit = defineEmits<{ close: []; cancel: [] }>();
const controller = useShapeFormatPane(props);
const mode = ref<ShapeFormatMode>(
  props.initialTab.startsWith("text-") ? "text" : props.initialMode,
);
const isConnector = computed(
  () => props.snapshot?.drawing.kind === "shape" && !!props.snapshot.drawing.shapeConnector,
);
watch(
  isConnector,
  (value) => {
    if (value) mode.value = "shape";
  },
  { immediate: true },
);
const shapeTab = ref<ShapeFormatTab>(
  props.initialTab.startsWith("text-") ? "size-properties" : props.initialTab,
);
const textTab = ref<ShapeFormatTab>(
  props.initialTab.startsWith("text-") ? props.initialTab : "text-box",
);
const tab = computed({
  get: () => (mode.value === "shape" ? shapeTab.value : textTab.value),
  set: (value) => {
    if (mode.value === "shape") shapeTab.value = value;
    else textTab.value = value;
  },
});
const popups = provideNativePopupScope({
  owner: () =>
    props.snapshot ? `${controller.ownerKey.value}:${mode.value}:${tab.value}` : undefined,
});
useShapeTextFieldDraft({
  owner: () => (props.snapshot ? `shape-pane:${props.snapshot.owner.sessionId}` : undefined),
  flush: () => true,
  focus: () => {},
  containsTarget: popups.containsTarget,
});
const unit = ref<PictureFormatLengthUnit>(props.initialUnit);
const paneRoot = ref<HTMLElement>();
const paneBody = ref<HTMLElement>();
let restoredPresentation: ShapeFormatPresentation | undefined;
watch(
  () => [props.presentationState, paneBody.value] as const,
  async ([state, body]) => {
    restoredPresentation = undefined;
    await nextTick();
    if (!body || body !== paneBody.value || state !== props.presentationState) return;
    body.scrollTop = state?.scrollTop ?? 0;
    restoredPresentation = state;
  },
  { immediate: true, flush: "post" },
);
function rememberScroll() {
  const state = props.presentationState;
  if (state && state === restoredPresentation && paneBody.value)
    state.scrollTop = paneBody.value.scrollTop;
}

const unitsPopup = useNativePopupOwnership({
  owner: () => (props.snapshot ? `${controller.ownerKey.value}:units` : undefined),
  disabled: () => !props.snapshot || controller.hasActiveNumericDraft.value,
  root: () => paneRoot.value,
  scope: popups,
});
function setUnitsPopupHost(element: Element | ComponentPublicInstance | null): void {
  unitsPopup.host.value = element instanceof HTMLElement ? element : undefined;
}
const changeUnitAction = computed(() => {
  const owner = controller.ownerKey.value;
  return (value: unknown) => owner === controller.ownerKey.value && changeUnit(value);
});
const paneId = `shape-format-pane-${useId()}`;
const shapeFillRef = ref<InstanceType<typeof ShapeFormatFillLine>>(),
  textFillRef = ref<InstanceType<typeof ShapeFormatFillLine>>();
const tabs = computed<readonly ShapeFormatTab[]>(() =>
  mode.value === "shape"
    ? ["fill-line", "effects", "size-properties"]
    : ["text-fill-line", "text-effects", "text-box"],
);
const unitOptions = computed(() => [
  { value: "pt", label: props.t("unitPt") },
  { value: "in", label: props.t("unitIn") },
  { value: "cm", label: props.t("unitCm") },
]);
function changeUnit(value: unknown) {
  if (
    !controller.hasActiveNumericDraft.value &&
    value !== unit.value &&
    (value === "pt" || value === "in" || value === "cm")
  ) {
    controller.cancel();
    unit.value = value;
  }
}
function selectTab(value: ShapeFormatTab): boolean {
  try {
    if (props.beforeTabChange?.(value) === false) return false;
  } catch {
    return false;
  }
  mode.value = value.startsWith("text-") ? "text" : "shape";
  tab.value = value;
  return true;
}
function selectMode(value: unknown, context: { e: Event }) {
  if (
    (value === "shape" || value === "text") &&
    !selectTab(value === "shape" ? shapeTab.value : textTab.value)
  )
    context.e.preventDefault();
}
function changeTab(value: unknown) {
  if (typeof value === "string" && tabs.value.includes(value as ShapeFormatTab))
    selectTab(value as ShapeFormatTab);
}
function close() {
  controller.cancel();
  emit("cancel");
  emit("close");
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape" && !event.defaultPrevented) {
    event.preventDefault();
    close();
  }
}
async function tabKeydown(event: KeyboardEvent) {
  if (
    event.isComposing ||
    event.keyCode === 229 ||
    !(event.target instanceof Element) ||
    !event.target.closest('[role="tab"]')
  )
    return;
  const root = event.currentTarget as HTMLElement;
  const index = tabs.value.indexOf(tab.value);
  const next =
    event.key === "ArrowRight"
      ? (index + 1) % 3
      : event.key === "ArrowLeft"
        ? (index + 2) % 3
        : event.key === "Home"
          ? 0
          : event.key === "End"
            ? 2
            : undefined;
  if (next === undefined) return;
  event.preventDefault();
  if (!selectTab(tabs.value[next]!)) return;
  await nextTick();
  root.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus();
}
let blockedInteraction = false;
function beforeInteraction(event: Event) {
  if (
    !(event.target instanceof Element) ||
    !event.target.closest(".shape-format-pane__body") ||
    !event.target.closest("input,textarea,button,[role=combobox],[role=checkbox]")
  )
    return;
  let allowed = false;
  try {
    allowed = props.beforeInteraction?.() !== false;
  } catch {
    /* Host gate retains its unresolved edit. */
  }
  blockedInteraction = !allowed;
  if (!allowed) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "focusin" && event.target instanceof HTMLElement) event.target.blur();
  }
}
function guardClick(event: MouseEvent) {
  if (!blockedInteraction) return;
  blockedInteraction = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}
defineExpose({
  cancel: controller.cancel,
  showPaint: (target: ShapeFormatMode, category: "fill" | "line") => {
    if (isConnector.value && target === "text") return;
    mode.value = target;
    tab.value = target === "shape" ? "fill-line" : "text-fill-line";
    (target === "shape" ? shapeFillRef.value : textFillRef.value)?.showCategory(category);
  },
});
</script>
<template>
  <aside
    ref="paneRoot"
    data-shape-format-pane
    class="shape-format-pane"
    :aria-label="controller.s.value(controller.isGroup.value ? 'groupPaneTitle' : 'paneTitle')"
    @keydown="keydown"
    @pointerdown.capture="beforeInteraction"
    @focusin.capture="beforeInteraction"
    @click.capture="guardClick"
  >
    <header class="shape-format-pane__header">
      <div class="shape-format-pane__heading">
        <strong>{{
          controller.s.value(controller.isGroup.value ? "groupPaneTitle" : "paneTitle")
        }}</strong
        ><span v-if="snapshot?.drawing.name" :title="snapshot.drawing.name">{{
          snapshot.drawing.name
        }}</span>
      </div>
      <TButton variant="text" shape="square" size="small" :aria-label="t('close')" @click="close">
        <template #icon><X class="sheetcraft-action-icon" aria-hidden="true" /></template>
      </TButton>
    </header>
    <TRadioGroup
      class="shape-format-pane__modes"
      :value="mode"
      variant="default-filled"
      :aria-label="controller.s.value('paneTitle')"
      @change="selectMode"
    >
      <TRadioButton value="shape">{{ controller.s.value("shapeOptions") }}</TRadioButton>
      <TRadioButton v-if="!isConnector" value="text">{{
        controller.s.value("textOptions")
      }}</TRadioButton>
    </TRadioGroup>
    <div
      class="shape-format-pane__tabs"
      role="tablist"
      :aria-label="
        mode === 'shape' ? controller.s.value('shapeOptions') : controller.s.value('textOptions')
      "
      @keydown="tabKeydown"
    >
      <TTabs class="sheetcraft-tabs--compact" :value="tab" @change="changeTab">
        <TTabPanel :value="tabs[0]" :destroy-on-hide="false">
          <template #label>
            <button
              :id="`${paneId}-${tabs[0]}-tab`"
              type="button"
              class="shape-format-pane__tab-label"
              role="tab"
              :aria-selected="tab === tabs[0]"
              :aria-controls="`${paneId}-${tabs[0]}-panel`"
              :tabindex="tab === tabs[0] ? 0 : -1"
            >
              <PaintBucket class="sheetcraft-action-icon" aria-hidden="true" />
              {{ mode === "shape" ? t("fillLineTab") : controller.s.value("textFillOutline") }}
            </button>
          </template>
        </TTabPanel>
        <TTabPanel :value="tabs[1]" :destroy-on-hide="false">
          <template #label>
            <button
              :id="`${paneId}-${tabs[1]}-tab`"
              type="button"
              class="shape-format-pane__tab-label"
              role="tab"
              :aria-selected="tab === tabs[1]"
              :aria-controls="`${paneId}-${tabs[1]}-panel`"
              :tabindex="tab === tabs[1] ? 0 : -1"
            >
              <Sparkles class="sheetcraft-action-icon" aria-hidden="true" />
              {{ t("effectsTab") }}
            </button>
          </template>
        </TTabPanel>
        <TTabPanel :value="tabs[2]" :destroy-on-hide="false">
          <template #label>
            <button
              :id="`${paneId}-${tabs[2]}-tab`"
              type="button"
              class="shape-format-pane__tab-label"
              role="tab"
              :aria-selected="tab === tabs[2]"
              :aria-controls="`${paneId}-${tabs[2]}-panel`"
              :tabindex="tab === tabs[2] ? 0 : -1"
            >
              <Ruler v-if="mode === 'shape'" class="sheetcraft-action-icon" aria-hidden="true" />
              <Type v-else class="sheetcraft-action-icon" aria-hidden="true" />
              {{ mode === "shape" ? t("sizePropertiesTab") : controller.s.value("textBox") }}
            </button>
          </template>
        </TTabPanel>
      </TTabs>
    </div>
    <Teleport to="body"><div :ref="setUnitsPopupHost" data-shape-format-units-popup /></Teleport>
    <div v-if="snapshot" class="shape-format-pane__units">
      <span>{{ t("units") }}</span
      ><TSelect
        :model-value="unit"
        :popup-visible="unitsPopup.visible.value"
        :popup-props="unitsPopup.popupProps"
        @popup-visible-change="unitsPopup.onVisibleChange.value"
        :options="unitOptions"
        :disabled="controller.hasActiveNumericDraft.value"
        size="small"
        :aria-label="t('units')"
        data-shape-format-units
        @change="changeUnitAction"
      />
    </div>
    <div ref="paneBody" class="shape-format-pane__body" @scroll="rememberScroll">
      <p v-if="!snapshot" class="shape-format-pane__hint">
        {{ controller.s.value("missingSelection") }}
      </p>
      <template v-else>
        <div
          v-if="controller.isGroup.value"
          class="shape-format-pane__scope"
          data-shape-format-group-scope
        >
          <strong>{{ controller.s.value("groupScope") }}</strong>
          <p>
            {{
              controller.s.value(
                tab === "size-properties"
                  ? "groupSizeScopeHelp"
                  : mode === "text"
                    ? "groupTextScopeHelp"
                    : "groupShapeScopeHelp",
              )
            }}
          </p>
          <p v-if="snapshot.scopeDescription">{{ snapshot.scopeDescription }}</p>
        </div>
        <p
          v-if="!controller.isGroup.value && snapshot.scopeDescription"
          class="shape-format-pane__hint"
        >
          {{ snapshot.scopeDescription }}
        </p>
        <p v-if="controller.error.value" class="shape-format-pane__error" role="alert">
          {{ controller.error.value }}
        </p>
        <div
          :id="`${paneId}-fill-line-panel`"
          v-show="tab === 'fill-line' && mode === 'shape'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-fill-line-tab`"
        >
          <ShapeFormatFillLine ref="shapeFillRef" :controller="controller" />
        </div>
        <div
          :id="`${paneId}-effects-panel`"
          v-show="tab === 'effects' && mode === 'shape'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-effects-tab`"
        >
          <ShapeFormatEffects :controller="controller" />
        </div>
        <div
          :id="`${paneId}-size-properties-panel`"
          v-show="tab === 'size-properties' && mode === 'shape'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-size-properties-tab`"
        >
          <ShapeFormatSizeProperties :controller="controller" :unit="unit" />
        </div>
        <div
          v-if="!isConnector"
          :id="`${paneId}-text-fill-line-panel`"
          v-show="tab === 'text-fill-line' && mode === 'text'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-text-fill-line-tab`"
        >
          <ShapeFormatFillLine ref="textFillRef" :controller="controller" target="text" />
        </div>
        <div
          v-if="!isConnector"
          :id="`${paneId}-text-effects-panel`"
          v-show="tab === 'text-effects' && mode === 'text'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-text-effects-tab`"
        >
          <ShapeFormatEffects :controller="controller" target="text" />
        </div>
        <div
          v-if="!isConnector"
          :id="`${paneId}-text-box-panel`"
          v-show="tab === 'text-box' && mode === 'text'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-text-box-tab`"
        >
          <ShapeFormatTextBox
            :controller="controller"
            :unit="unit"
            :presentation-state="presentationState"
          />
        </div>
      </template>
    </div>
  </aside>
</template>
<style scoped lang="scss">
@use "../../../../shared/tabs/tab-label";

.shape-format-pane {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  flex: 0 0 clamp(320px, 26vw, 380px);
  width: clamp(320px, 26vw, 380px);
  max-width: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-left: 1px solid var(--sheetcraft-border-subtle);
  background: var(--sheetcraft-surface-panel);
  color: var(--sheetcraft-text-primary);
  font-family: var(--sheetcraft-font-sans);
  font-size: var(--sheetcraft-font-size-body-medium);
  line-height: var(--sheetcraft-line-height-body-medium);
  &__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 12px 12px 8px;
  }
  &__heading {
    min-width: 0;
    display: grid;
    strong {
      font-size: var(--sheetcraft-font-size-title-small);
      line-height: var(--sheetcraft-line-height-title-small);
      font-weight: var(--sheetcraft-font-weight-semibold);
    }
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--sheetcraft-text-secondary);
    }
  }
  &__modes {
    margin: 0 12px 6px;
  }
  &__tabs {
    margin: 0 8px;
  }
  &__tab-label {
    @include tab-label.label($with-icon: true);
  }
  &__units {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px 12px 4px;
    > span {
      color: var(--sheetcraft-text-secondary);
    }
    > :last-child {
      width: 72px;
    }
  }
  &__body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    overscroll-behavior: contain;
    padding: 0 12px 12px;
  }
  &__hint,
  &__error {
    color: var(--sheetcraft-text-secondary);
    margin: 8px 0;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    overflow-wrap: anywhere;
  }
  &__scope {
    margin: 8px 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    strong {
      color: var(--sheetcraft-text-primary);
      font-weight: var(--sheetcraft-font-weight-medium);
    }
    p {
      margin: 3px 0 0;
    }
  }
  &__error {
    color: var(--sheetcraft-text-primary);
  }
}
@media (max-width: 600px) {
  .shape-format-pane {
    flex-basis: min(320px, 100%);
    width: min(320px, 100%);
  }
}
</style>
