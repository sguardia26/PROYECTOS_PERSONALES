const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_VERCEL = Boolean(process.env.VERCEL);

const PUBLIC_DIR = path.join(__dirname, 'public');
const SEED_DATA_DIR = path.join(__dirname, 'data');
const WRITABLE_DATA_DIR = IS_VERCEL
  ? path.join(os.tmpdir(), 'capacitacion_dfa_data')
  : SEED_DATA_DIR;

app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC_DIR, { extensions: ['html'] }));

// Asegurar directorio editable (en Vercel usa /tmp sembrado desde data/*.json)
function ensureWritableFile(filename) {
  if (!fs.existsSync(WRITABLE_DATA_DIR)) {
    fs.mkdirSync(WRITABLE_DATA_DIR, { recursive: true });
  }
  const targetPath = path.join(WRITABLE_DATA_DIR, filename);
  if (IS_VERCEL && !fs.existsSync(targetPath)) {
    const seedPath = path.join(SEED_DATA_DIR, filename);
    if (fs.existsSync(seedPath)) {
      fs.copyFileSync(seedPath, targetPath);
    }
  }
  return targetPath;
}

// Leer archivo JSON NoSQL de forma segura
function readJson(filename, fallback) {
  try {
    const writablePath = ensureWritableFile(filename);
    if (fs.existsSync(writablePath)) {
      return JSON.parse(fs.readFileSync(writablePath, 'utf8'));
    }
    const seedPath = path.join(SEED_DATA_DIR, filename);
    if (fs.existsSync(seedPath)) {
      return JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    }
    return fallback;
  } catch (err) {
    console.error(`[DB] Error leyendo ${filename}:`, err.message);
    return fallback;
  }
}

