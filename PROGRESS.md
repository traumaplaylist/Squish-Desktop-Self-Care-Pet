# PROGRESS

## Статус
День 1 выполнен (P0 целиком). Следующий шаг — День 2 (перерывы) из PROMPTS.md.
Агент работает в облачном Linux: всё Windows-специфичное проверено только сборкой/тестами здесь и CI `windows-latest`; живая проверка — раздел «Проверить руками».

## Сессия 0 — ревью (2026-11-05)
Сессия 0: ревью завершено, решения: владелец принял все варианты по умолчанию из `docs/REVIEW.md` раздел 6:
1. Windows-CI на GitHub Actions `windows-latest` с Дня 1 (typecheck, тесты, build:win, смоук Playwright).
2. Имя `Squish`, appId `com.squish.app` (README переименован из «Mallow»).
3. Electron 45.x (мажор зафиксировать), electron-vite 6.x, Node ≥ 22.
4. Все уточнения SPEC из REVIEW раздел 2 приняты пакетом — внесены в SPEC с пометкой «(R0)».
5. План дней перестроен (PROMPTS.md): упаковка и koffi — День 1; задачи с галочкой — День 4; питомец — День 5; онбординг/настройки/статистика — День 6; P1 — «Неделя 2». Звуки pop/coin — P0.
6. Бюджет RAM — 300 МБ суммарно; быстрый ввод и панель задач — одно окно.
7. Микрофон/камера — реестр через koffi + advapi32, `reg query` — запасной путь.
8. Защита от захвата экрана — вкл. по умолчанию; «Сфотографировать питомца» — P2.
9. Ветка `claude/magical-brahmagupta-bo67sr`, сдача — PR в `main`, мёржит владелец.
10. Внешний вид питомца — на усмотрение агента: круглый блоб, мятный `#9EE6CF`.

## День 1 — сделано (2026-11-05)
- **Каркас:** electron-vite 6 + vite 8 + React 18 + TS 5.9 strict, Vitest 5, ESLint 9 (flat) + Prettier. Скрипты: dev, dev:debug, build, test, test:watch, typecheck, lint, build:win, build:dir, smoke, icons, measure:idle.
- **core/:** `clock.ts` (Clock, FakeClock, AcceleratedClock), `types.ts` (всё состояние SPEC 3–7 с R0), `events.ts` (события + эффекты), `defaults.ts`, `widgetPosition.ts` (позиция `{displayId,x,y}`, возврат в угол), `notificationState.ts` (коды QUNS по R0), `i18n.ts`, `ipc.ts` (типизированный контракт).
- **Сторож архитектуры:** тест `core/architecture.test.ts` + правила ESLint — в core нет `Date.now()`, `new Date()`, таймеров, импортов electron/node/koffi.
- **main/storage.ts:** атомарная запись (tmp → fsync → rename с повтором на EPERM/EBUSY), версия схемы + миграции, файл из будущей версии не затирается, битый файл → `*.broken-<ts>.json` без краша, удаление осиротевшего `.tmp`, отложенная запись + `flush()` при выходе, лог `events/YYYY-MM.jsonl` (битые строки пропускаются).
- **main/index.ts:** single instance lock, `setAppUserModelId('com.squish.app')`, отдельная папка данных для debug (`Squish-debug`) и тестов (`SQUISH_USER_DATA`), события `app_start`/`app_quit`.
- **Безопасность:** `contextIsolation`, `sandbox`, без `nodeIntegration`; preload отдаёт только каналы из белого списка; CSP `default-src 'self'`; запрет навигации и новых окон.
- **Виджет:** прозрачный, безрамочный, alwaysOnTop (переутверждение раз в 30 с и при смене мониторов), skipTaskbar, 220×260, `setContentProtection(true)`, своё перетаскивание (порог 4 px, main ведёт окно по курсору через `setBounds` с явным размером), позиция переживает перезапуск, прозрачные места пропускают клики (Windows), ПКМ → меню трея, при скрытии анимации на паузе.
- **Питомец:** `PetRenderer` + `createPetRenderer` + `SvgBlobRenderer`: idle, happy, sleeping (Zzz); bounce (squash & stretch), blink (каждые 3–7 с); дыхание; глаза следят за курсором в радиусе 300 px; стадия «Малыш», 3 палитры. Остальные состояния/реакции — заглушки с TODO (рисуются как idle).
- **Трей:** меню SPEC 2.6 (пункты логируют; «Показать/скрыть» и «Выход» работают), иконка из SVG питомца.
- **Debug-окно** (`SQUISH_DEBUG=1`, ускорение ×60 через AcceleratedClock): переключение состояний, реакции, палитра, «вернуть в угол», результат пробы koffi, неактивные кнопки будущих дней.
- **koffi-спайк:** `smartPause/fullscreen.ts` — `SHQueryUserNotificationState` через koffi 3, любая ошибка → `'unknown'` + один лог. Результат логируется при старте и доступен смоук-тесту.
- **Сборка:** `electron-builder.yml` — NSIS x64, выбор папки, ярлыки, `npmRebuild: false`, koffi (`@koromix/*` и `*.node`) распакован из asar, `publish: null`. Проверено здесь сборкой `--linux dir`: упакованное приложение стартует, koffi грузится из `app.asar.unpacked`, asar 1,3 МБ.
- **CI:** `.github/workflows/ci.yml` — Linux (lint, typecheck, test) + Windows (typecheck, test, build:win, смоук собранного `Squish.exe`, артефакты: установщик и скриншоты).
- **Смоук** `scripts/smoke.mjs` (Playwright `_electron`): виджет появился, alwaysOnTop, 220×260, koffi загрузился, на Windows `SHQueryUserNotificationState` вернул число, клик → bounce, скриншоты.
- **Тесты:** 61 зелёный (clock, widgetPosition, notificationState, i18n и паритет ключей ru/en, архитектура, storage, breath).

