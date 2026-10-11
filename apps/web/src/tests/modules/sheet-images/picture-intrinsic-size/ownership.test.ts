import { describe, expect, test } from "vitest";
import { fixture, image, MockImage, source } from "./fixture";

describe("intrinsic dimension owner and URL leases", () => {
  test("a new owner immediately detaches the previous decoder and ignores its late callbacks", () => {
    const f = fixture();
    const old = image();
    const lateLoad = old.onload!;
    const lateError = old.onerror!;
    f.owner.value = { id: "new-owner" };
    expect(old.onload).toBeNull();
    expect(old.onerror).toBeNull();
    expect(old.src).toBe("");
    expect(MockImage.instances.filter((entry) => entry.src)).toHaveLength(1);
    old.naturalWidth = 400;
    old.naturalHeight = 300;
    lateLoad();
    lateError();
    expect(f.value.status.value).toBe("loading");
    expect(f.value.size.value).toBeUndefined();
    image().succeed(200, 100);
    lateError();
    expect(f.value.status.value).toBe("ready");
    expect(f.value.size.value).toMatchObject({ width: 200, height: 100 });
  });

  test("owner ABA cannot reuse an in-flight decoder's old authority", () => {
    const f = fixture();
    const firstOwner = f.owner.value;
    const old = image();
    const late = old.onload!;
    f.owner.value = { id: "intermediate" };
    f.owner.value = firstOwner;
    expect(MockImage.instances).toHaveLength(3);
    old.naturalWidth = 400;
    old.naturalHeight = 300;
    late();
    expect(f.value.status.value).toBe("loading");
    expect(f.value.size.value).toBeUndefined();
    image().succeed(100, 50);
    expect(f.value.size.value).toMatchObject({ width: 100, height: 50 });
  });

  test("URL replacement clears displayed dimensions and does not keep the previous URL's cache", () => {
    const f = fixture();
    image().succeed(400, 300);
    f.selected.value = source("first", "blob:new-url");
    expect(f.value.status.value).toBe("loading");
    expect(f.value.size.value).toBeUndefined();
    expect(image().assignedSources).toEqual(["blob:new-url"]);
    image().succeed(120, 80);
    expect(f.value.size.value).toEqual({
      ...source("first", "blob:new-url"),
      width: 120,
      height: 80,
    });
  });

  test("source URL ABA ignores the first in-flight URL even after it becomes current again", () => {
    const f = fixture();
    const old = image();
    const late = old.onload!;
    f.selected.value = source("first", "blob:second-url");
    f.selected.value = source("first");
    expect(MockImage.instances).toHaveLength(3);
    expect(MockImage.instances.filter((entry) => entry.src)).toHaveLength(1);
    old.naturalWidth = 500;
    old.naturalHeight = 500;
    late();
    expect(f.value.status.value).toBe("loading");
    expect(f.value.size.value).toBeUndefined();
    image().succeed(100, 50);
    expect(f.value.size.value).toMatchObject({ width: 100, height: 50 });
  });

  test("closing the pane clears dimensions and cancels the loader without revoking its URL", () => {
    const f = fixture();
    const old = image();
    const late = old.onload!;
    f.selected.value = undefined;
    expect(old.onload).toBeNull();
    expect(old.src).toBe("");
    old.naturalWidth = 100;
    old.naturalHeight = 50;
    late();
    expect(f.value.status.value).toBe("idle");
    expect(f.value.size.value).toBeUndefined();
    f.selected.value = source("first");
    expect(MockImage.instances).toHaveLength(2);
    image().succeed(100, 50);
    f.selected.value = undefined;
    expect(f.value.status.value).toBe("idle");
    expect(f.value.size.value).toBeUndefined();
    f.selected.value = source("first");
    expect(MockImage.instances).toHaveLength(2);
    expect(f.value.status.value).toBe("ready");
    expect(f.value.size.value).toMatchObject({ width: 100, height: 50 });
  });

  test("successful asset and URL dimensions may be reused under a new owner", () => {
    const f = fixture();
    image().succeed(300, 200);
    f.owner.value = { id: "new-owner" };
    expect(MockImage.instances).toHaveLength(1);
    expect(f.value.status.value).toBe("ready");
    expect(f.value.size.value).toEqual({ ...source("first"), width: 300, height: 200 });
    f.value.retry();
    expect(MockImage.instances).toHaveLength(1);
  });

  test("another asset with the same URL cannot inherit the successful asset's dimensions", () => {
    const f = fixture();
    image().succeed(300, 200);
    f.selected.value = source("other", "blob:first");
    expect(MockImage.instances).toHaveLength(2);
    expect(f.value.status.value).toBe("loading");
    expect(f.value.size.value).toBeUndefined();
    image().succeed(120, 60);
    expect(f.value.size.value).toEqual({
      ...source("other", "blob:first"),
      width: 120,
      height: 60,
    });
  });

  test("late completion cannot contaminate the single successful-source cache", () => {
    const f = fixture();
    const old = image();
    const late = old.onload!;
    f.selected.value = source("second");
    image().succeed(200, 100);
    old.naturalWidth = 300;
    old.naturalHeight = 150;
    late();
    f.selected.value = source("first");
    expect(MockImage.instances).toHaveLength(3);
    expect(f.value.status.value).toBe("loading");
    expect(f.value.size.value).toBeUndefined();
  });

  test("scope disposal revokes callback authority and prevents retry or reactive restart", () => {
    const f = fixture();
    const old = image();
    const lateLoad = old.onload!;
    const lateError = old.onerror!;
    f.scope.stop();
    expect(old.onload).toBeNull();
    expect(old.onerror).toBeNull();
    expect(old.src).toBe("");
    old.naturalWidth = 300;
    old.naturalHeight = 200;
    lateLoad();
    lateError();
    f.value.retry();
    f.selected.value = source("second");
    f.owner.value = { id: "new-owner" };
    expect(MockImage.instances).toHaveLength(1);
    expect(f.value.status.value).toBe("idle");
    expect(f.value.size.value).toBeUndefined();
  });

  test("disposing a ready source clears its displayed dimensions", () => {
    const f = fixture();
    image().succeed(300, 200);
    f.scope.stop();
    expect(f.value.status.value).toBe("idle");
    expect(f.value.size.value).toBeUndefined();
  });
});
