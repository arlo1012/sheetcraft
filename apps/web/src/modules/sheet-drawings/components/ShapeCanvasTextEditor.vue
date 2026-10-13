<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useId, watch, type CSSProperties } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import {
  getShapeTextCharacterSegments,
  getShapeTextCharacterOverride,
  type ShapeTextCharacterFormat,
} from "@sheetcraft/core/shape-text-character-runs";
import type { ShapeTextRichDraft } from "../shape-text-edit-model";
import { shapeTextDraftSource } from "../shape-text-edit-model";
import { drawingShapeTextBaseCharacterFormat } from "../shape-text-options";
import ShapeRichTextInput from "./ShapeRichTextInput.vue";
import type { SheetGraphicDrawing } from "@sheetcraft/core/sheet-drawings";
import FloatingPanelSurface from "../../../shared/floating/FloatingPanelSurface.vue";
import { useFloatingPanel } from "../../../shared/floating/useFloatingPanel";
import { materializeDrawingShapeText } from "../shape-text-options";
import { layoutDrawingShapeText } from "../shape-text-runtime";
import {
  shapeCanvasTextBlockStyle,
  shapeCanvasTextEditorStyle,
} from "../shape-canvas-text-editor-style";

defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    drawing: SheetGraphicDrawing;
    sessionId: number;
    draft: string;
    locale?: "zh-CN" | "en-US";
    disabled?: boolean;
    composing?: boolean;
    stale?: boolean;
    error?: string;
    frameStyle?: CSSProperties;
    textareaStyle?: CSSProperties;
    toolbarStyle?: CSSProperties;
    scale?: number;
    update: (text: string) => boolean;
    rich?: boolean;
    pendingFormat?: ShapeTextCharacterFormat;
    updateRich?: (value: ShapeTextRichDraft) => boolean;
    format?: (patch: ShapeTextCharacterFormat) => boolean;
    setSelection?: (
      selection: { start: number; end: number; direction: "forward" | "backward" | "none" },
      pendingFormat?: ShapeTextCharacterFormat,
    ) => boolean;
    composition: (active: boolean) => boolean;
    commit: () => boolean;
    cancel: () => void;
    escape?: () => boolean | void;
    initialSelection?: {
      start: number;
      end: number;
      direction?: "forward" | "backward" | "none";
    };
  }>(),
  { locale: "en-US", disabled: false, composing: false, stale: false, scale: 1 },
);
const emit = defineEmits<{ requestCommit: [reason: "blur"] }>();
const root = ref<HTMLElement>();
const input = ref<HTMLTextAreaElement>();
const richInput = ref<InstanceType<typeof ShapeRichTextInput>>();
const editableElement = computed(() => richInput.value?.rootElement ?? input.value);
const surface = ref<InstanceType<typeof FloatingPanelSurface>>();
const toolbar = computed(() => surface.value?.rootElement ?? null);
const { floatingStyles } = useFloatingPanel(
  computed(() => editableElement.value ?? null),
  toolbar,
  computed(() => !!editableElement.value),
  { placement: "bottom-end", offset: 6 },
);
const errorId = `shape-canvas-text-error-${useId()}`;
const localDraft = ref(props.draft);
const localComposing = ref(false);
const localFailure = ref<string>();
const readOnly = computed(() => props.disabled || props.stale);
const composing = computed(() => localComposing.value || props.composing);
const textOptions = computed(() => materializeDrawingShapeText(props.drawing));
const blockStyle = computed(() => {
  try {
    return shapeCanvasTextBlockStyle(
      props.drawing,
      layoutDrawingShapeText({ ...props.drawing, text: localDraft.value }),
      props.scale,
    );
  } catch {
    // Keep the editable recovery surface. The genuine commit preflight reports
    // missing native/font resources and retains the complete draft on failure.
    return {};
  }
});
const style = computed(() => [
  shapeCanvasTextEditorStyle(props.drawing, props.scale),
  blockStyle.value,
  props.textareaStyle,
]);
const labels = computed(() =>
  props.locale === "zh-CN"
    ? {
        text: "编辑形状文本",
        actions: "形状文本操作",
        apply: "应用",
        cancel: "取消",
        rejected: "无法应用更改。已保留你的文本。",
        stale: "此形状或选区已更改。你可以复制保留的文本。",
      }
    : {
        text: "Edit shape text",
        actions: "Shape text actions",
        apply: "Apply",
        cancel: "Cancel",
        rejected: "The change could not be applied. Your text has been kept.",
        stale: "The shape or selection changed. You can copy the retained text.",
      },
);
const failure = computed(
  () => props.error || (props.stale ? labels.value.stale : localFailure.value),
);
let lastPublished = props.draft;
let blurPending = false;
let selection = {
  start: props.draft.length,
  end: props.draft.length,
  direction: "none" as const,
} as {
  start: number;
  end: number;
  direction: "forward" | "backward" | "none";
};

