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
- Dos Reales es un canto propio (+6), válido también como apuesta inicial.
- Los cantos pueden repetirse o subir; no hay límite fijo de dos repeticiones.
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
estrategia fuerte; los demás rechazan Falta, rechazan cuando la CPU aventaja
por más de 3 o alguien supera 26, y en el resto pasan a la estrategia débil.
Estas reglas sólo describen la entrada de ese bloque: hay decisiones de farol
anteriores y decisiones aleatorias posteriores que pueden cambiar la respuesta.
No se presenta esa clasificación como una política completa.

Envido, Flor, Truco y la selección de cartas se recuperaron en los bloques
documentados abajo. Las probabilidades adaptadas de Flor/Truco se sustituyeron
por las decisiones originales. El índice `command-consumers.json` conserva
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

Envido ya no infla los tantos de la CPU: `1A76` copia sus puntos reales a
`1D94`, que es lo que canta `5A39` o contrapone `1BDB`. El farol está en apostar.
La declaración del jugador se revisa en `7B86–8135`: los tantos inválidos
transfieren su apuesta ganada a la CPU; ocultar Flor suma además cuatro puntos.
Las políticas adaptadas de Flor/Truco de este avance anterior fueron
sustituidas por los bloques originales en el hito documentado al final.

## Respuesta de CPU al Envido recuperada

`src/original-envido.ts` traduce el bloque `1000:1CA1–227C`:
aceptación, rechazo y subidas a Envido, Real, Dos Reales o Falta.
Considera tantos, mano, marcador, apuesta anterior, apertura iniciada,
ventaja con puntos pendientes y contador de Faltas del jugador.
Dos Reales es un canto indivisible que agrega seis puntos: separarlo en
dos Reales alteraría los puntos por rechazo.

`verify_original_envido.py` ejecuta las instrucciones originales con Unicorn,
inyecta tiradas en la secuencia verificada del helper `INT(RND * límite) + 1`
y detiene la ejecución antes de diálogos, declaración y adjudicación.
Las 13.600 muestras reproducibles incluyen puntos 0–33, los cuatro cantos
entrantes, marcadores y contextos variados. La prueba TypeScript compara
la acción y el número de tiradas consumidas. No es una enumeración exhaustiva
de todas las combinaciones. El atajo de aceptación con marcador >=29 se
transcribe del llamador `1A35`; esos casos no ejecutan el bloque emulado.

La web usa esta política para responder al jugador. Las variantes de voz
siguen seleccionándose en la capa de presentación y no se reproduce el
estado interno del generador QuickBasic: coinciden las decisiones con una
misma cinta aleatoria, no una partida entera a partir de una semilla.
Esta comparación no implica equivalencia completa del juego ni reproducción
del generador QuickBasic o de las variantes de voz.

## Ciclo de Envido completado

`src/original-envido-lifecycle.ts` y la integración en `app.tsx` cubren:

| Bloque DOS | Comportamiento | Verificación diferencial |
|---|---|---|
| `57E7–5A39`, `22D4–289E` | Iniciativa con CPU mano/pie | 6.800 escenarios |
| `24AD–2737` | CPU responde a subidas cuando abrió el tanto | 10.880 escenarios |
| `1AAF`, `5A90` | Orden de declaración, empate y «son buenas» | 2.312 combinaciones |
| `7B86–8135` | Revisión de los tantos del jugador | 6.000 manos/declaraciones |
| `20DB–22AF`, `2438–24AD` | Legalidad, apuesta previa y acumulación | 1.280 transiciones |
| `1DB2–1DDC` | Quiero Obligada cuando aceptar/rechazar cuesta lo mismo | 3.000 escenarios |
| `1B06`, `1C0A` | Revisión inmediata y cierre por treinta puntos | 3.000 escenarios |

Total adicional: 33.272 casos. `scripts/verify_envido_lifecycle.py` genera el
fixture ejecutando instrucciones originales. Inyecta el RNG y omite diálogos
y gráficos. Las operaciones x87 de la revisión se modelan con enteros exactos;
verifica además los bytes de BRUN40 para conversión `FILD` y comparación
`FCOMPP / FNSTSW / SAHF`. Los tests comparan apuestas, adjudicación y consumos
aleatorios, incluyendo los cambios persistentes de `1D7A`.

