<?php
// public_html/api/get_update.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

/** Normaliza route_id exatamente igual ao update_location */
function normalize_route($s){
    $s = mb_strtolower(trim((string)$s), 'UTF-8');
    $s = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
    $s = preg_replace('/[^a-z0-9_-]+/', '', $s);
    return $s ?: 'coleta1';
}

try {
    $routeParam = isset($_GET['route_id']) ? (string)$_GET['route_id'] : '';
    $route = normalize_route($routeParam);
    if ($route === '') {
        http_response_code(400);
        echo json_encode(['error'=>'route_id é obrigatório']);
        exit;
    }

    $dbg = (int)($_GET['debug'] ?? 0);

    $cfg  = include __DIR__ . '/../.env.php';
    $host = $cfg['host'] ?? 'localhost';
    $port = $cfg['port'] ?? '3306';
    $db   = $cfg['db']   ?? '';
    $user = $cfg['user'] ?? '';
    $pass = $cfg['pass'] ?? '';

    $pdo = new PDO(
        "mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4",
        $user, $pass,
        [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES=>false]
    );

    $st = $pdo->prepare("
        SELECT route_id, lat, lng, UNIX_TIMESTAMP(updated_at) AS ts_sec, updated_at
        FROM current_location
        WHERE route_id = :r
        LIMIT 1
    ");
    $st->execute([':r'=>$route]);
    $row = $st->fetch(PDO::FETCH_ASSOC);

    if (!$row) {
        http_response_code(404);
        $out = ['error'=>'not_found','route_id'=>$route];
        if ($dbg === 1) {
            $out['table_count']   = (int)$pdo->query("SELECT COUNT(*) FROM current_location")->fetchColumn();
            $out['recent_routes'] = $pdo->query("SELECT route_id FROM current_location ORDER BY updated_at DESC LIMIT 5")->fetchAll(PDO::FETCH_COLUMN);
        }
        echo json_encode($out); exit;
    }

    $now = time();
    $ts  = (int)$row['ts_sec'];
    $age = $now - $ts; // segundos desde a última atualização

    // === SEM TTL: sempre retorna a última posição ===
    $out = [
        'route_id'   => $row['route_id'],
        'lat'        => (float)$row['lat'],
        'lng'        => (float)$row['lng'],
        'ts'         => $ts,
        'update_ts'  => $ts * 1000,
        'updated_at' => $row['updated_at'],
        'age_sec'    => $age
    ];

    // (Opcional) Ajuda para clientes distinguirem posição "antiga", sem esconder:
    // $out['stale'] = ($age > 60); // por exemplo, considera "stale" se > 60s

    if ($dbg === 1) {
        $out['now_ts'] = $now;
    }

    echo json_encode($out);

} catch (Throwable $e) {
    error_log('get_update DB ERROR: '.$e->getMessage());
    http_response_code(500);
    echo json_encode(['error'=>'Internal Server Error']);
}
