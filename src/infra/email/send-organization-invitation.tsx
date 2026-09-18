import 'server-only';

import { render } from '@react-email/components';
import type { Result } from 'neverthrow';
import { emailAddress } from '@/core/email/types/email';
import type { AppError } from '@/core/errors';
import { env } from '@/shared/env';
import { emailSender } from './email-sender';
import {
  type InvitationEmailLocale,
  type InvitationEmailRole,
  invitationEmailSubject,
  OrganizationInvitationEmail,
} from './templates/organization-invitation-email';

export async function sendOrganizationInvitationEmail(args: {
  recipientEmail: string;
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
  role: InvitationEmailRole;
  acceptUrl: string;
  expiresAt: Date;
  locale: InvitationEmailLocale;
}): Promise<Result<{ id: string }, AppError>> {
  const e = env();
  const appUrl = e.NEXT_PUBLIC_APP_URL;
  const brandName = e.SMTP_FROM_NAME ?? args.organizationName;

  const html = await render(
    <OrganizationInvitationEmail
      organizationName={args.organizationName}
      inviterName={args.inviterName}
      inviterEmail={args.inviterEmail}
      role={args.role}
      acceptUrl={args.acceptUrl}
      expiresAt={args.expiresAt}
      locale={args.locale}
      appUrl={appUrl}
      brandName={brandName}
    />,
  );
  const text = await render(
    <OrganizationInvitationEmail
      organizationName={args.organizationName}
      inviterName={args.inviterName}
      inviterEmail={args.inviterEmail}
      role={args.role}
      acceptUrl={args.acceptUrl}
      expiresAt={args.expiresAt}
      locale={args.locale}
      appUrl={appUrl}
      brandName={brandName}
    />,
    { plainText: true },
  );

  return emailSender().send({
    to: emailAddress(args.recipientEmail),
    subject: invitationEmailSubject({
      organizationName: args.organizationName,
      locale: args.locale,
    }),
    html,
    text,
  });
}
