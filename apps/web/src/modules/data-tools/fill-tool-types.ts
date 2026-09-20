export type FillSeriesDraft = {
  axis: "rows" | "columns";
  type: "linear" | "growth" | "date" | "auto";
  step: number;
  stop: string;
  dateUnit: "day" | "weekday" | "month" | "year";
  trend: boolean;
};

export type FillBlanksDraft = {
  mode: "up" | "down" | "left" | "right" | "value";
  value: string;
};

export type FillTextDraft = {
  position: "start" | "end" | "index";
  from: "left" | "right";
  index: number;
  text: string;
};

export type FillCurrentDateDraft = {
  year: number;
  month: number;
  day: number;
  format: string;
};
