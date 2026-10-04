# Ingeniería inversa de Truco Arbiser

Investigación y adaptación para el port web por **Carlos A. Leguizamón**, sobre
el juego original de **Ariel Arbiser y Enrique Arbiser**. El alcance de la
licencia y los recursos originales se detalla en
[`THIRD_PARTY_NOTICE.md`](./THIRD_PARTY_NOTICE.md).

## Ejecutable desempaquetado

`TRUCO.EXE` no contiene directamente toda la imagen ejecutable: fue comprimido
con Microsoft EXEPACK. El stub se identificó por su rutina de copia hacia atrás,
la tabla compacta de relocalizaciones y el mensaje `Packed file is corrupt`.

La herramienta `scripts/reverse_engineer_exe.py` reproduce ese algoritmo sin
ejecutar el programa DOS y recupera:

- una imagen de carga de 76.736 bytes;
- el punto de entrada original `0D85:00D6`;
- la pila original `12BC:0800`;
- 1.416 relocalizaciones MZ;
- el segmento de datos QuickBASIC `0DE2`;
- un MZ convencional reconstruido para análisis estático.

Los resultados reproducibles quedan en `reverse-engineering/`. Los principales
son `TRUCO.UNPACKED.EXE`, `command-parser.asm`, `language-handler.asm`,
`quickbasic-strings.json`, `recovered-logic.json` y `command-consumers.json`.

Para regenerarlos se necesita Python 3 y Capstone:

```sh
python3 -m pip install -r scripts/requirements-re.txt
python3 scripts/reverse_engineer_exe.py
```

## Parser original confirmado

El parser de órdenes está en el rango lineal `08957–08DCB`. Normaliza el texto
del jugador, elimina espacios sobrantes y usa una función equivalente a
`INSTR` para buscar expresiones. Guarda el resultado en `DS:1C98`.

El binario confirma estos códigos internos:

- `0`: aceptación, incluidos `de acuerdo`, `esta bien`, `olor`, `buen` y `ok`;
- `1–4`: Envido, Real Envido, Dos Reales Envido y Falta Envido;
- `5–8`: Flor, Con Flor, Contraflor y Con Flor me Achico;
- `9–11`: Carta 1, Carta 2 y Carta 3;
- `12–15`: variantes de Truco y Truco simple;
- `16–19`: respuestas y variantes de Retruco;
- `20–23`: respuestas y variantes de Vale Cuatro;
- `24–25`: aceptación y rechazo mediante cadenas dinámicas;
- `26`: irse al mazo.

La tabla completa, con tokens y evidencia, está en `recovered-logic.json`.

## Detector de lenguaje confirmado

El detector original no compara insultos completos. Convierte la entrada a una
forma normalizada y busca subcadenas. Las raíces verificadas directamente en el
código son:

`put`, `mierd`, `pij`, `conch`, `bolud`, `pelotu`, `caraj`, `chot`, `fuck` y
`garch`.

Si encuentra alguna, elige un bloque pseudoaleatorio de 16 caracteres del pool
original que contiene `Shh ...`, `Eso no se dice`, `Mal educado`,
`Boca sucia`, `Quien te educo`, `Que lexico` y `Lexico'e merda`.

También existen ramas separadas para:

- `truque`, con respuestas como `Digue bien` y `Joigue bien`;
- `envidito`, `quierito` y `truquito`, que responden `tontito`;
- `coge`, `cogi`, `coj`, `sexo` y `sexu`, con otro pool de respuestas;
- el comando oculto `!&^*$v`, que muestra créditos.

## Cadenas y recursos recuperados

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
- Falta Envido vale `30 − max(puntajes totales)`, incluso cuando ambos están
  en malas. La rutina DOS `816F–81AA` limita también las demás apuestas a
  los puntos restantes hasta 30.
- Envido tiene prioridad sobre un Truco todavía no respondido. Al terminar el
  tanto se restaura la respuesta pendiente al Truco.
