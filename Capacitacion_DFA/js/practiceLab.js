import { dataStore } from './dataStore.js';
import { soundFx } from './soundFx.js';

/**
 * Bloque 2 · Laboratorio Práctico de Google Drive y Ofimática
 * Permite trabajar directamente en la cuenta personal de Google del participante,
 * con seguimiento de pasos, copia de plantillas, simulador de fórmulas y puntos bonus.
 */
export class PracticeLab {
  constructor({ container, course, onProgressChange, onGoToQuiz }) {
    this.container = container;
    this.course = course;
    this.missions = course.practiceMissions || [];
    this.onProgressChange = onProgressChange || (() => {});
    this.onGoToQuiz = onGoToQuiz || (() => {});

    const saved = dataStore.loadLocalProgress();
    this.participant = saved.participant || '';
    this.completedSteps = new Set(saved.completedSteps || []);
    this.activeMissionIdx = 0;

    // Valores editables del mini simulador de Google Sheets
    this.sheetRows = [
      { module: 'Teoría Informática', hours: 2, score: 90 },
      { module: 'Práctica Drive', hours: 1, score: 95 },
      { module: 'Práctica Docs', hours: 1, score: 85 },
      { module: 'Práctica Sheets', hours: 1, score: 100 }
    ];

    this.render();
  }

  getTotalSteps() {
    return this.missions.reduce((acc, m) => acc + (m.steps?.length || 0), 0);
  }

  getPracticePoints() {
    let pts = 0;
    this.missions.forEach((m) => {
      const doneCount = m.steps.filter((_, i) => this.completedSteps.has(`${m.id}-${i}`)).length;
      if (m.steps.length > 0) {
        pts += Math.round((doneCount / m.steps.length) * m.points);
      }
    });
    return pts;
  }

  getProgressSummary() {
    const total = this.getTotalSteps();
    const done = this.completedSteps.size;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return {
      participant: this.participant,
      done,
      total,
      percent,
      points: this.getPracticePoints()
    };
  }

  _persist() {
    const summary = this.getProgressSummary();
    dataStore.saveProgress({
      participant: this.participant || 'Participante DFA',
      completedSteps: [...this.completedSteps],
      practicePoints: summary.points
    });
    this.onProgressChange(summary);
  }

