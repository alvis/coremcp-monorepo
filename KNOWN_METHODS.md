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

**Response:**

- `role` (Role): Message role
- `content` (ContentBlock): Message content
- `model` (string): Model used for generation
- `stopReason` (string, optional): Reason sampling stopped

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

- `message` (string): Message to present to user
- `requestedSchema` (object): Schema for requested input

**Response:**

- `action` (string): User action (accept/decline/cancel)
- `content` (object, optional): Submitted form data (when action=accept)

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

## Data Types

### LoggingLevel _(since 2024-11-05)_

Enum: `emergency`, `alert`, `critical`, `error`, `warning`, `notice`, `info`, `debug`

### Role _(since 2024-11-05)_

Enum: `user`, `assistant`

### ContentBlock _(since 2024-11-05)_

Union of: `TextContent` _(since 2024-11-05)_, `ImageContent` _(since 2024-11-05)_, `AudioContent` _(since 2025-03-26)_, `ResourceLink` _(since 2025-06-18)_, `EmbeddedResource` _(since 2024-11-05)_

### RequestId _(since 2024-11-05)_

String or integer uniquely identifying a JSON-RPC request

### ProgressToken _(since 2025-03-26)_

String or integer for associating progress notifications with requests
