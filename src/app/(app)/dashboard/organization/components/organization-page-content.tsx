'use client';

import { Mail, Plus, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import posthog from 'posthog-js';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type {
  OrganizationInvitationDto,
  OrganizationMemberDto,
  OrganizationRole,
} from '@/application/organization/dto';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { authClient } from '@/shared/auth-client';
import { AppPageHeader } from '../../components/app-page-header';
import { DashboardPageHeaderBridge } from '../../components/dashboard-page-header-bridge';

type Props = {
  currentUserId: string;
  currentEmail: string;
  organizationId: string;
  initialMembers: OrganizationMemberDto[];
  initialInvitations: OrganizationInvitationDto[];
};

function getInitials(name: string, email: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) return email.slice(0, 2).toUpperCase();
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase();
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase();
}

function formatDate(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'medium',
  }).format(new Date(iso));
}

export function OrganizationPageContent({
  currentUserId,
  organizationId,
  initialMembers,
  initialInvitations,
}: Props) {
  const t = useTranslations('Members');
  const tNav = useTranslations('Nav');
  const tErrors = useTranslations('Errors');
  const locale = useLocale();

  const [members, setMembers] =
    useState<OrganizationMemberDto[]>(initialMembers);
  const [invitations, setInvitations] =
    useState<OrganizationInvitationDto[]>(initialInvitations);
  const [inviteOpen, setInviteOpen] = useState(false);

  const refresh = async (): Promise<void> => {
    const [m, i] = await Promise.all([
      authClient.organization.listMembers({
        query: { organizationId },
      }),
      authClient.organization.listInvitations({
        query: { organizationId },
      }),
    ]);
    if (m.data) {
      setMembers(
        (m.data.members ?? []).map((member) => ({
          id: member.id,
          userId: member.userId,
          email: member.user?.email ?? '',
          name: member.user?.name ?? '',
          image: member.user?.image ?? null,
          role:
            member.role === 'owner' || member.role === 'admin'
              ? member.role
              : 'member',
          createdAt:
            member.createdAt instanceof Date
              ? member.createdAt.toISOString()
              : new Date(member.createdAt).toISOString(),
        })),
      );
    }
    if (i.data) {
      const pending = (i.data ?? []).filter((inv) => inv.status === 'pending');
      setInvitations(
        pending.map((inv) => ({
          id: inv.id,
          email: inv.email,
          role:
            inv.role === 'owner' || inv.role === 'admin' ? inv.role : 'member',
          status: inv.status,
          expiresAt:
            inv.expiresAt instanceof Date
              ? inv.expiresAt.toISOString()
              : new Date(inv.expiresAt).toISOString(),
          inviterId: inv.inviterId,
          createdAt: new Date().toISOString(),
        })),
      );
    }
  };

  return (
    <>
      <DashboardPageHeaderBridge>
        <AppPageHeader
          title={t('title')}
          breadcrumbs={[{ label: tNav('dashboard'), href: '/dashboard' }]}
          helpTooltip={t('pageHelp')}
          primaryAction={{
            label: t('inviteButton'),
            onClick: () => setInviteOpen(true),
            icon: Plus,
            dataHelpId: 'organization.invite',
          }}
        />
      </DashboardPageHeaderBridge>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
        <section>
          <h2 className="mb-3 text-[13px] font-semibold text-graphite uppercase tracking-wide">
            {t('membersSection')}
          </h2>
          {members.length === 0 ? (
            <p className="text-sm text-slate-neutral">{t('emptyMembers')}</p>
          ) : (
            <ul className="divide-y divide-stone overflow-hidden rounded-xl border border-stone bg-paper">
              {members.map((m) => (
                <MemberRow
                  key={m.id}
                  member={m}
                  organizationId={organizationId}
                  isCurrentUser={m.userId === currentUserId}
                  locale={locale}
                  onRemoved={() => void refresh()}
                />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-[13px] font-semibold text-graphite uppercase tracking-wide">
            {t('pendingSection')}
          </h2>
          {invitations.length === 0 ? (
            <p className="text-sm text-slate-neutral">
              {t('emptyInvitations')}
            </p>
          ) : (
            <ul className="divide-y divide-stone overflow-hidden rounded-xl border border-stone bg-paper">
              {invitations.map((inv) => (
                <InvitationRow
                  key={inv.id}
                  invitation={inv}
                  locale={locale}
                  onCancelled={() => void refresh()}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={organizationId}
        onInvited={() => void refresh()}
        onError={() => toast.error(tErrors('description'))}
      />
    </>
  );
}

function MemberRow({
  member,
  organizationId,
  isCurrentUser,
  locale,
  onRemoved,
}: {
  member: OrganizationMemberDto;
  organizationId: string;
  isCurrentUser: boolean;
  locale: string;
  onRemoved: () => void;
}) {
  const t = useTranslations('Members');
  const tErrors = useTranslations('Errors');
  const [isPending, startTransition] = useTransition();

  const handleRemove = (): void => {
    startTransition(async () => {
      const res = await authClient.organization.removeMember({
        memberIdOrEmail: member.id,
        organizationId,
      });
      if (res.error) {
        toast.error(tErrors('description'));
        return;
      }
      posthog.capture('member_removed', {
        member_id: member.id,
        role: member.role,
      });
      toast.success(t('removeSuccess'));
      onRemoved();
    });
  };

  const initials = getInitials(member.name, member.email);
  const roleLabel =
    member.role === 'owner'
      ? t('roleOwner')
      : member.role === 'admin'
        ? t('roleAdmin')
        : t('roleMember');

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <Avatar className="size-8">
        {member.image ? (
          <AvatarImage src={member.image} alt={member.name} />
        ) : null}
        <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium text-ink">
            {member.name || member.email}
          </span>
          {isCurrentUser && (
            <span className="text-[11px] text-slate-neutral">({t('you')})</span>
          )}
        </div>
        <span className="truncate text-[12px] text-slate-neutral">
          {member.email} ·{' '}
          {t('joinedOn', { date: formatDate(member.createdAt, locale) })}
        </span>
      </div>
      <span className="shrink-0 rounded-md bg-mist px-2 py-0.5 text-[11px] font-medium text-graphite">
        {roleLabel}
      </span>
      {!isCurrentUser && member.role !== 'owner' && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleRemove}
          loading={isPending}
          aria-label={t('remove')}
        >
          <X className="size-3.5" />
        </Button>
      )}
    </li>
  );
}

function InvitationRow({
  invitation,
  locale,
  onCancelled,
}: {
  invitation: OrganizationInvitationDto;
  locale: string;
  onCancelled: () => void;
}) {
  const t = useTranslations('Members');
  const tErrors = useTranslations('Errors');
  const [isPending, startTransition] = useTransition();

  const handleCancel = (): void => {
    startTransition(async () => {
      const res = await authClient.organization.cancelInvitation({
        invitationId: invitation.id,
      });
      if (res.error) {
        toast.error(tErrors('description'));
        return;
      }
      toast.success(t('cancelSuccess'));
      onCancelled();
    });
  };

  const roleLabel =
    invitation.role === 'admin' ? t('roleAdmin') : t('roleMember');

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="flex size-8 items-center justify-center rounded-full bg-mist">
        <Mail className="size-4 text-slate-neutral" strokeWidth={1.5} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-ink">
          {invitation.email}
        </span>
        <span className="truncate text-[12px] text-slate-neutral">
          {t('expiresOn', {
            date: formatDate(invitation.expiresAt, locale),
          })}
        </span>
      </div>
      <span className="shrink-0 rounded-md bg-mist px-2 py-0.5 text-[11px] font-medium text-graphite">
        {roleLabel}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={handleCancel}
        loading={isPending}
        aria-label={t('cancelInvitation')}
      >
        <X className="size-3.5" />
      </Button>
    </li>
  );
}

function InviteDialog({
  open,
  onOpenChange,
  organizationId,
  onInvited,
  onError,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  onInvited: () => void;
  onError: () => void;
}) {
  const t = useTranslations('Members');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>('member');
  const [isPending, startTransition] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    const trimmed = email.trim();
    if (trimmed.length === 0) return;
    startTransition(async () => {
      const res = await authClient.organization.inviteMember({
        email: trimmed,
        role: role === 'admin' ? 'admin' : 'member',
        organizationId,
      });
      if (res.error) {
        const code = res.error.code ?? '';
        if (code.toLowerCase().includes('already')) {
          toast.error(t('inviteAlreadyMember'));
        } else {
          onError();
        }
        return;
      }
      posthog.capture('member_invited', { role });
      toast.success(t('inviteSuccess'));
      setEmail('');
      setRole('member');
      onOpenChange(false);
      onInvited();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('inviteDialogTitle')}</DialogTitle>
          <DialogDescription>{t('inviteDialogDescription')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-email">{t('inviteEmailLabel')}</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('inviteEmailPlaceholder')}
              autoComplete="off"
              required
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="invite-role">{t('inviteRoleLabel')}</Label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v as OrganizationRole)}
            >
              <SelectTrigger id="invite-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="member">{t('roleMember')}</SelectItem>
                <SelectItem value="admin">{t('roleAdmin')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" loading={isPending}>
              {t('sendInvitation')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
