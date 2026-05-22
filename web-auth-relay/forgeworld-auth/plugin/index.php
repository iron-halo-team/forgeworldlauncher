<?php
require_once dirname(__FILE__) . '/../lib.php';

fw_require_plugin_secret();

$action = isset($_GET['action']) ? (string) $_GET['action'] : 'poll';

if ($action === 'heartbeat') {
    fw_plugin_heartbeat();
}

if ($action === 'poll') {
    fw_plugin_poll();
}

if ($action === 'complete') {
    fw_plugin_complete();
}

fw_json_response(404, array(
    'ok' => 'false',
    'message' => 'Unknown relay action.',
));
