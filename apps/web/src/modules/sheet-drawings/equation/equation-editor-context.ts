import type { ComputedRef, InjectionKey } from "vue";
import type { EquationDraftAction, EquationSelection } from "./equation-draft";

export type EquationEditorLabels = {
  equation: string;
  numerator: string;
  denominator: string;
  base: string;
  subscript: string;
  superscript: string;
  radicand: string;
  degree: string;
  lower: string;
  upper: string;
  body: string;
  annotation: string;
  matrixCell: string;
};
export const DEFAULT_EQUATION_EDITOR_LABELS: EquationEditorLabels = {
  equation: "Equation",
  numerator: "Numerator",
  denominator: "Denominator",
  base: "Base",
  subscript: "Subscript",
  superscript: "Superscript",
  radicand: "Radicand",
  degree: "Root degree",
  lower: "Lower limit",
  upper: "Upper limit",
  body: "Expression",
  annotation: "Annotation",
  matrixCell: "Matrix cell",
};
export type EquationEditorContext = {
  ownerKey: ComputedRef<string>;
  selection: ComputedRef<EquationSelection>;
  disabled: ComputedRef<boolean>;
  hidePlaceholders: ComputedRef<boolean>;
  labels: ComputedRef<EquationEditorLabels>;
  action: (action: EquationDraftAction) => void;
  select: (selection: EquationSelection) => void;
  composition: (active: boolean, selection?: EquationSelection) => EquationSelection | undefined;
};
export const EQUATION_EDITOR_CONTEXT: InjectionKey<EquationEditorContext> =
  Symbol("equation-editor");
