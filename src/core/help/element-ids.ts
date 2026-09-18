export const HELP_ELEMENT_IDS = [
  'sidebar.dashboard',
  'sidebar.storage',
  'sidebar.organization',
  'sidebar.user-menu',
  'sidebar.language-switcher',
  'header.chat-toggle',
  'storage.upload',
  'organization.invite',
] as const;

export type HelpElementId = (typeof HELP_ELEMENT_IDS)[number];

export const HELP_ELEMENT_DESCRIPTIONS: Record<HelpElementId, string> = {
  'sidebar.dashboard': 'Sidebar — Dashboard icon (top, home)',
  'sidebar.storage': 'Sidebar — Storage (uploaded files) icon',
  'sidebar.organization': 'Sidebar — Organization (members) icon',
  'sidebar.user-menu':
    'Sidebar — user avatar at the bottom; opens a dropdown with Edit Profile, Settings, Sign Out',
  'sidebar.language-switcher':
    'Sidebar — language (globe) button at the bottom; opens FR/EN switcher',
  'header.chat-toggle':
    'Top-right chat toggle button (opens/closes this chat panel)',
  'storage.upload': '"Upload" button on the Storage page (top-right)',
  'organization.invite':
    '"Invite" primary button on the Organization (members) page',
};

export function isHelpElementId(value: string): value is HelpElementId {
  return (HELP_ELEMENT_IDS as readonly string[]).includes(value);
}
