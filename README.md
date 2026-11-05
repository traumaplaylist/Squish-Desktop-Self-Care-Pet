# Squish — Desktop Self-Care Pet

Squish — питомец для Windows, который живёт в углу экрана и растёт, когда ты заботишься о себе: делаешь перерывы для глаз и разминку, пьёшь воду и закрываешь маленькие дела. Перерывы проводит сам питомец, на созвонах и в полноэкранных приложениях он молчит. Всё хранится локально: ни аккаунтов, ни сети, ни телеметрии.

> Не является медицинским продуктом.

## Установка (для пользователя)

1. Скачай установщик: GitHub → **Actions** → последний зелёный запуск **CI** → внизу **Artifacts** → `Squish-Setup` → внутри `Squish-Setup-0.1.0.exe`.
2. Запусти его. Установщик не подписан, поэтому Windows SmartScreen покажет «Система Windows защитила ваш компьютер». Нажми **«Подробнее» → «Выполнить в любом случае»**.
3. Выбери папку и дождись ярлыка. При первом запуске питомец вылупится из яйца и задаст 4 простых вопроса.

Удаление: «Параметры → Приложения → Squish → Удалить». Деинсталлятор спросит, удалить ли данные питомца (`%APPDATA%\Squish`).

## Для разработчика

Нужны Node.js ≥ 22.12 и Git. Visual Studio Build Tools не нужны: нативные вызовы Windows идут через `koffi` с готовыми бинарниками.

```bash
npm install
```

```bash
npm run dev
```

| Команда | Что делает |
|---|---|
| `npm run dev` | запуск в режиме разработки |
| `npm run dev:debug` | то же с `SQUISH_DEBUG=1`: время ×60, окно Debug |
| `npm test` / `npm run test:watch` | Vitest: ядро, хранилище, движок |
| `npm run typecheck` / `npm run lint` | TypeScript strict, ESLint |
| `npm run build:win` | установщик NSIS в `dist/` (только на Windows или в CI) |
| `npm run build:dir` | распакованная сборка под Linux, чтобы проверить упаковку |
| `npm run smoke` | смоук-тест собранного приложения (Playwright `_electron`) |
| `npm run measure:idle` | CPU и память в покое через `app.getAppMetrics()` |
| `npm run i18n:check` | все ключи есть и в `ru`, и в `en` |
| `npm run icons` | перерисовать иконки из SVG питомца |

E2E-сценарии: `node scripts/e2e-breaks.mjs`, `e2e-tasks.mjs`, `e2e-pet.mjs`, `e2e-onboarding.mjs`. Перед ними `npm run build`, на Linux они запускаются через `xvfb-run -a`.

### Debug-режим

`npm run dev:debug` открывает окно Debug. В нём:
- скорость времени ×1/×10/×60/×600;
- имитация ввода («печатаю» / «отошёл»);
- «Микро/Длинный сейчас»;
- имитация созвона, камеры и фуллскрина на N минут;
- реальные показания детекторов;
- визуальные состояния и реакции питомца;
- «+1 день заботы», «стадия +1», «потребности → 10», «энергия +10», «монеты +50».

Ускорение сделано подменой часов (`AcceleratedClock`), а не правкой таймингов. Данные debug-режима лежат отдельно, в `%APPDATA%\Squish-debug`.

### CI

`.github/workflows/ci.yml` состоит из двух частей:
- **Linux:** lint, проверка типов, тесты.
- **Windows:** проверка типов, тесты, сборка установщика, смоук упакованного `Squish.exe` (koffi, `SHQueryUserNotificationState`, сверка чтения реестра микрофона через koffi с выводом `reg.exe`), четыре e2e-сценария, замер CPU и RAM, тихая установка → запуск → тихое удаление.

## Архитектура

