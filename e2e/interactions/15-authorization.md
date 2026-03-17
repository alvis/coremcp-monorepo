# 15. Authorization Flows

Authorization in MCP follows the OAuth 2.1 framework and applies only to HTTP transport. The authorization flow protects server resources and controls access to MCP capabilities.

---

## 15.1 Protected Resource Metadata Discovery

| Field | Value |
|-------|-------|
| **ID** | `AUTH-001` |
| **Since** | 2025-06-18 |
| **Transport** | HTTP |
| **Direction** | Client -> Server |
| **Capabilities** | None (transport-level, pre-initialization) |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client attempts to access a protected MCP server over HTTP without valid credentials.

**Message Sequence:**

1. **Client -> Server**: HTTP POST to MCP endpoint (no auth token)
   ```http
   POST /mcp HTTP/1.1
   Host: resource.example.com
   Content-Type: application/json

   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
   ```

2. **Server -> Client**: 401 Unauthorized with resource metadata URL
   ```http
   HTTP/1.1 401 Unauthorized
   WWW-Authenticate: Bearer resource_metadata="https://resource.example.com/.well-known/oauth-protected-resource"
   ```

3. **Client -> Metadata URL**: GET protected resource metadata
   ```http
   GET /.well-known/oauth-protected-resource HTTP/1.1
   Host: resource.example.com
   ```

4. **Metadata URL -> Client**: Protected resource metadata document
   ```json
   {
     "resource": "https://resource.example.com",
     "authorization_servers": ["https://auth.example.com"],
     "scopes_supported": ["mcp:read", "mcp:write", "mcp:admin"],
     "bearer_methods_supported": ["header"]
   }
   ```

**Error Cases:**
- Metadata URL returns 404 -> Client tries `.well-known/oauth-protected-resource` at server root
- Metadata document is malformed -> Client should fail with descriptive error
- No `authorization_servers` in metadata -> Client cannot proceed with OAuth

**Edge Cases:**
- The `resource_metadata` URL in `WWW-Authenticate` is optional; client MUST support fallback discovery
- Fallback order: `resource_metadata` header value, then `.well-known/oauth-protected-resource` at the server path, then at root
- The resource metadata document follows RFC 9728

---

## 15.2 Authorization Server Metadata Discovery

| Field | Value |
|-------|-------|
| **ID** | `AUTH-002` |
| **Since** | 2025-06-18 |
| **Transport** | HTTP |
| **Direction** | Client -> Authorization Server |
| **Capabilities** | None (transport-level) |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client has obtained the `authorization_servers` URL from protected resource metadata (AUTH-001).

**Message Sequence:**

1. **Client -> Auth Server**: Discover OAuth metadata (try path-specific first)
   ```http
   GET /.well-known/oauth-authorization-server/mcp HTTP/1.1
   Host: auth.example.com
   ```

2. If 404, **Client -> Auth Server**: Try root-level OAuth metadata
   ```http
   GET /.well-known/oauth-authorization-server HTTP/1.1
   Host: auth.example.com
   ```

3. If 404, **Client -> Auth Server**: Try OpenID Connect discovery
   ```http
   GET /.well-known/openid-configuration HTTP/1.1
   Host: auth.example.com
   ```

4. **Auth Server -> Client**: Authorization server metadata
   ```json
   {
     "issuer": "https://auth.example.com",
     "authorization_endpoint": "https://auth.example.com/authorize",
     "token_endpoint": "https://auth.example.com/token",
     "registration_endpoint": "https://auth.example.com/register",
     "scopes_supported": ["mcp:read", "mcp:write", "mcp:admin"],
     "response_types_supported": ["code"],
     "grant_types_supported": ["authorization_code", "refresh_token"],
     "code_challenge_methods_supported": ["S256"],
     "token_endpoint_auth_methods_supported": ["none", "client_secret_basic"]
   }
   ```

**Error Cases:**
- All metadata endpoints return 404 -> Client cannot discover authorization server
- Metadata is missing required endpoints -> Client should fail with descriptive error

**Edge Cases:**
- Client MUST try endpoints in order: path-specific, root, OpenID
- `registration_endpoint` is optional; only present if server supports dynamic client registration
- `code_challenge_methods_supported` MUST include `S256` (OAuth 2.1 requirement)

---

## 15.3 Client Registration

| Field | Value |
|-------|-------|
| **ID** | `AUTH-003` |
| **Since** | 2025-06-18 |
| **Transport** | HTTP |
| **Direction** | Client -> Authorization Server |
| **Capabilities** | None (transport-level) |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client has discovered authorization server metadata (AUTH-002) and needs to register as an OAuth client.

**Three registration approaches (in priority order):**

**Approach 1: Pre-registered Client**
- Client already has a `client_id` and optional `client_secret` from out-of-band configuration
- No registration step needed; proceed directly to authorization (AUTH-004)

**Approach 2: Client ID Metadata Documents (since 2025-11-25)**
- Client's `client_id` is an HTTPS URL pointing to a metadata document
- Authorization server fetches the URL to retrieve client metadata
- No explicit registration call needed

