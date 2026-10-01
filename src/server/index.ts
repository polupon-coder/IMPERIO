// Servidor de IMPERIO: HTTP estático + Socket.IO. El servidor es la única autoridad del estado.
import express from 'express';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { Server, type Socket } from 'socket.io';
import {
  act,
  addBot,
  addChat,
  allRooms,
  botStep,
  pendingBot,
  releaseTakeover,
  removeBot,
  takeover,
  createRoom,
  getRoom,
  joinRoom,
  leaveLobby,
  loadRooms,
  playerByToken,
  publicRoom,
  purgeOldRooms,
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
  scheduleBots(room);
}

// ---------------------------------------------------------------------------------------------
// Jugadores máquina: actúan solos, con una pausa para que se vea lo que hacen
// ---------------------------------------------------------------------------------------------
const BOT_DELAY = Number(process.env.BOT_DELAY_MS ?? 1000);
const botTimers = new Map<string, NodeJS.Timeout>();

function scheduleBots(room: Room) {
  if (botTimers.has(room.code) || !pendingBot(room)) return;
  const phase1 = room.game?.phase === 'PHASE_1';
  const delay = phase1 ? BOT_DELAY * 0.6 : room.game?.prompt ? BOT_DELAY * 0.7 : BOT_DELAY;
  const timer = setTimeout(() => {
    botTimers.delete(room.code);
    if (!allRooms().includes(room)) return; // Mundo borrado entretanto
    try {
      if (botStep(room)) broadcast(room);
    } catch (e) {
      console.error('Error de la máquina', e);
    }
  }, delay);
  timer.unref();
  botTimers.set(room.code, timer);
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

// ---------------------------------------------------------------------------------------------
// Límites de intentos por dirección IP (evita probar códigos al azar y abusos)
// ---------------------------------------------------------------------------------------------
const hits = new Map<string, number[]>();
/** Registra un intento y lanza error si se supera `max` en `windowMs`. */
function limit(key: string, max: number, windowMs: number, message: string) {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) throw new RoomError(message);
  list.push(now);
  hits.set(key, list);
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (list.every((t) => now - t > 60 * 60 * 1000)) hits.delete(k);
}, 10 * 60 * 1000).unref();

const clientIp = (socket: Socket) =>
  String(socket.handshake.headers['x-forwarded-for'] ?? socket.handshake.address).split(',')[0].trim();

io.on('connection', (socket: Socket) => {
  const ip = clientIp(socket);
  /** Cuenta los intentos fallidos de entrar en un Mundo. */
  const guardedEntry = (fn: () => Record<string, unknown>) => {
    const blockKey = `fail:${ip}`;
    const now = Date.now();
    const fails = (hits.get(blockKey) ?? []).filter((t) => now - t < 10 * 60 * 1000);
    if (fails.length >= 10) throw new RoomError('Demasiados intentos fallidos. Espera unos minutos.');
    try {
      return fn();
    } catch (e) {
      if (e instanceof RoomError) hits.set(blockKey, [...fails, now]);
      throw e;
    }
  };
  let session: { code: string; token: string; id: number } | null = null;

  const attach = (room: Room, token: string) => {
    detach();
    const p = playerByToken(room, token);
    if (p.takeover) releaseTakeover(room, token); // el humano recupera su sitio
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
    if (!session) throw new RoomError('No estás en ningún Mundo.');
    return { room: getRoom(session.code), token: session.token };
  };

  socket.on('createRoom', (data, ack) =>
    handle(ack, () => {
      limit(`create:${ip}`, 20, 60 * 60 * 1000, 'Has creado demasiados Mundos. Prueba más tarde.');
      const { room, player } = createRoom(data?.name);
      return attach(room, player.token);
    }),
  );

  socket.on('joinRoom', (data, ack) =>
    handle(ack, () =>
      guardedEntry(() => {
        const { room, player } = joinRoom(data?.code, data?.name);
        return attach(room, player.token);
      }),
    ),
  );

  socket.on('rejoin', (data, ack) =>
    handle(ack, () => {
      const room = getRoom(data?.code);
      const token = String(data?.token ?? '');
      // Con onlyIfOffline, no se entra si ese jugador ya está conectado en otra pestaña.
      if (data?.onlyIfOffline && onlineSet(room.code).has(playerByToken(room, token).id))
        throw new RoomError('Ese jugador ya está conectado en otra pestaña.');
      return guardedEntry(() => attach(room, token));
    }),
  );

  socket.on('lobby', (patch, ack) =>
    handle(ack, () => {
      const { room, token } = current();
      updateLobby(room, token, patch ?? {});
      broadcast(room);
    }),
  );

  socket.on('addBot', (data, ack) =>
    handle(ack, () => {
      const { room, token } = current();
      addBot(room, token, data?.seat, data?.level);
      broadcast(room);
    }),
  );

  socket.on('removeBot', (data, ack) =>
    handle(ack, () => {
      const { room, token } = current();
      removeBot(room, token, Number(data?.playerId));
      broadcast(room);
    }),
  );

  socket.on('takeover', (data, ack) =>
    handle(ack, () => {
      const { room, token } = current();
      takeover(room, token, Number(data?.playerId), data?.level, onlineSet(room.code));
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
      limit(`chat:${socket.id}`, 8, 10 * 1000, 'Estás enviando mensajes demasiado rápido.');
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
// Las partidas con máquinas continúan solas tras un reinicio del servidor
for (const room of allRooms()) scheduleBots(room);
const purged = purgeOldRooms();
if (purged) console.log(`${purged} Mundos antiguos borrados`);
setInterval(() => {
  const k = purgeOldRooms();
  if (k) console.log(`${k} Mundos antiguos borrados`);
}, 60 * 60 * 1000).unref();
http.listen(PORT, () => console.log(`IMPERIO escuchando en http://localhost:${PORT} (${n} Mundos cargados)`));