  render() {
    const summary = this.getProgressSummary();
    const m = this.missions[this.activeMissionIdx] || this.missions[0];

    this.container.innerHTML = `
      <div class="practice-header-card">
        <div class="practice-head-left">
          <span class="section-eyebrow">BLOQUE 2 · PRÁCTICA REAL EN LA NUBE</span>
          <h2>Tu Repositorio Personal en Google Drive</h2>
          <p>Ingresá con tu <strong>cuenta personal de Google (@gmail.com)</strong> en una pestaña nueva y completá las 4 misiones guiadas. Cada paso marcado suma <strong>puntos bonus</strong> para la Evaluación Final.</p>
        </div>
        <div class="practice-progress-widget">
          <div class="pp-top">
            <span>Progreso Práctico</span>
            <strong>${summary.percent}% (${summary.done}/${summary.total} pasos)</strong>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${summary.percent}%"></div></div>
          <div class="pp-bottom">
            <span class="bonus-pill">⚡ Bonus acumulado: <strong>+${summary.points} pts</strong></span>
            <input type="text" id="practice-name-input" class="mini-input" placeholder="Tu Nombre y Apellido" value="${this.participant}" />
          </div>
        </div>
      </div>

      <!-- Barra de accesos directos oficiales de Google Workspace -->
      <div class="google-dock-grid">
        <a href="https://drive.google.com/drive/my-drive" target="_blank" rel="noopener noreferrer" class="g-launch-card" style="--gcolor:#34A853">
          <span class="g-icon">📁</span>
          <div>
            <strong>Google Drive</strong>
            <small>Abrir Mi Unidad personal</small>
          </div>
          <span class="g-ext">↗</span>
        </a>
        <a href="https://docs.new" target="_blank" rel="noopener noreferrer" class="g-launch-card" style="--gcolor:#4285F4">
          <span class="g-icon">📄</span>
          <div>
            <strong>Documentos (Docs)</strong>
            <small>Crear documento nuevo</small>
          </div>
          <span class="g-ext">↗</span>
        </a>
        <a href="https://sheets.new" target="_blank" rel="noopener noreferrer" class="g-launch-card" style="--gcolor:#0F9D58">
          <span class="g-icon">📊</span>
          <div>
            <strong>Hojas de Cálculo</strong>
            <small>Crear planilla nueva</small>
          </div>
          <span class="g-ext">↗</span>
        </a>
        <a href="https://slides.new" target="_blank" rel="noopener noreferrer" class="g-launch-card" style="--gcolor:#F4B400">
          <span class="g-icon">🎞️</span>
          <div>
            <strong>Presentaciones</strong>
            <small>Crear diapositivas nuevas</small>
          </div>
          <span class="g-ext">↗</span>
        </a>
      </div>

      <!-- Selector de 4 Misiones -->
      <div class="mission-tabs-row">
        ${this.missions.map((ms, idx) => {
          const done = ms.steps.filter((_, i) => this.completedSteps.has(`${ms.id}-${i}`)).length;
          const isComplete = done === ms.steps.length;
          return `
            <button type="button" class="mission-tab ${idx === this.activeMissionIdx ? 'active' : ''} ${isComplete ? 'completed' : ''}" data-m-idx="${idx}" style="--mcolor:${ms.color}">
              <span class="m-num">Misión ${ms.number}</span>
              <strong>${ms.tool}</strong>
              <small>${done}/${ms.steps.length} pasos ${isComplete ? '✅' : ''}</small>
            </button>
          `;
        }).join('')}
      </div>

      <!-- Panel activo de la Misión -->
      ${m ? this._renderActiveMission(m) : ''}

      <!-- Atajos y Seguridad -->
      <div class="shortcuts-strip">
        <div class="shortcut-group">
          <strong>⌨️ Atajos útiles:</strong>
          <kbd>Ctrl + C</kbd> Copiar ·
          <kbd>Ctrl + V</kbd> Pegar ·
          <kbd>Ctrl + Z</kbd> Deshacer ·
          <kbd>Ctrl + B</kbd> Negrita ·
          <kbd>Ctrl + M</kbd> Nueva Diapositiva
        </div>
        <button type="button" class="btn-primary-glow" id="btn-practice-to-quiz">Ir al Bloque 3: Evaluación Final 🏆 →</button>
      </div>
    `;

    this._bindEvents();
  }