// Escribir archivo JSON NoSQL de forma atómica
function writeJson(filename, data) {
  const filePath = ensureWritableFile(filename);
  const tmpPath = `${filePath}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function sanitizeText(str, maxLen = 80) {
  return String(str || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

function sortScores(scores = []) {
  return [...scores].sort((a, b) => {
    if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
    if ((b.accuracy || 0) !== (a.accuracy || 0)) return (b.accuracy || 0) - (a.accuracy || 0);
    return (a.durationSec || 9999) - (b.durationSec || 9999);
  });
}

// Health check
app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    ok: true,
    engine: IS_VERCEL ? 'vercel-express-json' : 'node-express-json',
    environment: IS_VERCEL ? 'vercel' : 'local',
    ephemeral: IS_VERCEL,
    storage: IS_VERCEL ? 'Vercel NoSQL JSON + Respaldo Local' : 'NoSQL JSON (data/*.json)',
    timestamp: new Date().toISOString()
  });
});

// Course data
app.get('/api/course', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const data = readJson('course.json', { meta: {}, stations: [], practiceMissions: [] });
  res.json(data);
});

// Questions
app.get('/api/questions', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const data = readJson('questions.json', { quizConfig: {}, questions: [] });
  res.json(data);
});

app.post('/api/questions', (req, res) => {
  const { category, difficulty, question, options, correct, hint, explanation } = req.body || {};
  if (!question || !Array.isArray(options) || options.length !== 4 || typeof correct !== 'number') {
    return res.status(400).json({ ok: false, error: 'Datos de pregunta incompletos.' });
  }
  const db = readJson('questions.json', { version: '1.0.0', quizConfig: {}, questions: [] });
  const newQuestion = {
    id: `q-${Date.now()}`,
    category: sanitizeText(category || 'General', 40),
    difficulty: sanitizeText(difficulty || 'Básico', 20),
    question: sanitizeText(question, 260),
    options: options.map((o) => sanitizeText(o, 140)),
    correct: Math.max(0, Math.min(3, Math.floor(correct))),
    hint: sanitizeText(hint || 'Revisá los conceptos de la presentación.', 180),
    explanation: sanitizeText(explanation || 'Respuesta validada por el docente.', 260)
  };
  db.questions.push(newQuestion);
  writeJson('questions.json', db);
  res.status(201).json({ ok: true, question: newQuestion, total: db.questions.length });
});

// Leaderboard (NoSQL JSON)
app.get('/api/leaderboard', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const db = readJson('leaderboard.json', { version: '1.0.0', updatedAt: null, scores: [] });
  res.json({ ok: true, updatedAt: db.updatedAt, scores: sortScores(db.scores || []) });
});

app.post('/api/leaderboard', (req, res) => {
  const body = req.body || {};
  const name = sanitizeText(body.name, 60);
  if (!name) {
    return res.status(400).json({ ok: false, error: 'El nombre del participante es obligatorio.' });
  }

  const db = readJson('leaderboard.json', { version: '1.0.0', updatedAt: null, scores: [] });
  const entry = {
    id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    section: sanitizeText(body.section || 'Sede Chilecito', 50),
    avatar: sanitizeText(body.avatar || '🎓', 8),
    score: Math.max(0, Number(body.score) || 0),
    correct: Math.max(0, Number(body.correct) || 0),
    total: Math.max(1, Number(body.total) || 1),
    accuracy: Math.max(0, Math.min(100, Number(body.accuracy) || 0)),
    bestStreak: Math.max(0, Number(body.bestStreak) || 0),
    durationSec: Math.max(1, Number(body.durationSec) || 1),
    practiceBonus: Math.max(0, Number(body.practiceBonus) || 0),
    date: new Date().toISOString(),
    isDemo: false
  };

  db.scores = db.scores || [];
  db.scores.push(entry);
  db.updatedAt = new Date().toISOString();
  writeJson('leaderboard.json', db);

  const sorted = sortScores(db.scores);
  const rank = sorted.findIndex((s) => s.id === entry.id) + 1;

  res.status(201).json({ ok: true, entry, rank, scores: sorted });
});

app.delete('/api/leaderboard', (req, res) => {
  const mode = req.query.mode || 'all';
  const db = readJson('leaderboard.json', { version: '1.0.0', updatedAt: null, scores: [] });
  if (mode === 'demos') {
    db.scores = (db.scores || []).filter((s) => !s.isDemo);
  } else {
    db.scores = [];
  }
  db.updatedAt = new Date().toISOString();
  writeJson('leaderboard.json', db);
  res.json({ ok: true, scores: db.scores });
});

// Practice Progress
app.get('/api/progress', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const db = readJson('progress.json', { version: '1.0.0', updatedAt: null, sessions: [] });
  res.json({ ok: true, ...db });
});

app.post('/api/progress', (req, res) => {
  const body = req.body || {};
  const participant = sanitizeText(body.participant || 'Anónimo', 60);
  const completedSteps = Array.isArray(body.completedSteps) ? body.completedSteps.slice(0, 100) : [];
  const practicePoints = Math.max(0, Number(body.practicePoints) || 0);

  const db = readJson('progress.json', { version: '1.0.0', updatedAt: null, sessions: [] });
  db.sessions = db.sessions || [];

  const existingIdx = db.sessions.findIndex(
    (s) => s.participant.toLowerCase() === participant.toLowerCase()
  );
  const record = {
    participant,
    completedSteps,
    practicePoints,
    updatedAt: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    db.sessions[existingIdx] = record;
  } else {
    db.sessions.push(record);
  }
  db.updatedAt = new Date().toISOString();
  writeJson('progress.json', db);

  res.json({ ok: true, record });
});

// Ruta raíz explícita (garantiza que "/" sirva public/index.html tanto local como en Vercel)
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

if (!IS_VERCEL && require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🚀 Plataforma Capacitación DFA activa en http://localhost:${PORT}`);
    console.log(`📁 Base de datos NoSQL JSON en: ${WRITABLE_DATA_DIR}\n`);
  });
}

module.exports = app;
