export type CellFormatOption<Value extends string = string> = Readonly<{
  code: Value;
  value?: Value;
  label: string;
  color?: string;
}>;

export function findCellFormatOptionMatch<Value extends string>(
  options: readonly CellFormatOption<Value>[],
  text: string,
): CellFormatOption<Value> | undefined {
  const query = text.trim().toLocaleLowerCase();
  if (!query) return undefined;
  const entries = options.map((option) => ({
    option,
    label: option.label.toLocaleLowerCase(),
  }));
  return (
    entries.find(({ label }) => label === query) ??
    entries.find(({ label }) => label.startsWith(query)) ??
    entries.find(({ label }) => label.includes(query))
  )?.option;
}