```
src/
  core/      чистая логика без Electron, Node API и Date.now(); время приходит аргументом
             scheduler (автомат перерывов), pet, water, tasks, quickParse, economy, rewards,
             stats, smartPause, day, visual, lines, settingsSchema, migrations, exercises
  main/      Electron main: engine (tick 1 с), storage (атомарный JSON, бэкапы, лог событий),
             smartPause/ (koffi: shell32, advapi32, user32, kernel32), windows/, tray, hotkeys, log
  preload/   contextBridge, только каналы из белого списка (полнота проверяется компилятором)
  renderer/  widget, overlay, tasks, onboarding, settings, home, debug; pet/ — PetRenderer
```

Правила (подробно в `CLAUDE.md`):
- `core/` тестируется без Electron.
- Источник истины только main, renderer шлёт команды и получает снапшот.
- Питомец рисуется только через `PetRenderer`.
- Тексты только через i18n-ключи.
- `contextIsolation`, `sandbox`, CSP `default-src 'self'`.

Данные лежат в `%APPDATA%\Squish`:
- `settings.json`, `state.json`, `tasks.json` — со схемой, версией и миграциями;
- `events/YYYY-MM.jsonl` — лог событий;
- `backups/` — ежедневный бэкап за 7 дней;
- `logs/` — 5 файлов по 1 МБ.

Экспорт и импорт (Настройки → Данные) сохраняют всё в один `.squish.json`.

## Как заменить питомца на спрайты из Blender (SPEC 7.3)

Остальной UI не знает, как рисуется питомец: всё идёт через интерфейс `src/renderer/pet/PetRenderer.ts`, а выбор реализации — одна строка в `createPetRenderer.ts`.

1. **Рендер в Blender.** Камера ортографическая, фон прозрачный (Render Properties → Film → **Transparent**). Выход 256×256 PNG RGBA, 12 fps.
2. **Анимации.** Отрендерь по отдельной последовательности кадров на каждое состояние и реакцию:
   - состояния: `idle`, `happy`, `sleeping`, `waving`, `quiet`, `thirsty`, `tired`, `onBreak:lookFar`, `onBreak:stretchUp`, `onBreak:breathe`;
   - реакции: `bounce`, `drink`, `celebrate`, `coinCatch`, `blink`, `straighten`, `hug`, `purr`, `giggle`, `dizzy`.

   Зацикленные состояния — 1–3 секунды, реакции — по длительности из `REACTION_MS` в `SvgBlobRenderer.tsx`.
3. **Спрайт-лист.** Склей кадры в один PNG (например, TexturePacker или `montage -tile 16x -geometry 256x256+0+0 -background none`). Рядом положи JSON:
   ```json
   { "frameSize": 256, "animations": { "idle": { "frames": [0, 1, 2, 3], "fps": 12, "loop": true },
     "bounce": { "frames": [40, 41, 42, 43, 44, 45, 46, 47], "fps": 12, "loop": false } } }
   ```
4. **Положи файлы** в `src/renderer/pet/sprites/pet.png` и `pet.json`. Стадии — отдельными листами (`pet-baby.png` …) или полем `stage` в JSON.
5. **Реализуй `SpriteSheetRenderer`.** Это класс с тем же интерфейсом `PetRenderer`: `setState` выбирает зацикленную анимацию, `play(reaction)` проигрывает разовую и возвращает Promise. Кадры меняй через `background-position` по таймеру с частотой fps анимации; `requestAnimationFrame` не используй, это требование SPEC 7.5 к CPU. `setPaused` останавливает таймер, `lookAt` можно игнорировать или сдвигать слой глаз.
6. **Подключи** его в `createPetRenderer.ts`: `case 'spriteSheet': return new SpriteSheetRenderer(container);`. Затем замени `'svgBlob'` на `'spriteSheet'` в местах вызова: виджет, оверлей, онбординг, «Дом».
7. **Проверь:** `npm run dev:debug`, в окне Debug прощёлкай все состояния и реакции, затем запусти `node scripts/measure-idle.mjs`. Анимация на 12 fps в покое должна укладываться в бюджет CPU.
