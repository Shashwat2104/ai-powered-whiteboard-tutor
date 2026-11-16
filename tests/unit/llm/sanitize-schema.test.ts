import { describe, expect, it } from "vitest";
import { z } from "zod";
import { lessonEnvelopeSchema } from "@/lib/lesson/schema";
import { GEMINI_SUPPORTED_KEYWORDS, sanitizeSchema, schemaKeywords } from "@/server/llm/sanitize-schema";

const lessonJsonSchema = z.toJSONSchema(lessonEnvelopeSchema);

describe("sanitizeSchema for Gemini", () => {
  const sanitized = sanitizeSchema(lessonJsonSchema, "gemini");

  it("the unsanitised lesson schema does use keywords Gemini rejects", () => {
    const used = schemaKeywords(lessonJsonSchema);
    expect(["const", "pattern", "minLength", "maxLength"].some((k) => used.has(k))).toBe(true);
  });

  it("removes const, pattern and length keywords", () => {
    const text = JSON.stringify(sanitized);
    for (const keyword of ["const", "pattern", "minLength", "maxLength", "$schema"]) {
      expect(text).not.toContain(`"${keyword}"`);
    }
  });

  it("uses only keywords Gemini supports", () => {
    for (const keyword of schemaKeywords(sanitized)) expect(GEMINI_SUPPORTED_KEYWORDS.has(keyword)).toBe(true);
  });

  it("keeps property names, even ones that look like keywords", () => {
    const schema = { type: "object", properties: { pattern: { type: "string", pattern: "x" }, type: { const: "a" } } };
    const out = sanitizeSchema(schema, "gemini") as { properties: Record<string, unknown> };
    expect(Object.keys(out.properties)).toEqual(["pattern", "type"]);
    expect(out.properties.pattern).toEqual({ type: "string" });
  });

  it("turns const into a one-value enum and keeps a type", () => {
    expect(sanitizeSchema({ const: "write" }, "gemini")).toEqual({ enum: ["write"], type: "string" });
    expect(sanitizeSchema({ type: "string", const: "1.0" }, "gemini")).toEqual({ type: "string", enum: ["1.0"] });
    expect(sanitizeSchema({ const: 3 }, "gemini")).toEqual({ enum: [3], type: "integer" });
  });

  it("sanitises inside unions, arrays and nested objects", () => {
    const out = JSON.stringify(
      sanitizeSchema(
        { anyOf: [{ type: "object", properties: { a: { const: "x" } } }], items: { type: "string", maxLength: 3 } },
        "gemini",
      ),
    );
    expect(out).not.toContain("const");
    expect(out).not.toContain("maxLength");
  });

  it("keeps required lists and numeric limits", () => {
    const out = sanitizeSchema(
      { type: "object", required: ["a"], properties: { a: { type: "array", minItems: 2, maxItems: 5, items: { type: "number", minimum: 0, maximum: 9 } } } },
      "gemini",
    );
    expect(JSON.stringify(out)).toContain('"required":["a"]');
    expect(JSON.stringify(out)).toContain('"minItems":2');
    expect(JSON.stringify(out)).toContain('"maximum":9');
  });
});

describe("sanitizeSchema for Anthropic", () => {
  it("leaves the schema untouched", () => {
    expect(sanitizeSchema(lessonJsonSchema, "anthropic")).toBe(lessonJsonSchema);
  });
});