function captureSelection(): void {
  if (richInput.value) {
    selection = richInput.value.captureSelection();
    return;
  }
  const element = input.value;
  if (!element) return;
  selection = {
    start: element.selectionStart,
    end: element.selectionEnd,
    direction: element.selectionDirection,
  };
  props.setSelection?.(selection);
}
function focus(expectedSession = props.sessionId): void {
  if (expectedSession !== props.sessionId) return;
  if (richInput.value) {
    richInput.value.focus(selection);
    return;
  }
  if (!input.value) return;
  const element = input.value;
  element.focus({ preventScroll: true });
  const limit = element.value.length;
  element.setSelectionRange(
    Math.min(selection.start, limit),
    Math.min(selection.end, limit),
    selection.direction,
  );
}
function owns(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) return false;
  if (root.value?.contains(target) || toolbar.value?.contains(target)) return true;
  // A pane and its explicitly ARIA-controlled popups belong to this draft owner.
  // Generic menus never qualify, so unrelated worksheet interactions still commit.
  const owner = `[data-shape-text-edit-session="${props.sessionId}"]`;
  if (target instanceof Element && target.closest(owner)) return true;
  for (const control of document.querySelectorAll(`${owner} [aria-controls]`))
    for (const id of (control.getAttribute("aria-controls") ?? "").split(/\s+/))
      if (id && document.getElementById(id)?.contains(target)) return true;
  return false;
}
function reset(): void {
  localDraft.value = props.draft;
  lastPublished = props.draft;
  localFailure.value = undefined;
  localComposing.value = false;
  blurPending = false;
  selection = props.initialSelection
    ? { ...props.initialSelection, direction: props.initialSelection.direction ?? "none" }
    : { start: props.draft.length, end: props.draft.length, direction: "none" };
  const sessionId = props.sessionId;
  void nextTick(() => focus(sessionId));
}
watch(() => props.sessionId, reset);
watch(
  () => props.rich,
  () => {
    const id = props.sessionId;
    void nextTick(() => focus(id));
  },
);
onMounted(reset);

