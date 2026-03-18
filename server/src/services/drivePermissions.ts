import { db } from '../db.js';
import { config } from '../config.js';

// Only cache positive results (access granted) to allow live permission updates
const CACHE_MINUTES = 5;

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
export async function getAccessToken(userId: number): Promise<string | null> {
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
 * Export a Google Doc as HTML.
 * Returns the HTML content and title.
 */
export async function exportGoogleDoc(
  userId: number,
  googleDocId: string
): Promise<{ html: string; title: string } | { error: string; needsDriveAuth?: boolean }> {
  const accessToken = await getAccessToken(userId);
  if (!accessToken) {
    return { error: 'Drive access required', needsDriveAuth: true };
  }

  // First, get the doc metadata for the title
  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${googleDocId}?fields=name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!metaRes.ok) {
    if (metaRes.status === 404) {
      return { error: 'Google Doc not found' };
    }
    if (metaRes.status === 403) {
      return { error: 'You do not have access to this Google Doc' };
    }
    return { error: `Failed to fetch doc metadata: ${metaRes.status}` };
  }

  const meta = await metaRes.json() as any;
  const title = meta.name || 'Untitled Document';

  // Export the doc as HTML
  const exportRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${googleDocId}/export?mimeType=text/html`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!exportRes.ok) {
    const errorBody = await exportRes.text();
    console.error(`Export failed: ${exportRes.status}`, errorBody);

    // Check if it's a file type that can't be exported
    if (exportRes.status === 403) {
      try {
        const errorJson = JSON.parse(errorBody);
        const reason = errorJson.error?.errors?.[0]?.reason;
        if (reason === 'exportSizeLimitExceeded') {
          return { error: 'Document is too large to export. Try a smaller document.' };
        }
        if (reason === 'fileNotExportable') {
          return { error: 'This file type cannot be exported. Please use a Google Doc.' };
        }
      } catch {}
      return { error: 'Cannot export this document. Make sure it is a Google Doc.' };
    }
    return { error: `Failed to export doc: ${exportRes.status}` };
  }

  const html = await exportRes.text();
  return { html, title };
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
