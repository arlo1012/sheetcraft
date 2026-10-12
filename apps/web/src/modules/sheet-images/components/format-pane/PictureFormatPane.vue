<script setup lang="ts">
import type { PictureTextureId } from "../../picture-texture";
import { computed, nextTick, ref, useId } from "vue";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Image, PaintBucket, Ruler, Sparkles, X } from "lucide-vue-next";
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
import PictureFormatFillLine from "./PictureFormatFillLine.vue";
import PictureFormatEffects from "./PictureFormatEffects.vue";
import PictureFormatSizeProperties from "./PictureFormatSizeProperties.vue";
import PictureFormatPicture from "./PictureFormatPicture.vue";

const props = withDefaults(
  defineProps<{
    snapshot: PictureFormatSnapshot | null;
    capabilities: PictureFormatCapabilities;
    onIntent: PictureFormatIntentHandler;
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
const emit = defineEmits<{ close: []; cancel: [] }>();
const controller = usePictureFormatPane(props);
const tab = ref<PictureFormatTab>(props.initialPaint ? "fill-line" : props.initialTab);
const fillLineRef = ref<InstanceType<typeof PictureFormatFillLine> | null>(null);
const unit = ref<PictureFormatLengthUnit>(props.initialUnit);
const paneId = `picture-format-pane-${useId()}`;
const tabs = ["fill-line", "effects", "size-properties", "picture"] as const;
const tabButtons = ref<HTMLButtonElement[]>([]);
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
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    close();
  }
}
async function tabKeydown(event: KeyboardEvent) {
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
  tabButtons.value[next]?.focus();
}
defineExpose({
  cancel: controller.cancel,
  showPaint: (category: "fill" | "line") => {
    tab.value = "fill-line";
    fillLineRef.value?.showCategory(category);
  },
});
</script>
<template>
  <aside class="picture-format-pane" :aria-label="t('paneTitle')" @keydown="keydown">
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
      <button
        :id="`${paneId}-fill-line-tab`"
        :ref="
          (element) => {
            tabButtons[0] = element as HTMLButtonElement;
          }
        "
        type="button"
        role="tab"
        :aria-controls="`${paneId}-fill-line-panel`"
        :aria-selected="tab === 'fill-line'"
        :tabindex="tab === 'fill-line' ? 0 : -1"
        :title="t('fillLineTab')"
        @click="tab = 'fill-line'"
      >
        <PaintBucket :size="16" aria-hidden="true" /><span>{{ t("fillLineTab") }}</span>
      </button>
      <button
        :id="`${paneId}-effects-tab`"
        :ref="
          (element) => {
            tabButtons[1] = element as HTMLButtonElement;
          }
        "
        type="button"
        role="tab"
        :aria-controls="`${paneId}-effects-panel`"
        :aria-selected="tab === 'effects'"
        :tabindex="tab === 'effects' ? 0 : -1"
        :title="t('effectsTab')"
        @click="tab = 'effects'"
      >
        <Sparkles :size="16" aria-hidden="true" /><span>{{ t("effectsTab") }}</span>
      </button>
      <button
        :id="`${paneId}-size-properties-tab`"
        :ref="
          (element) => {
            tabButtons[2] = element as HTMLButtonElement;
          }
        "
        type="button"
        role="tab"
        :aria-controls="`${paneId}-size-properties-panel`"
        :aria-selected="tab === 'size-properties'"
        :tabindex="tab === 'size-properties' ? 0 : -1"
        :title="t('sizePropertiesTab')"
        @click="tab = 'size-properties'"
      >
        <Ruler :size="16" aria-hidden="true" /><span>{{ t("sizePropertiesTab") }}</span>
      </button>
      <button
        :id="`${paneId}-picture-tab`"
        :ref="
          (element) => {
            tabButtons[3] = element as HTMLButtonElement;
          }
        "
        type="button"
        role="tab"
        :aria-controls="`${paneId}-picture-panel`"
        :aria-selected="tab === 'picture'"
        :tabindex="tab === 'picture' ? 0 : -1"
        :title="t('pictureTab')"
        @click="tab = 'picture'"
      >
        <Image :size="16" aria-hidden="true" /><span>{{ t("pictureTab") }}</span>
      </button>
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
      color: var(--sheetcraft-text-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  }
  &__tabs {
    display: grid;
    grid-template-columns: 1fr 0.8fr 1.4fr 0.9fr;
    gap: 2px;
    margin: 0 8px;
    border-bottom: 1px solid var(--sheetcraft-border-subtle);
  }
  &__tabs button {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-width: 0;
    gap: 2px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    padding: 8px 2px 6px;
    color: inherit;
    font: inherit;
    cursor: pointer;
    border-radius: var(--sheetcraft-radius-small) var(--sheetcraft-radius-small) 0 0;
  }
  &__tabs button span {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  &__tabs button:hover {
    background: var(--sheetcraft-surface-hover);
  }
  &__tabs button[aria-selected="true"] {
    border-bottom-color: var(--sheetcraft-text-primary);
    font-weight: 500;
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
