import { soundFx } from './soundFx.js';

/**
 * Motor de Presentación Espacial tipo PREZI
 * Zoom, paneo, rotación cinematográfica, vista panorámica (Overview) y widgets interactivos por estación.
 */
export class PreziEngine {
  constructor({ viewportEl, worldEl, svgEl, course, onNavigate, onOpenSection, onOpen3D }) {
    this.viewportEl = viewportEl;
    this.worldEl = worldEl;
    this.svgEl = svgEl;
    this.course = course;
    this.stations = course.stations || [];
    this.onNavigate = onNavigate || (() => {});
    this.onOpenSection = onOpenSection || (() => {});
    this.onOpen3D = onOpen3D || (() => {});

    this.currentIndex = 0;
    this.isOverview = false;
    this.panOffset = { x: 0, y: 0 };
    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };

    // Estado de widgets interactivos
    this.hwSwItems = [
      { label: 'Teclado USB', type: 'hw' },
      { label: 'Google Chrome', type: 'sw' },
      { label: 'Disco SSD', type: 'hw' },
      { label: 'Windows 11', type: 'sw' },
      { label: 'Monitor LED', type: 'hw' },
      { label: 'Documentos de Google', type: 'sw' }
    ];
    this.hwSwIndex = 0;
    this.hwSwScore = 0;

