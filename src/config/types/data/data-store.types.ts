export type StorableValue =
  | string
  | number
  | boolean
  | StorableObject
  | Array<StorableValue>
  | null;

export interface StorableObject {
  [key: string]: StorableValue;
}
