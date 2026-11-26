# Кадры и клипы на компьютере по сети (ComfyUI API)

Claude Code на ноутбуке ставит задания в очередь ComfyUI на компьютере с
RTX 5070 Ti и забирает готовые файлы. Сеть — Tailscale. На компьютере не
нужно ничего, кроме ComfyUI. Ноутбук не греется: он только отправляет
запросы и скачивает файлы. Решение — D-042 в
[docs/decisions.md](../../docs/decisions.md), задача #147. Ручной режим
описан в [docs/desktop.md](../../docs/desktop.md) и остаётся как запасной.

| Файл | Что делает |
|---|---|
| `comfy.mjs` | Командная строка: `check`, `queue`, `status`, `fetch`, `free`, `import` |
| `api.mjs` | Маршруты сервера ComfyUI: `/prompt`, `/history`, `/upload/image`, `/view`, `/queue`, `/free`, `/system_stats`, `/models` |
| `workflows.mjs` | Подставляет промпт, seed, размер и имя файла в граф. Узлы ищутся по типу и связям, а не по номерам |
| `workflows/still.json` | Граф Z-Image-Turbo — экспорт API из ComfyUI владельца (шаблон «Z-Image-Turbo: Text to Image») |
| `workflows/clip.json` | Граф Wan 2.2 TI2V-5B — экспорт API (шаблон «Wan 2.2 5B Video Generation», с включённым Load Image) |
| `clips.json` | Каталог клипов: id, входной кадр библиотеки, seed, промпт |
| `jobs.mjs` | Задания из каталогов и запись очереди `out/queue.json` |
| `library.mjs` | Перевод принятых файлов в формат библиотеки и записи `library.json` |
| `comfy.test.mjs` | Юнит-тесты, без сервера и без сети |

Промпты кадров — из `tools/generation/prompts.json`: те же, что у
`generate.py`, буква в букву (это проверяет тест). Промпты клипов — из
`clips.json`. Модели прежние, обе Apache-2.0.

## Что включить на компьютере один раз

1. **Tailscale** на компьютере и ноутбуке, вход в одну сеть. Компьютер —
   `desktop-jtmbpel`, `100.105.208.82`.
2. **ComfyUI слушает сеть.** ComfyUI Desktop: Settings → **Server-Config** →
   **Host** `0.0.0.0` (было `127.0.0.1`). Порт — **Port**, по умолчанию 8000.
   Затем перезапустить ComfyUI. Переносная версия запускается с
   `--listen 0.0.0.0 --port 8188`.
3. **Брандмауэр Windows** — порт открыт только для адресов Tailscale
   (PowerShell от администратора):

   ```powershell
   New-NetFirewallRule -DisplayName "ComfyUI (Tailscale)" -Direction Inbound -Protocol TCP -LocalPort 8000 -RemoteAddress 100.64.0.0/10 -Action Allow
   ```

4. **Модели** скачаны: разделы 3.1 и 5.1 `docs/desktop.md`. Проверка —
   `check`.
5. **Сон компьютера** выключен, пока идёт очередь.

У ComfyUI нет пароля. Сервер виден только внутри сети Tailscale, и так должно
остаться: без Tailscale Funnel и без проброса порта на роутере.

## Запуск (на ноутбуке)

```sh
node tools/comfy/comfy.mjs check                       # сервер, видеокарта, файлы моделей
node tools/comfy/comfy.mjs queue still                 # все кадры каталога, которых нет в библиотеке
node tools/comfy/comfy.mjs queue still fall-bed-over-drop@1300105 --variants 3
node tools/comfy/comfy.mjs fetch --wait                # дождаться и скачать в tools/comfy/out/
node tools/comfy/comfy.mjs free                        # выгрузить модель кадров перед клипами
node tools/comfy/comfy.mjs queue clip clip-fall-roof-plunge --variants 3
node tools/comfy/comfy.mjs status                      # что в очереди, что упало
node tools/comfy/comfy.mjs import yard-day-dandelions_1320104 clip-fall-roof-plunge_391011
```

| Параметр | По умолчанию | Смысл |
|---|---|---|
| `--url` | `COMFY_URL` или `http://100.105.208.82:8000` | Адрес ComfyUI |
| `--out` | `tools/comfy/out` (вне git) | Результаты на отбор и запись очереди |
| `--library` | `apps/web/public/library` | Корень библиотеки |
| `--variants N` | 1 | Сколько seed на задание: кадры +1, клипы +10, как при ручных повторах |
| `--force` | — | Поставить заново то, что уже стоит в очереди |
| `--wait` | — | `fetch` ждёт, пока очередь не опустеет (опрос раз в 15 с) |

- **`queue`** без id берёт всё, чего ещё нет в библиотеке, в порядке каталога:
  важное первым. Входной кадр клипа загружается на сервер в `input/dream/`.
  Очередь живёт на компьютере: ноутбук после `queue` можно закрыть.
- **`fetch`** кладёт в `out/` файлы `<id>_<seed>.png` и `<id>_<seed>.mp4`.
  Рядом лежит `<id>_<seed>.json`: id, seed, промпт, модель, входной кадр.
  Если ComfyUI перезапустили и задание пропало, оно помечается `lost`, его
  нужно поставить заново.
- **`free`** выгружает модели из видеопамяти: Z-Image и Wan вместе в 16 ГБ
  не помещаются. Заменяет перезапуск ComfyUI между кадрами и клипами.
- **`import`** переводит только принятые владельцем результаты:
  - кадры — в `stills/<id>.webp` (WebP 82, 1280×720);
  - клипы — в `clips/<id>.mp4` (D-036: H.264 CRF 25, faststart, без звука,
    центр 1252×704 увеличен до 1280×720).

  Записи в `library.json` выглядят как у прежних партий. Источник —
  `local-desktop`, у клипа ещё и `from still <id>`. Если принят кадр с
  другим seed, seed правится и в каталоге. После этого карты глубины:
  `cd tools/depth && node depth.mjs`.

Нужны `ffmpeg` и `ffprobe` в `PATH` (или переменные `FFMPEG`, `FFPROBE`).

## Температура

ComfyUI не сообщает температуру видеокарты, поэтому правило из раздела 1
`docs/desktop.md` остаётся прежним: во время длинной очереди владелец
поглядывает на `nvidia-smi` и останавливает работу при 83 °C и выше (в
ComfyUI кнопка Cancel или Clear Queue). У настольной карты с нормальным охлаждением это запас, а не обычный
режим. Ограничения ноутбука (`ThermalGuard`, «только кадры») здесь ни при чём:
на ноутбуке не считается ничего.

## Тесты

```sh
cd tools/comfy
node --test
```
