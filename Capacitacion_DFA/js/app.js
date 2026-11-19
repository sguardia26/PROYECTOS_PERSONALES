import { dataStore } from './dataStore.js';
import { soundFx } from './soundFx.js';
import { CosmicBackdrop3D, InteractiveStudio3D } from './scene3d.js';
import { ARStudioController } from './arStudio.js';
import { PreziEngine } from './preziEngine.js';
import { PracticeLab } from './practiceLab.js';
import { QuizEngine } from './quizEngine.js';

class CapacitacionApp {
  constructor() {
    this.activeSection = 'prezi'; // 'prezi' | 'studio3d' | 'practice' | 'quiz'
    this.course = null;
    this.questionsData = null;
    this.backdrop3D = null;
    this.prezi = null;
    this.studio3D = null;
    this.arCtrl = null;
    this.practiceLab = null;
    this.quizEngine = null;
  }

  async boot() {
    // 1. Iniciar fondo 3D cósmico
    const bgCanvas = document.getElementById('cosmic-bg-canvas');
    if (bgCanvas) {
      this.backdrop3D = new CosmicBackdrop3D(bgCanvas);
    }

    // 2. Detectar motor de base de datos NoSQL (.json) y cargar datos
    await dataStore.init();
    const dbBadge = document.getElementById('db-engine-pill');
    if (dbBadge) {
      dbBadge.textContent = `● ${dataStore.engineLabel}`;
      dbBadge.title = 'Base de datos no relacional en archivos .json';
    }

    const [course, questionsData] = await Promise.all([
      dataStore.getCourse(),
      dataStore.getQuestions()
    ]);
    this.course = course;
    this.questionsData = questionsData;

    // 3. Inicializar Motor Espacial tipo PREZI
    this.prezi = new PreziEngine({
      viewportEl: document.getElementById('prezi-viewport'),
      worldEl: document.getElementById('prezi-world'),
      svgEl: document.getElementById('prezi-flight-svg'),
      course: this.course,
      onNavigate: (idx, station, isOverview) => this._onPreziNavigate(idx, station, isOverview),
      onOpenSection: (sec) => this.switchSection(sec),
      onOpen3D: (modelName, autoAR) => this.openStudio3D(modelName, autoAR)
    });
    this._buildPreziDots();

    // 4. Inicializar Laboratorio 3D & Realidad Aumentada
    this._initStudio3D();

    // 5. Inicializar Bloque 2: Práctica Google Drive
    this.practiceLab = new PracticeLab({
      container: document.getElementById('practice-container'),
      course: this.course,
      onProgressChange: (summary) => {
        const badge = document.getElementById('nav-practice-badge');
        if (badge) badge.textContent = `${summary.percent}%`;
      },
      onGoToQuiz: () => this.switchSection('quiz')
    });
    const initProg = this.practiceLab.getProgressSummary();
    const navBadge = document.getElementById('nav-practice-badge');
    if (navBadge) navBadge.textContent = `${initProg.percent}%`;

    // 6. Inicializar Bloque 3: Evaluación & Ranking JSON
    this.quizEngine = new QuizEngine({
      container: document.getElementById('quiz-container'),
      course: this.course,
      questionsData: this.questionsData,
      getPracticeSummary: () => this.practiceLab.getProgressSummary()
    });

    // 7. Conectar navegación global, teclado y controles HUD
    this._bindGlobalControls();

    // Ocultar loader inicial suavemente
    const loader = document.getElementById('boot-loader');
    if (loader) {
      loader.classList.add('fade-out');
      setTimeout(() => loader.remove(), 450);
    }
  }

  _buildPreziDots() {
    const dotsWrap = document.getElementById('prezi-dots');
    if (!dotsWrap) return;
    dotsWrap.innerHTML = '';
    this.course.stations.forEach((st, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `prezi-dot ${idx === 0 ? 'active' : ''}`;
      btn.dataset.idx = idx;
      btn.title = `${idx}. ${st.title}`;
      btn.innerHTML = `<span>${idx}</span>`;
      btn.addEventListener('click', () => this.prezi.goTo(idx));
      dotsWrap.appendChild(btn);
    });
  }

  _onPreziNavigate(idx, station, isOverview) {
    document.querySelectorAll('.prezi-dot').forEach((d, i) => {
      d.classList.toggle('active', !isOverview && i === idx);
    });
    const label = document.getElementById('prezi-current-label');
    if (label) {
      label.textContent = isOverview
        ? '🗺️ Vista Panorámica — Hacé clic en cualquier estación para volar hacia ella'
        : `${station.badge} · ${station.title}`;
    }
    const ovBtn = document.getElementById('btn-prezi-overview');
    if (ovBtn) {
      ovBtn.classList.toggle('active', isOverview);
      ovBtn.innerHTML = isOverview ? '🎯 Enfocar Estación' : '🗺️ Mapa General';
    }

    // Sincronizar paralaje del fondo 3D con la posición de la estación
    if (this.backdrop3D && station && station.canvas) {
      const nx = isOverview ? 0 : station.canvas.x / 1200;
      const ny = isOverview ? 0 : station.canvas.y / 900;
      this.backdrop3D.setParallaxTarget(nx, ny);
    }
  }

