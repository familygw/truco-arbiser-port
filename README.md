# Truco Arbiser — port web

Port web y proyecto de preservación del **Truco Arbiser**, un juego de Truco
argentino creado originalmente para DOS por **Ariel Arbiser y Enrique
Arbiser**.

El port fue desarrollado por **Carlos A. Leguizamón**. Recupera recursos del
programa original y reimplementa su funcionamiento para navegadores modernos,
manteniendo su humor, picardía gauchesca y forma conversacional de jugar.

## Estado

El proyecto se encuentra en estado **MVP jugable**. Incluye:

- partidas de Truco a 30 puntos, con malas y buenas;
- Envido, Envido Envido, Real Envido, Dos Reales Envido y Falta Envido;
- Flor, Contraflor y Contraflor al Resto;
- Truco, Retruco y Vale Cuatro con respuestas y subidas encadenadas;
- mano y turnos alternados, pardas y tres bazas visibles;
- CPU con estrategia probabilística, riesgo y posibilidad de mentir;
- parser conversacional, insultos y respuestas recuperadas del ejecutable;
- melodías QuickBasic y reproducción de las voces `.VOZ` originales;
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

Vite mostrará la dirección local, normalmente `http://localhost:5173`.

Para generar una versión de producción:

```bash
npm run build
npm run preview
```

## Pruebas

La equivalencia del parser y las reglas recuperadas se comprueba con:

```bash
npm run test:logic
```

## Cómo jugar

Las cartas se pueden jugar haciendo clic. También se conserva la entrada de
texto del original:

- `carta 1`, `carta 2`, `carta 3`;
- `envido`, `real envido`, `falta envido`;
- `quiero`, `no quiero`;
- `truco`, `quiero retruco`, `quiero vale 4`;
- `flor`, `con flor quiero`, `contraflor`;
- `mazo`, `baraja`, `chau` o `rajo` para abandonar la mano.

La CPU puede cantar con buenas cartas o mentir. Una frase segura no significa
que realmente tenga un buen tanto o una mano fuerte.

Los navegadores pueden bloquear el audio automático. Si sucede, usá el botón
**Activar sonido del splash**. Música y voz también se pueden activar o
desactivar durante la partida.

## Recursos originales e ingeniería inversa

`public/original` contiene recursos extraídos de los archivos DOS: pantalla
CGA, símbolos de los cuatro palos, 156 diálogos y 156 muestras de voz de un
bit. `public/restored` contiene reinterpretaciones a todo color creadas para el
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
