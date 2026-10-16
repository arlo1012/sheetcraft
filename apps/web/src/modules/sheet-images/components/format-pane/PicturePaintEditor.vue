<script setup lang="ts">
import {
  createPictureTextureBlob,
  pictureTextureFromAssetId,
  type PictureTextureId,
} from "../../picture-texture";
import {
  SUPPORTED_IMAGE_INPUT_TYPES,
  SUPPORTED_IMAGE_FILE_ACCEPT,
} from "../../../image-assets/supportedImageTypes";
import { imageAssetFeedback } from "../../../image-assets/imageAssetFeedback";
import { useAppI18n } from "../../../../shared/i18n";
import PictureTextureGallery from "./PictureTextureGallery.vue";
import { computed, nextTick, onUnmounted, ref, useId, watch } from "vue";
import type { PopupVisibleChangeContext } from "tdesign-vue-next/es/popup";
import { useNativePopupOwnership } from "../../../../shared/floating/useNativePopupOwnership";
import { vNativeControl } from "../../../../shared/tdesign/native-control";
import { Select as TSelect } from "tdesign-vue-next/es/select";
import { Button as TButton } from "tdesign-vue-next/es/button";
import { Checkbox as TCheckbox } from "tdesign-vue-next/es/checkbox";
import {
  PICTURE_PATTERN_PRESETS,
  type Choice,
  type PicturePaint,
  type PicturePatternPreset,
  type PictureAnchor,
} from "@sheetcraft/core/picture-detailed-style";
import type { PictureFormatTranslate } from "../../picture-format-pane-model";
import {
  createPictureGradientPaint,
  createPictureSolidPaint,
  getPictureStretchOffsets,
  editPictureStretchOffset,
} from "../../picture-paint-edit";
import { createPicturePatternSampler } from "../../../../shared/images/picture-paint-pattern";
import { PICTURE_PATTERN_LABELS } from "../../picture-pattern-labels";
import PictureFormatField from "./PictureFormatField.vue";
import PicturePaintColor from "./PicturePaintColor.vue";
import PicturePaintNumber from "./PicturePaintNumber.vue";
import PictureGradientEditor from "./PictureGradientEditor.vue";
const props = defineProps<{
  ownerKey: string;
  /** Stable semantic owner for focus handoff after an accepted choice remounts its trigger. */
  focusOwnerKey?: string;
  value?: Choice<PicturePaint>;
  mixed?: boolean;
  disabled?: boolean;
  t: PictureFormatTranslate;
  sourceAssetId?: string;
  paintRole?: "fill" | "line";
  /** Obvious context help may be omitted by a formatting host; capability reasons stay separate. */
  showContextHelp?: boolean;
  loadAsset?: (blob: Blob, texture?: PictureTextureId) => Promise<string | undefined>;
  onCommit: (value: Choice<PicturePaint> | undefined) => boolean;
}>();
const { t: imageT } = useAppI18n();
const paint = computed(() => (props.value?.kind === "value" ? props.value.value : undefined));
const mode = computed(() =>
  props.mixed
    ? "mixed"
    : props.value === undefined
      ? "inherit"
      : props.value.kind === "none"
        ? "none"
        : ["linear", "radial", "rectangular"].includes(props.value.value.kind)
          ? "gradient"
          : props.value.value.kind,
);
const busy = ref(false),
  sourceError = ref<string>(),
  fileInput = ref<HTMLInputElement>();
