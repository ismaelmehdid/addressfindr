import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { EmailMessage, EmailSendResult } from '../types/email';

export type EmailSenderPort = {
  send(message: EmailMessage): Promise<Result<EmailSendResult, AppError>>;
};
