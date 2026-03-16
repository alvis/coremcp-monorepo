# **Authorization**

**Protocol Revision:** 2025-11-25

The Model Context Protocol provides authorization capabilities at the transport level, enabling MCP clients to make requests to restricted MCP servers on behalf of resource owners. This specification defines the authorization flow for HTTP-based transports.

## **Purpose and Scope**

Authorization is **OPTIONAL** for MCP implementations. When supported:

- HTTP-based transports **SHOULD** conform to this specification.
- STDIO transports **SHOULD NOT** follow this specification and instead retrieve credentials from the environment.
- Alternative transports **MUST** follow established security best practices for their protocol.

\***\*Compliance Checklist\*\***

- it should enable authorization only on HTTP transports and treat it as optional
- it should retrieve credentials from the environment on STDIO transports
- it should enforce security best practices on all other transports

## **Standards Compliance**

This authorization mechanism implements a subset of the following standards to ensure security and interoperability:

- OAuth 2.1 IETF Draft
- OAuth 2.0 Authorization Server Metadata (RFC 8414)
- OAuth 2.0 Dynamic Client Registration Protocol (RFC 7591)
- OAuth 2.0 Protected Resource Metadata (RFC 9728)

\***\*Compliance Checklist\*\***

- it should implement OAuth 2.1 resource-server behavior for protected resources
- it should support OAuth 2.0 Protected Resource Metadata for discovery
- it should support OAuth 2.0 Authorization Server Metadata
- it should optionally implement OAuth 2.0 Dynamic Client Registration

## **Authorization Flow**

### **Roles**

- **Protected MCP Server**: Acts as an OAuth 2.1 resource server, accepting access tokens.
- **MCP Client**: Acts as an OAuth 2.1 client, obtaining and presenting tokens.
- **Authorization Server**: Issues access tokens; may be co-hosted with the resource server or standalone.

\***\*Compliance Checklist\*\***

- it should correctly identify and enforce the resource-server role
- it should correctly identify and enforce the client role
- it should honor the authorization server’s metadata for token issuance

### **Overview**

1. Authorization servers **MUST** implement OAuth 2.1 with appropriate security for confidential and public clients.
2. Authorization servers and MCP clients **SHOULD** support dynamic client registration (RFC 7591).
3. MCP servers **MUST** implement OAuth 2.0 Protected Resource Metadata (RFC 9728).
4. Authorization servers **MUST** provide OAuth 2.0 Authorization Server Metadata (RFC 8414).

\***\*Compliance Checklist\*\***

- it should implement OAuth 2.1 security measures for both client types
- it should advertise and consume dynamic client registration endpoints
- it should publish and consume protected resource metadata
- it should publish and consume authorization server metadata

## **Authorization Server Discovery**

### **Authorization Server Location**

MCP servers **MUST** include an authorization_servers field in their Protected Resource Metadata document. On HTTP 401 Unauthorized, they **MUST** use the WWW-Authenticate header to point to that metadata URL.

\***\*Compliance Checklist\*\***

- it should include an authorization_servers array in its resource metadata
- it should return a WWW-Authenticate header on HTTP 401 responses pointing to its metadata URL
- it should require clients to parse WWW-Authenticate and retry with proper authorization

### **Server Metadata Discovery**

MCP clients **MUST** follow RFC 8414 to obtain authorization endpoint, token endpoint, and supported grant types from the authorization server’s metadata.

\***\*Compliance Checklist\*\***

- it should fetch and parse the authorization server’s metadata document
- it should extract the authorization_endpoint and token_endpoint correctly
- it should honor declared supported response types and grant types

## **Dynamic Client Registration**

MCP clients and authorization servers **SHOULD** support RFC 7591 to allow clients to register dynamically. If unsupported, the server **MUST** provide an alternative (e.g., pre-registered credentials or user-entered client details).

\***\*Compliance Checklist\*\***

- it should expose a dynamic client registration endpoint if supported
- it should fall back to an alternative registration mechanism when disabled
- it should handle client-ID and secret provisioning per server policy

## **Authorization Flow Steps**

### **Resource Parameter Implementation**

MCP clients **MUST** include a resource parameter (RFC 8707) in both authorization and token requests:

1. **MUST** identify the MCP server’s canonical URI.
2. **MUST** use the canonical URI defined by RFC 8707.
3. **MUST** include it even if the authorization server does not strictly require it.

