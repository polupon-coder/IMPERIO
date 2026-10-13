// La versión inglesa no puede dejar textos sin traducir: cada texto de la interfaz que pasa por t(),
// cada error del motor y del servidor y cada etiqueta indirecta tiene que estar en el diccionario.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EN, EN_PATTERNS } from './i18n-en';

const read = (dir: string) =>
  readdirSync(dir)
    .filter((f) => /\.tsx?$/.test(f) && !f.endsWith('.test.ts'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');

/** Literales de una llamada: fn('texto'), sin las que llevan datos (`...`). */
const literals = (src: string, fn: string) =>
  [...src.matchAll(new RegExp(`\\b${fn}\\(\\s*'((?:[^'\\\\]|\\\\.)*)'`, 'g'))].map((m) => m[1].replace(/\\n/g, '\n').replace(/\\'/g, "'"));

const translated = (es: string) => es in EN || EN_PATTERNS.some(([re]) => re.test(es));

describe('Versión inglesa', () => {
  it('todos los textos de la interfaz tienen traducción', () => {
    const missing = literals(read('src/client'), 't').filter((k) => !translated(k));
    expect(missing).toEqual([]);
  });

  it('todos los errores y motivos del motor y del servidor tienen traducción', () => {
    const engine = read('src/engine');
    const server = read('src/server');
    const keys = [
      ...literals(engine, 'fail'),
      ...literals(engine, 'no'),
      ...[...engine.matchAll(/\) return '([^']+)';/g)].map((m) => m[1]),
      ...literals(server, 'RoomError'),
      ...[...server.matchAll(/limit\([^;]*?'([^']+)'\);/g)].map((m) => m[1]),
      'Ya tienes 1 Torreón.',
      'Necesitas 3 recursos iguales.',
      'Solo puedes hacer 3 activaciones en esta Acción Militar.',
    ];
    const missing = keys.filter((k) => !translated(k));
    expect(missing).toEqual([]);
  });

  it('las etiquetas que se traducen de forma indirecta también', () => {
    const client = read('src/client');
    // Valores de los mapas de etiquetas que luego pasan por t()
    const blocks = ['const STEP_LABEL', 'const PHASE_LABEL', 'const MARK_TITLE', 'const BOT_LABEL', 'const what', 'const TABS'].flatMap((name) => {
      expect(client.includes(name)).toBe(true);
      const i = client.indexOf(name);
      const block = client.slice(i, client.indexOf(';', i));
      return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((v) => /[A-ZÁÉ]|\s|[áéíóúñ]/.test(v));
    });
    const extra = ['fácil', 'medio', 'difícil', 'Acción', 'Reclutar', 'Militar', 'Norte', 'Sur', 'Este', 'Oeste', 'en pie', 'destruida', 'sin Muralla'];
    const missing = [...blocks, ...extra].filter((k) => !translated(k));
    expect(missing).toEqual([]);
  });
});
