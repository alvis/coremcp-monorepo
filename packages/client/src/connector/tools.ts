import { fetchAllPaginated } from '#connector/pagination';

import type {
  CallToolResult,
  JsonRpcRequestEnvelope,
  JsonifibleObject,
  ListToolsResult,
  McpLogLevel,
  PingRequest,
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
 */
export async function callTool(
  sendRequest: SendRequest,
  name: string,
  args?: JsonifibleObject,
): Promise<CallToolResult> {
  return sendRequest<CallToolResult>({
    method: 'tools/call',
    params: { name, arguments: args },
  });
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