### **Canonical Server URI**

- Valid examples:
  - <https://mcp.example.com/mcp>
  - <https://mcp.example.com>
  - <https://mcp.example.com:8443>
- Invalid examples:
  - mcp.example.com (missing scheme)
  - <https://mcp.example.com#fragment> (contains fragment)

> Note:
>
> **SHOULD**

\***\*Compliance Checklist\*\***

- it should include the resource parameter in all authorization and token requests
- it should accept both trailing-slash and non-trailing-slash forms but normalize to a consistent form
- it should reject resource URIs missing a scheme or containing fragments

## **Access Token Usage**

### **Token Requirements**

MCP clients **MUST** send access tokens in every HTTP request using the Authorization: Bearer <access-token> header. Tokens **MUST NOT** appear in the query string.

\***\*Compliance Checklist\*\***

- it should require the Authorization: Bearer header on every request
- it should reject requests lacking the header with HTTP 401
- it should reject tokens presented via URI query parameters

### **Token Handling**

MCP servers **MUST** validate tokens per OAuth 2.1 §5.2, ensuring:

- Tokens are unexpired and unrevoked.
- Tokens include this server as the intended audience (RFC 8707).

On validation failure, servers **MUST** respond per OAuth 2.1 §5.3 (e.g., HTTP 401 for invalid/expired tokens). Servers **MUST NOT** accept tokens issued for other resources or by other authorization servers.

\***\*Compliance Checklist\*\***

- it should validate token signatures, expiration, and audience claim
- it should return HTTP 401 for invalid or expired tokens
- it should reject tokens not issued by its authorization server
- it should never accept or forward tokens intended for other resources

## **Error Handling**

Servers **MUST** use appropriate HTTP status codes for authorization errors:

| **Status** | **Description**                               |
| ---------- | --------------------------------------------- |
| 401        | Unauthorized (missing/invalid token)          |
| 403        | Forbidden (insufficient scope or permissions) |
| 400        | Bad Request (malformed authorization request) |

\***\*Compliance Checklist\*\***

- it should return 401 for missing or invalid tokens
- it should return 403 for valid tokens with insufficient permissions
- it should return 400 for malformed authorization requests

## **Security Considerations**

Implementations **MUST** follow OAuth 2.1 security guidelines.

### **Token Audience Binding and Validation**

MCP clients **MUST** include the resource parameter and MCP servers **MUST** enforce audience validation.

\***\*Compliance Checklist\*\***

- it should enforce presence of the resource parameter when supported
- it should reject tokens not bound to its resource audience
- it should implement audience binding best practices

### **Token Theft**

Clients and servers **MUST** implement secure token storage, issue short-lived tokens, and rotate refresh tokens for public clients.

\***\*Compliance Checklist\*\***

- it should store tokens securely (e.g., encrypted at rest)
- it should request short-lived access tokens
- it should rotate refresh tokens for public clients

### **Communication Security**

All authorization endpoints **MUST** use HTTPS. Redirect URIs **MUST** be either localhost or HTTPS.

\***\*Compliance Checklist\*\***

- it should serve all endpoints over HTTPS
- it should allow redirect URIs only on localhost or with HTTPS

### **Authorization Code Protection**

MCP clients **MUST** implement PKCE (RFC 7636) in authorization code flows.

\***\*Compliance Checklist\*\***

- it should require a PKCE code verifier and challenge pair on authorization requests

### **Open Redirection**

Clients **MUST** register exact redirect URIs and use state parameters. Servers **MUST** validate redirect URIs exactly.

\***\*Compliance Checklist\*\***

- it should validate redirect URIs against pre-registered values
- it should require and verify state parameters to prevent CSRF

### **Confused Deputy Problem**

MCP proxy servers using static client IDs **MUST** obtain user consent before forwarding to third-party authorization servers.

\***\*Compliance Checklist\*\***

- it should require explicit user consent for each forwarded dynamic client registration

### **Access Token Privilege Restriction**

MCP servers **MUST** validate audience claims and prohibit token passthrough to upstream services. When acting as an OAuth client, they **MUST** obtain separate tokens for upstream APIs.

\***\*Compliance Checklist\*\***

- it should validate the token’s audience claim before processing requests
- it should not forward received tokens to downstream services
- it should obtain distinct tokens for any upstream API interactions
