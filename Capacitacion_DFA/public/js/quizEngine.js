import { dataStore } from './dataStore.js';
import { soundFx } from './soundFx.js';

const AVATARS = ['🛡️', '⭐', '💻', '🚀', '🎓', '📡', '🔥', '🦁'];

/**
 * Bloque 3 · Evaluación Gamificada, Contador de Puntos, Tabla de Puntuaciones (.json)
 * Incluye Certificado Imprimible Institucional y Panel Docente.
 */
export class QuizEngine {
  constructor({ container, course, questionsData, getPracticeSummary }) {
    this.container = container;
    this.course = course;
    this.questionsData = questionsData;
    this.getPracticeSummary = getPracticeSummary || (() => ({ points: 0, participant: '' }));

    this.view = 'setup'; // 'setup' | 'playing' | 'results' | 'leaderboard' | 'teacher'
    this.leaderboard = [];

    // Estado de partida
    this.player = { name: '', section: 'Comisión A · Chilecito', avatar: AVATARS[0] };
    this.activeQuestions = [];
    this.qIndex = 0;
    this.score = 0;
    this.correctCount = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.answered = false;
    this.hintUsed = false;
    this.startTime = 0;
    this.timerInterval = null;
    this.elapsedSec = 0;
    this.lastSubmission = null;
    this.searchTerm = '';

    this.refreshLeaderboard().then(() => this.render());
  }

  async refreshLeaderboard() {
    this.leaderboard = await dataStore.getLeaderboard();
  }

