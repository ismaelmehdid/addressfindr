import 'server-only';

import { getFileEntityForOrg } from '@/application/files/get-file-entity';
import { type PageContext, PageContextKind } from '@/core/chat/page-context';
import { log } from '@/shared/logger';

export type ResolvedPageContext = {
  systemPrompt: string | null;
  attributes: Record<string, string>;
};

const EMPTY: ResolvedPageContext = { systemPrompt: null, attributes: {} };

export async function resolvePageContextToSystemPrompt(args: {
  pageContext: PageContext | undefined;
  userId: string;
  organizationId: string;
}): Promise<ResolvedPageContext> {
  const pc = args.pageContext;
  if (!pc || pc.kind === PageContextKind.NONE) return EMPTY;

  try {
    if (pc.kind === PageContextKind.STORAGE_FILE) {
      const f = await getFileEntityForOrg({
        fileId: pc.id,
        organizationId: args.organizationId,
      });
      if (f.isErr()) return EMPTY;
      const prompt = [
        `<current_page>`,
        `The user is currently viewing the storage file "${f.value.originalName}" (fileId="${f.value.id}", type=${f.value.fileType}).`,
        `When they say "this file", "ce fichier", "это", "этот документ", they mean this one — call searchFileText with fileId="${f.value.id}" instead of asking which file.`,
        `</current_page>`,
      ].join('\n');
      return {
        systemPrompt: prompt,
        attributes: {
          'chat.page_context.kind': pc.kind,
          'chat.page_context.entity_id': f.value.id,
        },
      };
    }
  } catch (e) {
    log.warn('resolvePageContext.failed', { error: String(e) });
  }
  return EMPTY;
}
