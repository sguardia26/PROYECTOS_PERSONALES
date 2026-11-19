const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

// Helper: read JSON file safely
function readJson(filename, fallback) {
  const filePath = path.join(DATA_DIR, filename);
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[DB] Error leyendo ${filename}:`, err.message);
    return fallback;
  }
}

// Helper: write JSON file atomically
function writeJson(filename, data) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const filePath = path.join(DATA_DIR, filename);
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function sanitizeText(str, maxLen = 80) {
  return String(str || '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen);
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    engine: 'node-express-json',
    storage: 'NoSQL JSON (data/*.json)',
    timestamp: new Date().toISOString()
  });
});

// Course data
app.get('/api/course', (req, res) => {
  const data = readJson('course.json', { meta: {}, stations: [], practiceMissions: [] });
  res.json(data);
});

// Questions
app.get('/api/questions', (req, res) => {
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
  const db = readJson('leaderboard.json', { version: '1.0.0', updatedAt: null, scores: [] });
  const sorted = [...(db.scores || [])].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return (a.durationSec || 9999) - (b.durationSec || 9999);
  });
  res.json({ ok: true, updatedAt: db.updatedAt, scores: sorted });
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

  const sorted = [...db.scores].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    return (a.durationSec || 9999) - (b.durationSec || 9999);
  });
  const rank = sorted.findIndex((s) => s.id === entry.id) + 1;

  res.status(201).json({ ok: true, entry, rank, scores: sorted });
});

app.delete('/api/leaderboard', (req, res) => {
  const mode = req.query.mode || 'all'; // 'all' | 'demos'
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

app.listen(PORT, () => {
  console.log(`\n🚀 Plataforma Capacitación DFA activa en http://localhost:${PORT}`);
  console.log(`📁 Base de datos NoSQL JSON en: ${DATA_DIR}\n`);
});
