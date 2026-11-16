import "server-only";

/** The only JSON Schema keywords Gemini's `responseJsonSchema` accepts. */
export const GEMINI_SUPPORTED_KEYWORDS: ReadonlySet<string> = new Set([
  "$id",
  "$defs",
  "$ref",
  "$anchor",
  "type",
  "format",
  "title",
  "description",
  "enum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "anyOf",
  "oneOf",
  "properties",
  "additionalProperties",
  "required",
  "propertyOrdering",
]);

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);

/** Keywords whose value is a map from a name to a sub-schema (the names are not keywords). */
const SCHEMA_MAPS = new Set(["properties", "$defs"]);
/** Keywords whose value is one sub-schema. */
const SCHEMA_SINGLE = new Set(["items", "additionalProperties"]);
/** Keywords whose value is a list of sub-schemas. */
const SCHEMA_LISTS = new Set(["anyOf", "oneOf", "prefixItems"]);

function typeOf(value: unknown): string {
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value === "boolean" ? "boolean" : "string";
}

function sanitizeNode(node: unknown): unknown {
  if (!isObject(node)) return node;
  const source: Json = "const" in node ? { ...node, enum: [node.const], type: node.type ?? typeOf(node.const) } : { ...node };
  delete source.const;

  const out: Json = {};
  for (const [key, value] of Object.entries(source)) {
    if (!GEMINI_SUPPORTED_KEYWORDS.has(key)) continue;
    if (SCHEMA_MAPS.has(key) && isObject(value)) {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, sanitizeNode(sub)]));
    } else if (SCHEMA_SINGLE.has(key)) {
      out[key] = sanitizeNode(value);
    } else if (SCHEMA_LISTS.has(key) && Array.isArray(value)) {
      out[key] = value.map(sanitizeNode);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Prepare a Zod-generated JSON Schema for a provider. Gemini rejects `const`, `pattern` and
 * length keywords, so `const` becomes a one-value `enum` and unsupported keywords are dropped
 * (Zod still enforces them after parsing). Anthropic's helper does its own conversion.
 */
export function sanitizeSchema(schema: unknown, provider: "anthropic" | "gemini"): unknown {
  return provider === "gemini" ? sanitizeNode(schema) : schema;
}

/** Every schema keyword used in a schema (property names are not counted). */
export function schemaKeywords(schema: unknown, found = new Set<string>()): Set<string> {
  if (!isObject(schema)) return found;
  for (const [key, value] of Object.entries(schema)) {
    found.add(key);
    if (SCHEMA_MAPS.has(key) && isObject(value)) Object.values(value).forEach((sub) => schemaKeywords(sub, found));
    else if (SCHEMA_SINGLE.has(key)) schemaKeywords(value, found);
    else if (SCHEMA_LISTS.has(key) && Array.isArray(value)) value.forEach((sub) => schemaKeywords(sub, found));
  }
  return found;
}
