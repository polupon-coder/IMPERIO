# IMPERIO — prototipo digital

Versión web jugable del juego de mesa **IMPERIO** para 4 jugadores remotos. Todos ven el mismo tablero
en tiempo real y el servidor aplica automáticamente todas las reglas.

- **Reglas:** [`docs/REGLAMENTO.md`](docs/REGLAMENTO.md) es la única fuente de verdad, con las aclaraciones del autor.
- **Estado:** prototipo completo de la Fase I y la Fase II, pensado para playtesting.

## Cómo jugar

1. Un jugador entra en la web, escribe su nombre y pulsa **Crear partida**.
2. Comparte el enlace (`…/?sala=CÓDIGO`) o el código de 5 letras.
3. Cada jugador elige su Capital (Noroeste, Noreste, Sureste o Suroeste) y su color, y pulsa **Estoy preparado**.
4. Las Capitales vacías se pueden completar con **jugadores máquina** (nivel fácil o normal): el anfitrión pulsa *Máquina: fácil / normal* en el trono vacante. Así se puede jugar 1 contra 3, 2 contra 2, etc.
5. Cuando están los 4 preparados, el anfitrión pulsa **Iniciar partida**.
6. Si alguien cierra el navegador, al volver a abrir el enlace entra automáticamente en su sitio. La sesión se guarda en el navegador y la partida en el servidor.
7. Si un jugador se desconecta, el anfitrión puede pulsar **ceder a la máquina** junto a su nombre: la máquina juega por él hasta que vuelve, y entonces recupera su sitio.

### Jugadores máquina

Juegan en el servidor con las mismas reglas y solo con acciones legales; nunca ven los dados por adelantado (calculan probabilidades). Hacen una acción por segundo para que se vea lo que hacen (`BOT_DELAY_MS` lo cambia).

- **Normal:** construye siguiendo un plan (Mercado, Ayuntamiento, Biblioteca…), usa el Mercado para completar costes, custodia los lados abiertos de su Capital, ataca cuando los dados le favorecen, desgasta a distancia con Arqueros y Artillería y marcha sobre la Capital rival más débil.
- **Fácil:** el mismo criterio con errores y menos agresividad.

En simulación, una máquina normal gana el 70 % de las partidas contra tres fáciles, y una fácil el 80 % contra tres jugadores al azar (`npx tsx scripts/simulate-bots.ts 20 normal,facil,facil,facil`).

Durante la partida, el tablero resalta siempre lo que es legal:

| Resaltado | Significado |
|---|---|
| Verde | Casillas donde puedes colocar una loseta, desplegar o reclutar |
| Azul | Casillas a las que puede moverse la tropa seleccionada |
| Rojo | Objetivos de ataque. Las Murallas atacables parpadean |
| Dorado | Capital que puedes conquistar |

Las tiradas se hacen automáticamente y la Fe se ofrece cuando corresponde.

## Probarlo en tu ordenador

1. Instala **Node.js** (versión 20 o superior) desde https://nodejs.org.
2. Descarga el proyecto: en GitHub, rama `claude/nuevo-proyecto-b2ocru`, botón **Code → Download ZIP**, y descomprímelo.
3. Abre una terminal en la carpeta del proyecto y ejecuta:
   ```bash
   npm install
   npm run jugar
   ```
4. Abre **http://localhost:3001** en el navegador y crea una partida.
5. Para jugar tú solo con los 4 jugadores, abre el enlace del Mundo en **otras 3 pestañas** y únete con otro nombre en cada una. Cada pestaña recuerda su jugador aunque la recargues.
6. Para jugar con otras personas **de tu misma red wifi**, comparte la dirección de tu ordenador en la red (por ejemplo, `http://192.168.1.35:3001/?sala=CÓDIGO`).

Para parar el servidor, pulsa `Ctrl + C` en la terminal. Las partidas se guardan en la carpeta `data/`.

## Publicarlo en Internet (Render)

El repositorio incluye `render.yaml`. En https://render.com: **New → Blueprint**, conectar este repositorio y la rama, y aceptar. Render compila (`npm run build`) y arranca (`npm start`) el juego, y da una dirección pública con HTTPS.

En el plan gratuito el servidor se duerme tras un rato sin uso (tarda ~1 minuto en despertar) y las partidas guardadas pueden perderse si se reinicia. Con un plan de pago y un disco persistente (`DATA_DIR` apuntando al disco) se conservan siempre.

## Privacidad y límites

- Solo se guardan el nombre elegido, la partida y el chat; no se piden correos ni contraseñas.
- Las partidas terminadas se borran a los **3 días** y cualquier Mundo sin actividad a los **14 días** (con su chat).
- Límites por dirección IP: 10 intentos fallidos de entrar en un Mundo cada 10 minutos, 20 Mundos creados por hora, y un máximo de 8 mensajes de chat cada 10 segundos.

## Desarrollo

Requiere Node 20 o superior.

