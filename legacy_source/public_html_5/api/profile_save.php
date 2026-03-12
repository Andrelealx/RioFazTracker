<?php
/**
 * /api/profile_save.php
 * Salva/atualiza o perfil do cidadão e define um cookie HttpOnly (riofaz_uid).
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

//// Funções auxiliares ////////////////////////////////////////////////////////
function get_token_cookie(): ?string {
  return $_COOKIE['riofaz_uid'] ?? null;
}
function set_token_cookie(string $token): void {
  setcookie('riofaz_uid', $token, [
    'expires'  => time() + 60*60*24*180, // 180 dias
    'path'     => '/',
    'secure'   => isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
    'httponly' => true,
    'samesite' => 'Lax',
  ]);
}
function new_token(): string {
  return bin2hex(random_bytes(16));
}
function only_digits(?string $s): string {
  return preg_replace('/\D+/', '', (string)$s);
}

//// Garante a tabela de tokens ////////////////////////////////////////////////
$pdo->exec("
  CREATE TABLE IF NOT EXISTS user_tokens (
    user_id    BIGINT UNSIGNED NOT NULL,
    token      CHAR(32)        NOT NULL,
    created_at DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (token),
    KEY idx_user (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id)
      ON DELETE CASCADE ON UPDATE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
");

//// Lê entrada JSON ///////////////////////////////////////////////////////////
$input = json_decode(file_get_contents('php://input'), true) ?: [];

$name        = trim($input['name'] ?? '');
$phone_e164  = only_digits($input['phone_e164'] ?? '');
$whatsapp_ok = (int)($input['whatsapp_ok'] ?? 1);

$addr        = $input['address'] ?? [];
$cep         = $addr['cep']         ?? '';
$logradouro  = trim($addr['logradouro']  ?? '');
$numero      = trim($addr['numero']      ?? '');
$complemento = trim($addr['complemento'] ?? '');
$bairro      = trim($addr['bairro']      ?? '');
$cidade      = trim($addr['cidade']      ?? '');
$uf          = strtoupper(trim($addr['uf'] ?? ''));

// validação mínima
if ($name === '' || $phone_e164 === '' || $cep === '' || $logradouro === '' || $bairro === '' || $cidade === '' || $uf === '') {
  http_response_code(400);
  echo json_encode(['ok'=>false, 'error'=>'invalid_payload']);
  exit;
}

//// Transação: UPSERT user + endereço + token //////////////////////////////////
try {
  $pdo->beginTransaction();

  // 1) Usuário
  $st = $pdo->prepare("SELECT id FROM users WHERE phone_e164 = :p LIMIT 1");
  $st->execute([':p' => $phone_e164]);
  $row = $st->fetch();

  if ($row) {
    $user_id = (int)$row['id'];
    $pdo->prepare("UPDATE users SET name=:n, whatsapp_ok=:w WHERE id=:id")
        ->execute([':n'=>$name, ':w'=>$whatsapp_ok, ':id'=>$user_id]);
  } else {
    $pdo->prepare("INSERT INTO users (name, phone_e164, whatsapp_ok) VALUES (:n,:p,:w)")
        ->execute([':n'=>$name, ':p'=>$phone_e164, ':w'=>$whatsapp_ok]);
    $user_id = (int)$pdo->lastInsertId();
  }

  // 2) Endereço principal
  $pdo->prepare("UPDATE addresses SET is_primary=0 WHERE user_id=:u")
      ->execute([':u'=>$user_id]);

  $pdo->prepare("INSERT INTO addresses
    (user_id, cep, logradouro, numero, complemento, bairro, cidade, uf, is_primary)
    VALUES (:u,:cep,:logr,:num,:comp,:b,:c,:uf,1)")
    ->execute([
      ':u'=>$user_id,
      ':cep'=>$cep,
      ':logr'=>$logradouro,
      ':num'=>$numero!==''? $numero:null,
      ':comp'=>$complemento!==''? $complemento:null,
      ':b'=>$bairro,
      ':c'=>$cidade,
      ':uf'=>$uf
    ]);
  $address_id = (int)$pdo->lastInsertId();

  // 3) Token/cookie
  $token = get_token_cookie();
  if ($token) {
    $st = $pdo->prepare("SELECT user_id FROM user_tokens WHERE token=:t LIMIT 1");
    $st->execute([':t'=>$token]);
    $exists = $st->fetch();
    if (!$exists) { $token = null; }
  }
  if (!$token) {
    $token = new_token();
    $pdo->prepare("INSERT INTO user_tokens (user_id, token) VALUES (:u,:t)")
        ->execute([':u'=>$user_id, ':t'=>$token]);
  } else {
    $pdo->prepare("UPDATE user_tokens SET user_id=:u WHERE token=:t")
        ->execute([':u'=>$user_id, ':t'=>$token]);
  }
  set_token_cookie($token);

  $pdo->commit();

  echo json_encode([
    'ok'=>true,
    'user_id'=>$user_id,
    'address_id'=>$address_id,
    'profile'=>[
      'id'=>$user_id,
      'name'=>$name,
      'phone_e164'=>$phone_e164,
      'whatsapp_ok'=>$whatsapp_ok,
      'address'=>[
        'id'=>$address_id,
        'cep'=>$cep,
        'logradouro'=>$logradouro,
        'numero'=>$numero!==''? $numero:null,
        'complemento'=>$complemento!==''? $complemento:null,
        'bairro'=>$bairro,
        'cidade'=>$cidade,
        'uf'=>$uf
      ]
    ]
  ]);
} catch (Throwable $e) {
  if ($pdo->inTransaction()) $pdo->rollBack();
  http_response_code(500);
  echo json_encode(['ok'=>false,'error'=>'profile_save_failed']);
}
