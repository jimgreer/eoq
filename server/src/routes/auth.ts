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

router.get(
  '/google/callback',
  passport.authenticate('google', {
    failureRedirect: `${config.clientUrl}/login?error=auth_failed`,
  }),
  (_req, res) => {
    res.redirect(config.clientUrl);
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
  });
});

router.post('/logout', (req, res) => {
  req.logout(() => {
    res.json({ ok: true });
  });
});

export default router;
