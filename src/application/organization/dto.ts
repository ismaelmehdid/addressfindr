export type OrganizationRole = 'owner' | 'admin' | 'member';

export type OrganizationMemberDto = {
  id: string;
  userId: string;
  email: string;
  name: string;
  image: string | null;
  role: OrganizationRole;
  createdAt: string;
};

export type OrganizationInvitationDto = {
  id: string;
  email: string;
  role: OrganizationRole;
  status: string;
  expiresAt: string;
  inviterId: string;
  createdAt: string;
};
