# Forge World Auth Relay

PHP relay for free web hosting. It lets Forge World Launcher use HTTPS even when the Minecraft hosting panel does not expose a custom HTTP port.

## How It Works

1. The launcher sends login, registration, session, and logout requests to the website.
2. The website keeps the request in a short-lived local queue.
3. `ForgeWorldAuthBridge` on the Minecraft server polls the website from inside the server.
4. The plugin checks AuthMe and sends the result back to the website.
5. The launcher receives the result from the website.

This avoids exposing MySQL, RCON, or SFTP credentials to the launcher.

## Upload

Upload the whole `forgeworld-auth` folder to the site root:

```text
/var/www/hm507391/data/www/hm507391.webhm.pro/forgeworld-auth
```

After upload, this URL should exist:

```text
http://hm507391.webhm.pro/forgeworld-auth/auth/health/
```

It will show the authorization server as unavailable until the Minecraft plugin is installed and polling with the same secret.

## Secret

Open `forgeworld-auth/config.php` on the hosting and replace:

```php
'shared_secret' => 'CHANGE_ME_REPLACE_WITH_LONG_RANDOM_SECRET',
```

Use a long random value. Put the same value into:

```text
plugins/ForgeWorldAuthBridge/config.yml
```

```yaml
relay:
  shared-secret: "YOUR_LONG_RANDOM_SECRET"
```

Do not commit the real secret to GitHub.

## Launcher URL

The launcher should point to the relay root:

```json
"auth": {
  "enabled": true,
  "baseUrl": "http://hm507391.webhm.pro/forgeworld-auth",
  "requestTimeoutMs": 30000
}
```

## Important

Use HTTPS for a public release. The current `hm507391.webhm.pro` certificate is not trusted by Windows, so the example uses HTTP for testing. Player passwords pass through this relay for login and registration, but they are stored only in the short-lived queue and deleted after processing.
