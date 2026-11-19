<?php
/**
 * API JSON NoSQL compatible con MAMP / Apache + PHP 7.4/8.x
 * Incluye autenticación docente para proteger el Panel Docente.
 */
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Teacher-Token');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

$TEACHER_USER = strtolower(trim(getenv('TEACHER_USER') ?: 'sguardia'));
$TEACHER_PASS = getenv('TEACHER_PASS') ?: 'DFA2026!';
$AUTH_SALT = getenv('TEACHER_SALT') ?: 'dfa-chilecito-guardia-2026';
$EXPECTED_TOKEN = hash('sha256', "$TEACHER_USER:$TEACHER_PASS:$AUTH_SALT");

function requireTeacher($expected) {
    $token = $_SERVER['HTTP_X_TEACHER_TOKEN'] ?? '';
    if (!$token || !hash_equals($expected, $token)) {
        http_response_code(401);
        echo json_encode(['ok' => false, 'error' => 'Acceso restringido. Iniciá sesión con credenciales de docente.'], JSON_UNESCAPED_UNICODE);
        exit;
    }
}

$dataDir = dirname(__DIR__) . DIRECTORY_SEPARATOR . 'data';
$resource = $_GET['resource'] ?? 'health';
$method = $_SERVER['REQUEST_METHOD'];

function readJsonFile($path, $fallback) {
    if (!file_exists($path)) return $fallback;
    $raw = file_get_contents($path);
    $decoded = json_decode($raw, true);
    return is_array($decoded) ? $decoded : $fallback;
}

function writeJsonFile($path, $data) {
    $dir = dirname($path);
    if (!is_dir($dir)) mkdir($dir, 0775, true);
    $json = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    file_put_contents($path, $json, LOCK_EX);
}

function cleanStr($val, $max = 80) {
    $s = trim(str_replace(['<', '>'], '', (string)$val));
    return function_exists('mb_substr') ? mb_substr($s, 0, $max) : substr($s, 0, $max);
}

function sortScores($scores) {
    usort($scores, function ($a, $b) {
        if (($b['score'] ?? 0) !== ($a['score'] ?? 0)) return ($b['score'] ?? 0) <=> ($a['score'] ?? 0);
        if (($b['accuracy'] ?? 0) !== ($a['accuracy'] ?? 0)) return ($b['accuracy'] ?? 0) <=> ($a['accuracy'] ?? 0);
        return ($a['durationSec'] ?? 9999) <=> ($b['durationSec'] ?? 9999);
    });
    return array_values($scores);
}

$input = json_decode(file_get_contents('php://input'), true) ?: [];

