<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { Button } from "tdesign-vue-next/es/button";
import { Dialog } from "tdesign-vue-next/es/dialog";
import { Input as TInput } from "tdesign-vue-next/es/input";
import { Textarea } from "tdesign-vue-next/es/textarea";
import { FunctionSquare } from "lucide-vue-next";
import { useAppI18n } from "../../../shared/i18n";
import FormulaInputAssist from "../../../shared/formula-editing/FormulaInputAssist.vue";
import FormulaTextOverlay from "../../../shared/formula-editing/FormulaTextOverlay.vue";
import { completeFormulaForCommit } from "../../../shared/formula-editing/formula-commit";
import { insertFormulaFunction } from "../../../shared/formula-editing/formula-function-insertion";
import {
  getFormulaArgumentContext,
  getSupportedFormulaFunction,
} from "../../../shared/formula-editing/formula-input-lexical";
import { getFormulaReferenceTokens } from "../../../shared/formula-editing/formula-reference-tokens";
import { vNativeControl } from "../../../shared/tdesign/native-control";
import {
  appendFormulaEditorArgument,
  getFormulaEditorRootCall,
  replaceFormulaEditorArgument,
} from "../formula-editor-arguments";
import FormulaFunctionBrowser from "./FormulaFunctionBrowser.vue";

const props = withDefaults(
  defineProps<{
    visible: boolean;
    value: string;
    targetLabel: string;
    previewValue: string;
    editSessionId: string;
    recentFunctions?: readonly string[];
    error?: string;
  }>(),
  { recentFunctions: () => [], error: undefined },
);

const emit = defineEmits<{
  change: [value: string];
  confirm: [];
  close: [];
  composing: [value: boolean];
}>();

const { t } = useAppI18n();
const input = ref<HTMLTextAreaElement>();
const inputAssist = ref<InstanceType<typeof FormulaInputAssist>>();
const focused = ref(false);
const composing = ref(false);
const functionBrowserVisible = ref(false);
const selectionVersion = ref(0);
const localMessage = ref("");

const references = computed(() =>
  focused.value && props.value.startsWith("=") && !composing.value
    ? getFormulaReferenceTokens(props.value)
    : [],
);
const currentFunction = computed(() => {
  void selectionVersion.value;
  const caret = input.value?.selectionStart ?? props.value.length;
  const context = getFormulaArgumentContext(props.value, caret);
  return context ? getSupportedFormulaFunction(context.functionName) : undefined;
});
const currentArgument = computed(() => {
  void selectionVersion.value;
  const caret = input.value?.selectionStart ?? props.value.length;
  return getFormulaArgumentContext(props.value, caret);
});
const currentArgumentLabel = computed(() => {
  const functionInfo = currentFunction.value;
  const argument = currentArgument.value;
  if (!functionInfo || !argument) return "";
  const metadata = functionInfo.arguments.at(
    Math.min(argument.index, Math.max(0, functionInfo.arguments.length - 1)),
  );
  return metadata
    ? t("formulaAssist.argument", {
        function: functionInfo.name,
        index: argument.index + 1,
        name: t(`formulaArguments.${metadata.name}`),
      })
    : "";
});
const rootCall = computed(() => getFormulaEditorRootCall(props.value));
const rootFunction = computed(() => {
  const call = rootCall.value;
  return call ? getSupportedFormulaFunction(call.name) : undefined;
});
const displayedFunction = computed(() => currentFunction.value ?? rootFunction.value);
const rootArguments = computed(() => {
  const call = rootCall.value;
  const functionInfo = rootFunction.value;
  if (!call || !functionInfo) return [];
  const count = Math.max(
    call.arguments.length,
    functionInfo.arguments.length,
    functionInfo.maxArgs === null ? 1 : 0,
  );
  return Array.from({ length: count }, (_, index) => {
    const metadata = functionInfo.arguments[index];
    const baseLabel = metadata ? t(`formulaArguments.${metadata.name}`) : t("formulaTools.value");
    return {
      index,
      value: call.arguments[index]?.value ?? "",
      label: metadata ? baseLabel : `${baseLabel} ${index + 1}`,
      optional: metadata?.optional ?? index >= functionInfo.minArgs,
    };
  });
});

