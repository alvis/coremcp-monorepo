# **Security Best Practices**

**Protocol Revision:** 2025-11-25

This document provides security considerations for MCP implementations, identifying attack vectors and best practices for developers, server operators, and security professionals. It should be read alongside the MCP Authorization specification and OAuth 2.0 security best practices.

## **Introduction**

### **Purpose and Scope**

This document outlines security risks, attack flows, and mitigations specific to Model Context Protocol (MCP) implementations. Its primary audience includes developers implementing MCP authorization flows, MCP server operators, and security professionals evaluating MCP-based systems.

## **Attacks and Mitigations**

### **Confused Deputy Problem**

Attackers can exploit MCP servers acting as proxies to third-party APIs, creating “confused deputy” vulnerabilities.

### **Terminology**

- **MCP Proxy Server:** An MCP server that connects MCP clients to third-party APIs, acting as a single OAuth client.
- **Third-Party Authorization Server:** The OAuth 2.0 authorization server protecting the third-party API, which may lack dynamic client registration.
- **Third-Party API:** The resource server accessed via tokens from the third-party authorization server.
- **Static Client ID:** A fixed OAuth 2.0 client identifier used by the MCP proxy for all clients.

### **Attack Description**

1. A user authenticates normally through the MCP proxy with a **static client ID**.
2. The third-party authorization server sets a consent cookie for that static client ID.
3. An attacker crafts an authorization request with a **new dynamic client ID** and a malicious redirect URI.
4. The user’s browser, bearing the consent cookie, skips the consent screen.
5. The authorization code is sent to the attacker’s redirect URI, allowing them to exchange it for tokens and gain unauthorized API access.

MCP proxy servers **MUST** obtain explicit user consent for **each** dynamically registered client before forwarding authorization requests.

\***\*Compliance Checklist\*\***

- it should require explicit user consent for every dynamic client registration before proxying
- it should not rely solely on existing consent cookies when forwarding requests with dynamic client IDs

---

### **Token Passthrough**

“Token passthrough” is an anti-pattern where an MCP server accepts tokens from a client without validating they were issued **for** the MCP server.

### **Risks**

- **Security Control Circumvention:** Bypasses downstream rate limiting, validation, and monitoring.
- **Accountability and Audit Issues:** Undermines client identification and forensic logging.
- **Trust Boundary Violations:** Breaks trust assumptions between services.
- **Future Compatibility Risk:** Impedes evolution of security controls.

1. MCP servers **MUST NOT** accept any tokens that were **not explicitly issued** for the MCP server.

\***\*Compliance Checklist\*\***

- it should validate the token’s audience and issuer to ensure it was issued for the MCP server
- it should reject any access token not explicitly issued to the MCP server

---

### **Session Hijacking**

Session hijacking occurs when an attacker obtains or injects session identifiers to impersonate a client. MCP implementations must guard against both prompt-injection and impersonation variants.

### **Session Hijack Prompt Injection**

Attackers can inject malicious events into a resumed event stream by sharing session IDs across stateful servers, leading to execution of unapproved payloads.

### **Session Hijack Impersonation**

An attacker in possession of a session ID can make calls as a legitimate user if no additional authentication is required.

1. MCP servers **MUST NOT** use sessions for authentication and **MUST** verify all inbound requests.
2. Generate session IDs using secure, non-deterministic random generators (e.g., UUIDs); rotate or expire them regularly.
3. Bind session IDs to user-specific information (e.g., <user_id>:<session_id>) and validate this binding on each request.

\***\*Compliance Checklist\*\***

- it should authenticate each request using validated credentials rather than relying on sessions
- it should generate session IDs with secure random generators and avoid predictability
- it should bind and validate session IDs to specific user identities on every request
- it should rotate or expire session identifiers to limit hijacking windows
