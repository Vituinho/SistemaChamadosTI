<?php
declare(strict_types=1);

/*
 * Givova TI — same-origin API proxy for shared hosting (cPanel/LiteSpeed/Apache).
 *
 * Security model:
 * - Fixed upstream from config.php (never from the request) → no SSRF.
 * - Explicit allow-list of paths and methods; everything else is 404/405.
 * - Writes must come from this site's own HTTPS origin (CSRF defence in depth;
 *   the session cookie is also SameSite=Strict).
 * - Only the session cookie and the tracking key header are forwarded, after
 *   strict format validation (no header injection). Client IP/host headers are
 *   never forwarded or trusted.
 * - Request/response size limits, TLS verification, no redirects followed,
 *   generic error messages without internal details.
 * - No long-lived connections (SSE is disabled in the cPanel build).
 */

header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');
header('X-Frame-Options: DENY');
header("Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; sandbox");

function fail(int $status, string $message): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['detail' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

if (!extension_loaded('curl')) fail(503, 'O servidor precisa da extensão PHP cURL.');

require __DIR__ . '/upstream.php';
$config = require __DIR__ . '/config.php';
$timeout = max(5, min(55, (int)($config['timeout'] ?? 20)));

// Fixed upstream from config.php: https + exact host allow-list (see upstream.php).
$upstream = givova_upstream(is_array($config) ? $config : []);
if (!$upstream['ok']) {
    fail(503, $upstream['reason'] === 'unconfigured'
        ? 'A API ainda não foi configurada neste pacote (staging).'
        : 'Endereço da API inválido na configuração do proxy.');
}
$backend = $upstream['url'];

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$uri = $_SERVER['REQUEST_URI'] ?? '';
$path = explode('?', $uri, 2)[0];
if (!str_starts_with($path, '/api/')) fail(404, 'Endpoint inexistente.');
$path = substr($path, 4);

$routes = [
    '~^/(health|catalog|departments|auth/me|dashboard|push/config)$~D' => ['GET'],
    '~^/auth/(login|logout)$~D' => ['POST'],
    '~^/push/(subscribe|unsubscribe|test)$~D' => ['POST'],
    '~^/tickets$~D' => ['GET', 'POST'],
    '~^/tickets/[1-9][0-9]{0,9}$~D' => ['GET', 'PATCH'],
    '~^/tickets/[1-9][0-9]{0,9}/(history|attachment)$~D' => ['GET'],
    '~^/tickets/[1-9][0-9]{0,9}/(assign|resolve|notes|tracking-link)$~D' => ['POST'],
    '~^/tracking/GV-[0-9]{1,12}(/attachment)?$~D' => ['GET'],
];
$allowed = null;
foreach ($routes as $pattern => $methods) {
    if (preg_match($pattern, $path)) {
        $allowed = $methods;
        break;
    }
}
if ($allowed === null) fail(404, 'Endpoint inexistente.');
if (!in_array($method, $allowed, true)) {
    header('Allow: ' . implode(', ', $allowed));
    fail(405, 'Método não permitido.');
}

$host = $_SERVER['HTTP_HOST'] ?? '';
if (!preg_match('~^[a-zA-Z0-9.-]{1,253}(:[0-9]{1,5})?$~D', $host)) fail(400, 'Host inválido.');
$siteOrigin = 'https://' . strtolower($host);
$origin = strtolower($_SERVER['HTTP_ORIGIN'] ?? '');
$fetchSite = $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '';
if ($fetchSite === 'cross-site' || ($origin !== '' && $origin !== $siteOrigin)) fail(403, 'Origem não permitida.');
if ($method !== 'GET' && $origin !== $siteOrigin) fail(403, 'Origem não permitida.');

$limit = 6 * 1024 * 1024;
if ((int)($_SERVER['CONTENT_LENGTH'] ?? 0) > $limit) fail(413, 'A requisição excede 6 MB.');

$headers = ['Accept: application/json', 'Expect:', 'X-Forwarded-Proto: https'];
$key = $_SERVER['HTTP_X_TICKET_KEY'] ?? '';
if ($key !== '') {
    if (!str_starts_with($path, '/tracking/') || !preg_match('~^[A-Za-z0-9_-]{16,128}$~D', $key)) fail(400, 'Chave inválida.');
    $headers[] = 'X-Ticket-Key: ' . $key;
}
$cookie = $_COOKIE['givova_session'] ?? '';
if ($cookie !== '') {
    if (!is_string($cookie) || !preg_match('~^[A-Za-z0-9_-]{16,128}$~D', $cookie)) fail(400, 'Sessão inválida.');
    $headers[] = 'Cookie: givova_session=' . $cookie;
}

$body = null;
$contentType = $_SERVER['CONTENT_TYPE'] ?? '';
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
            if ($name !== 'attachment' || !is_int($file['error'] ?? null)) fail(422, 'Anexo inválido.');
            if ($file['error'] === UPLOAD_ERR_NO_FILE) continue;
            if (in_array($file['error'], [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true) || $file['size'] > 5 * 1024 * 1024) fail(413, 'A imagem deve ter até 5 MB.');
            if ($file['error'] !== UPLOAD_ERR_OK || !is_uploaded_file($file['tmp_name'])) fail(422, 'Falha ao receber o anexo.');
            // The API verifies the real image content and re-encodes it; PHP keeps no permanent copy.
            $body[$name] = new CURLFile($file['tmp_name'], 'application/octet-stream', 'attachment');
        }
    } else {
        if ($contentType !== '' && !preg_match('~^application/json(?:\s*;.*)?$~iD', $contentType)) fail(415, 'Tipo de conteúdo não permitido.');
        $body = file_get_contents('php://input', false, null, 0, $limit + 1);
        if ($body === false || strlen($body) > $limit) fail(413, 'A requisição excede 6 MB.');
        if ($body !== '') $headers[] = 'Content-Type: application/json';
    }
}