function setInput(element: HTMLInputElement | HTMLTextAreaElement | null): void {
  input.value = element instanceof HTMLTextAreaElement ? element : undefined;
}

function captureSelection(): void {
  selectionVersion.value += 1;
}

function focusEditor(): void {
  void nextTick(() => {
    input.value?.focus({ preventScroll: true });
    const caret = input.value?.value.length ?? 0;
    input.value?.setSelectionRange(caret, caret);
    captureSelection();
  });
}

function onInput(event: Event): void {
  localMessage.value = "";
  emit("change", (event.target as HTMLTextAreaElement).value);
  void nextTick(captureSelection);
}

function applyTextEdit(edit: { value: string; caret: number }): void {
  localMessage.value = "";
  emit("change", edit.value);
  void nextTick(() => {
    input.value?.focus({ preventScroll: true });
    input.value?.setSelectionRange(edit.caret, edit.caret);
    captureSelection();
  });
}

function insertFunction(name: string): void {
  functionBrowserVisible.value = false;
  const selection = {
    start: input.value?.selectionStart ?? props.value.length,
    end: input.value?.selectionEnd ?? props.value.length,
  };
  const edit = insertFormulaFunction(props.value, selection, name);
  if (edit) {
    applyTextEdit({ ...edit, value: completeFormulaForCommit(edit.value) });
    return;
  }
  if (!props.value.trim() || !props.value.trimStart().startsWith("=")) {
    applyTextEdit({
      value: completeFormulaForCommit(`=${name}(`),
      caret: name.length + 2,
    });
    return;
  }
  localMessage.value = t("formulaTools.formulaEditorInsertUnavailable");
}

function onArgumentInput(index: number, replacement: unknown): void {
  if (typeof replacement !== "string" && typeof replacement !== "number") return;
  const nextValue = String(replacement);
  const call = rootCall.value;
  if (!call || !nextValue.trim()) return;
  const existing = call.arguments[index];
  const next = existing
    ? replaceFormulaEditorArgument(props.value, existing, nextValue)
    : index === call.arguments.length
      ? appendFormulaEditorArgument(props.value, call, nextValue)
      : null;
  if (next) {
    localMessage.value = "";
    emit("change", next);
  }
}

function onConfirm(): void {
  if (!composing.value) emit("confirm");
}

function onClose(): void {
  if (!composing.value) emit("close");
}

function onKeydown(event: KeyboardEvent): void {
  if (inputAssist.value?.handleKeydown(event)) return;
  if (
    event.key === "Enter" &&
    (event.ctrlKey || event.metaKey) &&
    !event.isComposing &&
    !composing.value
  ) {
    event.preventDefault();
    onConfirm();
  }
}

function onCompositionStart(): void {
  composing.value = true;
  emit("composing", true);
}

function onCompositionEnd(event: CompositionEvent): void {
  const value = (event.target as HTMLTextAreaElement).value;
  if (value !== props.value) emit("change", value);
  composing.value = false;
  emit("composing", false);
  void nextTick(captureSelection);
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) focusEditor();
    else {
      focused.value = false;
      composing.value = false;
      functionBrowserVisible.value = false;
    }
  },
);
</script>

