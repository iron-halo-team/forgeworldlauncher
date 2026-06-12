# Forge World Launcher

Официальный лаунчер Forge World для подготовленной сборки **NeoForge 1.21.1**.

<img width="1919" height="1079" alt="image" src="https://github.com/user-attachments/assets/4b648b01-f69c-48f5-8c87-51e9111c4483" />

## Возможности

- Встроенный клиент: Minecraft 1.21.1 NeoForge + ваши моды и конфиги.
- Система авторизации на основе плагина AuthMe.
- Возможность автоподключения к серверу после запуска игры.
- Встроенная Java и локальная сборка клиента внутри релиза.
- Новости сервера и интерактивная хронология мира.
- Базовые настройки.

## Стек

- Electron
- React
- TypeScript
- Vite
- electron-builder
- `@xmcl/core` для запуска Minecraft

## Сборка

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

В `distribution-source/` добавляются:

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

## Проверка обновлений

В `launcher.config.json` есть два поля:

- `update.metadataUrl` — raw-ссылка на `updates/metadata.json`.
- `update.downloadPage` — страница, которую лаунчер откроет, если в metadata нет отдельного `downloadUrl`.

После публикации на GitHub файл `metadata.json` должен быть доступен по raw-ссылке. Для репозитория `iron-halo-team/forgeworld` это:

```text
https://raw.githubusercontent.com/iron-halo-team/forgeworld/main/updates/metadata.json
```

Чтобы показать игрокам уведомление, увеличьте `latestVersion` в `updates/metadata.json` выше текущего `launcherVersion` из `launcher.config.json`.

## Лицензия

Код лаунчера распространяется под MIT. Minecraft, NeoForge, моды, ассеты и сторонние библиотеки принадлежат их авторам и распространяются на условиях соответствующих лицензий.
