<?php
/**
 * /api/profile_get.php
 * Retorna o perfil do cidadão (usuário + endereço principal) com base no cookie riofaz_uid.
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
  echo json_encode(['ok'=>false, 'profile'=>null, 'error'=>'db_connect_failed']);
  exit;
}

//// Helpers ///////////////////////////////////////////////////////////////////
function get_token_cookie(): ?string {
  return $_COOKIE['riofaz_uid'] ?? null;
}

//// Garante a tabela de tokens (primeiro uso) //////////////////////////////////
try {
  $pdo->exec("
    CREATE TABLE IF NOT EXISTS user_tokens (
      user_id    BIGINT UNSIGNED NOT NULL,
      token      CHAR(32)        NOT NULL,
      created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (token),
      KEY idx_user (user_id),
      CONSTRAINT fk_user_tokens_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
  ");
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false,'profile'=>null,'error'=>'tokens_table_create_failed']);
  exit;
}

//// Lê cookie /////////////////////////////////////////////////////////////////
$token = get_token_cookie();
if (!$token) {
  echo json_encode(['ok'=>true, 'profile'=>null]); // sem sessão ainda
  exit;
}

//// Busca usuário pelo token //////////////////////////////////////////////////
try {
  $sqlUser = "
    SELECT u.id, u.name, u.phone_e164, u.whatsapp_ok
    FROM user_tokens t
    JOIN users u ON u.id = t.user_id
    WHERE t.token = :tk
    LIMIT 1;
  ";
  $st = $pdo->prepare($sqlUser);
  $st->execute([':tk' => $token]);
  $user = $st->fetch();

  if (!$user) {
    // token inválido/órfão
    echo json_encode(['ok'=>true, 'profile'=>null]);
    exit;
  }

  // endereço principal do usuário
  $sqlAddr = "
    SELECT id, cep, logradouro, numero, complemento, bairro, cidade, uf
    FROM addresses
    WHERE user_id = :uid AND is_primary = 1
    ORDER BY id DESC
    LIMIT 1;
  ";
  $st = $pdo->prepare($sqlAddr);
  $st->execute([':uid' => $user['id']]);
  $addr = $st->fetch() ?: null;

  echo json_encode([
    'ok' => true,
    'profile' => [
      'id'          => (int)$user['id'],
      'name'        => $user['name'],
      'phone_e164'  => $user['phone_e164'],
      'whatsapp_ok' => (int)$user['whatsapp_ok'],
      'address'     => $addr ? [
        'id'          => (int)$addr['id'],
        'cep'         => $addr['cep'],
        'logradouro'  => $addr['logradouro'],
        'numero'      => $addr['numero'],
        'complemento' => $addr['complemento'],
        'bairro'      => $addr['bairro'],
        'cidade'      => $addr['cidade'],
        'uf'          => $addr['uf'],
      ] : null
    ]
  ]);
} catch (Throwable $e) {
  http_response_code(500);
  echo json_encode(['ok'=>false, 'profile'=>null, 'error'=>'profile_get_failed']);
}
