# Truco Arbiser — port web

Port experimental del juego DOS de Ariel Arbiser y Enrique Arbiser, construido
con Vite 8, React 19 y TypeScript 7.0.2.

```bash
npm install
npm run dev
```

La carpeta `public/original` se genera desde los archivos DOS ubicados un nivel
por encima mediante `npm run extract`. Incluye la pantalla CGA, los cuatro
buffers de cartas, 156 diálogos y 156 muestras `.VOZ`.

La lógica de reglas de Truco fue reimplementada; los textos, disparadores de
insultos, gráficos, secuencias musicales y muestras de voz provienen de los
archivos originales.

La evidencia y las reglas recuperadas están documentadas en
[`REVERSE_ENGINEERING.md`](./REVERSE_ENGINEERING.md).
