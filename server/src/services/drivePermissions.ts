import { db } from '../db.js';
import { config } from '../config.js';

// Only cache positive results (access granted) to allow live permission updates
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
 * Refresh a user's access token using their refresh token.
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
 * Get an access token for a user, refreshing if needed.
 */
async function getAccessToken(userId: number): Promise<string | null> {
  const user = db.prepare('SELECT access_token, refresh_token FROM users WHERE id = ?').get(userId) as any;
  if (!user?.refresh_token) {
    return null;
  }

  // Try to refresh to get a fresh token
  try {
    return await refreshAccessToken(userId);
  } catch {
    return user.access_token || null;
  }
}

/**
 * Check if a user has access to a Google Doc by checking the doc's permission list.
 * Uses the session creator's credentials to fetch the permission list.
 */
export async function checkDriveAccess(
  creatorId: number,
  readerEmail: string,
  googleDocId: string
): Promise<{ hasAccess: boolean; creatorNeedsDriveAuth: boolean }> {
  // Check cache - only use cached positive results to allow live permission updates
  const cached = db.prepare(
    `SELECT has_access FROM drive_permission_cache
     WHERE user_email = ? AND google_doc_id = ?
     AND has_access = 1
     AND checked_at > datetime('now', '-${CACHE_MINUTES} minutes')`
  ).get(readerEmail.toLowerCase(), googleDocId) as any;

  if (cached) {
    return { hasAccess: true, creatorNeedsDriveAuth: false };
  }

  // Get the creator's access token
  const accessToken = await getAccessToken(creatorId);
  if (!accessToken) {
    return { hasAccess: false, creatorNeedsDriveAuth: true };
  }

  // Fetch the doc's permission list using the creator's token
  const hasAccess = await checkPermissionList(accessToken, googleDocId, readerEmail);

  // Cache the result (only positive results will be used)
  db.prepare(
    `INSERT OR REPLACE INTO drive_permission_cache (user_email, google_doc_id, has_access, checked_at)
     VALUES (?, ?, ?, datetime('now'))`
  ).run(readerEmail.toLowerCase(), googleDocId, hasAccess ? 1 : 0);

  return { hasAccess, creatorNeedsDriveAuth: false };
}

/**
 * Check if an email has access to a doc by fetching its permission list.
 */
async function checkPermissionList(
  accessToken: string,
  googleDocId: string,
  readerEmail: string
): Promise<boolean> {
  const normalizedEmail = readerEmail.toLowerCase();

  // Fetch permissions list
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${googleDocId}/permissions?fields=permissions(emailAddress,type)`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    // If we can't fetch permissions, deny access
    return false;
  }

  const data = await res.json() as any;
  const permissions = data.permissions || [];

  // Check if user's email is in the permission list, or if doc is shared with "anyone"
  for (const perm of permissions) {
    // "anyone" type means the doc is publicly accessible
    if (perm.type === 'anyone') {
      return true;
    }
    // Check email match
    if (perm.emailAddress && perm.emailAddress.toLowerCase() === normalizedEmail) {
      return true;
    }
  }

  return false;
}
