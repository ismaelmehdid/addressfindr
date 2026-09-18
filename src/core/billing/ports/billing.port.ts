import type { Result } from 'neverthrow';
import type { AppError } from '@/core/errors';
import type { Entitlement } from '../types/entitlement';

export type CheckAppAccessInput = {
  organizationId: string;
};

export type BillingPort = {
  checkAppAccess(
    input: CheckAppAccessInput,
  ): Promise<Result<Entitlement, AppError>>;
};
