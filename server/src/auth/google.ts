import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { config } from '../config.js';
import { db } from '../db.js';

export function setupAuth() {
  passport.serializeUser((user: any, done) => {
    done(null, user.id);
  });

  passport.deserializeUser((id: number, done) => {
    try {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
      done(null, user || null);
    } catch (err) {
      done(err);
    }
  });

  if (!config.google.clientId || !config.google.clientSecret) {
    console.warn('Google OAuth credentials not set — auth will not work');
    return;
  }

  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl,
      },
      (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value;
          if (!email) {
            return done(new Error('No email returned from Google'));
          }

          if (config.google.allowedDomain) {
            const domain = email.split('@')[1];
            if (domain !== config.google.allowedDomain) {
              return done(new Error(`Email domain ${domain} is not allowed`));
            }
          }

          const existing = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id) as any;
          if (existing) {
            // Update user info and tokens. Only overwrite refresh_token if we got a new one.
            db.prepare(
              `UPDATE users SET email = ?, display_name = ?, avatar_url = ?,
               access_token = ?, refresh_token = COALESCE(?, refresh_token)
               WHERE google_id = ?`
            ).run(
              email,
              profile.displayName,
              profile.photos?.[0]?.value || null,
              accessToken,
              refreshToken || null,
              profile.id
            );
            const updated = db.prepare('SELECT * FROM users WHERE google_id = ?').get(profile.id);
            done(null, updated as Express.User);
          } else {
            const result = db.prepare(
              `INSERT INTO users (google_id, email, display_name, avatar_url, access_token, refresh_token)
               VALUES (?, ?, ?, ?, ?, ?)`
            ).run(
              profile.id,
              email,
              profile.displayName,
              profile.photos?.[0]?.value || null,
              accessToken,
              refreshToken || null
            );
            const newUser = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
            done(null, newUser as Express.User);
          }
        } catch (err) {
          done(err as Error);
        }
      }
    )
  );
}
