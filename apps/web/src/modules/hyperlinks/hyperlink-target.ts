import { quoteFormulaSheetName } from "../../shared/formula-editing/formula-input-lexical";

export type HyperlinkKind = "web" | "location" | "email";

export function readHyperlinkTarget(target: string, currentSheetName: string) {
  const value = target.trim();
  const kind: HyperlinkKind = value.startsWith("#")
    ? "location"
    : /^mailto:/i.test(value)
      ? "email"
      : "web";
  const location = value.startsWith("#") ? value.slice(1) : "A1";
  const qualified = /^(?:'((?:[^']|'')*)'|([^!]+))!(.*)$/.exec(location);
  const email = kind === "email" ? value.slice(7) : "";
  const question = email.indexOf("?");
  const emailAddress = question < 0 ? email : email.slice(0, question);
  const emailParameters = new URLSearchParams(question < 0 ? "" : email.slice(question + 1));
  return {
    kind,
    webAddress: kind === "web" ? value : "",
    sheetName: qualified
      ? (qualified[1]?.replaceAll("''", "'") ?? qualified[2]!)
      : currentSheetName,
    cellReference: qualified ? qualified[3]! : location,
    emailAddress,
    emailSubject: emailParameters.get("subject") ?? "",
    emailParameters,
  };
}

export function createLocationHyperlink(sheetName: string, reference: string): string {
  return reference.trim() ? `#${quoteFormulaSheetName(sheetName)}!${reference.trim()}` : "";
}

export function createEmailHyperlink(
  address: string,
  subject: string,
  originalParameters = new URLSearchParams(),
): string {
  if (!address.trim()) return "";
  const parameters = new URLSearchParams(originalParameters);
  if (subject) parameters.set("subject", subject);
  else parameters.delete("subject");
  const query = parameters.toString();
  return `mailto:${address.trim()}${query ? `?${query}` : ""}`;
}
