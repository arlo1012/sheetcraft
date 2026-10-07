<script setup lang="ts">
import { Baseline, PaintBucket, TableCellsMerge, TextWrap } from "lucide-vue-next";
import { computed, ref } from "vue";
import {
  DEFAULT_CELL_FILL_COLOR,
  DEFAULT_CELL_TEXT_COLOR,
  type CellBorderAction,
  type CellStylePatch,
} from "@idea10/core/style";
import type { CellMergeMode } from "@idea10/core/commands";
import { useAppI18n } from "../../../shared/i18n";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import CellBorderPresetIcon from "../../../shared/borders/CellBorderPresetIcon.vue";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import ColorPalette from "../../../shared/color/ColorPalette.vue";
import BorderPresetGrid from "../../home-tools/components/BorderPresetGrid.vue";
import FontFormatControls from "../../home-tools/components/FontFormatControls.vue";
import HorizontalAlignmentControls from "../../home-tools/components/HorizontalAlignmentControls.vue";
import TextFormatControls from "../../home-tools/components/TextFormatControls.vue";
import VerticalAlignmentControls from "../../home-tools/components/VerticalAlignmentControls.vue";
import type { SheetContextAction, SheetContextMenuState } from "../context-menu-contracts";

const props = withDefaults(
  defineProps<{
    state: SheetContextMenuState;
    readOnly?: boolean;
  }>(),
  { readOnly: false },
);

const emit = defineEmits<{ action: [action: SheetContextAction] }>();
const { t } = useAppI18n();
const toolbarRef = ref<HTMLElement | null>(null);
const activePanel = ref<"border" | "text-color" | "fill-color" | null>(null);
const disabled = computed(() => props.readOnly || props.state.formattingDisabled);
const currentTextColor = computed(() =>
  props.state.format.textColor.mixed ? null : (props.state.format.textColor.value ?? null),
);
const currentFillColor = computed(() =>
  props.state.format.fillColor.mixed ? null : (props.state.format.fillColor.value ?? null),
);
const canMerge = computed(
  () => props.state.merge.availableModes?.all ?? props.state.merge.canMerge,
);
const mergeLabel = computed(() =>
  props.state.merge.canUnmerge ? t("ribbon.unmergeCells") : t("ribbon.mergeCells"),
);

function applyStyle(patch: CellStylePatch): void {
  if (disabled.value) return;
  emit("action", { type: "applyStyle", patch });
}

function applyBorder(action: CellBorderAction): void {
  if (disabled.value) return;
  activePanel.value = null;
  emit("action", { type: "applyBorders", action });
}

function selectColor(kind: "text" | "fill", color: string | null): void {
  activePanel.value = null;
  applyStyle(kind === "text" ? { textColor: color } : { fillColor: color });
}

function togglePanel(panel: "border" | "text-color" | "fill-color"): void {
  if (disabled.value) return;
  activePanel.value = activePanel.value === panel ? null : panel;
}

function toggleWrap(): void {
  applyStyle({ wrapText: props.state.format.wrapText === "on" ? null : true });
}

function merge(): void {
  if (disabled.value) return;
  if (props.state.merge.canUnmerge) {
    emit("action", { type: "unmerge" });
  } else if (canMerge.value) {
    emit("action", { type: "merge", mode: "all" satisfies CellMergeMode });
  }
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && activePanel.value) {
    event.preventDefault();
    event.stopPropagation();
    activePanel.value = null;
  }
}

function getPopupAttach(): HTMLElement {
  return toolbarRef.value ?? document.body;
}
</script>