```bash
npm install
npm run dev:server   # servidor en http://localhost:3001
npm run dev:client   # interfaz en http://localhost:5173 (con proxy al servidor)
npm test             # tests del motor de reglas
npm run typecheck
npx tsx scripts/simulate-phase1.ts 1 500   # simula Fases I aleatorias y busca bloqueos
npx tsx scripts/simulate-games.ts 1 100    # partidas completas aleatorias: errores, bloqueos y estados ilegales
npx tsx scripts/simulate-bots.ts 20 normal,facil,azar,azar   # partidas entre jugadores máquina
```

Para producción, `npm run build` genera `dist/client` y `npm start` sirve la web y el WebSocket en `PORT` (3001 por defecto). Las partidas se guardan como JSON en `data/rooms/`; `DATA_DIR` permite cambiar esa ruta. Hace falta un alojamiento con disco persistente y WebSockets, por ejemplo Render, Railway o Fly.io.

## Arquitectura

```
src/engine/   Motor de reglas puro (TypeScript, sin red): estado, validación, consultas de legalidad, dados.
  rules.ts      constantes, costes y geometría del tablero
  phase1.ts     colocación de losetas, conectividad, reserva de Agua, intercambio de emergencia
  military.ts   movimiento, objetivos de ataque, línea de tiro, dados base
  game.ts       createGame / applyAction: la máquina de estados completa
  ai.ts         jugadores máquina (niveles fácil y normal)
src/server/   Express + Socket.IO: salas, lobby, persistencia y reconexión. Es la única autoridad.
src/client/   React: inicio, lobby, tablero y panel de acciones. Usa el mismo motor para resaltar lo legal.
public/assets Ilustraciones (provisionales).
```

El cliente nunca decide el resultado de nada: envía una acción y el servidor la valida con el motor, la aplica y la envía a todos. El generador de dados vive solo en el servidor.

### Estados de la partida

- `SETUP / FIRST_PLAYER`: tirada automática de primer jugador.
- `PHASE_1`, dividida en:
  - `INITIAL_PLACEMENT`: colocación simultánea de las 4 losetas iniciales.
  - `PILE_PLACEMENT`: un turno por jugador con la pila común.
  - `EXCHANGE`: intercambio de emergencia (§16).
  - `FINAL_DEPLOY`: despliegue de las tropas que quedaron en reserva.
  - `BLOCKED`: bloqueo sin solución prevista por el reglamento.
- `PHASE_2 / TURN`: producción, Biblioteca, Acción Civil y Acción Militar, Mercado y negociación.
- `GAME_OVER`.

Hay dos tipos de decisiones que se superponen al estado principal:

- `prompt`: decisiones pendientes de un jugador concreto, que puede no ser el activo. Por ejemplo, el recurso de la Biblioteca, qué tipo defiende, la Fe, el avance tras el combate o responder a una oferta de comercio.
- `combat`: combate en curso.

## Sustituir las ilustraciones

Las imágenes están en `public/assets/`:

- **Losetas:** `tiles/llanura.webp`, `bosque.webp`, `montana.webp` y `agua.webp` se generan desde `art/losetas.webp` con `python3 scripts/prepare-tiles.py`, que aplica los ajustes de color (Agua suavizada, Llanura más amarillenta). Las ilustraciones originales del autor están en `art/`.
- **Capitales:** `tiles/capital.webp` es la ilustración original. Las versiones `capital-<color>.webp`, con los tejados del color de cada jugador, se generan con `python3 scripts/recolor-capital.py`.
- **Edificios:** `buildings/<edificio>.webp`, recortados con `python3 scripts/prepare-buildings.py` de `art/edificios-militares.webp` y `art/edificios-civiles.webp`. En el panel de cada jugador, los que no ha construido aparecen con baja opacidad.
- **Recursos:** `resources/{comida,madera,piedra,agua}.webp`, recortados y algo desaturados con `python3 scripts/prepare-resources.py` a partir de `art/recursos.webp`.
- **Tropas en el tablero:** `units/<color>/<tipo>.webp`, donde el color es `rojo`, `azul`, `amarillo` o `verde` y el tipo es `infanteria`, `arquero`, `lancero`, `caballeria` o `artilleria`.
  - Las rojas son las ilustraciones del autor.
  - Las azules, amarillas y verdes se generan recoloreando las rojas con `python3 scripts/recolor-units.py`. Las fuentes son `art/tropas-rojo.webp` y, para la Infantería con espada, `art/infanteria-rojo.jpg`.
  - Para usar ilustraciones propias de cada color, sustituye esos archivos.
- **Fichas:** `fichas/<color>/<tipo>.webp` son las figuras de `units/` con el papel sustituido por una acuarela suave del color del jugador (`python3 scripts/token-backgrounds.py`).
- **Iconos de los paneles:** siluetas en `units/<tipo>.svg`.

Para usar archivos PNG u otros nombres, cambia las rutas en `src/client/assets.ts`. Las losetas se recortan en cuadrado (`object-fit: cover`). Las tropas se muestran en fichas circulares con fondo y borde del color del jugador.