switch ($resource) {
    case 'health':
        echo json_encode([
            'ok' => true,
            'engine' => 'php-mamp-json',
            'storage' => 'NoSQL JSON (data/*.json)',
            'timestamp' => gmdate('c')
        ]);
        break;

    case 'teacher_login':
        $u = strtolower(trim((string)($input['username'] ?? '')));
        $p = (string)($input['password'] ?? '');
        if ($u === $TEACHER_USER && $p === $TEACHER_PASS) {
            echo json_encode([
                'ok' => true,
                'token' => $EXPECTED_TOKEN,
                'teacher' => 'Tec. Sup. Guardia, Sebastián Nicolás'
            ], JSON_UNESCAPED_UNICODE);
        } else {
            http_response_code(401);
            echo json_encode([
                'ok' => false,
                'error' => 'Usuario o contraseña incorrectos. Acceso exclusivo para el capacitador.'
            ], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'course':
        echo json_encode(readJsonFile("$dataDir/course.json", ['meta' => [], 'stations' => [], 'practiceMissions' => []]), JSON_UNESCAPED_UNICODE);
        break;

    case 'questions':
        $path = "$dataDir/questions.json";
        if ($method === 'POST') {
            requireTeacher($EXPECTED_TOKEN);
            if (empty($input['question']) || empty($input['options']) || count($input['options']) !== 4) {
                http_response_code(400);
                echo json_encode(['ok' => false, 'error' => 'Datos de pregunta incompletos.']);
                break;
            }
            $db = readJsonFile($path, ['version' => '1.0.0', 'quizConfig' => [], 'questions' => []]);
            $newQ = [
                'id' => 'q-' . time(),
                'category' => cleanStr($input['category'] ?? 'General', 40),
                'difficulty' => cleanStr($input['difficulty'] ?? 'Básico', 20),
                'question' => cleanStr($input['question'], 260),
                'options' => array_map(fn($o) => cleanStr($o, 140), $input['options']),
                'correct' => max(0, min(3, intval($input['correct'] ?? 0))),
                'hint' => cleanStr($input['hint'] ?? 'Revisá los conceptos de la presentación.', 180),
                'explanation' => cleanStr($input['explanation'] ?? 'Respuesta validada por el docente.', 260)
            ];
            $db['questions'][] = $newQ;
            writeJsonFile($path, $db);
            http_response_code(201);
            echo json_encode(['ok' => true, 'question' => $newQ, 'total' => count($db['questions'])], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(readJsonFile($path, ['quizConfig' => [], 'questions' => []]), JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'leaderboard':
        $path = "$dataDir/leaderboard.json";
        if ($method === 'POST') {
            $name = cleanStr($input['name'] ?? '', 60);
            if ($name === '') {
                http_response_code(400);
                echo json_encode(['ok' => false, 'error' => 'El nombre es obligatorio.']);
                break;
            }
            $db = readJsonFile($path, ['version' => '1.0.0', 'updatedAt' => null, 'scores' => []]);
            $entry = [
                'id' => 'sc-' . time() . '-' . substr(md5(uniqid('', true)), 0, 5),
                'name' => $name,
                'section' => cleanStr($input['section'] ?? 'Sede Chilecito', 50),
                'avatar' => cleanStr($input['avatar'] ?? '🎓', 8),
                'score' => max(0, intval($input['score'] ?? 0)),
                'correct' => max(0, intval($input['correct'] ?? 0)),
                'total' => max(1, intval($input['total'] ?? 1)),
                'accuracy' => max(0, min(100, intval($input['accuracy'] ?? 0))),
                'bestStreak' => max(0, intval($input['bestStreak'] ?? 0)),
                'durationSec' => max(1, intval($input['durationSec'] ?? 1)),
                'practiceBonus' => max(0, intval($input['practiceBonus'] ?? 0)),
                'date' => gmdate('c'),
                'isDemo' => false
            ];
            $db['scores'][] = $entry;
            $db['updatedAt'] = gmdate('c');
            writeJsonFile($path, $db);
            $sorted = sortScores($db['scores']);
            $rank = 1;
            foreach ($sorted as $idx => $s) {
                if ($s['id'] === $entry['id']) { $rank = $idx + 1; break; }
            }
            http_response_code(201);
            echo json_encode(['ok' => true, 'entry' => $entry, 'rank' => $rank, 'scores' => $sorted], JSON_UNESCAPED_UNICODE);
        } elseif ($method === 'DELETE') {
            requireTeacher($EXPECTED_TOKEN);
            $mode = $_GET['mode'] ?? 'all';
            $db = readJsonFile($path, ['version' => '1.0.0', 'updatedAt' => null, 'scores' => []]);
            if ($mode === 'demos') {
                $db['scores'] = array_values(array_filter($db['scores'], fn($s) => empty($s['isDemo'])));
            } else {
                $db['scores'] = [];
            }
            $db['updatedAt'] = gmdate('c');
            writeJsonFile($path, $db);
            echo json_encode(['ok' => true, 'scores' => $db['scores']], JSON_UNESCAPED_UNICODE);
        } else {
            $db = readJsonFile($path, ['version' => '1.0.0', 'updatedAt' => null, 'scores' => []]);
            echo json_encode(['ok' => true, 'updatedAt' => $db['updatedAt'], 'scores' => sortScores($db['scores'])], JSON_UNESCAPED_UNICODE);
        }
        break;

    case 'progress':
        $path = "$dataDir/progress.json";
        if ($method === 'POST') {
            $participant = cleanStr($input['participant'] ?? 'Anónimo', 60);
            $db = readJsonFile($path, ['version' => '1.0.0', 'updatedAt' => null, 'sessions' => []]);
            $record = [
                'participant' => $participant,
                'completedSteps' => is_array($input['completedSteps'] ?? null) ? array_slice($input['completedSteps'], 0, 100) : [],
                'practicePoints' => max(0, intval($input['practicePoints'] ?? 0)),
                'updatedAt' => gmdate('c')
            ];
            $found = false;
            foreach ($db['sessions'] as &$s) {
                if (strtolower($s['participant']) === strtolower($participant)) {
                    $s = $record;
                    $found = true;
                    break;
                }
            }
            if (!$found) $db['sessions'][] = $record;
            $db['updatedAt'] = gmdate('c');
            writeJsonFile($path, $db);
            echo json_encode(['ok' => true, 'record' => $record], JSON_UNESCAPED_UNICODE);
        } else {
            echo json_encode(array_merge(['ok' => true], readJsonFile($path, ['version' => '1.0.0', 'sessions' => []])), JSON_UNESCAPED_UNICODE);
        }
        break;

    default:
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Recurso no encontrado.']);
}
