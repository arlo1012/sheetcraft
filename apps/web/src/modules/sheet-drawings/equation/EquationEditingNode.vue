<script setup lang="ts">
import { inject } from "vue";
import type { EquationNode } from "@sheetcraft/core/equation-document";
import { EQUATION_EDITOR_CONTEXT } from "./equation-editor-context";
import EquationEditingSequence from "./EquationEditingSequence.vue";
const props = defineProps<{ node: EquationNode }>();
const editor = inject(EQUATION_EDITOR_CONTEXT)!;
const delimiters = {
  none: "",
  "paren-open": "(",
  "paren-close": ")",
  "bracket-open": "[",
  "bracket-close": "]",
  "brace-open": "{",
  "brace-close": "}",
  bar: "|",
  "double-bar": "‖",
  "angle-open": "⟨",
  "angle-close": "⟩",
  "floor-open": "⌊",
  "floor-close": "⌋",
  "ceil-open": "⌈",
  "ceil-close": "⌉",
};
const operators = {
  sum: "∑",
  prod: "∏",
  coprod: "∐",
  int: "∫",
  iint: "∬",
  iiint: "∭",
  oint: "∮",
  oiint: "∯",
  oiiint: "∰",
  bigcup: "⋃",
  bigcap: "⋂",
  bigvee: "⋁",
  bigwedge: "⋀",
};
const accents = {
  hat: "ˆ",
  bar: "¯",
  vec: "→",
  dot: "˙",
  ddot: "¨",
  tilde: "˜",
  overbrace: "⏞",
  underbrace: "⏟",
  acute: "´",
  grave: "`",
  breve: "˘",
  check: "ˇ",
  dddot: "⃛",
  ddddot: "⃜",
  overleftarrow: "←",
  overrightarrow: "→",
  overleftrightarrow: "↔",
  underleftarrow: "←",
  underrightarrow: "→",
  underleftrightarrow: "↔",
  overline: "¯",
  underline: "¯",
};
function underAccent(): boolean {
  return (
    props.node.kind === "accent" &&
    (props.node.name.startsWith("under") || props.node.name === "underline")
  );
}
function matrixBracket(side: "left" | "right"): string {
  if (props.node.kind !== "matrix") return "";
  switch (props.node.brackets) {
    case "paren":
      return side === "left" ? "(" : ")";
    case "bracket":
      return side === "left" ? "[" : "]";
    case "brace":
      return side === "left" ? "{" : "}";
    case "bar":
      return "|";
    case "double-bar":
      return "‖";
    case "none":
      return "";
  }
}
</script>
<template>
  <span class="equation-node" :data-equation-node="node.id" :data-equation-kind="node.kind">
    <EquationEditingSequence
      v-if="node.kind === 'sequence'"
      :sequence="node"
      :label="editor.labels.value.body"
    />
    <span v-else-if="node.kind === 'text' || node.kind === 'latex'">{{ node.value }}</span>
    <span
      v-else-if="node.kind === 'fraction'"
      class="equation-fraction"
      :class="`fraction-${node.style}`"
    >
      <EquationEditingSequence
        class="fraction-numerator"
        :sequence="node.numerator"
        :label="editor.labels.value.numerator"
      />
      <span
        v-if="node.style === 'skewed' || node.style === 'linear'"
        class="fraction-slash"
        aria-hidden="true"
        >/</span
      >
      <EquationEditingSequence
        class="fraction-denominator"
        :sequence="node.denominator"
        :label="editor.labels.value.denominator"
      />
    </span>
    <span v-else-if="node.kind === 'script'" class="equation-script">
      <span v-if="node.presuperscript || node.presubscript" class="script-slots script-preslots">
        <EquationEditingSequence
          v-if="node.presuperscript"
          class="script-superscript"
          data-equation-role="presuperscript"
          :sequence="node.presuperscript"
          :label="editor.labels.value.superscript"
        />
        <EquationEditingSequence
          v-if="node.presubscript"
          class="script-subscript"
          data-equation-role="presubscript"
          :sequence="node.presubscript"
          :label="editor.labels.value.subscript"
        />
      </span>
      <EquationEditingSequence :sequence="node.base" :label="editor.labels.value.base" />
      <span v-if="node.superscript || node.subscript" class="script-slots">
        <EquationEditingSequence
          v-if="node.superscript"
          class="script-superscript"
          data-equation-role="superscript"
          :sequence="node.superscript"
          :label="editor.labels.value.superscript"
        />
        <EquationEditingSequence
          v-if="node.subscript"
          class="script-subscript"
          data-equation-role="subscript"
          :sequence="node.subscript"
          :label="editor.labels.value.subscript"
        />
      </span>
    </span>
    <span v-else-if="node.kind === 'radical'" class="equation-radical">
      <EquationEditingSequence
        v-if="node.degree"
        class="radical-degree"
        :sequence="node.degree"
        :label="editor.labels.value.degree"
      />
      <span class="radical-sign" aria-hidden="true">√</span>
      <EquationEditingSequence
        class="radical-body"
        :sequence="node.radicand"
        :label="editor.labels.value.radicand"
      />
    </span>
    <span v-else-if="node.kind === 'nary'" class="equation-nary" :class="`limits-${node.limits}`">
      <span class="nary-operator">
        <EquationEditingSequence
          v-if="node.upper"
          class="nary-upper"
          :sequence="node.upper"
          :label="editor.labels.value.upper"
        />
        <span class="nary-sign" aria-hidden="true">{{ operators[node.operator] }}</span>
        <EquationEditingSequence
          v-if="node.lower"
          class="nary-lower"
          :sequence="node.lower"
          :label="editor.labels.value.lower"
        />
      </span>
      <EquationEditingSequence :sequence="node.body" :label="editor.labels.value.body" />
    </span>
    <span v-else-if="node.kind === 'delimiter'" class="equation-delimiter">
      <span class="delimiter-glyph" aria-hidden="true">{{ delimiters[node.left] }}</span>
      <EquationEditingSequence :sequence="node.body" :label="editor.labels.value.body" />
      <span class="delimiter-glyph" aria-hidden="true">{{ delimiters[node.right] }}</span>
    </span>
    <span v-else-if="node.kind === 'function'" class="equation-function">
      <span class="function-name">{{ node.name }}</span>
      <EquationEditingSequence :sequence="node.body" :label="editor.labels.value.body" />
    </span>
    <span
      v-else-if="node.kind === 'accent'"
      class="equation-accent"
      :class="{ 'accent-under': underAccent() }"
    >
      <span class="accent-glyph" aria-hidden="true">{{ accents[node.name] }}</span>
      <EquationEditingSequence :sequence="node.body" :label="editor.labels.value.body" />
    </span>
    <span v-else-if="node.kind === 'limit'" class="equation-limit">
      <span class="limit-name">
        <span>{{ node.name }}</span>
        <EquationEditingSequence
          v-if="node.subscript"
          class="limit-subscript"
          :sequence="node.subscript"
          :label="editor.labels.value.subscript"
        />
      </span>
      <EquationEditingSequence :sequence="node.body" :label="editor.labels.value.body" />
    </span>
    <span
      v-else-if="node.kind === 'annotation'"
      class="equation-annotation"
      :class="{ 'annotation-under': node.position === 'under' }"
    >
      <EquationEditingSequence
        class="annotation-slot"
        :sequence="node.annotation"
        :label="editor.labels.value.annotation"
      />
      <EquationEditingSequence :sequence="node.base" :label="editor.labels.value.base" />
    </span>
    <span v-else-if="node.kind === 'box'" class="equation-box">
      <EquationEditingSequence :sequence="node.body" :label="editor.labels.value.body" />
    </span>
    <span v-else-if="node.kind === 'matrix'" class="equation-matrix">
      <span class="delimiter-glyph" aria-hidden="true">{{ matrixBracket("left") }}</span>
      <span
        class="matrix-rows"
        :class="`matrix-align-${node.alignment}`"
        :style="{
          gridTemplateColumns: `repeat(${node.rows[0]!.length}, minmax(1.2em, max-content))`,
        }"
      >
        <span v-for="(row, rowIndex) in node.rows" :key="row[0]!.id" class="matrix-row">
          <EquationEditingSequence
            v-for="(cell, columnIndex) in row"
            :key="cell.id"
            class="matrix-cell"
            :sequence="cell"
            :label="`${editor.labels.value.matrixCell} ${rowIndex + 1}, ${columnIndex + 1}`"
          />
        </span>
      </span>
      <span class="delimiter-glyph" aria-hidden="true">{{ matrixBracket("right") }}</span>
    </span>
  </span>
