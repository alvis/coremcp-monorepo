# **Tools**

**Protocol Revision:** 2025-06-18

Tools allow language models to interact with external systems like databases, APIs, and computational services. Each tool is uniquely identified and includes metadata describing its schema.

## **Purpose and Scope**

Tools in MCP are designed to be model-controlled, enabling:

- Automatic discovery and invocation by language models
- Interaction with external systems like databases, APIs, and computational services
- Structured operations with defined input and output schemas
- Content generation in multiple formats (text, images, audio, resources)

**_Server Compliance Checklist_**

- it should declare a "tools" capability
- it should provide tools with unique names and proper metadata
- it should support tool listing and invocation methods
- it should return appropriate content types in tool results

## **Tool Structure**

### **Tool Metadata**

Each tool must include:

- **name**: Unique identifier for the tool _(since 2024-11-05)_
- **title** (optional): Human-readable display name _(since 2025-06-18)_
- **description**: Clear description of what the tool does _(since 2024-11-05)_
- **inputSchema**: JSON schema defining the tool's input parameters _(since 2024-11-05)_
- **outputSchema** (optional): JSON schema defining the tool's output format _(since 2025-06-18)_
- **annotations** (optional): Additional tool metadata _(since 2025-06-18)_

**_Server Compliance Checklist_**

- it should provide unique names for all tools
- it should include clear descriptions for tool functionality
- it should define proper JSON schemas for tool inputs
- it should support optional output schemas and annotations

## **Tool Interaction Flow**

### **Tool Discovery**

Clients can list available tools to understand server capabilities.

**_Server Compliance Checklist_**

- it should implement tools/list method to expose available tools
- it should return complete tool metadata in list responses
- it should handle tool discovery requests properly

### **Tool Invocation**

Language models can select and invoke tools based on their descriptions and schemas.

**_Server Compliance Checklist_**

- it should implement tools/call method for tool execution
- it should validate tool inputs against defined schemas
- it should handle tool invocation requests appropriately
- it should return structured tool results

## **Tool Results**

### **Content Types**

Tool results can include multiple content types:

- **Text**: Plain text responses _(since 2024-11-05)_
- **Images**: Image data or references _(since 2024-11-05)_
- **Audio**: Audio data or references _(since 2025-06-18)_
- **Resource links**: References to external resources _(since 2025-06-18)_
- **Embedded resources**: Direct resource content _(since 2024-11-05)_

**_Server Compliance Checklist_**

- it should support returning text content in tool results
- it should support returning image content when applicable
- it should support returning audio content when applicable
- it should support resource references in tool results
- it should handle embedded resource content properly

## **Security Considerations**

### **Human Oversight**

Human confirmation is recommended for tool operations, especially sensitive ones.

**_Server Compliance Checklist_**

- it should support mechanisms for human confirmation where appropriate
- it should provide clear information about tool capabilities and limitations

### **Input Validation**

Servers must validate tool inputs against defined schemas.

**_Server Compliance Checklist_**

- it should validate all tool inputs against JSON schemas
- it should reject invalid or malformed tool parameters
- it should provide meaningful error messages for validation failures

### **Access Controls**

Servers should implement appropriate access controls for tool usage.

**_Server Compliance Checklist_**

- it should implement access controls for tool invocations
- it should support authentication mechanisms where required

### **Rate Limiting**

Servers should implement rate limiting to prevent abuse.

**_Server Compliance Checklist_**

- it should implement rate limiting for tool invocations
- it should handle rate limit violations appropriately

### **Output Sanitization**

Tool outputs should be sanitized to remove sensitive information.

**_Server Compliance Checklist_**

- it should sanitize tool outputs to remove sensitive data
- it should validate output formats before transmission
