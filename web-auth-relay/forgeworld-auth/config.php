<?php

$config = array(
    // Change this on the hosting and in plugins/ForgeWorldAuthBridge/config.yml.
    // Do not commit your real secret to a public repository.
    'shared_secret' => 'H6xYxZqwKAiTwx2T_VuWI7F8AwsoBZfyKUjSJtrUMROb0vQxBFnzKQkgviF7H3DG',

    'data_dir' => dirname(__FILE__) . '/data',
    'request_ttl_seconds' => 60,
    'claim_ttl_seconds' => 25,
    'result_ttl_seconds' => 120,
    'plugin_online_seconds' => 45,
    'client_wait_seconds' => 25,
    'client_poll_microseconds' => 250000,
    'cors_origin' => '*',
);

$localConfigPath = dirname(__FILE__) . '/config.local.php';
if (is_file($localConfigPath)) {
    $localConfig = require $localConfigPath;
    if (is_array($localConfig)) {
        $config = array_merge($config, $localConfig);
    }
}

return $config;
