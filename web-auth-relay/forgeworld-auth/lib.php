<?php

function fw_config()
{
    static $config = null;
    if ($config === null) {
        $config = require dirname(__FILE__) . '/config.php';
    }
    return $config;
}

function fw_status_text($status_code)
{
    $texts = array(
        200 => 'OK',
        204 => 'No Content',
        400 => 'Bad Request',
        403 => 'Forbidden',
        404 => 'Not Found',
        405 => 'Method Not Allowed',
        503 => 'Service Unavailable',
        504 => 'Gateway Timeout',
    );
    return isset($texts[$status_code]) ? $texts[$status_code] : 'OK';
}

function fw_set_status($status_code)
{
    if (function_exists('http_response_code')) {
        http_response_code($status_code);
        return;
    }

    header('HTTP/1.1 ' . $status_code . ' ' . fw_status_text($status_code));
}

function fw_boot()
{
    $config = fw_config();
    if (!is_dir($config['data_dir'])) {
        @mkdir($config['data_dir'], 0755, true);
    }

    header('Access-Control-Allow-Origin: ' . $config['cors_origin']);
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-ForgeWorld-Secret');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        fw_set_status(204);
        exit;
    }
}

function fw_json_response($status_code, $payload)
{
    fw_set_status($status_code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload);
    exit;
}

function fw_read_json_body()
{
    $raw = file_get_contents('php://input');
    if ($raw === false || trim($raw) === '') {
        return array();
    }

    $body = json_decode($raw, true);
    if (!is_array($body)) {
        fw_json_response(400, array(
            'ok' => false,
            'message' => 'Некорректный запрос авторизации.',
        ));
    }

    return $body;
}

function fw_client_ip()
{
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        return trim($_SERVER['HTTP_CF_CONNECTING_IP']);
    }

    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($parts[0]);
    }

    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '';
}

function fw_state_file()
{
    $config = fw_config();
    return $config['data_dir'] . '/state.json';
}

function fw_lock_file()
{
    $config = fw_config();
    return $config['data_dir'] . '/state.lock';
}

function fw_default_state()
{
    return array(
        'requests' => array(),
        'results' => array(),
        'plugin' => array(
            'lastSeen' => 0,
            'status' => fw_default_server_status(),
        ),
    );
}

function fw_default_server_status()
{
    return array(
        'playersOnline' => 0,
        'maxPlayers' => 0,
        'players' => array(),
        'serverVersion' => '',
        'motd' => '',
        'updatedAt' => 0,
    );
}

function fw_load_state()
{
    $path = fw_state_file();
    if (!is_file($path)) {
        return fw_default_state();
    }

    $raw = file_get_contents($path);
    $state = json_decode($raw, true);
    if (!is_array($state)) {
        return fw_default_state();
    }

    if (!isset($state['requests']) || !is_array($state['requests'])) {
        $state['requests'] = array();
    }
    if (!isset($state['results']) || !is_array($state['results'])) {
        $state['results'] = array();
    }
    if (!isset($state['plugin']) || !is_array($state['plugin'])) {
        $state['plugin'] = array('lastSeen' => 0, 'status' => fw_default_server_status());
    }
    if (!isset($state['plugin']['status']) || !is_array($state['plugin']['status'])) {
        $state['plugin']['status'] = fw_default_server_status();
    }

    return $state;
}

function fw_save_state($state)
{
    $path = fw_state_file();
    $tmp = $path . '.tmp';
    file_put_contents($tmp, json_encode($state));
    rename($tmp, $path);
}

function fw_cleanup_state(&$state)
{
    $config = fw_config();
    $now = time();

    foreach ($state['requests'] as $id => $request) {
        $created_at = isset($request['createdAt']) ? (int) $request['createdAt'] : 0;
        if ($created_at + $config['request_ttl_seconds'] < $now) {
            unset($state['requests'][$id]);
        }
    }

    foreach ($state['results'] as $id => $result) {
        $created_at = isset($result['createdAt']) ? (int) $result['createdAt'] : 0;
        if ($created_at + $config['result_ttl_seconds'] < $now) {
            unset($state['results'][$id]);
        }
    }
}