<template>
  <section
    ref="toolbarRef"
    class="sheet-context-format-toolbar"
    data-context-format-toolbar
    role="group"
    :aria-label="t('contextMenu.formatToolbar')"
    :aria-disabled="disabled"
    :title="state.formattingDisabled ? t('format.selectionTooLarge') : undefined"
    @keydown="onKeydown"
  >
    <div class="sheet-context-format-toolbar__row sheet-context-format-toolbar__row--font">
      <FontFormatControls
        class="sheet-context-format-toolbar__font"
        :state="state.format"
        :disabled="disabled"
        :popup-attach="getPopupAttach"
        @apply-style="applyStyle"
      />
      <TextFormatControls
        class="sheet-context-format-toolbar__emphasis"
        :state="state.format"
        :disabled="disabled"
        @apply-style="applyStyle"
      />
    </div>
    <div class="sheet-context-format-toolbar__row sheet-context-format-toolbar__row--actions">
      <VerticalAlignmentControls
        class="sheet-context-format-toolbar__vertical"
        :state="state.format.verticalAlign"
        :disabled="disabled"
        @apply-style="applyStyle"
      />
      <HorizontalAlignmentControls
        class="sheet-context-format-toolbar__horizontal"
        :state="state.format"
        :disabled="disabled"
        @apply-style="applyStyle"
      />
      <RibbonButton
        :label="t('ribbon.wrapText')"
        :disabled="disabled"
        :pressed="state.format.wrapText === 'mixed' ? 'mixed' : state.format.wrapText === 'on'"
        data-context-format-action="wrap"
        @activate="toggleWrap"
      >
        <TextWrap :size="17" aria-hidden="true" />
      </RibbonButton>
      <span class="sheet-context-format-toolbar__color-control">
        <RibbonButton
          :label="t('format.textColor')"
          :disabled="disabled"
          data-context-format-action="text-color"
          @activate="togglePanel('text-color')"
        >
          <span
            class="sheet-context-format-toolbar__color-icon"
            :style="{
              '--indicator': currentTextColor ?? DEFAULT_CELL_TEXT_COLOR,
            }"
          >
            <Baseline :size="18" aria-hidden="true" />
          </span>
        </RibbonButton>
        <FloatingPanelSurface
          v-if="activePanel === 'text-color'"
          class="sheet-context-format-toolbar__panel"
          :label="t('format.textColor')"
          layer="context-submenu"
          :scrollable="false"
          :constrain-to-viewport="false"
        >
          <ColorPalette
            :model-value="currentTextColor"
            :default-color="DEFAULT_CELL_TEXT_COLOR"
            :default-label="t('cellFormat.automatic')"
            @select="selectColor('text', $event)"
          />
        </FloatingPanelSurface>
      </span>
      <span class="sheet-context-format-toolbar__color-control">
        <RibbonButton
          :label="t('format.fillColor')"
          :disabled="disabled"
          data-context-format-action="fill-color"
          @activate="togglePanel('fill-color')"
        >
          <span
            class="sheet-context-format-toolbar__color-icon"
            :style="{
              '--indicator': currentFillColor ?? DEFAULT_CELL_FILL_COLOR,
            }"
          >
            <PaintBucket :size="18" aria-hidden="true" />
          </span>
        </RibbonButton>
        <FloatingPanelSurface
          v-if="activePanel === 'fill-color'"
          class="sheet-context-format-toolbar__panel"
          :label="t('format.fillColor')"
          layer="context-submenu"
          :scrollable="false"
          :constrain-to-viewport="false"
        >
          <ColorPalette
            :model-value="currentFillColor"
            :default-color="DEFAULT_CELL_FILL_COLOR"
            :default-label="t('cellFormat.noFill')"
            @select="selectColor('fill', $event)"
          />
        </FloatingPanelSurface>
      </span>
      <span class="sheet-context-format-toolbar__color-control">
        <RibbonButton
          :label="t('format.borderPresets')"
          :disabled="disabled"
          data-context-format-action="borders"
          @activate="togglePanel('border')"
        >
          <CellBorderPresetIcon preset="bottom" />
        </RibbonButton>
        <FloatingPanelSurface
          v-if="activePanel === 'border'"
          class="sheet-context-format-toolbar__panel sheet-context-format-toolbar__panel--borders"
          :label="t('format.borderPresets')"
          layer="context-submenu"
          padding="tool"
          :scrollable="false"
          :constrain-to-viewport="false"
        >
          <BorderPresetGrid :border="{ style: 'thin', color: '#20242c' }" @select="applyBorder" />
        </FloatingPanelSurface>
      </span>
      <RibbonButton
        :label="mergeLabel"
        :disabled="disabled || (!state.merge.canUnmerge && !canMerge)"
        data-context-format-action="merge"
        @activate="merge"
      >
        <TableCellsMerge :size="17" aria-hidden="true" />
      </RibbonButton>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use "../../../shared/floating/floating-panel" as panel;

.sheet-context-format-toolbar {
  @include panel.toolbar-surface(var(--idea-layer-context-menu), 0, none);

  --cell-format-font-width: 130px;
  --cell-format-font-size-width: 48px;
  --cell-format-gap: 0px;
  --ribbon-button-width: 26px;
  --ribbon-control-height: 26px;

  position: relative;
  display: grid;
  width: 302px;
  gap: 4px;
  padding: 6px 8px;
  border-bottom: 1px solid var(--idea-border-subtle);

  &__row {
    display: grid;
    grid-template-columns: repeat(11, 26px);
    align-items: center;
    min-height: 26px;
  }

  &__font {
    grid-column: span 7;
  }

  &__emphasis {
    grid-column: span 4;
    width: auto;
  }

  &__vertical,
  &__horizontal {
    grid-column: span 3;
  }

  &__horizontal :deep(.horizontal-alignment-controls__button:nth-child(n + 4)) {
    display: none;
  }

  &__color-control {
    position: relative;
    display: inline-flex;
  }

  &__color-icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;

    &::after {
      position: absolute;
      right: 1px;
      bottom: 0;
      left: 1px;
      height: 3px;
      background: var(--indicator);
      border-radius: 1px;
      box-shadow: inset 0 0 0 1px rgb(32 36 44 / 22%);
      content: "";
    }
  }

  &__panel {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
  }

  &__panel--borders {
    width: 128px;
  }
}
</style>