// Rich transactions need stable bridges for the whole edit lease. A parent may
// refresh Apply/Escape actions after a rejected blur without replacing that lease.
const richActions = computed(() => {
  const sessionId = props.sessionId,
    updateRich = props.updateRich,
    setSelection = props.setSelection,
    composition = props.composition;
  const current = () => sessionId === props.sessionId;
  return {
    update: (value: ShapeTextRichDraft) => current() && !!updateRich?.(value),
    selection: (value: Pick<ShapeTextRichDraft, "selection" | "pendingFormat">) => {
      if (current()) {
        selection = value.selection;
        setSelection?.(value.selection, value.pendingFormat);
      }
    },
    composition: (active: boolean) => {
      if (!current()) return false;
      localComposing.value = active;
      const accepted = composition(active);
      if (!active) void nextTick(() => actions.value.finishCompositionBlur());
      return accepted;
    },
    error: (message: string | undefined) => {
      if (current()) localFailure.value = message;
    },
  };
});
// Handlers retain their exact owner. Old saved handlers cannot edit a new session.
const actions = computed(() => {
  const sessionId = props.sessionId;
  const update = props.update;
  const composition = props.composition;
  const commit = props.commit;
  const cancel = props.cancel;
  const escape = props.escape;
  const format = props.format;
  const current = () => sessionId === props.sessionId;
  const currentInput = (event: Event) => current() && event.target === input.value;
  function publish(value: string): boolean {
    if (!current()) return false;
    localDraft.value = value;
    captureSelection();
    if (value === lastPublished) return true;
    if (readOnly.value) return false;
    try {
      if (!update(value)) {
        localFailure.value = labels.value.rejected;
        return false;
      }
      lastPublished = value;
      localFailure.value = undefined;
      return true;
    } catch (error) {
      localFailure.value = error instanceof Error ? error.message : labels.value.rejected;
      return false;
    }
  }
  function requestBlurCommit(): void {
    if (!current() || !blurPending || composing.value || owns(document.activeElement)) return;
    blurPending = false;
    if (readOnly.value) return;
    if (richInput.value ? !richInput.value.flush() : input.value && !publish(input.value.value)) {
      void nextTick(() => focus(sessionId));
      return;
    }
    emit("requestCommit", "blur");
  }
  function apply(): void {
    if (!current() || readOnly.value || composing.value) return;
    captureSelection();
    blurPending = false;
    if (richInput.value ? !richInput.value.flush() : !input.value || !publish(input.value.value)) {
      void nextTick(() => focus(sessionId));
      return;
    }
    localFailure.value = undefined;
    try {
      if (commit()) return;
      localFailure.value = labels.value.rejected;
    } catch (error) {
      localFailure.value = error instanceof Error ? error.message : labels.value.rejected;
    }
    void nextTick(() => focus(sessionId));
  }
  return {
    input: (event: Event) => {
      event.stopPropagation();
      if (currentInput(event) && event.target instanceof HTMLTextAreaElement)
        publish(event.target.value);
    },
    compositionStart: (event: CompositionEvent) => {
      event.stopPropagation();
      if (!currentInput(event)) return;
      localComposing.value = true;
      composition(true);
    },
    compositionEnd: (event: CompositionEvent) => {
      event.stopPropagation();
      if (!currentInput(event)) return;
      if (event.target instanceof HTMLTextAreaElement) publish(event.target.value);
      localComposing.value = false;
      composition(false);
      // Browsers may send one final input after compositionend. publish dedupes
      // that same value; deferring blur keeps the final text and caret together.
      void nextTick(requestBlurCommit);
    },
    focusout: (event: FocusEvent) => {
      event.stopPropagation();
      if (!current() || !owns(event.target)) return;
      captureSelection();
      if (owns(event.relatedTarget)) return;
      blurPending = true;
      void nextTick(requestBlurCommit);
    },
    focusin: () => {
      if (current()) blurPending = false;
    },
    keydown: (event: KeyboardEvent) => {
      event.stopPropagation();
      if (
        !current() ||
        !owns(event.target) ||
        composing.value ||
        event.isComposing ||
        event.keyCode === 229
      )
        return;
      const property =
        event.key.toLowerCase() === "b"
          ? "bold"
          : event.key.toLowerCase() === "i"
            ? "italic"
            : event.key.toLowerCase() === "u"
              ? "underline"
              : undefined;
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        property &&
        format &&
        !readOnly.value
      ) {
        event.preventDefault();
        captureSelection();
        const source = shapeTextDraftSource(props.drawing),
          base = drawingShapeTextBaseCharacterFormat(props.drawing);
        const candidates =
          selection.start === selection.end
            ? [
                {
                  ...base,
                  ...(props.pendingFormat ??
                    getShapeTextCharacterOverride(source, selection.start)),
                },
              ]
            : getShapeTextCharacterSegments(source, base).filter(
                (run) => run.start < selection.end && run.end > selection.start,
              );
        if (!format({ [property]: !candidates.every((run) => run[property] === true) }))
          localFailure.value = labels.value.rejected;
      } else if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        apply();
      } else if (event.key === "Escape" && escape && !readOnly.value) {
        event.preventDefault();
        captureSelection();
        blurPending = false;
        if (richInput.value ? richInput.value.flush() : input.value && publish(input.value.value)) {
          localFailure.value = undefined;
          try {
            if (escape() !== false) return;
            localFailure.value = labels.value.rejected;
          } catch (error) {
            localFailure.value = error instanceof Error ? error.message : labels.value.rejected;
          }
        }
        void nextTick(() => focus(sessionId));
      }
      // Enter, deletion, movement, clipboard shortcuts and native Undo/Redo are
      // deliberately left to this textarea, never the workbook shortcut owner.
    },
    captureSelection: (event: Event) => {
      if (currentInput(event)) captureSelection();
    },
    keyup: (event: KeyboardEvent) => {
      event.stopPropagation();
      if (currentInput(event)) captureSelection();
    },
    preserveSelection: (event: PointerEvent) => {
      event.stopPropagation();
      event.preventDefault();
      if (current()) captureSelection();
    },
    finishCompositionBlur: requestBlurCommit,
    apply,
    cancel: () => {
      if (!current()) return;
      blurPending = false;
      cancel();
    },
  };
});

// v-on maps bind the captured functions directly. Cached inline member handlers
// otherwise resolve the latest actions when a detached old element fires late.
const inputEvents = computed(() => ({
  input: actions.value.input,
  keydown: actions.value.keydown,
  keyup: actions.value.keyup,
  select: actions.value.captureSelection,
  compositionstart: actions.value.compositionStart,
  compositionend: actions.value.compositionEnd,
}));
const frameEvents = computed(() => ({
  keydown: actions.value.keydown,
  focusout: actions.value.focusout,
  focusin: actions.value.focusin,
}));
const toolbarEvents = computed(() => ({
  ...frameEvents.value,
  keydown: actions.value.keydown,
}));
const applyEvents = computed(() => ({
  pointerdown: actions.value.preserveSelection,
  click: actions.value.apply,
}));
const cancelEvents = computed(() => ({
  pointerdown: actions.value.preserveSelection,
  click: actions.value.cancel,
}));