  _renderActiveMission(m) {
    let extraHelper = '';

    if (m.copyTemplate) {
      extraHelper = `
        <div class="helper-card">
          <div class="helper-head">
            <strong>📋 Plantilla Lista para Principiantes (Nota Institucional)</strong>
            <button type="button" class="btn-glass-sm" id="btn-copy-template">Copiar Plantilla</button>
          </div>
          <pre class="template-preview">${m.copyTemplate}</pre>
          <span class="copy-status" id="copy-template-status"></span>
        </div>
      `;
    }

    if (m.formulas) {
      const totalHours = this.sheetRows.reduce((a, r) => a + (Number(r.hours) || 0), 0);
      const avgScore = (this.sheetRows.reduce((a, r) => a + (Number(r.score) || 0), 0) / this.sheetRows.length).toFixed(1);
      const maxScore = Math.max(...this.sheetRows.map((r) => Number(r.score) || 0));

      extraHelper = `
        <div class="helper-card">
          <div class="helper-head">
            <strong>📊 Simulador Interactivo de Fórmulas (Probá antes de pasar a Google Sheets)</strong>
            <small>Editá cualquier número para ver el recálculo automático</small>
          </div>
          <div class="mini-sheet-wrap">
            <table class="mini-sheet-table">
              <thead>
                <tr><th>Fila</th><th>A · Módulo</th><th>B · Horas</th><th>C · Puntaje</th></tr>
              </thead>
              <tbody>
                ${this.sheetRows.map((row, idx) => `
                  <tr>
                    <td class="row-idx">${idx + 2}</td>
                    <td>${row.module}</td>
                    <td><input type="number" class="sheet-cell-input" data-row="${idx}" data-col="hours" value="${row.hours}" min="0" max="99"/></td>
                    <td><input type="number" class="sheet-cell-input" data-row="${idx}" data-col="score" value="${row.score}" min="0" max="100"/></td>
                  </tr>
                `).join('')}
                <tr class="formula-row">
                  <td class="row-idx">6</td>
                  <td><strong>RESULTADOS AUTOMÁTICOS</strong></td>
                  <td><code>=SUMA(B2:B5)</code> → <strong class="calc-val" id="sim-sum">${totalHours} hs</strong></td>
                  <td><code>=PROMEDIO(C2:C5)</code> → <strong class="calc-val" id="sim-avg">${avgScore}</strong> · <code>=MAX</code> → <strong class="calc-val" id="sim-max">${maxScore}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    return `
      <div class="mission-panel" style="--mcolor:${m.color}">
        <div class="mission-panel-top">
          <div>
            <span class="mission-badge">Misión ${m.number} · +${m.points} pts bonus</span>
            <h3>${m.title}</h3>
            <p>${m.goal}</p>
          </div>
          <a href="${m.url}" target="_blank" rel="noopener noreferrer" class="btn-primary-glow">${m.buttonLabel} ↗</a>
        </div>

        <div class="mission-checklist">
          ${m.steps.map((step, i) => {
            const key = `${m.id}-${i}`;
            const checked = this.completedSteps.has(key);
            return `
              <label class="step-check-item ${checked ? 'done' : ''}">
                <input type="checkbox" data-step-key="${key}" ${checked ? 'checked' : ''} />
                <span class="step-num">${i + 1}</span>
                <span class="step-text">${step}</span>
              </label>
            `;
          }).join('')}
        </div>

        ${extraHelper}

        <div class="mission-tip-box">
          💡 <strong>Tip Docente:</strong> ${m.tip}
        </div>
      </div>
    `;
  }

  _bindEvents() {
    const nameInput = this.container.querySelector('#practice-name-input');
    nameInput?.addEventListener('input', (e) => {
      this.participant = e.target.value.trim();
      this._persist();
    });

    this.container.querySelectorAll('.mission-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        soundFx.click();
        this.activeMissionIdx = Number(tab.dataset.mIdx);
        this.render();
      });
    });

    this.container.querySelectorAll('[data-step-key]').forEach((cb) => {
      cb.addEventListener('change', () => {
        const key = cb.dataset.stepKey;
        if (cb.checked) {
          this.completedSteps.add(key);
          soundFx.correct();
        } else {
          this.completedSteps.delete(key);
          soundFx.click();
        }
        this._persist();
        this.render();
      });
    });

    const copyBtn = this.container.querySelector('#btn-copy-template');
    copyBtn?.addEventListener('click', async () => {
      const m = this.missions[this.activeMissionIdx];
      const status = this.container.querySelector('#copy-template-status');
      try {
        await navigator.clipboard.writeText(m.copyTemplate);
        soundFx.correct();
        status.textContent = '✅ ¡Plantilla copiada! Ahora pegala en tu Documento de Google con Ctrl + V.';
      } catch (_) {
        status.textContent = 'Seleccioná el texto de arriba y copialo con Ctrl + C.';
      }
    });

    this.container.querySelectorAll('.sheet-cell-input').forEach((inp) => {
      inp.addEventListener('input', () => {
        const r = Number(inp.dataset.row);
        const col = inp.dataset.col;
        this.sheetRows[r][col] = Number(inp.value) || 0;
        const totalHours = this.sheetRows.reduce((a, x) => a + (Number(x.hours) || 0), 0);
        const avgScore = (this.sheetRows.reduce((a, x) => a + (Number(x.score) || 0), 0) / this.sheetRows.length).toFixed(1);
        const maxScore = Math.max(...this.sheetRows.map((x) => Number(x.score) || 0));
        const sumEl = this.container.querySelector('#sim-sum');
        const avgEl = this.container.querySelector('#sim-avg');
        const maxEl = this.container.querySelector('#sim-max');
        if (sumEl) sumEl.textContent = `${totalHours} hs`;
        if (avgEl) avgEl.textContent = avgScore;
        if (maxEl) maxEl.textContent = maxScore;
      });
    });

    this.container.querySelector('#btn-practice-to-quiz')?.addEventListener('click', () => {
      soundFx.whoosh();
      this.onGoToQuiz();
    });
  }
}
