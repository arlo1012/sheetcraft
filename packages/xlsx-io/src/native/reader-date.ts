/** Read an ISO civil date/time without Date's locale-dependent shorthand parsing. */
export function readIsoDate(value: string): Date {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})?)?$/.exec(
      value.trim(),
    );
  if (!match) throw new Error("Invalid XLSX date.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4] ?? 0);
  const minute = Number(match[5] ?? 0);
  const second = Number(match[6] ?? 0);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    throw new Error("Invalid XLSX date.");
  // setUTCFullYear also handles years 1–99 without Date.UTC's 1900-year offset.
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, millisecond);
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  )
    throw new Error("Invalid XLSX date.");
  const zone = match[8];
  if (zone && zone !== "Z") {
    const zoneHour = Number(zone.slice(1, 3));
    const zoneMinute = Number(zone.slice(4, 6));
    if (zoneHour > 23 || zoneMinute > 59) throw new Error("Invalid XLSX date.");
    const offset = (zoneHour * 60 + zoneMinute) * (zone[0] === "+" ? 1 : -1);
    date.setTime(date.getTime() - offset * 60_000);
  }
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid XLSX date.");
  return date;
}
