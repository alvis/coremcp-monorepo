/** symbol for the protected connect method that establishes transport connection */
export const connect = Symbol('connect');
/** symbol for the protected disconnect method that closes transport connection */
export const disconnect = Symbol('disconnect');
/** symbol for the protected send method that transmits json-rpc messages */
export const send = Symbol('send');
/** symbol for the protected log method that handles transport logging */
export const log = Symbol('log');
/** symbol for the protected onMessage callback that handles incoming messages */
export const onMessage = Symbol('onMessage');

/** symbol for the protected initializeRequest method that handles initialization */
export const initializeRequest = Symbol('initializeRequest');

/** symbol for the connection status tracking */
export const status = Symbol('status');
