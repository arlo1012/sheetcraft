export type NamedRangeRow = Readonly<{
  id: string;
  name: string;
  scopeSheetId?: string;
  reference: string;
}>;

export type NamedRangeDraft = Readonly<{
  id?: string;
  name: string;
  scopeSheetId?: string;
  reference: string;
}>;

export type NamedRangeSheet = Readonly<{ id: string; name: string }>;
