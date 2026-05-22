<?php
require_once dirname(__FILE__) . '/../../lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    fw_json_response(405, array(
        'ok' => false,
        'message' => 'Метод запроса не поддерживается.',
    ));
}

fw_json_response(200, fw_get_server_status());
