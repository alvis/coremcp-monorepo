# MCP Server Tests

This directory contains comprehensive tests for the MCP (Model Context Protocol) server implementation.

## Test Framework

- **Framework**: [Vitest](https://vitest.dev/)
- **Environment**: Node.js
- **TypeScript**: Full TypeScript support

## Test Categories

### 1. Server Lifecycle Tests

- Server start/stop functionality
- Duplicate start prevention
- Resource cleanup

### 2. Health Check Tests

- Health endpoint availability
- Proper response format

### 3. OAuth 2.0 Tests

- **Authorization Server Metadata**: Well-known endpoint compliance
- **Client Registration**: Dynamic client registration (RFC 7591)
- **Authorization Flow**: OAuth 2.0 authorization code flow with PKCE
- **Token Exchange**: Authorization code to access token exchange
- **Error Handling**: Proper OAuth error responses

### 4. MCP Session Management Tests

- **Session Creation**: Per-client session initialization
- **Session Validation**: Session ID handling and validation
- **Session Lifecycle**: Expiration, cleanup, and termination
- **Multi-Session Support**: Concurrent client sessions

### 5. MCP Protocol Tests

- **Initialization**: MCP initialize request handling
- **Session Routing**: Request routing to correct sessions
- **Protocol Validation**: Header and version validation
- **Notifications**: JSON-RPC notification handling

### 6. Error Handling Tests

- Malformed JSON handling
- Unsupported HTTP methods
- Invalid routes (404 handling)
- Protocol violations

### 7. CORS Tests

- Cross-origin request support
- Preflight OPTIONS handling
- Header validation

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test

# Run tests with UI
npm run test:ui

# Run tests once (CI mode)
npm run test:run

# Run tests silently
npm test -- --silent
```

## Test Structure

Each test suite uses:

- **beforeEach**: Fresh server instance per test
- **afterEach**: Proper cleanup and server shutdown
- **Random ports**: Prevents test conflicts
- **Comprehensive assertions**: Full response validation

## Key Features Tested

✅ **Multi-session MCP support**  
✅ **OAuth 2.0 authorization server**  
✅ **Dynamic client registration**  
✅ **PKCE support**  
✅ **Session lifecycle management**  
✅ **Comprehensive error handling**  
✅ **CORS compliance**  
✅ **Protocol validation**

## Coverage

The tests provide comprehensive coverage of:

- HTTP transport layer
- OAuth 2.0 implementation
- MCP session management
- Error scenarios
- Security validations

Tests ensure the server behaves correctly under various conditions and maintains compliance with both MCP and OAuth 2.0 specifications.
