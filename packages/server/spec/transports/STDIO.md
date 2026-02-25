# **Standard Input/Output Transport**

**Protocol Revision:** 2025-06-18

The Standard Input/Output (stdio) transport enables Model Context Protocol (MCP) communication between a client and server through standard input/output streams. This transport is designed for simple, lightweight communication where the client launches the server as a subprocess.

## **Purpose and Scope**

The stdio transport provides a direct, process-based communication mechanism suitable for local MCP server execution. It is particularly useful for:

- Development and testing environments
- Single-user applications
- Local tool integration
- Scenarios requiring minimal setup complexity

### Server Compliance Checklist

- it should implement stdio transport for local subprocess communication
- it should handle JSON-RPC message exchange through stdin/stdout
- it should support proper process lifecycle management

## **Communication Model**

### **Process Architecture**

The stdio transport operates on a subprocess model where:

1. The **MCP client** launches the **MCP server** as a child process
2. The client communicates with the server through the server's stdin/stdout streams
3. The server reads JSON-RPC messages from its standard input (`stdin`)
4. The server writes JSON-RPC responses to its standard output (`stdout`)

### Server Compliance Checklist

- it should launch the server as a subprocess from the client
- it should establish bidirectional communication through stdin/stdout
- it should maintain the parent-child process relationship throughout the session

### **Message Exchange**

All communication uses the JSON-RPC 2.0 protocol with the following characteristics:

- Messages are individual JSON-RPC requests, notifications, or responses
- Each message **MUST** be delimited by a single newline character (`\n`)
- Messages **MUST NOT** contain embedded newlines within the JSON content
- All messages **MUST** be UTF-8 encoded

### Server Compliance Checklist

- it should format all messages as valid JSON-RPC 2.0
- it should delimit each message with exactly one newline character
- it should ensure no embedded newlines exist within message content
- it should encode all messages using UTF-8

## **Stream Usage**

### **Standard Input (stdin)**

The server **MUST**:

- Read JSON-RPC messages exclusively from its stdin
- Process messages in the order received
- Handle stream closure as a shutdown signal

The client **MUST**:

- Write only valid MCP messages to the server's stdin
- **NOT** write any non-MCP content to the server's stdin

### Server Compliance Checklist

- it should read messages only from stdin on the server side
- it should write only valid MCP messages to server stdin on the client side
- it should process messages sequentially in order of receipt

### **Standard Output (stdout)**

The server **MUST**:

- Write JSON-RPC responses and notifications exclusively to its stdout
- **NOT** write any non-MCP content to stdout
- Ensure each message is properly newline-delimited

The client **MUST**:

- Read and parse messages from the server's stdout
- Handle the stream appropriately for JSON-RPC processing

### Server Compliance Checklist

- it should write only valid MCP messages to stdout on the server side
- it should read and parse JSON-RPC messages from server stdout on the client side
- it should maintain message boundary detection through newline delimiters

### **Standard Error (stderr)**

The server **MAY**:

- Write UTF-8 encoded logging information to its stderr
- Use stderr for diagnostic, debugging, or operational messages
- Continue normal operation regardless of stderr handling

The client **MAY**:

- Capture stderr output for logging purposes
- Forward stderr to appropriate logging systems
- Ignore stderr output entirely

### Server Compliance Checklist

- it should optionally support logging output through stderr
- it should not require stderr handling for normal operation
- it should ensure stderr usage does not interfere with stdin/stdout communication

## **Lifecycle Management**

### **Initialization**

1. Client launches the server process
2. Client and server exchange MCP initialization messages per the standard lifecycle
3. Normal MCP operation begins after successful initialization

### Server Compliance Checklist

- it should follow standard MCP initialization procedures after process launch
- it should handle initialization failures gracefully with process cleanup

### **Normal Operation**

During operation, both client and server:

- **MUST** respect message formatting requirements
- **MUST** handle stream errors gracefully
- **SHOULD** implement appropriate buffering for message processing

### Server Compliance Checklist

- it should maintain message format compliance throughout operation
- it should implement error handling for stream interruptions
- it should buffer messages appropriately to prevent data loss

### **Shutdown**

The client **SHOULD** initiate shutdown by:

1. Closing the server's stdin stream
2. Waiting for the server process to exit naturally
3. Sending `SIGTERM` if the server does not exit within a reasonable time
4. Sending `SIGKILL` if the server does not respond to `SIGTERM` within a reasonable time

The server **MAY** initiate shutdown by:

- Closing its stdout stream
- Exiting the process

### Server Compliance Checklist

- it should initiate graceful shutdown by closing stdin on the client side
- it should implement reasonable timeout handling for server termination
- it should escalate termination signals appropriately (SIGTERM → SIGKILL)
- it should allow server-initiated shutdown through stdout closure

## **Error Handling**

### **Stream Errors**

Implementations **MUST** handle:

- Broken pipe conditions
- Premature stream closure
- Invalid UTF-8 encoding
- Malformed JSON-RPC messages

### Server Compliance Checklist

- it should detect and handle broken pipe conditions gracefully
- it should manage premature stream closure scenarios
- it should validate UTF-8 encoding on all messages
- it should reject malformed JSON-RPC with appropriate error responses

### **Process Errors**

Implementations **SHOULD** handle:

- Server process startup failures
- Unexpected process termination
- Resource exhaustion conditions

### Server Compliance Checklist

- it should detect server process startup failures and report them appropriately
- it should handle unexpected process termination gracefully
- it should manage resource constraints and report relevant errors

## **Security Considerations**

### **Process Isolation**

- Server processes inherit the security context of the launching client
- Standard filesystem and network access controls apply
- No additional transport-level security is provided

### Server Compliance Checklist

- it should rely on operating system process security mechanisms
- it should not implement additional transport-level security measures
- it should respect inherited security contexts and permissions

### **Resource Management**

- Clients **SHOULD** implement appropriate process monitoring
- Servers **SHOULD** implement resource limits and cleanup
- Both parties **SHOULD** handle resource exhaustion gracefully

### Server Compliance Checklist

- it should monitor subprocess resource usage appropriately
- it should implement cleanup procedures for resource management
- it should handle resource exhaustion without system impact

## **Implementation Notes**

### **Buffering**

Implementations **SHOULD**:

- Use line-buffered I/O for message processing
- Implement appropriate timeout mechanisms
- Handle partial message scenarios

### Server Compliance Checklist

- it should implement line-buffering for efficient message processing
- it should use appropriate I/O timeout mechanisms
- it should handle incomplete message reception gracefully

### **Platform Considerations**

The stdio transport **MUST** work across different operating systems with consistent behavior for:

- Process creation and management
- Signal handling
- Stream I/O operations

### Server Compliance Checklist

- it should provide consistent cross-platform behavior
- it should handle platform-specific signal differences appropriately
- it should ensure stream I/O works reliably across operating systems
