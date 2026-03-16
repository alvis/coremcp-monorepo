import { Ajv } from 'ajv';

import type {
  JsonSchema,
  ToolAnnotations,
  ToolExecution,
  Tool,
} from '@coremcp/protocol';

/** supported MCP specification versions */
export type SupportedVersion =
  | '2024-11-05'
  | '2025-03-26'
  | '2025-06-18'
  | '2025-11-25';

/** executable tool implementation with version-specific spec generation */
export class ServerTool<Input, Output> implements Tool {
  /** unique identifier for the tool */
  #name: string;
  /** human-readable display name for UI contexts */
  #title?: string;
  /** human-readable explanation of what this tool does */
  #description?: string;
  /** optionally-sized icons for UI display */
  #icons?: Tool['icons'];
  /** JSON Schema defining the structure of arguments this tool accepts */
  #inputSchema: JsonSchema;
  /** JSON Schema defining the structure of return values */
  #outputSchema?: JsonSchema;
  /** execution-related metadata */
  #execution?: ToolExecution;
  /** optional metadata or annotations */
  #annotations?: ToolAnnotations;
  /** function that executes the tool's logic */
  #execute: (input: Input) => Promise<Output>;

  #verifyInput: (input: unknown) => asserts input is Input;

  /**
   * creates a new tool instance
   * @param params tool specification and execution function
   */
  constructor(params: Tool & { execute: (input: Input) => Promise<Output> }) {
    this.#name = params.name;
    this.#title = params.title;
    this.#description = params.description;
    this.#icons = params.icons;
    this.#inputSchema = params.inputSchema;
    this.#outputSchema = params.outputSchema;
    this.#execution = params.execution;
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
  public get description(): string | undefined {
    return this.#description;
  }

  /** optionally-sized icons for UI contexts */
  public get icons(): Tool['icons'] | undefined {
    return this.#icons;
  }

  /** JSON Schema defining the structure of arguments this tool accepts */
  public get inputSchema(): JsonSchema {
    return this.#inputSchema;
  }

  /** JSON Schema defining the structure of return values */
  public get outputSchema(): JsonSchema | undefined {
    return this.#outputSchema;
  }

  /** execution-related metadata */
  public get execution(): ToolExecution | undefined {
    return this.#execution;
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
  public toSpec(version: SupportedVersion): Tool {
    // base fields available since 2024-11-05
    const base: Tool = {
      name: this.name,
      description: this.description,
      icons: this.icons,
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
      case '2025-11-25':
      default:
        // return latest spec for unknown versions
        return {
          ...base,
          // annotations added in 2025-03-26
          annotations: this.annotations,
          // title and outputSchema added in 2025-06-18,
          title: this.title,
          execution: this.execution,
          outputSchema: this.outputSchema,
        };
    }
  }
}