$query = explode('?', $uri, 2)[1] ?? '';
if (strlen($query) > 2048 || preg_match('~[\x00-\x20\x7f#]~', $query)) fail(400, 'Consulta inválida.');
if ($query !== '' && $method !== 'GET') fail(400, 'Consulta inválida.');

$upstreamHeaders = [];
$responseBody = '';
$curl = curl_init($backend . $path . ($query !== '' ? '?' . $query : ''));
curl_setopt_array($curl, [
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_FOLLOWLOCATION => false,
    CURLOPT_MAXREDIRS => 0,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTPS,
    // Never route through an environment proxy (would expose cookies/keys to a third party).
    CURLOPT_PROXY => '',
    CURLOPT_NOPROXY => '*',
    CURLOPT_HTTPPROXYTUNNEL => false,
    CURLOPT_UNRESTRICTED_AUTH => false,
    CURLOPT_CONNECTTIMEOUT => 10,
    CURLOPT_TIMEOUT => $timeout,
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
if ($status < 200 || ($status >= 300 && $status < 400) || $status > 599) fail(502, 'Resposta inesperada da API.');

http_response_code($status);
foreach ($upstreamHeaders as $line) {
    [$name, $value] = explode(':', $line, 2);
    $name = strtolower(trim($name));
    $value = trim($value);
    if ($name === 'content-type' && preg_match('~^(application/json|image/webp|image/png|image/jpeg)(;\s*charset=[a-z0-9-]+)?$~i', $value)) {
        header('Content-Type: ' . $value);
    } elseif ($name === 'x-request-id' && preg_match('~^[A-Za-z0-9-]{8,64}$~D', $value)) {
        header('X-Request-Id: ' . $value);
    } elseif ($name === 'set-cookie' && preg_match('~^givova_session=([A-Za-z0-9_-]{0,128})(;.*)?$~D', $value, $matches)) {
        // Host-only, Secure, HttpOnly, SameSite=Strict on this site; keep only expiry attributes.
        preg_match_all('~;\s*(max-age=-?[0-9]+|expires=[^;]+)~i', $matches[2] ?? '', $expiry);
        header('Set-Cookie: givova_session=' . $matches[1] . implode('', array_map(static fn ($a) => '; ' . $a, $expiry[1])) . '; Path=/; Secure; HttpOnly; SameSite=Strict', false);
    }
}
echo $responseBody;
