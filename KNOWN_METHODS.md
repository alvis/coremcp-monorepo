# MCP JSON-RPC Methods

This document lists all known JSON-RPC methods defined in the Model Context Protocol (MCP) specification.

TypeScript interfaces for all methods are available in [`src/methods/`](./src/methods/).

## Client-to-Server Methods

### initialize _(since 2024-11-05)_

Establishes initial connection and protocol negotiation between client and server.

**Documentation:** [Lifecycle - Initialization](https://modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle)

**Parameters:**

- `protocolVersion` (string): Latest MCP version client supports
- `capabilities` (ClientCapabilities): Client's supported capabilities
- `clientInfo` (Implementation): Client implementation details

**Response:**

- `protocolVersion` (string): MCP version server wants to use
- `capabilities` (ServerCapabilities): Server's supported capabilities
- `serverInfo` (Implementation): Server implementation details
- `instructions` (string, optional): Usage instructions for the server _(since 2025-03-26)_

---

### ping _(since 2024-11-05)_

Simple health check to verify connection status.

**Documentation:** [Utilities - Ping](https://modelcontextprotocol.io/specification/2024-11-05/basic/utilities/ping)

**Parameters:** None

**Response:** Empty result

---

### resources/list _(since 2024-11-05)_

Discover available resources from the server.

**Documentation:** [Resources - Listing Resources](https://modelcontextprotocol.io/specification/2024-11-05/server/resources)

**Parameters:**

- `cursor` (string, optional): Pagination cursor

**Response:**

- `resources` (array): List of available resources
- `nextCursor` (string, optional): Next pagination cursor

---

### resources/templates/list _(since 2025-03-26)_

Request list of resource templates from the server.

**Documentation:** [Resources - Resource Templates](https://modelcontextprotocol.io/specification/2025-03-26/server/resources)

**Parameters:**

- `cursor` (string, optional): Pagination cursor

**Response:**

- `resourceTemplates` (array): List of resource templates
- `nextCursor` (string, optional): Next pagination cursor

---

### resources/read _(since 2024-11-05)_

Read the contents of a specific resource.

**Documentation:** [Resources - Reading Resources](https://modelcontextprotocol.io/specification/2024-11-05/server/resources)

**Parameters:**

- `uri` (string): Resource URI to read

**Response:**

- `contents` (array): Resource contents (text or blob)

---

### resources/subscribe _(since 2024-11-05)_

Subscribe to updates for a specific resource.

**Documentation:** [Resources - Subscriptions](https://modelcontextprotocol.io/specification/2024-11-05/server/resources)

**Parameters:**

- `uri` (string): Resource URI to subscribe to

**Response:** Empty result

---

### resources/unsubscribe _(since 2024-11-05)_

Cancel subscription to resource updates.

**Documentation:** [Resources - Subscriptions](https://modelcontextprotocol.io/specification/2024-11-05/server/resources)

**Parameters:**

- `uri` (string): Resource URI to unsubscribe from

**Response:** Empty result

---

### prompts/list _(since 2024-11-05)_

Discover available prompts and prompt templates.

**Documentation:** [Prompts - Listing Prompts](https://modelcontextprotocol.io/specification/2024-11-05/server/prompts)

**Parameters:**

- `cursor` (string, optional): Pagination cursor

**Response:**

- `prompts` (array): List of available prompts
- `nextCursor` (string, optional): Next pagination cursor

---

### prompts/get _(since 2024-11-05)_

Retrieve a specific prompt with optional arguments.

**Documentation:** [Prompts - Getting a Prompt](https://modelcontextprotocol.io/specification/2024-11-05/server/prompts)

**Parameters:**

- `name` (string): Prompt name/identifier
- `arguments` (object, optional): Prompt arguments for templating

**Response:**

- `description` (string, optional): Prompt description
- `messages` (array): Prompt message sequence

---

### tools/list _(since 2024-11-05)_

Retrieve list of available tools.

**Documentation:** [Tools - Listing Tools](https://modelcontextprotocol.io/specification/2024-11-05/server/tools)

**Parameters:**

- `cursor` (string, optional): Pagination cursor

**Response:**

- `tools` (array): List of available tools
- `nextCursor` (string, optional): Next pagination cursor

---

### tools/call _(since 2024-11-05)_

Invoke a specific tool with arguments.

**Documentation:** [Tools - Calling Tools](https://modelcontextprotocol.io/specification/2024-11-05/server/tools)

**Parameters:**

- `name` (string): Tool name
- `arguments` (object, optional): Tool arguments

**Response:**

- `content` (array): Tool execution result
- `isError` (boolean, optional): Whether tool call resulted in error
- `structuredContent` (object, optional): Structured result data _(since 2025-06-18)_

---

### completion/complete _(since 2024-11-05)_

Request autocompletion for arguments.

**Documentation:** [Server - Completions](https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/completion)

**Parameters:**

- `ref` (PromptReference | ResourceTemplateReference): Reference to prompt or resource template
- `argument` (object): Argument information for completion
- `context` (object, optional): Additional completion context _(since 2025-06-18)_

**Response:**

- `completion` (object): Completion results with values array

---

### logging/setLevel _(since 2024-11-05)_

Set logging level for server messages.

**Documentation:** [Server - Logging](https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/logging)

**Parameters:**

- `level` (LoggingLevel): Desired logging level

**Response:** Empty result

---

## Server-to-Client Methods

### sampling/createMessage _(since 2024-11-05)_

Request LLM sampling/message generation from client.

**Documentation:** [Sampling - Creating Messages](https://modelcontextprotocol.io/specification/2024-11-05/client/sampling)

**Parameters:**

- `messages` (array): Message sequence for LLM
- `maxTokens` (integer): Maximum tokens to sample
- `systemPrompt` (string, optional): System prompt for sampling
- `modelPreferences` (ModelPreferences, optional): Model selection preferences
- `stopSequences` (array, optional): Stop sequences
- `temperature` (number, optional): Sampling temperature
- `includeContext` (string, optional): Context inclusion preference
- `metadata` (object, optional): Provider-specific metadata _(since 2025-03-26)_
- `task` (object, optional): Task metadata for asynchronous execution _(since 2025-11-25)_
- `tools` (array, optional): Available tools the model may use during sampling _(since 2025-11-25)_
- `toolChoice` (object, optional): Tool selection policy for sampling _(since 2025-11-25)_

**Response:**

- `role` (Role): Message role
- `content` (SamplingContent): Message content, which may include tool use/result blocks _(since 2025-11-25)_
- `model` (string): Model used for generation
- `stopReason` (string, optional): Reason sampling stopped, including `toolUse` _(since 2025-11-25)_

---

### roots/list _(since 2024-11-05)_

Request list of root directories/files from client.

**Documentation:** [Roots - Listing Roots](https://modelcontextprotocol.io/specification/2024-11-05/client/roots)

**Parameters:** None

**Response:**

- `roots` (array): List of root directories/files

---

### elicitation/create _(since 2025-06-18)_

Request additional user input via client.

**Documentation:** [Client - Elicitation](https://modelcontextprotocol.io/specification/2025-06-18/client/elicitation)

**Parameters:**

- `mode` (string, optional): Elicitation mode, `form` or `url` _(since 2025-11-25 URL mode)_
- `message` (string): Message to present to user
- `requestedSchema` (object): Schema for requested input
- `url` (string, required for URL mode): URL for out-of-band interaction _(since 2025-11-25)_
- `elicitationId` (string, required for URL mode): Correlation ID for URL mode completion _(since 2025-11-25)_
- `task` (object, optional): Task metadata for asynchronous execution _(since 2025-11-25)_

**Response:**

- `action` (string): User action (accept/decline/cancel)
- `content` (object, optional): Submitted form data (when action=accept)

---

## Bidirectional Methods

### tasks/get _(since 2025-11-25, experimental)_

Retrieve the latest status for a task created by a task-augmented request.

**Documentation:** [Utilities - Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)

**Parameters:**

- `taskId` (string): Task identifier to inspect

**Response:**

- `taskId` (string): Task identifier
- `status` (TaskStatus): Current task status
- `statusMessage` (string, optional): Human-readable status text
- `createdAt` (string): Task creation timestamp
- `lastUpdatedAt` (string): Task update timestamp
- `ttl` (number | null): Retention time in milliseconds
- `pollInterval` (number, optional): Suggested polling interval in milliseconds

---

### tasks/result _(since 2025-11-25, experimental)_

Retrieve the final payload for a completed task.

**Documentation:** [Utilities - Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)

**Parameters:**

- `taskId` (string): Task identifier to resolve

**Response:**

- Arbitrary JSON-RPC result payload produced by the original task-backed request

---

### tasks/list _(since 2025-11-25, experimental)_

List tasks visible to the current MCP peer.

**Documentation:** [Utilities - Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)

**Parameters:**

- `cursor` (string, optional): Pagination cursor

**Response:**

- `tasks` (array): Visible task descriptors
- `nextCursor` (string, optional): Next pagination cursor

---

### tasks/cancel _(since 2025-11-25, experimental)_

Request cancellation for a previously created task.

**Documentation:** [Utilities - Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)

**Parameters:**

- `taskId` (string): Task identifier to cancel

**Response:**

- `taskId` (string): Task identifier
- `status` (TaskStatus): Updated task status
- `statusMessage` (string, optional): Human-readable status text
- `createdAt` (string): Task creation timestamp
- `lastUpdatedAt` (string): Task update timestamp
- `ttl` (number | null): Retention time in milliseconds
- `pollInterval` (number, optional): Suggested polling interval in milliseconds

---

## Client-to-Server Notifications

### notifications/initialized _(since 2024-11-05)_

Sent from client to server after initialization is complete.

**Documentation:** [Lifecycle - Initialization](https://modelcontextprotocol.io/specification/2024-11-05/basic/lifecycle)

**Parameters:** None

---

### notifications/roots/list_changed _(since 2024-11-05)_

Client notification that roots list has changed.

**Documentation:** [Roots - Root List Changes](https://modelcontextprotocol.io/specification/2024-11-05/client/roots)

**Parameters:** None

---

## Server-to-Client Notifications

### notifications/resources/list_changed _(since 2024-11-05)_

Server notification that available resources list has changed.

**Documentation:** [Resources - List Changed Notification](https://modelcontextprotocol.io/specification/2024-11-05/server/resources)

**Parameters:** None

---

### notifications/resources/updated _(since 2024-11-05)_

Server notification that a specific resource has been updated.

**Documentation:** [Resources - Subscriptions](https://modelcontextprotocol.io/specification/2024-11-05/server/resources)

**Parameters:**

- `uri` (string): URI of updated resource

---

### notifications/prompts/list_changed _(since 2024-11-05)_

Server notification that available prompts list has changed.

**Documentation:** [Prompts - List Changed Notification](https://modelcontextprotocol.io/specification/2024-11-05/server/prompts)

**Parameters:** None

---

### notifications/tools/list_changed _(since 2024-11-05)_

Server notification that available tools list has changed.

**Documentation:** [Tools - List Changed Notification](https://modelcontextprotocol.io/specification/2024-11-05/server/tools)

**Parameters:** None

---

### notifications/message _(since 2024-11-05)_

Server log message notification to client.

**Documentation:** [Server - Logging](https://modelcontextprotocol.io/specification/2024-11-05/server/utilities/logging)

**Parameters:**

- `level` (LoggingLevel): Log message severity
- `data` (any): Log data/message
- `logger` (string, optional): Logger name

---

### notifications/elicitation/complete _(since 2025-11-25)_

Server notification that a URL-based elicitation flow finished outside the JSON-RPC response channel.

**Documentation:** [Client - Elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)

**Parameters:**

- `elicitationId` (string): Identifier from the original URL mode `elicitation/create` request

---

## Bidirectional Notifications

### notifications/cancelled _(since 2025-03-26)_

Indicates cancellation of a previously-issued request. Can be sent by either client or server.

**Documentation:** [Utilities - Cancellation](https://modelcontextprotocol.io/specification/2025-03-26/basic/cancellation)

**Parameters:**

- `requestId` (RequestId): ID of request to cancel
- `reason` (string, optional): Cancellation reason

---

### notifications/progress _(since 2025-03-26)_

Progress update for long-running requests. Can be sent by either client or server.

**Documentation:** [Utilities - Progress](https://modelcontextprotocol.io/specification/2025-03-26/basic/progress)

**Parameters:**

- `progressToken` (ProgressToken): Token from original request
- `progress` (number): Current progress value
- `total` (number, optional): Total progress required
- `message` (string, optional): Progress description

---

### notifications/tasks/status _(since 2025-11-25, experimental)_

Task status change notification for peers that support push-style task updates.

**Documentation:** [Utilities - Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks)

**Parameters:**

- `taskId` (string): Task identifier
- `status` (TaskStatus): Current task state
- `statusMessage` (string, optional): Human-readable status text
- `createdAt` (string): Task creation timestamp
- `lastUpdatedAt` (string): Task update timestamp
- `ttl` (number | null): Retention time in milliseconds
- `pollInterval` (number, optional): Suggested polling interval in milliseconds

---

## Data Types

### LoggingLevel _(since 2024-11-05)_

Enum: `emergency`, `alert`, `critical`, `error`, `warning`, `notice`, `info`, `debug`

### Role _(since 2024-11-05)_

Enum: `user`, `assistant`

### ContentBlock _(since 2024-11-05)_

Union of: `TextContent` _(since 2024-11-05)_, `ImageContent` _(since 2024-11-05)_, `AudioContent` _(since 2025-03-26)_, `ResourceLink` _(since 2025-06-18)_, `EmbeddedResource` _(since 2024-11-05)_

### SamplingContent _(since 2024-11-05)_

Union of: `TextContent` _(since 2024-11-05)_, `ImageContent` _(since 2024-11-05)_, `AudioContent` _(since 2025-03-26)_, `ToolUseContent` _(since 2025-11-25)_, `ToolResultContent` _(since 2025-11-25)_, or an array containing those values

### RequestId _(since 2024-11-05)_

String or integer uniquely identifying a JSON-RPC request

### ProgressToken _(since 2025-03-26)_

String or integer for associating progress notifications with requests

### TaskStatus _(since 2025-11-25, experimental)_

Enum: `working`, `input_required`, `completed`, `failed`, `cancelled`
