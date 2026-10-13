<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { PaintBucket, Ruler, Sparkles, Type, X } from "lucide-vue-next";
import type { PictureFormatLengthUnit } from "../../../sheet-images/picture-format-pane-model";
import type { ShapeFormatMode, ShapeFormatTab } from "../../shape-format-pane-model";
import { useShapeFormatPane, type ShapeFormatPaneInput } from "./useShapeFormatPane";
import ShapeFormatFillLine from "./ShapeFormatFillLine.vue";
import ShapeFormatEffects from "./ShapeFormatEffects.vue";
import ShapeFormatSizeProperties from "./ShapeFormatSizeProperties.vue";
import ShapeFormatTextBox from "./ShapeFormatTextBox.vue";
const props = withDefaults(
  defineProps<
    ShapeFormatPaneInput & {
      initialMode?: ShapeFormatMode;
      initialTab?: ShapeFormatTab;
      initialUnit?: PictureFormatLengthUnit;
      beforeInteraction?: () => boolean;
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
const unit = ref<PictureFormatLengthUnit>(props.initialUnit);
const paneId = `shape-format-pane-${useId()}`;
const tabButtons = ref<HTMLButtonElement[]>([]);
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
  tab.value = tabs.value[next]!;
  await nextTick();
  tabButtons.value[next]?.focus();
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
      <TButton variant="text" shape="square" size="small" :aria-label="t('close')" @click="close"
        ><X :size="16"
      /></TButton>
    </header>
    <div
      class="shape-format-pane__modes"
      role="group"
      :aria-label="controller.s.value('paneTitle')"
    >
      <button type="button" :aria-pressed="mode === 'shape'" @click="mode = 'shape'">
        {{ controller.s.value("shapeOptions") }}
      </button>
      <button
        v-if="!isConnector"
        type="button"
        :aria-pressed="mode === 'text'"
        @click="mode = 'text'"
      >
        {{ controller.s.value("textOptions") }}
      </button>
    </div>
    <div
      class="shape-format-pane__tabs"
      role="tablist"
      :aria-label="
        mode === 'shape' ? controller.s.value('shapeOptions') : controller.s.value('textOptions')
      "
      @keydown="tabKeydown"
    >
      <button
        :id="`${paneId}-${tabs[0]}-tab`"
        :ref="
          (element) => {
            tabButtons[0] = element as HTMLButtonElement;
          }
        "
        type="button"
        role="tab"
        :aria-selected="tab === tabs[0]"
        :aria-controls="`${paneId}-${tabs[0]}-panel`"
        :tabindex="tab === tabs[0] ? 0 : -1"
        @click="tab = tabs[0]!"
      >
        <PaintBucket :size="16" aria-hidden="true" /><span>{{
          mode === "shape" ? t("fillLineTab") : controller.s.value("textFillOutline")
        }}</span>
      </button>
      <button
        :id="`${paneId}-${tabs[1]}-tab`"
        :ref="
          (element) => {
            tabButtons[1] = element as HTMLButtonElement;
          }
        "
        type="button"
        role="tab"
        :aria-selected="tab === tabs[1]"
        :aria-controls="`${paneId}-${tabs[1]}-panel`"
        :tabindex="tab === tabs[1] ? 0 : -1"
        @click="tab = tabs[1]!"
      >
        <Sparkles :size="16" aria-hidden="true" /><span>{{ t("effectsTab") }}</span>
      </button>
      <button
        :id="`${paneId}-${tabs[2]}-tab`"
        :ref="
          (element) => {
            tabButtons[2] = element as HTMLButtonElement;
          }
        "
        type="button"
        role="tab"
        :aria-selected="tab === tabs[2]"
        :aria-controls="`${paneId}-${tabs[2]}-panel`"
        :tabindex="tab === tabs[2] ? 0 : -1"
        @click="tab = tabs[2]!"
      >
        <Ruler v-if="mode === 'shape'" :size="16" aria-hidden="true" /><Type
          v-else
          :size="16"
          aria-hidden="true"
        /><span>{{
          mode === "shape" ? t("sizePropertiesTab") : controller.s.value("textBox")
        }}</span>
      </button>
    </div>
    <div v-if="snapshot" class="shape-format-pane__units">
      <span>{{ t("units") }}</span
      ><TSelect
        :model-value="unit"
        :options="unitOptions"
        :disabled="controller.hasActiveNumericDraft.value"
        size="small"
        :aria-label="t('units')"
        data-shape-format-units
        @change="changeUnit"
      />
    </div>
    <div class="shape-format-pane__body">
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
        <p class="shape-format-pane__hint">{{ controller.s.value("capabilityNote") }}</p>
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
          <ShapeFormatTextBox :controller="controller" :unit="unit" />
        </div>
      </template>
    </div>
  </aside>
</template>
<style scoped lang="scss">
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
  font-size: 12px;
  line-height: 20px;
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
      font-size: 14px;
      line-height: 22px;
      font-weight: 600;
    }
    span {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: var(--sheetcraft-text-secondary);
    }
  }
  &__modes {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 2px;
    padding: 3px;
    margin: 0 12px 6px;
    border-radius: var(--sheetcraft-radius-small);
    background: var(--sheetcraft-surface-hover);
    button {
      min-width: 0;
      border: 0;
      border-radius: var(--sheetcraft-radius-small);
      padding: 5px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
    }
    button[aria-pressed="true"] {
      background: var(--sheetcraft-surface-panel);
      font-weight: 600;
    }
  }
  &__tabs {
    display: grid;
    grid-template-columns: 1.2fr 0.8fr 1.4fr;
    gap: 2px;
    margin: 0 8px;
    border-bottom: 1px solid var(--sheetcraft-border-subtle);
    button {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-width: 0;
      gap: 2px;
      border: 0;
      border-bottom: 2px solid transparent;
      padding: 8px 2px 6px;
      background: transparent;
      color: inherit;
      font: inherit;
      cursor: pointer;
      border-radius: var(--sheetcraft-radius-small) var(--sheetcraft-radius-small) 0 0;
    }
    button:hover {
      background: var(--sheetcraft-surface-hover);
    }
    button[aria-selected="true"] {
      border-bottom-color: var(--sheetcraft-text-primary);
      font-weight: 500;
    }
    span {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
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
    font-size: 12px;
    line-height: 18px;
    overflow-wrap: anywhere;
  }
  &__scope {
    margin: 8px 0;
    color: var(--sheetcraft-text-secondary);
    font-size: 12px;
    line-height: 18px;
    strong {
      color: var(--sheetcraft-text-primary);
      font-weight: 500;
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
