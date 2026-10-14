<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from "vue";
import { Check, CodeXml, Pilcrow, RotateCcw, Settings2, Sigma } from "lucide-vue-next";
import type {
  EquationFractionStyle,
  EquationMatrix,
  EquationNode,
} from "@sheetcraft/core/equation-document";
import GallerySection from "../../../shared/gallery/GallerySection.vue";
import MenuItem from "../../../shared/menu/MenuItem.vue";
import MenuRadioItem from "../../../shared/menu/MenuRadioItem.vue";
import MenuSurface from "../../../shared/menu/MenuSurface.vue";
import { useMenu } from "../../../shared/menu/useMenu";
import RibbonButton from "../../../shared/ribbon/RibbonButton.vue";
import RibbonMenuButton from "../../../shared/ribbon/RibbonMenuButton.vue";
import RibbonToolbar from "../../../shared/ribbon/RibbonToolbar.vue";
import EquationContent from "../components/EquationContent.vue";
import {
  EQUATION_STRUCTURE_CATEGORIES,
  EQUATION_SYMBOL_CATEGORIES,
  getEquationTemplates,
  type EquationLocale,
  type EquationStructureCategoryId,
  type EquationSymbolCategoryId,
  type EquationSymbolInsertion,
  type EquationSymbol,
  type EquationTemplate,
} from "./equation-catalog";
import en from "./equation-messages.en-US";
import zh from "./equation-messages.zh-CN";

export type EquationToolResult = boolean | { accepted: boolean };
export type EquationToolCallback<T> = (
  intent: T,
) => EquationToolResult | Promise<EquationToolResult>;
export type EquationMatrixIntent =
  | {
      type: "matrix-row" | "matrix-column";
      nodeId: string;
      operation: "insert" | "delete";
      index: number;
    }
  | { type: "matrix-alignment"; nodeId: string; alignment: EquationMatrix["alignment"] };
const props = withDefaults(
  defineProps<{
    ownerId: string;
    sessionId: string | number;
    locale?: EquationLocale;
    disabled?: boolean;
    sourceMode: "structured" | "latex";
    selectedStructure?: EquationNode;
    selectedMatrixRow?: number;
    selectedMatrixColumn?: number;
    placeholdersHidden?: boolean;
    normalTextActive?: boolean;
    restoreStructuredAvailable?: boolean;
    insertTemplate: EquationToolCallback<string>;
    insertSymbol: EquationToolCallback<EquationSymbolInsertion>;
    convertFraction: EquationToolCallback<{ nodeId: string; style: EquationFractionStyle }>;
    editMatrix: EquationToolCallback<EquationMatrixIntent>;
    editSource: () => EquationToolResult | Promise<EquationToolResult>;
    editNormalText: () => EquationToolResult | Promise<EquationToolResult>;
    reloadStructured: () => EquationToolResult | Promise<EquationToolResult>;
    hidePlaceholders: EquationToolCallback<boolean>;
    finish: () => EquationToolResult | Promise<EquationToolResult>;
  }>(),
  {
    locale: "en-US",
    disabled: false,
    selectedMatrixRow: 0,
    selectedMatrixColumn: 0,
    placeholdersHidden: false,
    normalTextActive: false,
    restoreStructuredAvailable: true,
  },
);
const labels = computed(() => (props.locale === "zh-CN" ? zh : en));
const suffix = useId().replaceAll(":", "");
const menuId = `equation-structures-${suffix}`,
  symbolMenuId = `equation-symbols-${suffix}`,
  optionsMenuId = `equation-options-${suffix}`;
const generation = ref(0),
  pending = ref(false),
  failure = ref(false);