</template>
<style scoped>
.equation-node {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
}
.equation-fraction {
  display: inline-flex;
  align-items: center;
}
.fraction-stacked,
.fraction-no-bar {
  flex-direction: column;
  gap: 0.1em;
}
.fraction-stacked > .fraction-numerator {
  padding: 0 0.12em 0.1em;
  border-bottom: 1px solid currentColor;
}
.fraction-skewed > .fraction-numerator {
  transform: translateY(-0.24em);
  font-size: 0.86em;
}
.fraction-skewed > .fraction-denominator {
  transform: translateY(0.24em);
  font-size: 0.86em;
}
.fraction-slash {
  padding: 0 0.1em;
}
.equation-script,
.equation-radical,
.equation-nary,
.equation-delimiter,
.equation-function,
.equation-limit,
.equation-matrix {
  display: inline-flex;
  align-items: center;
  gap: 0.08em;
}
.script-slots {
  display: inline-flex;
  flex-direction: column;
  font-size: 0.7em;
  gap: 0.1em;
}
.script-superscript {
  transform: translateY(-0.45em);
}
.script-subscript {
  transform: translateY(0.35em);
}
.radical-degree {
  align-self: flex-start;
  font-size: 0.65em;
  margin-right: -0.25em;
}
.radical-sign {
  font-size: 1.45em;
  line-height: 1;
}
.radical-body {
  border-top: 1px solid currentColor;
  padding-top: 0.08em;
}
.nary-operator,
.limit-name {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.nary-upper,
.nary-lower,
.limit-subscript {
  font-size: 0.65em;
}
.nary-sign {
  font-size: 1.65em;
  line-height: 1.1;
}
.limits-side .nary-operator {
  display: inline-grid;
  grid-template-columns: auto auto;
  grid-template-rows: auto auto;
}
.limits-side .nary-sign {
  grid-column: 1;
  grid-row: 1 / 3;
}
.limits-side .nary-upper {
  grid-column: 2;
  grid-row: 1;
}
.limits-side .nary-lower {
  grid-column: 2;
  grid-row: 2;
}
.delimiter-glyph {
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  font-size: 1.4em;
  transform: scaleY(1.12);
}
.function-name,
.limit-name {
  font-style: normal;
}
.equation-accent,
.equation-annotation {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
}
.accent-glyph {
  line-height: 0.65;
  min-width: 100%;
  text-align: center;
}
.accent-under,
.annotation-under {
  flex-direction: column-reverse;
}
.annotation-slot {
  font-size: 0.7em;
}
.equation-box {
  display: inline-flex;
  padding: 0.12em;
  border: 1px solid currentColor;
}
.matrix-rows {
  display: inline-grid;
  row-gap: 0.18em;
  column-gap: 0.4em;
}
.matrix-row {
  display: contents;
}
.matrix-cell {
  justify-content: center;
}
.matrix-align-left .matrix-cell {
  justify-content: flex-start;
  text-align: left;
}
.matrix-align-right .matrix-cell {
  justify-content: flex-end;
  text-align: right;
}
</style>