  setView(viewName) {
    if (this.timerInterval && viewName !== 'playing') {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.view = viewName;
    if (viewName === 'leaderboard') {
      this.refreshLeaderboard().then(() => this.render());
    } else {
      this.render();
    }
  }

  _startQuiz(modeCount) {
    const practice = this.getPracticeSummary();
    const nameEl = this.container.querySelector('#quiz-player-name');
    const secEl = this.container.querySelector('#quiz-player-section');
    const name = (nameEl?.value || practice.participant || '').trim();
    if (!name) {
      nameEl?.focus();
      nameEl?.classList.add('input-error');
      soundFx.wrong();
      return;
    }

    this.player.name = name;
    this.player.section = (secEl?.value || 'Sede Chilecito').trim();

    const pool = [...(this.questionsData.questions || [])];
    // Mezclar manteniendo variedad de categorías si se elige modo rápido
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.activeQuestions = pool.slice(0, Math.min(modeCount, pool.length));
    this.qIndex = 0;
    this.score = 0;
    this.correctCount = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.answered = false;
    this.hintUsed = false;
    this.elapsedSec = 0;
    this.startTime = Date.now();
    this.view = 'playing';

    soundFx.whoosh();
    this.render();

    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      this.elapsedSec = Math.floor((Date.now() - this.startTime) / 1000);
      const tEl = this.container.querySelector('#quiz-timer-val');
      if (tEl) tEl.textContent = this._formatTime(this.elapsedSec);
    }, 1000);
  }

  _formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  _answerOption(optIdx) {
    if (this.answered) return;
    this.answered = true;

    const q = this.activeQuestions[this.qIndex];
    const cfg = this.questionsData.quizConfig || { basePoints: 100, streakBonus: 25, hintPenalty: 20 };
    const isRight = optIdx === q.correct;

    if (isRight) {
      this.correctCount++;
      this.streak++;
      if (this.streak > this.bestStreak) this.bestStreak = this.streak;
      const earned = Math.max(20, cfg.basePoints + (this.streak - 1) * cfg.streakBonus - (this.hintUsed ? cfg.hintPenalty : 0));
      this.score += earned;
      soundFx.correct();
    } else {
      this.streak = 0;
      soundFx.wrong();
    }

    // Actualizar estilos de botones sin perder scroll
    this.container.querySelectorAll('.quiz-option-btn').forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === q.correct) btn.classList.add('is-correct');
      else if (idx === optIdx && !isRight) btn.classList.add('is-wrong');
    });

    const fb = this.container.querySelector('#quiz-feedback-area');
    if (fb) {
      fb.hidden = false;
      fb.className = `quiz-feedback-area ${isRight ? 'fb-ok' : 'fb-err'}`;
      fb.innerHTML = `
        <div class="fb-title">${isRight ? '✅ ¡Excelente respuesta!' : '❌ Respuesta incorrecta — ¡Seguí adelante!'}</div>
        <p>${q.explanation}</p>
        <button type="button" class="btn-primary-glow" id="btn-next-question">
          ${this.qIndex < this.activeQuestions.length - 1 ? 'Siguiente Pregunta →' : 'Finalizar y Ver Puntuación 🏆'}
        </button>
      `;
      fb.querySelector('#btn-next-question')?.addEventListener('click', () => this._nextQuestion());
    }

    const scoreEl = this.container.querySelector('#quiz-live-score');
    if (scoreEl) scoreEl.textContent = this.score;
    const streakEl = this.container.querySelector('#quiz-live-streak');
    if (streakEl) streakEl.textContent = `🔥 Racha x${this.streak}`;
  }

  async _nextQuestion() {
    if (this.qIndex < this.activeQuestions.length - 1) {
      this.qIndex++;
      this.answered = false;
      this.hintUsed = false;
      soundFx.click();
      this.render();
    } else {
      await this._finishQuiz();
    }
  }

  async _finishQuiz() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.elapsedSec = Math.max(1, Math.floor((Date.now() - this.startTime) / 1000));
    const total = this.activeQuestions.length || 1;
    const accuracy = Math.round((this.correctCount / total) * 100);
    const practice = this.getPracticeSummary();
    const practiceBonus = practice.points || 0;
    const finalTotalScore = this.score + practiceBonus;

    const payload = {
      name: this.player.name,
      section: this.player.section,
      avatar: this.player.avatar,
      score: finalTotalScore,
      correct: this.correctCount,
      total,
      accuracy,
      bestStreak: this.bestStreak,
      durationSec: this.elapsedSec,
      practiceBonus
    };

    const res = await dataStore.submitScore(payload);
    this.leaderboard = res.scores || (await dataStore.getLeaderboard());
    this.lastSubmission = { ...payload, quizOnlyScore: this.score, rank: res.rank || 1 };
    this.view = 'results';
    soundFx.fanfare();
    this.render();
    this._launchConfetti();
  }

  _launchConfetti() {
    const canvas = document.createElement('canvas');
    canvas.className = 'confetti-overlay';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#00B4F0', '#F5C518', '#10B981', '#EF4444', '#A855F7', '#FFFFFF'];
    const particles = Array.from({ length: 95 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 180,
      vx: (Math.random() - 0.5) * 6,
      vy: 3 + Math.random() * 5,
      size: 6 + Math.random() * 7,
      rot: Math.random() * 360,
      color: colors[Math.floor(Math.random() * colors.length)]
    }));

    let frames = 0;
    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((p) => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += 6;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      });
      frames++;
      if (frames < 130) requestAnimationFrame(step);
      else canvas.remove();
    };
    requestAnimationFrame(step);
  }

  render() {
    const topTabs = `
      <div class="quiz-subnav">
        <button type="button" class="qtab ${this.view === 'setup' || this.view === 'playing' || this.view === 'results' ? 'active' : ''}" data-qview="setup">🎯 Desafío Evaluativo</button>
        <button type="button" class="qtab ${this.view === 'leaderboard' ? 'active' : ''}" data-qview="leaderboard">🏆 Tabla de Puntuaciones (${this.leaderboard.length})</button>
        <button type="button" class="qtab ${this.view === 'teacher' ? 'active' : ''}" data-qview="teacher">${dataStore.isTeacherAuthenticated() ? '🔓' : '🔒'} Panel Docente (.json)</button>
      </div>
    `;

    let body = '';
    if (this.view === 'setup') body = this._renderSetup();
    else if (this.view === 'playing') body = this._renderPlaying();
    else if (this.view === 'results') body = this._renderResults();
    else if (this.view === 'leaderboard') body = this._renderLeaderboard();
    else if (this.view === 'teacher') body = this._renderTeacherPanel();

    this.container.innerHTML = `${topTabs}<div class="quiz-stage-body">${body}</div>`;
    this._bindEvents();
  }

  _renderSetup() {
    const practice = this.getPracticeSummary();
    const defaultName = this.player.name || practice.participant || '';
    const totalQ = (this.questionsData.questions || []).length;

    return `
      <div class="quiz-setup-grid">
        <div class="setup-card">
          <span class="section-eyebrow">BLOQUE 3 · EVALUACIÓN INICIAL GAMIFICADA</span>
          <h2>Poné a Prueba tus Conocimientos</h2>
          <p>Preguntas de opción múltiple nivel principiante sobre <strong>Informática, Hardware/Software, Google Drive, Ofimática, Lógica Computacional, Cotidianos y Matemática Básica</strong>.</p>

          <div class="form-group">
            <label for="quiz-player-name">Nombre y Apellido del Participante *</label>
            <input type="text" id="quiz-player-name" class="field-input" placeholder="Ej.: Agente Juan Pérez" value="${defaultName}" />
          </div>

          <div class="form-group">
            <label for="quiz-player-section">Comisión / Sección</label>
            <input type="text" id="quiz-player-section" class="field-input" value="${this.player.section}" />
          </div>

          <div class="form-group">
            <label>Elegí tu Insignia / Avatar</label>
            <div class="avatar-picker">
              ${AVATARS.map((av) => `
                <button type="button" class="av-btn ${av === this.player.avatar ? 'active' : ''}" data-avatar="${av}">${av}</button>
              `).join('')}
            </div>
          </div>

          <div class="bonus-summary-box">
            <span>⚡ Bonus desde Bloque 2 (Práctica Drive):</span>
            <strong>+${practice.points} pts</strong>
          </div>

          <div class="setup-cta-row">
            <button type="button" class="btn-primary-glow" id="btn-start-full">🚀 Evaluación Completa (${totalQ} preguntas)</button>
            <button type="button" class="btn-glass" id="btn-start-quick">⚡ Modo Rápido (8 preguntas)</button>
          </div>
        </div>

        <div class="setup-info-card">
          <h3>📊 Sistema de Puntuación</h3>
          <ul class="scoring-rules">
            <li><span>✅ Respuesta correcta</span><strong>+100 pts</strong></li>
            <li><span>🔥 Bonus por racha consecutiva</span><strong>+25 pts extra</strong></li>
            <li><span>💡 Usar pista educativa</span><strong>-20 pts</strong></li>
            <li><span>📂 Misiones Prácticas de Drive</span><strong>hasta +420 pts</strong></li>
          </ul>

          <div class="db-badge-card">
            <span class="db-dot"></span>
            <div>
              <strong>Base de Datos No Relacional (.json)</strong>
              <small>${dataStore.engineLabel}</small>
            </div>
          </div>

          <div class="mini-top3">
            <h4>🏆 Líderes actuales</h4>
            ${this.leaderboard.slice(0, 3).map((s, i) => `
              <div class="mini-leader-row">
                <span>${['🥇', '🥈', '🥉'][i]} ${s.avatar || '🎓'} ${s.name}</span>
                <strong>${s.score} pts</strong>
              </div>
            `).join('') || '<p class="muted-txt">Aún no hay puntajes registrados.</p>'}
          </div>
        </div>
      </div>
    `;
  }

  _renderPlaying() {
    const q = this.activeQuestions[this.qIndex];
    const progress = Math.round(((this.qIndex + 1) / this.activeQuestions.length) * 100);
    const letters = ['A', 'B', 'C', 'D'];

    return `
      <div class="quiz-arena-card">
        <div class="arena-hud">
          <div class="hud-pill">👤 ${this.player.avatar} ${this.player.name}</div>
          <div class="hud-pill accent">⭐ Puntos: <strong id="quiz-live-score">${this.score}</strong></div>
          <div class="hud-pill gold" id="quiz-live-streak">🔥 Racha x${this.streak}</div>
          <div class="hud-pill">⏱️ <span id="quiz-timer-val">${this._formatTime(this.elapsedSec)}</span></div>
        </div>

        <div class="arena-progress-wrap">
          <div class="arena-progress-meta">
            <span class="cat-badge">${q.category} · ${q.difficulty}</span>
            <span>Pregunta ${this.qIndex + 1} de ${this.activeQuestions.length}</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
        </div>

        <h3 class="arena-question">${q.question}</h3>

        <div class="hint-row">
          <button type="button" class="btn-hint" id="btn-show-hint" ${this.hintUsed ? 'disabled' : ''}>
            💡 ${this.hintUsed ? 'Pista activada' : 'Ver Pista Educativa (-20 pts)'}
          </button>
          <div class="hint-box" id="quiz-hint-box" ${this.hintUsed ? '' : 'hidden'}>${q.hint}</div>
        </div>

        <div class="options-grid">
          ${q.options.map((opt, idx) => `
            <button type="button" class="quiz-option-btn" data-opt-idx="${idx}">
              <span class="opt-letter">${letters[idx]}</span>
              <span class="opt-text">${opt}</span>
            </button>
          `).join('')}
        </div>

        <div id="quiz-feedback-area" hidden></div>
      </div>
    `;
  }

  _renderResults() {
    const r = this.lastSubmission;
    const meta = this.course.meta;
    const badge =
      r.accuracy >= 85
        ? { title: 'Agente Digital Destacado', icon: '🏆', color: '#F5C518' }
        : r.accuracy >= 60
        ? { title: 'Agente Digital Aprobado', icon: '🎖️', color: '#10B981' }
        : { title: 'Agente en Formación', icon: '📘', color: '#00B4F0' };
    const todayStr = new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });

    return `
      <div class="results-layout">
        <div class="results-summary-card">
          <div class="res-badge" style="--bcolor:${badge.color}">${badge.icon} ${badge.title}</div>
          <h2>¡Excelente trabajo, ${r.name}!</h2>
          <p class="res-rank-line">Quedaste en el <strong>Puesto #${r.rank}</strong> de la Tabla de Puntuaciones (guardado en <code>leaderboard.json</code>).</p>

          <div class="res-kpi-grid">
            <div class="res-kpi"><span>Puntaje Total</span><strong>${r.score} pts</strong><small>Quiz ${r.quizOnlyScore} + Práctica ${r.practiceBonus}</small></div>
            <div class="res-kpi"><span>Aciertos</span><strong>${r.correct} / ${r.total}</strong><small>${r.accuracy}% de precisión</small></div>
            <div class="res-kpi"><span>Mejor Racha</span><strong>🔥 x${r.bestStreak}</strong><small>respuestas seguidas</small></div>
            <div class="res-kpi"><span>Tiempo</span><strong>${this._formatTime(r.durationSec)}</strong><small>duración total</small></div>
          </div>

          <div class="res-actions">
            <button type="button" class="btn-primary-glow" id="btn-print-cert">🖨️ Imprimir / Guardar Constancia PDF</button>
            <button type="button" class="btn-gold" data-qview="leaderboard">🏆 Ver Tabla de Puntuaciones</button>
            <button type="button" class="btn-glass" id="btn-retry-quiz">🔄 Realizar Nuevo Intento</button>
          </div>
        </div>

        <!-- Constancia Digital Imprimible -->
        <div class="certificate-card" id="printable-certificate">
          <div class="cert-border">
            <div class="cert-header">
              <img src="${meta.logoPath}" alt="Escudo DFA" class="cert-logo" />
              <div>
                <div class="cert-inst">${meta.institution}</div>
                <div class="cert-loc">${meta.location}</div>
              </div>
            </div>
            <div class="cert-title">CONSTANCIA DE PARTICIPACIÓN</div>
            <p class="cert-text">Se deja constancia de que</p>
            <div class="cert-student">${r.name}</div>
            <p class="cert-text">
              ha completado satisfactoriamente la <strong>${meta.title}</strong> (${r.section}),
              obteniendo <strong>${r.score} puntos</strong> (${r.accuracy}% de precisión en la evaluación diagnóstica).
            </p>
            <div class="cert-footer">
              <div>
                <div class="cert-sign-line"></div>
                <strong>${meta.instructor}</strong>
                <small>${meta.instructorTitle}</small>
              </div>
              <div class="cert-date">${todayStr}</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderLeaderboard() {
    const filtered = this.leaderboard.filter((s) =>
      `${s.name} ${s.section}`.toLowerCase().includes(this.searchTerm.toLowerCase())
    );
    const top3 = this.leaderboard.slice(0, 3);
    const avgAcc = this.leaderboard.length
      ? Math.round(this.leaderboard.reduce((a, b) => a + (b.accuracy || 0), 0) / this.leaderboard.length)
      : 0;
    const bestScore = this.leaderboard[0]?.score || 0;

    return `
      <div class="leaderboard-wrap">
        <div class="lb-stats-row">
          <div class="lb-stat"><span>Participantes Registrados</span><strong>${this.leaderboard.length}</strong></div>
          <div class="lb-stat"><span>Puntaje Máximo</span><strong>${bestScore} pts</strong></div>
          <div class="lb-stat"><span>Precisión Promedio</span><strong>${avgAcc}%</strong></div>
          <div class="lb-stat"><span>Almacenamiento</span><strong>JSON NoSQL</strong></div>
        </div>

        ${top3.length > 0 ? `
          <div class="podium-grid">
            ${[1, 0, 2].map((pos) => {
              const p = top3[pos];
              if (!p) return '<div></div>';
              const medal = ['🥇 1° Puesto', '🥈 2° Puesto', '🥉 3° Puesto'][pos];
              return `
                <div class="podium-card place-${pos + 1}">
                  <div class="podium-medal">${medal}</div>
                  <div class="podium-avatar">${p.avatar || '🎓'}</div>
                  <strong>${p.name}</strong>
                  <small>${p.section || ''}</small>
                  <div class="podium-score">${p.score} pts</div>
                  <div class="podium-meta">${p.accuracy}% · 🔥 x${p.bestStreak || 0}</div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}

        <div class="lb-toolbar">
          <input type="search" id="lb-search-input" class="field-input" placeholder="🔍 Buscar por nombre o comisión..." value="${this.searchTerm}" />
          <div class="lb-toolbar-actions">
            <button type="button" class="btn-glass-sm" id="btn-export-csv">📊 Exportar CSV (Sheets)</button>
            <button type="button" class="btn-glass-sm" id="btn-export-json">💾 Exportar JSON</button>
          </div>
        </div>

        <div class="lb-table-wrap">
          <table class="lb-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Participante</th>
                <th>Comisión</th>
                <th>Puntaje</th>
                <th>Aciertos</th>
                <th>Precisión</th>
                <th>Racha</th>
                <th>Tiempo</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.map((s, idx) => `
                <tr>
                  <td><strong>#${idx + 1}</strong></td>
                  <td>${s.avatar || '🎓'} <strong>${s.name}</strong></td>
                  <td>${s.section || '-'}</td>
                  <td><span class="score-pill">${s.score} pts</span></td>
                  <td>${s.correct}/${s.total}</td>
                  <td>${s.accuracy}%</td>
                  <td>🔥 x${s.bestStreak || 0}</td>
                  <td>${this._formatTime(s.durationSec || 0)}</td>
                </tr>
              `).join('') || '<tr><td colspan="8" style="text-align:center;padding:24px;">No hay registros que coincidan.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  _renderTeacherPanel() {
    if (!dataStore.isTeacherAuthenticated()) {
      return `
        <div class="teacher-auth-wrap">
          <div class="teacher-auth-card">
            <div class="auth-lock-icon">🔐</div>
            <span class="section-eyebrow">ACCESO RESTRINGIDO · CAPACITADOR</span>
            <h2>Panel Docente Protegido</h2>
            <p>Esta sección permite administrar el banco de preguntas (<code>questions.json</code>), exportar actas y reiniciar la tabla de puntuaciones. Ingresá tus credenciales docentes.</p>

            <form id="teacher-login-form" class="teacher-form" autocomplete="off">
              <div class="form-group">
                <label for="teacher-user-input">Usuario Docente</label>
                <input type="text" id="teacher-user-input" name="username" required class="field-input" placeholder="Ingresá tu usuario" />
              </div>
              <div class="form-group">
                <label for="teacher-pass-input">Contraseña</label>
                <div class="pass-input-wrap">
                  <input type="password" id="teacher-pass-input" name="password" required class="field-input" placeholder="Ingresá tu contraseña" />
                  <button type="button" class="pass-eye-btn" id="btn-toggle-pass" title="Mostrar / ocultar contraseña">👁️</button>
                </div>
              </div>
              <div id="teacher-login-error" class="auth-error-msg" hidden></div>
              <button type="submit" class="btn-primary-glow" style="width:100%;">🔓 Ingresar al Panel Docente</button>
            </form>
          </div>
        </div>
      `;
    }

    return `
      <div class="teacher-session-bar">
        <span>✅ Sesión docente activa: <strong>${dataStore.getTeacherName()}</strong></span>
        <button type="button" class="btn-glass-sm" id="btn-teacher-logout">🔒 Cerrar Sesión Docente</button>
      </div>
      <div class="teacher-grid">
        <div class="teacher-card">
          <h3>➕ Agregar Nueva Pregunta al Banco (.json)</h3>
          <p>Sumá preguntas personalizadas directamente a <code>data/questions.json</code> sin tocar código.</p>
          <form id="teacher-add-q-form" class="teacher-form">
            <div class="form-row-2">
              <div class="form-group">
                <label>Categoría</label>
                <select name="category" class="field-input">
                  <option>Informática</option>
                  <option>Hardware y Software</option>
                  <option>Google Drive</option>
                  <option>Ofimática Google</option>
                  <option>Lógica Computacional</option>
                  <option>Matemática Básica</option>
                  <option>Cotidiano Digital</option>
                </select>
              </div>
              <div class="form-group">
                <label>Respuesta Correcta</label>
                <select name="correct" class="field-input">
                  <option value="0">Opción A</option>
                  <option value="1">Opción B</option>
                  <option value="2">Opción C</option>
                  <option value="3">Opción D</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label>Enunciado de la pregunta</label>
              <input type="text" name="question" required class="field-input" placeholder="Ej.: ¿Qué atajo sirve para deshacer un cambio?" />
            </div>
            <div class="form-row-2">
              <input type="text" name="opt0" required class="field-input" placeholder="Opción A" />
              <input type="text" name="opt1" required class="field-input" placeholder="Opción B" />
              <input type="text" name="opt2" required class="field-input" placeholder="Opción C" />
              <input type="text" name="opt3" required class="field-input" placeholder="Opción D" />
            </div>
            <div class="form-group">
              <label>Explicación pedagógica</label>
              <input type="text" name="explanation" class="field-input" placeholder="Explicación breve que verá el agente al responder" />
            </div>
            <button type="submit" class="btn-primary-glow">💾 Guardar Pregunta en JSON</button>
            <div id="teacher-q-status" class="status-msg"></div>
          </form>
        </div>

        <div class="teacher-card">
          <h3>🗄️ Administración de Base de Datos (.json)</h3>
          <p>Motor detectado: <strong>${dataStore.engineLabel}</strong></p>
          <p>Total de preguntas activas: <strong>${(this.questionsData.questions || []).length}</strong> · Registros en ranking: <strong>${this.leaderboard.length}</strong></p>

          <div class="teacher-actions-stack">
            <button type="button" class="btn-glass" id="t-export-json">💾 Descargar Backup Ranking (.json)</button>
            <button type="button" class="btn-glass" id="t-export-csv">📊 Descargar Planilla de Notas (.csv para Google Sheets)</button>
            <button type="button" class="btn-warn" id="t-clear-demos">🧹 Quitar solo registros de ejemplo</button>
            <button type="button" class="btn-danger" id="t-clear-all">🗑️ Reiniciar Tabla de Puntuaciones (Nueva Comisión)</button>
          </div>
          <div id="teacher-db-status" class="status-msg"></div>
        </div>
      </div>
    `;
  }

  _bindEvents() {
    this.container.querySelectorAll('[data-qview]').forEach((btn) => {
      btn.addEventListener('click', () => {
        soundFx.click();
        this.setView(btn.dataset.qview);
      });
    });

    this.container.querySelectorAll('[data-avatar]').forEach((btn) => {
      btn.addEventListener('click', () => {
        soundFx.click();
        this.player.avatar = btn.dataset.avatar;
        this.container.querySelectorAll('[data-avatar]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    this.container.querySelector('#btn-start-full')?.addEventListener('click', () =>
      this._startQuiz((this.questionsData.questions || []).length)
    );
    this.container.querySelector('#btn-start-quick')?.addEventListener('click', () => this._startQuiz(8));

    this.container.querySelectorAll('[data-opt-idx]').forEach((btn) => {
      btn.addEventListener('click', () => this._answerOption(Number(btn.dataset.optIdx)));
    });

    this.container.querySelector('#btn-show-hint')?.addEventListener('click', () => {
      this.hintUsed = true;
      soundFx.click();
      const box = this.container.querySelector('#quiz-hint-box');
      if (box) box.hidden = false;
      const btn = this.container.querySelector('#btn-show-hint');
      if (btn) {
        btn.disabled = true;
        btn.textContent = '💡 Pista activada (-20 pts)';
      }
    });

    this.container.querySelector('#btn-print-cert')?.addEventListener('click', () => window.print());
    this.container.querySelector('#btn-retry-quiz')?.addEventListener('click', () => this.setView('setup'));

    this.container.querySelector('#lb-search-input')?.addEventListener('input', (e) => {
      this.searchTerm = e.target.value;
      const pos = e.target.selectionStart;
      this.render();
      const el = this.container.querySelector('#lb-search-input');
      if (el) {
        el.focus();
        el.setSelectionRange(pos, pos);
      }
    });

    this.container.querySelector('#btn-export-json')?.addEventListener('click', () => dataStore.exportLeaderboardJson());
    this.container.querySelector('#btn-export-csv')?.addEventListener('click', () => dataStore.exportLeaderboardCsv());
    this.container.querySelector('#t-export-json')?.addEventListener('click', () => dataStore.exportLeaderboardJson());
    this.container.querySelector('#t-export-csv')?.addEventListener('click', () => dataStore.exportLeaderboardCsv());

    // Login / Logout Panel Docente
    this.container.querySelector('#btn-toggle-pass')?.addEventListener('click', () => {
      const inp = this.container.querySelector('#teacher-pass-input');
      if (inp) inp.type = inp.type === 'password' ? 'text' : 'password';
    });

    this.container.querySelector('#teacher-login-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const errBox = this.container.querySelector('#teacher-login-error');
      const res = await dataStore.loginTeacher(fd.get('username'), fd.get('password'));
      if (res.ok) {
        soundFx.correct();
        this.render();
      } else {
        soundFx.wrong();
        if (errBox) {
          errBox.hidden = false;
          errBox.textContent = `⛔ ${res.error || 'Usuario o contraseña incorrectos.'}`;
        }
      }
    });

    this.container.querySelector('#btn-teacher-logout')?.addEventListener('click', () => {
      dataStore.logoutTeacher();
      soundFx.click();
      this.render();
    });

    this.container.querySelector('#t-clear-demos')?.addEventListener('click', async () => {
      const res = await dataStore.clearLeaderboard('demos');
      if (res.unauthorized) { this.render(); return; }
      this.leaderboard = res.scores || [];
      const st = this.container.querySelector('#teacher-db-status');
      if (st) st.textContent = '✅ Se eliminaron los registros de ejemplo.';
      soundFx.click();
    });

    this.container.querySelector('#t-clear-all')?.addEventListener('click', async () => {
      if (!confirm('¿Seguro que deseás vaciar toda la tabla de puntuaciones para iniciar una nueva comisión?')) return;
      const res = await dataStore.clearLeaderboard('all');
      if (res.unauthorized) { this.render(); return; }
      this.leaderboard = res.scores || [];
      const st = this.container.querySelector('#teacher-db-status');
      if (st) st.textContent = '✅ Tabla de puntuaciones reiniciada correctamente.';
      soundFx.click();
    });

    this.container.querySelector('#teacher-add-q-form')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const payload = {
        category: fd.get('category'),
        difficulty: 'Básico',
        question: fd.get('question'),
        options: [fd.get('opt0'), fd.get('opt1'), fd.get('opt2'), fd.get('opt3')],
        correct: Number(fd.get('correct')),
        hint: 'Recordá lo visto durante la capacitación.',
        explanation: fd.get('explanation') || 'Pregunta incorporada por el docente.'
      };
      const res = await dataStore.addQuestion(payload);
      if (res.unauthorized) { this.render(); return; }
      if (res.ok) {
        this.questionsData = await dataStore.getQuestions();
        e.target.reset();
        soundFx.correct();
        const st = this.container.querySelector('#teacher-q-status');
        if (st) st.textContent = `✅ ¡Pregunta guardada en data/questions.json! Total: ${this.questionsData.questions.length} preguntas.`;
      }
    });
  }
}
