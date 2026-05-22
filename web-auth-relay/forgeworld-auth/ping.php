<?php
header('Content-Type: application/json; charset=utf-8');
echo json_encode(array(
    'ok' => true,
    'message' => 'PHP works.',
    'phpVersion' => PHP_VERSION,
));
