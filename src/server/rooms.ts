// Salas: jugadores, lobby y persistencia en disco para poder reconectar sin perder la partida.
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyAction, createGame, RuleError, type Action, type Color, type GameState, type Seat } from '../engine';

export interface LobbyPlayer {
  id: number;
  token: string;
  name: string;
  seat: Seat | null;
  color: Color | null;
  ready: boolean;
}

export interface Room {
  code: string;
  createdAt: number;
  /** Última modificación (ms). */
  updatedAt?: number;
  hostId: number;
  players: LobbyPlayer[];
  game: GameState | null;
  version: number;
  chat?: ChatMessage[];
}

export interface ChatMessage {
  n: number;
  playerId: number;
  text: string;
  ts: number;
}

/** Cada Capital tiene siempre el mismo color: NO verde, NE azul, SE rojo, SO amarillo. */
export const SEAT_COLOR: Record<Seat, Color> = { 0: 'verde', 1: 'azul', 2: 'rojo', 3: 'amarillo' };
const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data', 'rooms');
mkdirSync(DATA_DIR, { recursive: true });

const rooms = new Map<string, Room>();

export class RoomError extends Error {}

function save(room: Room) {
  room.version++;
  room.updatedAt = Date.now();
  const file = join(DATA_DIR, `${room.code}.json`);
  writeFileSync(file + '.tmp', JSON.stringify(room));
  renameSync(file + '.tmp', file);
}

/**
 * Borrado automático: partidas terminadas tras 3 días y cualquier Mundo sin actividad
 * durante 14 días (incluido su chat). Devuelve cuántos se han borrado.
 */
const DAY = 24 * 60 * 60 * 1000;
export const FINISHED_TTL = 3 * DAY;
export const IDLE_TTL = 14 * DAY;
export function purgeOldRooms(now = Date.now()) {
  let n = 0;
  for (const room of [...rooms.values()]) {
    const last = room.updatedAt ?? room.createdAt;
    const finished = room.game?.phase === 'GAME_OVER';
    if (now - last > (finished ? FINISHED_TTL : IDLE_TTL)) {
      rooms.delete(room.code);
      try {
        unlinkSync(join(DATA_DIR, `${room.code}.json`));
      } catch {
        /* ya no existía */
      }
      n++;
    }
  }
  return n;
}

export function loadRooms() {
  for (const f of readdirSync(DATA_DIR)) {
    if (!f.endsWith('.json')) continue;
    try {
      const room = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf8')) as Room;
      rooms.set(room.code, room);
    } catch {
      /* archivo dañado: se ignora */
    }
  }
  return rooms.size;
}

function newCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (;;) {
    const code = Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join('');
    if (!rooms.has(code) && !existsSync(join(DATA_DIR, `${code}.json`))) return code;
  }
}

const cleanName = (name: unknown) => String(name ?? '').trim().slice(0, 20) || 'Jugador';

export function getRoom(code: string): Room {
  const room = rooms.get(String(code ?? '').toUpperCase().trim());
  if (!room) throw new RoomError('Ese Mundo no existe.');
  return room;
}

export function playerByToken(room: Room, token: string) {
  const p = room.players.find((x) => x.token === token);
  if (!p) throw new RoomError('No perteneces a este Mundo.');
  return p;
}

function addPlayer(room: Room, name: string): LobbyPlayer {
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  if (room.players.length >= 4) throw new RoomError('El Mundo está completo (4 jugadores).');
  const takenSeats = room.players.map((p) => p.seat);
  const seat = ([0, 1, 2, 3] as Seat[]).find((s) => !takenSeats.includes(s)) ?? null;
  const p: LobbyPlayer = {
    id: room.players.reduce((m, x) => Math.max(m, x.id), -1) + 1,
    token: randomBytes(16).toString('hex'),
    name: cleanName(name),
    seat,
    color: seat === null ? null : SEAT_COLOR[seat],
    ready: false,
  };
  room.players.push(p);
  return p;
}

export function createRoom(name: string) {
  const room: Room = { code: newCode(), createdAt: Date.now(), hostId: 0, players: [], game: null, version: 0 };
  const p = addPlayer(room, name);
  room.hostId = p.id;
  rooms.set(room.code, room);
  save(room);
  return { room, player: p };
}

export function joinRoom(code: string, name: string) {
  const room = getRoom(code);
  const p = addPlayer(room, name);
  save(room);
  return { room, player: p };
}

export function updateLobby(
  room: Room,
  token: string,
  patch: { name?: string; seat?: Seat; color?: Color; ready?: boolean },
) {
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  const p = playerByToken(room, token);
  if (patch.name !== undefined) p.name = cleanName(patch.name);
  if (patch.seat !== undefined) {
    if (![0, 1, 2, 3].includes(patch.seat)) throw new RoomError('Capital no válida.');
    if (room.players.some((o) => o !== p && o.seat === patch.seat)) throw new RoomError('Esa Capital ya está ocupada.');
    p.seat = patch.seat;
    p.color = SEAT_COLOR[patch.seat];
    p.ready = false;
  }
  if (patch.ready !== undefined) p.ready = !!patch.ready;
  save(room);
}

export function leaveLobby(room: Room, token: string) {
  if (room.game) return;
  const p = playerByToken(room, token);
  room.players = room.players.filter((x) => x !== p);
  if (room.hostId === p.id && room.players.length) room.hostId = room.players[0].id;
  save(room);
}

export function startGame(room: Room, token: string) {
  const p = playerByToken(room, token);
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  if (p.id !== room.hostId) throw new RoomError('Solo quien creó el Mundo puede iniciar la partida.');
  if (room.players.length !== 4) throw new RoomError('Hacen falta 4 jugadores.');
  if (room.players.some((x) => !x.ready)) throw new RoomError('Todos los jugadores deben estar preparados.');
  room.game = createGame(
    room.players.map((x) => ({ seat: x.seat!, name: x.name, color: x.color! })),
    randomInt(2 ** 31),
  );
  save(room);
}

export function act(room: Room, token: string, action: Action) {
  if (!room.game) throw new RoomError('La partida no ha empezado.');
  const p = playerByToken(room, token);
  try {
    room.game = applyAction(room.game, p.seat!, action);
  } catch (e) {
    if (e instanceof RuleError) throw new RoomError(e.message);
    throw e;
  }
  save(room);
}

/** Estado visible para los clientes: sin tokens ni semilla del generador de dados. */
export function addChat(room: Room, token: string, text: unknown) {
  const p = playerByToken(room, token);
  const clean = String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, 300);
  if (!clean) throw new RoomError('Mensaje vacío.');
  const chat = (room.chat ??= []);
  chat.push({ n: (chat.at(-1)?.n ?? 0) + 1, playerId: p.id, text: clean, ts: Date.now() });
  if (chat.length > 200) chat.splice(0, chat.length - 200);
  save(room);
}

export function publicRoom(room: Room, online: Set<number>) {
  const game = room.game ? { ...room.game, rng: 0 } : null;
  return {
    code: room.code,
    hostId: room.hostId,
    version: room.version,
    players: room.players.map((p) => ({
      id: p.id,
      name: p.name,
      seat: p.seat,
      color: p.color,
      ready: p.ready,
      online: online.has(p.id),
    })),
    game,
    chat: room.chat ?? [],
  };
}
export type PublicRoom = ReturnType<typeof publicRoom>;
