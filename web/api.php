<?php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

define('HISTORY_DIR', '/var/www/nulls-site/history/');
define('CSV_DIR',     '/var/www/nulls-site/csv/');
define('STAGE_FILE',  '/tmp/nulls_staged.json');

function ok($data = [])  { echo json_encode(['success' => true]  + $data, JSON_UNESCAPED_UNICODE); exit; }
function err($msg)       { echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE); exit; }
function body()          { return json_decode(file_get_contents('php://input'), true) ?? []; }

$action = $_GET['action'] ?? '';

switch ($action) {

  // ── History list ──────────────────────────────────────────────
  case 'history':
    $items = [];
    foreach (glob(HISTORY_DIR . '*.json') as $f) {
      $d = json_decode(file_get_contents($f), true);
      if ($d) $items[] = ['id' => $d['id'], 'title' => $d['title'], 'date' => $d['date']];
    }
    usort($items, fn($a,$b) => strcmp($b['date'], $a['date']));
    echo json_encode($items, JSON_UNESCAPED_UNICODE); exit;

  // ── Save history ──────────────────────────────────────────────
  case 'save':
    $data = body();
    $id    = !empty($data['id']) ? preg_replace('/[^a-z0-9_\-]/', '', $data['id']) : uniqid('p');
    $title = $data['title_ru'] ?: ($data['title_en'] ?: "Проект {$id}");
    $item  = ['id' => $id, 'date' => date('d.m H:i'), 'title' => $title, 'data' => $data];
    file_put_contents(HISTORY_DIR . $id . '.json', json_encode($item, JSON_UNESCAPED_UNICODE));
    ok(['id' => $id]);

  // ── Load history item ─────────────────────────────────────────
  case 'load':
    $id = preg_replace('/[^a-z0-9_\-]/', '', $_GET['id'] ?? '');
    $f  = HISTORY_DIR . $id . '.json';
    if (!file_exists($f)) err('not found');
    $d = json_decode(file_get_contents($f), true);
    echo json_encode(['success' => true, 'data' => $d['data']], JSON_UNESCAPED_UNICODE); exit;

  // ── Delete history item ───────────────────────────────────────
  case 'delete':
    $id = preg_replace('/[^a-z0-9_\-]/', '', body()['id'] ?? '');
    $f  = HISTORY_DIR . $id . '.json';
    if (file_exists($f)) unlink($f);
    ok();

  // ── Validate JSON ─────────────────────────────────────────────
  case 'validate':
    $raw  = file_get_contents('php://input');
    $json = json_decode($raw);
    if (json_last_error() !== JSON_ERROR_NONE) {
      $msg = json_last_error_msg();
      echo json_encode(['success' => false,
        'report' => "Синтаксическая ошибка JSON:\n{$msg}\n\nAuto Fixer попробует починить это."],
        JSON_UNESCAPED_UNICODE);
      exit;
    }
    $errors = [];
    if (!isset($json->{'@author'}) && !isset($json->Author))
      $errors[] = "[META] Нет поля @author";
    if (!isset($json->{'@title'}) && !isset($json->Title))
      $errors[] = "[META] Нет поля @title";
    if (!isset($json->{'@description'}) && !isset($json->Description))
      $errors[] = "[META] Нет поля @description";
    foreach ($json as $key => $val) {
      if ($key[0] === '@' || $key === '$schema' || in_array($key, ['Author','Title','Description']))
        continue;
      if (!file_exists(CSV_DIR . $key . '.csv'))
        $errors[] = "[FILE] Не найден: {$key}.csv";
    }
    if ($errors) {
      echo json_encode(['success' => false, 'report' => implode("\n", $errors)], JSON_UNESCAPED_UNICODE);
      exit;
    }
    ok();

  // ── Stage for download ────────────────────────────────────────
  case 'stage':
    $data = file_get_contents('php://input');
    file_put_contents(STAGE_FILE, $data);
    ok();

  // ── Download staged file ──────────────────────────────────────
  case 'download':
    if (!file_exists(STAGE_FILE)) { http_response_code(404); exit; }
    header('Content-Type: application/json');
    header('Content-Disposition: attachment; filename="mod.json"');
    readfile(STAGE_FILE);
    exit;

  // ── CSV file list ─────────────────────────────────────────────
  case 'csv_list':
    $files = [];
    foreach (glob(CSV_DIR . '*.csv') as $f) {
      $files[] = ['name' => basename($f), 'size' => filesize($f)];
    }
    usort($files, fn($a,$b) => strcmp($a['name'], $b['name']));
    echo json_encode($files, JSON_UNESCAPED_UNICODE); exit;

  default:
    err('unknown action');
}
