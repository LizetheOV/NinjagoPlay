# NinjagoPlay

Juego arcade en canvas HTML5 puro donde Lloyd corta enemigos con su espada, sin dependencias ni bundler.

## Fuente Original:

Este juego fue adaptado desde la versión original del proyecto: [Demo Asteroides](https://github.com/Klerith/claude-asteroids)

## Descripción del juego

Lloyd flota en el espacio y la punta de su espada sigue al cursor (o al dedo). Los enemigos se desplazan por la pantalla y reaparecen por el borde opuesto al salir. Cada tajo los parte en dos: Garmadon se divide en dos serpentinos, cada serpentino en dos estrellas ninja, y las estrellas desaparecen. Al eliminar a todos los enemigos empieza el siguiente nivel, con un Garmadon más. Si un enemigo toca a Lloyd, pierde una vida.

## Tecnologías

- **HTML5 Canvas** — renderizado 2D
- **JavaScript (ES6+)** — lógica del juego en `game.js` y efectos de sonido en `sound.js`
- **Web Audio API** — efectos de sonido sintetizados
- Sin frameworks, sin bundler, sin dependencias

## Cómo correr

Abre `index.html` directamente en el navegador (doble clic), o usa un servidor local:

```bash
npx serve .
```

Luego visita `http://localhost:3000`.

## Controles

**Computadora**

| Control                    | Acción                                                  |
| -------------------------- | ------------------------------------------------------- |
| Mover el ratón             | La punta de la espada de Lloyd sigue al cursor y apunta hacia donde lo mueves |
| Clic izquierdo / `Espacio` | Tajo de espada (también reinicia tras el GAME OVER)     |

**Celular / tableta** (mejor en horizontal)

| Gesto                      | Acción                                                  |
| -------------------------- | ------------------------------------------------------- |
| Arrastrar el dedo          | Mueve a Lloyd (como un trackpad, el dedo no lo tapa)    |
| Tocar                      | Tajo de espada (también reinicia tras el GAME OVER)     |
| Arrastrar con un dedo + tocar con otro | Moverse y cortar a la vez                   |

Para jugar en el celular, abre la [demo](https://lizetheov.github.io/NinjagoPlay/) o sirve la carpeta con `npx serve .` y entra desde el celular a `http://<IP-de-tu-computadora>:3000` (misma red Wi-Fi).

## Sonido

Efectos generados en el navegador (Web Audio), sin archivos de audio:

| Evento                    | Sonido                                              |
| ------------------------- | --------------------------------------------------- |
| Tajo de espada            | Silbido metálico de la hoja cortando el aire        |
| Eliminar a Garmadon       | Estruendo grave y oscuro con un acorde siniestro    |
| Eliminar a un serpentino  | Siseo de serpiente con cascabeleo y un chillido     |
| Eliminar una estrella     | "Ting" metálico de shuriken con un destello agudo   |
| Subir de nivel            | Arpegio ascendente brillante con destello           |
| Muere Lloyd               | "Wah wah wah waaah" triste de trombón con sordina   |
| Última vida               | El mismo lamento, más lento, mientras Lloyd cae y suelta la espada |
| La espada cae al suelo    | Golpe metálico con un pequeño rebote                |
| Fin del juego             | Melodía lenta y solemne en tono menor (después del golpe de la espada) |

- Silenciar / activar: tecla `M` o el ícono del altavoz bajo el puntaje (en el celular, tócalo).
- El sonido se activa con el primer toque, clic o tecla (requisito de los navegadores).
- Para usar tus propios sonidos (con licencia): coloca los archivos en `assets/sounds/` y descomenta las líneas de `CUSTOM_SOUNDS` al inicio de `sound.js`.

## Puntuación

| Enemigo                     | Puntos |
| --------------------------- | ------ |
| Garmadon (grande)           | 20     |
| Serpentino (mediano)        | 50     |
| Estrella ninja (pequeño)    | 100    |

## Características

- 3 vidas con invencibilidad temporal al reaparecer (parpadeo)
- Al perder la última vida, Lloyd queda herido (destellos rojos), se desploma y suelta la espada; cuando la espada cae al suelo, termina el juego
- Garmadon es el enemigo grande (con un halo morado); al cortarlo se parte en dos serpentinos
- Los serpentinos son los enemigos medianos; al cortarlos se parten en estrellas ninja
- Las estrellas ninja son los enemigos pequeños: doradas y girando como shuriken
- Cada tajo parte al enemigo en dos: destello del filo, mitades que se separan con el borde del corte dorado y chispas