const paletteDisabled = computed(() => props.disabled || props.sourceMode !== "structured");
const structuredDisabled = computed(
  () => props.disabled || pending.value || props.sourceMode !== "structured",
);
const actionDisabled = computed(() => props.disabled || pending.value);
const structureCategory = ref<EquationStructureCategoryId>("fraction");
const symbolCategoryId = ref<EquationSymbolCategoryId>("basic");
const categoryListOpen = ref(false);
const symbolCategory = computed(() =>
  EQUATION_SYMBOL_CATEGORIES.find((choice) => choice.id === symbolCategoryId.value)!,
);
const symbolGroups = computed(() => {
  const captured = actions.value;
  const groups = new Map<
    string,
    { title: string; symbols: (EquationSymbol & { select: () => void })[] }
  >();
  for (const symbol of symbolCategory.value.symbols) {
    const title = symbol.group[props.locale];
    const group = groups.get(title);
    const choice = {
      ...symbol,
      select: () => {
        void captured.symbol(symbol.insertion);
      },
    };
    if (group) group.symbols.push(choice);
    else groups.set(title, { title, symbols: [choice] });
  }
  return [...groups.values()];
});
const structureGroups = computed(() => {
  const captured = actions.value;
  const groups = new Map<
    string,
    { title: string; choices: (EquationTemplate & { select: () => void })[] }
  >();
  for (const choice of getEquationTemplates(structureCategory.value)) {
    const title = choice.group[props.locale],
      group = groups.get(title);
    const row = {
      ...choice,
      select: () => {
        void captured.template(choice.id);
      },
    };
    if (group) group.choices.push(row);
    else groups.set(title, { title, choices: [row] });
  }
  return [...groups.values()];
});
const selectedCategory = computed(() =>
  EQUATION_STRUCTURE_CATEGORIES.find((choice) => choice.id === structureCategory.value)!,
);
const structureButtons = new Map<string, InstanceType<typeof RibbonMenuButton>>();
const structureButton = ref<InstanceType<typeof RibbonMenuButton>>();
const structureSurface = ref<InstanceType<typeof MenuSurface>>();
const symbolButton = ref<InstanceType<typeof RibbonMenuButton>>(),
  symbolSurface = ref<InstanceType<typeof MenuSurface>>();
const optionsButton = ref<InstanceType<typeof RibbonMenuButton>>(),
  optionsSurface = ref<InstanceType<typeof MenuSurface>>();
