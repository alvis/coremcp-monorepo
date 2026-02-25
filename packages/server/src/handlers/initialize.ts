import type { Initialize } from '#types';

/**
 * handles initialization request and returns server capabilities
 * @param _params initialization parameters (unused)
 * @param context request context
 * @param context.session current session context
 * @returns server capabilities and protocol information
 */
export const handleInitialize: Initialize = async (_params, context) => {
  const { session } = context;

  // return server capabilities from session
  return {
    protocolVersion: session.protocolVersion,
    capabilities: session.capabilities.server,
    serverInfo: session.serverInfo,
  };
};
