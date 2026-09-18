import 'server-only';

import type { MessageCursor } from '@/application/conversation/ports/message-store.port';

export type RawMessage = {
  id: string;
  createdAt: Date;
};

export function dropBeforeCursor<M extends RawMessage>(
  rows: readonly M[],
  cursor: MessageCursor,
): M[] {
  const cursorMs = new Date(cursor.createdAt).getTime();
  return rows.filter((row) => {
    const rowMs = row.createdAt.getTime();
    if (rowMs < cursorMs) return true;
    if (rowMs > cursorMs) return false;
    return row.id < cursor.id;
  });
}

export function buildCursor(row: RawMessage | undefined): MessageCursor | null {
  if (!row) return null;
  return { createdAt: row.createdAt.toISOString(), id: row.id };
}
