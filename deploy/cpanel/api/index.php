<?php
declare(strict_types=1);

// Fixed upstream, narrow routes, same-origin writes, no redirects or arbitrary URLs.
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
function fail(int $status, string $message): never {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['detail' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}
if (!extension_loaded('curl')) fail(503, 'O servidor precisa da extensão PHP cURL.');
$config = require __DIR__ . '/config.php';
$backend = rtrim($config['backend_url'], '/');
if (!preg_match('~^https://[a-z0-9-]+\.onrender\.com$~D', $backend)) fail(503, 'Endereço do backend inválido.');
$method = $_SERVER['REQUEST_METHOD'];
$uri = $_SERVER['REQUEST_URI'] ?? '';
$path = explode('?', $uri, 2)[0];
if (!str_starts_with($path, '/api/')) fail(404, 'Endpoint inexistente.');
$path = substr($path, 4);
$routes = [
    '~^/(health|catalog|departments|auth/me|dashboard|push/config)$~D' => ['GET'],
    '~^/auth/(login|logout)$~D' => ['POST'],
    '~^/push/(subscribe|unsubscribe|test)$~D' => ['POST'],
    '~^/tickets$~D' => ['GET', 'POST'],
    '~^/tickets/[1-9][0-9]*$~D' => ['GET', 'PATCH'],
    '~^/tickets/[1-9][0-9]*/(history|attachment)$~D' => ['GET'],
    '~^/tickets/[1-9][0-9]*/(assign|resolve)$~D' => ['POST'],
    '~^/tracking/GV-[0-9]+(/attachment)?$~D' => ['GET'],
];
$allowed = null;
foreach ($routes as $pattern => $methods) {
    if (preg_match($pattern, $path)) { $allowed = $methods; break; }
}
if ($allowed === null) fail(404, 'Endpoint inexistente.');
if (!in_array($method, $allowed, true)) fail(405, 'Método não permitido.');
$host = $_SERVER['HTTP_HOST'] ?? '';
if (!preg_match('~^[a-zA-Z0-9.-]+(:[0-9]+)?$~D', $host)) fail(400, 'Host inválido.');
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$site = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
if ($site === 'cross-site' || ($origin !== '' && $origin !== 'https://' . $host)) fail(403, 'Origem não permitida.');
if ($method !== 'GET' && $origin !== 'https://' . $host) fail(403, 'Origem não permitida.');

$limit = 6 * 1024 * 1024;
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) fail(413, 'A requisição excede 6 MB.');
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
$headers = ['Accept: application/json', 'Expect:'];
$key = $_SERVER['HTTP_X_TICKET_KEY'] ?? '';
if ($key !== '') {
    if (!preg_match('~^[a-zA-Z0-9_-]{1,128}$~D', $key)) fail(400, 'Chave inválida.');
    $headers[] = 'X-Ticket-Key: ' . $key;
}
// Do not forward Origin: writes have been checked here, before contacting FastAPI.
// Do not trust forwarded IP/host headers supplied by callers.
$cookie = $_COOKIE['givova_session'] ?? '';
if ($cookie !== '') {
    if (!is_string($cookie) || !preg_match('~^[a-zA-Z0-9_-]{1,128}$~D', $cookie)) fail(400, 'Cookie inválido.');
    $headers[] = 'Cookie: givova_session=' . $cookie;
}
$body = null;
if ($method !== 'GET') {
    if (str_starts_with(strtolower($contentType), 'multipart/form-data')) {
        if ($path !== '/tickets' || $method !== 'POST') fail(415, 'Upload não permitido.');
        if (!$_POST && !$_FILES && (int)($_SERVER['CONTENT_LENGTH'] ?? 0) > 0) fail(413, 'Upload excede o limite PHP da hospedagem.');
        $body = [];
        $fields = ['name', 'department', 'state', 'location', 'category', 'affected_system', 'title', 'description'];
        foreach ($_POST as $name => $value) {
            if (!in_array($name, $fields, true) || !is_string($value) || strlen($value) > 20000) fail(422, 'Campo inválido.');
            $body[$name] = $value;
        }
        foreach ($_FILES as $name => $file) {
            if ($name !== 'attachment' || !is_int($file['error'])) fail(422, 'Anexo inválido.');
            if ($file['error'] === UPLOAD_ERR_NO_FILE) continue;
            if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || $file['size'] > 5 * 1024 * 1024) fail(413, 'A imagem deve ter até 5 MB.');
            if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) fail(422, 'Falha ao receber o anexo.');
            // FastAPI verifies image pixels and re-encodes to WEBP; PHP stores no permanent file.
            $body[$name] = new CURLFile($file['tmp_name'], 'application/octet-stream', 'attachment');
        }
    } else {
        if ($contentType !== '' && !preg_match('~^application/json(?:\s*;.*)?$~iD', $contentType)) fail(415, 'Tipo de conteúdo não permitido.');
        $body = file_get_contents('php://input', false, null, 0, $limit + 1);
        if ($body === false || strlen($body) > $limit) fail(413, 'A requisição excede 6 MB.');
        $headers[] = 'Content-Type: application/json';
    }
}
$query = explode('?', $uri, 2)[1] ?? '';
if (strlen($query) > 4096 || preg_match('~[\x00-\x20\x7f#]~', $query)) fail(400, 'Consulta inválida.');
$upstreamHeaders = [];
$responseBody = '';
$curl = curl_init($backend . $path . ($query !== '' ? '?' . $query : ''));
curl_setopt_array($curl, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => 18,
    CURLOPT_SSL_VERIFYPEER => true,
    CURLOPT_SSL_VERIFYHOST => 2,
    CURLOPT_HEADERFUNCTION => static function ($handle, string $line) use (&$upstreamHeaders): int {
        if (str_starts_with($line, 'HTTP/')) $upstreamHeaders = [];
        elseif (str_contains($line, ':')) $upstreamHeaders[] = trim($line);
        return strlen($line);
    },
    CURLOPT_WRITEFUNCTION => static function ($handle, string $chunk) use (&$responseBody): int {
        if (strlen($responseBody) + strlen($chunk) > 12 * 1024 * 1024) return 0;
        $responseBody .= $chunk;
        return strlen($chunk);
    },
]);
if ($body !== null) curl_setopt($curl, CURLOPT_POSTFIELDS, $body);
$ok = curl_exec($curl);
$status = (int)curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
$error = curl_errno($curl);
unset($curl);
if ($ok === false) fail($error === CURLE_OPERATION_TIMEDOUT ? 504 : 502, 'A TI está temporariamente indisponível. Tente novamente.');
if ($status < 200 || ($status >= 300 && $status < 400)) fail(502, 'Resposta inesperada do backend.');
http_response_code($status);
foreach ($upstreamHeaders as $line) {
    [$name, $value] = explode(':', $line, 2);
    $name = strtolower($name);
    $value = trim($value);
    if ($name === 'content-type') header('Content-Type: ' . $value);
    elseif ($name === 'set-cookie' && preg_match('~^givova_session=([^;]*)(.*)$~D', $value, $matches)) {
        // Host-only, secure, HttpOnly, Strict on cPanel; preserve expiry/max-age for logout.
        $attributes = preg_replace('~;\s*(domain|path|samesite)=[^;]*|;\s*(secure|httponly)(?=;|$)~i', '', $matches[2]);
        header('Set-Cookie: givova_session=' . $matches[1] . $attributes . '; Path=/; Secure; HttpOnly; SameSite=Strict', false);
    }
}
echo $responseBody;
