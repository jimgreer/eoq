import { Router } from 'express';
import passport from 'passport';
import { config } from '../config.js';

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
    // Store the return URL so we can redirect back after granting
    (req.session as any).driveReturnUrl = req.query.returnUrl || '/';
    next();
  },
  passport.authenticate('google', {
    scope: [
      'profile',
      'email',
      'https://www.googleapis.com/auth/drive.metadata.readonly',
    ],
    accessType: 'offline',
    prompt: 'consent',
    hd: config.google.allowedDomain || undefined,
  } as any)
);

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${config.clientUrl}/login?error=auth_failed`,
  }),
  (req, res) => {
    const returnUrl = (req.session as any).driveReturnUrl;
    if (returnUrl) {
      delete (req.session as any).driveReturnUrl;
      res.redirect(`${config.clientUrl}${returnUrl}`);
    } else {
      res.redirect(config.clientUrl);
    }
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

router.post('/logout', (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

export default router;
