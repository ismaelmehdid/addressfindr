import {
  Body,
  Button,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Preview,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

export type InvitationEmailLocale = 'fr' | 'en';

export type InvitationEmailRole = 'admin' | 'member';

export type InvitationEmailProps = {
  organizationName: string;
  inviterName: string;
  inviterEmail: string;
  role: InvitationEmailRole;
  acceptUrl: string;
  expiresAt: Date;
  locale: InvitationEmailLocale;
  appUrl: string;
  brandName: string;
};

type Strings = {
  subject: (orgName: string) => string;
  preview: (orgName: string) => string;
  heading: (orgName: string) => string;
  body: (args: {
    inviterName: string;
    inviterEmail: string;
    orgName: string;
    role: string;
  }) => string;
  cta: string;
  expires: (date: string) => string;
  footer: string;
  poweredBy: (brandName: string) => string;
  roleAdmin: string;
  roleMember: string;
};

const STRINGS: Record<InvitationEmailLocale, Strings> = {
  fr: {
    subject: (org) => `Vous avez été invité à rejoindre ${org}`,
    preview: (org) =>
      `Rejoignez ${org} en acceptant cette invitation à votre espace de travail.`,
    heading: (org) => `Rejoignez ${org}`,
    body: ({ inviterName, inviterEmail, orgName, role }) =>
      `${inviterName} (${inviterEmail}) vous invite à rejoindre l'organisation ${orgName} en tant que ${role}.`,
    cta: "Accepter l'invitation",
    expires: (date) => `Ce lien expirera le ${date}.`,
    footer:
      'Si vous ne vous attendiez pas à cette invitation, vous pouvez ignorer cet e-mail en toute sécurité.',
    poweredBy: (brand) => `Envoyé via ${brand}.`,
    roleAdmin: 'administrateur',
    roleMember: 'membre',
  },
  en: {
    subject: (org) => `You've been invited to join ${org}`,
    preview: (org) =>
      `Join ${org} by accepting this invitation to the workspace.`,
    heading: (org) => `Join ${org}`,
    body: ({ inviterName, inviterEmail, orgName, role }) =>
      `${inviterName} (${inviterEmail}) is inviting you to join ${orgName} as ${role}.`,
    cta: 'Accept invitation',
    expires: (date) => `This link expires on ${date}.`,
    footer:
      "If you weren't expecting this invitation, you can safely ignore this email.",
    poweredBy: (brand) => `Sent via ${brand}.`,
    roleAdmin: 'an admin',
    roleMember: 'a member',
  },
};

function roleLabel(role: InvitationEmailRole, t: Strings): string {
  return role === 'admin' ? t.roleAdmin : t.roleMember;
}

function formatExpiry(date: Date, locale: InvitationEmailLocale): string {
  return new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(date);
}

export function OrganizationInvitationEmail({
  organizationName,
  inviterName,
  inviterEmail,
  role,
  acceptUrl,
  expiresAt,
  locale,
  appUrl,
  brandName,
}: InvitationEmailProps): React.ReactElement {
  const t = STRINGS[locale];
  const logoUrl = `${appUrl}/logo.PNG`;
  return (
    <Html lang={locale}>
      <Head />
      <Preview>{t.preview(organizationName)}</Preview>
      <Tailwind>
        <Body className="bg-[#f5f3ec] font-sans">
          <Container className="mx-auto my-10 max-w-xl rounded-xl border border-solid border-[#e5e3dd] bg-white px-8 py-10">
            <Section className="text-center">
              <Img
                src={logoUrl}
                width="56"
                height="56"
                alt={brandName}
                className="mx-auto rounded-md"
              />
            </Section>
            <Section className="mt-6">
              <Text className="m-0 text-xl font-semibold text-[#2d2f2a]">
                {t.heading(organizationName)}
              </Text>
              <Text className="mt-4 text-[15px] leading-6 text-[#2d2f2a]">
                {t.body({
                  inviterName,
                  inviterEmail,
                  orgName: organizationName,
                  role: roleLabel(role, t),
                })}
              </Text>
            </Section>
            <Section className="mt-6">
              <Button
                href={acceptUrl}
                className="rounded-md bg-[#2f3130] px-5 py-3 text-[14px] font-medium text-[#faf9f5] no-underline"
              >
                {t.cta}
              </Button>
            </Section>
            <Section className="mt-6">
              <Text className="m-0 text-[13px] text-[#7c7b75]">
                {t.expires(formatExpiry(expiresAt, locale))}
              </Text>
            </Section>
            <Hr className="my-6 border-[#e5e3dd]" />
            <Text className="m-0 text-[12px] leading-5 text-[#7c7b75]">
              {t.footer}
            </Text>
            <Text className="m-0 mt-4 text-[11px] leading-4 text-[#a9a8a2]">
              {t.poweredBy(brandName)}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

export function invitationEmailSubject(args: {
  organizationName: string;
  locale: InvitationEmailLocale;
}): string {
  return STRINGS[args.locale].subject(args.organizationName);
}
