<?php
// public_html/api/debug_log.php
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

try {
    $cfg = include __DIR__ . '/../.env.php';
    $expected = $cfg['api_key'] ?? '';
    $provided = $_SERVER['HTTP_X_API_KEY'] ?? ($_GET['api_key'] ?? ($_POST['api_key'] ?? ''));
    if ($expected && (!$provided || !hash_equals($expected, (string)$provided))) {
        http_response_code(401);
        echo json_encode(['error'=>'Unauthorized']); exit;
    }

    $raw = file_get_contents('php://input');
    $data = [
        'method' => $_SERVER['REQUEST_METHOD'],
        'query'  => $_GET,
        'post'   => $_POST,
        'raw'    => $raw,
        'headers'=> getallheaders(),
        'ip'     => $_SERVER['REMOTE_ADDR'] ?? null,
        'ua'     => $_SERVER['HTTP_USER_AGENT'] ?? null,
        'time'   => date('Y-m-d H:i:s')
    ];

    // Log no error_log para consulta no painel
    error_log('DEBUG_TRACKER ' . json_encode($data));

    echo json_encode(['ok'=>true,'received'=>$data]);

} catch (Throwable $e) {
    error_log('debug_log ERROR: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error'=>'Internal Server Error']);
}
