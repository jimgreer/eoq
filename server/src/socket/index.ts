import { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import type { RequestHandler } from 'express';
import { db } from '../db.js';
import { setupCommentHandlers } from './comments.js';

let ioInstance: Server | null = null;

export function getIO(): Server {
  if (!ioInstance) {
    throw new Error('Socket.io not initialized');
  }
  return ioInstance;
}

export function createSocketServer(httpServer: HttpServer, sessionMiddleware: RequestHandler) {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      credentials: true,
    },
  });

  // Share express-session with socket.io
  io.engine.use(sessionMiddleware);

  // Deserialize user from session
  io.use((socket, next) => {
    const req = socket.request as any;
    const userId = req.session?.passport?.user;
    if (!userId) {
      return next(new Error('Not authenticated'));
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) {
      return next(new Error('User not found'));
    }

    req.user = user;
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[socket] connected: ${(socket.request as any).user?.display_name}`);
    setupCommentHandlers(io, socket);
  });

  ioInstance = io;
  return io;
}
