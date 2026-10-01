# IMPERIO — Reglamento para la implementación digital

Este documento es la **fuente de verdad de las mecánicas**. No se añaden, eliminan ni reinterpretan reglas sin
consultar al autor. El código cita los números de sección (`§N`).

La sección **A** recoge las aclaraciones del autor; cuando contradicen el texto original, prevalecen.

---

## A. Aclaraciones del autor (prevalecen sobre el texto original)

| # | Tema | Decisión |
|---|------|----------|
| A1 | Capitales y orden | Cada jugador ocupa una Capital (se elige en la sala). El primer jugador se decide con 1d6 (mayor resultado; empates repiten solo los empatados) y el orden sigue en **sentido horario**: NO (2,2) → NE (2,7) → SE (7,7) → SO (7,2). |
| A2 | Colores | Cada Capital tiene siempre el mismo color: **Noroeste verde** (dragón), **Noreste azul** (ciervo), **Sureste rojo** (serpiente) y **Suroeste amarillo** (león). |
| A3 | Losetas iniciales | Los 4 jugadores colocan **a la vez** sus 4 losetas iniciales, con sus tropas y recursos. Después empiezan los turnos con la pila. |
| A4 | Despliegue de recompensas | Las tropas se despliegan **al recibirlas**. Si en ese momento no hay casilla legal, la tropa queda en **reserva** (se muestra momentáneamente en una casilla vacía del anillo) y puede desplegarse después. Al terminar la Fase I, las que sigan sin casilla legal no se reciben (§20). |
| A5 | Pila (§14–15) | Si la loseta superior no tiene posición legal va al fondo y se roba la siguiente. Si se recorre toda la pila sin encontrar ninguna colocable, hay bloqueo absoluto (§16). |
| A6 | Intercambio de emergencia (§16) | Lo decide el jugador activo. Primero se intenta con una loseta terrestre de fuera de los anillos; si no es posible, de su propio anillo. Mover la loseta existente **no cuenta como colocación** (la loseta pendiente sí). |
| A7 | Conectividad (§11) | Solo por adyacencia ortogonal. El camino puede pasar por otra Capital. |
| A8 | Capitales | La casilla de Capital está **siempre bloqueada a todos los efectos**: ninguna tropa entra ni pasa por ella, y tampoco se dispara a través de ella. |
| A9 | Ataque agrupado tras mover | Varias tropas pueden moverse y después atacar agrupadas, siempre que sean del mismo tipo y estén en la misma loseta al atacar. |
| A10 | Avance tras combate (§63) | Si un ataque cuerpo a cuerpo elimina a la última tropa enemiga de una loseta, **toda la formación atacante** (todas las figuras propias de la loseta de origen) puede avanzar gratis a la loseta liberada. Solo el tipo elegido combate y tira dados. |
| A11 | Paso por pilas propias | Una tropa puede atravesar una loseta propia con 3 tropas; el límite solo se aplica donde termina. |
| A12 | Dados | Todo lo no indicado es 1 contra 1; cada figura agrupada suma +1 dado (atacante y defensor). Las ventajas funcionan en ambos sentidos. **Artillería a distancia 2 contra cualquier tropa: 1 contra 2, y la Artillería nunca sufre baja** (sustituye §96–98). Arquero a distancia 2: 1 contra 1. **Tropa convencional contra Muralla: 1 contra 2 y el atacante nunca sufre baja** (sustituye la baja de §105). |
| A13 | Fe | Tras la tirada decide primero el atacante y después el defensor (viendo el resultado final del atacante). La Muralla no tiene Fe. |
| A14 | Murallas | Están en el lado entre la Capital y la casilla vecina; si están intactas bloquean todo (movimiento, ataques y disparos, también los del propietario). Solo existen alrededor de las Capitales. |
| A15 | Bombardeo de Murallas | Opción B: la Artillería puede atacar la Muralla de un lado desde la casilla adyacente a ese lado o desde cualquier casilla a distancia 2 de la Capital con una ruta ortogonal mínima que entra por ese lado (la casilla en línea recta y las dos diagonales). |
| A16 | Pasar | El jugador activo puede terminar su turno sin realizar acciones. |
| A17 | Negociación | Cada intercambio es de **1 recurso por 1 recurso** con otro jugador. Solo **un intercambio aceptado por turno**. |
| A18 | Mercado | La conversión es de **3 recursos iguales → 1 cualquiera** (sustituye el 2 → 1 de §45). |
| A19 | Fe | Usar la Fe cuesta **2 Agua** (sustituye el 1 Agua de §42). |
| A20 | Murallas en la Fase II | Con la **Acción Civil** se puede **levantar una Muralla nueva** (4 Piedra + 1 Madera) o **reparar una destruida** (3 Piedra) en un lado de la propia Capital. Máximo 4 Murallas por Capital. No se puede en un lado con tropas enemigas en su casilla. Una Muralla destruida no se puede reparar en el turno siguiente de su dueño, sino a partir del otro (debe pasar una ronda). Las Murallas levantadas en la Fase II cuentan como **originales** y se restauran al ser conquistada la Capital (§115). Sustituye la prohibición de §108. |
| A21 | Acción Militar | Solo las tropas **activas** (con su edificio construido, §41) pueden moverse o atacar; las demás solo defienden. La Acción Militar permite **activar hasta 3 figuras**, **o reclutar 1 tropa y activar hasta 2**, en el orden que se quiera. La tropa recién reclutada no actúa ese turno. Sin tropas activas, la Acción Militar solo sirve para reclutar. Sustituye «No se combinan» de §47–48 y el movimiento libre de §40. |

