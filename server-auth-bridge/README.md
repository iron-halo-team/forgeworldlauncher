# ForgeWorldAuthBridge

Серверный Bukkit/Paper/Spigot-совместимый плагин, который связывает Forge World Launcher и AuthMe.

Плагин сам поднимает небольшой HTTP API внутри Minecraft-сервера. Лаунчер обращается к этому API для регистрации, входа, проверки статуса и подготовки авто-входа на сервер. Лаунчеру не нужны MySQL, RCON, SFTP и отдельный Web Hosting.

## Что делает плагин

- Регистрирует AuthMe-аккаунт из лаунчера.
- Проверяет пароль AuthMe-аккаунта при входе из лаунчера.
- Выдаёт временный токен лаунчера, чтобы игроку не нужно было вводить пароль каждый запуск.
- Перед запуском игры создаёт короткую launch-сессию.
- При входе игрока на Minecraft-сервер выполняет `AuthMeApi.forceLogin`, если launch-сессия была подготовлена лаунчером.
- Отдаёт `/server/status`, чтобы лаунчер стабильно показывал онлайн без сторонних relay-сервисов.

## Требования

- Java 17 или новее.
- Minecraft-сервер с AuthMe.
- Один свободный публичный TCP-порт на хостинге.

Если хостинг не даёт ни одного дополнительного публичного порта, прямой API недоступен. В таком случае нужен внешний backend/relay, но это уже отдельная инфраструктура и она специально не используется в текущей версии.

## Сборка

Из корня проекта:

```powershell
powershell -ExecutionPolicy Bypass -File .\server-auth-bridge\build-plugin.ps1
```

Готовый файл:

```text
server-auth-bridge/build/ForgeWorldAuthBridge.jar
```

## Установка

1. Положите `ForgeWorldAuthBridge.jar` в папку `plugins`.
2. Убедитесь, что AuthMe уже установлен.
3. Перезапустите сервер.
4. Откройте `plugins/ForgeWorldAuthBridge/config.yml`.
5. Укажите свободный порт в `http.port`.
6. Укажите такой же адрес в `launcher.config.json` в поле `auth.baseUrl`.

Пример для текущего сервера:

```yaml
http:
  enabled: true
  bind-host: "0.0.0.0"
  port: 25797
  public-base-url: "http://f10.joinserver.xyz:25797"
  trust-proxy-headers: false
  cors-origin: "*"

auto-login:
  enabled: true
  delay-ticks: 10
  require-ip-match: false
```

Проверка:

```text
http://f10.joinserver.xyz:25797/auth/health
```

Ожидаемый ответ:

```json
{"ok":true,"message":"Сервер авторизации доступен."}
```

## Настройка лаунчера

В `launcher.config.json`:

```json
{
  "auth": {
    "enabled": true,
    "baseUrl": "http://f10.joinserver.xyz:25797",
    "fallbackBaseUrl": "http://95.217.53.168:25797",
    "hostHeader": "",
    "requestTimeoutMs": 12000
  }
}
```

## Безопасность

Пароль игрока не сохраняется в лаунчере. После успешного входа плагин выдаёт случайный токен, хранит только его SHA-256-хэш на сервере и использует его для подготовки следующих запусков.

`require-ip-match` по умолчанию выключен, потому что у игроков могут быть VPN, мобильные сети, NAT и разные маршруты до HTTP API и Minecraft-порта. Если включить эту опцию, авто-вход будет разрешён только когда IP запроса к API совпадает с IP входа в игру.

## Логи

По умолчанию плагин пишет только старт API и важные ошибки. Успешные входы и регистрации не шумят в консоли. Если нужна диагностика, включите:

```yaml
logging:
  log-successes: true
```
