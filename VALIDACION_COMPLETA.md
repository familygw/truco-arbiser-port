# Validación completa

**Fecha:** 4 de octubre de 2026. **Port:** versión definida en `package.json`.
**Resultado:** validación del alcance implementado aprobada localmente.

## Comprobación reproducible

```bash
npm run validate
```

Ejecuta la colección diferencial de lógica y música, comprueba los recursos,
compila TypeScript/Vite y revisa las rutas, versión y archivos de producción.
El workflow de GitHub Pages ejecuta los tests antes del build y del despliegue.
Los fixtures están en el repositorio; la validación cotidiana no necesita los
programas DOS, Ghidra, Capstone ni Unicorn.

Para comprobar además el servidor del build, en dos terminales:

```bash
npm run preview -- --host 127.0.0.1 --port 4173 --strictPort
node scripts/test_preview.mjs
```

## Resultados

| Área | Evidencia | Resultado |
| --- | --- | --- |
| Parser y apuestas | 47 casos, incluidos comandos compuestos | Aprobado |
| Cartas y tantos | 40 cartas y 9.880 manos, Flor activada/desactivada | Aprobado |
| Límites de apuesta | 27.000 combinaciones | Aprobado |
| Ramas iniciales de Envido | 122.400 casos nativos | Aprobado |
| Respuesta a Envido | 13.600 casos | Aprobado |
| Ciclo de Envido | 33.272 aperturas, respuestas, declaraciones, auditorías y cierres | Aprobado |
| Flor | 21.372 decisiones, declaraciones y auditorías | Aprobado |
| Truco y cartas CPU | 12.000 decisiones y 3.000 manos, con 17.022 eventos | Aprobado |
| Abandono y cierre anticipado | 492 abandonos y seis victorias anticipadas CPU en esas manos | Aprobado |
| RND y RANDOMIZE | 28.672 estados y 25 mezclas de semilla | Aprobado |
| Reparto | 2.000 repartos, incluidos 1.000 con repeticiones forzadas | Aprobado |
| Partituras originales | 46 textos extraídos de sus descriptores exactos | Aprobado |
| Intérprete PLAY | 55 casos y 823 eventos producidos por BRUN40 | Aprobado |
| WebAudio | Programación de 725 notas, articulación, silencios y cancelación | Aprobado |
| Recursos | 156 voces, 156 diálogos, 10 PNG y 162 hashes de integridad | Aprobado |
| Extracción repetible | 164 archivos idénticos en una segunda extracción | Aprobado |
| Build | TypeScript, Vite, versión, rutas base y recursos copiados | Aprobado |
| Servidor de producción | 171 respuestas HTTP 200 e integridad de los recursos servidos | Aprobado |

Las colecciones se contrastan contra ejecución de rutinas originales de TRUCO
y BRUN40. Las fronteras de emulación y los contratos suministrados por el host
están detallados en [REVERSE_ENGINEERING.md](./REVERSE_ENGINEERING.md).

## Música corregida

La extracción volvió a ejecutarse desde `TRUCO.EXE`. Se corrigieron cuatro
transcripciones manuales y se incorporaron siete partituras que faltaban en
el catálogo. `src/original-music.json` conserva offsets, longitudes, referencias
y SHA-256 de procedencia. La web importa este catálogo generado.

El intérprete conserva la tabla de frecuencias enteras del runtime, el estado
musical restaurado por el helper (`MN O3 L10`), los puntos y las articulaciones
normal, staccato y legato. La programación de WebAudio se compara con los
eventos nativos usando un dispositivo de audio de prueba.

Las voces no necesitaban una nueva conversión: los 156 archivos copiados
coinciden byte por byte con los originales y se sirven sin errores HTTP.

## Prueba en navegador

Se probó el build de producción en el navegador integrado:

- Activación de la música del splash: el botón de desbloqueo desapareció tras
  confirmarse el contexto de audio en ejecución.
- Música OFF/ON y Voz ON.
- Envido rechazado por la CPU: un punto del jugador quedó pendiente al cierre.
- `truco 1`: el parser cantó Truco y jugó la primera carta, conservando ese punto.
- CPU jugó 1 de espada y 5 de oro; el jugador respondió y completó su tercera
  carta. El motor cerró la mano con dos puntos de Truco y uno de Envido para
  el jugador: marcador 3–0.
