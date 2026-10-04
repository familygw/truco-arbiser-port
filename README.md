# Truco Arbiser — port web

Port web y proyecto de preservación del **Truco Arbiser**, un juego de Truco
argentino creado originalmente para DOS por **Ariel Arbiser y Enrique
Arbiser**.

El port fue desarrollado por **Carlos A. Leguizamón**. Recupera recursos del
programa original y reimplementa su funcionamiento para navegadores modernos,
manteniendo su humor, picardía gauchesca y forma conversacional de jugar.

Versión Online: [https://familygw.github.io/truco-arbiser-port](https://familygw.github.io/truco-arbiser-port/)

## Estado

El proyecto se encuentra en estado **MVP jugable**. Incluye:

- partidas de Truco a 30 puntos, con malas y buenas;
- Envido, Envido Envido, Real Envido, Dos Reales Envido y Falta Envido;
- Flor, Con Flor Quiero (6) y Contraflor al Resto;
- Truco, Retruco y Vale Cuatro con respuestas y subidas encadenadas;
- mano y turnos alternados, pardas y tres bazas visibles;
- valoración y orden de cartas recuperados y verificados contra el código DOS;
- CPU con decisiones originales de Envido, Flor, Truco y elección de cartas;
  conserva sus faroles de Envido/Truco y canta Flor sólo cuando la tiene;
- parser conversacional, insultos y respuestas recuperadas del ejecutable;
- melodías QuickBasic y reproducción de las voces `.VOZ` originales;
- reproducción de partidas DOS por semilla y transcripción, contrastada con el 8086 original;
- pantalla y cartas restauradas a todo color sobre una interfaz glassmorphism.

## Requisitos

- Node.js `^20.19.0` o `>=22.12.0`, según el requisito de Vite 8.
- npm.

## Iniciar el proyecto

Cloná o descargá el repositorio y, desde esta carpeta, ejecutá:

```bash
npm install
npm run dev
```

Vite mostrará la dirección local, `http://localhost:3000/truco-arbiser-port/`.

Para generar una versión de producción:

```bash
npm run build
npm run preview
```

## Publicación en GitHub Pages

El workflow [`.github/workflows/deploy-pages.yml`](./.github/workflows/deploy-pages.yml)
compila y publica el sitio en cada push a `master`.

Antes de ejecutar el workflow por primera vez, abrí **Settings > Pages** y
seleccioná **GitHub Actions** como fuente de publicación. El `GITHUB_TOKEN` del
workflow no puede habilitar Pages por sí solo. Tras el primer despliegue
exitoso, el juego estará disponible en: [Truco Arbiser Port](https://familygw.github.io/truco-arbiser-port/)

Si el paso `Configure Pages` falla con `Error: Get Pages site failed` o `HTTP
404`, Pages todavía no fue habilitado. Configuralo desde **Settings > Pages** o,
con GitHub CLI autenticado como administrador del repositorio, ejecutá:

```bash
gh api --method POST \
    -H "Accept: application/vnd.github+json" \
    "/repos/familygw/truco-arbiser-port/pages" \
    -f build_type=workflow
```

La respuesta `HTTP 409` con `GitHub Pages is already enabled` no es un error de
configuración: indica que Pages ya existe. En ambos casos, reejecutá el
workflow después de confirmar que el tipo de compilación es `workflow`:

```bash
gh api "/repos/familygw/truco-arbiser-port/pages"
```

## Pruebas

La equivalencia del parser y los bloques recuperados se comprueba con fixtures
obtenidos al ejecutar rutinas DOS aisladas: 40 cartas, 9.880 manos en ambos modos
de Flor, 27.000 límites de apuesta y 122.400 ramas iniciales de Envido.
Además, la respuesta de CPU al Envido se contrasta con 13.600 escenarios
del bloque DOS: aceptar, rechazar o subir, incluido Dos Reales (+6).
El ciclo de Envido suma 33.272 verificaciones: iniciativa con CPU mano o pie,
contrasubidas, orden de declaración, revisión de tantos, legalidad y cierre.
Flor agrega 21.372 verificaciones de cantos, declaraciones y auditorías.
Truco agrega 12.000 decisiones aisladas y 3.000 manos completas, incluyendo
Retruco, Vale Cuatro, cartas, pardas, abandono e información previa de los tantos.
El azar suma 28.672 estados de RND, 25 casos de RANDOMIZE y 2.000 repartos
contrastados con los ejecutables originales. Ejecutá:

```bash
npm run test:logic
```

## Cómo jugar

Las cartas se pueden jugar haciendo clic. También se conserva la entrada de
texto del original:

- `carta 1`, `carta 2`, `carta 3`;
- `envido`, `real envido`, `dos reales envido`, `falta envido`;
- `quiero`, `no quiero`;
- `truco`, `quiero retruco`, `quiero vale 4`;
- `flor`, `con flor quiero`, `contraflor`;
- `mazo`, `baraja`, `chau` o `rajo` para abandonar la mano.

La CPU puede cantar con buenas cartas o mentir. Una frase segura no significa
que realmente tenga un buen Envido o una mano fuerte. La CPU no inventa Flores. Cuando un
Envido es querido, el mano canta primero. La CPU declara sus tantos reales;
si sos pie podés responder `son buenas`. El jugador puede escribir un número
entre `0` y `33`. Al mostrar, unos tantos inválidos entregan el Envido a la CPU;
ocultar una Flor agrega cuatro puntos de penalización. Si el tanto lleva al
ganador declarado a treinta, la revisión ocurre inmediatamente. La política de
Flor permite declarar 20–38 tantos, con el mismo orden del mano. Una Flor
sin oposición vale 3; Con Flor Quiero vale 6; Contraflor va al resto. El jugador
puede cantar Flor sin tenerla: al mostrar, la CPU recibe la apuesta y cuatro
puntos adicionales. Un número de Flor incorrecto transfiere la apuesta sin
sumar esa multa. La estrategia de Truco conserva su estado entre las tres bazas.

Los navegadores pueden bloquear el audio automático. Si sucede, usá el botón
**Activar sonido del splash**. Música y voz también se pueden activar o
desactivar durante la partida.

## Reproducir una partida DOS por semilla

Desde el splash elegí **REPRODUCIR DOS POR SEMILLA**, o **DOS por semilla**
durante el juego. La pantalla permite generar una partida, avanzar o reproducir
sus eventos y descargar/cargar su transcripción JSON.

La referencia usa semilla **327680**, Flor activada y CPU mano: **Vos 7 – CPU
30**, 14 manos, 49 comandos, 275 sorteos. El archivo está en
[`replays/dos-327680.json`](./replays/dos-327680.json).

```bash
npm run replay:dos -- 327680
npm run replay:dos -- 327680 --sin-flor --jugador-mano
npm run replay:dos -- replays/dos-327680.json --out=/tmp/truco-reproducido.json
npm run test:replay
```

La semilla representa el **estado de 24 bits de RND antes del primer reparto**,
una vez terminados la configuración y el saludo. No es el argumento numérico
de `RANDOMIZE`. Para repetir una partida humana se necesitan también sus
jugadas y opciones, que el JSON conserva.

El perfil `dos-silent-v1` fija el nombre DOS en `jugador` y ejecuta el ciclo recuperado completo con sonido y
voces apagados en DOS. Conserva los sorteos de frases, voces y selección
musical que se ejecutan aun sin sonido. La demostración rechaza tantos de
apertura, acepta Truco/Retruco, rechaza Vale 4 y juega las cartas en orden de
reparto. El replay usa este motor independiente; la interfaz jugable normal
sigue usando la integración web de las reglas.

Se comparan **128 partidas completas, 35.697 eventos y 51.058 llamadas RND**
contra instrucciones originales ejecutadas en Unicorn. Esto verifica ese
perfil y esas transcripciones; no afirma equivalencia de todas las entradas
libres, animaciones, audio o variantes de configuración del DOS.

## Recursos originales e ingeniería inversa

`public/original` contiene recursos extraídos de los archivos DOS: pantalla
CGA, símbolos de los cuatro palos, 156 diálogos y 156 muestras de voz de un
bit. Las 46 partituras PLAY se extraen de `TRUCO.EXE` a
`src/original-music.json`, con sus offsets y hashes de procedencia.
`public/restored` contiene reinterpretaciones a todo color creadas para el
port.

Si se dispone de los archivos DOS fuente en el directorio esperado, los
recursos se pueden volver a extraer mediante:

```bash
npm run extract
```

La evidencia técnica, el formato de los recursos, el parser recuperado y las
reglas verificadas contra el ejecutable están documentados en
[`REVERSE_ENGINEERING.md`](./REVERSE_ENGINEERING.md).

## Tecnologías

- Vite 8
- React 19
- TypeScript 7.0.2
- Web Audio API
- CSS sin framework visual

No usa backend, base de datos, Drizzle, Wrangler ni servicios externos para
ejecutar una partida. Es una aplicación Vite estática.

## Autoría

- **Port web, ingeniería inversa y adaptación:** Carlos A. Leguizamón
- **Juego original para DOS:** Ariel Arbiser y Enrique Arbiser

Si reutilizás o distribuís el port, conservá el crédito de autoría indicado en
la licencia y en el aviso de terceros.

## Licencia

El código nuevo y la interfaz del port se publican bajo la
[`MIT License`](./LICENSE), copyright © 2026 Carlos A. Leguizamón.

Los recursos y contenidos recuperados del juego original no quedan
relicenciados por la licencia MIT. Consultá
[`THIRD_PARTY_NOTICE.md`](./THIRD_PARTY_NOTICE.md) para conocer el alcance y los
créditos que deben conservarse.

## Versión visible

`package.json` es la única fuente de la versión del port. Vite la incorpora en
la cabecera al iniciar el servidor o compilar. Cada build local muestra su fecha
UTC; GitHub Actions muestra `número de ejecución.intento`, que cambia con cada
push que activa el despliegue y con cada reejecución del workflow. El build no
modifica ni hace commits automáticos de `package.json`.

El reparto y las decisiones de Envido, Flor y Truco comparten una instancia del
generador de 24 bits de BRUN40 durante la sesión. Se inicializa con el reloj,
aplicando la mezcla original de RANDOMIZE. Las voces y frases de la interfaz
usan un azar separado: todavía no se reproduce una partida DOS completa sólo
a partir de su semilla.

## Validación completa

```bash
npm run validate
```

Este comando valida parser, reglas, Envido, Flor, Truco, azar, reparto, música,
programación WebAudio e integridad de los recursos, y compila y revisa el build
de producción. GitHub Actions ejecuta estas comprobaciones antes de publicar.
Los tests utilizan fixtures nativos incluidos en el repositorio; no necesitan
Ghidra, Unicorn ni los ejecutables DOS para ejecutarse.

El informe de alcance, resultados y límites está en
[`VALIDACION_COMPLETA.md`](./VALIDACION_COMPLETA.md). La música usa la tabla
de frecuencias y la articulación MN/MS/ML del runtime: no es una grabación del
parlante de una PC original.