La identificación anterior de los marcadores estaba invertida: `1D48` es el
jugador y `1D4A` la CPU, demostrado por las ramas «Ganaste»/«Te gané» y la
adjudicación. Se corrigieron las políticas y regeneraron sus fixtures.
`1D78` no significa sólo Truco iniciado: se activa cuando el jugador mano hizo
su primera jugada de carta/Truco y la CPU entra en `22F2`. Es `openingStarted`
en el modelo. `1D50` cuenta Faltas iniciales del jugador y subidas a Falta en
el intercambio iniciado por CPU; `227C` no incrementa ese contador.

Con Flor desactivada, tres cartas del mismo palo admiten en la revisión
cualquiera de los tres pares más veinte. No se exige que el jugador declare
siempre el máximo. Con CPU mano, un canto perdedor/empatado se normaliza a cero
antes de la revisión, igual que «son buenas». Se conservan esas particularidades.

La web permite iniciar Dos Reales directamente, repetir un canto sin bajar,
interrumpir Truco con Envido y que la CPU pie anteponga Envido al primer Truco
del jugador. Resuelve el tanto antes de reanudar el Truco pendiente. Se probaron
también rechazo, cierre de mano, iniciativa de CPU y «son buenas» en navegador.

Este avance completó Envido; el hito siguiente, documentado abajo, recupera
la máquina propia de Flor y la continuidad de Truco con las cartas.
La entrada de tantos de la web acepta enteros 0–33; no replica las peculiaridades
numéricas de `VAL` de QuickBasic. Los escenarios no enumeran todas las partidas,
y la reproducción con una semilla idéntica sigue fuera de este hito.

El proyecto local `reverse-engineering/ghidra-typed/Truco.gpr` también quedó
actualizado mediante `scripts/ghidra/RecoverEnvidoLabels.java`: los marcadores,
variables persistentes y bloques de Envido tienen nombres verificados.


## Flor y Truco recuperados

Flor se implementa en `src/original-flor.ts` a partir de `292A–2B76`,
`57AC`, `5AA5–5CD4` y la revisión compartida `7B86–8135`.

- La CPU inicia Flor sólo si tiene tres cartas del mismo palo. Su tirada 1–10
  decide una apertura de 3, «si hay Flor, me achico» de 4 o al resto de 30.
- Sin Flor de la CPU, los códigos humanos 5–8 adjudican 3 al jugador, sujetos
  a revisión. Con ambas Flores, la CPU acepta Con Flor Quiero por 6, se achica
  por 4 o acepta Contraflor por lo que falta al líder para llegar a 30.
- `7` representa Contraflor al resto, no una subida separada de seis.
  La voz del grupo 5 (61–72) representa Con Flor Quiero; no Contraflor.
- La declaración admite 20–38 con jugador mano; CPU mano admite 0–38 y gana
  los empates. Una declaración perdedora con CPU mano se normaliza a cero.
- Una Flor falsa suma cuatro y transfiere la apuesta. Un número de Flor
  incorrecto transfiere la apuesta sin sumar cuatro. El modo `1DE0` y la
  declaración de CPU `1DDE` distinguen estos casos de un Envido.

`verify_flor.py` ejecuta los bytes originales con Unicorn y produce 190
aperturas, 8.000 respuestas, 5.700 respuestas a apertura, 6.000 auditorías
y 1.482 declaraciones: 21.372 casos, comparados por `test_original_flor.mjs`.

Truco está entrelazado con la elección de cartas. Se conserva esa continuidad
con `OriginalTruco`, una instancia por mano, y `OriginalTrucoMachine`, un
intérprete acotado del grafo 8086 recuperado. La extracción recorre saltos y
llamadas desde los bloques de estrategia; reconoce las tablas en línea de
`ON GOTO` del runtime `D41:0209`, que un desensamblado lineal confunde con
instrucciones. `recover_truco_program.py` genera `original-truco-program.json`:
un conjunto de operaciones y operandos más filas compactas de cuatro enteros
(address, sucesor, opcode, operandos). No incluye ni ejecuta el EXE DOS.

