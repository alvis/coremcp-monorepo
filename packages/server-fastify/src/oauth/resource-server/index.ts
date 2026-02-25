// export types
export type {
  OAuthContext,
  ProtectedResourceMetadata,
  ResourceServerConfig,
} from './types';

// resource server exports
export { createProtectedResourceMetadata } from './discovery';
export { OAuthError } from './errors';
export {
  createCachingTokenIntrospector,
  createTokenInspector,
} from './introspection';
export { createRequireAuth } from './middleware';