const editorRoot = ref<HTMLElement>();
const modeInput = ref<HTMLInputElement>();
const modeInputId = `picture-paint-mode-${useId()}`;
const modePopup = useNativePopupOwnership({
  owner: () => props.ownerKey,
  disabled: () => !!props.disabled || busy.value,
  root: () => editorRoot.value,
});
const modePopupHost = modePopup.host;
const modePopupProps = modePopup.popupProps;
const modePopupVisible = modePopup.visible;
let active = true;
let request = 0;
let focusRequest = 0;
let acceptedModeChoice: { owner: string; generation: number } | undefined;
let cancelPendingModeFocus: (() => void) | undefined;
watch(
  () => props.focusOwnerKey ?? props.ownerKey,
  () => {
    focusRequest++;
    acceptedModeChoice = undefined;
    cancelPendingModeFocus?.();
  },
  { flush: "sync" },
);
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) cancelPendingModeFocus?.();
  },
  { flush: "sync" },
);
watch(
  () => props.ownerKey,
  () => {
    request++;
    busy.value = false;
    sourceError.value = undefined;
  },
  { flush: "sync" },
);
onUnmounted(() => {
  active = false;
  cancelPendingModeFocus?.();
  focusRequest++;
  acceptedModeChoice = undefined;
  request++;
});
const disabled = computed(() => props.disabled || busy.value);
const imageInputPrefix = `picture-paint-image-${useId()}`;
const imageLayoutPopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:picture:layout`,
  focus: {
    owner: () => props.focusOwnerKey ?? props.ownerKey,
    input: () =>
      editorRoot.value?.querySelector<HTMLInputElement>(`input[id="${imageInputPrefix}-layout"]`),
  },
  disabled: () => !!disabled.value || paint.value?.kind !== "picture",
  root: () => editorRoot.value,
});
const tileAlignPopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:picture:tile-align`,
  focus: {
    owner: () => props.focusOwnerKey ?? props.ownerKey,
    input: () =>
      editorRoot.value?.querySelector<HTMLInputElement>(
        `input[id="${imageInputPrefix}-alignment"]`,
      ),
  },
  disabled: () =>
    !!disabled.value || paint.value?.kind !== "picture" || paint.value.layout.kind !== "tile",
  root: () => editorRoot.value,
});
const mirrorPopup = useNativePopupOwnership({
  owner: () => `${props.ownerKey}:picture:mirror`,
  focus: {
    owner: () => props.focusOwnerKey ?? props.ownerKey,
    input: () =>
      editorRoot.value?.querySelector<HTMLInputElement>(`input[id="${imageInputPrefix}-mirror"]`),
  },
  disabled: () =>
    !!disabled.value || paint.value?.kind !== "picture" || paint.value.layout.kind !== "tile",
  root: () => editorRoot.value,
});
const imageLayoutHost = imageLayoutPopup.host,
  tileAlignHost = tileAlignPopup.host,
  mirrorHost = mirrorPopup.host;
