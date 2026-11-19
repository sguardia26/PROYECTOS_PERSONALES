// Capa de persistencia híbrida para Base de Datos No Relacional (.json)
// Soporta automáticamente: Node.js (/api/*), MAMP PHP (api/db.php) y Modo Estático (data/*.json + localStorage)

const LS_SCORES_KEY = 'dfa_capacitacion_scores_v1';
const LS_PROGRESS_KEY = 'dfa_capacitacion_progress_v1';
const LS_QUESTIONS_KEY = 'dfa_capacitacion_extra_questions_v1';

class DataStore {
  constructor() {
    this.mode = 'static'; // 'node' | 'php' | 'static'
    this.engineLabel = 'JSON Local (Navegador)';
  }

  async init() {
    // 1. Probar Node.js Express API
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          this.mode = 'node';
          this.engineLabel = 'Node.js + NoSQL JSON (data/*.json)';
          return this.mode;
        }
      }
    } catch (_) {}

    // 2. Probar MAMP / Apache PHP API
    try {
      const res = await fetch('api/db.php?resource=health', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          this.mode = 'php';
          this.engineLabel = 'MAMP PHP + NoSQL JSON (data/*.json)';
          return this.mode;
        }
      }
    } catch (_) {}

    // 3. Fallback estático (Vercel / GitHub Pages)
    this.mode = 'static';
    this.engineLabel = 'JSON Estático + Persistencia Local';
    return this.mode;
  }

  _endpoint(resource, query = '') {
    if (this.mode === 'node') {
      return `/api/${resource}${query ? '?' + query : ''}`;
    }
    if (this.mode === 'php') {
      return `api/db.php?resource=${resource}${query ? '&' + query : ''}`;
    }
    return `data/${resource}.json`;
  }

  _sortScores(scores) {
    return [...scores].sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      if ((b.accuracy || 0) !== (a.accuracy || 0)) return (b.accuracy || 0) - (a.accuracy || 0);
      return (a.durationSec || 9999) - (b.durationSec || 9999);
    });
  }

  async getCourse() {
    const res = await fetch(this._endpoint('course'), { cache: 'no-store' });
    return await res.json();
  }

  async getQuestions() {
    const res = await fetch(this._endpoint('questions'), { cache: 'no-store' });
    const data = await res.json();
    if (this.mode === 'static') {
      const extra = JSON.parse(localStorage.getItem(LS_QUESTIONS_KEY) || '[]');
      data.questions = [...(data.questions || []), ...extra];
    }
    return data;
  }

  async addQuestion(payload) {
    if (this.mode === 'node' || this.mode === 'php') {
      const res = await fetch(this._endpoint('questions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    }
    const extra = JSON.parse(localStorage.getItem(LS_QUESTIONS_KEY) || '[]');
    const newQ = { id: `q-local-${Date.now()}`, ...payload };
    extra.push(newQ);
    localStorage.setItem(LS_QUESTIONS_KEY, JSON.stringify(extra));
    return { ok: true, question: newQ };
  }

  async getLeaderboard() {
    if (this.mode === 'node' || this.mode === 'php') {
      const res = await fetch(this._endpoint('leaderboard'), { cache: 'no-store' });
      const data = await res.json();
      return this._sortScores(data.scores || []);
    }
    // Static mode: seed from data/leaderboard.json + merge local scores
    let baseScores = [];
    try {
      const res = await fetch('data/leaderboard.json', { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        baseScores = json.scores || [];
      }
    } catch (_) {}
    const saved = localStorage.getItem(LS_SCORES_KEY);
    if (saved) {
      return this._sortScores(JSON.parse(saved));
    }
    localStorage.setItem(LS_SCORES_KEY, JSON.stringify(baseScores));
    return this._sortScores(baseScores);
  }

  async submitScore(payload) {
    if (this.mode === 'node' || this.mode === 'php') {
      const res = await fetch(this._endpoint('leaderboard'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return await res.json();
    }
    const current = await this.getLeaderboard();
    const entry = {
      id: `sc-${Date.now()}`,
      ...payload,
      date: new Date().toISOString(),
      isDemo: false
    };
    const next = this._sortScores([...current, entry]);
    localStorage.setItem(LS_SCORES_KEY, JSON.stringify(next));
    const rank = next.findIndex((s) => s.id === entry.id) + 1;
    return { ok: true, entry, rank, scores: next };
  }

  async clearLeaderboard(mode = 'all') {
    if (this.mode === 'node' || this.mode === 'php') {
      const res = await fetch(this._endpoint('leaderboard', `mode=${mode}`), {
        method: 'DELETE'
      });
      return await res.json();
    }
    const current = await this.getLeaderboard();
    const next = mode === 'demos' ? current.filter((s) => !s.isDemo) : [];
    localStorage.setItem(LS_SCORES_KEY, JSON.stringify(next));
    return { ok: true, scores: next };
  }

  loadLocalProgress() {
    try {
      return JSON.parse(localStorage.getItem(LS_PROGRESS_KEY) || '{"participant":"","completedSteps":[],"practicePoints":0}');
    } catch (_) {
      return { participant: '', completedSteps: [], practicePoints: 0 };
    }
  }

  async saveProgress(progressObj) {
    localStorage.setItem(LS_PROGRESS_KEY, JSON.stringify(progressObj));
    if (this.mode === 'node' || this.mode === 'php') {
      try {
        await fetch(this._endpoint('progress'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(progressObj)
        });
      } catch (_) {}
    }
  }

  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async exportLeaderboardJson() {
    const scores = await this.getLeaderboard();
    const payload = {
      exportedAt: new Date().toISOString(),
      institution: 'Departamento Formación de Agentes «Gral. Ángel Vicente Peñaloza»',
      instructor: 'Tec. Sup. Guardia, Sebastián Nicolás',
      totalRecords: scores.length,
      scores
    };
    this.downloadFile('ranking_capacitacion_dfa.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  async exportLeaderboardCsv() {
    const scores = await this.getLeaderboard();
    const headers = ['Puesto', 'Nombre', 'Comision', 'Puntaje_Total', 'Aciertos', 'Preguntas', 'Precision_%', 'Mejor_Racha', 'Bonus_Practica', 'Tiempo_Seg', 'Fecha'];
    const rows = scores.map((s, idx) => [
      idx + 1,
      `"${(s.name || '').replace(/"/g, '""')}"`,
      `"${(s.section || '').replace(/"/g, '""')}"`,
      s.score || 0,
      s.correct || 0,
      s.total || 0,
      s.accuracy || 0,
      s.bestStreak || 0,
      s.practiceBonus || 0,
      s.durationSec || 0,
      s.date || ''
    ].join(','));
    const csv = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    this.downloadFile('ranking_capacitacion_dfa.csv', csv, 'text/csv;charset=utf-8');
  }
}

export const dataStore = new DataStore();