## Замеры (Linux-контейнер без GPU — это верхняя оценка, не Windows)
Методика: `npm run build:dir && xvfb-run -a node scripts/measure-idle.mjs` — сумма CPU (utime+stime из /proc) всех процессов приложения за 15 с.
| Вариант дыхания | CPU, % одного ядра |
|---|---|
| бесконечная CSS-анимация SVG / HTML-слоя | 5,9 |
| CSS со `steps()` | 3,9 |
| **таймер 150 мс (выбрано)** | **2,7** |
| анимации на паузе | 1,3 |
| виджет скрыт | 0,3 |
RSS суммарно ≈ 570 МБ (на Linux RSS считает общую память многократно; на Windows смотреть «Private Bytes» в Process Explorer — бюджет 300 МБ).
**Отступление от SPEC 7.5:** дыхание сделано таймером в renderer (не CSS и не requestAnimationFrame) — бесконечная CSS-анимация держит композитор на 60 кадрах/с. Короткие реакции и Zzz — CSS.

## Не доделано / заглушки
- Пункты трея, кроме «Показать/скрыть» и «Выход», — только лог.
- Состояния waving/quiet/thirsty/tired/adventure и реакции drink/celebrate/coinCatch/straighten/hug — рисуются как idle (День 5).
- Стадии teen/adult/wise — только масштаб (День 5).
- Ежедневные бэкапы и восстановление из `backups/` — День 4 (по плану).
- Файловые логи с ротацией — День 7.
- Автозапуск — День 6 (онбординг/настройки).

## Известные баги / риски
- CPU в покое на Windows не замерен. Если > 1–2% — варианты: реже тик дыхания (250 мс), дыхание «приступами», выключение дыхания на батарее.
- CI на `windows-latest` ещё не подтверждён зелёным (первый прогон после пуша этого коммита) — проверить вкладку Actions.
- `setIgnoreMouseEvents(..., { forward: true })` работает только на Windows/macOS; на Linux прозрачные места виджета кликов не пропускают (не цель продукта).

## Проверить руками (Windows)
Установщик: GitHub → репозиторий → вкладка **Actions** → последний зелёный запуск **CI** → внизу **Artifacts** → `Squish-Setup` → скачать zip, внутри `Squish-Setup-0.1.0.exe`. SmartScreen: «Подробнее» → «Выполнить в любом случае» (подписи нет).
1. **Установка:** запустить установщик, выбрать папку, дождаться ярлыка на рабочем столе. Запустить Squish → в правом нижнем углу над панелью задач появился мятный питомец; в трее (стрелка ^ у часов) — его иконка.
2. **Живость:** питомец дышит, моргает раз в несколько секунд; поводи мышкой рядом — глаза следят; клик по питомцу — подпрыгивает.
3. **Прозрачность:** кликни по пустому месту рядом с питомцем (над ним, сбоку) — клик должен попасть в то, что под ним (иконку/окно), а не «в стекло».
4. **Перетаскивание:** зажми питомца и перетащи в другое место. Закрой через трей → «Выход», запусти снова — питомец там же.
5. **Два монитора (если есть):** перетащи на второй монитор, перезапусти — он на втором. Отключи второй монитор — питомец вернулся в угол основного.
6. **Масштаб 125% / 150%:** Параметры → Система → Дисплей → Масштаб. Питомец не размыт, не растягивается, остаётся в углу. Если два монитора с разным масштабом — перетащи между ними туда-обратно 3 раза: размер окна не должен «расти».
7. **Демонстрация экрана:** в Zoom, Teams, Telegram и Discord начни демонстрацию всего экрана (можно с самим собой/тестовый звонок) — у собеседника/в превью питомца НЕ видно. Также Win+Shift+S — на скриншоте питомца нет (так и задумано).
8. **Трей:** правый клик по иконке — меню на русском; «Показать/скрыть питомца» прячет и возвращает; «Выход» закрывает. ПКМ по питомцу открывает то же меню.
9. **Debug-режим (по желанию):** не требуется для проверки.
10. **CPU/RAM:** скачай Process Explorer (Sysinternals), найди все процессы `Squish.exe`, через 1 минуту после запуска запиши суммарный CPU и Private Bytes. Пришли цифры.
11. **(к Дню 2–3)** Пришли 4 вывода команды в «Командной строке» (Win+R → `cmd`):
    `reg query HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone /s`
    — (1) без звонка, (2) во время звонка в Telegram, (3) во время звонка в браузере (Google Meet), (4) сразу после звонка. Можно сохранить в файл: добавь в конец ` > C:\temp\mic1.txt`.

## Зависимости (зачем добавлены)
- `koffi` (prod) — FFI к Windows API без компиляции (CLAUDE.md).
- `electron`, `electron-vite`, `vite`, `@vitejs/plugin-react`, `react`, `react-dom`, `typescript`, `vitest`, `electron-builder` — стек CLAUDE.md. React — в devDependencies: он бандлится в renderer и не нужен в установщике.
- `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `prettier` — линт/формат (PROMPTS День 1).
- `cross-env` — `SQUISH_DEBUG=1` в npm-скрипте одинаково на Windows и Linux.
- `playwright` — смоук-тест Electron в CI (`_electron`) и генерация иконок; без него проверять Windows-сборку нечем.
- `@types/node`, `@types/react`, `@types/react-dom` — типы.

## Следующий шаг
День 2 (PROMPTS.md): `core/scheduler.ts` (автомат перерывов, активное время по R0) + 30+ тестов, `main/engine.ts`, оверлей на всех мониторах, preBreak в виджете.
