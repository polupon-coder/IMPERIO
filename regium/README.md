# REGIUM — material de las cartas

- `arte/originales/`: cartas exportadas con la plantilla Ludotipia póker 88×63 (página 83×108 mm, sin recortar).
- `tools/recortar.py`: recorta por la línea de corte (63×88 mm, esquinas de 3 mm) y guarda PNG con transparencia.
  `python3 -I regium/tools/recortar.py <salida> regium/arte/originales/*.jpg`
- `tools/clasificar_tropa.py`: lee el valor (círculos encendidos) y el reino de una tropa.

Nombres: `tropa-<reino>-NN`, `lugar-<reino>-territorio-N`, `lugar-<reino>-ciudad-N`, `regente-<reino>`,
`escudo-<emblema>`, `pergamino-<reino>`, `indicador-numeros`, `dorso-regium`, `dorso-hierro`.

## Notas del autor

- Escudos (reverso de los regentes): dragón = rojo, águila = verde, serpiente = amarillo, cráneo con cuernos = azul, elefante = morado.
- Dorsos: tropas = hierro forjado (azul).
- `indicador-numeros-vertical.jpg` es la versión corregida (IV, VI, VII, VIII, IX) de `indicador-numeros-vertical-original.jpg`,
  hecha con `tools/corregir_numeros.py` copiando los glifos del pergamino horizontal.
