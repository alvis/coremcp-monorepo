import { exec } from 'node:child_process';
import { promisify } from 'node:util';

// CONSTANTS //

/** default timeout for inspector commands (30 seconds) */
const DEFAULT_INSPECTOR_TIMEOUT = 30_000;

/** inspector CLI package name */
const INSPECTOR_PACKAGE = '@modelcontextprotocol/inspector';

// TYPES //

/** transport type for MCP connections */
export type InspectorTransport = 'stdio' | 'http';

/** method names for listing operations */
export type InspectorListMethod =
  | 'tools/list'
  | 'resources/list'
  | 'prompts/list'
  | 'resources/templates/list';

/** options for running inspector commands */
export interface InspectorOptions {
  /** target server (command for stdio, URL for http) */
  target: string;
  /** transport type */
  transport: InspectorTransport;
  /** command timeout in milliseconds */
  timeout?: number;
}

/** result from inspector command execution */
export interface InspectorResult {
  /** whether the command succeeded */
  success: boolean;
  /** parsed result data on success */
  result?: unknown;
  /** error message on failure */
  error?: string;
}

// HELPERS //

const execAsync = promisify(exec);

/**
 * builds the base inspector CLI command
 * @param options inspector options with target and transport
 * @returns array of command parts
 */
function buildBaseCommand(options: InspectorOptions): string[] {
  const parts = ['npx', INSPECTOR_PACKAGE, '--cli', options.target];

  if (options.transport === 'http') {
    parts.push('--transport', 'http');
  }

  return parts;
}

/**
 * executes an inspector command and parses the result
 * @param commandParts array of command parts to execute
 * @param timeout command timeout in milliseconds
 * @returns inspector result with success status and parsed data
 */
async function executeInspectorCommand(
  commandParts: string[],
  timeout: number,
): Promise<InspectorResult> {
  const command = commandParts.join(' ');

  try {
    const { stdout } = await execAsync(command, {
      timeout,
      encoding: 'utf-8',
    });

    const trimmedOutput = stdout.trim();

    // handle empty output
    if (!trimmedOutput) {
      return { success: true, result: null };
    }

    // parse JSON output
    const parsed: unknown = JSON.parse(trimmedOutput);

    return { success: true, result: parsed };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    return { success: false, error: errorMessage };
  }
}

/**
 * escapes a string value for shell command usage
 * @param value string to escape
 * @returns escaped string safe for shell
 */
function escapeShellArg(value: string): string {
  // escape single quotes by ending the quote, adding escaped quote, and starting new quote
  return `'${value.replace(/'/g, "'\\''")}'`;
}

// FUNCTIONS //

/**
 * runs inspector CLI to list items using specified method
 * @param options inspector options with target and transport
 * @param method list method to invoke (tools/list, resources/list, etc.)
 * @returns inspector result with success status and listed items
 */
export async function runInspectorList(
  options: InspectorOptions,
  method: InspectorListMethod,
): Promise<InspectorResult> {
  const timeout = options.timeout ?? DEFAULT_INSPECTOR_TIMEOUT;
  const commandParts = [
    ...buildBaseCommand(options),
    '--method',
    escapeShellArg(method),
  ];

  return executeInspectorCommand(commandParts, timeout);
}

/**
 * calls a tool via inspector CLI
 * @param options inspector options with target and transport
 * @param toolName name of the tool to call
 * @param args optional arguments to pass to the tool
 * @returns inspector result with success status and tool output
 */
export async function runInspectorToolCall(
  options: InspectorOptions,
  toolName: string,
  args?: Record<string, unknown>,
): Promise<InspectorResult> {
  const timeout = options.timeout ?? DEFAULT_INSPECTOR_TIMEOUT;
  const commandParts = [
    ...buildBaseCommand(options),
    '--method',
    escapeShellArg('tools/call'),
    '--tool-name',
    escapeShellArg(toolName),
  ];

  if (args && Object.keys(args).length > 0) {
    commandParts.push('--tool-args', escapeShellArg(JSON.stringify(args)));
  }

  return executeInspectorCommand(commandParts, timeout);
}

/**
 * reads a resource via inspector CLI
 * @param options inspector options with target and transport
 * @param uri URI of the resource to read
 * @returns inspector result with success status and resource contents
 */
export async function runInspectorResourceRead(
  options: InspectorOptions,
  uri: string,
): Promise<InspectorResult> {
  const timeout = options.timeout ?? DEFAULT_INSPECTOR_TIMEOUT;
  const commandParts = [
    ...buildBaseCommand(options),
    '--method',
    escapeShellArg('resources/read'),
    '--uri',
    escapeShellArg(uri),
  ];

  return executeInspectorCommand(commandParts, timeout);
}

/**
 * gets a prompt via inspector CLI
 * @param options inspector options with target and transport
 * @param promptName name of the prompt to get
 * @param args optional arguments to pass to the prompt
 * @returns inspector result with success status and prompt messages
 */
export async function runInspectorPromptGet(
  options: InspectorOptions,
  promptName: string,
  args?: Record<string, string>,
): Promise<InspectorResult> {
  const timeout = options.timeout ?? DEFAULT_INSPECTOR_TIMEOUT;
  const commandParts = [
    ...buildBaseCommand(options),
    '--method',
    escapeShellArg('prompts/get'),
    '--prompt-name',
    escapeShellArg(promptName),
  ];

  if (args && Object.keys(args).length > 0) {
    commandParts.push('--prompt-args', escapeShellArg(JSON.stringify(args)));
  }

  return executeInspectorCommand(commandParts, timeout);
}
