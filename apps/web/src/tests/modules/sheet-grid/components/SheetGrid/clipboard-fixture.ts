export type TestClipboard = {
  data: Map<string, string>;
  event: ClipboardEvent;
};

export function createTestClipboardEvent(
  type: "copy" | "cut" | "paste",
  initialData?: ReadonlyMap<string, string>,
): TestClipboard {
  const data = new Map(initialData);
  const clipboardData = {
    clearData(format?: string) {
      if (format) {
        data.delete(format);
      } else {
        data.clear();
      }
    },
    getData(format: string) {
      return data.get(format) ?? "";
    },
    setData(format: string, value: string) {
      data.set(format, value);
    },
    get types() {
      return [...data.keys()];
    },
  } as unknown as DataTransfer;
  const event = new Event(type, { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, "clipboardData", { value: clipboardData });

  return { data, event };
}
