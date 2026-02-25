# **HTTP Transport**

**Protocol Revision:** 2025-06-18

The HTTP transport enables Model Context Protocol (MCP) communication over HTTP connections, supporting both request-response and server-sent event (SSE) streaming patterns. This transport provides flexible, web-compatible communication suitable for distributed systems and web applications.

## **Purpose and Scope**

The HTTP transport offers a standard web protocol for MCP communication, ideal for:

- Web-based client applications
- Distributed server architectures
- Cross-network communication
- Integration with existing HTTP infrastructure
- Scenarios requiring authentication and authorization

\***\*Server Compliance Checklist\*\***

- it should implement HTTP transport for web-based MCP communication
- it should support both request-response and SSE streaming patterns
- it should integrate with standard HTTP security mechanisms

## **Communication Model**

### **Transport Architecture**

The HTTP transport operates on a client-server model where:

1. The **MCP server** exposes a single HTTP endpoint
2. The **MCP client** sends JSON-RPC messages via HTTP POST requests
3. The server responds with either single responses or SSE streams
4. Multiple concurrent connections are supported

\***\*Server Compliance Checklist\*\***

- it should expose a single HTTP endpoint for all MCP communication
- it should handle concurrent client connections appropriately
- it should support both synchronous and streaming response patterns

### **Message Exchange**

All communication uses JSON-RPC 2.0 over HTTP with:

- Request messages sent as HTTP POST body content
- Response messages returned as HTTP response body or SSE events
- All messages **MUST** be UTF-8 encoded
- All messages **MUST** be valid JSON-RPC 2.0

\***\*Server Compliance Checklist\*\***

- it should send JSON-RPC messages in HTTP POST request bodies
- it should return responses via HTTP response body or SSE streams
- it should enforce UTF-8 encoding on all messages
- it should validate JSON-RPC 2.0 message format

## **HTTP Request Format**

### **Request Method**

The client **MUST**:

- Use HTTP POST method for all JSON-RPC messages
- Include appropriate headers as specified below
- Send a single JSON-RPC message per request

\***\*Server Compliance Checklist\*\***

- it should accept only HTTP POST requests for JSON-RPC messages
- it should reject non-POST methods with appropriate HTTP status codes
- it should enforce one JSON-RPC message per HTTP request

### **Request Headers**

The client **MUST** include:

```plaintext
Accept: application/json, text/event-stream
Content-Type: application/json
```

The client **SHOULD** include:

- `MCP-Protocol-Version` header with the protocol version
- Authorization headers when required
- Session headers when maintaining state

\***\*Server Compliance Checklist\*\***

- it should require Accept header with both application/json and text/event-stream
- it should require Content-Type: application/json for requests
- it should support optional MCP-Protocol-Version header
- it should integrate with standard HTTP authorization mechanisms

### **Request Body**

The request body **MUST**:

- Contain exactly one JSON-RPC request, notification, or response
- Be a valid JSON object
- Follow JSON-RPC 2.0 specification

\***\*Server Compliance Checklist\*\***

- it should validate request body contains valid JSON
- it should ensure exactly one JSON-RPC message per request
- it should reject malformed JSON-RPC with appropriate errors

## **HTTP Response Format**

### **Response Status Codes**

The server **MUST** use appropriate HTTP status codes:

| **Status**                | **Usage**                             |
| ------------------------- | ------------------------------------- |
| 200 OK                    | Successful request with response      |
| 202 Accepted              | Notification or response acknowledged |
| 400 Bad Request           | Malformed request                     |
| 401 Unauthorized          | Missing or invalid authentication     |
| 403 Forbidden             | Insufficient permissions              |
| 500 Internal Server Error | Server processing error               |

\***\*Server Compliance Checklist\*\***

- it should return 200 OK for successful requests requiring responses
- it should return 202 Accepted for notifications and fire-and-forget messages
- it should use appropriate 4xx codes for client errors
- it should use 5xx codes for server errors

### **Response Types**

#### **Single Response**

For non-streaming responses, the server **MUST**:

- Set `Content-Type: application/json`
- Return a single JSON-RPC response object
- Include the response in the HTTP body

\***\*Server Compliance Checklist\*\***

- it should set Content-Type: application/json for single responses
- it should return valid JSON-RPC response objects
- it should match response IDs to request IDs

#### **Server-Sent Events (SSE)**

For streaming responses, the server **MUST**:

- Set `Content-Type: text/event-stream`
- Follow SSE specification (event streams)
- Send JSON-RPC messages as SSE data events

