import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '@/shared/env';

let cached: Transporter | null = null;

export function smtpTransporter(): Transporter {
  if (cached) return cached;
  const e = env();
  if (!e.SMTP_HOST || !e.SMTP_USER || !e.SMTP_PASS) {
    throw new Error(
      'SMTP transporter requested but SMTP_HOST/SMTP_USER/SMTP_PASS not set',
    );
  }
  cached = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: { user: e.SMTP_USER, pass: e.SMTP_PASS },
  });
  return cached;
}
