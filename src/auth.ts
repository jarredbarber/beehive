import { randomBytes, createHash } from 'crypto';

export type KeyRole = 'admin' | 'bee';

export function generateKey(role: KeyRole): string {
    const prefix = role === 'admin' ? 'bh_ak_' : 'bh_bk_';
    const randomPart = randomBytes(24).toString('hex');
    return `${prefix}${randomPart}`;
}

export function hashKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
}
