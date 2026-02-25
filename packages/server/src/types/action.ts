import type {
  CreateMessageRequest,
  CreateMessageResult,
  ElicitResult,
  McpLogLevel,
  Resource,
  Root,
  SamplingMessage,
  Tool,
} from '@coremcp/protocol';
import type { JSONSchemaType } from 'ajv';

/** server-side action interface providing all capabilities that an mcp server can perform */
export interface ServerAction {
  // client requests //
  /** requests additional user input via client elicitation */
  requestUserInput: (
    message: string,
    requestedSchema: JSONSchemaType<unknown>,
  ) => Promise<ElicitResult>;
  /** requests llm sampling/message generation from client */
  requestSample: (
    messages: SamplingMessage[],
    options?: Partial<Omit<CreateMessageRequest['params'], 'messages'>>,
  ) => Promise<CreateMessageResult>;
  /** requests list of root directories/files from client */
  requestClientRoots: () => Promise<Root[]>;

  // resource management //
  /** adds a new resource to the server's available resources */
  addResource: (resource: Resource) => void;
  /** removes an existing resource from the server */
  removeResource: (uri: string) => boolean;
  /** removes all resources from the server */
  clearResources: () => void;
  /** replaces all current resources with a new set */
  setResources: (resources: Resource[]) => void;

  // tool management //
  /** adds a new tool to the server's available tools */
  addTool: (tool: Tool) => void;
  /** removes an existing tool from the server */
  removeTool: (name: string) => boolean;
  /** removes all tools from the server */
  clearTools: () => void;
  /** replaces all current tools with a new set */
  setTools: (tools: Tool[]) => void;

  // logging //
  /** sends a log message to the client */
  log: (level: McpLogLevel, data: unknown, logger?: string) => void;
}
