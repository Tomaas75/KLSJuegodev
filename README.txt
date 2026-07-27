# Misión KSL-01

Juego HTML, CSS y JavaScript para KSL Arte y Diseño Gráfico S.A.S.
Archivos: index.html, style.css, script.js y la carpeta assets/ con logo-ksl.png.

===========================================================================
VERSIÓN 10 · REESCRITURA DEL MOTOR, FLUIDEZ Y RUTA DE 37.000 px
===========================================================================

## Por qué antes iba a tirones
El juego dibujaba todo el nivel completo en cada fotograma y creaba cientos de
degradados y sombras nuevas 60 veces por segundo. Medido sobre el código
anterior, un fotograma costaba más de 400 degradados y unas 90 operaciones de
sombra (shadowBlur), que es el efecto más caro del canvas. Además la física
estaba atada a la velocidad de refresco del monitor, así que en un equipo lento
el juego no solo se veía trabado: también se movía más despacio.

## Qué se cambió para que corra fluido
- Sprites pre-renderizados: monedas, contenedores, drones, centinelas,
  asteroides, potenciadores, balizas, plataformas, planetas, nebulosas y la
  propia nave se dibujan UNA sola vez en lienzos fuera de pantalla y luego se
  copian con drawImage. Un fotograma pasó de más de 400 degradados a 3 o 4.
- Cero shadowBlur durante el juego: el brillo queda "horneado" en el sprite.
- Recorte de cámara (culling): solo se procesa y dibuja lo que entra en
  pantalla, aunque la ruta mida 37.000 px.
- Paso de física fijo a 60 Hz con acumulador e interpolación de render. El juego
  se mueve igual en un monitor de 60 Hz, de 120 Hz o en un celular lento.
- Piscina de partículas reutilizables: no se crea basura para el recolector.
- Calidad adaptativa automática. Si el equipo no alcanza los fotogramas, el
  juego baja solo a Media o Básica (menos partículas, menos capas de estrellas,
  resolución interna más baja). También se puede forzar con el botón
  "Gráficos" del HUD.
- Resolución interna con tope de 1.700 px de ancho: se ve nítido sin ahogar a
  las pantallas de alta densidad.
- Contador de FPS visible en el HUD para verificarlo en cualquier dispositivo.

## Recorrido y contenido
- Recorrido ajustado a 37.000 px (antes 14.000 px).
- 10 sectores con tinte de color propio y aviso en pantalla al entrar:
  Base KSL, Nebulosa Azul, Cinturón KSL, Anillos Verdes, Zona Roja,
  Campo de Asteroides, Ruta Dorada, Vía Plateada, Umbral KSL y Portal Premio.
- 89 plataformas: 35 tramos de suelo con huecos, 26 medias, 16 altas y 12
  plataformas móviles nuevas.
- 272 monedas sueltas en ruta, 23 contenedores KSL y 8 balizas de guardado.
  Entre monedas, cajas y balizas hay más de 400 monedas disponibles, así que la
  meta de 80 se puede completar por varias rutas distintas.
- 43 enemigos (24 drones de superficie y 19 centinelas orbitales) y 15
  asteroides a la deriva que ahora giran y se desplazan.
- 22 potenciadores: 7 de turbo, 7 de escudo y 8 orbes de vida (tope de 10 vidas).
- El tramo final queda libre de obstáculos para cerrar la misión con calma.
- Verificado: el pasillo vertical más angosto de toda la ruta mide 215 px y la
  nave mide 54 px de alto, así que no hay ningún punto sin paso.

## Reglas de juego (sin cambios)
- Meta de 80 monedas. El Portal Premio solo abre con las 80 completas.
- Si llegas con menos, aparece el aviso y la nave retrocede un poco para seguir
  jugando.
- 10 vidas, escudo acumulable hasta 3 cargas.
- Las balizas guardan el punto de reaparición si caes al vacío y dan +5 monedas.
- En la pantalla de victoria siguen las dos opciones: Reclamar premio (WhatsApp)
  y Jugar de nuevo. No hay redirección automática.
- El enlace de reclamo se cambia en script.js, en la constante "paginaDeLoggeo".

## Diseño
- HUD tipo sala de control: lecturas separadas de monedas, vida, escudo, récord
  y sector, con tipografía monoespaciada para la telemetría. La franja de estado
  es de posición fija, así que los mensajes largos ya no mueven el lienzo.
- Riel de progreso dentro del lienzo con los 10 sectores marcados, las 8 balizas
  y la posición de la nave.
- Fondo con tres capas de estrellas en parallax, nebulosas, planetas con anillos,
  estaciones lejanas y polvo en primer plano.
- Nave con inclinación según el ascenso, estela de propulsión y parpadeo de
  invulnerabilidad tras recibir un golpe.
- Pantallas de inicio, derrota y victoria rediseñadas con datos de misión
  (monedas, tiempo, récord y último sector alcanzado).
- Sonido opcional (se puede silenciar con el botón del HUD o la tecla M).
- Responsive hasta 360 px de ancho, respeta "prefers-reduced-motion" y tiene
  foco visible para teclado.

## Controles
- Computador: ← → o A/D para moverte · Espacio, ↑ o W para elevarte ·
  P o Esc para pausar · M para el sonido · Enter para reiniciar.
- Celular: los tres botones inferiores, o toca la pantalla del juego para
  elevarte. El juego se pausa solo si cambias de pestaña.

## Ajustes rápidos en script.js (todo está arriba del archivo)
- LEVEL_W: largo del recorrido.
- META_MONEDAS: monedas necesarias para el premio.
- VIDAS_INICIALES, VIDAS_MAX, ESCUDO_MAX.
- GRAVITY y THRUST: sensación de vuelo.
- SECTORES: nombres, posiciones y tinte de color de cada sector.

===========================================================================
VERSIÓN 10.1 · TIPOGRAFÍA Y VIDAS
===========================================================================
- Vidas iniciales y tope subidos de 5 a 10 (constantes VIDAS_INICIALES y
  VIDAS_MAX en script.js). Los 8 orbes de vida siguen igual.
- Tipografía corregida. El problema era la pila de fuentes: "Archivo Black" no
  existe en la mayoría de equipos y el navegador caía en Haettenschweiler o
  Impact, que son condensadas y se vuelven ilegibles en celular. Ahora los
  titulares usan la sans del sistema en peso 900 (San Francisco en iPhone,
  Roboto en Android, Segoe UI en Windows), sin descargas externas.
- Se quitaron las mayúsculas forzadas y el espaciado exagerado entre letras en
  el titular, los botones, el subtítulo y el cartel de pausa.
- Textos de apoyo más grandes: párrafos de 15 a 17 px, ayuda de controles a
  14 px, franja de estado del HUD a 13,5 px y chips de herramientas a 11,5 px.
- Las mayúsculas se conservan solo en etiquetas cortas (MONEDAS, VIDA, SECTORES),
  donde sí se leen bien.

===========================================================================
HISTORIAL ANTERIOR
===========================================================================
- v2: logo con fondo transparente, 5 vidas.
- v3: el premio solo se desbloquea llegando a la meta con las monedas exigidas.
- v4: pantalla de victoria con Reclamar premio y Jugar de nuevo, sin redirección
  automática.
- v5: recorrido ampliado, sectores, checkpoints y power-ups.
- v6: refuerzo visual del HUD y los paneles.
- v7: recorrido de 14.000 px, sin láseres, asteroides más espaciados, sin empuje
  brusco de cámara.
- v8: primer potenciador de vida.
- v9: 3 orbes de vida, meta de 80 monedas, tramo final sin obstáculo superior.
