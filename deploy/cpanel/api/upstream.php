<?php
declare(strict_types=1);

/**
 * Validates the fixed API upstream configured in config.php.
 *
 * Returns ['ok' => true, 'url' => 'https://host', 'host' => 'host'] or
 * ['ok' => false, 'reason' => 'unconfigured'|'invalid'].
 *
 * Rules (defence in depth — the URL never comes from the request):
 * - https only, no port, path, query, fragment or credentials;
 * - a public DNS name (no IP literals, no localhost/.internal/.local names);
 * - the host must be listed EXACTLY in allowed_hosts (no wildcards/suffixes).
 * An empty backend_url means a staging package that is not wired to an API yet.
 */
function givova_upstream(array $config): array
{
    $url = trim((string)($config['backend_url'] ?? ''));
    if ($url === '') return ['ok' => false, 'reason' => 'unconfigured'];
    $invalid = ['ok' => false, 'reason' => 'invalid'];
    if (preg_match('~[\x00-\x20\x7f\\\\]~', $url)) return $invalid;
    $parts = parse_url(rtrim($url, '/'));
    if (!is_array($parts) || ($parts['scheme'] ?? '') !== 'https') return $invalid;
    foreach (['port', 'user', 'pass', 'query', 'fragment'] as $forbidden) {
        if (isset($parts[$forbidden])) return $invalid;
    }
    if (($parts['path'] ?? '') !== '') return $invalid;
    $host = strtolower((string)($parts['host'] ?? ''));
    if (!preg_match('~^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$~D', $host)) return $invalid;
    if (filter_var($host, FILTER_VALIDATE_IP) !== false) return $invalid;
    if (preg_match('~(^|\.)(localhost|internal|local|localdomain|home|lan|corp|test|invalid|example)$~D', $host)) return $invalid;
    $allowed = [];
    foreach ((array)($config['allowed_hosts'] ?? []) as $entry) {
        if (is_string($entry) && $entry !== '') $allowed[] = strtolower($entry);
    }
    if (!in_array($host, $allowed, true)) return $invalid;
    return ['ok' => true, 'url' => 'https://' . $host, 'host' => $host];
}
