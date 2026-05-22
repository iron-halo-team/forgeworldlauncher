<?php
require_once dirname(__FILE__) . '/../../lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
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

fw_json_response(200, array(
    'ok' => true,
    'message' => 'Сервер авторизации доступен.',
));
