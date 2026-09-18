import { fileTypeFromBuffer } from 'file-type';

export const MIME_DETECTION_ALIASES: Record<string, ReadonlyArray<string>> = {
  'image/jpeg': ['image/jpeg', 'image/jpg'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/zip',
  ],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/zip',
  ],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': [
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/zip',
  ],
};

export async function validateMagicBytes(
  file: File,
  claimedMime: string,
): Promise<boolean> {
  const head = await file.slice(0, 4100).arrayBuffer();
  const detected = await fileTypeFromBuffer(new Uint8Array(head));
  if (!detected) {
    if (claimedMime.startsWith('text/') || claimedMime === 'application/json')
      return true;
    return false;
  }
  const accepted = MIME_DETECTION_ALIASES[claimedMime] ?? [claimedMime];
  return accepted.includes(detected.mime);
}
