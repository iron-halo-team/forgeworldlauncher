# Forge World Launcher

Официальный лаунчер Forge World для подготовленной сборки **NeoForge 1.21.1**.

## Возможности

- Один встроенный клиент: Minecraft 1.21.1 + NeoForge + ваши моды и конфиги.
- Система авторизации на основе плагина AuthMe
- Возможность автоподключения к серверу после запуска игры.
- Встроенная Java и локальная сборка клиента внутри релиза.
- Новости сервера и интерактивная хронология мира.
- Настройки памяти, поведения окна и быстрый доступ к папкам лаунчера.
- Уведомление о новой версии через внешний `update.json`.

## Стек

- Electron
- React
- TypeScript
- Vite
- electron-builder
- `@xmcl/core` для запуска Minecraft

## Быстрый старт для разработки

```bash
npm install
npm run dev
```

Для проверки production-сборки:

```bash
npm run build
npm run dist:dir
```

Полный релиз с установщиком:

```bash
npm run dist
```

Готовые файлы появятся в папке `release/`.

## Как собрать клиент

Локальные игровые файлы не должны храниться в GitHub-репозитории. Для подготовки новой версии положите нужные файлы в `distribution-source/`, затем выполните:

```bash
npm run prepare:distribution
npm run dist
```

Обычно в `distribution-source/` добавляют:

- `mods/` — моды сервера.
- `config/` — конфиги модов.
- `resourcepacks/` — ресурспаки, если нужны.
- `shaderpacks/` — шейдеры, если нужны.
- `options.txt`, `servers.dat` — настройки клиента и список серверов.

Подготовленная офлайн-сборка создаётся в `build/offline-distribution/` и автоматически попадает в релиз.

## Как обновить NeoForge

1. Обновите версии в `launcher.config.json`: `neoForgeVersion`, `defaultVersionId`, при необходимости `distributionVersion` и `launcherVersion`.
2. Обновите моды и конфиги в `distribution-source/`.
3. Выполните `npm run prepare:distribution`.
4. Проверьте запуск через `npm run dist:dir`.
5. Соберите новый установщик через `npm run dist`.
6. Опубликуйте новый релиз и обновите ссылку/метаданные обновления.

## Контент лаунчера

Основные файлы для ручного редактирования:

- `launcher.config.json` — версия лаунчера, сервер, ссылки, настройки Minecraft.
- `content/launcher-content.json` — новости и события истории мира.
- `updates/metadata.json` — метаданные последней версии для проверки обновлений.
- `updates/download.md` — страница скачивания, которую можно открыть из уведомления об обновлении.
- `src/assets/logo-mark.png` — логотип слева.
- `src/assets/hero-scene.png` — центральный фон.
- `src/assets/discord.png`, `src/assets/wiki.png`, `src/assets/github.png` — иконки ссылок.
- `ico/forgeworld_multisize.ico` — иконка приложения и установщика.

Чтобы добавить событие в историю мира, добавьте новый объект в массив `timeline` внутри `content/launcher-content.json`. Чем больше событий в массиве, тем длиннее становится линия истории.

## Проверка обновлений

В `launcher.config.json` есть два поля:

- `update.metadataUrl` — raw-ссылка на `updates/metadata.json`.
- `update.downloadPage` — страница, которую лаунчер откроет, если в metadata нет отдельного `downloadUrl`.

После публикации на GitHub файл `metadata.json` должен быть доступен по raw-ссылке. Для репозитория `iron-halo-team/forgeworld` это:

```text
https://raw.githubusercontent.com/iron-halo-team/forgeworld/main/updates/metadata.json
```

Чтобы показать игрокам уведомление, увеличьте `latestVersion` в `updates/metadata.json` выше текущего `launcherVersion` из `launcher.config.json`.

## Что не коммитить

В репозитории должен жить исходный код лаунчера, но не тяжёлые локальные артефакты сборки:

- `node_modules/`
- `build/`
- `dist/`
- `dist-electron/`
- `release/`
- `client/`
- локальные моды, ресурспаки, шейдеры и готовые игровые файлы, если у них нет разрешения на публикацию

Это уже отражено в `.gitignore`, чтобы проект оставался open-source, а приватные или лицензируемые игровые файлы не улетали в публичный репозиторий случайно.

## Лицензия

Код лаунчера распространяется под MIT. Minecraft, NeoForge, моды, ассеты и сторонние библиотеки принадлежат их авторам и распространяются на условиях соответствующих лицензий.
