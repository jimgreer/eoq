function env(key: string, fallback?: string): string {
  const val = process.env[key] ?? fallback;
  if (val === undefined) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return val;
}

export const config = {
  port: parseInt(env('PORT', '3000'), 10),
  sessionSecret: env('SESSION_SECRET', 'change-me-in-production'),
  google: {
    clientId: env('GOOGLE_CLIENT_ID', ''),
    clientSecret: env('GOOGLE_CLIENT_SECRET', ''),
    callbackUrl: env('GOOGLE_CALLBACK_URL', 'http://localhost:3000/auth/google/callback'),
    allowedDomain: process.env.GOOGLE_ALLOWED_DOMAIN || '',
  },
  clientUrl: env('CLIENT_URL', 'http://localhost:5173'),
};
