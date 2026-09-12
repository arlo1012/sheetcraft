export type OptionListOption<Value extends string = string> = Readonly<{
  value: Value;
  label: string;
  color?: string;
}>;

export function findOptionMatch<Option extends Readonly<{ label: string }>>(
  options: readonly Option[],
  text: string,
): Option | undefined {
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
