// 未执行：按用户要求仅编写测试，避免额外内存占用。
import { describe, expect, test } from "vitest";
import {
  createEmailHyperlink,
  createLocationHyperlink,
  readHyperlinkTarget,
} from "../../../modules/hyperlinks/hyperlink-target";

describe("hyperlink target editing", () => {
  test.each([
    ["Quarterly plan", "#'Quarterly plan'!$B$3"],
    ["O'Brien plan", "#'O''Brien plan'!$B$3"],
  ])("round trips worksheet name %s without losing its reference", (sheetName, expected) => {
    const target = createLocationHyperlink(sheetName, "  $B$3  ");
    expect(target).toBe(expected);
    expect(readHyperlinkTarget(target, "Current")).toMatchObject({
      kind: "location",
      sheetName,
      cellReference: "$B$3",
    });
  });

  test("keeps an unqualified named target in the current worksheet", () => {
    expect(readHyperlinkTarget("#Annual_Total", "O'Brien plan")).toMatchObject({
      kind: "location",
      sheetName: "O'Brien plan",
      cellReference: "Annual_Total",
    });
  });

  test("distinguishes a web address with mailto query text from a real mail link", () => {
    const webAddress = "https://example.test/?next=mailto:person@example.test#Sheet1!A1";
    expect(readHyperlinkTarget(webAddress, "Sheet1")).toMatchObject({ kind: "web", webAddress });
    expect(
      readHyperlinkTarget(
        "MAILTO:person@example.test?subject=%E5%AD%A3%E5%BA%A6%20%2B%20review",
        "Sheet1",
      ),
    ).toMatchObject({
      kind: "email",
      emailAddress: "person@example.test",
      emailSubject: "季度 + review",
    });
  });

  test("updates an encoded subject without mutating the original mail parameters", () => {
    const original = new URLSearchParams("cc=copy%40example.test&body=First%0ASecond&subject=Old");
    const subject = "预算 & 计划 + 50% / #1?";
    const target = new URL(createEmailHyperlink(" person@example.test ", subject, original));
    expect(target.pathname).toBe("person@example.test");
    expect(target.searchParams.get("subject")).toBe(subject);
    expect(target.searchParams.getAll("subject")).toHaveLength(1);
    expect(target.searchParams.get("cc")).toBe("copy@example.test");
    expect(target.searchParams.get("body")).toBe("First\nSecond");
    expect(original.get("subject")).toBe("Old");
  });

  test("clears a mail subject while preserving the other mail fields", () => {
    const original = new URLSearchParams("subject=Old&cc=copy%40example.test&body=Keep%20me");
    const target = new URL(createEmailHyperlink("person@example.test", "", original));
    expect(target.searchParams.has("subject")).toBe(false);
    expect(target.searchParams.get("cc")).toBe("copy@example.test");
    expect(target.searchParams.get("body")).toBe("Keep me");
    expect(original.get("subject")).toBe("Old");
  });

  test("leaves incomplete worksheet and email targets empty for confirmation validation", () => {
    expect(createLocationHyperlink("Sheet1", "  ")).toBe("");
    expect(createEmailHyperlink("  ", "Subject")).toBe("");
  });
});
