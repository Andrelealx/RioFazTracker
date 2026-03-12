<?php
/**
 * /api/route_info.php
 * Retorna a rota e a agenda (dia/horário) para um bairro específico.
 * GET params: bairro, city, uf
 */

//// CORS / Préflight //////////////////////////////////////////////////////////
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Access-Control-Allow-Origin: ' . $origin);
header('Vary: Origin');
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
  http_response_code(204);
  exit;
}
header('Content-Type: application/json; charset=utf-8');

//// CONFIG DB via .env.php ////////////////////////////////////////////////////
$config = include __DIR__ . '/../.env.php';
$DB_HOST = $config['host'] ?? 'localhost';
$DB_PORT = $config['port'] ?? '3306';
$DB_NAME = $config['db']   ?? 'u305836601_coleta';
$DB_USER = $config['user'] ?? 'u305836601_riofaz';
$DB_PASS = $config['pass'] ?? '';

//// Conexão PDO ///////////////////////////////////////////////////////////////
try {
  $pdo = new PDO(
    "mysql:host={$DB_HOST};port={$DB_PORT};dbname={$DB_NAME};charset=utf8mb4",
    $DB_USER,
    $DB_PASS,
    [
      PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
      PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]
  );
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false, 'error'=>'db_connect_failed']);
  exit;
}

//// Entrada ///////////////////////////////////////////////////////////////////
$bairro = trim($_GET['bairro'] ?? '');
$city   = trim($_GET['city']   ?? '');
$uf     = strtoupper(trim($_GET['uf'] ?? ''));

if ($bairro === '' || $city === '' || $uf === '') {
  http_response_code(400);
  echo json_encode(['ok'=>false, 'error'=>'missing_params']);
  exit;
}

/**
 * Normalização leve do bairro:
 * - remove espaços duplos
 * - mantém acentos (o collation utf8mb4_0900_ai_ci é acento-insensível por padrão)
 */
$bairro_norm = preg_replace('/\s+/', ' ', $bairro);

//// Query: neighborhood -> route -> schedule //////////////////////////////////
// Tentamos primeiro por igualdade exata; se não achar, tentamos LIKE prefixo.
$sqlExact = "
  SELECT r.code AS route_code, s.weekday, 
         TIME_FORMAT(s.time_start, '%H:%i:%s') AS time_start,
         TIME_FORMAT(s.time_end,   '%H:%i:%s') AS time_end
  FROM neighborhoods n
  JOIN routes r          ON r.neighborhood_id = n.id
  JOIN route_schedules s ON s.route_id = r.id
  WHERE n.name = :bairro
    AND n.city = :city
    AND n.uf   = :uf
  LIMIT 1
";

$sqlLike = "
  SELECT r.code AS route_code, s.weekday, 
         TIME_FORMAT(s.time_start, '%H:%i:%s') AS time_start,
         TIME_FORMAT(s.time_end,   '%H:%i:%s') AS time_end
  FROM neighborhoods n
  JOIN routes r          ON r.neighborhood_id = n.id
  JOIN route_schedules s ON s.route_id = r.id
  WHERE n.name LIKE :bairro_like
    AND n.city = :city
    AND n.uf   = :uf
  LIMIT 1
";

try {
  // 1) tentativa exata
  $st = $pdo->prepare($sqlExact);
  $st->execute([
    ':bairro' => $bairro_norm,
    ':city'   => $city,
    ':uf'     => $uf
  ]);
  $row = $st->fetch();

  // 2) fallback com LIKE (ex.: "KM3" encontra "KM3 até o KM11")
  if (!$row) {
    $st = $pdo->prepare($sqlLike);
    $st->execute([
      ':bairro_like' => $bairro_norm . '%',
      ':city'        => $city,
      ':uf'          => $uf
    ]);
    $row = $st->fetch();
  }

  if (!$row) {
    // não mapeado — retorna ok com nulos para o front cair no fallback
    echo json_encode([
      'ok'         => true,
      'route_code' => null,
      'weekday'    => null,
      'time_start' => null,
      'time_end'   => null
    ]);
    exit;
  }

  echo json_encode([
    'ok'         => true,
    'route_code' => $row['route_code'],
    'weekday'    => is_null($row['weekday']) ? null : (int)$row['weekday'],
    'time_start' => $row['time_start'],
    'time_end'   => $row['time_end']
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false, 'error'=>'route_info_failed']);
}