La máquina conserva slots originales, cartas jugadas, inferencias sobre el
rival, estados de apuesta y flags de riesgo entre todas las bazas. `1D88`
usa 1/5/9 para cantos humanos, 2/6/10 para CPU y 3/7/11 o 4/8/12 al aceptar.
También acepta los comandos compuestos con una carta. La interfaz dejó de
usar fuerza promedio o `pickCpuCard` para decidir los cantos y las cartas.
El cierre de la mano se toma de las ramas originales y se suma al tanto
revisado por el port.

`original_native_truco.py` es el oráculo nativo compartido. Verifica bytes de
BRUN40 para FILD, FCOMPP, FISTP y la llamada de INT: AX=0400 selecciona FRNDINT
hacia menos infinito, por lo que la media usada en `6315–632B` toma el piso.
Sustituye sólo contratos de runtime comprobados y salidas de gráficos/voz;
los bytes de estrategia permanecen intactos. `verify_truco.py` genera 12.000
respuestas aisladas; `verify_truco_rounds.py` genera 3.000 manos completas con
ambos manos, ambos modos de Flor, subidas, rechazos, comandos con cartas y
tantos previos. Los tests comparan cada evento, el consumo aleatorio y los
slots, fases de cartas, apuestas y puntajes pendientes: 17.022 eventos en la colección de manos ampliada.

Las reglas y la estrategia se contrastan con muestras del original; no se
presenta esta evidencia como una enumeración de todas las partidas posibles.
El reparto y las decisiones comparten el generador original de BRUN40. Las
voces se eligen por separado, por lo que una semilla DOS idéntica aún no
reproduce la misma secuencia completa de partida. Se conserva
la entrada numérica entera del port, sin replicar todos los casos de VAL.
La interfaz, las animaciones y la liquidación visual siguen siendo web.

Se comprobaron en navegador Envido → Truco → Retruco → Vale Cuatro con cierre
4 para CPU y 3 de Envido para el jugador; la multa de Flor falsa (3+4) al
mostrar; y `truco 1` después de un Envido que la CPU antepone. Las capturas
locales están en `reverse-engineering/*-browser-proof.jpg`. Ghidra incorpora
`RecoverFlorTrucoLabels.java` con los nombres verificados de estos bloques.


## RND, RANDOMIZE y reparto originales

El helper `CS:00BD` llama al stub `D41:03F8`, que despacha a
`BRUN40 0177:BC14`. El avance entero está en `0177:BC47–BC78`:

```text
seed = (seed * 0xFD43FD + 0xC39EC3) & 0xFFFFFF
RND = seed / 16777216
```

Los valores de estado se guardan en `DS:08DB–08DE`; su valor inicial en el
runtime es `0x050000`. Las operaciones MUL/ADD/ADC originales se ejecutan
sin sustitución en `scripts/verify_random.py`, sobre BRUN40.EXE. Se verifican
28.672 estados consecutivos repartidos entre siete semillas, incluidos cero
y el máximo de 24 bits. La división de `BC79` produce un single exacto.

`D41:0401` despacha a `0177:BC8D`. RANDOMIZE hace XOR de los dos words
superiores del double recibido y escribe el resultado en `DS:08DC`,
conservando el byte bajo. Se comprueban 25 casos con la pila y los argumentos
en el mismo segmento de datos, como requiere el acceso mediante BX del
runtime. TRUCO llama a TIMER en `0281`, carga su single y lo ensancha a double
antes de RANDOMIZE en `0295`. El port reproduce esa conversión y utiliza el
reloj del navegador; no emula la frecuencia del temporizador BIOS.

El reparto no usa Fisher–Yates: `1381–143E` elige primero tres IDs para el
jugador y `1612–1729` elige después tres para la CPU mediante
`floor(RND*40)`, rechazando las seis duplicaciones posibles. Los IDs son
`palo*10 + rangoDOS-1`, con espada, basto, oro y copa en ese orden.
`scripts/verify_deal.py` ejecuta ambos bucles originales, sustituyendo sólo
el contrato RND/x87 y el dibujo de cartas. Sus 2.000 fixtures incluyen
1.000 secuencias con repeticiones forzadas. `src/original-deal.ts` y
`src/original-random.ts` se contrastan con estas colecciones.

