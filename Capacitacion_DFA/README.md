# 🌌 Plataforma Interactiva de Capacitación Informática — DFA

**Entidad:** Departamento Formación de Agentes «Gral. Ángel Vicente Peñaloza» — Sede Chilecito, La Rioja  
**Capacitador:** Guardia, Sebastián Nicolás — *Técnico Superior en Sistemas y Redes Informáticas*  
**Producción (Vercel):** https://capacitaciondfa.vercel.app

Plataforma educativa interactiva con navegación espacial **estilo Prezi**, visor **3D WebGL (Three.js)**, experiencia de **Realidad Aumentada (AR)**, laboratorio práctico guiado en **Google Drive** (cuenta personal) y **evaluación gamificada** con base de datos no relacional **`.json`**.

---

## ✨ Bloques y Funcionalidades

1. **Bloque 1 · Presentación Espacial tipo Prezi (`🌌 Presentación Prezi`)**
   - Navegación cinematográfica con zoom, paneo, rotación y **Vista Panorámica (Mapa General)** conectada por rutas luminosas.
   - 9 estaciones teóricas interactivas: *Bienvenida, Informática, Datos vs. Información, Sistemas Informáticos, Hardware, Software, Google y la Nube, Google Drive y Herramientas Ofimáticas (Docs, Sheets, Slides)*.
   - Mini-widgets interactivos dentro de las diapositivas: simulador *Dato → Información*, ciclo *Entrada → Proceso → Almacenamiento → Salida*, mini-juego clasificador *Hardware vs. Software* y simulador de permisos de Google Drive (*Lector, Comentarista, Editor*).
   - Atajos de teclado: `←` / `→` / `Espacio` para navegar, `O` o `Esc` para Vista Panorámica, `0–8` para saltar directo a cualquier estación.

2. **Laboratorio 3D & Realidad Aumentada (`🧊 Lab 3D & AR`)**
   - Motor Three.js local (funciona **100% offline** sin depender de CDN).
   - 3 modelos 3D interactivos: **PC Hardware Desarmable (Vista Explotada)**, **Ciclo de un Sistema Informático en Tiempo Real** y **Ecosistema Google Workspace 3D**.
   - **Modo Realidad Aumentada (AR):** proyecta los hologramas 3D sobre la cámara en vivo del dispositivo (WebRTC) o en *Modo AR Simulado* si el equipo de aula no posee webcam, con botón para capturar y descargar **Foto AR (.png)**.

3. **Bloque 2 · Práctica Real en Google Drive (`📂 Práctica Drive`)**
   - Accesos directos en 1 clic a la cuenta personal de Google: **Mi Unidad (`drive.google.com`)**, **Documentos (`docs.new`)**, **Hojas de Cálculo (`sheets.new`)** y **Presentaciones (`slides.new`)**.
   - 4 misiones guiadas paso a paso con checklist persistente en `.json`, plantilla copiable de Nota Institucional y **simulador interactivo de fórmulas de Hojas de Cálculo** (`=SUMA`, `=PROMEDIO`, `=MAX`).

4. **Bloque 3 · Evaluación Gamificada & Ranking (`🏆 Evaluación & Ranking`)**
   - Banco de 16 preguntas de opción múltiple para principiantes (*Informática, Hardware/Software, Google Drive, Ofimática, Lógica Computacional, Cotidianos y Matemática Básica*).
   - Contador de puntos, bonus por racha, pistas educativas, feedback pedagógico inmediato, confeti y **Constancia de Participación imprimible (PDF)** con escudo institucional.
   - **Tabla de Puntuaciones (Podio Top 3 + buscador)** y **Panel Docente** para exportar resultados (`.json` / `.csv` para Google Sheets), agregar nuevas preguntas al banco `.json` o reiniciar comisiones.

---

## 🗄️ Base de Datos No Relacional (`.json`)

Todos los datos se almacenan en archivos JSON limpios y editables dentro de `data/`:
- `data/course.json` — Contenido teórico, coordenadas Prezi y misiones prácticas.
- `data/questions.json` — Banco de preguntas de la evaluación.
- `data/leaderboard.json` — Registro persistente de puntajes y ranking.
- `data/progress.json` — Progreso de las misiones prácticas.

---

## 🚀 Cómo Ejecutarlo

La plataforma detecta automáticamente el entorno disponible:

### Opción 1 · Node.js + Express (Recomendado)
```bash
npm install
npm start
```
Abrir en el navegador: `http://localhost:3000`

### Opción 2 · MAMP / Apache + PHP
Colocar la carpeta en `htdocs/CapacitacionDFA` y abrir `http://localhost/CapacitacionDFA/`.  
La API `api/db.php` leerá y escribirá automáticamente en los mismos archivos `data/*.json`.

### Opción 3 · Hosting Estático (Vercel / GitHub Pages)
Funciona directamente leyendo `data/*.json` con respaldo automático en `localStorage` y exportación manual a `.json` / `.csv`.
