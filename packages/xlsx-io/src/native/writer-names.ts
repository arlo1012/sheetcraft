const INVALID_NAME_CHARACTERS = /[*?:\\/[\]]/;
// A worksheet title is an XML attribute, rather than an OOXML escaped cell string.
// eslint-disable-next-line no-control-regex -- Reject titles that cannot be written as XML 1.0.
const INVALID_XML_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/;

/** Reject incompatible titles instead of truncating them and breaking formula references. */
export function assertNativeWorksheetName(
  name: string,
  existingNames: Iterable<string> = [],
): void {
  if (typeof name !== "string" || !name.trim())
    throw new Error("XLSX worksheet name cannot be empty.");
  if (name.length > 31) throw new Error("XLSX worksheet name cannot exceed 31 UTF-16 units.");
  if (INVALID_NAME_CHARACTERS.test(name) || INVALID_XML_CHARACTERS.test(name))
    throw new Error("XLSX worksheet name contains an invalid character.");
  if (name.startsWith("'") || name.endsWith("'"))
    throw new Error("XLSX worksheet name cannot begin or end with an apostrophe.");
  const normalized = name.toLowerCase();
  if (normalized === "history") throw new Error("XLSX worksheet name History is reserved.");
  for (const existing of existingNames)
    if (existing.toLowerCase() === normalized)
      throw new Error("XLSX worksheet names must be unique regardless of case.");
}