const imageNative = computed(() => ({
  layout: {
    attributes: {
      id: `${imageInputPrefix}-layout`,
      role: "combobox",
      "aria-label": props.t("paintLayout"),
      "aria-expanded": String(imageLayoutPopup.visible.value),
      "data-format-pane-history-control": "readonly-combobox",
    },
  },
  alignment: {
    attributes: {
      id: `${imageInputPrefix}-alignment`,
      role: "combobox",
      "aria-label": props.t("paintAlignment"),
      "aria-expanded": String(tileAlignPopup.visible.value),
      "data-format-pane-history-control": "readonly-combobox",
    },
  },
  mirror: {
    attributes: {
      id: `${imageInputPrefix}-mirror`,
      role: "combobox",
      "aria-label": props.t("paintMirror"),
      "aria-expanded": String(mirrorPopup.visible.value),
      "data-format-pane-history-control": "readonly-combobox",
    },
  },
}));
const modes = computed(() => [
  ...(props.mixed ? [{ value: "mixed", label: props.t("paintMixed"), disabled: true }] : []),
  { value: "inherit", label: props.t("paintInherit") },
  { value: "none", label: props.t(props.paintRole === "line" ? "none" : "paintNone") },
  { value: "solid", label: props.t(props.paintRole === "line" ? "solid" : "paintSolid") },
  { value: "gradient", label: props.t(props.paintRole === "line" ? "gradient" : "paintGradient") },
  {
    value: "picture",
    label: props.t(props.paintRole === "line" ? "paintLinePicture" : "paintPicture"),
  },
  {
    value: "pattern",
    label: props.t(props.paintRole === "line" ? "paintLinePattern" : "paintPattern"),
  },
]);
const anchors: readonly { value: PictureAnchor; key: Parameters<PictureFormatTranslate>[0] }[] = [
  { value: "top-left", key: "alignTopLeft" },
  { value: "top", key: "alignTop" },
  { value: "top-right", key: "alignTopRight" },
  { value: "left", key: "alignLeft" },
  { value: "center", key: "alignCenter" },
  { value: "right", key: "alignRight" },
  { value: "bottom-left", key: "alignBottomLeft" },
  { value: "bottom", key: "alignBottom" },
  { value: "bottom-right", key: "alignBottomRight" },
];
const anchorOptions = computed(() =>
  anchors.map(({ value, key }) => ({ value, label: props.t(key) })),
);
const flipOptions = computed(() => [
  { value: "none", label: props.t("paintMirrorNone") },
  { value: "x", label: props.t("paintMirrorX") },
  { value: "y", label: props.t("paintMirrorY") },
  { value: "xy", label: props.t("paintMirrorBoth") },
]);
const owner = computed(() => `${props.ownerKey}:paint:${mode.value}`);
function commit(value: PicturePaint) {
  return !disabled.value && props.onCommit({ kind: "value", value });
}
function picture(assetId: string): Extract<PicturePaint, { kind: "picture" }> {
  return {
    kind: "picture",
    assetId,
    opacity: 1,
    rotateWithShape: true,
    layout: { kind: "stretch", offsetXRatio: 0, offsetYRatio: 0, widthRatio: 1, heightRatio: 1 },
  };
}
// Keep a retired native popup callback bound to its original command lease.
const changeMode = computed(() => {
  const key = props.ownerKey,
    handler = props.onCommit,
    focusOwner = props.focusOwnerKey ?? key;
  return (value: unknown) => {
    if (!active || disabled.value || key !== props.ownerKey || handler !== props.onCommit) return;
    cancelPendingModeFocus?.();
    const apply = (choice: Choice<PicturePaint> | undefined) => {
      const generation = focusRequest;
      const accepted = handler(choice);
      acceptedModeChoice = accepted ? { owner: focusOwner, generation } : undefined;
      return accepted;
    };
    if (value === "inherit") apply(undefined);
    else if (value === "none") apply({ kind: "none" });
    else if (value === "solid") apply({ kind: "value", value: createPictureSolidPaint() });
    else if (value === "gradient") apply({ kind: "value", value: createPictureGradientPaint() });
    else if (value === "pattern")
      apply({
        kind: "value",
        value: {
          kind: "pattern",
          preset: "pct50",
          foreground: { kind: "rgb", rgb: "#000000" },
          background: { kind: "rgb", rgb: "#FFFFFF" },
          opacity: 1,
          rotateWithShape: true,
        },
      });
    else if (value === "picture") {
      if (props.loadAsset) loadModeTexture(focusOwner);
      else if (props.sourceAssetId) apply({ kind: "value", value: picture(props.sourceAssetId) });
      else fileInput.value?.click();
    }
  };
});
const modeNativeControl = computed(() => {
  const key = props.ownerKey;
  return {
    attributes: {
      id: modeInputId,
      role: "combobox",
      "aria-label": props.t(props.paintRole === "line" ? "lineMode" : "paintMode"),
      "aria-expanded": String(modePopupVisible.value),
      "data-format-pane-history-control": "readonly-combobox",
    },
    onElement: (element: HTMLInputElement | HTMLTextAreaElement | null) => {
      if (key === props.ownerKey)
        modeInput.value = element instanceof HTMLInputElement ? element : undefined;
    },
  };
});
function restoreModeFocus(choice: { owner: string; generation: number }) {
  const activeBefore = document.activeElement;
  let moved = false;
  const focusMoved = (event: FocusEvent) => {
    if (event.target !== activeBefore && event.target !== document.body) moved = true;
  };
  const pointerMoved = () => {
    moved = true;
  };
  document.addEventListener("focusin", focusMoved);
  document.addEventListener("pointerdown", pointerMoved);
  void nextTick(() => {
    try {
      const focused = document.activeElement,
        input = modeInput.value;
      if (
        !active ||
        moved ||
        choice.generation !== focusRequest ||
        choice.owner !== (props.focusOwnerKey ?? props.ownerKey) ||
        disabled.value ||
        modePopupVisible.value ||
        !input?.isConnected ||
        !input.readOnly ||
        input.disabled ||
        (focused !== activeBefore && focused !== document.body && focused !== null)
      )
        return;
      input.focus({ preventScroll: true });
    } finally {
      document.removeEventListener("focusin", focusMoved);
      document.removeEventListener("pointerdown", pointerMoved);
    }
  });
}
// Only a mode choice owns this deferred handoff. Explicit file/texture actions
// keep their own focus, and interaction during the decode cancels this request.
function loadModeTexture(focusOwner: string): void {
  const choice = { owner: focusOwner, generation: focusRequest };
  const originalInput = modeInput.value;
  let cancelled = false;
  const release = () => {
    document.removeEventListener("focusin", focusMoved);
    document.removeEventListener("pointerdown", cancel);
    if (cancelPendingModeFocus === cancel) cancelPendingModeFocus = undefined;
  };
  const cancel = () => {
    cancelled = true;
    release();
  };
  const focusMoved = (event: FocusEvent) => {
    if (
      event.target !== originalInput &&
      event.target !== modeInput.value &&
      event.target !== document.body &&
      !(event.target instanceof Node && modePopupHost.value?.contains(event.target))
    )
      cancel();
  };
  cancelPendingModeFocus = cancel;
  document.addEventListener("focusin", focusMoved);
  document.addEventListener("pointerdown", cancel);
  void texture("paper").then((accepted) => {
    const restore = accepted && !cancelled;
    release();
    // loadSource's finally has released busy before this continuation. Its
    // captured opaque owner/callback, not this focus-only lease, made the edit.
    if (restore) restoreModeFocus(choice);
  });
}
const changeModePopupVisible = computed(() => {
  const key = props.ownerKey,
    changeVisible = modePopup.onVisibleChange.value;
  return (visible: boolean, context: PopupVisibleChangeContext) => {
    if (!active || key !== props.ownerKey) return;
    const selected =
      !visible &&
      modePopupVisible.value &&
      context.e?.target instanceof Node &&
      !!modePopupHost.value?.contains(context.e.target);
    if (!changeVisible(visible)) return;
    const choice = acceptedModeChoice;
    acceptedModeChoice = undefined;
    if (selected && choice) restoreModeFocus(choice);
  };
});
const containsModeTarget = modePopup.containsTarget;
defineExpose({ containsModeTarget });
function numberProps(
  label: Parameters<PictureFormatTranslate>[0],
  value: number,
  onCommit: (value: number) => boolean,
  min: number,
  max: number,
) {
  return {
    ownerKey: owner.value,
    value,
    label: props.t(label),
    onCommit,
    min,
    max,
    disabled: disabled.value,
    invalidMessage: props.t("outOfRange"),
    rejectedMessage: props.t("applyRejected"),
  };
}
const imageActions = computed(() => {
  const key = props.ownerKey,
    handler = props.onCommit,
    current = paint.value;
  const apply = (value: PicturePaint) =>
    active &&
    !disabled.value &&
    key === props.ownerKey &&
    handler === props.onCommit &&
    current === paint.value &&
    handler({ kind: "value", value });
  return {
    layout(value: unknown) {
      if (current?.kind !== "picture") return false;
      if (value === "tile")
        return imageLayoutPopup.acceptChoice(() =>
          apply({
            ...current,
            layout: {
              kind: "tile",
              scaleX: 1,
              scaleY: 1,
              offsetXPt: 0,
              offsetYPt: 0,
              anchor: "center",
              flip: "none",
            },
          }),
        );
      return (
        value === "stretch" &&
        imageLayoutPopup.acceptChoice(() =>
          apply({
            ...current,
            layout: {
              kind: "stretch",
              offsetXRatio: 0,
              offsetYRatio: 0,
              widthRatio: 1,
              heightRatio: 1,
            },
          }),
        )
      );
    },
    alignment(value: unknown) {
      return (
        current?.kind === "picture" &&
        current.layout.kind === "tile" &&
        anchors.some((item) => item.value === value) &&
        tileAlignPopup.acceptChoice(
          () =>
            current.layout.kind === "tile" &&
            apply({ ...current, layout: { ...current.layout, anchor: value as PictureAnchor } }),
        )
      );
    },
    mirror(value: unknown) {
      return (
        current?.kind === "picture" &&
        current.layout.kind === "tile" &&
        (value === "none" || value === "x" || value === "y" || value === "xy") &&
        mirrorPopup.acceptChoice(
          () =>
            current.layout.kind === "tile" &&
            apply({ ...current, layout: { ...current.layout, flip: value } }),
        )
      );
    },
  };
});

