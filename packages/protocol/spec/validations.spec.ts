import { describe, expect, it } from 'vitest';

import { SUPPORTED_PROTOCOL_VERSIONS } from '#constants';

import { getVersionedValidators, validateJsonRpcMessage } from '#validations';

import type { JsonRpcMessage } from '#jsonrpc';

describe('fn:getVersionedValidators', () => {
  describe('initialization and validator presence', () => {
    it('should return all expected validators for each protocol version', async () => {
      const expectedValidators = {
        requests: [
          'tools/call',
          'completion/complete',
          'sampling/createMessage',
          'elicitation/create',
          'prompts/get',
          'initialize',
          'prompts/list',
          'resources/templates/list',
          'resources/list',
          'roots/list',
          'tools/list',
          'ping',
          'resources/read',
          'logging/setLevel',
          'resources/subscribe',
          'resources/unsubscribe',
        ],
        results: [
          'tools/call',
          'completion/complete',
          'sampling/createMessage',
          'elicitation/create',
          'prompts/get',
          'initialize',
          'prompts/list',
          'resources/templates/list',
          'resources/list',
          'roots/list',
          'tools/list',
          'resources/read',
        ],
        notifications: [
          'notifications/cancelled',
          'notifications/initialized',
          'notifications/message',
          'notifications/progress',
          'notifications/prompts/list_changed',
          'notifications/resources/list_changed',
          'notifications/resources/updated',
          'notifications/roots/list_changed',
          'notifications/tools/list_changed',
        ],
      };

      for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
        const validators = await getVersionedValidators(version);

        // check that the structure has the expected sections
        expect(validators.requests).toBeDefined();
        expect(validators.results).toBeDefined();
        expect(validators.notifications).toBeDefined();

        // check request validators
        for (const method of expectedValidators.requests) {
          expect(validators.requests[method]).toBeTypeOf('function');
        }

        // check result validators
        for (const method of expectedValidators.results) {
          expect(validators.results[method]).toBeTypeOf('function');
        }

        // check notification validators
        for (const method of expectedValidators.notifications) {
          expect(validators.notifications[method]).toBeTypeOf('function');
        }
      }
    });
  });

  describe('message validation', () => {
    const testCases = [
      {
        name: 'initialize request',
        category: 'requests' as const,
        method: 'initialize',
        validMessage: {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' },
          },
        },
        invalidMessages: [
          {
            description: 'missing required fields',
            message: {
              jsonrpc: '2.0',
              id: 1,
              method: 'initialize',
              params: { protocolVersion: '2025-06-18' },
            },
          },
          {
            description: 'wrong method name',
            message: {
              jsonrpc: '2.0',
              id: 1,
              method: 'wrong-method',
              params: {
                protocolVersion: '2025-06-18',
                capabilities: {},
                clientInfo: { name: 'test-client', version: '1.0.0' },
              },
            },
          },
        ],
      },
      {
        name: 'ping request',
        category: 'requests' as const,
        method: 'ping',
        validMessage: {
          jsonrpc: '2.0',
          id: 1,
          method: 'ping',
          params: {},
        },
        invalidMessages: [
          {
            description: 'missing method field',
            message: {
              jsonrpc: '2.0',
              id: 1,
              params: {},
            } as JsonRpcMessage,
          },
        ],
      },
      {
        name: 'call tool request',
        category: 'requests' as const,
        method: 'tools/call',
        validMessage: {
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'test-tool',
            arguments: { input: 'test' },
          },
        },
        invalidMessages: [
          {
            description: 'missing required name field',
            message: {
              jsonrpc: '2.0',
              id: 1,
              method: 'tools/call',
              params: { arguments: { input: 'test' } },
            },
          },
        ],
      },
      {
        name: 'list resources request',
        category: 'requests' as const,
        method: 'resources/list',
        validMessage: {
          jsonrpc: '2.0',
          id: 1,
          method: 'resources/list',
          params: {},
        },
        optionalParams: {
          cursor: 'some-cursor',
        },
      },
      {
        name: 'complete request',
        category: 'requests' as const,
        method: 'completion/complete',
        validMessage: {
          jsonrpc: '2.0',
          id: 1,
          method: 'completion/complete',
          params: {
            ref: { type: 'ref/prompt', name: 'test-prompt' },
            argument: { name: 'input', value: 'test' },
          },
        },
      },
    ];

    const resultTestCases = [
      {
        name: 'initialize result',
        category: 'results' as const,
        method: 'initialize',
        validMessage: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {},
            serverInfo: { name: 'test-server', version: '1.0.0' },
          },
        },
      },
      {
        name: 'call tool result',
        category: 'results' as const,
        method: 'tools/call',
        validMessage: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{ type: 'text', text: 'Tool execution result' }],
          },
        },
        invalidMessages: [
          {
            description: 'missing required content field',
            message: {
              jsonrpc: '2.0',
              id: 1,
              result: { isError: false },
            },
          },
        ],
      },
      {
        name: 'list resources result',
        category: 'results' as const,
        method: 'resources/list',
        validMessage: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            resources: [{ name: 'test-resource', uri: 'file:///test.txt' }],
          },
        },
      },
      {
        name: 'complete result',
        category: 'results' as const,
        method: 'completion/complete',
        validMessage: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            completion: { values: ['option1', 'option2', 'option3'] },
          },
        },
      },
    ];

    const notificationTestCases = [
      {
        name: 'initialized notification',
        category: 'notifications' as const,
        method: 'notifications/initialized',
        validMessage: {
          jsonrpc: '2.0',
          method: 'notifications/initialized',
          params: {},
        },
      },
      {
        name: 'cancelled notification',
        category: 'notifications' as const,
        method: 'notifications/cancelled',
        validMessage: {
          jsonrpc: '2.0',
          method: 'notifications/cancelled',
          params: { requestId: 1, reason: 'User cancelled' },
        },
        invalidMessages: [
          {
            description: 'missing required requestId field',
            message: {
              jsonrpc: '2.0',
              method: 'notifications/cancelled',
              params: { reason: 'User cancelled' },
            },
          },
        ],
      },
      {
        name: 'progress notification',
        category: 'notifications' as const,
        method: 'notifications/progress',
        validMessage: {
          jsonrpc: '2.0',
          method: 'notifications/progress',
          params: {
            progressToken: 'token123',
            progress: 50,
            total: 100,
            message: 'Processing...',
          },
        },
      },
      {
        name: 'tool list changed notification',
        category: 'notifications' as const,
        method: 'notifications/tools/list_changed',
        validMessage: {
          jsonrpc: '2.0',
          method: 'notifications/tools/list_changed',
          params: {},
        },
      },
    ];

    describe('request validation', () => {
      testCases.forEach(
        ({
          name,
          category,
          method,
          validMessage,
          invalidMessages,
          optionalParams,
        }) => {
          it(`should validate valid ${name}`, async () => {
            const validators = await getVersionedValidators('2025-06-18');
            const validateFn = validators[category][method] as (
              msg: JsonRpcMessage,
            ) => void;

            expect(() =>
              validateFn(validMessage as JsonRpcMessage),
            ).not.toThrow();

            // test with optional params if provided
            if (optionalParams) {
              const messageWithOptional = {
                ...validMessage,
                params: { ...validMessage.params, ...optionalParams },
              };
              expect(() =>
                validateFn(messageWithOptional as JsonRpcMessage),
              ).not.toThrow();
            }
          });

          if (invalidMessages) {
            invalidMessages.forEach(({ description, message }) => {
              it(`should throw error for ${name} with ${description}`, async () => {
                const validators = await getVersionedValidators('2025-06-18');
                const validateFn = validators[category][method] as (
                  msg: JsonRpcMessage,
                ) => void;

                expect(() => validateFn(message as JsonRpcMessage)).toThrow(
                  new RegExp(`Validation error for \\w+`),
                );
              });
            });
          }
        },
      );
    });

    describe('result validation', () => {
      resultTestCases.forEach(
        ({ name, category, method, validMessage, invalidMessages }) => {
          it(`should validate valid ${name}`, async () => {
            const validators = await getVersionedValidators('2025-06-18');
            const validateFn = validators[category][method] as (
              msg: JsonRpcMessage,
            ) => void;

            expect(() =>
              validateFn(validMessage as JsonRpcMessage),
            ).not.toThrow();
          });

          if (invalidMessages) {
            invalidMessages.forEach(({ description, message }) => {
              it(`should throw error for ${name} with ${description}`, async () => {
                const validators = await getVersionedValidators('2025-06-18');
                const validateFn = validators[category][method] as (
                  msg: JsonRpcMessage,
                ) => void;

                expect(() => validateFn(message as JsonRpcMessage)).toThrow(
                  new RegExp(`Validation error for \\w+`),
                );
              });
            });
          }
        },
      );
    });

    describe('notification validation', () => {
      notificationTestCases.forEach(
        ({ name, category, method, validMessage, invalidMessages }) => {
          it(`should validate valid ${name}`, async () => {
            const validators = await getVersionedValidators('2025-06-18');
            const validateFn = validators[category][method] as (
              msg: JsonRpcMessage,
            ) => void;

            expect(() =>
              validateFn(validMessage as JsonRpcMessage),
            ).not.toThrow();
          });

          if (invalidMessages) {
            invalidMessages.forEach(({ description, message }) => {
              it(`should throw error for ${name} with ${description}`, async () => {
                const validators = await getVersionedValidators('2025-06-18');
                const validateFn = validators[category][method] as (
                  msg: JsonRpcMessage,
                ) => void;

                expect(() => validateFn(message as JsonRpcMessage)).toThrow(
                  new RegExp(`Validation error for \\w+`),
                );
              });
            });
          }
        },
      );
    });
  });

  describe('type narrowing', () => {
    it('should narrow types correctly after validation', async () => {
      const validators = await getVersionedValidators('2025-06-18');

      const messages = [
        {
          message: {
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2025-06-18',
              capabilities: {},
              clientInfo: { name: 'test-client', version: '1.0.0' },
            },
          },
          validator: validators.requests.initialize,
          expectedMethod: 'initialize',
          expectedParam: 'protocolVersion',
          expectedValue: '2025-06-18',
        },
        {
          message: {
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'test-tool', arguments: { input: 'test' } },
          },
          validator: validators.requests['tools/call'],
          expectedMethod: 'tools/call',
          expectedParam: 'name',
          expectedValue: 'test-tool',
        },
        {
          message: {
            jsonrpc: '2.0',
            method: 'notifications/initialized',
            params: {},
          },
          validator: validators.notifications['notifications/initialized'],
          expectedMethod: 'notifications/initialized',
        },
      ];

      messages.forEach(
        ({
          message,
          validator,
          expectedMethod,
          expectedParam,
          expectedValue,
        }) => {
          validator(message as JsonRpcMessage);
          expect(message.method).toBe(expectedMethod);
          if (expectedParam && expectedValue) {
            expect(message.params[expectedParam]).toBe(expectedValue);
          }
        },
      );
    });
  });

  describe('edge cases', () => {
    it('should throw an error if a method in the specified protocol version is not yet supported', async () => {
      const validators = await getVersionedValidators('2024-11-05');
      expect(() =>
        validators.requests['elicitation/create']({
          jsonrpc: '2.0',
          id: 1,
          method: 'elicitation/create',
          params: {
            message: 'Please provide your GitHub username',
            requestedSchema: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                },
              },
              required: ['name'],
            },
          },
        }),
      ).toThrow();
    });

    it('should handle complex nested structures', async () => {
      const validators = await getVersionedValidators('2025-06-18');
      const complexMessage: JsonRpcMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'complex-tool',
          arguments: {
            nested: {
              array: [1, 2, 3],
              object: { key: 'value' },
            },
            boolean: true,
            number: 42,
            string: 'test',
          },
        },
      };

      expect(() =>
        validators.requests['tools/call'](complexMessage),
      ).not.toThrow();
    });

    it('should handle large message payloads', async () => {
      const validators = await getVersionedValidators('2025-06-18');
      const largeMessage: JsonRpcMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'data-processor',
          arguments: {
            data: 'x'.repeat(10000),
          },
        },
      };

      expect(() =>
        validators.requests['tools/call'](largeMessage),
      ).not.toThrow();
    });

    it('should validate across all supported protocol versions', async () => {
      const message: JsonRpcMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'ping',
        params: {},
      };

      for (const version of SUPPORTED_PROTOCOL_VERSIONS) {
        const validators = await getVersionedValidators(version);
        expect(() => validators.requests.ping(message)).not.toThrow();
      }
    });
  });
});