- Un Envido pendiente debe resolverse antes de cantar Truco; se ofrecen las
  respuestas compuestas `Quiero y Truco` y `No quiero y Truco`.
- Flor anula Envido. Una Flor sin oposición vale 3.
- Si ambos tienen Flor aparecen `Con Flor Quiero`, `Con Flor me Achico`,
  `Contraflor` y `Contraflor al Resto`.
- La Flor se cuenta como 20 más el valor de las tres cartas del palo.
- Sólo el rival del último cantor puede subir Truco, Retruco o Vale 4.

## Estado de la lógica de juego

El parser, los códigos de órdenes y las ramas de lenguaje anteriores ya están
recuperados directamente del ejecutable, no inferidos. Las reglas enumeradas en
la sección anterior siguen siendo la implementación actual del port.

Se recuperaron y trasladaron a `src/original-game-logic.ts` los primeros bloques
fuera del parser:

| Bloque DOS (offset de imagen) | Lógica recuperada | Validación |
| --- | --- | --- |
| `94F6–9609` | Fuerza de cartas; figuras codificadas como 8/9/10 | 40 cartas contra instrucciones originales |
| `960A–96AB` | Orden de slots débil/medio/fuerte de la CPU | 9.880 manos distintas |
| `175C–18EE` | Envido y Flor, con Flor activada/desactivada | 9.880 manos, ambos modos |
| `816F–81AA` | Límite de apuestas hasta 30 | 27.000 casos de marcador/apuesta |
| `19DF–1A23` | Apuestas iniciales Envido/Real/Dos Reales/Falta = 2/3/6/30 | 4 órdenes |
| `1CE4–1D29` | Preclasificación de respuesta de la CPU al Envido | 122.400 casos |

Los resultados se obtienen ejecutando las instrucciones x86 originales con
Unicorn, no tomando el pseudocódigo de Ghidra como referencia. En el cálculo de
Flor se sustituye únicamente la comparación de configuración con `n` por su
contrato ZF verificado en BRUN40; no se ejecuta el runtime completo. Las manos
se prueban como combinaciones distintas en un orden de slots por combinación,
no como las seis permutaciones de cada mano.

Los fixtures se conservan en `scripts/fixtures/original-game-fixtures.json`,
con el hash de la imagen original. `scripts/verify_original_game.py` los regenera
con los archivos DOS locales y las dependencias de `requirements-re.txt`.
`npm run test:logic` comprueba la traducción TypeScript contra esos resultados,
sin requerir el emulador ni los archivos DOS para ejecutar las pruebas.

La valoración y el orden de cartas están conectados al port. La interfaz sigue
mostrando el mejor tanto de Envido incluso con tres cartas del mismo palo; usa
para eso la rama original con Flor desactivada. El cálculo separado de Flor usa
la rama con Flor activada. Se corrigió Falta Envido y el límite de las apuestas
aceptadas; por ejemplo, marcadores 3–5 dan Falta=25, y una apuesta nominal de 6
con marcador 28–27 queda en 2.

La preclasificación de Envido se conserva como una función de investigación,
**todavía no conectada a la política de CPU**: un tanto mayor que 24 pasa a la
estrategia fuerte; los demás rechazan Falta, rechazan cuando el rival aventaja
por más de 3 o alguien supera 26, y en el resto pasan a la estrategia débil.
Estas reglas sólo describen la entrada de ese bloque: hay decisiones de farol
anteriores y decisiones aleatorias posteriores que pueden cambiar la respuesta.
No se presenta esa clasificación como una política completa.

Falta recuperar las transiciones completas de Envido/Flor/Truco, la selección de
cartas por baza y las decisiones aleatorias de la CPU. Las probabilidades del
port siguen siendo aproximaciones. El índice `command-consumers.json` conserva
265 comparaciones directas contra `DS:1C98` para continuar esa investigación.

## Ajustes aplicados al port

El módulo `src/original-parser.ts` traslada al navegador el parser recuperado y
mantiene sus códigos internos. La interfaz ya no interpreta los textos mediante
una colección independiente de condiciones.

