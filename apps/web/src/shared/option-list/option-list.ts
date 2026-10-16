export type OptionListOption<Value extends string = string> = Readonly<{
  value: Value;
  label: string;
  disabled?: boolean;
  color?: string;
  aliases?: readonly string[];
}>;

export function findOptionMatch<
  Option extends Readonly<{ label: string; aliases?: readonly string[] }>,
>(options: readonly Option[], text: string): Option | undefined {
  const query = text.trim().toLocaleLowerCase();
  if (!query) return undefined;
  const entries = options.map((option) => ({
    option,
    label: option.label.toLocaleLowerCase(),
    aliases: option.aliases?.map((alias) => alias.toLocaleLowerCase()) ?? [],
  }));
  return (
    entries.find(({ label }) => label === query) ??
    entries.find(({ aliases }) => aliases.includes(query)) ??
    entries.find(({ label }) => label.startsWith(query)) ??
    entries.find(({ aliases }) => aliases.some((alias) => alias.startsWith(query))) ??
    entries.find(({ label }) => label.includes(query)) ??
    entries.find(({ aliases }) => aliases.some((alias) => alias.includes(query)))
  )?.option;
}
