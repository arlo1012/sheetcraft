export type NamedRangeRow = Readonly<{
  id: string;
  name: string;
  scopeSheetId?: string;
  reference: string;
  comment?: string;
  value?: string;
  hasError?: boolean;
  kind?: "defined" | "table";
}>;

export type NamedRangeDraft = Readonly<{
  id?: string;
  name: string;
  scopeSheetId?: string;
  reference: string;
  comment?: string;
}>;

export type NamedRangeSheet = Readonly<{ id: string; name: string }>;
