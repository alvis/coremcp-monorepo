# Lifecycle

Protocol Revision: 2025-06-18

The Model Context Protocol (MCP) defines a rigorous lifecycle for client-server connections that ensures proper capability negotiation and state management.

1. Initialization: Capability negotiation and protocol version agreement
2. Operation: Normal protocol communication
3. Shutdown: Graceful termination of the connection

## Lifecycle Phases

### Initialization

The initialization phase MUST be the first interaction between client and server. During this phase, the client and server:

- Establish protocol version compatibility
- Exchange and negotiate capabilities
- Share implementation details

The client MUST initiate this phase by sending an `initialize` request containing:

- Protocol version supported
- Client capabilities
- Client implementation information

Example:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "roots": {
        "listChanged": true
      },
      "sampling": {},
      "elicitation": {}
    },
    "clientInfo": {
      "name": "ExampleClient",
      "title": "Example Client Display Name",
      "version": "1.0.0"
    }
  }
}
```

The server MUST respond with its own capabilities and information:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": {
      "logging": {},
      "prompts": {
        "listChanged": true
      },
      "resources": {
        "subscribe": true,
        "listChanged": true
      },
      "tools": {
        "listChanged": true
      }
    },
    "serverInfo": {
      "name": "ExampleServer",
      "title": "Example Server Display Name",
      "version": "1.0.0"
    },
    "instructions": "Optional instructions for the client"
  }
}
```

After successful initialization, the client MUST send an `initialized` notification to indicate it is ready to begin normal operations:

```json
{
  "jsonrpc": "2.0",
  "method": "notifications/initialized"
}
```

- The client SHOULD NOT send requests other than pings before the server has responded to the `initialize` request.
- The server SHOULD NOT send requests other than pings and logging before receiving the `initialized` notification.

\***\*Compliance Checklist\*\***

- it should accept an `initialize` request and respond with a valid JSON-RPC response containing `protocolVersion`, `capabilities`, and `serverInfo`
- it should reject any requests other than pings before the `initialize` response is sent
- it should accept an `initialized` notification only after its `initialize` response has been sent

#### Version Negotiation

In the `initialize` request, the client MUST send a protocol version it supports. This SHOULD be the latest version supported by the client.

If the server supports the requested protocol version, it MUST respond with the same version. Otherwise, the server MUST respond with another protocol version it supports. This SHOULD be the latest version supported by the server.

If the client does not support the version in the server’s response, it SHOULD disconnect.

If using HTTP, the client MUST include the `MCP-Protocol-Version: <protocol-version>` HTTP header on all subsequent requests to the MCP server.

\***\*Compliance Checklist\*\***

- it should echo back the client’s requested `protocolVersion` if supported
- it should respond with an alternative supported protocol version if the requested one is unsupported
- it should include an `MCP-Protocol-Version` HTTP header on all subsequent HTTP requests

#### Capability Negotiation

Client and server capabilities establish which optional protocol features will be available during the session.

Key capabilities include:

- Client `roots` — Ability to provide filesystem roots
- Client `sampling` — Support for LLM sampling requests
- Client `elicitation` — Support for server elicitation requests
- Client `experimental` — Describes support for non-standard experimental features
- Server `prompts` — Offers prompt templates
- Server `resources` — Provides readable resources
- Server `tools` — Exposes callable tools
- Server `logging` — Emits structured log messages
- Server `completions` — Supports argument autocompletion
- Server `experimental` — Describes support for non-standard experimental features

Capability objects can describe sub-capabilities like:

- `listChanged`: Support for list change notifications
- `subscribe`: Support for subscribing to individual items’ changes (resources only)

\***\*Compliance Checklist\*\***

- it should advertise only the capabilities it actually supports under the `capabilities` object
- it should negotiate sub-capabilities correctly (e.g. `listChanged`, `subscribe`) and document them in its response
- it should error if required capabilities (e.g. filesystem roots) are not supported

### Operation

During the operation phase, the client and server exchange messages according to the negotiated capabilities.

Both parties MUST:

- Respect the negotiated protocol version
- Only use capabilities that were successfully negotiated

\***\*Compliance Checklist\*\***

- it should accept and handle only those methods and notifications covered by the negotiated capabilities
- it should reject (with a proper JSON-RPC error) any method/use of a capability that was not negotiated
- it should maintain protocol version consistency throughout the session

### Shutdown

During the shutdown phase, one side (usually the client) cleanly terminates the protocol connection. No specific shutdown messages are defined—instead, the underlying transport mechanism should be used to signal connection termination:

\***\*Compliance Checklist\*\***

- it should allow a clean shutdown by closing the HTTP connection (for HTTP transport) or by exiting when its stdio input is closed
- it should exit promptly on SIGTERM and within a reasonable time on SIGKILL if SIGTERM is ignored
- it should not send any further requests after initiating shutdown

#### stdio

For the stdio transport, the client SHOULD initiate shutdown by:

1. Closing the input stream to the child process (the server)
2. Waiting for the server to exit, or sending `SIGTERM` if the server does not exit within a reasonable time
3. Sending `SIGKILL` if the server does not exit within a reasonable time after `SIGTERM`

The server MAY initiate shutdown by closing its output stream to the client and exiting.

\***\*Compliance Checklist\*\***

#### HTTP

For HTTP transports, shutdown is indicated by closing the associated HTTP connection(s).

\***\*Compliance Checklist\*\***

## Timeouts

Implementations SHOULD establish timeouts for all sent requests, to prevent hung connections and resource exhaustion. When the request has not received a success or error response within the timeout period, the sender SHOULD issue a cancellation notification for that request and stop waiting for a response.

SDKs and other middleware SHOULD allow these timeouts to be configured on a per-request basis.

Implementations MAY choose to reset the timeout clock when receiving a progress notification corresponding to the request, as this implies that work is actually happening. However, implementations SHOULD always enforce a maximum timeout, regardless of progress notifications, to limit the impact of a misbehaving client or server.

\***\*Compliance Checklist\*\***

- it should enforce configurable timeouts on all requests and issue a cancellation notification on timeout
- it should optionally reset the timeout clock upon receiving valid progress notifications, but still enforce a maximum timeout

## Error Handling

Implementations SHOULD be prepared to handle these error cases:

- Protocol version mismatch
- Failure to negotiate required capabilities
- Request timeouts

Example initialization error:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32602,
    "message": "Unsupported protocol version",
    "data": {
      "supported": ["2024-11-05"],
      "requested": "1.0.0"
    }
  }
}
```

\***\*Compliance Checklist\*\***

- it should return a `-32602` JSON-RPC error code for unsupported protocol versions, including `data.supported` and `data.requested`
- it should return meaningful error codes for failed capability negotiations
- it should handle and recover or terminate gracefully on request timeouts