### Decisiones de implementación (confirmadas por el autor)

- **Obstáculos de la Artillería contra tropas:** igual que el Arquero, solo la bloquean las Capitales (A8) y las Murallas (A14).
- **Avance con Artillería hacia una Montaña:** avanzan todas las figuras de la formación que pueden entrar. La Artillería no puede entrar en Montaña (§74), así que se queda.
- **Intercambio con tropas encima:** si la loseta movida era del propio anillo y tenía tropas, estas se quedan en su casilla. El intercambio solo es legal si siguen siendo legales sobre el nuevo terreno.
- **Orden de las acciones:** con Ayuntamiento, la Acción Militar en curso debe terminarse antes de construir.
- **Bloqueo sin solución** (ni siquiera el intercambio es posible): no está cubierto por el reglamento. El motor lo detecta y detiene la Fase I. En 2000 partidas simuladas no ha ocurrido nunca.
- **Recompensas de la Fase I:** la tropa no puede rechazarse si existe una casilla legal (§20).
- **Rondas:** una ronda son 4 turnos (uno por jugador) y se numera en romanos.
- **Desconexiones:** si un jugador con una decisión pendiente se desconecta, la partida espera a que vuelva.

---

## B. Reglamento original

### 1. Datos generales
4 jugadores · tablero fijo de 8 × 8 · dados d6 · ambientación medieval europea.
Fases: **Fase I — Creación del Mundo** y **Fase II — El Imperio**.

**Victoria:** un jugador gana inmediatamente cuando tiene a la vez sus **8 edificios** y al menos **1 Conquista**, conseguidas en cualquier orden.

### 2. Tablero
64 casillas: **4 Capitales** fijas en (2,2), (2,7), (7,2) y (7,7) —filas y columnas del 1 al 8— y **60 losetas de terreno**. Las Capitales no son losetas de terreno.

### 3. Terrenos
| Terreno | Cantidad | Recurso |
|---|---:|---|
| Llanura | 24 | Comida |
| Bosque | 12 | Madera |
| Montaña | 12 | Piedra |
| Agua | 12 | Agua |

### 4. Primer jugador
Todos lanzan 1d6 y el mayor resultado empieza. Los empates se repiten solo entre los empatados. El orden se mantiene toda la partida.

## FASE I — CREACIÓN DEL MUNDO

### 5. Losetas iniciales
Antes de crear la pila, cada jugador recibe 1 Llanura, 1 Bosque, 1 Montaña y 1 Agua. Debe colocarlas en 4 de las 8 casillas que rodean su propia Capital; cuentan entre sus 15 losetas. Cada una da inmediatamente 1 recurso, y las tres terrestres también su recompensa militar:
Llanura → 1 Comida + 1 Infantería · Bosque → 1 Madera + 1 Arquero **o** 1 Lancero · Montaña → 1 Piedra + 1 Muralla **o** 1 Artillería · Agua → 1 Agua, sin recompensa militar.

