'use client';

import { LogOut, Monitor, Pencil, Smartphone, Unlink, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { LinkedAccountDto, SessionDto } from '@/application/settings/dto';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { authClient } from '@/shared/auth-client';
import { AppPageHeader } from '../../components/app-page-header';
import { DashboardPageHeaderBridge } from '../../components/dashboard-page-header-bridge';
import { EditProfileDialog } from '../../components/edit-profile-dialog';

type UserSummary = {
  firstName: string;
  lastName: string;
  email: string;
  image: string | null;
  currentSessionId: string;
};

type Props = {
  user: UserSummary;
  initialSessions: SessionDto[];
  initialAccounts: LinkedAccountDto[];
};

function getInitials(
  firstName: string,
  lastName: string,
  email: string,
): string {
  if (firstName && lastName)
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  return email.slice(0, 2).toUpperCase();
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

function parseUserAgent(ua: string | null): {
  device: string;
  browser: string;
} {
  if (!ua) return { device: 'Unknown', browser: 'Unknown' };
  const isMobile = /iPhone|iPad|Android|Mobile/i.test(ua);
  let device = 'Desktop';
  if (/iPhone/i.test(ua)) device = 'iPhone';
  else if (/iPad/i.test(ua)) device = 'iPad';
  else if (/Android/i.test(ua)) device = 'Android';
  else if (/Windows/i.test(ua)) device = 'Windows';
  else if (/Mac OS X|Macintosh/i.test(ua)) device = 'Mac';
  else if (/Linux/i.test(ua)) device = 'Linux';
  else if (isMobile) device = 'Mobile';

  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) browser = 'Chrome';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  return { device, browser };
}

function providerLabel(providerId: string): string {
  if (providerId === 'credential') return 'Email';
  return providerId.charAt(0).toUpperCase() + providerId.slice(1);
}

export function SettingsContent({
  user,
  initialSessions,
  initialAccounts,
}: Props) {
  const t = useTranslations('Settings');
  const tNav = useTranslations('Nav');
  const tErrors = useTranslations('Errors');
  const locale = useLocale();

  const [sessions, setSessions] = useState<SessionDto[]>(initialSessions);
  const [accounts, setAccounts] = useState<LinkedAccountDto[]>(initialAccounts);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRevokingOthers, startRevokeOthers] = useTransition();

  const refreshSessions = async (): Promise<void> => {
    const res = await authClient.listSessions();
    if (res.data) {
      setSessions(
        res.data.map((s) => ({
          id: s.id,
          token: s.token,
          createdAt:
            s.createdAt instanceof Date
              ? s.createdAt.toISOString()
              : new Date(s.createdAt).toISOString(),
          expiresAt:
            s.expiresAt instanceof Date
              ? s.expiresAt.toISOString()
              : new Date(s.expiresAt).toISOString(),
          ipAddress: s.ipAddress ?? null,
          userAgent: s.userAgent ?? null,
          isCurrent: s.id === user.currentSessionId,
        })),
      );
    }
  };

  const refreshAccounts = async (): Promise<void> => {
    const res = await authClient.listAccounts();
    if (res.data) {
      setAccounts(
        res.data.map((a) => ({
          id: a.id,
          accountId: a.accountId,
          providerId: a.providerId,
          createdAt:
            a.createdAt instanceof Date
              ? a.createdAt.toISOString()
              : new Date(a.createdAt).toISOString(),
        })),
      );
    }
  };

  const handleSignOut = async (): Promise<void> => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = '/';
        },
      },
    });
  };

  const handleRevokeOthers = (): void => {
    startRevokeOthers(async () => {
      const res = await authClient.revokeOtherSessions();
      if (res.error) {
        toast.error(tErrors('description'));
        return;
      }
      toast.success(t('revokeOthersSuccess'));
      await refreshSessions();
    });
  };

  const initials = getInitials(user.firstName, user.lastName, user.email);
  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email;
  const hasOtherSessions = sessions.some((s) => !s.isCurrent);

  return (
    <>
      <DashboardPageHeaderBridge>
        <AppPageHeader
          title={t('title')}
          breadcrumbs={[{ label: tNav('dashboard'), href: '/dashboard' }]}
        />
      </DashboardPageHeaderBridge>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        <section>
          <h2 className="mb-3 text-[13px] font-semibold text-graphite uppercase tracking-wide">
            {t('profileSection')}
          </h2>
          <div className="flex items-center gap-3 rounded-xl border border-stone bg-paper px-4 py-3">
            <Avatar className="size-10">
              {user.image ? (
                <AvatarImage src={user.image} alt={displayName} />
              ) : null}
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium text-ink">
                {displayName}
              </span>
              <span className="truncate text-[12px] text-slate-neutral">
                {user.email}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsEditOpen(true)}
            >
              <Pencil className="size-3.5" />
              {t('editProfile')}
            </Button>
          </div>
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[13px] font-semibold text-graphite uppercase tracking-wide">
              {t('sessionsSection')}
            </h2>
            {hasOtherSessions && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleRevokeOthers}
                loading={isRevokingOthers}
              >
                {t('revokeOthers')}
              </Button>
            )}
          </div>
          {sessions.length === 0 ? (
            <p className="text-sm text-slate-neutral">{t('emptySessions')}</p>
          ) : (
            <ul className="divide-y divide-stone overflow-hidden rounded-xl border border-stone bg-paper">
              {sessions.map((s) => (
                <SessionRow
                  key={s.id}
                  session={s}
                  locale={locale}
                  onRevoked={() => void refreshSessions()}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-semibold text-graphite uppercase tracking-wide">
            {t('accountsSection')}
          </h2>
          {accounts.length === 0 ? (
            <p className="text-sm text-slate-neutral">{t('emptyAccounts')}</p>
          ) : (
            <ul className="divide-y divide-stone overflow-hidden rounded-xl border border-stone bg-paper">
              {accounts.map((a) => (
                <AccountRow
                  key={a.id}
                  account={a}
                  canUnlink={accounts.length > 1}
                  locale={locale}
                  onUnlinked={() => void refreshAccounts()}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-semibold text-graphite uppercase tracking-wide">
            {t('dangerSection')}
          </h2>
          <div className="flex items-center justify-between rounded-xl border border-stone bg-paper px-4 py-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-sm font-medium text-ink">
                {t('signOutTitle')}
              </span>
              <span className="text-[12px] text-slate-neutral">
                {t('signOutDescription')}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSignOut}
            >
              <LogOut className="size-3.5" />
              {tNav('signOut')}
            </Button>
          </div>
        </section>
      </div>

      <EditProfileDialog
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        firstName={user.firstName}
        lastName={user.lastName}
        email={user.email}
        image={user.image}
      />
    </>
  );
}

function SessionRow({
  session,
  locale,
  onRevoked,
}: {
  session: SessionDto;
  locale: string;
  onRevoked: () => void;
}) {
  const t = useTranslations('Settings');
  const tErrors = useTranslations('Errors');
  const [isPending, startTransition] = useTransition();

  const handleRevoke = (): void => {
    startTransition(async () => {
      const res = await authClient.revokeSession({ token: session.token });
      if (res.error) {
        toast.error(tErrors('description'));
        return;
      }
      toast.success(t('revokeSuccess'));
      onRevoked();
    });
  };

  const { device, browser } = parseUserAgent(session.userAgent);
  const isMobile = /iPhone|iPad|Android|Mobile/i.test(session.userAgent ?? '');
  const Icon = isMobile ? Smartphone : Monitor;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex size-8 items-center justify-center rounded-full bg-mist">
        <Icon className="size-4 text-slate-neutral" strokeWidth={1.5} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">
            {device} · {browser}
          </span>
          {session.isCurrent && (
            <span className="rounded-md bg-mist px-1.5 py-0.5 text-[11px] font-medium text-graphite">
              {t('currentSession')}
            </span>
          )}
        </div>
        <span className="truncate text-[12px] text-slate-neutral">
          {session.ipAddress
            ? t('sessionMetaWithIp', {
                ip: session.ipAddress,
                date: formatDate(session.createdAt, locale),
              })
            : t('sessionMeta', {
                date: formatDate(session.createdAt, locale),
              })}
        </span>
      </div>
      {!session.isCurrent && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleRevoke}
          loading={isPending}
          aria-label={t('revoke')}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </li>
  );
}

function AccountRow({
  account,
  canUnlink,
  locale,
  onUnlinked,
}: {
  account: LinkedAccountDto;
  canUnlink: boolean;
  locale: string;
  onUnlinked: () => void;
}) {
  const t = useTranslations('Settings');
  const tErrors = useTranslations('Errors');
  const [isPending, startTransition] = useTransition();

  const handleUnlink = (): void => {
    startTransition(async () => {
      const res = await authClient.unlinkAccount({
        providerId: account.providerId,
        accountId: account.accountId,
      });
      if (res.error) {
        toast.error(tErrors('description'));
        return;
      }
      toast.success(t('unlinkSuccess'));
      onUnlinked();
    });
  };

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex size-8 items-center justify-center rounded-full bg-mist">
        <Unlink className="size-4 text-slate-neutral" strokeWidth={1.5} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-ink">
          {providerLabel(account.providerId)}
        </span>
        <span className="truncate text-[12px] text-slate-neutral">
          {t('linkedOn', { date: formatDate(account.createdAt, locale) })}
        </span>
      </div>
      {canUnlink && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleUnlink}
          loading={isPending}
        >
          {t('unlink')}
        </Button>
      )}
    </li>
  );
}