- El control «Siguiente mano» quedó disponible y no hubo errores en la consola.

La captura de esta prueba se guarda localmente como
`reverse-engineering/validacion-completa-browser-proof.jpg`.

## Alcance y límites

«Completa» significa que pasó toda la validación del port implementado,
incluidos música y recursos. Estas muestras no enumeran todas las partidas
posibles ni demuestran que toda la experiencia DOS sea idéntica.

La interfaz, las animaciones y la consolidación visual son adaptaciones web.
La interfaz jugable normal conserva adaptaciones en voces y frases. El
reproductor DOS por semilla usa un motor independiente que ejecuta el ciclo
original completo para el perfil `dos-silent-v1`, con transcripciones explícitas. El reloj BIOS y el hardware del
PC speaker no se emulan. WebAudio sintetiza las partituras; las voces usan una
tasa de reproducción de 16 kHz ajustada empíricamente. La entrada numérica no
replica todos los casos de `VAL` de QuickBASIC.

No se realizó un push ni un despliegue remoto durante esta validación. El
workflow queda preparado para validar y publicar en el próximo push que lo
active.


## Partidas completas por semilla — 2026-10-04

Se agregó un ciclo independiente desde el primer reparto hasta el ganador a
30 puntos. Conserva RAM entre manos, orden de cartas, mano alternada,
iniciativa y cantos de la CPU, auditorías, cierre y flujo único de azar.
El formateador `C94A` ejecuta sus instrucciones nativas en el oráculo;
se comparan también las frases resultantes, incluidas variantes anidadas.
Las chicanas `B874/BC6E` conservan sus sorteos y sus textos.
Incluye los sorteos de variantes de texto/voz y de selección musical, aun
cuando el perfil tiene sonido apagado. La vista previa del juego normal ya no
consume un reparto que se descartaba antes de iniciar.

El oráculo `scripts/verify_seeded_match.py` ejecuta los bytes 8086 originales,
con contratos de runtime verificados y render/delays sustituidos. La prueba
`npm run test:replay` compara 128 partidas completas: 35.697 eventos, 51.058
llamadas a RND (dirección y estado posterior), seis cartas por reparto,
carta jugada por cada lado, voz elegida, retorno del parser, ganador,
puntaje final y 20 campos RAM en cada evento. Incluye semillas 0, 1, 2,
0xFFFFFF y 0x800000, ambas opciones de Flor y ambas posiciones de mano.
El replay JSON se vuelve a ejecutar y debe producir exactamente la misma
traza. Las transcripciones incompletas/incompatibles se rechazan.

Referencia: `replays/dos-327680.json`, Flor y CPU mano. Resultado **7–30**,
14 manos, 49 comandos, 275 sorteos; estado final RND **1303333**.
Primer reparto: jugador 11/2/4 de oro; CPU 2/3 de basto y 1 de copa.

Alcance preciso: semilla de 24 bits después de configuración y saludo,
antes del primer reparto; nombre `jugador`, sonido/voces apagados en el programa DOS. La
política de demostración rechaza los tantos de apertura, acepta Truco y
Retruco, rechaza Vale 4 y juega slots originales en orden. La selección de
voces sí se verifica, pero la presentación completa del DOS y todas las
entradas textuales/numéricas libres no están cubiertas por estas partidas.
No se modifican ramas originales para hacer terminar una transcripción:
si una secuencia no termina, se informa el límite de ejecución.

Prueba del reproductor en el build de producción: semilla 327680, marcador
7–30, 14 manos y 275 sorteos visibles; exportación de 49 comandos al campo
JSON y nueva ejecución al cargarlo. La semilla -1 produce un error claro.
Se recorrió el cierre (evento 198/198), se verificó la reproducción automática
hasta el final y no hubo errores de consola. Captura:
`reverse-engineering/dos-seeded-match-proof.png`.

`npm run validate` volvió a pasar tras incorporar el formateador de frases y
las chicanas. El segundo grafo se carga bajo demanda; su chunk de producción
es de 254,08 kB (123,26 kB gzip).