### 6. Anillo de la Capital
Las 8 casillas alrededor de cada Capital (4 ortogonales y 4 diagonales) forman su anillo. Cada jugador completa personalmente el suyo; los demás no pueden colocar losetas en un anillo rival. Cada jugador coloca obligatoriamente 1 Agua inicial en su anillo, así que cada anillo termina con **1 Agua + 7 terrenos terrestres**.

### 7. Pila común
Quedan 20 Llanuras, 8 Bosques, 8 Montañas y 8 Aguas: 44 losetas en una única pila mezclada. Cada jugador coloca 11 losetas adicionales, 15 en total.

### 8. Turno de Fase I
1) Roba la primera loseta. 2) Comprueba sus posiciones legales. 3) La coloca. 4) Recibe 1 recurso de ese terreno. 5) Si ocupa una posición terrestre de su propio anillo, obtiene también su recompensa militar.

### 9. Expansión personal
Tras las cuatro iniciales, toda loseta nueva debe compartir al menos un lado ortogonal con una loseta colocada antes por ese mismo jugador (la diagonal no cuenta). Se registra quién colocó cada loseta solo para construir el mapa. Al comenzar la Fase II ninguna loseta pertenece a ningún jugador.

### 10. Restricciones de colocación
No puede colocarse una loseta si: ocupa el anillo de una Capital rival; introduce una segunda Agua en un anillo; hace imposible que las cuatro Capitales terminen conectadas por tierra; deja menos espacios exteriores libres que Aguas pendientes; incumple la obligación de completar el propio anillo.

### 11. Conectividad terrestre
Al final de la Fase I debe existir un camino terrestre entre las cuatro Capitales. Son terrestres Llanura, Bosque y Montaña; el Agua no es transitable. Mientras haya casillas vacías, se consideran posibles terrenos terrestres futuros. Colocar un Agua es ilegal si elimina toda posibilidad futura de conexión.

### 12. Reserva de espacios para Agua
Tras las cuatro Aguas iniciales quedan 8, que deben terminar fuera de los anillos. No puede colocarse una loseta terrestre fuera de los anillos si después quedarían menos casillas exteriores libres que Aguas pendientes.

### 13. Obligación de completar el anillo
Cada jugador empieza con 4 casillas de su anillo ocupadas y debe completar las otras 4 en sus 11 colocaciones. Si sus colocaciones restantes igualan a los huecos de su anillo, todas las siguientes deben completarlo (con terrenos terrestres).

### 14. Loseta no colocable
Si la loseta superior no tiene posición legal, va al fondo de la pila y se roba otra.

### 15. Búsqueda en la pila
Si devolver losetas al fondo genera un ciclo, se busca en la pila la primera loseta con posición legal, se coloca y se barajan de nuevo las restantes. *(Ver A5.)*

### 16. Intercambio de emergencia
Si hay bloqueo absoluto y ninguna loseta restante puede colocarse:
1) se escoge una loseta terrestre ya colocada fuera de todos los anillos; 2) se mueve a una casilla libre donde pueda colocarse legalmente; 3) la loseta pendiente se coloca en el hueco que deja; 4) el resultado debe cumplir las reglas de conectividad, distribución de terrenos, Agua y anillos.
Mover la loseta existente no genera recurso; la loseta pendiente sí. El intercambio no genera recompensas militares. *(Ver A6.)*

### 17. Expansión de emergencia
Si hay casillas legales pero ninguna es contigua a una loseta propia, puede colocar en cualquier casilla legal libre, y esa loseta pasa a ser un nuevo foco de expansión.

### 18. Recursos durante la Fase I
Toda loseta colocada da 1 recurso de su terreno, dentro y fuera del anillo. Los recursos pasan íntegros a la Fase II.

### 19. Recompensas militares del anillo
Solo las 7 losetas terrestres del anillo dan recompensa: Llanura → 1 Infantería; Bosque → 1 Arquero o 1 Lancero; Montaña → 1 Muralla o 1 Artillería; Agua → nada. El jugador elige la opción. Fuera del anillo nunca hay tropas ni Murallas.