  _initStudio3D() {
    const canvas = document.getElementById('three-studio-canvas');
    if (!canvas) return;

    const inspector = {
      tag: document.getElementById('inspector-tag'),
      title: document.getElementById('inspector-title'),
      desc: document.getElementById('inspector-desc'),
      card: document.getElementById('inspector-card')
    };

    this.studio3D = new InteractiveStudio3D(canvas, (info) => {
      if (inspector.tag) inspector.tag.textContent = info.tag || 'Componente 3D';
      if (inspector.title) inspector.title.textContent = info.name || '';
      if (inspector.desc) inspector.desc.textContent = info.desc || '';
      if (inspector.card) inspector.card.style.setProperty('--accent', info.color || '#00B4F0');
    });

    this.arCtrl = new ARStudioController(this.studio3D, {
      stage: document.getElementById('studio-3d-stage'),
      video: document.getElementById('ar-camera-video'),
      hudOverlay: document.getElementById('ar-hud-overlay'),
      btnCamera: document.getElementById('btn-ar-camera'),
      arStatus: document.getElementById('ar-status-text')
    });

    // Selector de modelos 3D
    document.querySelectorAll('[data-3d-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        soundFx.whoosh();
        document.querySelectorAll('[data-3d-model]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.studio3D.loadModel(btn.dataset['3dModel']);
        const expBtn = document.getElementById('btn-3d-explode');
        if (expBtn) expBtn.innerHTML = '💥 Desarmar (Vista Explotada)';
      });
    });

    document.getElementById('btn-3d-explode')?.addEventListener('click', (e) => {
      const exp = this.studio3D.toggleExplode();
      e.currentTarget.innerHTML = exp ? '🧩 Ensamblar Piezas' : '💥 Desarmar (Vista Explotada)';
    });

    document.getElementById('btn-3d-autorot')?.addEventListener('click', (e) => {
      const on = this.studio3D.toggleAutoRotate();
      e.currentTarget.classList.toggle('active', on);
      e.currentTarget.innerHTML = on ? '🔄 Auto-Rotar: ON' : '⏸️ Auto-Rotar: OFF';
    });

    document.getElementById('btn-3d-reset')?.addEventListener('click', () => {
      soundFx.click();
      this.studio3D.resetView();
      const slider = document.getElementById('ar-scale-slider');
      if (slider) slider.value = '1';
      const expBtn = document.getElementById('btn-3d-explode');
      if (expBtn) expBtn.innerHTML = '💥 Desarmar (Vista Explotada)';
    });

    document.getElementById('ar-scale-slider')?.addEventListener('input', (e) => {
      this.studio3D.setScale(Number(e.target.value));
    });

    document.getElementById('btn-ar-camera')?.addEventListener('click', () => this.arCtrl.toggleCameraAR());
    document.getElementById('btn-ar-sim')?.addEventListener('click', () => {
      if (this.arCtrl.simulatedAR) {
        this.arCtrl.stopAR();
      } else {
        this.arCtrl.activateSimulatedAR('Modo AR Simulado · Escritorio Holográfico del Aula DFA');
      }
    });
    document.getElementById('btn-ar-photo')?.addEventListener('click', () => this.arCtrl.captureSnapshot());

    window.addEventListener('resize', () => {
      if (this.activeSection === 'studio3d') this.studio3D.resize();
    });
  }

  openStudio3D(modelName = 'hardware', autoAR = false) {
    this.switchSection('studio3d');
    document.querySelectorAll('[data-3d-model]').forEach((b) => {
      b.classList.toggle('active', b.dataset['3dModel'] === modelName);
    });
    this.studio3D?.loadModel(modelName);
    if (autoAR && this.arCtrl) {
      setTimeout(() => this.arCtrl.toggleCameraAR(), 220);
    }
  }

  switchSection(sectionName) {
    if (this.activeSection === 'studio3d' && sectionName !== 'studio3d') {
      this.arCtrl?.stopAR(true);
    }
    this.activeSection = sectionName;
    soundFx.click();

    document.querySelectorAll('.main-section').forEach((sec) => {
      sec.classList.toggle('active', sec.id === `section-${sectionName}`);
    });
    document.querySelectorAll('.nav-pill').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.section === sectionName);
    });

    if (sectionName === 'studio3d') {
      requestAnimationFrame(() => this.studio3D?.resize());
    } else if (sectionName === 'prezi') {
      requestAnimationFrame(() => this.prezi?._applyCamera(true));
    } else if (sectionName === 'quiz') {
      this.quizEngine?.refreshLeaderboard().then(() => this.quizEngine.render());
    }
  }

  _bindGlobalControls() {
    document.querySelectorAll('.nav-pill').forEach((btn) => {
      btn.addEventListener('click', () => this.switchSection(btn.dataset.section));
    });

    document.getElementById('btn-prezi-prev')?.addEventListener('click', () => this.prezi.prev());
    document.getElementById('btn-prezi-next')?.addEventListener('click', () => this.prezi.next());
    document.getElementById('btn-prezi-overview')?.addEventListener('click', () => this.prezi.toggleOverview());

    document.getElementById('btn-sound-toggle')?.addEventListener('click', (e) => {
      const enabled = soundFx.toggle();
      e.currentTarget.textContent = enabled ? '🔊' : '🔇';
      e.currentTarget.title = enabled ? 'Silenciar efectos' : 'Activar efectos de sonido';
    });

    document.getElementById('btn-fullscreen-toggle')?.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

    // Atajos de teclado tipo Prezi
    window.addEventListener('keydown', (e) => {
      if (this.activeSection !== 'prezi') return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        this.prezi.next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.prezi.prev();
      } else if (e.key === 'Escape' || e.key.toLowerCase() === 'o') {
        this.prezi.toggleOverview();
      } else if (/^[0-8]$/.test(e.key)) {
        this.prezi.goTo(Number(e.key));
      }
    });
  }
}

const app = new CapacitacionApp();
window.addEventListener('DOMContentLoaded', () => app.boot());
