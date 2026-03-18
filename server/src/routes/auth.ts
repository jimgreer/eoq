import { Router } from 'express';
import passport from 'passport';
import { config } from '../config.js';
import { getAccessToken } from '../services/drivePermissions.js';

const router = Router();

router.get(
  '/google',
  passport.authenticate('google', {
    scope: ['profile', 'email'],
    hd: config.google.allowedDomain || undefined,
  } as any)
);

// Separate flow for granting Drive access
router.get(
  '/google/drive',
  (req, res, next) => {
    // Store the return URL in session AND pass via state parameter for reliability
    const returnUrl = (req.query.returnUrl as string) || '/';
    (req.session as any).driveReturnUrl = returnUrl;
    // Encode return URL in state parameter (base64)
    const state = Buffer.from(JSON.stringify({ returnUrl })).toString('base64');
    passport.authenticate('google', {
      scope: [
        'profile',
        'email',
        'https://www.googleapis.com/auth/drive.readonly',
      ],
      accessType: 'offline',
      prompt: 'consent',
      hd: config.google.allowedDomain || undefined,
      state,
    } as any)(req, res, next);
  }
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${config.clientUrl}/login?error=auth_failed`,
  }),
  (req, res) => {
    // Try to get return URL from state parameter first, then session
    let returnUrl = '/';
    const state = req.query.state as string;
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        returnUrl = decoded.returnUrl || '/';
      } catch {
        // Fall back to session
        returnUrl = (req.session as any).driveReturnUrl || '/';
      }
    } else {
      returnUrl = (req.session as any).driveReturnUrl || '/';
    }
    delete (req.session as any).driveReturnUrl;
    res.redirect(`${config.clientUrl}${returnUrl}`);
  }
);

router.get('/me', (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const user = req.user as any;
  res.json({
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    is_admin: user.is_admin,
    has_drive_token: !!user.refresh_token,
  });
});

// Get access token for Google Picker (requires Drive auth)
router.get('/picker-token', async (req, res) => {
  if (!req.isAuthenticated?.() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const user = req.user as any;
  const accessToken = await getAccessToken(user.id);

  if (!accessToken) {
    return res.status(403).json({
      error: 'Drive access required',
      needsDriveAuth: true,
    });
  }

  res.json({ accessToken });
});

router.post('/logout', (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

export default router;
