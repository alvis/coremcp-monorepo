import { Ajv } from 'ajv';

import type {
  JsonSchema,
  ToolAnnotations,
  Tool as ToolSpec,
} from '@coremcp/protocol';

/** supported MCP specification versions */
export type SupportedVersion = '2024-11-05' | '2025-03-26' | '2025-06-18';

/** executable tool implementation with version-specific spec generation */
export class ServerTool<Input, Output> implements ToolSpec {
  /** unique identifier for the tool */
  #name: string;
  /** human-readable display name for UI contexts */
  #title?: string;
  /** human-readable explanation of what this tool does */
  #description: string;
  /** JSON Schema defining the structure of arguments this tool accepts */
  #inputSchema: JsonSchema;
  /** JSON Schema defining the structure of return values */
  #outputSchema?: JsonSchema;
  /** optional metadata or annotations */
  #annotations?: ToolAnnotations;
  /** function that executes the tool's logic */
  #execute: (input: Input) => Promise<Output>;

  #verifyInput: (input: unknown) => asserts input is Input;

  /**
   * creates a new tool instance
   * @param params tool specification and execution function
   */
  constructor(
    params: ToolSpec & { execute: (input: Input) => Promise<Output> },
  ) {
    this.#name = params.name;
    this.#title = params.title;
    this.#description = params.description;
    this.#inputSchema = params.inputSchema;
    this.#outputSchema = params.outputSchema;
    this.#annotations = params.annotations;
    this.#execute = params.execute;

    const ajv = new Ajv();
    const verifyInput = ajv.compile(params.inputSchema);

    this.#verifyInput = (data: unknown) => {
      const isValid = verifyInput(data);

      if (!isValid) {
        const errors = verifyInput.errors
          ? verifyInput.errors
              .map(
                (error) => `${error.instancePath || 'root'}: ${error.message}`,
              )
              .join(', ')
          : 'validation failed';
        throw new Error(`Invalid input data: ${errors}`);
      }
    };
  }

  /** unique identifier for the tool */
  public get name(): string {
    return this.#name;
  }

  /** human-readable display name for UI contexts */
  public get title(): string | undefined {
    return this.#title;
  }

  /** human-readable explanation of what this tool does */
  public get description(): string {
    return this.#description;
  }

  /** JSON Schema defining the structure of arguments this tool accepts */
  public get inputSchema(): JsonSchema {
    return this.#inputSchema;
  }

  /** JSON Schema defining the structure of return values */
  public get outputSchema(): JsonSchema | undefined {
    return this.#outputSchema;
  }

  /** optional metadata or annotations */
  public get annotations(): ToolAnnotations | undefined {
    return this.#annotations;
  }

  /**
   * executes the tool with provided input
   * @param input tool input data
   * @returns tool execution result
   */
  public async execute(input: Input): Promise<Output> {
    this.#verifyInput(input);

    return this.#execute(input);
  }

  /**
   * generates tool specification for the given MCP version
   * @param version target MCP specification version
   * @returns tool specification with version-appropriate fields
   */
  public toSpec(version: SupportedVersion): ToolSpec {
    // base fields available since 2024-11-05
    const base: ToolSpec = {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };

    switch (version) {
      case '2024-11-05':
        // only base fields available in initial version
        return base;
      case '2025-03-26':
        return {
          ...base,
          // annotations added in 2025-03-26
          annotations: this.annotations,
        };
      case '2025-06-18':
      default:
        // return latest spec for unknown versions
        return {
          ...base,
          // annotations added in 2025-03-26
          annotations: this.annotations,
          // title and outputSchema added in 2025-06-18,
          title: this.title,
          outputSchema: this.outputSchema,
        };
    }
  }
}