### 20. Despliegue inicial
Las tropas de recompensa se colocan en alguna de las 8 losetas del propio anillo: máximo 3 tropas por loseta, se pueden mezclar tipos, nunca sobre Agua, la Artillería nunca sobre Montaña, y máximo 5 tropas de cada tipo. Si una recompensa no puede colocarse legalmente, la figura no se recibe, pero el recurso sí. *(Ver A4.)*

### 21–23. Murallas
Cada Montaña del anillo permite elegir 1 Artillería o 1 Muralla. Una Muralla solo protege la propia Capital y va en uno de sus 4 lados ortogonales (norte, sur, este, oeste): máximo 4 por Capital, sin diagonales y nunca fuera de las Capitales. Las elegidas en la Fase I, con sus posiciones, quedan registradas como **Murallas originales** de la Capital.

### 24. Fin de la Fase I
Termina cuando las 60 losetas están colocadas.

## FASE II — EL IMPERIO

### 25. Producción del anillo
Al comienzo de cada turno, cada una de las 8 losetas del anillo produce 1 recurso. Los recursos se acumulan y no caducan.

### 26. Producción de Biblioteca
Si el jugador ya tiene Biblioteca al empezar el turno, obtiene además 1 recurso a su elección. Una Biblioteca construida en ese mismo turno no produce hasta el siguiente.

### 27–29. Estructura del turno
Sin Ayuntamiento: 1 Acción Civil **o** 1 Acción Militar. Con Ayuntamiento: 1 Acción Civil + 1 Acción Militar, en el orden que elija. Los edificios funcionan en cuanto se construyen: por ejemplo, construir el Ayuntamiento con la Acción Civil permite hacer la Acción Militar ese mismo turno, y los edificios militares desbloquean sus tropas al instante.

### 30. Acción Civil
Sirve exclusivamente para construir 1 edificio. Reclutar no es una Acción Civil. *(A20: también puede levantar o reparar una Muralla.)*

### 31–38. Edificios (una copia de cada uno por jugador)
| Edificio | Madera | Piedra | Comida | Agua | Efecto |
|---|---:|---:|---:|---:|---|
| Cuartel | 3 | 2 | 2 | 1 | Desbloquea ofensivamente la Infantería |
| Arquería | 4 | 1 | 2 | 1 | Desbloquea ofensivamente los Arqueros |
| Caballerizas | 2 | 2 | 4 | 2 | Permite reclutar y usar ofensivamente la Caballería |
| Herrería | 2 | 4 | 1 | 2 | Desbloquea los Lanceros (con Biblioteca, la Artillería) |
| Iglesia | 2 | 4 | 2 | 2 | Permite usar la Fe |
| Mercado | 2 | 2 | 3 | 3 | Convertir y negociar recursos |
| Biblioteca | 3 | 3 | 2 | 3 | +1 recurso elegido por turno; con Herrería, la Artillería |
| Ayuntamiento | 5 | 5 | 3 | 3 | Requiere 2 edificios previos; 1 Acción Civil + 1 Militar |

### 39. Los ocho edificios
Cuartel, Arquería, Caballerizas, Herrería, Iglesia, Mercado, Biblioteca y Ayuntamiento.

### 40–41. Desbloqueo de unidades
Desde el comienzo de la Fase II todas las tropas pueden moverse *(A21: solo las activas)* y defenderse, pero no pueden iniciar un ataque sin su edificio: Infantería → Cuartel; Arquero → Arquería; Caballería → Caballerizas; Lancero → Herrería; Artillería → Herrería + Biblioteca.

### 42–44. Iglesia y Fe
Con Iglesia, pagar 1 Agua *(A19: 2 Agua)* permite repetir la tirada completa de tus propios dados; el nuevo resultado es obligatorio. Puede usarse en tu turno o en el de otro si participas en la tirada, y solo repites tus propios dados. Máximo 1 vez por cada turno individual. No se usa para conquistar, porque la conquista no tiene tirada.

### 45–46. Mercado
En su turno, un jugador con Mercado puede convertir 2 recursos iguales *(A18: 3)* en 1 recurso cualquiera, sin gastar acción y tantas veces como pueda pagar. También puede negociar recursos con cualquier jugador, sin gastar acción; solo el jugador activo necesita Mercado. *(Ver A17.)*