function fw_open_state()
{
    $lock = fopen(fw_lock_file(), 'c+');
    if ($lock === false) {
        fw_json_response(500, array(
            'ok' => false,
            'message' => 'Не удалось открыть локальное хранилище авторизации.',
        ));
    }

    flock($lock, LOCK_EX);
    $state = fw_load_state();
    fw_cleanup_state($state);

    return array($lock, $state);
}

function fw_close_state($lock, $state)
{
    fw_save_state($state);
    flock($lock, LOCK_UN);
    fclose($lock);
}

function fw_random_id()
{
    if (function_exists('random_bytes')) {
        return bin2hex(random_bytes(16));
    }

    if (function_exists('openssl_random_pseudo_bytes')) {
        return bin2hex(openssl_random_pseudo_bytes(16));
    }

    return sha1(uniqid('', true) . mt_rand());
}

function fw_queue_request($type, $body)
{
    $id = fw_random_id();
    $request = array(
        'id' => $id,
        'type' => $type,
        'username' => isset($body['username']) ? trim((string) $body['username']) : '',
        'password' => isset($body['password']) ? (string) $body['password'] : '',
        'currentPassword' => isset($body['currentPassword']) ? (string) $body['currentPassword'] : '',
        'newPassword' => isset($body['newPassword']) ? (string) $body['newPassword'] : '',
        'email' => isset($body['email']) ? trim((string) $body['email']) : '',
        'token' => isset($body['token']) ? (string) $body['token'] : '',
        'ip' => fw_client_ip(),
        'status' => 'pending',
        'createdAt' => time(),
        'claimedAt' => 0,
    );

    $opened = fw_open_state();
    $lock = $opened[0];
    $state = $opened[1];
    $state['requests'][$id] = $request;
    fw_close_state($lock, $state);

    return $id;
}

function fw_wait_result($id)
{
    $config = fw_config();
    $deadline = microtime(true) + $config['client_wait_seconds'];

    while (microtime(true) < $deadline) {
        $opened = fw_open_state();
        $lock = $opened[0];
        $state = $opened[1];

        if (isset($state['results'][$id])) {
            $result = $state['results'][$id];
            unset($state['results'][$id]);
            fw_close_state($lock, $state);

            $status = isset($result['status']) ? (int) $result['status'] : 200;
            $payload = isset($result['body']) && is_array($result['body'])
                ? $result['body']
                : array('ok' => false, 'message' => 'Сервер авторизации вернул пустой ответ.');
            fw_json_response($status, $payload);
        }

        fw_close_state($lock, $state);
        usleep($config['client_poll_microseconds']);
    }

    $opened = fw_open_state();
    $lock = $opened[0];
    $state = $opened[1];
    unset($state['requests'][$id]);
    fw_close_state($lock, $state);

    fw_json_response(504, array(
        'ok' => false,
        'message' => 'Сервер авторизации не ответил вовремя. Попробуйте ещё раз.',
    ));
}

function fw_safe_equals($expected, $actual)
{
    if (function_exists('hash_equals')) {
        return hash_equals($expected, $actual);
    }

    if (strlen($expected) !== strlen($actual)) {
        return false;
    }

    $result = 0;
    for ($i = 0; $i < strlen($expected); $i += 1) {
        $result |= ord($expected[$i]) ^ ord($actual[$i]);
    }

    return $result === 0;
}

function fw_require_plugin_secret()
{
    $config = fw_config();
    $actual = '';

    if (!empty($_SERVER['HTTP_X_FORGEWORLD_SECRET'])) {
        $actual = (string) $_SERVER['HTTP_X_FORGEWORLD_SECRET'];
    } elseif (isset($_GET['secret'])) {
        $actual = (string) $_GET['secret'];
    }

    if ($config['shared_secret'] === 'CHANGE_ME_REPLACE_WITH_LONG_RANDOM_SECRET') {
        fw_json_response(503, array(
            'ok' => 'false',
            'message' => 'Relay secret is not configured.',
        ));
    }

    if (!fw_safe_equals($config['shared_secret'], $actual)) {
        fw_json_response(403, array(
            'ok' => 'false',
            'message' => 'Forbidden.',
        ));
    }
}

