import { db } from '../db.js';
import { config } from '../config.js';

const CACHE_MINUTES = 5;

/**
 * Extract a Google Doc ID from a URL.
 * Handles: docs.google.com/document/d/{ID}/...
 *          drive.google.com/file/d/{ID}/...
 *          or a bare doc ID
 */
export function extractGoogleDocId(input: string): string | null {
  const trimmed = input.trim();

  // Try URL patterns
  const match = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];

  // If it looks like a bare ID (alphanumeric, dashes, underscores, 20+ chars)
  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed)) return trimmed;

  return null;
}

/**
 * Refresh the user's access token using their refresh token.
 */
async function refreshAccessToken(userId: number): Promise<string> {
  const user = db.prepare('SELECT refresh_token FROM users WHERE id = ?').get(userId) as any;
  if (!user?.refresh_token) {
    throw new Error('No refresh token stored');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.google.clientId,
      client_secret: config.google.clientSecret,
      refresh_token: user.refresh_token,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }

  const data = await res.json() as any;
  db.prepare('UPDATE users SET access_token = ? WHERE id = ?').run(data.access_token, userId);
  return data.access_token;
}

/**
 * Check if a user has access to a Google Doc via the Drive API.
 * Results are cached for CACHE_MINUTES.
 */
export async function checkDriveAccess(userId: number, googleDocId: string): Promise<{ hasAccess: boolean; needsDriveAuth: boolean }> {
  // Check if user has a refresh token at all
  const user = db.prepare('SELECT access_token, refresh_token FROM users WHERE id = ?').get(userId) as any;
  if (!user?.refresh_token) {
    return { hasAccess: false, needsDriveAuth: true };
  }

  // Check cache
  const cached = db.prepare(
    `SELECT has_access FROM drive_permission_cache
     WHERE user_id = ? AND google_doc_id = ?
     AND checked_at > datetime('now', '-${CACHE_MINUTES} minutes')`
  ).get(userId, googleDocId) as any;

  if (cached) {
    return { hasAccess: !!cached.has_access, needsDriveAuth: false };
  }

  // Try with current access token
  let accessToken = user.access_token;
  let hasAccess = await tryDriveCheck(accessToken, googleDocId);

  // If unauthorized, refresh and retry once
  if (hasAccess === null) {
    try {
      accessToken = await refreshAccessToken(userId);
      hasAccess = await tryDriveCheck(accessToken, googleDocId);
    } catch {
      return { hasAccess: false, needsDriveAuth: true };
    }
  }

  const result = hasAccess === true;

  // Cache the result
  db.prepare(
    `INSERT OR REPLACE INTO drive_permission_cache (user_id, google_doc_id, has_access, checked_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(userId, googleDocId, result ? 1 : 0);

  return { hasAccess: result, needsDriveAuth: false };
}

/**
 * Try a Drive API check. Returns:
 * - true: user has access
 * - false: user does not have access
 * - null: token expired, needs refresh
 */
async function tryDriveCheck(accessToken: string | null, googleDocId: string): Promise<boolean | null> {
  if (!accessToken) return null;

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${googleDocId}?fields=id`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (res.ok) return true;
  if (res.status === 401) return null; // Token expired
  return false; // 403, 404, etc.
}