### 47–48. Acción Militar
Elige exactamente una opción: **A. Activar** hasta 3 figuras distintas, o **B. Reclutar** 1 tropa. No se combinan. *(Sustituido por A21: reclutar 1 + activar hasta 2.)* Una tropa recién reclutada no puede moverse ni atacar ese turno.

### 49–53. Reclutamiento
| Tropa | Requisito | Madera | Piedra | Comida | Agua |
|---|---|---:|---:|---:|---:|
| Infantería | Cuartel | – | – | 2 | 1 |
| Arquero | Arquería | 2 | – | 1 | 1 |
| Lancero | Herrería | 1 | 1 | 1 | 1 |
| Caballería | Caballerizas | 1 | – | 3 | 1 |
| Artillería | Herrería + Biblioteca | 2 | 3 | 1 | 1 |

### 54. Aparición de una tropa reclutada
Aparece en una casilla válida del propio anillo: máximo 3 tropas por loseta, nunca sobre Agua, la Artillería nunca sobre Montaña, nunca con tropas enemigas y máximo 5 unidades de ese tipo. Si no hay posición válida, no puede reclutarse.

### 55–56. Límites y apilamiento
Máximo 5 unidades de cada tipo por jugador. Una loseta admite como máximo 3 tropas del mismo jugador, de tipos distintos si se quiere. Tropas enemigas nunca comparten loseta.

### 57–61. Activación y ataques agrupados
Cada figura se activa una sola vez por Acción Militar, con un máximo de 3 figuras distintas. Varias tropas pueden hacer un único ataque agrupado si están en la misma loseta, son del mismo tipo y están todas activadas. Por ejemplo, 3 Infanterías atacando juntas consumen 3 activaciones. Cada figura adicional suma +1 dado: 1d/2d/3d, o 2d/3d/4d si la unidad tiene ventaja. No se combinan tipos distintos en un mismo ataque. Si se ataca una pila mixta, el defensor elige qué tipo defiende: solo ese tipo cuenta para la tirada, y la baja se retira de ese tipo.

### 62–63. Bloqueo y avance
Una loseta con tropas enemigas bloquea completamente el movimiento. Si un combate cuerpo a cuerpo elimina a la última tropa enemiga de una loseta, el atacante puede avanzar a ella: es opcional, no gasta activación y no se aplica tras ataques a distancia. *(Ver A10.)*

### 64–75. Movimiento
- Todo movimiento es ortogonal.
- Bosque y Montaña son terreno lento. Entrar en uno termina la activación: no se puede seguir moviendo ni atacar.
- Empezar en terreno lento y salir consume toda la activación para mover 1 casilla. Si la tropa no se mueve, puede atacar desde allí.
- Infantería, Arquero y Lancero en Llanura: mueven hasta 2, o mueven 1 y atacan.
- Caballería en Llanura: mueve hasta 2 y ataca. Puede entrar en Montaña (sigue siendo terreno lento).
- Artillería en Llanura: mueve hasta 2 **o** ataca, nunca las dos cosas. Puede entrar en Bosque (termina la activación; salir gasta una activación completa y mueve 1; si se queda quieta, puede atacar). No puede entrar en Montaña.
- Ninguna tropa entra en Agua.

### 76–77. Resolución del combate
Cada bando lanza sus d6 y solo cuenta el dado más alto. Si el atacante saca más, gana; si el defensor saca más, gana el defensor; si empatan, no pasa nada. El perdedor elimina 1 tropa participante, nunca el grupo entero.

### 78–83. Infantería, Caballería y Lancero
- La Infantería tira 1 dado base.
- Caballería contra Infantería: 2d contra 1d.
- Caballería contra Arquero cuerpo a cuerpo: 2d contra 1d.
- Caballería contra Lancero: 1d contra 2d, y Lancero contra Caballería: 2d contra 1d.
- El Lancero contra otras tropas tira 1 dado base, salvo la regla de la Artillería.