function invalidate() {
  generation.value++;
  pending.value = false;
}
function menuOpened() {
  invalidate();
  failure.value = false;
  categoryListOpen.value = false;
}
const structureMenu = useMenu({
  triggerRef: computed(() => structureButton.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => structureSurface.value ?? null),
  disabled: paletteDisabled,
  onOpen: menuOpened,
  onDismiss: invalidate,
});
const symbolMenu = useMenu({
  triggerRef: computed(() => symbolButton.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => symbolSurface.value ?? null),
  disabled: paletteDisabled,
  onOpen: menuOpened,
  onDismiss: invalidate,
});
const optionsMenu = useMenu({
  triggerRef: computed(() => optionsButton.value?.rootElement ?? null),
  menuSurfaceRef: computed(() => optionsSurface.value ?? null),
  disabled: computed(() => props.disabled || props.sourceMode !== "structured"),
  onOpen: menuOpened,
  onDismiss: invalidate,
});
function closeMenus() {
  structureMenu.dismiss("programmatic", false);
  symbolMenu.dismiss("programmatic", false);
  optionsMenu.dismiss("programmatic", false);
}
function setStructureButton(id: string, instance: unknown) {
  if (instance) structureButtons.set(id, instance as InstanceType<typeof RibbonMenuButton>);
  else structureButtons.delete(id);
}
function openStructure(category: EquationStructureCategoryId, event?: KeyboardEvent) {
  if (event && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  if (structuredDisabled.value) return;
  const wasOpen = structureMenu.open.value && category === structureCategory.value;
  closeMenus();
  structureCategory.value = category;
  structureButton.value = structureButtons.get(category);
  if (wasOpen && !event) return;
  if (event) structureMenu.onTriggerKeydown(event);
  else structureMenu.openMenu();
}
function toggleSymbols(event?: KeyboardEvent) {
  if (event && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  if (structuredDisabled.value) return;
  const wasOpen = symbolMenu.open.value;
  closeMenus();
  if (event) symbolMenu.onTriggerKeydown(event);
  else if (!wasOpen) symbolMenu.openMenu();
}
function toggleOptions(event?: KeyboardEvent) {
  if (event && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  if (structuredDisabled.value) return;
  const wasOpen = optionsMenu.open.value;
  closeMenus();
  if (event) optionsMenu.onTriggerKeydown(event);
  else if (!wasOpen) optionsMenu.openMenu();
}
const selectedFraction = computed(() =>
  props.selectedStructure?.kind === "fraction" ? props.selectedStructure : undefined,
);
const selectedMatrix = computed(() =>
  props.selectedStructure?.kind === "matrix" ? props.selectedStructure : undefined,
);
function matrixIndex(value: number, count: number) {
  return Number.isSafeInteger(value) ? Math.min(count - 1, Math.max(0, value)) : 0;
}
const matrixRow = computed(() =>
  matrixIndex(props.selectedMatrixRow, selectedMatrix.value?.rows.length ?? 1),
);
const matrixColumn = computed(() =>
  matrixIndex(props.selectedMatrixColumn, selectedMatrix.value?.rows[0]?.length ?? 1),
);
const fractionChoices: readonly {
  style: EquationFractionStyle;
  key: "stacked" | "skewed" | "linear" | "noBar";
}[] = [
  { style: "stacked", key: "stacked" },
  { style: "skewed", key: "skewed" },
  { style: "linear", key: "linear" },
  { style: "no-bar", key: "noBar" },
];
const alignmentChoices = ["left", "center", "right"] as const;
// Every VNode receives callbacks captured for that exact owner, session and menu generation.
const actions = computed(() => {
  const owner = props.ownerId,
    session = props.sessionId,
    token = generation.value,
    mode = props.sourceMode;
  const template = props.insertTemplate,
    symbol = props.insertSymbol,
    fraction = props.convertFraction,
    matrix = props.editMatrix;
  const source = props.editSource,
    normal = props.editNormalText,
    reload = props.reloadStructured,
    placeholders = props.hidePlaceholders,
    finish = props.finish;
  const structure = props.selectedStructure,
    row = matrixRow.value,
    column = matrixColumn.value;
  const hidden = props.placeholdersHidden;
  const valid = () =>
    owner === props.ownerId &&
    session === props.sessionId &&
    token === generation.value &&
    mode === props.sourceMode &&
    !props.disabled;
  async function run(
    callback: () => EquationToolResult | Promise<EquationToolResult>,
    current: () => boolean,
    menu?: typeof structureMenu,
    requiresStructured = false,
  ) {
    if (
      !valid() ||
      !current() ||
      pending.value ||
      (requiresStructured && props.sourceMode !== "structured") ||
      (menu && !menu.open.value)
    )
      return;
    pending.value = true;
    failure.value = false;
    let accepted = false;
    try {
      const result = await callback();
      accepted =
        result === true ||
        (typeof result === "object" && result !== null && result.accepted === true);
    } catch {
      /* Rejected changes keep the current choices available. */
    }
    if (!valid() || !current()) return;
    pending.value = false;
    if (accepted) menu?.dismiss("programmatic", false);
    else failure.value = true;
  }
  const sameStructure = () =>
    structure?.id === props.selectedStructure?.id &&
    structure?.kind === props.selectedStructure?.kind &&
    (structure?.kind !== "matrix" || (row === matrixRow.value && column === matrixColumn.value));
  function editMatrixAxis(axis: "row" | "column", operation: "before" | "after" | "delete") {
    if (structure?.kind !== "matrix") return;
    const count = axis === "row" ? structure.rows.length : structure.rows[0]!.length;
    if (operation === "delete" ? count <= 1 : count >= 16) return;
    const index = (axis === "row" ? row : column) + (operation === "after" ? 1 : 0);
    return run(
      () =>
        matrix({
          type: axis === "row" ? "matrix-row" : "matrix-column",
          nodeId: structure.id,
          operation: operation === "delete" ? "delete" : "insert",
          index,
        }),
      () => matrix === props.editMatrix && sameStructure(),
      optionsMenu,
      true,
    );
  }
  return {
    rowBefore: () => editMatrixAxis("row", "before"),
    rowAfter: () => editMatrixAxis("row", "after"),
    columnBefore: () => editMatrixAxis("column", "before"),
    columnAfter: () => editMatrixAxis("column", "after"),
    deleteRow: () => editMatrixAxis("row", "delete"),
    deleteColumn: () => editMatrixAxis("column", "delete"),
    template: (id: string) =>
      run(
        () => template(id),
        () => template === props.insertTemplate,
        structureMenu,
        true,
      ),
    symbol: (insertion: EquationSymbolInsertion, inMenu = true) =>
      run(
        () => symbol({ ...insertion }),
        () => symbol === props.insertSymbol,
        inMenu ? symbolMenu : undefined,
        true,
      ),
    fraction: (style: EquationFractionStyle) => {
      if (structure?.kind !== "fraction") return;
      return run(
        () => fraction({ nodeId: structure.id, style }),
        () => fraction === props.convertFraction && sameStructure(),
        optionsMenu,
        true,
      );
    },
    alignment: (alignment: EquationMatrix["alignment"]) => {
      if (structure?.kind !== "matrix") return;
      return run(
        () => matrix({ type: "matrix-alignment", nodeId: structure.id, alignment }),
        () => matrix === props.editMatrix && sameStructure(),
        optionsMenu,
        true,
      );
    },
    source: () => run(source, () => source === props.editSource),
    normal: () => run(normal, () => normal === props.editNormalText, undefined, true),
    reload: () => run(reload, () => reload === props.reloadStructured),
    placeholders: () =>
      run(
        () => placeholders(!hidden),
        () => placeholders === props.hidePlaceholders,
        optionsMenu,
        true,
      ),
    finish: () => run(finish, () => finish === props.finish),
  };
});
const categoryChoices = computed(() => {
  const owner = props.ownerId,
    session = props.sessionId,
    token = generation.value;
  return EQUATION_SYMBOL_CATEGORIES.map((category) => ({
    ...category,
    select() {
      if (
        owner !== props.ownerId ||
        session !== props.sessionId ||
        token !== generation.value ||
        !symbolMenu.open.value ||
        structuredDisabled.value
      )
        return;
      symbolCategoryId.value = category.id;
      categoryListOpen.value = false;
    },
  }));
});
const inlineSymbols = computed(() => {
  const captured = actions.value;
  return symbolCategory.value.symbols.slice(0, 24).map((symbol) => ({
    ...symbol,
    select: () => {
      void captured.symbol(symbol.insertion, false);
    },
  }));
});
const fractionOptions = computed(() => {
  const captured = actions.value;
  return fractionChoices.map((choice) => ({
    ...choice,
    select: () => {
      void captured.fraction(choice.style);
    },
  }));
});
const matrixAlignments = computed(() => {
  const captured = actions.value;
  return alignmentChoices.map((alignment) => ({
    alignment,
    select: () => {
      void captured.alignment(alignment);
    },
  }));
});
watch(
  symbolCategoryId,
  () => {
    if (symbolMenu.open.value) invalidate();
  },
  { flush: "sync" },
);
watch(
  () =>
    [
      props.ownerId,
      props.sessionId,
      props.locale,
      props.disabled,
      props.sourceMode,
      props.insertTemplate,
      props.insertSymbol,
      props.convertFraction,
      props.editMatrix,
      props.editSource,
      props.editNormalText,
      props.reloadStructured,
      props.hidePlaceholders,
      props.finish,
    ] as const,
  () => {
    invalidate();
    failure.value = false;
    closeMenus();
  },
  { flush: "sync" },
);
watch(
  () => [props.selectedStructure?.id, props.selectedMatrixRow, props.selectedMatrixColumn] as const,
  () => {
    if (optionsMenu.open.value) {
      invalidate();
      optionsMenu.dismiss("programmatic", false);
    }
  },
  { flush: "sync" },
);
onBeforeUnmount(invalidate);
</script>

<template>
  <div
    class="equation-tools"
    :data-equation-owner="ownerId"
    :data-equation-session="sessionId"
    :data-equation-source-mode="sourceMode"
  >
    <RibbonToolbar
      :label="labels.tools"
      :data-equation-owner="ownerId"
      :data-equation-session="sessionId"
      data-equation-tools
    >
      <section
        class="equation-tools__columns"
        data-ribbon-group="equation-symbols"
        :aria-label="labels.symbols"
      >
        <div class="equation-tools__symbol-strip">
          <RibbonButton
            v-for="symbol in inlineSymbols"
            :key="symbol.id"
            :label="symbol.label[locale]"
            :disabled="structuredDisabled"
            :data-equation-inline-symbol="symbol.id"
            @activate="symbol.select"
          >
            <EquationContent :source="symbol.source" />
          </RibbonButton>
        </div>
        <RibbonMenuButton
          ref="symbolButton"
          variant="tall"
          :label="labels.symbols"
          :text="labels.symbols"
          :disabled="structuredDisabled"
          :expanded="symbolMenu.open.value"
          :menu-id="symbolMenuId"
          data-equation-symbols-trigger
          @activate="toggleSymbols()"
          @keydown="toggleSymbols($event)"
          ><Sigma
        /></RibbonMenuButton>
      </section>
      <section
        class="equation-tools__columns"
        data-ribbon-group="equation-structures"
        :aria-label="labels.structures"
      >
        <span
          v-for="category in EQUATION_STRUCTURE_CATEGORIES"
          :key="category.id"
          class="equation-tools__tool"
        >
          <RibbonMenuButton
            :ref="(instance) => setStructureButton(category.id, instance)"
            variant="tall"
            :label="category.label[locale]"
            :text="category.label[locale]"
            :disabled="structuredDisabled"
            :expanded="structureMenu.open.value && structureCategory === category.id"
            :menu-id="menuId"
            :data-equation-structure="category.id"
            @activate="openStructure(category.id)"
            @keydown="openStructure(category.id, $event)"
          >
            <EquationContent :source="getEquationTemplates(category.id)[0]!.source" />
          </RibbonMenuButton>
        </span>
      </section>
      <section
        class="equation-tools__columns"
        data-ribbon-group="equation-options"
        :aria-label="labels.mathOptions"
      >
        <RibbonMenuButton
          ref="optionsButton"
          variant="tall"
          :label="labels.mathOptions"
          :text="labels.mathOptions"
          :disabled="structuredDisabled"
          :expanded="optionsMenu.open.value"
          :menu-id="optionsMenuId"
          data-equation-options-trigger
          @activate="toggleOptions()"
          @keydown="toggleOptions($event)"
          ><Settings2
        /></RibbonMenuButton>
      </section>
      <section
        class="equation-tools__compact"
        data-ribbon-group="equation-editing"
        :aria-label="labels.tools"
      >
        <div class="equation-tools__row">
          <RibbonButton
            :label="labels.source"
            :text="labels.source"
            :disabled="actionDisabled"
            data-equation-edit-source
            @activate="actions.source"
            ><CodeXml
          /></RibbonButton>
          <RibbonButton
            :label="labels.normalText"
            :text="labels.normalText"
            :pressed="normalTextActive"
            :disabled="structuredDisabled"
            data-equation-normal-text
            @activate="actions.normal"
            ><Pilcrow
          /></RibbonButton>
        </div>
        <div class="equation-tools__row">
          <RibbonButton
            :label="labels.reloadStructured"
            :text="labels.reloadStructured"
            :disabled="actionDisabled || sourceMode !== 'latex' || !restoreStructuredAvailable"
            data-equation-reload
            @activate="actions.reload"
            ><RotateCcw
          /></RibbonButton>
          <RibbonButton
            :label="labels.finish"
            :text="labels.finish"
            :disabled="actionDisabled"
            data-equation-finish
            @activate="actions.finish"
            ><Check
          /></RibbonButton>
        </div>
      </section>
      <template #overlays>
        <Teleport to="body">
          <MenuSurface
            v-if="structureMenu.open.value"
            :id="menuId"
            ref="structureSurface"
            class="equation-tools__structure-menu"
            :style="structureMenu.floatingStyles.value"
            :label="selectedCategory.label[locale]"
            :aria-busy="pending"
            :data-equation-owner="ownerId"
            :data-equation-session="sessionId"
            data-equation-structure-menu
          >
            <template #body>
              <GallerySection
                v-for="group in structureGroups"
                :key="group.title"
                :title="group.title"
              >
                <div class="equation-tools__template-grid">
                  <button
                    v-for="choice in group.choices"
                    :key="choice.id"
                    type="button"
                    role="menuitem"
                    tabindex="-1"
                    class="equation-tools__template"
                    :disabled="structuredDisabled"
                    :aria-disabled="structuredDisabled"
                    :aria-label="choice.label[locale]"
                    :title="choice.label[locale]"
                    :data-equation-template="choice.id"
                    :data-equation-origin="choice.origin"
                    @click="choice.select"
                  >
                    <EquationContent :source="choice.source" aria-hidden="true" />
                    <span class="equation-tools__template-caption">{{ choice.label[locale] }}</span>
                  </button>
                </div>
              </GallerySection>
            </template>
            <template #footer
              ><p class="equation-tools__notice">{{ labels.ownChoices }}</p>
              <p v-if="failure" class="equation-tools__error" role="alert">
                {{ labels.failed }}
              </p></template
            >
          </MenuSurface>
          <MenuSurface
            v-if="symbolMenu.open.value"
            :id="symbolMenuId"
            ref="symbolSurface"
            class="equation-tools__symbol-menu"
            :style="symbolMenu.floatingStyles.value"
            :label="labels.symbols"
            :aria-busy="pending"
            :data-equation-owner="ownerId"
            :data-equation-session="sessionId"
            data-equation-symbol-menu
          >
            <template #header>
              <div class="equation-tools__symbol-category">
                <span>{{ labels.symbolCategory }}</span>
                <RibbonMenuButton
                  :label="labels.symbolCategory"
                  :text="symbolCategory.label[locale]"
                  :disabled="pending"
                  :expanded="categoryListOpen"
                  data-equation-symbol-category
                  @activate="categoryListOpen = !categoryListOpen"
                  ><Sigma
                /></RibbonMenuButton>
              </div>
              <ul v-if="categoryListOpen" class="equation-tools__category-list" role="presentation">
                <MenuRadioItem
                  v-for="category in categoryChoices"
                  :key="category.id"
                  :checked="symbolCategoryId === category.id"
                  :disabled="structuredDisabled"
                  :data-equation-symbol-category-choice="category.id"
                  @select="category.select"
                  >{{ category.label[locale] }}</MenuRadioItem
                >
              </ul>
            </template>
            <template #body>
              <GallerySection v-for="group in symbolGroups" :key="group.title" :title="group.title">
                <div class="equation-tools__symbol-grid">
                  <button
                    v-for="symbol in group.symbols"
                    :key="symbol.id"
                    type="button"
                    role="menuitem"
                    tabindex="-1"
                    class="equation-tools__symbol"
                    :disabled="structuredDisabled"
                    :aria-disabled="structuredDisabled"
                    :aria-label="symbol.label[locale]"
                    :title="symbol.label[locale]"
                    :data-equation-symbol="symbol.id"
                    @click="symbol.select"
                  >
                    <EquationContent :source="symbol.source" aria-hidden="true" />
                  </button>
                </div>
              </GallerySection>
            </template>
            <template #footer
              ><p class="equation-tools__notice">{{ labels.mathSource }}</p>
              <p v-if="failure" class="equation-tools__error" role="alert">
                {{ labels.failed }}
              </p></template
            >
          </MenuSurface>
          <MenuSurface
            v-if="optionsMenu.open.value"
            :id="optionsMenuId"
            ref="optionsSurface"
            class="equation-tools__options-menu"
            :style="optionsMenu.floatingStyles.value"
            :label="labels.mathOptions"
            :data-equation-owner="ownerId"
            :data-equation-session="sessionId"
            data-equation-options-menu
          >
            <template #items>
              <template v-if="selectedFraction">
                <MenuRadioItem
                  v-for="choice in fractionOptions"
                  :key="choice.style"
                  :checked="selectedFraction.style === choice.style"
                  :disabled="structuredDisabled"
                  :data-equation-fraction-style="choice.style"
                  @select="choice.select"
                  >{{ labels[choice.key] }}</MenuRadioItem
                >
              </template>
              <template v-else-if="selectedMatrix">
                <MenuItem
                  :disabled="structuredDisabled || selectedMatrix.rows.length >= 16"
                  data-equation-matrix-action="row-before"
                  @select="actions.rowBefore"
                  >{{ labels.rowBefore }}</MenuItem
                >
                <MenuItem
                  :disabled="structuredDisabled || selectedMatrix.rows.length >= 16"
                  data-equation-matrix-action="row-after"
                  @select="actions.rowAfter"
                  >{{ labels.rowAfter }}</MenuItem
                >
                <MenuItem
                  :disabled="structuredDisabled || selectedMatrix.rows[0]!.length >= 16"
                  data-equation-matrix-action="column-before"
                  @select="actions.columnBefore"
                  >{{ labels.columnBefore }}</MenuItem
                >
                <MenuItem
                  :disabled="structuredDisabled || selectedMatrix.rows[0]!.length >= 16"
                  data-equation-matrix-action="column-after"
                  @select="actions.columnAfter"
                  >{{ labels.columnAfter }}</MenuItem
                >
                <MenuItem
                  :disabled="structuredDisabled || selectedMatrix.rows.length <= 1"
                  data-equation-matrix-action="delete-row"
                  @select="actions.deleteRow"
                  >{{ labels.deleteRow }}</MenuItem
                >
                <MenuItem
                  :disabled="structuredDisabled || selectedMatrix.rows[0]!.length <= 1"
                  data-equation-matrix-action="delete-column"
                  @select="actions.deleteColumn"
                  >{{ labels.deleteColumn }}</MenuItem
                >
                <MenuRadioItem
                  v-for="choice in matrixAlignments"
                  :key="choice.alignment"
                  :checked="selectedMatrix.alignment === choice.alignment"
                  :disabled="structuredDisabled"
                  :data-equation-matrix-alignment="choice.alignment"
                  @select="choice.select"
                  >{{ labels.matrixAlignment }}: {{ labels[choice.alignment] }}</MenuRadioItem
                >
              </template>
              <MenuItem v-else disabled>{{ labels.selectStructure }}</MenuItem>
              <MenuItem
                :disabled="structuredDisabled"
                data-equation-hide-placeholders
                @select="actions.placeholders"
                >{{
                  placeholdersHidden ? labels.showPlaceholders : labels.hidePlaceholders
                }}</MenuItem
              >
            </template>
            <template #footer
              ><p v-if="selectedMatrix" class="equation-tools__notice">{{ labels.matrixLimit }}</p>
              <p v-if="failure" class="equation-tools__error" role="alert">
                {{ labels.failed }}
              </p></template
            >
          </MenuSurface>
        </Teleport>
      </template>
    </RibbonToolbar>
    <p v-if="sourceMode === 'latex'" class="equation-tools__mode-notice" role="status">
      {{ labels.sourceDisabled }}
    </p>
    <p
      v-if="
        failure && !structureMenu.open.value && !symbolMenu.open.value && !optionsMenu.open.value
      "
      class="equation-tools__error"
      role="alert"
    >
      {{ labels.failed }}
    </p>
  </div>
</template>

<style scoped lang="scss">
@use "../../../shared/ribbon/ribbon-layout" as ribbon;
@use "../../../shared/gallery/gallery-choice" as gallery;
.equation-tools {
  &__columns {
    @include ribbon.columns;
  }
  &__compact {
    @include ribbon.compact;
  }
  &__row {
    @include ribbon.row;
  }
  &__tool {
    @include ribbon.tool;
  }
  &__symbol-strip {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(2, var(--ribbon-control-height, 26px));
    gap: var(--ribbon-row-gap, 2px);
  }
  &__structure-menu {
    width: 420px;
  }
  &__symbol-menu {
    width: 620px;
  }
  &__options-menu {
    width: max-content;
  }
  &__structure-menu,
  &__symbol-menu,
  &__options-menu {
    max-width: calc(100vw - var(--sheetcraft-space-4) * 2);
    max-height: min(650px, calc(100dvh - var(--sheetcraft-space-4) * 2));
    z-index: var(--sheetcraft-layer-menu);
  }
  &__template-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--sheetcraft-space-2);
  }
  &__template {
    @include gallery.choice(6px);
    display: grid;
    align-content: center;
    justify-items: center;
    gap: var(--sheetcraft-space-2);
    min-height: 86px;
    min-width: 0;
    overflow: hidden;
    font-size: 16px;
  }
  &__template-caption {
    max-width: 100%;
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    white-space: normal;
    text-align: center;
    overflow-wrap: anywhere;
  }
  &__symbol-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(28px, 1fr));
    gap: var(--sheetcraft-space-1);
  }
  &__symbol {
    @include gallery.choice(2px);
    display: grid;
    min-width: 0;
    min-height: 30px;
    place-items: center;
    font-size: 16px;
  }
  &__category-list {
    padding: 0;
    margin: 0;
    list-style: none;
  }
  &__symbol-category {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--sheetcraft-space-3);
    padding: var(--sheetcraft-space-2) var(--sheetcraft-tool-panel-padding);
    font-size: var(--sheetcraft-font-size-body-medium);
    line-height: var(--sheetcraft-line-height-body-medium);
  }

  &__notice,
  &__error,
  &__mode-notice {
    margin: 0;
    padding: var(--sheetcraft-space-2) var(--sheetcraft-menu-item-padding-inline, 14px);
    font-size: var(--sheetcraft-font-size-body-small);
    line-height: var(--sheetcraft-line-height-body-small);
    white-space: normal;
  }
  &__notice,
  &__mode-notice {
    color: var(--sheetcraft-text-secondary);
  }
  &__error {
    color: var(--sheetcraft-status-error);
  }
}
</style>