function editTile(
  patch: Partial<Extract<Extract<PicturePaint, { kind: "picture" }>["layout"], { kind: "tile" }>>,
) {
  const current = paint.value;
  return (
    current?.kind === "picture" &&
    current.layout.kind === "tile" &&
    commit({ ...current, layout: { ...current.layout, ...patch } })
  );
}
const stretch = computed(() =>
  paint.value?.kind === "picture" && paint.value.layout.kind === "stretch"
    ? getPictureStretchOffsets(paint.value.layout)
    : undefined,
);
function stretchSide(side: "left" | "right" | "top" | "bottom", value: number) {
  const current = paint.value;
  return current?.kind === "picture" && commit(editPictureStretchOffset(current, side, value));
}
async function loadSource(getBlob: () => Blob | Promise<Blob>, textureId?: PictureTextureId) {
  if (disabled.value || !props.loadAsset) return false;
  const generation = ++request,
    key = props.ownerKey,
    loader = props.loadAsset,
    apply = props.onCommit;
  const choice = JSON.stringify(props.value),
    previous =
      paint.value?.kind === "picture"
        ? { ...paint.value, layout: { ...paint.value.layout } }
        : undefined;
  const current = () =>
    generation === request &&
    key === props.ownerKey &&
    !props.disabled &&
    props.loadAsset === loader &&
    props.onCommit === apply &&
    JSON.stringify(props.value) === choice;
  busy.value = true;
  sourceError.value = undefined;
  try {
    const blob = await getBlob();
    if (!current()) return false;
    const id = await loader(blob, textureId);
    if (!current()) return false;
    if (!id) {
      sourceError.value = props.t("applyRejected");
      return false;
    }
    const value = previous ? { ...previous, assetId: id } : picture(id);
    if (textureId && value.layout.kind !== "tile")
      value.layout = {
        kind: "tile",
        scaleX: 1,
        scaleY: 1,
        offsetXPt: 0,
        offsetYPt: 0,
        anchor: "center",
        flip: "none",
      };
    const accepted = apply({ kind: "value", value }) === true;
    if (!accepted) sourceError.value = props.t("applyRejected");
    return accepted;
  } catch (error) {
    if (current()) {
      const feedback = imageAssetFeedback(error);
      sourceError.value = feedback ? imageT(feedback) : props.t("paintSourceFailed");
    }
  } finally {
    if (generation === request) busy.value = false;
  }
  return false;
}
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement,
    file = input.files?.[0];
  input.value = "";
  if (file) void loadSource(() => file);
}
async function clipboard() {
  await loadSource(async () => {
    const items = await navigator.clipboard.read();
    const item = items.find((candidate) =>
      candidate.types.some((type) => SUPPORTED_IMAGE_INPUT_TYPES.includes(type)),
    );
    const type = item?.types.find((type) => SUPPORTED_IMAGE_INPUT_TYPES.includes(type));
    if (!item || !type) throw Error("No supported clipboard picture.");
    return item.getType(type);
  });
}
async function texture(id: PictureTextureId) {
  return loadSource(() => createPictureTextureBlob(id), id);
}
const selectedTexture = computed(() =>
  paint.value?.kind === "picture" ? pictureTextureFromAssetId(paint.value.assetId) : undefined,
);
const patternPreviews = new Map<PicturePatternPreset, string>();
function patternPreview(preset: PicturePatternPreset) {
  const cached = patternPreviews.get(preset);
  if (cached) return cached;
  const sampler = createPicturePatternSampler(preset);
  let rectangles = "";
  for (let y = 0; y < 24; y++)
    for (let x = 0; x < 28; x++) {
      const alpha = sampler.sample(x, y);
      if (alpha > 0)
        rectangles += `<rect x="${x}" y="${y}" width="1" height="1" opacity="${alpha.toFixed(3)}"/>`;
    }
  const url = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="24"><rect width="28" height="24" fill="white"/><g fill="black">${rectangles}</g></svg>`)}`;
  patternPreviews.set(preset, url);
  return url;
}
</script>
<template>
  <div ref="editorRoot" class="picture-paint-editor">
    <Teleport to="body">
      <div ref="modePopupHost" data-picture-paint-mode-popup />
      <div ref="imageLayoutHost" data-picture-paint-image-popup="layout" />
      <div ref="tileAlignHost" data-picture-paint-image-popup="alignment" />
      <div ref="mirrorHost" data-picture-paint-image-popup="mirror" />
    </Teleport>
    <PictureFormatField :label="t(paintRole === 'line' ? 'lineMode' : 'paintMode')"
      ><TSelect
        v-native-control="modeNativeControl"
        :key="ownerKey"
        :model-value="mode"
        :options="modes"
        :popup-visible="modePopupVisible"
        :popup-props="modePopupProps"
        :disabled="disabled"
        size="small"
        :aria-label="t(paintRole === 'line' ? 'lineMode' : 'paintMode')"
        @change="changeMode"
        @popup-visible-change="changeModePopupVisible"
    /></PictureFormatField>
    <template v-if="paint">
      <p
        v-if="paintRole !== 'line' && showContextHelp !== false"
        class="picture-paint-editor__source"
      >
        {{ t("paintBehindSourceHelp") }}
      </p>
      <PicturePaintColor
        v-if="paint.kind === 'solid'"
        :value="paint.color"
        :label="t(paintRole === 'line' ? 'lineColor' : 'paintColor')"
        :automatic-label="t('automatic')"
        :disabled="disabled"
        :on-commit="(color) => paint?.kind === 'solid' && commit({ ...paint, color })"
      />
      <PictureGradientEditor
        v-if="paint.kind === 'linear' || paint.kind === 'radial' || paint.kind === 'rectangular'"
        :owner-key="owner"
        :value="paint"
        :disabled="disabled"
        :t="t"
        :on-commit="commit"
      />
      <template v-if="paint.kind === 'pattern'">
        <PictureFormatField :label="t('patternPreset')" stacked
          ><div
            class="picture-paint-editor__patterns"
            role="group"
            :aria-label="t('patternPreset')"
          >
            <button
              v-for="preset in PICTURE_PATTERN_PRESETS"
              :key="preset"
              type="button"
              :title="t(PICTURE_PATTERN_LABELS[preset])"
              :aria-label="t(PICTURE_PATTERN_LABELS[preset])"
              :aria-pressed="paint.preset === preset"
              :disabled="disabled"
              @click="paint?.kind === 'pattern' && commit({ ...paint, preset })"
            >
              <img :src="patternPreview(preset)" alt="" />
            </button></div
        ></PictureFormatField>
        <PicturePaintColor
          :value="paint.foreground"
          :label="t('patternForeground')"
          :automatic-label="t('automatic')"
          :disabled="disabled"
          :on-commit="(foreground) => paint?.kind === 'pattern' && commit({ ...paint, foreground })"
        />
        <PicturePaintColor
          :value="paint.background"
          :label="t('patternBackground')"
          :automatic-label="t('automatic')"
          :disabled="disabled"
          :on-commit="(background) => paint?.kind === 'pattern' && commit({ ...paint, background })"
        />
      </template>
      <template v-if="paint.kind === 'picture'">
        <p class="picture-paint-editor__source">{{ t("paintSourceReady") }}</p>
        <PictureTextureGallery
          :owner-key="ownerKey"
          :selected="selectedTexture"
          :disabled="disabled || !loadAsset"
          :t="t"
          :on-select="texture"
        />
        <div class="picture-paint-editor__actions">
          <TButton
            variant="outline"
            size="small"
            :disabled="disabled || !loadAsset"
            @click="fileInput?.click()"
            >{{ t("paintLocalFile") }}</TButton
          ><TButton
            variant="text"
            size="small"
            :disabled="disabled || !loadAsset"
            @click="clipboard"
            >{{ t("paintClipboard") }}</TButton
          >
        </div>
        <PictureFormatField :label="t('paintLayout')"
          ><TSelect
            v-native-control="imageNative.layout"
            :popup-visible="imageLayoutPopup.visible.value"
            :popup-props="imageLayoutPopup.popupProps"
            @popup-visible-change="imageLayoutPopup.onVisibleChange.value"
            :model-value="paint.layout.kind"
            :options="[
              { value: 'stretch', label: t('paintStretch') },
              { value: 'tile', label: t('paintTile') },
            ]"
            :disabled="disabled"
            size="small"
            :aria-label="t('paintLayout')"
            @change="imageActions.layout"
        /></PictureFormatField>
        <template v-if="paint.layout.kind === 'tile'">
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintOffsetX',
                paint.layout.offsetXPt,
                (offsetXPt) => editTile({ offsetXPt }),
                -4096,
                4096,
              )
            "
            unit="pt"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintOffsetY',
                paint.layout.offsetYPt,
                (offsetYPt) => editTile({ offsetYPt }),
                -4096,
                4096,
              )
            "
            unit="pt"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintScaleX',
                paint.layout.scaleX * 100,
                (value) => editTile({ scaleX: value / 100 }),
                0.001,
                1600,
              )
            "
            unit="%"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintScaleY',
                paint.layout.scaleY * 100,
                (value) => editTile({ scaleY: value / 100 }),
                0.001,
                1600,
              )
            "
            unit="%"
          />
          <PictureFormatField :label="t('paintAlignment')"
            ><TSelect
              v-native-control="imageNative.alignment"
              :popup-visible="tileAlignPopup.visible.value"
              :popup-props="tileAlignPopup.popupProps"
              @popup-visible-change="tileAlignPopup.onVisibleChange.value"
              :model-value="paint.layout.anchor"
              :options="anchorOptions"
              :disabled="disabled"
              size="small"
              :aria-label="t('paintAlignment')"
              @change="imageActions.alignment"
          /></PictureFormatField>
          <PictureFormatField :label="t('paintMirror')"
            ><TSelect
              v-native-control="imageNative.mirror"
              :popup-visible="mirrorPopup.visible.value"
              :popup-props="mirrorPopup.popupProps"
              @popup-visible-change="mirrorPopup.onVisibleChange.value"
              :model-value="paint.layout.flip"
              :options="flipOptions"
              :disabled="disabled"
              size="small"
              :aria-label="t('paintMirror')"
              @change="imageActions.mirror"
          /></PictureFormatField>
        </template>
        <template v-else-if="stretch">
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintStretchLeft',
                stretch.left,
                (value) => stretchSide('left', value),
                -1600,
                1600,
              )
            "
            unit="%"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintStretchRight',
                stretch.right,
                (value) => stretchSide('right', value),
                -1600,
                1600,
              )
            "
            unit="%"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintStretchTop',
                stretch.top,
                (value) => stretchSide('top', value),
                -1600,
                1600,
              )
            "
            unit="%"
          />
          <PicturePaintNumber
            v-bind="
              numberProps(
                'paintStretchBottom',
                stretch.bottom,
                (value) => stretchSide('bottom', value),
                -1600,
                1600,
              )
            "
            unit="%"
          />
        </template>
      </template>
      <PicturePaintNumber
        v-bind="
          numberProps(
            'paintOpacity',
            (1 - paint.opacity) * 100,
            (value) => !!paint && commit({ ...paint, opacity: 1 - value / 100 }),
            0,
            100,
          )
        "
        :display-precision="12"
        unit="%"
      />
      <TCheckbox
        v-if="paint.kind !== 'solid'"
        :model-value="paint.rotateWithShape"
        :disabled="disabled"
        @change="
          (rotateWithShape) =>
            typeof rotateWithShape === 'boolean' &&
            paint?.kind !== 'solid' &&
            !!paint &&
            commit({ ...paint, rotateWithShape })
        "
        >{{ t("paintRotate") }}</TCheckbox
      >
    </template>
    <input
      ref="fileInput"
      type="file"
      :accept="SUPPORTED_IMAGE_FILE_ACCEPT"
      hidden
      :disabled="disabled || !loadAsset"
      @change="chooseFile"
    />
    <p v-if="busy" role="status">{{ t("paintSourceLoading") }}</p>
    <p v-if="sourceError" role="alert" class="picture-paint-editor__error">{{ sourceError }}</p>
  </div>
</template>
<style scoped lang="scss">
@use "../../../../shared/gallery/gallery-choice" as gallery;

.picture-paint-editor {
  display: grid;
  gap: 10px;
  min-width: 0;
  &__patterns {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 6px;
    max-height: 236px;
    overflow: auto;
    padding: 3px;
  }
  &__patterns button {
    @include gallery.choice(2px);

    display: grid;
    place-items: center;
    height: 34px;
  }
  &__patterns img {
    width: 28px;
    height: 24px;
    max-width: 100%;
  }
  &__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  &__source {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    margin: 0;
    color: var(--sheetcraft-text-primary);
  }
}
</style>
