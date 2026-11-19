import { dataStore } from './dataStore.js';
import { soundFx } from './soundFx.js';
import { CosmicBackdrop3D, InteractiveStudio3D } from './scene3d.js';
import { ARStudioController } from './arStudio.js';
import { PreziEngine } from './preziEngine.js';
import { PracticeLab } from './practiceLab.js';
import { QuizEngine } from './quizEngine.js';

class CapacitacionApp {
  constructor() {
    this.activeSection = 'prezi'; // 'prezi' | 'practice' | 'quiz' | 'studio3d'
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
    const bgCanvas = document.getElementById('cosmic-bg-canvas');
    if (bgCanvas) {
      this.backdrop3D = new CosmicBackdrop3D(bgCanvas);
    }

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

    // 1. Motor Espacial tipo PREZI con Zoom interactivo
    this.prezi = new PreziEngine({
      viewportEl: document.getElementById('prezi-viewport'),
      worldEl: document.getElementById('prezi-world'),
      svgEl: document.getElementById('prezi-flight-svg'),
      course: this.course,
      onNavigate: (idx, station, isOverview) => this._onPreziNavigate(idx, station, isOverview),
      onOpenSection: (sec) => this.switchSection(sec),
      onOpen3D: (modelName, autoAR) => this.openStudio3D(modelName, autoAR)
    });
    this.prezi.onZoomChange = (pct) => {
      const readout = document.getElementById('btn-zoom-reset');
      if (readout) readout.textContent = `${pct}%`;
    };
    this._buildPreziDots();

    // 2. Bloque Práctica Google Drive
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

    // 3. Bloque Evaluación, Ranking y Panel Docente con Login
    this.quizEngine = new QuizEngine({
      container: document.getElementById('quiz-container'),
      course: this.course,
      questionsData: this.questionsData,
      getPracticeSummary: () => this.practiceLab.getProgressSummary()
    });

    // 4. Bloque Simulador de Diseño 3D (CAD) & Realidad Aumentada (AR)
    this._initStudio3D();

    // 5. Navegación global, teclado y controles HUD
    this._bindGlobalControls();

    // Recalcular encuadre Prezi cuando las fuentes e imágenes estén listas
    requestAnimationFrame(() => this.prezi?._applyCamera(true));

    const loader = document.getElementById('boot-loader');
    if (loader) {
      loader.classList.add('fade-out');
      setTimeout(() => loader.remove(), 420);
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

    const cadUI = {
      toolbar: document.getElementById('cad-toolbar'),
      propPanel: document.getElementById('cad-properties-panel'),
      propControls: document.getElementById('cad-prop-controls'),
      selName: document.getElementById('cad-sel-name'),
      objCount: document.getElementById('cad-object-count'),
      colorInput: document.getElementById('cad-color-input'),
      matSelect: document.getElementById('cad-mat-select'),
      posX: document.getElementById('cad-pos-x'),
      posY: document.getElementById('cad-pos-y'),
      posZ: document.getElementById('cad-pos-z'),
      scale: document.getElementById('cad-scale'),
      rotY: document.getElementById('cad-rot-y'),
      explodeBtn: document.getElementById('btn-3d-explode'),
      autorotBtn: document.getElementById('btn-3d-autorot')
    };

    this.studio3D = new InteractiveStudio3D(
      canvas,
      (info) => {
        if (inspector.tag) inspector.tag.textContent = info.tag || 'Componente 3D';
        if (inspector.title) inspector.title.textContent = info.name || '';
        if (inspector.desc) inspector.desc.textContent = info.desc || '';
        if (inspector.card) inspector.card.style.setProperty('--accent', info.color || '#00B4F0');
      },
      (state) => {
        const isCAD = state.isDesignerMode;
        if (cadUI.toolbar) cadUI.toolbar.hidden = !isCAD;
        if (cadUI.propPanel) cadUI.propPanel.hidden = !isCAD;
        if (inspector.card) inspector.card.hidden = isCAD;
        if (cadUI.explodeBtn) cadUI.explodeBtn.hidden = isCAD;
        if (cadUI.objCount) {
          cadUI.objCount.textContent = isCAD ? `${state.count} objeto${state.count === 1 ? '' : 's'}` : 'Modelo Educativo';
        }
        if (cadUI.autorotBtn) {
          const on = Boolean(this.studio3D?.autoRotate);
          cadUI.autorotBtn.classList.toggle('active', on);
          cadUI.autorotBtn.innerHTML = on ? '🔄 Auto-Rotar: ON' : '⏸️ Auto-Rotar: OFF';
        }

        if (isCAD && state.selected) {
          if (cadUI.selName) cadUI.selName.textContent = state.selected.name;
          if (cadUI.propControls) cadUI.propControls.classList.remove('disabled-panel');
          if (cadUI.colorInput) cadUI.colorInput.value = state.selected.color;
          if (cadUI.matSelect) cadUI.matSelect.value = state.selected.materialStyle;
          if (cadUI.posX) cadUI.posX.value = state.selected.x;
          if (cadUI.posY) cadUI.posY.value = state.selected.y;
          if (cadUI.posZ) cadUI.posZ.value = state.selected.z;
          if (cadUI.scale) cadUI.scale.value = state.selected.scale;
          if (cadUI.rotY) cadUI.rotY.value = state.selected.rotY;
        } else if (isCAD) {
          if (cadUI.selName) cadUI.selName.textContent = 'Agregá o tocá un objeto 3D';
          if (cadUI.propControls) cadUI.propControls.classList.add('disabled-panel');
        }
      }
    );

    this.arCtrl = new ARStudioController(this.studio3D, {
      stage: document.getElementById('studio-3d-stage'),
      video: document.getElementById('ar-camera-video'),
      hudOverlay: document.getElementById('ar-hud-overlay'),
      btnCamera: document.getElementById('btn-ar-camera'),
      arStatus: document.getElementById('ar-status-text')
    });

    // Selector de modo / modelos 3D
    document.querySelectorAll('[data-3d-model]').forEach((btn) => {
      btn.addEventListener('click', () => {
        soundFx.whoosh();
        document.querySelectorAll('[data-3d-model]').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.studio3D.loadModel(btn.dataset['3dModel']);
        if (cadUI.explodeBtn) cadUI.explodeBtn.innerHTML = '💥 Desarmar (Vista Explotada)';
      });
    });

    // Barra CAD: Agregar Primitivas 3D
    document.querySelectorAll('[data-add-shape]').forEach((btn) => {
      btn.addEventListener('click', () => this.studio3D.addPrimitive(btn.dataset.addShape));
    });

    // Barra CAD: Plantillas rápidas
    document.querySelectorAll('[data-cad-preset]').forEach((btn) => {
      btn.addEventListener('click', () => this.studio3D.loadDesignerPreset(btn.dataset.cadPreset));
    });

    document.getElementById('btn-cad-wireframe')?.addEventListener('click', (e) => {
      const on = this.studio3D.toggleGlobalWireframe();
      e.currentTarget.classList.toggle('active', on);
    });
    document.getElementById('btn-cad-export')?.addEventListener('click', () => this.studio3D.exportDesignerJson());
    document.getElementById('btn-cad-clear')?.addEventListener('click', () => this.studio3D.clearDesignerScene());

    // Propiedades CAD en vivo
    cadUI.colorInput?.addEventListener('input', (e) => this.studio3D.updateSelectedDesigner({ color: e.target.value }));
    document.querySelectorAll('[data-swatch]').forEach((sw) => {
      sw.addEventListener('click', () => {
        soundFx.click();
        this.studio3D.updateSelectedDesigner({ color: sw.dataset.swatch });
      });
    });
    cadUI.matSelect?.addEventListener('change', (e) => this.studio3D.updateSelectedDesigner({ materialStyle: e.target.value }));
    cadUI.posX?.addEventListener('input', (e) => this.studio3D.updateSelectedDesigner({ x: Number(e.target.value) }));
    cadUI.posY?.addEventListener('input', (e) => this.studio3D.updateSelectedDesigner({ y: Number(e.target.value) }));
    cadUI.posZ?.addEventListener('input', (e) => this.studio3D.updateSelectedDesigner({ z: Number(e.target.value) }));
    cadUI.scale?.addEventListener('input', (e) => this.studio3D.updateSelectedDesigner({ scale: Number(e.target.value) }));
    cadUI.rotY?.addEventListener('input', (e) => this.studio3D.updateSelectedDesigner({ rotY: Number(e.target.value) }));

    document.getElementById('btn-cad-duplicate')?.addEventListener('click', () => this.studio3D.duplicateSelected());
    document.getElementById('btn-cad-delete')?.addEventListener('click', () => this.studio3D.deleteSelected());

    // Controles 3D & AR
    cadUI.explodeBtn?.addEventListener('click', (e) => {
      const exp = this.studio3D.toggleExplode();
      e.currentTarget.innerHTML = exp ? '🧩 Ensamblar Piezas' : '💥 Desarmar (Vista Explotada)';
    });

    cadUI.autorotBtn?.addEventListener('click', (e) => {
      const on = this.studio3D.toggleAutoRotate();
      e.currentTarget.classList.toggle('active', on);
      e.currentTarget.innerHTML = on ? '🔄 Auto-Rotar: ON' : '⏸️ Auto-Rotar: OFF';
    });

    document.getElementById('btn-3d-reset')?.addEventListener('click', () => {
      soundFx.click();
      this.studio3D.resetView();
      const slider = document.getElementById('ar-scale-slider');
      if (slider) slider.value = '1';
      if (cadUI.explodeBtn) cadUI.explodeBtn.innerHTML = '💥 Desarmar (Vista Explotada)';
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

  openStudio3D(modelName = 'designer', autoAR = false) {
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

    // Controles de Zoom en Prezi
    document.getElementById('btn-zoom-in')?.addEventListener('click', () => this.prezi.zoomIn());
    document.getElementById('btn-zoom-out')?.addEventListener('click', () => this.prezi.zoomOut());
    document.getElementById('btn-zoom-reset')?.addEventListener('click', () => this.prezi.resetZoom());

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

    // Atajos de teclado tipo Prezi (incluye + / - para zoom)
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
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        this.prezi.zoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        this.prezi.zoomOut();
      } else if (/^[0-8]$/.test(e.key)) {
        this.prezi.goTo(Number(e.key));
      }
    });
  }
}

const app = new CapacitacionApp();
window.addEventListener('DOMContentLoaded', () => app.boot());