    this._renderWorld();
    this._bindInteractions();
    this.goTo(0, true);
    window.addEventListener('resize', () => this._applyCamera(true));
  }

  _renderWorld() {
    this.worldEl.innerHTML = '';
    if (this.svgEl) {
      this.worldEl.appendChild(this.svgEl);
    }

    // 1. Trazar rutas luminosas SVG entre estaciones
    this._renderFlightPaths();

    // 2. Renderizar cada estación en sus coordenadas espaciales
    this.stations.forEach((st, idx) => {
      const node = document.createElement('article');
      node.className = `prezi-node ${st.id === 'portada' ? 'prezi-node-hero' : ''}`;
      node.dataset.index = idx;
      node.dataset.id = st.id;
      node.style.setProperty('--accent', st.color || '#00B4F0');
      node.style.left = `${st.canvas.x}px`;
      node.style.top = `${st.canvas.y}px`;
      node.style.transform = `translate(-50%, -50%) rotate(${st.canvas.rotate || 0}deg)`;

      node.innerHTML = this._buildStationHTML(st, idx);

      // En vista panorámica, hacer clic en cualquier estación vuela hacia ella
      node.addEventListener('click', (e) => {
        if (this.isOverview || this.currentIndex !== idx) {
          e.stopPropagation();
          this.goTo(idx);
        }
      });

      this.worldEl.appendChild(node);
      this._wireStationWidget(node, st);
    });
  }

  _renderFlightPaths() {
    const ns = 'http://www.w3.org/2000/svg';
    this.svgEl.innerHTML = '';
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = `
      <linearGradient id="flightGrad" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stop-color="#00B4F0" stop-opacity="0.85"/>
        <stop offset="50%" stop-color="#F5C518" stop-opacity="0.9"/>
        <stop offset="100%" stop-color="#10B981" stop-opacity="0.85"/>
      </linearGradient>
    `;
    this.svgEl.appendChild(defs);

    // El SVG tiene viewBox centrado: -1800 -1400 3600 2800
    for (let i = 0; i < this.stations.length - 1; i++) {
      const a = this.stations[i].canvas;
      const b = this.stations[i + 1].canvas;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - 110;

      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', `M ${a.x} ${a.y} Q ${mx} ${my} ${b.x} ${b.y}`);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'url(#flightGrad)');
      path.setAttribute('stroke-width', '5');
      path.setAttribute('stroke-dasharray', '14 12');
      path.setAttribute('class', 'flight-path-line');
      this.svgEl.appendChild(path);

      // Marcador de orden en el punto medio
      const dot = document.createElementNS(ns, 'circle');
      dot.setAttribute('cx', a.x);
      dot.setAttribute('cy', a.y);
      dot.setAttribute('r', '14');
      dot.setAttribute('fill', this.stations[i].color || '#00B4F0');
      dot.setAttribute('opacity', '0.55');
      this.svgEl.appendChild(dot);
    }
  }

  _buildStationHTML(st, idx) {
    if (st.id === 'portada') {
      const meta = this.course.meta;
      return `
        <div class="node-orbit-badge">${st.badge}</div>
        <div class="hero-station-grid">
          <div class="hero-brand-col">
            <div class="logo-emblem-ring">
              <img src="${meta.logoPath}" alt="Escudo Departamento Formación de Agentes" class="hero-logo-img" />
            </div>
            <div class="instructor-chip">
              <span class="chip-label">Disertante / Capacitador</span>
              <strong>${meta.instructor}</strong>
              <small>${meta.instructorTitle}</small>
            </div>
          </div>
          <div class="hero-content-col">
            <p class="hero-entity">${meta.institution} · ${meta.location}</p>
            <h1 class="hero-title">${meta.title}</h1>
            <p class="hero-subtitle">${st.summary}</p>
            <div class="hero-pillars">
              ${st.highlights.map((h) => `
                <div class="hero-pillar-card">
                  <strong>${h.label}</strong>
                  <span>${h.desc}</span>
                </div>
              `).join('')}
            </div>
            <div class="hero-cta-row">
              <button class="btn-primary-glow" data-action="start-tour">🚀 Iniciar Recorrido Prezi</button>
              <button class="btn-glass" data-action="open-3d">🧊 Laboratorio 3D & AR</button>
              <button class="btn-glass" data-action="open-practice">📂 Práctica Drive</button>
              <button class="btn-glass" data-action="open-quiz">🏆 Evaluación</button>
            </div>
          </div>
        </div>
      `;
    }

    let bodyBlocks = '';

    if (st.etymology) {
      bodyBlocks += `
        <div class="widget-box etymology-widget">
          <div class="etym-pill"><span>${st.etymology.part1}</span></div>
          <div class="etym-op">+</div>
          <div class="etym-pill gold"><span>${st.etymology.part2}</span></div>
          <div class="etym-op">=</div>
          <div class="etym-result">${st.etymology.result}</div>
        </div>
      `;
    }

    if (st.widget === 'data-transformer' && st.comparison) {
      bodyBlocks += `
        <div class="widget-box data-transform-widget">
          <div class="widget-header-mini">⚡ Simulador Interactivo: Hacé clic en los DATOS para construir INFORMACIÓN</div>
          <div class="raw-chips-row">
            ${st.comparison.dato.items.map((item, i) => `
              <button type="button" class="data-chip" data-chip-idx="${i}">${item}</button>
            `).join('')}
          </div>
          <div class="transform-arrow">⬇ Procesamiento Informático ⬇</div>
          <div class="info-output-box" data-info-output>
            Seleccioná los datos de arriba para darles contexto y sentido...
          </div>
        </div>
      `;
    }

    if (st.pillars) {
      bodyBlocks += `
        <div class="pillars-grid-4">
          ${st.pillars.map((p) => `
            <div class="pillar-mini">
              <strong>${p.name}</strong>
              <em>${p.role}</em>
              <p>${p.desc}</p>
            </div>
          `).join('')}
        </div>
        <div class="widget-box ipo-widget">
          <div class="widget-header-mini">🔄 Tocá cada fase del ciclo para ver un ejemplo real en el DFA</div>
          <div class="ipo-buttons">
            ${st.cycle.map((c, i) => `<button type="button" class="ipo-btn ${i === 0 ? 'active' : ''}" data-ipo="${i}">${c}</button>`).join('')}
          </div>
          <div class="ipo-detail" data-ipo-detail>
            <strong>Entrada:</strong> Un agente carga en el teclado los datos de asistencia del turno mañana.
          </div>
        </div>
      `;
    }

    if (st.categories) {
      bodyBlocks += `
        <div class="two-col-cards">
          ${st.categories.map((cat) => `
            <div class="sub-card">
              <h4>${cat.name}</h4>
              <ul>${cat.items.map((it) => `<li>${it}</li>`).join('')}</ul>
            </div>
          `).join('')}
        </div>
        <div class="widget-box hw3d-banner">
          <div>
            <strong>🧊 Experiencia 3D & Realidad Aumentada disponible</strong>
            <p>Desarmá una computadora pieza por pieza en 3D o proyectala con tu cámara en Realidad Aumentada.</p>
          </div>
          <div class="hw3d-actions">
            <button type="button" class="btn-primary-glow" data-action="launch-hw-3d">Explorar PC en 3D</button>
            <button type="button" class="btn-gold" data-action="launch-hw-ar">📷 Ver en AR</button>
          </div>
        </div>
      `;
    }

    if (st.types) {
      bodyBlocks += `
        <div class="three-col-cards">
          ${st.types.map((t) => `
            <div class="sub-card">
              <h4>${t.name}</h4>
              <div class="examples-tag">${t.examples}</div>
              <p>${t.desc}</p>
            </div>
          `).join('')}
        </div>
        <div class="widget-box classifier-widget">
          <div class="widget-header-mini">🎮 Mini-Desafío Instantáneo: ¿Hardware o Software? <span data-clf-score>0 / 6</span></div>
          <div class="classifier-stage">
            <div class="classifier-item" data-clf-item>Teclado USB</div>
            <div class="classifier-btns">
              <button type="button" class="btn-clf hw" data-clf-ans="hw">🖥️ Es Hardware (Físico)</button>
              <button type="button" class="btn-clf sw" data-clf-ans="sw">💿 Es Software (Programa)</button>
            </div>
            <div class="classifier-feedback" data-clf-feedback>Elegí una opción para comprobar tu respuesta.</div>
          </div>
        </div>
      `;
    }

    if (st.benefits) {
      bodyBlocks += `
        <div class="pillars-grid-4">
          ${st.benefits.map((b) => `
            <div class="pillar-mini">
              <strong>${b.title}</strong>
              <p>${b.desc}</p>
            </div>
          `).join('')}
        </div>
        <div class="widget-box cloud-tip-bar">
          <span>🔐 <strong>Regla de Oro en el Laboratorio:</strong> Cuando termines de trabajar en una PC compartida, siempre hacé clic en tu foto de perfil arriba a la derecha → <em>Cerrar sesión / Salir</em>.</span>
          <button type="button" class="btn-glass-sm" data-action="launch-google-3d">🌐 Ver Nube en 3D</button>
        </div>
      `;
    }

    if (st.permissions) {
      bodyBlocks += `
        <div class="widget-box perm-sim-widget">
          <div class="widget-header-mini">🔐 Simulador de Permisos en Google Drive: probá cada rol</div>
          <div class="perm-tabs">
            ${st.permissions.map((p, i) => `
              <button type="button" class="perm-tab ${i === 0 ? 'active' : ''}" data-perm-idx="${i}" style="--pcolor:${p.color}">
                ${p.role}
              </button>
            `).join('')}
          </div>
          <div class="perm-matrix" data-perm-matrix>
            <div class="perm-desc">Puede ver y descargar (si se permite), pero NO puede modificar ni borrar nada.</div>
            <div class="perm-badges">
              <span class="p-badge ok">✅ Ver archivo</span>
              <span class="p-badge no">❌ Dejar comentarios</span>
              <span class="p-badge no">❌ Editar o borrar</span>
            </div>
          </div>
        </div>
      `;
    }

    if (st.tools) {
      bodyBlocks += `
        <div class="three-col-cards">
          ${st.tools.map((tool) => `
            <div class="sub-card tool-card" style="--tool-color:${tool.color}">
              <div class="tool-top-bar"></div>
              <h4>${tool.name}</h4>
              <div class="examples-tag">${tool.analogy}</div>
              <ul>${tool.uses.map((u) => `<li>${u}</li>`).join('')}</ul>
              <a href="${tool.shortcut}" target="_blank" rel="noopener noreferrer" class="tool-try-link">Abrir ahora →</a>
            </div>
          `).join('')}
        </div>
        <div class="widget-box next-block-cta">
          <div>
            <strong>🎯 ¡Teoría completada!</strong>
            <p>Ahora llevemos todo a la práctica real con tu cuenta personal de Google Drive.</p>
          </div>
          <button type="button" class="btn-primary-glow" data-action="open-practice">Ir a la Práctica en Drive →</button>
        </div>
      `;
    }

    return `
      <div class="node-header">
        <span class="node-orbit-badge">${st.badge}</span>
        <span class="node-step-num">${idx} / ${this.stations.length - 1}</span>
      </div>
      <h2 class="node-title">${st.title}</h2>
      <p class="node-subtitle">${st.subtitle}</p>
      <p class="node-definition">${st.definition || ''}</p>
      ${bodyBlocks}
      ${st.keyPoints ? `
        <div class="node-keypoints">
          ${st.keyPoints.map((kp) => `<div class="kp-item">✦ ${kp}</div>`).join('')}
        </div>
      ` : ''}
      ${st.realExample ? `<div class="real-example-pill">💡 <strong>Ejemplo cotidiano:</strong> ${st.realExample}</div>` : ''}
    `;
  }

  _wireStationWidget(node, st) {
    // Portada CTAs
    node.querySelector('[data-action="start-tour"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.goTo(1);
    });
    node.querySelector('[data-action="open-3d"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpen3D('hardware', false);
    });
    node.querySelector('[data-action="open-practice"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenSection('practice');
    });
    node.querySelector('[data-action="open-quiz"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpenSection('quiz');
    });
    node.querySelector('[data-action="launch-hw-3d"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpen3D('hardware', false);
    });
    node.querySelector('[data-action="launch-hw-ar"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpen3D('hardware', true);
    });
    node.querySelector('[data-action="launch-google-3d"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpen3D('google', false);
    });

    // Widget 2: Dato -> Información
    if (st.widget === 'data-transformer') {
      const selected = new Set();
      const out = node.querySelector('[data-info-output]');
      node.querySelectorAll('.data-chip').forEach((chip) => {
        chip.addEventListener('click', (e) => {
          e.stopPropagation();
          soundFx.click();
          const idx = chip.dataset.chipIdx;
          if (selected.has(idx)) {
            selected.delete(idx);
            chip.classList.remove('active');
          } else {
            selected.add(idx);
            chip.classList.add('active');
          }
          if (selected.size === 0) {
            out.classList.remove('complete');
            out.textContent = 'Seleccioná los datos de arriba para darles contexto y sentido...';
          } else if (selected.size < 4) {
            out.classList.remove('complete');
            out.innerHTML = `Procesando <strong>${selected.size} de 4 datos</strong>... Faltan datos para tener contexto completo.`;
          } else {
            out.classList.add('complete');
            soundFx.correct();
            out.innerHTML = `✅ <strong>INFORMACIÓN GENERADA:</strong> «A las 08:00 hs se registraron 38 agentes en estado Presente en la Sede Chilecito.»`;
          }
        });
      });
    }

    // Widget 3: Ciclo IPO
    if (st.widget === 'ipo-cycle') {
      const details = [
        '<strong>1. Entrada:</strong> Un agente carga en el teclado los datos de asistencia del turno mañana.',
        '<strong>2. Proceso:</strong> La CPU y Hojas de Cálculo cuentan automáticamente cuántos presentes y ausentes hay.',
        '<strong>3. Almacenamiento:</strong> La planilla queda guardada al instante en el disco SSD y respaldada en Google Drive.',
        '<strong>4. Salida:</strong> El sistema muestra el gráfico final en pantalla y permite exportarlo a PDF para la jefatura.'
      ];
      const detailBox = node.querySelector('[data-ipo-detail]');
      node.querySelectorAll('.ipo-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          soundFx.click();
          node.querySelectorAll('.ipo-btn').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          detailBox.innerHTML = details[Number(btn.dataset.ipo)] || '';
        });
      });
    }

    // Widget 5: Clasificador Hardware vs Software
    if (st.widget === 'hw-sw-classifier') {
      const itemEl = node.querySelector('[data-clf-item]');
      const scoreEl = node.querySelector('[data-clf-score]');
      const fbEl = node.querySelector('[data-clf-feedback]');

      const updateItem = () => {
        if (this.hwSwIndex >= this.hwSwItems.length) {
          itemEl.textContent = `🎉 ¡Completado! ${this.hwSwScore} / ${this.hwSwItems.length} aciertos`;
          fbEl.innerHTML = `<button type="button" class="btn-glass-sm" data-clf-reset>Volver a jugar</button>`;
          fbEl.querySelector('[data-clf-reset]')?.addEventListener('click', (ev) => {
            ev.stopPropagation();
            this.hwSwIndex = 0;
            this.hwSwScore = 0;
            scoreEl.textContent = `0 / ${this.hwSwItems.length}`;
            fbEl.textContent = 'Elegí una opción para comprobar tu respuesta.';
            updateItem();
          });
          return;
        }
        itemEl.textContent = this.hwSwItems[this.hwSwIndex].label;
        scoreEl.textContent = `${this.hwSwScore} / ${this.hwSwItems.length}`;
      };

      node.querySelectorAll('[data-clf-ans]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          if (this.hwSwIndex >= this.hwSwItems.length) return;
          const current = this.hwSwItems[this.hwSwIndex];
          const chosen = btn.dataset.clfAns;
          if (chosen === current.type) {
            this.hwSwScore++;
            soundFx.correct();
            fbEl.innerHTML = `<span class="ok-txt">✅ ¡Correcto! «${current.label}» es ${current.type === 'hw' ? 'Hardware (físico)' : 'Software (programa)'}.</span>`;
          } else {
            soundFx.wrong();
            fbEl.innerHTML = `<span class="err-txt">❌ Casi... «${current.label}» es en realidad ${current.type === 'hw' ? 'Hardware (físico)' : 'Software (programa)'}.</span>`;
          }
          this.hwSwIndex++;
          updateItem();
        });
      });
    }

    // Widget 7: Simulador de permisos de Google Drive
    if (st.widget === 'drive-permissions') {
      const states = [
        {
          desc: 'Puede ver y descargar (si se permite), pero NO puede modificar ni borrar nada. Ideal para reglamentos y circulares.',
          badges: ['✅ Ver archivo', '❌ Comentar / Sugerir', '❌ Editar o borrar']
        },
        {
          desc: 'Puede leer y dejar comentarios o sugerencias al margen sin alterar el texto original. Ideal para revisiones.',
          badges: ['✅ Ver archivo', '✅ Comentar / Sugerir', '❌ Editar o borrar']
        },
        {
          desc: 'Control completo sobre el documento: escribe, formatea y edita en tiempo real junto a vos. Ideal para trabajo en equipo.',
          badges: ['✅ Ver archivo', '✅ Comentar / Sugerir', '✅ Editar en tiempo real']
        }
      ];
      const matrix = node.querySelector('[data-perm-matrix]');
      node.querySelectorAll('.perm-tab').forEach((tab) => {
        tab.addEventListener('click', (e) => {
          e.stopPropagation();
          soundFx.click();
          node.querySelectorAll('.perm-tab').forEach((t) => t.classList.remove('active'));
          tab.classList.add('active');
          const s = states[Number(tab.dataset.permIdx)];
          matrix.innerHTML = `
            <div class="perm-desc">${s.desc}</div>
            <div class="perm-badges">
              ${s.badges.map((b) => `<span class="p-badge ${b.startsWith('✅') ? 'ok' : 'no'}">${b}</span>`).join('')}
            </div>
          `;
        });
      });
    }
  }

  _bindInteractions() {
    // Arrastrar para explorar el lienzo en Vista Panorámica
    this.viewportEl.addEventListener('mousedown', (e) => {
      if (!this.isOverview) return;
      this.isDragging = true;
      this.dragStart = { x: e.clientX - this.panOffset.x, y: e.clientY - this.panOffset.y };
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.isDragging || !this.isOverview) return;
      this.panOffset.x = e.clientX - this.dragStart.x;
      this.panOffset.y = e.clientY - this.dragStart.y;
      this._applyCamera(true);
    });

    window.addEventListener('mouseup', () => {
      this.isDragging = false;
    });
  }

  goTo(index, instant = false) {
    const safeIdx = Math.max(0, Math.min(this.stations.length - 1, index));
    this.currentIndex = safeIdx;
    this.isOverview = false;
    this.panOffset = { x: 0, y: 0 };

    if (!instant) soundFx.whoosh();

    this.worldEl.querySelectorAll('.prezi-node').forEach((el, i) => {
      el.classList.toggle('active-station', i === safeIdx);
      el.classList.remove('overview-mode');
    });

    this._applyCamera(instant);
    this.onNavigate(safeIdx, this.stations[safeIdx], false);
  }

  next() {
    if (this.isOverview) {
      this.goTo(this.currentIndex);
      return;
    }
    if (this.currentIndex < this.stations.length - 1) {
      this.goTo(this.currentIndex + 1);
    } else {
      this.toggleOverview(true);
    }
  }

  prev() {
    if (this.isOverview) {
      this.goTo(this.currentIndex);
      return;
    }
    if (this.currentIndex > 0) {
      this.goTo(this.currentIndex - 1);
    }
  }

  toggleOverview(forceState = null) {
    this.isOverview = forceState !== null ? forceState : !this.isOverview;
    this.panOffset = { x: 0, y: 0 };
    soundFx.whoosh();

    this.worldEl.querySelectorAll('.prezi-node').forEach((el, i) => {
      el.classList.toggle('overview-mode', this.isOverview);
      el.classList.toggle('active-station', !this.isOverview && i === this.currentIndex);
    });

    this._applyCamera(false);
    this.onNavigate(this.currentIndex, this.stations[this.currentIndex], this.isOverview);
  }

  _applyCamera(instant = false) {
    const vw = this.viewportEl.clientWidth || window.innerWidth;
    const vh = this.viewportEl.clientHeight || window.innerHeight;

    this.worldEl.style.transition = instant
      ? 'none'
      : 'transform 0.92s cubic-bezier(0.22, 1, 0.36, 1)';

    if (this.isOverview) {
      const overviewScale = Math.max(0.22, Math.min(vw / 2950, vh / 2200));
      this.worldEl.style.transform = `translate3d(${vw / 2 + this.panOffset.x}px, ${vh / 2 + this.panOffset.y}px, 0) scale(${overviewScale}) rotate(0deg)`;
      return;
    }

    const st = this.stations[this.currentIndex];
    if (!st) return;

    const targetW = st.id === 'portada' ? 1020 : 940;
    const targetH = st.id === 'portada' ? 660 : 690;
    const fitScale = Math.min((vw - 36) / targetW, (vh - 155) / targetH, 1.06);
    const scale = Math.max(0.36, fitScale);
    const rot = -(st.canvas.rotate || 0);

    // Centrar exactamente la estación en pantalla y contrarrotar para lectura horizontal perfecta
    this.worldEl.style.transform = `
      translate3d(${vw / 2}px, ${vh / 2 - 12}px, 0)
      scale(${scale})
      rotate(${rot}deg)
      translate3d(${-st.canvas.x}px, ${-st.canvas.y}px, 0)
    `;
  }
}
