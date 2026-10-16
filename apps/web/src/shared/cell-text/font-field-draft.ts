/** View-only font combo seam. Domain adapters own parsing, identity, validation and commands. */
export interface FontFieldDraftBinding {
  readonly text: string;
  readonly composing: boolean;
  edit(text: string): void;
  setComposing(active: boolean, finalText?: string): void;
  submit(source: "enter" | "blur"): boolean;
  select(value: string | number): boolean;
  cancel(): void;
}