Cambios verificados contra el desensamblado:

- se normalizan mayúsculas, acentos y espacios antes de clasificar la entrada;
- se reconocen los códigos `0–26`, incluidos `dos reales envido`;
- funcionan las órdenes combinadas `truco 1`, `quiero retruco 2` y
  `quiero vale 4 3`, que cantan y luego juegan la carta indicada;
- `chau` se reconoce como irse al mazo y `rajo` exige coincidencia exacta;
- `abandono` conserva la respuesta burlona original, pero no tira la mano;
- las órdenes `salir`, `sistema`, `system`, `aborto` y `abortar` vuelven al
  splash, equivalente web a terminar el programa DOS;
- insultos, `truque`, diminutivos y referencias sexuales usan sus pools de
  respuesta recuperados, respetando `#` como salto y `[...]` como texto
  opcional;
- una orden de juego positiva tiene prioridad sobre los chistes de lenguaje,
  igual que el retorno temprano observado en el ejecutable.

La equivalencia del parser se comprueba con `npm run test:logic`.

## Verificación conductual en el ejecutable original

Una partida instrumentada sobre la versión js-dos confirmó además que:

- mano alterna entre jugador y CPU, y quien gana una baza abre la siguiente;
- una parda conserva la ventaja de la baza anterior: `6 > 4` seguido de
  `2 = 2` cerró la mano para quien había ganado la primera;
- las cartas de todas las bazas permanecen visibles y la última carta puede
  colocarse automáticamente;
- `Real Envido → Real Envido` forma `Dos Reales Envido`; intentar bajar luego
  a Envido responde `mal cantado, che`;
- `Dos Reales Envido → Falta Envido → No quiero` entrega 6 puntos, el valor
  aceptado antes de la última subida;
- los puntos del tanto quedan pendientes y el Trucometro los consolida junto
  con los de Truco al cerrar la mano;
- `Quiero Retruco` y `Quiero Vale 4` aceptan el canto previo y elevan la
  apuesta en una sola acción;
- el derecho de elevar cambia de lado y puede ejercerse en una baza posterior;
- la CPU canta mediante los versos originales y puede mentir: Envido y Truco
  expresan riesgo y picardía, no una prueba de que tenga buenas cartas.

El port modela estos hallazgos con turnos explícitos, bazas parciales, puntaje
pendiente por mano y una política probabilística con una posibilidad real de
farol incluso con cartas débiles.

## Evidencia y adaptación de la mentira

El banco original no contiene una voz exclusiva para sancionar una declaración
falsa, pero sí confirma que la mentira forma parte deliberada de la personalidad
de la CPU. Los registros 102 y 105 dicen `Quiero Retruco` «mintiendo», el 117
canta `Vale Cuatro` «al compás de la mentira» y el 46 reconoce que no tiene
«nada» antes de desafiar con `Falta Envido`. Además, el mapa estático localiza
17 consumidores directos de los códigos 5–8 de Flor en distintos bloques de la
máquina de estados.

La frecuencia y la penalización exactas no quedaron aisladas de manera
inequívoca en el desensamblado disponible. El port conserva por eso una frontera
explícita entre evidencia y adaptación:

- la CPU infla aleatoriamente sus tantos con mayor frecuencia cuando tiene un
  Envido débil y sólo excepcionalmente cuando ya tiene 30 o más;
- la CPU puede cantar una Flor inexistente con una probabilidad baja, algo
  mayor cuando va perdiendo;
- el jugador también puede declarar tantos falsos o cantar Flor sin tenerla;
- el tanto queda en revisión, las cartas se muestran al cierre y los puntos se
  entregan al lado cuya declaración resulte válida;
- si ambos mintieron, prevalece el valor real y la condición de mano resuelve
  una igualdad.

Estas probabilidades son una calibración del port basada en los diálogos y en
el comportamiento observado; no se presentan como constantes recuperadas del
QuickBasic original. Se podrán reemplazar sin alterar la máquina de estados
cuando se termine de aislar la rutina estratégica.