La sesión React comparte el generador entre reparto y estrategias. El motor
Truco conserva el callback al reanudar cartas y respuestas; un `next()` sin
argumentos ya no vuelve silenciosamente a Math.random. Las voces y frases
web siguen fuera de esa secuencia, así que la coincidencia demostrada es de
rutinas y repartos, no una reproducción global por semilla.

## Cierre de mano y victoria anticipada

«Mazo» (`26`) y «no quiero» (`25`) reanudan ahora el mismo motor que las
cartas y los cantos. La colección ampliada contiene 3.000 manos, 17.022
eventos y 492 abandonos, además de seis victorias anticipadas de la CPU.
Los fixtures incluyen también los scores originales y `1D84`/`1E2C`.

`3BA5` calcula la apuesta en `1E2C` y marca `1D84` cuando alcanza para ganar
la partida. En `45B3` el ejecutable salta a la victoria `1C26` antes de agregar
el último Truco a `1D86`. El port usa esa apuesta al liquidar esta salida;
no inventa un punto por encontrar el acumulador vacío. En los finales normales
se usa la diferencia entre el acumulador original y los tantos previos. La
revisión de Envido/Flor y la consolidación del marcador siguen en la capa web.

La versión de la cabecera procede de package.json. La configuración de Vite
inyecta la versión y fecha local; el workflow de Pages inyecta su número de
ejecución e intento como VITE_BUILD_ID.


## Música: extracción y validación nativa

`npm run extract` desempaqueta nuevamente TRUCO.EXE sin ejecutarlo y obtiene
46 partituras desde los descriptores QuickBASIC `length:u16, dataOffset:u16`.
`src/original-music.json` guarda el texto exacto, offset, longitud, referencias
y hashes SHA-256 del ejecutable y la imagen. Los nombres de las pistas son
identificadores del port; los textos musicales proceden del original.

Se corrigieron cuatro transcripciones manuales: Envido había perdido su `<`
inicial; el reparto tenía un punto final añadido; `long` agregaba `2` fuera de
la longitud declarada; `theme` agregaba un `<` fuera del descriptor. Se
recuperaron además siete partituras que no estaban en el catálogo web.

El helper original `CS:C8B4` llama a PLAY (`D41:019D`) y después reproduce
`DS:4A92`, que contiene `mno3l10`. Esa llamada restablece articulación normal,
octava 3 y longitud 10. El runtime se inicializa con tempo 120. El intérprete
web anterior reiniciaba cada melodía en octava 4 y longitud 4, además de usar
la numeración MIDI sin la correspondencia de octavas de QuickBASIC.

El stub PLAY despacha a `BRUN40 0177:4108`. La tabla de frecuencias enteras
está en `0177:442A–4440`: C de octava 6 es 4186 Hz. Para otras octavas el
código hace SHR y ADC, redondeando a un entero; C de octava 3 solicita 523 Hz.
Las duraciones se calculan en `4342–4375` mediante división entera
`96000 / (tempo * longitud)` y puntos con mitades enteras sucesivas. Se
convierten a tiempo musical nominal con unidades de 2,5 ms.

La articulación de `4376–43C7` usa MN (7/8 de sonido y 1/8 de silencio),
MS (3/4 y 1/4) y ML (sonido continuo). Las fracciones se truncaban a unidades
enteras en el DOS, lo cual se conserva. El WebAudio reproduce esos eventos
con una onda cuadrada y una pequeña envolvente para evitar clics.

`scripts/verify_music.py` ejecuta las instrucciones originales de notas,
alteraciones, puntos, duración y articulación. Sustituye únicamente la cola
de hardware `0177:444C`; aplica los comandos de control mediante sus
asignaciones de bytes verificadas. Sus 55 casos comprenden las 46 partituras
y nueve combinaciones de articulación y tempo, con 823 eventos.
`scripts/test_original_music.mjs` compara todos ellos con el parser web y
verifica los descriptores cuando está disponible la imagen DOS local.
`scripts/test_audio_render.mjs` contrasta la programación real de WebAudio
con los eventos nativos: 725 notas, frecuencia, inicio, fin audible y silencio.

