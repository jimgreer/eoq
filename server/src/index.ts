import './env.js';

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import session from 'express-session';
import ConnectSQLite from 'connect-sqlite3';
import passport from 'passport';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { setupAuth } from './auth/google.js';
import authRoutes from './routes/auth.js';
import sessionRoutes from './routes/sessions.js';
import commentRoutes from './routes/comments.js';
import { createSocketServer } from './socket/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

const app = express();
app.set('trust proxy', 1);
const httpServer = createServer(app);

// Middleware
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: config.clientUrl, credentials: true }));
app.use(express.json());

// Session
const SQLiteStore = ConnectSQLite(session);
const sessionMiddleware = session({
  store: new (SQLiteStore as any)({
    db: 'sessions.db',
    dir: dataDir,
  }),
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  },
});
app.use(sessionMiddleware);

// Passport
setupAuth();
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use('/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/sessions', commentRoutes);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// In production, serve the client build
if (process.env.NODE_ENV === 'production') {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Socket.IO
createSocketServer(httpServer, sessionMiddleware);

httpServer.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});
