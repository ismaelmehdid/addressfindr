import { err, ok, type Result } from 'neverthrow';
import { v7 as uuidv7 } from 'uuid';
import { type AppError, validation } from '@/core/errors';
import type { FileCategory, FilePath } from '../types/file';

export const MAX_PATH_LENGTH = 1024;
export const MAX_FILENAME_LENGTH = 200;
const MIN_FILENAME_LENGTH = 1;

const BACKSLASH = /\\/;
const SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;
const FILENAME_PATTERN = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function hasControlChar(input: string): boolean {
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

const DIACRITIC_MAP: Record<string, string> = {
  ü: 'u',
  ö: 'o',
  ä: 'a',
  ß: 'ss',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  à: 'a',
  á: 'a',
  â: 'a',
  ã: 'a',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  õ: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ñ: 'n',
  ç: 'c',
};

function stripDiacritics(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map((c) => DIACRITIC_MAP[c] ?? c)
    .join('');
}

function splitExtension(filename: string): { base: string; ext: string } {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) {
    return { base: filename, ext: '' };
  }
  return {
    base: filename.slice(0, dot),
    ext: filename.slice(dot + 1),
  };
}

function slugify(input: string): string {
  const lowered = stripDiacritics(input);
  const replaced = lowered.replace(/[^a-z0-9]+/g, '-');
  return replaced.replace(/^-+|-+$/g, '');
}

function buildSlugFilename(filename: string): string {
  const trimmed = filename.trim();
  const { base, ext } = splitExtension(trimmed);
  const baseSlug = slugify(base);
  const extSlug = slugify(ext);
  if (baseSlug.length === 0) return '';
  return extSlug.length > 0 ? `${baseSlug}.${extSlug}` : baseSlug;
}

function truncateFilename(input: string, max: number): string {
  if (input.length <= max) return input;
  const { base, ext } = splitExtension(input);
  if (ext.length === 0) return input.slice(0, max);
  const room = max - ext.length - 1;
  if (room < 1) return input.slice(0, max);
  return `${base.slice(0, room)}.${ext}`;
}

function validateSegment(
  value: string,
  field: string,
): Result<string, AppError> {
  if (value.length === 0) return err(validation(`${field} is empty`, field));
  if (!SEGMENT_PATTERN.test(value)) {
    return err(validation(`${field} contains invalid characters`, field));
  }
  return ok(value);
}

export function buildFilePath(input: {
  organizationId: string;
  userId: string;
  category: FileCategory;
  filename: string;
}): Result<FilePath, AppError> {
  const org = validateSegment(input.organizationId.trim(), 'organizationId');
  if (org.isErr()) return err(org.error);

  const user = validateSegment(input.userId.trim(), 'userId');
  if (user.isErr()) return err(user.error);

  const trimmed = input.filename.trim();
  if (trimmed.length < MIN_FILENAME_LENGTH) {
    return err(validation('filename is empty', 'filename'));
  }
  if (hasControlChar(trimmed) || BACKSLASH.test(trimmed)) {
    return err(validation('filename contains invalid characters', 'filename'));
  }

  const slug = buildSlugFilename(trimmed);
  if (slug.length === 0) {
    return err(validation('filename produces an empty slug', 'filename'));
  }

  const id = uuidv7();
  const tail = truncateFilename(`${id}-${slug}`, MAX_FILENAME_LENGTH);
  const path = `${org.value}/${user.value}/${input.category}/${tail}`;

  if (path.length > MAX_PATH_LENGTH) {
    return err(validation('path exceeds maximum length', 'path'));
  }

  return ok(path as FilePath);
}

export function parseFilePath(raw: string): Result<FilePath, AppError> {
  if (raw.length === 0) return err(validation('path is empty', 'path'));
  if (raw.length > MAX_PATH_LENGTH) {
    return err(validation('path exceeds maximum length', 'path'));
  }
  if (raw.startsWith('/') || raw.endsWith('/')) {
    return err(validation('path must not start or end with /', 'path'));
  }
  if (BACKSLASH.test(raw)) {
    return err(validation('path must not contain backslashes', 'path'));
  }
  if (hasControlChar(raw) || raw.includes(' ')) {
    return err(validation('path contains invalid characters', 'path'));
  }
  const segments = raw.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) {
    return err(validation('path contains traversal segments', 'path'));
  }
  const last = segments.at(-1);
  if (!last || !FILENAME_PATTERN.test(last)) {
    return err(validation('path filename is invalid', 'path'));
  }
  return ok(raw as FilePath);
}

export function isPathOwnedBy(input: {
  path: FilePath;
  organizationId: string;
  userId: string;
}): boolean {
  const prefix = `${input.organizationId}/${input.userId}/`;
  return input.path.startsWith(prefix);
}

export function ownerPrefix(input: {
  organizationId: string;
  userId: string;
  category?: FileCategory;
}): string {
  if (input.category) {
    return `${input.organizationId}/${input.userId}/${input.category}`;
  }
  return `${input.organizationId}/${input.userId}`;
}
