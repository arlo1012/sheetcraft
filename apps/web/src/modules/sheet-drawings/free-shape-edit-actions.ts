export type FreeShapePointAction =
  | "add"
  | "delete"
  | "smooth"
  | "straight"
  | "corner"
  | "close"
  | "open"
  | "exit"
  | "delete-segment"
  | "add-segment"
  | "straight-segment"
  | "curved-segment";

/** Point actions address an authored vertex; segment actions address its command. */
export type FreeShapePointActionHandler = (action: FreeShapePointAction, index: number) => boolean;