describe('fn:validateJsonRpcMessage', () => {
  describe('valid messages', () => {
    it('should validate a valid JSON-RPC request with id', () => {
      const validRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/method',
        params: { foo: 'bar' },
      };

      const result = validateJsonRpcMessage(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate a valid JSON-RPC request with string id', () => {
      const validRequest = {
        jsonrpc: '2.0',
        id: 'request-123',
        method: 'test/method',
        params: { foo: 'bar' },
      };

      const result = validateJsonRpcMessage(validRequest);
      expect(result).toEqual(validRequest);
    });

    it('should validate a valid JSON-RPC notification (no id)', () => {
      const validNotification = {
        jsonrpc: '2.0',
        method: 'notifications/test',
        params: { data: 'value' },
      };

      const result = validateJsonRpcMessage(validNotification);
      expect(result).toEqual(validNotification);
    });

    it('should validate message without params', () => {
      const validMessage = {
        jsonrpc: '2.0',
        id: 42,
        method: 'ping',
      };

      const result = validateJsonRpcMessage(validMessage);
      expect(result).toEqual(validMessage);
    });

    it('should validate message with empty params object', () => {
      const validMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/method',
        params: {},
      };

      const result = validateJsonRpcMessage(validMessage);
      expect(result).toEqual(validMessage);
    });

    it('should validate message with complex params', () => {
      const validMessage = {
        jsonrpc: '2.0',
        id: 'complex-request',
        method: 'tools/call',
        params: {
          name: 'test-tool',
          arguments: {
            nested: {
              array: [1, 2, 3],
              object: { key: 'value' },
              boolean: true,
              null: null,
            },
          },
        },
      };

      const result = validateJsonRpcMessage(validMessage);
      expect(result).toEqual(validMessage);
    });
  });

  describe('invalid messages', () => {
    it('should throw error for missing jsonrpc field', () => {
      const invalidMessage = {
        id: 1,
        method: 'test/method',
        params: {},
      };

      expect(() => validateJsonRpcMessage(invalidMessage)).toThrow(
        'Invalid JSON-RPC message',
      );
    });

    it('should throw error for incorrect jsonrpc version', () => {
      const invalidMessage = {
        jsonrpc: '1.0',
        id: 1,
        method: 'test/method',
        params: {},
      };

      expect(() => validateJsonRpcMessage(invalidMessage)).toThrow(
        'Invalid JSON-RPC message',
      );
    });

    it('should throw error for missing method field', () => {
      const invalidMessage = {
        jsonrpc: '2.0',
        id: 1,
        params: {},
      };

      expect(() => validateJsonRpcMessage(invalidMessage)).toThrow(
        'Invalid JSON-RPC message',
      );
    });

    it('should throw error for invalid id type', () => {
      const invalidMessage = {
        jsonrpc: '2.0',
        id: true,
        method: 'test/method',
        params: {},
      };

      expect(() => validateJsonRpcMessage(invalidMessage)).toThrow(
        'Invalid JSON-RPC message',
      );
    });

    it('should throw error for invalid params type', () => {
      const invalidMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/method',
        params: 'not-an-object',
      };

      expect(() => validateJsonRpcMessage(invalidMessage)).toThrow(
        'Invalid JSON-RPC message',
      );
    });

    it('should throw error for additional properties', () => {
      const invalidMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/method',
        params: {},
        extra: 'field',
      };

      expect(() => validateJsonRpcMessage(invalidMessage)).toThrow(
        'Invalid JSON-RPC message',
      );
    });

    it('should throw error for non-object input', () => {
      expect(() => validateJsonRpcMessage('not-an-object')).toThrow(
        'Invalid JSON-RPC message',
      );
      expect(() => validateJsonRpcMessage(123)).toThrow(
        'Invalid JSON-RPC message',
      );
      expect(() => validateJsonRpcMessage(null)).toThrow(
        'Invalid JSON-RPC message',
      );
      expect(() => validateJsonRpcMessage(undefined)).toThrow(
        'Invalid JSON-RPC message',
      );
      expect(() => validateJsonRpcMessage([])).toThrow(
        'Invalid JSON-RPC message',
      );
    });

    it('should throw error for array params', () => {
      const invalidMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/method',
        params: [1, 2, 3],
      };

      expect(() => validateJsonRpcMessage(invalidMessage)).toThrow(
        'Invalid JSON-RPC message',
      );
    });
  });

  describe('edge cases', () => {
    it('should handle very long method names', () => {
      const validMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'a'.repeat(1000),
        params: {},
      };

      const result = validateJsonRpcMessage(validMessage);
      expect(result).toEqual(validMessage);
    });

    it('should handle deeply nested params', () => {
      const createDeepObject = (depth: number): any => {
        if (depth === 0) {
          return { value: 'deep' };
        }

        return { nested: createDeepObject(depth - 1) };
      };

      const validMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/method',
        params: createDeepObject(10),
      };

      const result = validateJsonRpcMessage(validMessage);
      expect(result).toEqual(validMessage);
    });

    it('should handle numeric method names', () => {
      const validMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: '12345',
        params: {},
      };

      const result = validateJsonRpcMessage(validMessage);
      expect(result).toEqual(validMessage);
    });

    it('should handle empty string method', () => {
      const invalidMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: '',
        params: {},
      };

      // empty string is technically valid according to the schema
      const result = validateJsonRpcMessage(invalidMessage);
      expect(result).toEqual(invalidMessage);
    });

    it('should handle zero as id', () => {
      const validMessage = {
        jsonrpc: '2.0',
        id: 0,
        method: 'test/method',
        params: {},
      };

      const result = validateJsonRpcMessage(validMessage);
      expect(result).toEqual(validMessage);
    });

    it('should handle empty string as id', () => {
      const validMessage = {
        jsonrpc: '2.0',
        id: '',
        method: 'test/method',
        params: {},
      };

      const result = validateJsonRpcMessage(validMessage);
      expect(result).toEqual(validMessage);
    });
  });

  describe('type narrowing', () => {
    it('should properly narrow type for requests', () => {
      const message = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'test/method',
        params: { foo: 'bar' },
      };

      const validated = validateJsonRpcMessage(message);

      // typeScript should recognize this as JsonRpcRequest | JsonRpcNotification
      if ('id' in validated) {
        expect(validated.id).toBe(1);
      }
    });

    it('should properly narrow type for notifications', () => {
      const message = {
        jsonrpc: '2.0' as const,
        method: 'notifications/test',
        params: { foo: 'bar' },
      };

      const validated = validateJsonRpcMessage(message);

      // typeScript should recognize this as JsonRpcRequest | JsonRpcNotification
      expect('id' in validated).toBe(false);
    });
  });
});
