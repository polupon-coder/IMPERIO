// Salas: jugadores, lobby y persistencia en disco para poder reconectar sin perder la partida.
import { randomBytes, randomInt } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyAction, chooseAction, createGame, pendingSeats, RuleError, type Action, type BotLevel, type Color, type GameState, type Seat } from '../engine';
import { phase2Candidates } from '../engine/sim';

export interface LobbyPlayer {
  id: number;
  token: string;
  name: string;
  seat: Seat | null;
  color: Color | null;
  ready: boolean;
  /** Jugador máquina (o humano cuyo sitio se ha cedido a la máquina). */
  bot?: BotLevel | null;
  /** Sitio de un humano cedido a la máquina: lo recupera al volver. */
  takeover?: boolean;
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
  const human = room.players.find((x) => !x.bot);
  if (room.hostId === p.id && human) room.hostId = human.id;
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
      bot: p.bot ?? null,
    })),
    game,
    chat: room.chat ?? [],
  };
}
export type PublicRoom = ReturnType<typeof publicRoom>;

// ---------------------------------------------------------------------------------------------
// Jugadores máquina
// ---------------------------------------------------------------------------------------------

/** Nombre de la máquina según su Capital. */
const BOT_NAME: Record<Seat, string> = { 0: 'Rey del Noroeste', 1: 'Rey del Noreste', 2: 'Rey del Sureste', 3: 'Rey del Suroeste' };

function requireHost(room: Room, token: string) {
  const p = playerByToken(room, token);
  if (p.id !== room.hostId) throw new RoomError('Solo quien creó el Mundo puede hacerlo.');
  return p;
}

export function addBot(room: Room, token: string, seat: Seat, level: BotLevel) {
  requireHost(room, token);
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  if (![0, 1, 2, 3].includes(seat)) throw new RoomError('Capital no válida.');
  if (level !== 'facil' && level !== 'normal' && level !== 'dificil') throw new RoomError('Nivel no válido.');
  if (room.players.some((p) => p.seat === seat)) throw new RoomError('Esa Capital ya está ocupada.');
  if (room.players.length >= 4) throw new RoomError('El Mundo está completo (4 jugadores).');
  const name = BOT_NAME[seat];
  room.players.push({
    id: room.players.reduce((m, x) => Math.max(m, x.id), -1) + 1,
    token: randomBytes(16).toString('hex'),
    name,
    seat,
    color: SEAT_COLOR[seat],
    ready: true,
    bot: level,
  });
  save(room);
}

export function removeBot(room: Room, token: string, playerId: number) {
  requireHost(room, token);
  if (room.game) throw new RoomError('La partida ya ha empezado.');
  const p = room.players.find((x) => x.id === playerId);
  if (!p?.bot) throw new RoomError('Ese jugador no es una máquina.');
  room.players = room.players.filter((x) => x !== p);
  save(room);
}

/** El anfitrión cede a la máquina el sitio de un jugador desconectado (lo recupera al volver). */
export function takeover(room: Room, token: string, playerId: number, level: BotLevel, online: Set<number>) {
  requireHost(room, token);
  if (!room.game) throw new RoomError('La partida no ha empezado.');
  const p = room.players.find((x) => x.id === playerId);
  if (!p) throw new RoomError('Jugador desconocido.');
  if (p.bot) throw new RoomError('Ese sitio ya lo juega la máquina.');
  if (online.has(p.id)) throw new RoomError('Ese jugador está conectado.');
  p.bot = level === 'facil' || level === 'dificil' ? level : 'normal';
  p.takeover = true;
  save(room);
}

/** Al volver, el humano recupera su sitio. Devuelve true si estaba cedido. */
export function releaseTakeover(room: Room, token: string) {
  const p = playerByToken(room, token);
  if (!p.takeover) return false;
  p.bot = null;
  p.takeover = false;
  save(room);
  return true;
}

/** Máquina que debe actuar ahora (si la hay). */
export function pendingBot(room: Room) {
  const g = room.game;
  if (!g || g.phase === 'GAME_OVER') return null;
  const seats = pendingSeats(g);
  return room.players.find((p) => p.bot && p.seat !== null && seats.includes(p.seat)) ?? null;
}

/**
 * Hace que la máquina pendiente realice una acción. Si su elección fuese rechazada, prueba una
 * acción legal cualquiera y, en último caso, termina el turno, para que la partida nunca se pare.
 */
export function botStep(room: Room) {
  const bot = pendingBot(room);
  if (!bot || !room.game) return false;
  const g = room.game;
  const seat = bot.seat!;
  const tries: Action[] = [];
  const choice = chooseAction(g, seat, bot.bot!);
  if (choice) tries.push(choice);
  if (g.phase === 'PHASE_2') {
    const cands = phase2Candidates(g, Math.random).filter((c) => c.seat === seat).map((c) => c.action);
    tries.push(...cands.sort(() => Math.random() - 0.5).slice(0, 5));
    tries.push({ type: 'endTurn' });
  }
  for (const a of tries) {
    try {
      act(room, bot.token, a);
      return true;
    } catch (e) {
      console.error(`Máquina ${bot.name} en ${room.code}:`, (e as Error).message, JSON.stringify(a));
    }
  }
  return false;
}

export const allRooms = () => [...rooms.values()];
