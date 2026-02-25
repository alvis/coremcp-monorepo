import { describe, expect, it, vi } from 'vitest';

import { resolveHandlers } from '#handlers/handler-registry';

import type { ServerRequestHandler } from '#types';

describe('fn:resolveHandlers', () => {
  it('should return all default handlers when no overrides provided', () => {
    const handlers = resolveHandlers();

    expect(handlers).toHaveProperty('callTool');
    expect(handlers).toHaveProperty('complete');
    expect(handlers).toHaveProperty('getPrompt');
    expect(handlers).toHaveProperty('initialize');
    expect(handlers).toHaveProperty('listPrompts');
    expect(handlers).toHaveProperty('listResources');
    expect(handlers).toHaveProperty('listResourceTemplates');
    expect(handlers).toHaveProperty('listTools');
    expect(handlers).toHaveProperty('readResource');
    expect(handlers).toHaveProperty('setLevel');
    expect(handlers).toHaveProperty('subscribe');
    expect(handlers).toHaveProperty('unsubscribe');

    // all handlers should be functions
    Object.values(handlers).forEach((handler) => {
      expect(typeof handler).toBe('function');
    });
  });

  it('should return default handlers when empty object provided', () => {
    const handlers = resolveHandlers({});

    expect(handlers).toHaveProperty('callTool');
    expect(handlers).toHaveProperty('complete');
    expect(handlers).toHaveProperty('getPrompt');
    expect(handlers).toHaveProperty('initialize');
    expect(handlers).toHaveProperty('listPrompts');
    expect(handlers).toHaveProperty('listResources');
    expect(handlers).toHaveProperty('listResourceTemplates');
    expect(handlers).toHaveProperty('listTools');
    expect(handlers).toHaveProperty('readResource');
    expect(handlers).toHaveProperty('setLevel');
    expect(handlers).toHaveProperty('subscribe');
    expect(handlers).toHaveProperty('unsubscribe');
  });

  it('should override specific handlers while keeping defaults', () => {
    const customCallTool = vi.fn();
    const customListTools = vi.fn();

    const handlers = resolveHandlers({
      callTool: customCallTool,
      listTools: customListTools,
    });

    expect(handlers.callTool).toBe(customCallTool);
    expect(handlers.listTools).toBe(customListTools);

    // other handlers should be defaults
    expect(typeof handlers.complete).toBe('function');
    expect(typeof handlers.getPrompt).toBe('function');
    expect(typeof handlers.initialize).toBe('function');
    expect(typeof handlers.listPrompts).toBe('function');
    expect(typeof handlers.listResources).toBe('function');
    expect(typeof handlers.listResourceTemplates).toBe('function');
    expect(typeof handlers.readResource).toBe('function');
    expect(typeof handlers.setLevel).toBe('function');
    expect(typeof handlers.subscribe).toBe('function');
    expect(typeof handlers.unsubscribe).toBe('function');
  });

  it('should override all handlers when all provided', () => {
    const customHandlers: ServerRequestHandler = {
      callTool: vi.fn(),
      complete: vi.fn(),
      getPrompt: vi.fn(),
      initialize: vi.fn(),
      listPrompts: vi.fn(),
      listResources: vi.fn(),
      listResourceTemplates: vi.fn(),
      listTools: vi.fn(),
      readResource: vi.fn(),
      setLevel: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
    };

    const handlers = resolveHandlers(customHandlers);

    expect(handlers.callTool).toBe(customHandlers.callTool);
    expect(handlers.complete).toBe(customHandlers.complete);
    expect(handlers.getPrompt).toBe(customHandlers.getPrompt);
    expect(handlers.initialize).toBe(customHandlers.initialize);
    expect(handlers.listPrompts).toBe(customHandlers.listPrompts);
    expect(handlers.listResources).toBe(customHandlers.listResources);
    expect(handlers.listResourceTemplates).toBe(
      customHandlers.listResourceTemplates,
    );
    expect(handlers.listTools).toBe(customHandlers.listTools);
    expect(handlers.readResource).toBe(customHandlers.readResource);
    expect(handlers.setLevel).toBe(customHandlers.setLevel);
    expect(handlers.subscribe).toBe(customHandlers.subscribe);
    expect(handlers.unsubscribe).toBe(customHandlers.unsubscribe);
  });
});