1. Client sets `client_id` to its metadata document URL:
   ```
   client_id=https://myapp.example.com/.well-known/oauth-client
   ```

2. Authorization server fetches the URL:
   ```http
   GET /.well-known/oauth-client HTTP/1.1
   Host: myapp.example.com
   ```

3. Response:
   ```json
   {
     "client_id": "https://myapp.example.com/.well-known/oauth-client",
     "client_name": "My MCP Client",
     "redirect_uris": ["http://localhost:3100/callback"],
     "grant_types": ["authorization_code", "refresh_token"],
     "response_types": ["code"],
     "token_endpoint_auth_method": "none"
   }
   ```

**Approach 3: Dynamic Registration (RFC 7591)**
1. **Client -> Auth Server**: Register client
   ```http
   POST /register HTTP/1.1
   Host: auth.example.com
   Content-Type: application/json

   {
     "client_name": "My MCP Client",
     "redirect_uris": ["http://localhost:3100/callback"],
     "grant_types": ["authorization_code", "refresh_token"],
     "response_types": ["code"],
     "token_endpoint_auth_method": "none"
   }
   ```

2. **Auth Server -> Client**: Registration response (HTTP 201 Created per RFC 7591 section 3.2.1)
   ```json
   {
     "client_id": "generated-client-id-123",
     "client_name": "My MCP Client",
     "redirect_uris": ["http://localhost:3100/callback"],
     "grant_types": ["authorization_code", "refresh_token"],
     "response_types": ["code"],
     "token_endpoint_auth_method": "none"
   }
   ```

**Error Cases:**
- Dynamic registration not supported (no `registration_endpoint`) -> Client must use another approach
- Registration denied -> 400/403 response with error details
- Client metadata document URL not reachable -> Authorization server rejects the client

**Edge Cases:**
- Client SHOULD persist registration credentials for reuse across sessions
- Dynamic registration may return a `client_secret` even if not requested
- Client ID Metadata Documents approach is preferred since 2025-11-25 for public clients

---

## 15.4 OAuth 2.1 Authorization Code + PKCE

| Field | Value |
|-------|-------|
| **ID** | `AUTH-004` |
| **Since** | 2025-06-18 |
| **Transport** | HTTP |
| **Direction** | Client -> Authorization Server -> Client |
| **Capabilities** | None (transport-level) |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client has registered (AUTH-003) and has authorization server metadata (AUTH-002).

**Message Sequence:**

1. **Client**: Generate PKCE code verifier and challenge
   ```
   code_verifier = random(43-128 chars, unreserved charset)
   code_challenge = BASE64URL(SHA256(code_verifier))
   ```

2. **Client -> User Agent**: Redirect to authorization endpoint
   ```
   https://auth.example.com/authorize?
     response_type=code&
     client_id=generated-client-id-123&
     redirect_uri=http://localhost:3100/callback&
     code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM&
     code_challenge_method=S256&
     scope=mcp:read+mcp:write&
     state=random-state-value&
     resource=https://resource.example.com
   ```

3. **User Agent**: User authenticates and grants consent

4. **Authorization Server -> Client**: Redirect back with authorization code
   ```
   http://localhost:3100/callback?code=AUTH_CODE_123&state=random-state-value
   ```

5. **Client -> Auth Server**: Exchange code for tokens
   ```http
   POST /token HTTP/1.1
   Host: auth.example.com
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&
   code=AUTH_CODE_123&
   redirect_uri=http://localhost:3100/callback&
   client_id=generated-client-id-123&
   code_verifier=dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk&
   resource=https://resource.example.com
   ```

6. **Auth Server -> Client**: Token response
   ```json
   {
     "access_token": "eyJ...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4",
     "scope": "mcp:read mcp:write"
   }
   ```

7. **Client -> MCP Server**: Retry MCP request with Bearer token
   ```http
   POST /mcp HTTP/1.1
   Host: resource.example.com
   Authorization: Bearer eyJ...
   Content-Type: application/json

   {"jsonrpc":"2.0","id":1,"method":"initialize","params":{...}}
   ```

**Error Cases:**
- `state` parameter mismatch on callback -> CSRF detected, abort authorization
- Authorization code expired -> Request new authorization
- Invalid `code_verifier` -> Token endpoint returns 400 `invalid_grant`
- `resource` parameter missing -> Token may not be bound to the correct audience (RFC 8707)

**Edge Cases:**
- PKCE is REQUIRED in OAuth 2.1 (not optional as in OAuth 2.0)
- `resource` parameter (RFC 8707) MUST be included to bind the token to the MCP server
- Client SHOULD store `refresh_token` securely for later token refresh (AUTH-005)
- The `state` parameter prevents CSRF attacks and MUST be verified

---

## 15.5 Token Refresh

| Field | Value |
|-------|-------|
| **ID** | `AUTH-005` |
| **Since** | 2025-06-18 |
| **Transport** | HTTP |
| **Direction** | Client -> Authorization Server |
| **Capabilities** | None (transport-level) |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client has a valid `refresh_token` from a prior authorization (AUTH-004).

