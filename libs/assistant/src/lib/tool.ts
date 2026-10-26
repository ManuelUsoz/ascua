export interface JsonSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean';
  description?: string;
  enum?: readonly (string | number)[];
}

export interface JsonSchema {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export type ToolEffect = 'read' | 'write';

export interface ToolContext {
  signal: AbortSignal;
}

/** Data for the confirmation UI (names, the exact command), never prose. */
export interface ConfirmationSummary {
  params: Record<string, string>;
  detail?: string;
}

export interface ToolDefinition<I = any> {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  effect: ToolEffect;
  /** Set to false on a write tool that is safe to run without asking. */
  confirm?: false;
  /** May throw `ToolInputError` for unknown ids. */
  summarize?(input: I): Promise<ConfirmationSummary>;
  run(input: I, ctx: ToolContext): Promise<unknown>;
}

export function needsConfirmation(
  tool: Pick<ToolDefinition, 'effect' | 'confirm'>,
): boolean {
  return tool.effect === 'write' && tool.confirm !== false;
}

/** Thrown by `run` for checks the schema cannot express (lookups, cross-field). */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

/** Returns a model-facing problem description, or undefined when valid. */
export function validateInput(
  schema: JsonSchema,
  input: unknown,
): string | undefined {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return 'input must be an object'; // i18n-ignore
  }
  const record = input as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (record[key] === undefined) return `missing required field "${key}"`; // i18n-ignore
  }
  for (const [key, value] of Object.entries(record)) {
    const prop = schema.properties[key];
    if (!prop) return `unknown field "${key}"`; // i18n-ignore
    if (value === undefined) continue;
    if (!matchesType(prop.type, value)) {
      return `field "${key}" must be ${prop.type}`; // i18n-ignore
    }
    if (prop.enum && !prop.enum.includes(value as string | number)) {
      return `field "${key}" must be one of ${prop.enum.join(', ')}`; // i18n-ignore
    }
  }
  return undefined;
}

function matchesType(
  type: JsonSchemaProperty['type'],
  value: unknown,
): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
  }
}