### 84–93. Arqueros
- Alcance máximo 2 en distancia Manhattan (la diagonal inmediata cuenta como 2).
- Disparan a través de Llanura, Bosque, Montaña, Agua y tropas. Una Muralla intacta bloquea el disparo que cruza el lado que protege; en una diagonal basta con que una de las dos rutas ortogonales esté libre.
- Varios Arqueros de la misma loseta que disparan a la misma loseta objetivo forman un único ataque agrupado. Activados por separado, pueden atacar objetivos distintos.
- A distancia 2 contra una unidad sin alcance: si gana el Arquero, el defensor pierde 1 tropa; si empatan, nada; si gana el defensor, el Arquero no sufre daño. Arquero contra Arquero: el perdedor pierde 1 Arquero.
- A distancia 1 el combate es cuerpo a cuerpo y el Arquero puede sufrir bajas.
- Contra una pila mixta, el defensor elige el tipo: un Arquero defensor puede contraatacar; un tipo sin alcance 2 puede ganar la tirada pero no causar daño.
- Los Arqueros no atacan Murallas ni Capitales a distancia. Una Capital solo se ataca desde una casilla ortogonalmente adyacente.

### 94–99. Artillería
- Mide el alcance igual que el Arquero (máximo 2), sin heredar el resto de sus reglas.
- Cuerpo a cuerpo contra una tropa convencional (Infantería, Arquero, Lancero, Caballería): 1d contra 2d, inicie quien inicie el combate.
- Artillería contra Artillería a distancia 1: 1d contra 1d.
- Siempre elige mover **o** atacar.
- *(Las reglas originales §96–98 de distancia 2 contra tropas quedan sustituidas por A12.)*

### 100–102. Artillería contra Murallas
Ataca Murallas sin estar cuerpo a cuerpo, con alcance 2, e identificando la Muralla por el lado de la Capital que protege. *(Ver A15.)*
Dados: 1 Artillería 2d, 2 Artillerías 3d y 3 Artillerías 4d, contra 1d de la Muralla. Si gana la Artillería, la Muralla queda destruida; si gana la Muralla, se elimina 1 Artillería participante; si empatan, nada. Igual desde distancia 2.

### 103–108. Murallas contra tropas convencionales
- La tropa debe estar junto al lado protegido. Tira 1 dado base (+1 por tropa igual agrupada) contra 2 de la Muralla. Las ventajas entre tipos no cuentan.
- Si gana el atacante, la Muralla queda destruida. *(Si gana la Muralla: ver A12, sin baja.)*
- Las tropas del propietario atraviesan libremente sus propias Murallas. *(Ver A8 y A14.)*
- Un enemigo no puede atacar una Capital a través de un lado con Muralla intacta.
- Una Muralla destruida no puede reconstruirse; solo vuelve cuando esa Capital es conquistada. *(Sustituida por A20: se puede reparar.)*

### 109–119. Capitales y Conquistas
- Para atacar una Capital, la tropa debe estar desbloqueada, ortogonalmente adyacente, poder atacar todavía en esta activación y estar en un lado sin Muralla intacta. Si puede hacerlo legalmente, la Capital queda **conquistada automáticamente**, sin tirada y sin que importen el tipo, el número ni las bonificaciones.
- Conquistar cuenta como ataque: se puede mover 1 y conquistar (Infantería, Arquero, Lancero en Llanura) o mover hasta 2 y conquistar (Caballería en Llanura). No se puede tras entrar en terreno lento, y la Artillería no puede mover y conquistar a la vez ni conquistar a distancia.
- La figura conquistadora se queda en su loseta; nunca entra en la Capital.
- El atacante gana 1 Conquista y nada más. El defensor no pierde edificios, recursos, tropas ni producción.
- Inmediatamente después, todas las Murallas originales de esa Capital vuelven a su sitio, sin mover ninguna tropa.
- Una Capital puede ser conquistada por varios jugadores, pero cada jugador solo puede conquistar una vez cada Capital concreta.
- El jugador conquistado no queda eliminado.
- Si el anillo no tiene ninguna posición válida (por enemigos, el límite de 3, Agua o Montaña para la Artillería), no se puede reclutar.

### 120–122. Victoria
En cuanto un jugador tiene los 8 edificios y al menos 1 Conquista, la partida termina y gana **IMPERIO**. Las Conquistas no se pierden aunque después conquisten su propia Capital.
