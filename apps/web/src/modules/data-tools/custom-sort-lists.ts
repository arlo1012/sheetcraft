export type CustomSortList = {
  id: string;
  values: string[];
};

const STORAGE_KEY = "idea10.sort.customLists";
const STORAGE_VERSION = 1;
const BUILTIN_ID_PREFIX = "builtin:";

export const BUILTIN_SORT_LISTS: readonly CustomSortList[] = [
  {
    id: "builtin:weekday-short-en",
    values: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  },
  {
    id: "builtin:weekday-en",
    values: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
  },
  {
    id: "builtin:month-short-en",
    values: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  },
  {
    id: "builtin:month-en",
    values: [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ],
  },
  {
    id: "builtin:weekday-zh",
    values: ["日", "一", "二", "三", "四", "五", "六"],
  },
  {
    id: "builtin:weekday-full-zh",
    values: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
  },
  {
    id: "builtin:month-zh",
    values: [
      "一月",
      "二月",
      "三月",
      "四月",
      "五月",
      "六月",
      "七月",
      "八月",
      "九月",
      "十月",
      "十一月",
      "十二月",
    ],
  },
  {
    id: "builtin:quarter-zh",
    values: ["第一季", "第二季", "第三季", "第四季"],
  },
  {
    id: "builtin:lunar-month-zh",
    values: [
      "正月",
      "二月",
      "三月",
      "四月",
      "五月",
      "六月",
      "七月",
      "八月",
      "九月",
      "十月",
      "冬月",
      "腊月",
    ],
  },
  {
    id: "builtin:earthly-branches-zh",
    values: ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"],
  },
  {
    id: "builtin:heavenly-stems-zh",
    values: ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"],
  },
];

function getStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function isCustomSortList(value: unknown): value is CustomSortList {
  if (!value || typeof value !== "object") return false;
  const { id, values } = value as Record<string, unknown>;
  return (
    typeof id === "string" &&
    id.length > 0 &&
    !id.startsWith(BUILTIN_ID_PREFIX) &&
    Array.isArray(values) &&
    values.length > 0 &&
    values.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

function isCustomSortListCollection(value: unknown): value is CustomSortList[] {
  return (
    Array.isArray(value) &&
    value.every(isCustomSortList) &&
    new Set(value.map((list) => list.id)).size === value.length
  );
}

function cloneLists(lists: readonly CustomSortList[]): CustomSortList[] {
  return lists.map((list) => ({ id: list.id, values: [...list.values] }));
}

/** Parses one list item per line, preserving each item's exact content after trimming. */
export function parseCustomSortList(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
}

export function readCustomSortLists(): CustomSortList[] {
  const storage = getStorage();
  if (!storage) return [];
  try {
    const stored: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
    if (
      !stored ||
      typeof stored !== "object" ||
      !Object.hasOwn(stored, "version") ||
      !Object.hasOwn(stored, "lists") ||
      (stored as { version: unknown }).version !== STORAGE_VERSION ||
      !isCustomSortListCollection((stored as { lists: unknown }).lists)
    )
      return [];
    return cloneLists((stored as { lists: CustomSortList[] }).lists);
  } catch {
    return [];
  }
}

export function writeCustomSortLists(lists: readonly CustomSortList[]): boolean {
  if (!isCustomSortListCollection(lists)) return false;
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION, lists: cloneLists(lists) }),
    );
    return true;
  } catch {
    return false;
  }
}
