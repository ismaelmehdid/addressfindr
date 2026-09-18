import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import * as v from 'valibot';
import { LOCALE_COOKIE, LOCALES } from '@/i18n/locales';
import { parseJsonBody } from '@/shared/api-route';

const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const BodySchema = v.object({ locale: v.picklist(LOCALES) });

export async function POST(req: Request): Promise<Response> {
  const body = await parseJsonBody(req, BodySchema);
  if (!body.ok) return body.response;

  const { locale } = body.value;

  const store = await cookies();
  store.set(LOCALE_COOKIE, locale, {
    path: '/',
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: 'lax',
    httpOnly: false,
  });
  revalidatePath('/', 'layout');

  return new Response(null, { status: 204 });
}
