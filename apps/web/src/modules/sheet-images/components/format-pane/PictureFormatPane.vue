<script setup lang="ts">
import type { PictureTextureId } from "../../picture-texture";
import { computed, nextTick, provide, ref, useId } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Tabs as TTabs, TabPanel as TTabPanel } from "tdesign-vue-next/es/tabs";
import { X } from "lucide-vue-next";
import {
  type PictureFormatCapabilities,
  type PictureFormatIntentHandler,
  type PictureFormatLengthUnit,
  type PictureFormatOptions,
  type PictureFormatSnapshot,
  type PictureFormatTab,
  type PictureFormatTranslate,
} from "../../picture-format-pane-model";
import type { PictureIntrinsicSizeStatus } from "../../usePictureIntrinsicSize";
import { usePictureFormatPane } from "./usePictureFormatPane";
import { pictureFormatCommonReasons } from "./picture-format-feedback";
import PictureFormatFillLine from "./PictureFormatFillLine.vue";
import PictureFormatEffects from "./PictureFormatEffects.vue";
import PictureFormatSizeProperties from "./PictureFormatSizeProperties.vue";
import PictureFormatPicture from "./PictureFormatPicture.vue";

const props = withDefaults(
  defineProps<{
    snapshot: PictureFormatSnapshot | null;
    capabilities: PictureFormatCapabilities;
    onIntent: PictureFormatIntentHandler;
    beforeInteraction?: () => boolean;
    t: PictureFormatTranslate;
    options?: PictureFormatOptions;
    loadPaintAsset?: (blob: Blob, texture?: PictureTextureId) => Promise<string | undefined>;
    initialTab?: PictureFormatTab;
    initialPaint?: "fill" | "line";
    initialUnit?: PictureFormatLengthUnit;
    intrinsicStatus?: PictureIntrinsicSizeStatus;
    retryIntrinsic?: () => void;
  }>(),
  { initialTab: "size-properties", initialUnit: "pt" },
);
const commonReasons = computed<ReadonlySet<string>>(() => {
  const counts = new Map<string, number>();
  const capabilities = [
    ...Object.values(props.capabilities.fields),
    ...Object.values(props.capabilities.detailed ?? {}),
    ...Object.values(props.capabilities.resets ?? {}),
    props.capabilities.cropShape,
  ];
  for (const capability of capabilities) {
    const reason = capability?.enabled === false ? capability.reason : undefined;
    if (reason) counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  return new Set([...counts].filter(([, count]) => count > 1).map(([reason]) => reason));
});
provide(pictureFormatCommonReasons, commonReasons);
const emit = defineEmits<{ close: []; cancel: [] }>();
const controller = usePictureFormatPane(props);
const tab = ref<PictureFormatTab>(props.initialPaint ? "fill-line" : props.initialTab);
const fillLineRef = ref<InstanceType<typeof PictureFormatFillLine> | null>(null);
const unit = ref<PictureFormatLengthUnit>(props.initialUnit);
const paneId = `picture-format-pane-${useId()}`;
const tabs = ["fill-line", "effects", "size-properties", "picture"] as const;

const unitOptions = computed(() => [
  { value: "in", label: props.t("unitIn") },
  { value: "cm", label: props.t("unitCm") },
  { value: "pt", label: props.t("unitPt") },
]);
function changeUnit(value: unknown) {
  // Prevent a typed number being reinterpreted in a different unit before it is resolved.
  if (
    controller.hasActiveNumericDraft.value ||
    (value !== "in" && value !== "cm" && value !== "pt")
  )
    return;
  unit.value = value;
}
function close() {
  controller.cancel();
  emit("cancel");
  emit("close");
}
let blockedInteraction = false;
function beforeInteraction(event: Event): void {
  if (
    event.target instanceof Element &&
    event.target.closest(
      ".picture-format-pane__header, .picture-format-pane__tabs, .picture-format-pane__units",
    )
  )
    return;
  if (
    !(event.target instanceof Element) ||
    !event.target.closest(
      "input, textarea, button, [role=combobox], [role=checkbox], [role=switch]",
    )
  )
    return;
  let accepted = false;
  try {
    accepted = props.beforeInteraction?.() !== false;
  } catch {
    /* Keep the unresolved crop owner intact. */
  }
  blockedInteraction = !accepted;
  if (!accepted) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "focusin" && event.target instanceof HTMLElement) event.target.blur();
  }
}
function guardClick(event: MouseEvent): void {
  if (!blockedInteraction) return;
  blockedInteraction = false;
  event.preventDefault();
  event.stopImmediatePropagation();
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}
async function tabKeydown(event: KeyboardEvent) {
  if (event.isComposing || event.keyCode === 229) return;
  const tablist = event.currentTarget;
  if (
    !(tablist instanceof HTMLElement) ||
    !(event.target instanceof Element) ||
    !event.target.closest("[role=tab]")
  )
    return;
  const index = tabs.indexOf(tab.value);
  let next: number;
  if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
  else if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = tabs.length - 1;
  else return;
  event.preventDefault();
  tab.value = tabs[next]!;
  await nextTick();
  tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
}
function changeTab(value: string | number): void {
  if (
    value === "fill-line" ||
    value === "effects" ||
    value === "size-properties" ||
    value === "picture"
  )
    tab.value = value;
}
defineExpose({
  cancel: controller.cancel,
  showEffects: () => {
    tab.value = "effects";
  },
  showPaint: (category: "fill" | "line") => {
    tab.value = "fill-line";
    fillLineRef.value?.showCategory(category);
  },
});
</script>
<template>
  <aside
    class="picture-format-pane"
    :aria-label="t('paneTitle')"
    @keydown="keydown"
    @pointerdown.capture="beforeInteraction"
    @focusin.capture="beforeInteraction"
    @click.capture="guardClick"
  >
    <header class="picture-format-pane__header">
      <div class="picture-format-pane__heading">
        <strong>{{ t("paneTitle") }}</strong
        ><span v-if="snapshot?.name" :title="snapshot.name">{{ snapshot.name }}</span>
      </div>
      <TButton variant="text" shape="square" size="small" :aria-label="t('close')" @click="close"
        ><X :size="16"
      /></TButton>
    </header>
    <div
      class="picture-format-pane__tabs"
      role="tablist"
      :aria-label="t('paneTitle')"
      @keydown="tabKeydown"
    >
      <TTabs :value="tab" class="sheetcraft-tabs--compact" @change="changeTab">
        <TTabPanel value="fill-line" :destroy-on-hide="false">
          <template #label>
            <button
              :id="`${paneId}-fill-line-tab`"
              type="button"
              role="tab"
              class="picture-format-pane__tab-label"
              :aria-controls="`${paneId}-fill-line-panel`"
              :aria-selected="tab === 'fill-line'"
              :tabindex="tab === 'fill-line' ? 0 : -1"
              :title="t('fillLineTab')"
            >
              {{ t("fillLineTab") }}
            </button>
          </template>
        </TTabPanel>
        <TTabPanel value="effects" :destroy-on-hide="false">
          <template #label>
            <button
              :id="`${paneId}-effects-tab`"
              type="button"
              role="tab"
              class="picture-format-pane__tab-label"
              :aria-controls="`${paneId}-effects-panel`"
              :aria-selected="tab === 'effects'"
              :tabindex="tab === 'effects' ? 0 : -1"
              :title="t('effectsTab')"
            >
              {{ t("effectsTab") }}
            </button>
          </template>
        </TTabPanel>
        <TTabPanel value="size-properties" :destroy-on-hide="false">
          <template #label>
            <button
              :id="`${paneId}-size-properties-tab`"
              type="button"
              role="tab"
              class="picture-format-pane__tab-label"
              :aria-controls="`${paneId}-size-properties-panel`"
              :aria-selected="tab === 'size-properties'"
              :tabindex="tab === 'size-properties' ? 0 : -1"
              :title="t('sizePropertiesTab')"
            >
              {{ t("sizePropertiesTab") }}
            </button>
          </template>
        </TTabPanel>
        <TTabPanel value="picture" :destroy-on-hide="false">
          <template #label>
            <button
              :id="`${paneId}-picture-tab`"
              type="button"
              role="tab"
              class="picture-format-pane__tab-label"
              :aria-controls="`${paneId}-picture-panel`"
              :aria-selected="tab === 'picture'"
              :tabindex="tab === 'picture' ? 0 : -1"
              :title="t('pictureTab')"
            >
              {{ t("pictureTab") }}
            </button>
          </template>
        </TTabPanel>
      </TTabs>
    </div>
    <div v-if="snapshot" class="picture-format-pane__units">
      <span>{{ t("units") }}</span
      ><TSelect
        :model-value="unit"
        :options="unitOptions"
        :disabled="controller.hasActiveNumericDraft.value"
        :aria-label="t('units')"
        size="small"
        data-picture-format-units
        @change="changeUnit"
      />
    </div>
    <div class="picture-format-pane__body">
      <div v-if="snapshot && commonReasons.size" class="picture-format-pane__status" role="status">
        <p v-for="reason in commonReasons" :key="reason">{{ reason }}</p>
      </div>
      <p v-if="!snapshot" class="picture-format-pane__empty">{{ t("noSelection") }}</p>
      <template v-else>
        <div
          :id="`${paneId}-fill-line-panel`"
          v-show="tab === 'fill-line'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-fill-line-tab`"
        >
          <PictureFormatFillLine
            ref="fillLineRef"
            :controller="controller"
            :unit="unit"
            :initial-paint="initialPaint"
          />
        </div>
        <div
          :id="`${paneId}-effects-panel`"
          v-show="tab === 'effects'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-effects-tab`"
        >
          <PictureFormatEffects :controller="controller" :unit="unit" />
        </div>
        <div
          :id="`${paneId}-size-properties-panel`"
          v-show="tab === 'size-properties'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-size-properties-tab`"
        >
          <PictureFormatSizeProperties
            :controller="controller"
            :unit="unit"
            :intrinsic-status="intrinsicStatus"
            :retry-intrinsic="retryIntrinsic"
          />
        </div>
        <div
          :id="`${paneId}-picture-panel`"
          v-show="tab === 'picture'"
          role="tabpanel"
          :aria-labelledby="`${paneId}-picture-tab`"
        >
          <PictureFormatPicture :controller="controller" :unit="unit" />
        </div>
      </template>
    </div>
  </aside>
</template>
<style scoped lang="scss">
@use "../../../../shared/tabs/tab-label" as tabLabel;
.picture-format-pane {
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
    padding: 8px 10px 6px;
  }
  &__heading {
    min-width: 0;
    display: flex;
    align-items: baseline;
    gap: 8px;
    strong {
      font-size: 14px;
      line-height: 22px;
      font-weight: 600;
    }
    span {
      color: var(--sheetcraft-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  &__tabs {
    min-width: 0;
  }
  &__tab-label {
    @include tabLabel.label;
  }
  &__units {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 5px 10px 2px;
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
    padding: 0 10px 10px;
  }
  &__status {
    color: var(--sheetcraft-text-secondary);
    padding: 4px 0 6px;
    p {
      margin: 0;
      line-height: 18px;
    }
  }
  &__empty {
    color: var(--sheetcraft-text-secondary);
    margin: 16px 0;
  }
}
@media (max-width: 600px) {
  .picture-format-pane {
    flex-basis: min(320px, 100%);
    width: min(320px, 100%);
  }
}
</style>