<template>
  <Dialog
    v-if="visible"
    class="formula-editor-dialog"
    :visible="visible"
    :header="t('formulaTools.formulaEditor')"
    width="min(720px, calc(100vw - 32px))"
    placement="center"
    :close-on-overlay-click="false"
    :confirm-on-enter="false"
    :confirm-btn="{
      content: t('formulaTools.editorConfirm'),
      disabled: composing,
    }"
    :cancel-btn="t('formulaTools.cancel')"
    :data-cell-edit-session="editSessionId"
    @confirm="onConfirm"
    @close="onClose"
  >
    <div class="formula-editor-dialog__content" :data-cell-edit-session="editSessionId">
      <div class="formula-editor-dialog__heading">
        <div class="formula-editor-dialog__context">
          <label for="formula-editor-input">{{ t("formulaTools.formulaEditorInput") }}</label>
          <span class="formula-editor-dialog__target">
            {{ t("formulaTools.formulaEditorTarget") }}
            <strong>{{ targetLabel }}</strong>
          </span>
        </div>
        <Button
          variant="text"
          size="small"
          :aria-label="t('formulaTools.formulaEditorEditFunction')"
          @click="functionBrowserVisible = true"
        >
          <template #icon><FunctionSquare :size="15" aria-hidden="true" /></template>
          {{ t("formulaTools.formulaEditorEditFunction") }}
        </Button>
      </div>

      <div class="formula-editor-dialog__body narrow-scrollbar">
        <section class="formula-editor-dialog__editor" :data-cell-edit-session="editSessionId">
          <div class="formula-editor-dialog__textarea-wrap">
            <Textarea
              v-native-control="{
                onElement: setInput,
                attributes: {
                  ...inputAssist?.inputAria,
                  id: 'formula-editor-input',
                  'aria-describedby': 'formula-editor-shortcut',
                  'data-cell-edit-session': editSessionId,
                  'data-formula-editor-input': '',
                  autocomplete: 'off',
                  spellcheck: false,
                },
              }"
              class="idea-formula-editor-textarea"
              :class="{ 'has-formula-colors': references.length > 0 }"
              :value="value"
              :autosize="{ minRows: 4, maxRows: 8 }"
              @input="onInput"
              @focus="focused = true"
              @blur="focused = false"
              @keydown="(_value, { e }) => onKeydown(e)"
              @select="captureSelection"
              @keyup="captureSelection"
              @click="captureSelection"
              @compositionstart="onCompositionStart"
              @compositionend="onCompositionEnd"
            />
            <FormulaTextOverlay
              :input="input"
              :value="value"
              :references="references"
              :active="references.length > 0"
            />
            <FormulaInputAssist
              ref="inputAssist"
              :value="value"
              :input="input"
              :active="focused"
              :composing="composing"
              :z-index="2600"
              @text-edit="applyTextEdit"
            />
          </div>
          <p id="formula-editor-shortcut" class="formula-editor-dialog__hint">
            {{ t("formulaTools.formulaEditorConfirmHint") }}
          </p>
        </section>

        <section v-if="rootArguments.length" class="formula-editor-dialog__arguments">
          <div class="formula-editor-dialog__section-heading">
            <span>{{ t("formulaTools.formulaEditorArguments") }}</span>
            <strong>{{ rootFunction?.name }}</strong>
          </div>
          <div class="formula-editor-dialog__argument-fields">
            <label v-for="argument in rootArguments" :key="argument.index">
              <span>{{ argument.label }}{{ argument.optional ? "" : " *" }}</span>
              <TInput
                v-native-control="{
                  attributes: { 'aria-label': argument.label },
                }"
                :value="argument.value"
                :placeholder="argument.optional ? t('formulaTools.value') : undefined"
                :data-formula-editor-argument="argument.index"
                @change="onArgumentInput(argument.index, $event)"
              />
            </label>
          </div>
        </section>

        <section class="formula-editor-dialog__details">
          <template v-if="displayedFunction">
            <div class="formula-editor-dialog__section-heading">
              <span>{{ t("formulaTools.formulaEditorFunctionHelp") }}</span>
              <strong>{{ displayedFunction.name }}</strong>
            </div>
            <code class="formula-editor-dialog__signature">{{
              t(`formulaFunctions.${displayedFunction.name}.signature`)
            }}</code>
            <p>{{ t(`formulaFunctions.${displayedFunction.name}.description`) }}</p>
            <p class="formula-editor-dialog__example">
              {{ t("formulaTools.example") }}：<code>{{
                t(`formulaFunctions.${displayedFunction.name}.example`)
              }}</code>
            </p>
            <p v-if="currentArgumentLabel" class="formula-editor-dialog__argument">
              {{ currentArgumentLabel }}
            </p>
          </template>
          <p v-else>{{ t("formulaTools.formulaEditorNoFunction") }}</p>
        </section>
      </div>

      <div class="formula-editor-dialog__result">
        <span>{{ t("formulaTools.formulaEditorPreview") }}</span>
        <output class="narrow-scrollbar" :aria-label="t('formulaTools.formulaEditorPreview')">{{
          previewValue || "—"
        }}</output>
      </div>
      <p v-if="error || localMessage" class="formula-editor-dialog__error" role="alert">
        {{ error || localMessage }}
      </p>
    </div>
  </Dialog>

  <FormulaFunctionBrowser
    :visible="functionBrowserVisible"
    :recent-functions="recentFunctions"
    :edit-session-id="editSessionId"
    @insert-function="insertFunction"
    @close="functionBrowserVisible = false"
  />
