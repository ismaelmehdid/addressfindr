import { FILES_BLOCK } from './files';
import { HELP_BLOCK } from './help';
import { LINKING_BLOCK } from './linking';
import { ROLE_BLOCK } from './role';
import { SECURITY_BLOCK } from './security';
import { WEB_BLOCK } from './web';

export type ChatSystemPromptFeatures = {
  readonly webSearch: boolean;
};

export function composeChatSystemPrompt(
  features: ChatSystemPromptFeatures,
): string {
  const blocks: string[] = [
    ROLE_BLOCK,
    SECURITY_BLOCK,
    LINKING_BLOCK,
    FILES_BLOCK,
  ];
  if (features.webSearch) blocks.push(WEB_BLOCK);
  return blocks.join('\n\n');
}

export function composeHelpAgentSystemPrompt(): string {
  return [ROLE_BLOCK, SECURITY_BLOCK, LINKING_BLOCK, HELP_BLOCK].join('\n\n');
}

export function composeKnowledgeAgentSystemPrompt(
  features: ChatSystemPromptFeatures,
): string {
  const blocks: string[] = [
    ROLE_BLOCK,
    SECURITY_BLOCK,
    LINKING_BLOCK,
    FILES_BLOCK,
  ];
  if (features.webSearch) blocks.push(WEB_BLOCK);
  return blocks.join('\n\n');
}
