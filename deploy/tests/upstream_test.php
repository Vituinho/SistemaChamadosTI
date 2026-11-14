<?php
declare(strict_types=1);
// Unit tests for deploy/cpanel/api/upstream.php (not part of the package).
// Run: docker run --rm -v "$PWD/deploy:/d" php:8.3-cli php /d/tests/upstream_test.php
require __DIR__ . '/../cpanel/api/upstream.php';

$failures = 0;
function check(string $label, array $config, bool $ok, string $reason = ''): void
{
    global $failures;
    $result = givova_upstream($config);
    $pass = $result['ok'] === $ok && ($ok || $reason === '' || $result['reason'] === $reason);
    echo ($pass ? 'ok   ' : 'FAIL ') . $label . PHP_EOL;
    if (!$pass) { $failures++; var_export($result); echo PHP_EOL; }
}

$host = 'givova-ti-api-production.up.railway.app';
$valid = ['backend_url' => "https://$host", 'allowed_hosts' => [$host]];

check('exact allow-listed Railway host', $valid, true);
check('custom domain allow-listed', ['backend_url' => 'https://api.suporte.givovatransportes.com.br', 'allowed_hosts' => ['api.suporte.givovatransportes.com.br']], true);
check('trailing slash tolerated', ['backend_url' => "https://$host/", 'allowed_hosts' => [$host]], true);
check('case-insensitive host', ['backend_url' => 'https://GIVOVA-TI-API-PRODUCTION.up.railway.app', 'allowed_hosts' => [$host]], true);
check('empty url = staging', ['backend_url' => '', 'allowed_hosts' => []], false, 'unconfigured');
check('missing keys = staging', [], false, 'unconfigured');
check('host not in allow-list', ['backend_url' => 'https://evil.up.railway.app', 'allowed_hosts' => [$host]], false, 'invalid');
check('no suffix wildcards', ['backend_url' => "https://x.$host", 'allowed_hosts' => [$host]], false, 'invalid');
check('allow-list entry with suffix ignored', ['backend_url' => 'https://evil.up.railway.app', 'allowed_hosts' => ['.up.railway.app']], false, 'invalid');
check('http rejected', ['backend_url' => "http://$host", 'allowed_hosts' => [$host]], false, 'invalid');
check('port rejected', ['backend_url' => "https://$host:8443", 'allowed_hosts' => [$host]], false, 'invalid');
check('path rejected', ['backend_url' => "https://$host/api", 'allowed_hosts' => [$host]], false, 'invalid');
check('query rejected', ['backend_url' => "https://$host?x=1", 'allowed_hosts' => [$host]], false, 'invalid');
check('credentials rejected', ['backend_url' => "https://user:pass@$host", 'allowed_hosts' => [$host]], false, 'invalid');
check('userinfo trick rejected', ['backend_url' => "https://$host@169.254.169.254", 'allowed_hosts' => [$host, '169.254.169.254']], false, 'invalid');
check('IPv4 literal rejected', ['backend_url' => 'https://10.0.0.5', 'allowed_hosts' => ['10.0.0.5']], false, 'invalid');
check('IPv6 literal rejected', ['backend_url' => 'https://[::1]', 'allowed_hosts' => ['::1', '[::1]']], false, 'invalid');
check('private Railway DNS rejected', ['backend_url' => 'https://api.railway.internal', 'allowed_hosts' => ['api.railway.internal']], false, 'invalid');
check('localhost rejected', ['backend_url' => 'https://localhost', 'allowed_hosts' => ['localhost']], false, 'invalid');
check('whitespace/control chars rejected', ['backend_url' => "https://$host\r\nX: y", 'allowed_hosts' => [$host]], false, 'invalid');
check('backslash rejected', ['backend_url' => "https://$host\@evil.com", 'allowed_hosts' => [$host]], false, 'invalid');
check('non-https scheme rejected', ['backend_url' => "file:///etc/passwd", 'allowed_hosts' => ['']], false, 'invalid');

echo $failures === 0 ? "ALL PASSED\n" : "$failures FAILED\n";
exit($failures === 0 ? 0 : 1);