function fw_is_plugin_online()
{
    $config = fw_config();
    $opened = fw_open_state();
    $lock = $opened[0];
    $state = $opened[1];
    $last_seen = isset($state['plugin']['lastSeen']) ? (int) $state['plugin']['lastSeen'] : 0;
    fw_close_state($lock, $state);

    return $last_seen > 0 && ($last_seen + $config['plugin_online_seconds']) >= time();
}

function fw_int_value($value, $fallback)
{
    if (is_int($value)) {
        return $value;
    }

    if (is_string($value) && preg_match('/^-?\d+$/', $value)) {
        return (int) $value;
    }

    return $fallback;
}

function fw_apply_plugin_status(&$state, $body)
{
    if (!isset($state['plugin']) || !is_array($state['plugin'])) {
        $state['plugin'] = array('lastSeen' => 0, 'status' => fw_default_server_status());
    }
    if (!isset($state['plugin']['status']) || !is_array($state['plugin']['status'])) {
        $state['plugin']['status'] = fw_default_server_status();
    }

    $state['plugin']['lastSeen'] = time();
    $status = $state['plugin']['status'];

    if (isset($body['playersOnline'])) {
        $status['playersOnline'] = max(0, fw_int_value($body['playersOnline'], 0));
    }
    if (isset($body['maxPlayers'])) {
        $status['maxPlayers'] = max(0, fw_int_value($body['maxPlayers'], 0));
    }
    if (isset($body['players']) && is_array($body['players'])) {
        $players = array();
        foreach ($body['players'] as $player) {
            $name = trim((string) $player);
            if ($name !== '') {
                $players[] = $name;
            }
        }
        $status['players'] = $players;
    }
    if (isset($body['serverVersion'])) {
        $status['serverVersion'] = (string) $body['serverVersion'];
    }
    if (isset($body['motd'])) {
        $status['motd'] = (string) $body['motd'];
    }

    $status['updatedAt'] = time();
    $state['plugin']['status'] = $status;
}

function fw_get_server_status()
{
    $config = fw_config();
    $opened = fw_open_state();
    $lock = $opened[0];
    $state = $opened[1];

    $last_seen = isset($state['plugin']['lastSeen']) ? (int) $state['plugin']['lastSeen'] : 0;
    $status = isset($state['plugin']['status']) && is_array($state['plugin']['status'])
        ? $state['plugin']['status']
        : fw_default_server_status();
    fw_close_state($lock, $state);

    $online = $last_seen > 0 && ($last_seen + $config['plugin_online_seconds']) >= time();
    $players_online = isset($status['playersOnline']) ? (int) $status['playersOnline'] : 0;
    $max_players = isset($status['maxPlayers']) ? (int) $status['maxPlayers'] : 0;

    return array(
        'ok' => true,
        'online' => $online,
        'displayText' => $online ? (string) $players_online : 'OFFLINE',
        'playersOnline' => $players_online,
        'maxPlayers' => $max_players,
        'players' => isset($status['players']) && is_array($status['players']) ? $status['players'] : array(),
        'serverVersion' => isset($status['serverVersion']) ? (string) $status['serverVersion'] : '',
        'motd' => isset($status['motd']) ? (string) $status['motd'] : '',
        'message' => $online
            ? 'Сервер онлайн.'
            : 'Сервер сейчас недоступен.',
        'updatedAt' => isset($status['updatedAt']) ? (int) $status['updatedAt'] : 0,
        'checkedAt' => time(),
    );
}

function fw_handle_client_request($type)
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        fw_json_response(405, array(
            'ok' => false,
            'message' => 'Метод запроса не поддерживается.',
        ));
    }

    if (!fw_is_plugin_online()) {
        fw_json_response(503, array(
            'ok' => false,
            'message' => 'Сервер авторизации сейчас недоступен.',
        ));
    }

    $id = fw_queue_request($type, fw_read_json_body());
    fw_wait_result($id);
}