</template>

<style scoped lang="scss">
.formula-editor-dialog {
  &__content {
    display: flex;
    flex-direction: column;
    gap: var(--sheetcraft-space-5);
    min-width: 0;
    max-height: calc(100dvh - 180px);
  }

  &__heading,
  &__context,
  &__section-heading {
    display: flex;
    align-items: center;
    gap: var(--sheetcraft-space-4);
    min-width: 0;
  }

  &__heading {
    justify-content: space-between;
    flex-wrap: wrap;
    flex: none;
  }

  &__context {
    flex-wrap: wrap;

    label {
      font-weight: var(--sheetcraft-font-weight-medium);
    }
  }

  &__target {
    min-width: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    overflow-wrap: anywhere;

    strong {
      margin-inline-start: var(--sheetcraft-space-2);
      color: var(--sheetcraft-text-primary);
      font-weight: var(--sheetcraft-font-weight-medium);
    }
  }

  &__body {
    display: grid;
    align-content: start;
    gap: var(--sheetcraft-space-6);
    min-height: 0;
    overflow: auto;
  }

  &__editor,
  &__arguments {
    display: grid;
    gap: var(--sheetcraft-space-4);
    min-width: 0;
  }

  &__textarea-wrap {
    position: relative;
    min-width: 0;
  }

  &__hint,
  &__details p {
    margin: 0;
    color: var(--sheetcraft-text-secondary);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
  }

  &__section-heading {
    font-size: var(--sheetcraft-font-size-body-small);
    color: var(--sheetcraft-text-secondary);

    strong {
      font-weight: var(--sheetcraft-font-weight-medium);
      color: var(--sheetcraft-text-primary);
    }
  }

  &__argument-fields {
    display: grid;
    gap: var(--sheetcraft-space-4);

    label {
      display: grid;
      grid-template-columns: minmax(80px, 128px) minmax(0, 1fr);
      align-items: center;
      gap: var(--sheetcraft-space-5);
      min-width: 0;

      > span {
        color: var(--sheetcraft-text-secondary);
        text-align: right;
        overflow-wrap: anywhere;
      }
    }
  }

  &__details {
    display: grid;
    gap: var(--sheetcraft-space-2);
    min-width: 0;
    overflow-wrap: anywhere;

    code {
      font-family: ui-monospace, SFMono-Regular, Consolas, monospace;
      font-size: inherit;
    }

    .formula-editor-dialog__argument {
      color: var(--sheetcraft-text-primary);
    }
  }

  &__signature {
    color: var(--sheetcraft-text-primary);
  }

  &__result {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: baseline;
    gap: var(--sheetcraft-space-5);
    flex: none;
    padding-top: var(--sheetcraft-space-5);
    border-top: 1px solid var(--sheetcraft-border-control);

    > span {
      color: var(--sheetcraft-text-secondary);
    }

    output {
      max-height: 84px;
      overflow: auto;
      font-size: var(--sheetcraft-font-size-body-large);
      line-height: var(--sheetcraft-line-height-body-large);
      font-weight: var(--sheetcraft-font-weight-medium);
      color: var(--sheetcraft-text-primary);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
  }

  &__error {
    flex: none;
    margin: 0;
    color: var(--sheetcraft-text-danger);
    font-size: var(--sheetcraft-font-size-body-small);
  }
}

@media (max-width: 560px) {
  .formula-editor-dialog__argument-fields label {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--sheetcraft-space-2);

    > span {
      text-align: start;
    }
  }
}
</style>