defineExpose({ focus });
</script>

<template>
  <div
    :key="sessionId"
    ref="root"
    v-on="frameEvents"
    class="shape-canvas-text-editor"
    :style="frameStyle"
    :data-shape-text-edit-session="sessionId"
    data-shape-canvas-text-editor
    @pointerdown.stop
    @pointerup.stop
    @mousedown.stop
    @mouseup.stop
    @click.stop
    @dblclick.stop
    @contextmenu.stop
    @wheel.stop
    @copy.stop
    @cut.stop
    @paste.stop
    @dragstart.stop
    @dragover.stop
    @drop.stop
    @beforeinput.stop
    @keypress.stop
  >
    <ShapeRichTextInput
      v-if="rich"
      ref="richInput"
      :key="`${sessionId}-rich`"
      :session-id="sessionId"
      :source="shapeTextDraftSource(drawing)"
      :base-format="drawingShapeTextBaseCharacterFormat(drawing)"
      :pending-format="pendingFormat"
      :selection="
        initialSelection
          ? { ...initialSelection, direction: initialSelection.direction ?? 'none' }
          : selection
      "
      :read-only="readOnly"
      :ariaLabel="labels.text"
      :style="[
        style,
        { lineHeight: textOptions.paragraph.lineSpacing.kind === 'normal' ? 'normal' : undefined },
      ]"
      class="shape-canvas-text-editor__input"
      :data-shape-text-edit-session="sessionId"
      data-shape-canvas-text-input
      :update="richActions.update"
      :composition="richActions.composition"
      v-on="{ selection: richActions.selection, error: richActions.error }"
    />
    <textarea
      v-else
      :key="sessionId"
      ref="input"
      v-on="inputEvents"
      class="shape-canvas-text-editor__input"
      :value="localDraft"
      :style="style"
      :readonly="readOnly"
      :wrap="textOptions.layout.wrap ? 'soft' : 'off'"
      :aria-label="labels.text"
      :aria-describedby="failure ? errorId : undefined"
      :aria-invalid="failure ? true : undefined"
      aria-keyshortcuts="Control+Enter Meta+Enter Escape"
      :data-shape-text-edit-session="sessionId"
      data-shape-canvas-text-input
      rows="1"
      maxlength="100000"
      autocomplete="off"
      autocapitalize="off"
      :spellcheck="false"
    />
  </div>
  <Teleport to="body">
    <FloatingPanelSurface
      :key="sessionId"
      ref="surface"
      v-on="toolbarEvents"
      class="shape-canvas-text-editor__toolbar"
      :label="labels.actions"
      role="group"
      padding="compact"
      layer="toolbar"
      :scrollable="false"
      :style="[floatingStyles, toolbarStyle]"
      data-shape-canvas-text-toolbar
      :data-shape-text-edit-session="sessionId"
      @pointerdown.stop
      @mousedown.stop
      @click.stop
      @dblclick.stop
      @copy.stop
      @cut.stop
      @paste.stop
      @keyup.stop
      @keypress.stop
    >
      <div class="shape-canvas-text-editor__actions">
        <Button
          size="small"
          theme="default"
          variant="base"
          data-shape-text-action="cancel"
          v-on="cancelEvents"
          >{{ labels.cancel }}</Button
        >
        <Button
          size="small"
          theme="primary"
          variant="base"
          :disabled="readOnly || composing"
          data-shape-text-action="apply"
          v-on="applyEvents"
          >{{ labels.apply }}</Button
        >
      </div>
      <p v-if="failure" :id="errorId" class="shape-canvas-text-editor__failure" role="alert">
        {{ failure }}
      </p>
    </FloatingPanelSurface>
  </Teleport>
</template>

<style scoped lang="scss">
.shape-canvas-text-editor {
  position: absolute;
  pointer-events: auto;

  &__input {
    position: absolute;
    left: 0;
    top: 0;
    display: block;
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    margin: 0;
    border: 0;
    border-radius: 0;
    outline: 1px solid var(--sheetcraft-action-primary);
    outline-offset: -1px;
    background: transparent;
    caret-color: currentColor;
    resize: none;
    overflow: auto;
    overscroll-behavior: contain;
  }
  &__toolbar {
    width: max-content;
  }
  &__actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--sheetcraft-space-2);
  }
  &__failure {
    max-width: 280px;
    margin: var(--sheetcraft-space-2) 0 0;
    color: var(--sheetcraft-text-primary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }
}
</style>
