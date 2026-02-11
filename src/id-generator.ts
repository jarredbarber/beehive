import { basename } from 'path';

const CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
const ID_LENGTH = 3;
const MAX_RETRIES = 1000;

/**
 * Get the default prefix for task IDs based on project folder name.
 */
export function getDefaultPrefix(cwd: string = process.cwd()): string {
  const folderName = basename(cwd);
  // Sanitize: lowercase, replace non-alphanumeric with empty, limit length
  const sanitized = folderName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 10);
  return sanitized ||  'bh';
}

export function generateId(existingIds: Set<string>, prefix?: string): string {
  const idPrefix = (prefix ||  'bh') + '-';
  
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let suffix = '';
    for (let i = 0; i < ID_LENGTH; i++) {
      suffix += CHARS[Math.floor(Math.random() * CHARS.length)];
    }
    
    const id = idPrefix + suffix;

    if (!existingIds.has(id)) {
      return id;
    }
  }

  throw new Error(`Failed to generate unique ID after ${MAX_RETRIES} attempts`);
}
