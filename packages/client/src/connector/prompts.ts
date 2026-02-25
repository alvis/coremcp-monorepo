import { fetchAllPaginated } from '#connector/pagination';

import type {
  CompleteResult,
  GetPromptResult,
  JsonRpcRequestEnvelope,
  ListPromptsResult,
  Prompt,
  PromptReference,
  ResourceTemplateReference,
} from '@coremcp/protocol';

/** callback that sends a request and returns the response */
type SendRequest = <T>(
  request: Pick<JsonRpcRequestEnvelope, 'method' | 'params'>,
) => Promise<T>;

/**
 * requests autocompletion for prompt or resource arguments
 * @param sendRequest function to send a request to the server
 * @param ref reference to the prompt or resource template
 * @param argument argument to autocomplete
 * @param argument.name name of the argument to complete
 * @param argument.value partial value to complete from
 * @returns completion suggestions
 */
export async function complete(
  sendRequest: SendRequest,
  ref: PromptReference | ResourceTemplateReference,
  argument: { name: string; value: string },
): Promise<CompleteResult> {
  return sendRequest<CompleteResult>({
    method: 'completion/complete',
    params: { ref, argument },
  });
}

/**
 * retrieves a specific prompt by name with optional arguments
 * @param sendRequest function to send a request to the server
 * @param name name of the prompt to retrieve
 * @param args optional arguments to pass to the prompt
 * @returns prompt content and metadata
 */
export async function getPrompt(
  sendRequest: SendRequest,
  name: string,
  args?: Record<string, string>,
): Promise<GetPromptResult> {
  return sendRequest<GetPromptResult>({
    method: 'prompts/get',
    params: { name, arguments: args },
  });
}

/**
 * lists all prompts available from the server
 * @param sendRequest function to send a request to the server
 * @returns array of all available prompts
 */
export async function listPrompts(sendRequest: SendRequest): Promise<Prompt[]> {
  return fetchAllPaginated<ListPromptsResult, Prompt>(
    sendRequest,
    'prompts/list',
    (result) => result.prompts,
    (result) => result.nextCursor,
  );
}
