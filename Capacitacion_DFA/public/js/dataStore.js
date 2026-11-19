// Capa de persistencia híbrida para Base de Datos No Relacional (.json)
// Soporta automáticamente: Node.js / Vercel Express (/api/*), MAMP PHP (../api/db.php) y Modo Estático
// Incluye autenticación docente con sesión temporal (sessionStorage) y header X-Teacher-Token.

const LS_SCORES_KEY = 'dfa_capacitacion_scores_v1';
const LS_PROGRESS_KEY = 'dfa_capacitacion_progress_v1';
const LS_QUESTIONS_KEY = 'dfa_capacitacion_extra_questions_v1';
const SS_TEACHER_TOKEN = 'dfa_teacher_token_v1';
const SS_TEACHER_NAME = 'dfa_teacher_name_v1';

class DataStore {
  constructor() {
    this.mode = 'static'; // 'node' | 'php' | 'static'
    this.ephemeral = false;
    this.phpBase = '../api/db.php';
    this.engineLabel = 'JSON Local (Navegador)';
  }

  async init() {
    try {
      const res = await fetch('/api/health', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok) {
          this.mode = 'node';
          this.ephemeral = Boolean(data.ephemeral);
          this.engineLabel = data.ephemeral
            ? 'Vercel + NoSQL JSON (Cloud + Local)'
            : 'Node.js + NoSQL JSON (data/*.json)';
          return this.mode;
        }
      }
    } catch (_) {}

    for (const candidate of ['../api/db.php', 'api/db.php']) {
      try {
        const res = await fetch(`${candidate}?resource=health`, { cache: 'no-store' });
        if (res.ok) {
          const data = await res.json();
          if (data && data.ok) {
            this.mode = 'php';
            this.phpBase = candidate;
            this.engineLabel = 'MAMP PHP + NoSQL JSON (data/*.json)';
            return this.mode;
          }
        }
      } catch (_) {}
    }