function fw_plugin_heartbeat()
{
    $body = fw_read_json_body();
    $opened = fw_open_state();
    $lock = $opened[0];
    $state = $opened[1];
    fw_apply_plugin_status($state, $body);
    fw_close_state($lock, $state);

    fw_json_response(200, array(
        'ok' => 'true',
        'empty' => 'true',
    ));
}

function fw_plugin_poll()
{
    $config = fw_config();
    $body = fw_read_json_body();
    $opened = fw_open_state();
    $lock = $opened[0];
    $state = $opened[1];
    fw_apply_plugin_status($state, $body);
    $now = time();
    $request = null;

    foreach ($state['requests'] as $id => $candidate) {
        $claimed_at = isset($candidate['claimedAt']) ? (int) $candidate['claimedAt'] : 0;
        $status = isset($candidate['status']) ? (string) $candidate['status'] : 'pending';
        $can_claim = $status === 'pending'
            || ($status === 'claimed' && $claimed_at + $config['claim_ttl_seconds'] < $now);

        if (!$can_claim) {
            continue;
        }

        $state['requests'][$id]['status'] = 'claimed';
        $state['requests'][$id]['claimedAt'] = $now;
        $request = $state['requests'][$id];
        break;
    }

    fw_close_state($lock, $state);

    if ($request === null) {
        fw_json_response(200, array(
            'ok' => 'true',
            'empty' => 'true',
        ));
    }

    fw_json_response(200, array(
        'ok' => 'true',
        'empty' => 'false',
        'id' => (string) $request['id'],
        'type' => (string) $request['type'],
        'username' => (string) $request['username'],
        'password' => (string) $request['password'],
        'currentPassword' => isset($request['currentPassword']) ? (string) $request['currentPassword'] : '',
        'newPassword' => isset($request['newPassword']) ? (string) $request['newPassword'] : '',
        'email' => isset($request['email']) ? (string) $request['email'] : '',
        'token' => (string) $request['token'],
        'ip' => (string) $request['ip'],
    ));
}

function fw_plugin_complete()
{
    $body = fw_read_json_body();
    $id = isset($body['id']) ? (string) $body['id'] : '';
    if ($id === '') {
        fw_json_response(400, array(
            'ok' => 'false',
            'message' => 'Missing request id.',
        ));
    }

    $ok = false;
    if (isset($body['ok'])) {
        $ok = $body['ok'] === true || strtolower((string) $body['ok']) === 'true';
    }

    $status = isset($body['statusCode']) ? (int) $body['statusCode'] : ($ok ? 200 : 400);
    $result_body = array(
        'ok' => $ok,
        'message' => isset($body['message']) ? (string) $body['message'] : '',
    );

    if (isset($body['username'])) {
        $result_body['username'] = (string) $body['username'];
    }
    if (isset($body['token'])) {
        $result_body['token'] = (string) $body['token'];
    }
    if (isset($body['expiresAt'])) {
        $result_body['expiresAt'] = (string) $body['expiresAt'];
    }
    if (isset($body['email'])) {
        $result_body['email'] = (string) $body['email'];
    }
    if (isset($body['hasEmail'])) {
        $result_body['hasEmail'] = $body['hasEmail'] === true || strtolower((string) $body['hasEmail']) === 'true';
    }
    if (isset($body['lastLoginAt'])) {
        $result_body['lastLoginAt'] = (string) $body['lastLoginAt'];
    }

    $opened = fw_open_state();
    $lock = $opened[0];
    $state = $opened[1];
    fw_apply_plugin_status($state, $body);
    $state['results'][$id] = array(
        'status' => $status,
        'body' => $result_body,
        'createdAt' => time(),
    );
    unset($state['requests'][$id]);
    fw_close_state($lock, $state);

    fw_json_response(200, array(
        'ok' => 'true',
    ));
}

fw_boot();
