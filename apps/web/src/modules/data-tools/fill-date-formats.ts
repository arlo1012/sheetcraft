export const fillDateFormats = [
  "yyyy年m月d日",
  "yyyy-m-d",
  "yyyy.m.d",
  "yyyy/m/d",
  "yyyymmdd",
  "yyyy年mm月dd日",
  "yyyy-mm-dd",
  "yyyy.mm.dd",
  "yyyy/mm/dd",
] as const;

export type FillDateFormat = (typeof fillDateFormats)[number];

export type FillDateParts = Readonly<{
  year: number;
  month: number;
  day: number;
}>;

export function formatFillDateSample(format: string, date: FillDateParts): string {
  return format
    .replace("yyyy", String(date.year))
    .replace("mm", String(date.month).padStart(2, "0"))
    .replace("m", String(date.month))
    .replace("dd", String(date.day).padStart(2, "0"))
    .replace("d", String(date.day));
}