    this.mode = 'static';
    this.engineLabel = 'JSON Estático + Persistencia Local';
    return this.mode;
  }

  _endpoint(resource, query = '') {
    if (this.mode === 'node') {
      return `/api/${resource}${query ? '?' + query : ''}`;
    }
    if (this.mode === 'php') {
      return `${this.phpBase}?resource=${resource}${query ? '&' + query : ''}`;
    }
    return `../data/${resource}.json`;
  }

  // ---- Autenticación Docente ----
  getTeacherToken() {
    return sessionStorage.getItem(SS_TEACHER_TOKEN) || '';
  }

  getTeacherName() {
    return sessionStorage.getItem(SS_TEACHER_NAME) || 'Tec. Sup. Guardia, Sebastián Nicolás';
  }

  isTeacherAuthenticated() {
    return Boolean(this.getTeacherToken());
  }

  logoutTeacher() {
    sessionStorage.removeItem(SS_TEACHER_TOKEN);
    sessionStorage.removeItem(SS_TEACHER_NAME);
  }

  async loginTeacher(username, password) {
    const userNorm = String(username || '').trim().toLowerCase();
    const passStr = String(password || '');

    if (this.mode === 'node') {
      const res = await fetch('/api/teacher/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userNorm, password: passStr })
      });
      const json = await res.json();
      if (res.ok && json.ok && json.token) {
        sessionStorage.setItem(SS_TEACHER_TOKEN, json.token);
        sessionStorage.setItem(SS_TEACHER_NAME, json.teacher || 'Docente Capacitador');
        return { ok: true, teacher: json.teacher };
      }
      return { ok: false, error: json.error || 'Credenciales inválidas.' };
    }

    if (this.mode === 'php') {
      const res = await fetch(`${this.phpBase}?resource=teacher_login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userNorm, password: passStr })
      });
      const json = await res.json();
      if (res.ok && json.ok && json.token) {
        sessionStorage.setItem(SS_TEACHER_TOKEN, json.token);
        sessionStorage.setItem(SS_TEACHER_NAME, json.teacher || 'Docente Capacitador');
        return { ok: true, teacher: json.teacher };
      }
      return { ok: false, error: json.error || 'Credenciales inválidas.' };
    }

    // Fallback modo estático puro
    if (userNorm === 'sguardia' && passStr === 'DFA2026!') {
      sessionStorage.setItem(SS_TEACHER_TOKEN, 'static-teacher-ok');
      sessionStorage.setItem(SS_TEACHER_NAME, 'Tec. Sup. Guardia, Sebastián Nicolás');
      return { ok: true, teacher: 'Tec. Sup. Guardia, Sebastián Nicolás' };
    }
    return { ok: false, error: 'Usuario o contraseña incorrectos. Acceso exclusivo para el capacitador.' };
  }

  _authHeaders(extra = {}) {
    const headers = { ...extra };
    const token = this.getTeacherToken();
    if (token) headers['X-Teacher-Token'] = token;
    return headers;
  }

  _sortScores(scores) {
    return [...scores].sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      if ((b.accuracy || 0) !== (a.accuracy || 0)) return (b.accuracy || 0) - (a.accuracy || 0);
      return (a.durationSec || 9999) - (b.durationSec || 9999);
    });
  }

  _mergeUniqueScores(primary = [], secondary = []) {
    const map = new Map();
    [...primary, ...secondary].forEach((s) => {
      const key = s.id || `${s.name}-${s.score}-${s.date}`;
      if (!map.has(key)) map.set(key, s);
    });
    return this._sortScores([...map.values()]);
  }

  async getCourse() {
    const res = await fetch(this._endpoint('course'), { cache: 'no-store' });
    return await res.json();
  }

  async getQuestions() {
    const res = await fetch(this._endpoint('questions'), { cache: 'no-store' });
    const data = await res.json();
    if (this.mode === 'static' || this.ephemeral) {
      const extra = JSON.parse(localStorage.getItem(LS_QUESTIONS_KEY) || '[]');
      const existingIds = new Set((data.questions || []).map((q) => q.id));
      data.questions = [...(data.questions || []), ...extra.filter((q) => !existingIds.has(q.id))];
    }
    return data;
  }

  async addQuestion(payload) {
    if (this.mode === 'node' || this.mode === 'php') {
      const res = await fetch(this._endpoint('questions'), {
        method: 'POST',
        headers: this._authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (res.status === 401) {
        this.logoutTeacher();
        return { ok: false, unauthorized: true, error: json.error };
      }
      if (this.ephemeral && json.ok && json.question) {
        const extra = JSON.parse(localStorage.getItem(LS_QUESTIONS_KEY) || '[]');
        extra.push(json.question);
        localStorage.setItem(LS_QUESTIONS_KEY, JSON.stringify(extra));
      }
      return json;
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
      const serverScores = data.scores || [];
      if (this.ephemeral) {
        const localSaved = JSON.parse(localStorage.getItem(LS_SCORES_KEY) || '[]');
        return this._mergeUniqueScores(serverScores, localSaved);
      }
      return this._sortScores(serverScores);
    }

    let baseScores = [];
    try {
      const res = await fetch(this._endpoint('leaderboard'), { cache: 'no-store' });
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
      const json = await res.json();
      if (this.ephemeral && json.ok && json.entry) {
        const localSaved = JSON.parse(localStorage.getItem(LS_SCORES_KEY) || '[]');
        const merged = this._mergeUniqueScores(json.scores || [], [...localSaved, json.entry]);
        localStorage.setItem(LS_SCORES_KEY, JSON.stringify(merged.filter((s) => !s.isDemo)));
        const rank = merged.findIndex((s) => s.id === json.entry.id) + 1;
        return { ...json, rank, scores: merged };
      }
      return json;
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
        method: 'DELETE',
        headers: this._authHeaders()
      });
      const json = await res.json();
      if (res.status === 401) {
        this.logoutTeacher();
        return { ok: false, unauthorized: true, error: json.error };
      }
      if (this.ephemeral && mode === 'all') {
        localStorage.removeItem(LS_SCORES_KEY);
      }
      return json;
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
