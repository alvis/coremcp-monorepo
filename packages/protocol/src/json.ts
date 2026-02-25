/** basic json primitive values */
export type JsonPrimitive = string | number | boolean | null;

/** json object with string keys */
export type JsonObject = { [key: string]: JsonValue };
/** json array containing any json values */
export type JsonArray = JsonValue[];
/** any valid json value */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** any jsonifible valid json value including undefined */
export type JsonifibleValue =
  | JsonPrimitive
  | JsonifibleObject
  | JsonObject
  | Array<JsonPrimitive | JsonifibleObject>
  | undefined;

/** jsonifible object with string keys */
export type JsonifibleObject = { [key: string]: JsonifibleValue };
