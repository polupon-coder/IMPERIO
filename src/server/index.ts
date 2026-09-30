// Servidor de IMPERIO: HTTP estático + Socket.IO. El servidor es la única autoridad del estado.
import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Server, type Socket } from 'socket.io';
import {
  act,
  addChat,
  createRoom,
  getRoom,
  joinRoom,
  leaveLobby,
  loadRooms,
  playerByToken,
  publicRoom,
  RoomError,
  startGame,
  updateLobby,
  type Room,
} from './rooms';

const PORT = Number(process.env.PORT ?? 3001);
const app = express();
const http = createServer(app);
const io = new Server(http, { cors: { origin: true } });

const clientDir = join(process.cwd(), 'dist', 'client');
if (existsSync(clientDir)) {
  app.use(express.static(clientDir));
  app.get(/^\/(?!socket\.io).*/, (_req, res) => res.sendFile(join(clientDir, 'index.html')));
}

/** Conexiones activas por sala: playerId → nº de sockets. */
const online = new Map<string, Map<number, number>>();
const onlineSet = (code: string) => new Set([...(online.get(code) ?? new Map()).keys()]);

function broadcast(room: Room) {
  io.to(room.code).emit('room', publicRoom(room, onlineSet(room.code)));
}

type Ack = (res: { ok: boolean; error?: string; [k: string]: unknown }) => void;

function handle(ack: unknown, fn: () => Record<string, unknown> | void) {
  const reply: Ack = typeof ack === 'function' ? (ack as Ack) : () => {};
  try {
    reply({ ok: true, ...(fn() ?? {}) });
  } catch (e) {
    if (e instanceof RoomError) reply({ ok: false, error: e.message });
    else {
      console.error(e);
      reply({ ok: false, error: 'Error interno del servidor.' });
    }
  }
}

io.on('connection', (socket: Socket) => {
  let session: { code: string; token: string; id: number } | null = null;

  const attach = (room: Room, token: string) => {
    detach();
    const p = playerByToken(room, token);
    session = { code: room.code, token, id: p.id };
    socket.join(room.code);
    const m = online.get(room.code) ?? new Map<number, number>();
    m.set(p.id, (m.get(p.id) ?? 0) + 1);
    online.set(room.code, m);
    broadcast(room);
    return { code: room.code, token, playerId: p.id };
  };

  const detach = () => {
    if (!session) return;
    const m = online.get(session.code);
    if (m) {
      const n = (m.get(session.id) ?? 1) - 1;
      if (n <= 0) m.delete(session.id);
      else m.set(session.id, n);
    }
    socket.leave(session.code);
    const code = session.code;
    session = null;
    try {
      broadcast(getRoom(code));
    } catch {
      /* sala inexistente */
    }
  };

  const current = () => {
    if (!session) throw new RoomError('No estás en ninguna sala.');
    return { room: getRoom(session.code), token: session.token };
  };

  socket.on('createRoom', (data, ack) =>
    handle(ack, () => {
      const { room, player } = createRoom(data?.name);
      return attach(room, player.token);
    }),
  );

  socket.on('joinRoom', (data, ack) =>
    handle(ack, () => {
      const { room, player } = joinRoom(data?.code, data?.name);
      return attach(room, player.token);
    }),
  );

  socket.on('rejoin', (data, ack) =>
    handle(ack, () => {
      const room = getRoom(data?.code);
      const token = String(data?.token ?? '');
      // Con onlyIfOffline, no se entra si ese jugador ya está conectado en otra pestaña.
      if (data?.onlyIfOffline && onlineSet(room.code).has(playerByToken(room, token).id))
        throw new RoomError('Ese jugador ya está conectado en otra pestaña.');
      return attach(room, token);
    }),
  );

  socket.on('lobby', (patch, ack) =>
    handle(ack, () => {
      const { room, token } = current();
      updateLobby(room, token, patch ?? {});
      broadcast(room);
    }),
  );

  socket.on('leave', (_d, ack) =>
    handle(ack, () => {
      const { room, token } = current();
      leaveLobby(room, token);
      detach();
      broadcast(room);
    }),
  );

  socket.on('start', (_d, ack) =>
    handle(ack, () => {
      const { room, token } = current();
      startGame(room, token);
      broadcast(room);
    }),
  );

  socket.on('chat', (data, ack) =>
    handle(ack, () => {
      const { room, token } = current();
      addChat(room, token, data?.text);
      broadcast(room);
    }),
  );

  socket.on('action', (action, ack) =>
    handle(ack, () => {
      const { room, token } = current();
      act(room, token, action);
      broadcast(room);
    }),
  );

  socket.on('disconnect', detach);
});

const n = loadRooms();
http.listen(PORT, () => console.log(`IMPERIO escuchando en http://localhost:${PORT} (${n} salas cargadas)`));
