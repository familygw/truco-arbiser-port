# Lógica recuperada de Truco Arbiser

La tabla de comandos se recuperó de `TRUCO.EXE` alrededor de los offsets
61841–62248. El ejecutable reconoce, entre otras, estas expresiones:

- `envido`, `real envido`, `dos reales envido`, `falta envido`;
- `flor`, `con flor`, `contraflor`, `con flor me achico`;
- `truco`, `retruco`, `vale 4`, `vale cuatro`;
- `quiero retruco`, `quiero vale 4`, `de acuerdo`, `esta bien`;
- `mazo`, `baraja`, `me voy`, `huyo`, `rajo`, `abandono`;
- `carta 1`, `carta 2`, `carta 3`.

Los 156 registros de `MVYTRUC@` confirman grupos de voz separados para
Envido, Real Envido, Dos Reales Envido, Falta Envido, Flor, Con Flor Quiero,
Con Flor Juego, Con Flor me Achico, Truco, Quiero Retruco, Quiero Vale 4 y
Contraflor al Resto.

## Reglas trasladadas al port

- Envido puede encadenarse con otro Envido, Real Envido y Falta Envido.
- Se admiten dos Reales Envido, tal como indica la cadena original.
- Rechazar una subida entrega el valor aceptado antes de la última subida.
- Falta Envido vale lo necesario para llegar a buenas si todos están en malas,
  o para llegar a 30 cuando alguien ya está en buenas.
- Envido tiene prioridad sobre un Truco todavía no respondido. Al terminar el
  tanto se restaura la respuesta pendiente al Truco.
- Un Envido pendiente debe resolverse antes de cantar Truco; se ofrecen las
  respuestas compuestas `Quiero y Truco` y `No quiero y Truco`.
- Flor anula Envido. Una Flor sin oposición vale 3.
- Si ambos tienen Flor aparecen `Con Flor Quiero`, `Con Flor me Achico`,
  `Contraflor` y `Contraflor al Resto`.
- La Flor se cuenta como 20 más el valor de las tres cartas del palo.
- Sólo el rival del último cantor puede subir Truco, Retruco o Vale 4.

La estrategia exacta de riesgo de la CPU continúa siendo una aproximación:
las ramas y el vocabulario están recuperados, pero sus probabilidades estaban
compiladas dentro del ejecutable QuickBasic.
