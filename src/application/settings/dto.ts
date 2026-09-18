export type SessionDto = {
  id: string;
  token: string;
  createdAt: string;
  expiresAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  isCurrent: boolean;
};

export type LinkedAccountDto = {
  id: string;
  accountId: string;
  providerId: string;
  createdAt: string;
};