SSE Format:

```
data: {"jsonrpc": "2.0", "id": 1, "result": {...}}

data: {"jsonrpc": "2.0", "method": "notification", "params": {...}}

```

\***\*Server Compliance Checklist\*\***

- it should set Content-Type: text/event-stream for SSE responses
- it should format SSE events according to specification
- it should send each JSON-RPC message as a separate SSE data event
- it should include blank lines between SSE events

## **Session Management**

### **Session Identification**

The server **MAY** implement sessions using:

- `Mcp-Session-Id` header for session tracking
- Session cookies following HTTP cookie specification
- URL-based session identifiers

\***\*Server Compliance Checklist\*\***

- it should optionally support session management via headers
- it should handle session expiration gracefully
- it should not require sessions for stateless operations

### **Session Lifecycle**

When sessions are supported:

1. Server creates session on initial connection
2. Client includes session identifier in subsequent requests
3. Server may terminate sessions based on policy
4. Client must handle session expiration and renewal

\***\*Server Compliance Checklist\*\***

- it should create sessions only when necessary
- it should communicate session requirements clearly
- it should handle session termination gracefully
- it should support session renewal mechanisms

## **Security Considerations**

### **Transport Security**

All HTTP transport implementations **MUST**:

- Use HTTPS for production deployments
- Validate TLS certificates appropriately
- Support modern TLS versions (1.2+)

\***\*Server Compliance Checklist\*\***

- it should enforce HTTPS in production environments
- it should validate server certificates properly
- it should support TLS 1.2 or higher

### **Origin Validation**

Servers **SHOULD**:

- Validate the `Origin` header for browser-based clients
- Implement CORS policies appropriately
- Restrict access to trusted origins

\***\*Server Compliance Checklist\*\***

- it should validate Origin headers when present
- it should implement appropriate CORS policies
- it should reject requests from untrusted origins

### **Local Binding**

For local development, servers **SHOULD**:

- Bind to `127.0.0.1` rather than `0.0.0.0`
- Use unprivileged ports
- Implement additional authentication even locally

\***\*Server Compliance Checklist\*\***

- it should bind to localhost addresses for development
- it should avoid binding to all interfaces unnecessarily
- it should maintain security even in development

## **Protocol Version Negotiation**

### **Version Header**

Clients **MUST** include the `MCP-Protocol-Version` header after successful initialization:

```
MCP-Protocol-Version: 2025-06-18
```

Servers **MUST**:

- Accept requests without version header during initialization
- Validate version compatibility after initialization
- Return appropriate errors for version mismatches

\***\*Server Compliance Checklist\*\***

- it should handle version negotiation during initialization
- it should require version headers post-initialization
- it should validate protocol version compatibility

## **Error Handling**

### **HTTP Errors**

Servers **MUST**:

- Return appropriate HTTP status codes
- Include error details in response body when possible
- Follow JSON-RPC error format for application errors

\***\*Server Compliance Checklist\*\***

- it should use standard HTTP status codes correctly
- it should provide meaningful error messages
- it should distinguish transport errors from application errors

### **Connection Errors**

Implementations **MUST** handle:

- Network timeouts
- Connection drops
- Partial message delivery
- Server unavailability

\***\*Server Compliance Checklist\*\***

- it should implement appropriate timeout handling
- it should detect and recover from connection failures
- it should handle partial message scenarios gracefully

## **Implementation Notes**

### **Concurrent Connections**

HTTP transport naturally supports multiple concurrent connections. Implementations **SHOULD**:

- Handle multiple SSE streams per client appropriately
- Manage resource allocation for concurrent requests
- Implement appropriate rate limiting

\***\*Server Compliance Checklist\*\***

- it should support multiple concurrent client connections
- it should manage server resources appropriately
- it should implement rate limiting when necessary

### **Message Buffering**

For SSE streams, implementations **SHOULD**:

- Buffer messages appropriately during connection interruptions
- Implement message replay capabilities if supported
- Handle buffer overflow conditions gracefully

\***\*Server Compliance Checklist\*\***

- it should buffer SSE messages during temporary disconnections
- it should support optional message replay features
- it should prevent buffer overflow issues

### **Compatibility**

The HTTP transport **MUST**:

- Work with standard HTTP infrastructure (proxies, load balancers)
- Support HTTP/1.1 at minimum
- Be compatible with common HTTP client libraries

\***\*Server Compliance Checklist\*\***

- it should function correctly behind HTTP proxies
- it should support standard HTTP/1.1 features
- it should work with common HTTP client implementations
