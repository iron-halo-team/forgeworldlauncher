# Forge World Launcher — памятка

## Где менять тексты и ссылки

### Основные настройки лаунчера
- [launcher.config.json](/C:/Users/Acair/Documents/New%20project/launcher.config.json)

Здесь меняются:
- `branding.projectName` — название проекта
- `branding.subtitle` — подпись в центре
- `links.discord`, `links.wiki`, `links.github`, `links.support` — ссылки
- `minecraft.server.host`, `minecraft.server.port` — адрес сервера
- `launcherVersion` — версия лаунчера
- `distributionVersion` — версия встроенной сборки

### Новости и летопись
- [content/launcher-content.json](/C:/Users/Acair/Documents/New%20project/content/launcher-content.json)

Здесь меняются:
- `news[]` — новости справа
- `timeline[]` — нижняя лента исторических событий

## Где менять внешний вид

### Основные картинки
- [src/assets/logo-mark.svg](/C:/Users/Acair/Documents/New%20project/src/assets/logo-mark.svg) — логотип слева
- [src/assets/hero-scene.svg](/C:/Users/Acair/Documents/New%20project/src/assets/hero-scene.svg) — большая центральная иллюстрация

Если хочешь просто заменить изображения, удобнее всего оставить те же имена файлов и подменить содержимое.

### Фон, рамки, кнопки, цвета
- [src/styles/index.css](/C:/Users/Acair/Documents/New%20project/src/styles/index.css)

Главные блоки:
- `:root` — палитра и базовые переменные
- `.launcher-shell` — фон всего окна
- `.hero-art::before` — затемнение поверх правой картинки
- `.play-button` — кнопка "Играть"
- `.nav-button`, `.ghost-button`, `.support-button` — остальные кнопки

### Если нужны именно текстуры кнопок
1. Положи PNG или SVG в `src/assets/`
2. В [src/styles/index.css](/C:/Users/Acair/Documents/New%20project/src/styles/index.css) добавь `background-image`
3. Пересобери релиз

Пример:

```css
.play-button {
  background-image: url('./../assets/play-button.png');
  background-size: cover;
  background-position: center;
}
```

## Как встроить готовую NeoForge 1.21.1 сборку

Лаунчер уже умеет сам собирать базу:
- Minecraft `1.21.1`
- NeoForge `21.1.229`

После этого он докладывает сверху твои файлы из папки:
- [distribution-source](/C:/Users/Acair/Documents/New%20project/distribution-source)

### Что можно класть в `distribution-source`
- `mods/`
- `config/`
- `defaultconfigs/`
- `resourcepacks/`
- `shaderpacks/`
- `kubejs/`
- `journeymap/`
- `patchouli_books/`
- любые другие папки клиентской сборки
- корневые файлы вроде `options.txt`, `optionsof.txt`, `servers.dat`

### Если у тебя уже есть готовый клиент
Просто перенеси из него содержимое в `distribution-source`, сохраняя структуру.

Примеры:
- `готовая_сборка/mods` → `distribution-source/mods`
- `готовая_сборка/config` → `distribution-source/config`
- `готовая_сборка/kubejs` → `distribution-source/kubejs`
- `готовая_сборка/options.txt` → `distribution-source/options.txt`
- `готовая_сборка/servers.dat` → `distribution-source/servers.dat`

## Как собрать новый релиз

1. Обнови файлы в `distribution-source/`
2. При необходимости обнови:
   - [launcher.config.json](/C:/Users/Acair/Documents/New%20project/launcher.config.json)
   - [content/launcher-content.json](/C:/Users/Acair/Documents/New%20project/content/launcher-content.json)
3. Выполни:

```bash
npm run prepare:distribution
npm run dist
```

## Что делают команды

- `npm run prepare:distribution`
  - собирает офлайн-клиент
  - встраивает NeoForge
  - копирует моды и конфиги
  - кладёт итог в `build/offline-distribution`

- `npm run dist`
  - собирает сам лаунчер `.exe`

## Где лежит результат

- готовая игра:
  - [build/offline-distribution](/C:/Users/Acair/Documents/New%20project/build/offline-distribution)
- готовый лаунчер:
  - [release](/C:/Users/Acair/Documents/New%20project/release)
