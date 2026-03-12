<?php
// public_html/api/update_location.php
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-KEY');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

function toFloat($v) {
    if ($v === null || $v === '') return null;
    $s = trim((string)$v);
    $s = str_replace([' ', ','], ['', '.'], $s);
    $s = preg_replace('/[^0-9\.\-\+eE]/', '', $s);
    if ($s === '' || !is_numeric($s)) return null;
    return (float)$s;
}

function flatten(array $a, string $pfx=''): array {
    $out = [];
    foreach ($a as $k => $v) {
        $key = $pfx === '' ? strtolower((string)$k) : $pfx.'.'.strtolower((string)$k);
        if (is_array($v)) $out += flatten($v, $key); else $out[$key] = $v;
    }
    return $out;
}

function pick(array $flat, array $cands) {
    foreach ($cands as $c) {
        if (array_key_exists($c, $flat) && $flat[$c] !== '' && $flat[$c] !== null) return $flat[$c];
    }
    return null;
}

/** Normaliza route_id: minúsculo, sem acento, somente [a-z0-9_-] */
function normalize_route($s){
    $s = mb_strtolower(trim((string)$s), 'UTF-8');
    $s = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s); // remove acentos
    $s = preg_replace('/[^a-z0-9_-]+/', '', $s);         // mantém só seguro
    return $s ?: 'coleta1';
}

try {
    // === Auth ===
    $cfg = include __DIR__ . '/../.env.php';
    $expected = isset($cfg['api_key']) ? (string)$cfg['api_key'] : '';
    $provided = $_SERVER['HTTP_X_API_KEY'] ?? ($_GET['api_key'] ?? ($_POST['api_key'] ?? ''));
    if ($expected && (!$provided || !hash_equals($expected, (string)$provided))) {
        http_response_code(401);
        echo json_encode(['error' => 'Unauthorized']); exit;
    }

    // === Coleta bruta ===
    $raw = file_get_contents('php://input') ?: '';
    $json = json_decode($raw, true);
    $src  = [];
    if (is_array($json)) $src = $json;
    if (!empty($_POST)) $src = array_merge($src, $_POST);
    if (!empty($_GET))  $src = array_merge($src, $_GET);

    $flat = flatten($src);

    // === route_id ===
    $routeRaw = pick($flat, [
        'route_id','route','vehicle_id','device_id','imei','id',
        'truck','caminhao','coleta','tracker_id','uniqueid','unitid'
    ]);
    $route = normalize_route($routeRaw ?? '');

    // === latitude/longitude ===
    $latRaw = pick($flat, [
        'lat','latitude','gps_lat','gpslat','latitud',
        'position.lat','coords.latitude','geo.latitude','location.lat',
        'coordinate.lat','coord.lat','y','coord_y','latitude_deg','latitude_degrees'
    ]);
    $lngRaw = pick($flat, [
        'lng','lon','long','longitude','gps_lng','gps_long','gpslon','longitud',
        'position.lng','coords.longitude','geo.longitude','location.lng',
        'coordinate.lng','coord.lng','x','coord_x','longitude_deg','longitude_degrees'
    ]);

    if (($latRaw === null || $lngRaw === null)) {
        $combo = pick($flat, ['latlng','lat_lon','latitude_longitude','coords','coordinate','location','position']);
        if (is_string($combo)) {
            $s = trim($combo);
            if (preg_match('/(-?\d+[,\.\d+]*)\s*[,;\s]\s*(-?\d+[,\.\d+]*)/u', $s, $m)) {
                $a = toFloat($m[1]); $b = toFloat($m[2]);
                if ($a !== null && $b !== null) {
                    if (abs($a) <= 90 && abs($b) <= 180) { $latRaw = $a; $lngRaw = $b; }
                    else { $latRaw = $b; $lngRaw = $a; }
                }
            }
        }
    }

    $lat = toFloat($latRaw);
    $lng = toFloat($lngRaw);

    if ($route === '' || $lat === null || $lng === null) {
        http_response_code(400);
        echo json_encode([
            'error' => 'Campos obrigatórios ausentes',
            'need'  => ['route_id (ou device_id/imei/id)','lat (ou latitude)','lng (ou lon/long/longitude)'],
            'got'   => ['route_id'=>$route, 'lat'=>$latRaw, 'lng'=>$lngRaw, 'keys'=>array_keys($flat)]
        ]);
        error_log('update_location MISSING FIELDS route='.($route?:'-').' keys='.json_encode(array_keys($flat)));
        exit;
    }

    if ($lat < -90 || $lat > 90 || $lng < -180 || $lng > 180) {
        http_response_code(422);
        echo json_encode(['error'=>'Lat/Lng fora da faixa','lat'=>$lat,'lng'=>$lng]); exit;
    }

    // === DB ===
    $host = $cfg['host'] ?? 'localhost';
    $port = $cfg['port'] ?? '3306';
    $db   = $cfg['db']   ?? '';
    $user = $cfg['user'] ?? '';
    $pass = $cfg['pass'] ?? '';

    $pdo = new PDO("mysql:host={$host};port={$port};dbname={$db};charset=utf8mb4",
        $user, $pass, [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES=>false]);

    // Garante tabela e PK (route_id)
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS current_location (
          route_id   VARCHAR(64) NOT NULL,
          lat        DECIMAL(10,7) NOT NULL,
          lng        DECIMAL(10,7) NOT NULL,
          updated_at DATETIME NOT NULL,
          PRIMARY KEY (route_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    ");

    $sql = "INSERT INTO current_location (route_id, lat, lng, updated_at)
            VALUES (:r, :lat, :lng, NOW())
            ON DUPLICATE KEY UPDATE lat=VALUES(lat), lng=VALUES(lng), updated_at=NOW()";
    $st = $pdo->prepare($sql);
    $st->execute([':r'=>$route, ':lat'=>$lat, ':lng'=>$lng]);

    $ts = time();
    echo json_encode([
        'status'=>'ok','route_id'=>$route,'lat'=>$lat,'lng'=>$lng,
        'updated_at'=>date('Y-m-d H:i:s', $ts),'ts'=>$ts,'update_ts'=>$ts*1000
    ]);

} catch (Throwable $e) {
    error_log('update_location ERROR: '.$e->getMessage());
    http_response_code(500);
    echo json_encode(['error'=>'Internal Server Error']);
}
