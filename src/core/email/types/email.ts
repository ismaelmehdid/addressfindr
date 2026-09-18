export type EmailAddress = string & { readonly __brand: 'EmailAddress' };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailAddress(value: string): value is EmailAddress {
  return EMAIL_PATTERN.test(value);
}

export function emailAddress(value: string): EmailAddress {
  if (!isEmailAddress(value)) {
    throw new Error(`Invalid email address: ${value}`);
  }
  return value as EmailAddress;
}

export type EmailMessage = {
  to: EmailAddress;
  subject: string;
  html: string;
  text?: string;
};

export type EmailSendResult = {
  id: string;
};
