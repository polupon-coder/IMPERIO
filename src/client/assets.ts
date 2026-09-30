// Ilustraciones del juego. Para usar tus propias imágenes, sustituye los archivos de
// public/assets/ manteniendo el nombre, o cambia aquí la ruta/extensión (.png, .webp, .svg).
import type { Terrain, UnitType } from '../engine';

export const TILE_IMAGES: Record<Terrain | 'capital', string> = {
  llanura: '/assets/tiles/llanura.svg',
  bosque: '/assets/tiles/bosque.svg',
  montana: '/assets/tiles/montana.svg',
  agua: '/assets/tiles/agua.svg',
  capital: '/assets/tiles/capital.svg',
};

export const UNIT_IMAGES: Record<UnitType, string> = {
  infanteria: '/assets/units/infanteria.svg',
  arquero: '/assets/units/arquero.svg',
  lancero: '/assets/units/lancero.svg',
  caballeria: '/assets/units/caballeria.svg',
  artilleria: '/assets/units/artilleria.svg',
};

/** Colores de los jugadores (tono acuarela). */
export const PLAYER_COLORS: Record<string, string> = {
  rojo: '#b3362f',
  azul: '#2f5d9b',
  amarillo: '#d1a12a',
  verde: '#3f7d3a',
};
