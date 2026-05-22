# Авторизация Forge World через лаунчер и AuthMe

Схема сделана так, чтобы лаунчер не знал пароли MySQL, RCON, SFTP и не подключался к базе напрямую. Игрок вводит ник и пароль в лаунчере, а проверку делает серверный плагин через официальный API AuthMe.

## Почему адрес `http://95.217.53.168:25915/auth/health` не открывался

Проверка показала, что TCP-порт `25915` снаружи не принимает HTTP-подключения. Это не ошибка лаунчера: браузер и лаунчер просто не могут достучаться до этого порта.

Поэтому добавлен обходной вариант через бесплатный веб-хостинг:

```text
Лаунчер -> HTTPS сайт -> Minecraft plugin -> AuthMe
```

Сайт работает на обычном HTTPS-порту, а Minecraft-плагин сам забирает заявки на вход исходящими запросами. Открывать отдельный порт на Minecraft-хостинге больше не нужно.

## Что добавлено

- `server-auth-bridge/` — Bukkit/Paper-плагин `ForgeWorldAuthBridge`.
- `web-auth-relay/forgeworld-auth/` — PHP relay для веб-хостинга.
- В лаунчере включена авторизация через:

```text
http://hm507391.webhm.pro/forgeworld-auth
```

## Установка PHP relay на веб-хостинг

1. Откройте файловый менеджер или FTP веб-хостинга.
2. Загрузите папку:

```text
web-auth-relay/forgeworld-auth
```

в директорию сайта:

```text
/var/www/hm507391/data/www/hm507391.webhm.pro/
```

Итоговый путь должен быть:

```text
/var/www/hm507391/data/www/hm507391.webhm.pro/forgeworld-auth
```

3. Откройте на хостинге файл:

```text
forgeworld-auth/config.php
```

4. Замените `CHANGE_ME_REPLACE_WITH_LONG_RANDOM_SECRET` на длинный случайный секрет.

5. Этот же секрет впишите в `plugins/ForgeWorldAuthBridge/config.yml` на Minecraft-сервере.

## Установка плагина на Minecraft-сервер

1. Соберите плагин:

```powershell
powershell -ExecutionPolicy Bypass -File .\server-auth-bridge\build-plugin.ps1
```

2. Готовый файл появится здесь:

```text
server-auth-bridge/build/ForgeWorldAuthBridge.jar
```

3. Положите на сервер в папку `plugins`:

```text
AuthMe-6.0.0-....jar
ForgeWorldAuthBridge.jar
```

4. Перезапустите сервер.

5. Откройте:

```text
plugins/ForgeWorldAuthBridge/config.yml
```

6. Настройте relay:

```yaml
http:
  enabled: false
  bind-host: "0.0.0.0"
  port: 25915
  trust-proxy-headers: false

relay:
  enabled: true
  endpoint: "http://hm507391.webhm.pro/forgeworld-auth/plugin/"
  shared-secret: "ТОТ_ЖЕ_САМЫЙ_СЕКРЕТ"
  poll-interval-ticks: 20
  request-timeout-ms: 8000
```

`http.enabled: false` здесь нормален: прямой входящий порт не нужен, потому что работает relay через сайт.

## Проверка

После загрузки PHP relay и запуска Minecraft-сервера с плагином откройте:

```text
http://hm507391.webhm.pro/forgeworld-auth/auth/health/
```

Если всё подключилось, будет ответ `ok: true`.

Если плагин не запущен, секрет не совпадает или сервер не может выйти в интернет, будет сообщение, что сервер авторизации сейчас недоступен.

## Как работает вход без `/login` в игре

1. Игрок входит или регистрируется в лаунчере.
2. Плагин проверяет пароль через AuthMe.
3. Лаунчер получает временный токен.
4. Перед запуском игры лаунчер просит плагин подготовить короткую сессию входа.
5. Когда игрок заходит на Minecraft-сервер с тем же ником, плагин вызывает `AuthMeApi.forceLogin(player)`.

После этого AuthMe не должен спрашивать `/login пароль` в игре.

## Про пароль в лаунчере

Фраза “пароль не сохраняется в лаунчере” означала: пароль не записывается в локальные настройки и не хранится на компьютере после входа. Вместо него хранится временный токен сессии.

В новой форме эту фразу убрали, чтобы не перегружать интерфейс.

## Важно по безопасности

Не добавляйте реальные пароли MySQL, RCON, SFTP и relay-secret в GitHub.

Если какие-то секреты уже случайно попадали в публичный чат, репозиторий или скриншоты, лучше заменить их в панели хостинга.
