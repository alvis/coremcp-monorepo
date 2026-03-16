import { fetchAllPaginated } from '#connector/pagination';

import type {
  CreateTaskResult,
  CallToolResult,
  JsonRpcRequestEnvelope,
  JsonifibleObject,
  ListToolsResult,
  McpLogLevel,
  PingRequest,
  TaskMetadata,
  TextContent,
  Tool,
} from '@coremcp/protocol';

/** callback that sends a request and returns the response */
type SendRequest = <T>(
  request: Pick<JsonRpcRequestEnvelope, 'method' | 'params'>,
) => Promise<T>;

/**
 * lists all tools available from the server
 * @param sendRequest function to send a request to the server
 * @returns array of all available tools
 */
export async function listTools(sendRequest: SendRequest): Promise<Tool[]> {
  return fetchAllPaginated<ListToolsResult, Tool>(
    sendRequest,
    'tools/list',
    ({ tools }) => tools,
    ({ nextCursor }) => nextCursor,
  );
}

/**
 * calls a tool on the server
 * @param sendRequest function to send a request to the server
 * @param name name of the tool to invoke
 * @param args optional arguments to pass to the tool
 * @returns tool execution result
 * @throws {ToolError} when the server returns a result with isError set to true
 */
export async function callTool(
  sendRequest: SendRequest,
  name: string,
  args?: JsonifibleObject,
  task?: TaskMetadata,
): Promise<CallToolResult | CreateTaskResult> {
  const result = await sendRequest<CallToolResult | CreateTaskResult>({
    method: 'tools/call',
    params: task ? { name, arguments: args, task } : { name, arguments: args },
  });

  if ('isError' in result && result.isError) {
    const message = extractErrorMessage(result as CallToolResult, name);
    throw new ToolError(message, result as CallToolResult);
  }

  return result;
}

/**
 * extracts a human-readable error message from a failed tool result
 * @param result the call tool result containing error content
 * @param name the tool name that was called
 * @returns error message string
 */
function extractErrorMessage(result: CallToolResult, name: string): string {
  const textBlock = result.content?.find(
    (block): block is TextContent => block.type === 'text',
  );

  return textBlock?.text ?? `Tool call failed: ${name}`;
}

/** error thrown when a tool call returns a result with isError set to true */
export class ToolError extends Error {
  /** the original tool result from the server */
  public readonly result: CallToolResult;

  /**
   * creates a new tool error
   * @param message error message extracted from the tool result
   * @param result the original call tool result from the server
   */
  constructor(message: string, result: CallToolResult) {
    super(message);
    this.name = 'ToolError';
    this.result = result;
  }
}

/**
 * sets the logging level on the server
 * @param sendRequest function to send a request to the server
 * @param level desired log level
 */
export async function setLogLevel(
  sendRequest: SendRequest,
  level: McpLogLevel,
): Promise<void> {
  await sendRequest<void>({
    method: 'logging/setLevel',
    params: { level },
  });
}

/**
 * sends a ping request to check server health
 * @param sendRequest function to send a request to the server
 */
export async function ping(sendRequest: SendRequest): Promise<void> {
  await sendRequest<void>({
    method: 'ping',
    params: undefined,
  } satisfies PingRequest);
}
