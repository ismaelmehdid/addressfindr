import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const cookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => cookieStore),
}));

vi.mock('@/application/me/get-current-user', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/application/rate-limit/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/application/conversation/delete-conversation', () => ({
  deleteConversation: vi.fn(),
}));

vi.mock('@/application/conversation/rename-conversation', () => ({
  renameConversation: vi.fn(),
}));

vi.mock('@/shared/logger', () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { DELETE, PATCH } from '@/app/api/conversations/[id]/route';
import { deleteConversation } from '@/application/conversation/delete-conversation';
import { renameConversation } from '@/application/conversation/rename-conversation';
import { getCurrentUser } from '@/application/me/get-current-user';
import { applyRateLimit } from '@/application/rate-limit/apply-rate-limit';
import { LAST_CONVERSATION_COOKIE } from '@/core/conversation/cookies';
import { notFound, unauthorized, validation } from '@/core/errors';

const mockedUser = vi.mocked(getCurrentUser);
const mockedRateLimit = vi.mocked(applyRateLimit);
const mockedDelete = vi.mocked(deleteConversation);
const mockedRename = vi.mocked(renameConversation);

const params = (id: string): { params: Promise<{ id: string }> } => ({
  params: Promise.resolve({ id }),
});

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/conversations/t-1', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  cookieStore.get.mockReturnValue(undefined);
  mockedUser.mockResolvedValue(
    ok({
      id: 'user-1',
      organizationId: 'org-1',
      sessionId: 'session-1',
    }) as unknown as Awaited<ReturnType<typeof getCurrentUser>>,
  );
  mockedRateLimit.mockResolvedValue({
    success: true,
    reset: 0,
  } as unknown as Awaited<ReturnType<typeof applyRateLimit>>);
  mockedDelete.mockResolvedValue(ok(undefined));
  mockedRename.mockResolvedValue(
    ok({ id: 't-1', title: 'New', updatedAt: '2026-01-01T00:00:00.000Z' }),
  );
});

describe('DELETE /api/conversations/[id]', () => {
  it('returns 204 and clears the cookie when the deleted thread was active', async () => {
    cookieStore.get.mockReturnValue({ value: 't-1' });

    const res = await DELETE(new Request('http://localhost'), params('t-1'));

    expect(res.status).toBe(204);
    expect(mockedDelete).toHaveBeenCalledWith('t-1');
    expect(cookieStore.delete).toHaveBeenCalledWith(LAST_CONVERSATION_COOKIE);
  });

  it('leaves the cookie alone when a different thread is active', async () => {
    cookieStore.get.mockReturnValue({ value: 'other-thread' });

    const res = await DELETE(new Request('http://localhost'), params('t-1'));

    expect(res.status).toBe(204);
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it('does not touch the cookie when deletion fails', async () => {
    mockedDelete.mockResolvedValue(err(notFound('gone')));
    cookieStore.get.mockReturnValue({ value: 't-1' });

    const res = await DELETE(new Request('http://localhost'), params('t-1'));

    expect(res.status).toBe(404);
    expect(cookieStore.delete).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller', async () => {
    mockedUser.mockResolvedValue(err(unauthorized('nope')));

    const res = await DELETE(new Request('http://localhost'), params('t-1'));

    expect(res.status).toBe(401);
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it('rejects a rate-limited caller', async () => {
    mockedRateLimit.mockResolvedValue({
      success: false,
      reset: 5,
    } as unknown as Awaited<ReturnType<typeof applyRateLimit>>);

    const res = await DELETE(new Request('http://localhost'), params('t-1'));

    expect(res.status).toBe(429);
    expect(mockedDelete).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/conversations/[id]', () => {
  it('renames the conversation and returns the summary', async () => {
    const res = await PATCH(patchRequest({ title: 'New' }), params('t-1'));

    expect(res.status).toBe(200);
    expect(mockedRename).toHaveBeenCalledWith({
      threadId: 't-1',
      title: 'New',
    });
    await expect(res.json()).resolves.toMatchObject({ title: 'New' });
  });

  it('rejects a non-string title before reaching the use case', async () => {
    const res = await PATCH(patchRequest({ title: 42 }), params('t-1'));

    expect(res.status).toBe(400);
    expect(mockedRename).not.toHaveBeenCalled();
  });

  it('surfaces the use case validation error', async () => {
    mockedRename.mockResolvedValue(err(validation('Title cannot be empty')));

    const res = await PATCH(patchRequest({ title: '   ' }), params('t-1'));

    expect(res.status).toBe(400);
  });
});
