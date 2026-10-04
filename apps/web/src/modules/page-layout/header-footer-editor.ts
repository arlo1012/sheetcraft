import type { HeaderFooterField, HeaderFooterFormat } from "./header-footer-text";

export type HeaderFooterVariant = "odd" | "first" | "even";
export type HeaderFooterSection = "header" | "footer";
export type HeaderFooterPart = "left" | "center" | "right";

export type HeaderFooterEditTarget = {
  section: HeaderFooterSection;
  part: HeaderFooterPart;
  variant: HeaderFooterVariant;
};

export type HeaderFooterEditContext = {
  section: HeaderFooterSection;
  part: HeaderFooterPart;
  variant: HeaderFooterVariant;
  pageNumber?: number;
  format: HeaderFooterFormat;
};

export type HeaderFooterEditorAction =
  | { type: "insertField"; field: HeaderFooterField }
  | { type: "format"; patch: Partial<HeaderFooterFormat> }
  | { type: "finish" }
  | { type: "cancel" };