**Message Sequence:**

1. **Client -> MCP Server**: Request with expired access token
   ```http
   POST /mcp HTTP/1.1
   Authorization: Bearer expired-token
   ```

2. **MCP Server -> Client**: 401 Unauthorized
   ```http
   HTTP/1.1 401 Unauthorized
   WWW-Authenticate: Bearer error="invalid_token"
   ```

3. **Client -> Auth Server**: Refresh token request
   ```http
   POST /token HTTP/1.1
   Host: auth.example.com
   Content-Type: application/x-www-form-urlencoded

   grant_type=refresh_token&
   refresh_token=dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4&
   client_id=generated-client-id-123&
   resource=https://resource.example.com
   ```

4. **Auth Server -> Client**: New token response
   ```json
   {
     "access_token": "eyJ-new-token...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "refresh_token": "bmV3IHJlZnJlc2ggdG9rZW4",
     "scope": "mcp:read mcp:write"
   }
   ```

5. **Client -> MCP Server**: Retry request with new token
   ```http
   POST /mcp HTTP/1.1
   Authorization: Bearer eyJ-new-token...
   ```

**Error Cases:**
- Refresh token expired or revoked -> 400 `invalid_grant`; must re-authorize from scratch (AUTH-004)
- Refresh token rotation: new `refresh_token` in response replaces old one; using old one again fails

**Edge Cases:**
- Client SHOULD proactively refresh before token expires (check `expires_in`)
- Auth server MAY rotate refresh tokens (one-time use)
- Client MUST store the new `refresh_token` if provided in the response
- `resource` parameter SHOULD be included in refresh requests too

---

## 15.6 Scope Challenge -- Step-Up Authorization

| Field | Value |
|-------|-------|
| **ID** | `AUTH-006` |
| **Since** | 2025-11-25 |
| **Transport** | HTTP |
| **Direction** | Client -> Server -> Authorization Server |
| **Capabilities** | None (transport-level) |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Client has a valid access token but with insufficient scope for the requested operation.

**Message Sequence:**

1. **Client -> MCP Server**: Request requiring elevated scope
   ```http
   POST /mcp HTTP/1.1
   Authorization: Bearer eyJ-read-only-token...
   Content-Type: application/json

   {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"delete_resource","arguments":{"uri":"..."}}}
   ```

2. **MCP Server -> Client**: 403 Forbidden with required scope
   ```http
   HTTP/1.1 403 Forbidden
   WWW-Authenticate: Bearer error="insufficient_scope", scope="mcp:admin"
   ```

3. **Client**: Initiates new authorization flow (AUTH-004) with the additional scope
   ```
   https://auth.example.com/authorize?
     ...&
     scope=mcp:read+mcp:write+mcp:admin&
     ...
   ```

4. (Complete OAuth flow as in AUTH-004)

5. **Client -> MCP Server**: Retry with elevated token
   ```http
   POST /mcp HTTP/1.1
   Authorization: Bearer eyJ-admin-token...
   ```

**Error Cases:**
- User denies the elevated scope -> Client cannot perform the operation
- Scope not supported by the auth server -> Authorization fails

**Edge Cases:**
- Client SHOULD present the scope challenge to the user/host for consent
- The previous token may still be valid for lower-privilege operations
- Step-up authorization may be needed mid-session (e.g., first `resources/read` succeeds, then `tools/call` needs higher scope)

---

## 15.7 Token Expiry -- Re-Authorization

| Field | Value |
|-------|-------|
| **ID** | `AUTH-007` |
| **Since** | 2025-06-18 |
| **Transport** | HTTP |
| **Direction** | Client -> Server |
| **Capabilities** | None (transport-level) |
| **Existing Coverage** | :x: NONE |

**Preconditions:** Both access token and refresh token are expired or invalid.

**Message Sequence:**

1. **Client -> MCP Server**: Request with expired token
   ```http
   POST /mcp HTTP/1.1
   Authorization: Bearer expired-token
   ```

2. **MCP Server -> Client**: 401 Unauthorized
   ```http
   HTTP/1.1 401 Unauthorized
   WWW-Authenticate: Bearer error="invalid_token"
   ```

3. **Client -> Auth Server**: Attempt refresh (fails)
   ```http
   POST /token HTTP/1.1
   Content-Type: application/x-www-form-urlencoded

   grant_type=refresh_token&refresh_token=also-expired
   ```

4. **Auth Server -> Client**: Refresh denied
   ```json
   {
     "error": "invalid_grant",
     "error_description": "Refresh token has expired"
   }
   ```

5. **Client**: Must perform full re-authorization (AUTH-001 through AUTH-004)

**Error Cases:**
- User refuses to re-authorize -> Client cannot continue using the MCP server
- Auth server is unreachable -> Client enters offline/degraded mode

**Edge Cases:**
- MCP session (HTTP Streamable session ID) may still be valid even if auth token expired
- After re-authorization, client may need to reinitialize the MCP session if it expired during the auth flow
- Client SHOULD handle this transparently when possible (queue requests, re-auth, replay)

---