Una segunda extracción produce los mismos 164 archivos. Las 156 muestras
VOZ coinciden byte por byte con sus fuentes. El manifest conserva 162 hashes
de recursos; el build vuelve a contrastarlos después de la copia a dist.
El timbre y temporizador físico del PC speaker no se emulan, y los 16 kHz de
las voces siguen siendo una adaptación empírica de reproducción.

El cierre de la validación del alcance implementado queda documentado en
[VALIDACION_COMPLETA.md](./VALIDACION_COMPLETA.md).


## Ciclo DOS completo por semilla

`recover_truco_program.py --match` recupera un segundo grafo de 13.265
instrucciones (`original-match-program.json`). Incluye reparto, evaluación
inicial de tanto, apertura de CPU, frases/variantes, selección de voces,
selección de música, auditoría y `81AB` (puntaje/reset antes del siguiente
reparto). Conserva los ID reales de CPU como float en `186C/1870/1874`, en
lugar de reemplazarlos por 50 al preparar la estrategia.

El perfil parte del estado posterior al saludo (`1D68=0`), antes de repartir,
con nombre `jugador`, `1CEC=0` (sonido) y `1CC6=0` (voces). `RND` de `00BD`, llamadas directas
`D41:3F8` y helper `CADA` comparten el estado de BRUN40. En particular,
`81AB:8283` sortea un color de transición mediante CADA: también se conserva
ese consumo, aunque la transición gráfica no se dibuje.

Sólo se omiten rangos de render sin decisiones de azar, rutinas de dibujo,
espera y reproducción física. El parser se reemplaza por códigos explícitos
0–26, registrados junto con la dirección de retorno. El modo falla de forma
visible ante entradas/rutinas no soportadas, y no adapta silenciosamente el
comportamiento del DOS. `45B3 → 1C26` agrega al resultado el stake de `1E2C`,
porque esa victoria anticipada no lo bancaba en `1D86`.

El oráculo usa instrucciones originales en Unicorn y contratos numéricos ya
verificados contra BRUN40. `verify_seeded_match.py` genera las trazas de 128
partidas; `test_seeded_match.mjs` contrasta 35.697 eventos, 51.058 llamadas RND,
20 campos de RAM, repartos, slots jugados, voces, comandos, textos expandidos
y resultado final.
La prueba conserva transcripciones explícitas y comprueba export/import
mediante una nueva ejecución, no mediante la lectura de resultados guardados.

Una transcripción que acepta Vale 4 repetidamente en el retorno `4EFA`
puede repetir el canto en el original (`4F13 → 4E98`). La demostración rechaza
Vale 4; el motor conserva esa rama y corta transcripciones que no terminan.
La referencia 327680 está guardada en `replays/dos-327680.json` y finaliza
7–30 en 14 manos. La reproducción web está disponible desde el splash y la
barra de navegación; carga su grafo sólo cuando se abre ese modo.


El render de texto `29D` llama a `C94A`, que consume RND en `C9E5` por cada
fragmento opcional encontrado. Primero decide el grupo exterior; sólo visita
sus grupos anidados si sobrevivieron. El oráculo ejecuta esas instrucciones
con un frame aislado y contratos de cadenas, mientras el port reproduce su
escaneo 1-based (incluido `LEN > cursor`) y limpieza de `]` residuales.
`B874` también sortea si añade una chicana; `BC6E` elige una de 53 y sortea
sus sufijos. Sus ramas forman parte del grafo completo, con un frame de
procedimiento conservado. Se registran los puntos RND reales `00C2`,
`CAE2`, `C9E5`, las llamadas directas y el estado posterior.

La auditoría de límites verifica que los demás dibujos/esperas omitidos no
consumen RND. El saludo `C2C5`, que sí consume azar, queda antes del punto
inicial definido por este perfil y falla si se intenta invocar después.
