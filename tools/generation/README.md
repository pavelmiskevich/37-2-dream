# Локальная генерация кадров библиотеки

Скрипты для генерации кадров сна-фильма на своих устройствах — без платных
сервисов и без квоты Hugging Face. План и пороги —
[docs/generation-plan.md](../../docs/generation-plan.md), решение — D-025 в
[docs/decisions.md](../../docs/decisions.md).

| Файл | Что делает |
|---|---|
| `prompts.json` | Каталог промптов: общий стиль + сцены с id, тегами по словарю `packages/dream-core/src/film/library.ts` и приоритетом |
| `generate.py` | Пакетная генерация Z-Image-Turbo по каталогу → `apps/web/public/library/stills/<id>.webp` + запись в `apps/web/public/library/library.json` |
| `cache/embeds/` | Кэш закодированных промптов (вне git): каждый промпт кодируется один раз |
| `thermal.py` | Защита от перегрева: датчик, пауза, аварийная остановка, скважность, пачки, только от сети, файл-замок, лог |
| `tests/` | Юнит-тесты защиты и каталога (без датчика и без модели) |

Модель — [Tongyi-MAI/Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo),
лицензия Apache-2.0. Кадр 1280×720, 8 шагов (8 проходов трансформера), без CFG.
Seed кадра выводится из его id (или задаётся полем `seed` в каталоге), шум
генерируется на CPU — один и тот же seed даёт одинаковый стартовый шум на любом
устройстве.

## Правила, которые нельзя обходить

- **Ни одного запуска модели мимо `generate.py`.** Каждый кадр и кодирование
  промптов идут через `ThermalGuard`. Не запускать модель из Python-консоли,
  ноутбуков Jupyter или чужих скриптов.
- На ноутбуке — **только кадры**, никаких видеомоделей.
- Не менять режим питания Windows («Сбалансированный»), драйверы и системные
  настройки. Ноутбук — на твёрдой поверхности, решётки открыты.
- Всё ставится только в `tools/generation/.venv` (вне git). Модели — в кэш
  Hugging Face по умолчанию (`%USERPROFILE%\.cache\huggingface\hub`), вне
  репозитория.
- Отбор делает владелец: неудачный кадр удаляется вместе с записью в
  `library.json`, сцена генерируется заново (с другим `seed` в каталоге).

## Защита от перегрева (`thermal.py`)

| Правило | Ноутбук (`--profile laptop`) | Компьютер (`--profile desktop`) |
|---|---|---|
| Датчик | `\Thermal Zone Information(*)\Temperature` через `typeperf` (кельвины, без прав администратора; берётся самая горячая зона) | `nvidia-smi` (температура GPU) |
| Пауза | от 85 °C — ждать до 70 °C | от 80 °C — ждать до 70 °C |
| Аварийная остановка | от 90 °C, в том числе посреди кадра | от 83 °C, в том числе посреди кадра |
| Текстовый кодировщик | стартует только ниже 75 °C, после паузы ждёт 65 °C | как кадр: 80 → 70 °C |
| Скважность | после кадра отдых не короче его генерации (`--duty 1`) | нет |
| Пачки | по 10 кадров, перерыв 10 минут | нет |
| Питание | только от сети; на батарее и при неизвестном состоянии — отказ | на батарее — отказ |
| Без датчика | отказ запуска | отказ запуска |

Кроме того:

- **Сторож посреди кадра.** Пока идёт кадр, фоновый поток читает датчик каждые
  `--poll-interval` секунд (2). При пороге остановки он прерывает генерацию на
  следующем шаге диффузии; если кадр не остановился за 60 с — завершает процесс
  (код 3). Потеря датчика посреди работы — тоже аварийная остановка.
- **Пауза не бесконечна.** Если за `--max-pause` (30 минут) не остыло до порога
  возобновления — аварийная остановка с советом проверить вентиляцию.
- **Файл-замок** `tools/generation/.generate.lock` — второй генератор не
  запустится. Замок держит ОС: если процесс упал, замок освобождается сам.
- **Лог** — `tools/generation/logs/thermal-<profile>.csv` (вне git): время,
  событие (`start`, `work`, `frame`, `rest`, `pause`, `resume`, `batch_break`,
  `abort`), кадр, температура до / пик / после, длительность.
- **Кодирование промптов** (D-026) — загрузка кодировщика и каждый промпт
  идут под защитой по отдельности, с отдыхом между ними, и начинаются только
  ниже своего, более строгого порога. Понижение `--pause-at` /
  `--resume-at` понижает и пороги кодировщика; выше кадровых их не поставить.
- Все пороги — параметры CLI (`--pause-at`, `--resume-at`, `--abort-at`,
  `--encode-pause-at`, `--encode-resume-at`, `--duty`, `--min-rest`, `--batch-size`, `--batch-break`, `--poll-interval`,
  `--max-pause`). Повышать их на ноутбуке нельзя; занижать для проверки — можно.

Коды выхода: `0` — готово, `2` — отказ запуска (нет датчика, батарея, замок),
`3` — аварийная остановка.

### Проверить защиту без модели

```powershell
cd tools\generation
python thermal.py check --samples 3            # датчик, питание, замок
# пустые «кадры» (sleep, без нагрузки) через всю защиту:
python thermal.py simulate --frames 3 --frame-seconds 6 --batch-size 2 --batch-break 12
# заниженные пороги — должна сработать остановка при старте (код 3):
python thermal.py simulate --pause-at 50 --resume-at 40 --abort-at 55
# пауза, которая не дождётся остывания (код 3 через 15 с):
python thermal.py simulate --pause-at 55 --resume-at 45 --max-pause 15
```

`thermal.py` использует только стандартную библиотеку — работает на любом
Python 3.12 без venv.

### Тесты

```powershell
cd tools\generation
python -m unittest discover -s tests -v
```

Без реального датчика и без модели: пороги, гистерезис, скважность, пачки,
сторож посреди кадра, разбор вывода `typeperf` и `nvidia-smi`, замок, лог,
каталог и манифест (в том числе сверка словаря тегов с `library.ts`). Работает
и через `pytest`, если он установлен. В CI Python не добавлен.

## Каталог промптов (`prompts.json`)

- `style` — общий стиль, добавляется в конец каждого промпта.
- `scenes[]`: `id` (строчные латинские буквы, цифры, `-`; никогда не
  переиспользуется для другого кадра), `priority` (1 — пробелы прототипа и
  скримеры, 2 — второй кадр на локацию, 3 — разнообразие), `tags` (`location`,
  `motifs`, `people`, `mood`, `time` — строго из словаря `library.ts`), `scene`
  (описание сцены по-английски), необязательный `seed`.
- Порядок генерации — по приоритету, затем по порядку в файле. Уже
  существующие кадры (файл в `stills/` или запись в `library.json`)
  пропускаются.
- Кадры-скримеры — `mood: "scare"`, обычно `people: "face"`.

Посмотреть план без загрузки модели:

```powershell
python generate.py --dry-run --limit 10
```

## Ноутбук: Intel Core Ultra 7 258V, Arc 140V (16 ГБ общей памяти), 32 ГБ RAM

Память видеокарты общая с системной, поэтому модель грузится в два этапа
(`--pipeline two-stage`, по умолчанию): сначала текстовый кодировщик (Qwen3-4B,
8 ГБ bf16) кодирует промпты всего запуска и выгружается, затем грузится
трансформер. Полный трансформер в bf16 — 12,3 ГБ: вместе с остальными
программами в 32 ГБ он не помещается, поэтому на ноутбуке берётся тот же
трансформер, квантованный в GGUF Q6_K (5,9 ГБ,
[unsloth/Z-Image-Turbo-GGUF](https://huggingface.co/unsloth/Z-Image-Turbo-GGUF),
Apache-2.0). Кодировщик работает на видеокарте (умолчание) и выгружается до
загрузки трансформера; на CPU его не запускать — перегрев (D-026, замеры
ниже).

Пачка 2026-10-09 (10 кадров, ноутбук от сети; лог —
`logs/batch10-2026-10-09.csv`):

| Этап | Время | Температура до → пик → после | Память |
|---|---|---|---|
| Загрузка кодировщика (XPU) | 12 с | 70 → 70 → 63 °C | — |
| Первый промпт (XPU) | 3,3 с | 56 → 67 → 64 °C | — |
| Следующие промпты (XPU) | 0,4 с | 60–66 → 62–66 °C | — |
| Кадр 1280×720, 8 шагов (XPU) | 56–60 с | 55–66 → **83–86** → 70–75 °C | 7,7 ГиБ на видеокарте (9,4 ГиБ зарезервировано), пик процесса 14,5 ГиБ |

Пачка прошла за 21 минуту без пауз и аварийных остановок: пять промптов
закодированы, пять взяты из кэша. Вместе с обязательным отдыхом — около 2 минут
на кадр. У первого кадра пик 89 °C: в те же секунды на ноутбуке шли сборка и
тесты, так что **параллельно с генерацией ничего тяжёлого не запускать**. Пик
кадра 83–86 °C — выше порога паузы (он проверяется перед кадром) и в 4–7
градусах от остановки; при опросе раз в 5 секунд пробный прогон 2026-10-08
показывал 81 °C, то есть короткие пики тогда не попадали в лог.

Кодирование промптов на CPU — запасной путь, которым пользоваться не нужно
(замеры 2026-10-09, `--encoder-device cpu`, 4 потока):

| Этап | Время | Температура до → пик → после |
|---|---|---|
| Загрузка кодировщика (CPU) | 12 с | 67 → 84 → 67 °C |
| Промпт (CPU) | 11–13 с | 63–74 → **88–89** → 73–78 °C |

Без ограничения потоков и одним куском (пробный прогон 2026-10-08) было
61 → 89 °C за 19 секунд. Ограничение потоков пик не снимает.

### Кэш промптов

Закодированные промпты лежат в `cache/embeds/` (вне git): файл на промпт, ключ —
модель, тип чисел и текст промпта. Повторный запуск кодировщик не грузит, если
все промпты уже в кэше. Изменился текст сцены или общий стиль — промпт
кодируется заново.

```powershell
# только закодировать промпты (без трансформера и кадров)
.\.venv\Scripts\python.exe generate.py --profile laptop --encode-only --limit 10
```

Кэш не зависит от устройства: его можно наполнить на компьютере
(`--profile desktop --encode-only --limit 40`) и скопировать папку
`cache/embeds` на ноутбук. `--no-embed-cache` отключает кэш, `--embed-cache DIR`
переносит его.

### Установка (один раз)

```powershell
cd tools\generation
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
# PyTorch с поддержкой Intel GPU (XPU)
.\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/xpu
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
# проверка: True и имя видеокарты
.\.venv\Scripts\python.exe -c "import torch; print(torch.xpu.is_available(), torch.xpu.get_device_name(0))"
```

Скачать модель заранее (иначе скачается при первом запуске):

```powershell
.\.venv\Scripts\python.exe -c "from huggingface_hub import snapshot_download as s, hf_hub_download as h; s('Tongyi-MAI/Z-Image-Turbo', ignore_patterns=['assets/*', 'transformer/diffusion_pytorch_model-*']); h('unsloth/Z-Image-Turbo-GGUF', 'z-image-turbo-Q6_K.gguf')"
```

Объём: кодировщик, токенайзер и VAE из официального репозитория — 8,2 ГБ,
трансформер Q6_K — 5,9 ГБ, всего около 14 ГБ (на 8 МБ/с — около получаса).
Режим `HF_HUB_OFFLINE=1` не использовать: загрузчик токенайзера ищет
необязательный файл и без сети падает.

### Запуск

```powershell
cd tools\generation
python thermal.py check                    # должно быть "ready"
.\.venv\Scripts\python.exe generate.py --profile laptop `
  --gguf unsloth/Z-Image-Turbo-GGUF/z-image-turbo-Q6_K.gguf --limit 1
```

`--limit` — сколько кадров за запуск (по умолчанию 10 — одна пачка). Перед
загрузкой модели скрипт убеждается, что температура ниже порога паузы. На время
пачки закрыть сборки, тесты и другие тяжёлые программы: они добавляют к пику
кадра несколько градусов.

### Если XPU не работает: OpenVINO

Запасной путь, если PyTorch XPU не видит видеокарту или падает: OpenVINO GenAI
(`pip install openvino-genai`) с моделью, сконвертированной в OpenVINO IR
(`optimum-cli export openvino --model Tongyi-MAI/Z-Image-Turbo --weight-format int4 z-image-ov`,
готовая конвертация сообщества — `HelloSun/Z-Image-Turbo-OpenVINO-INT4`). Этот
путь в `generate.py` не реализован и не проверялся: на ноутбуке работает XPU
(см. пробный прогон выше). Если понадобится — отдельной задачей, но обязательно
через тот же `ThermalGuard`.

## Компьютер: RTX 5070 Ti (16 ГБ видеопамяти, Blackwell), 96 ГБ RAM

RTX 50xx требует PyTorch под **CUDA 12.8 или новее**. Памяти хватает на полный
трансформер в bf16.

### Установка

1. Драйвер NVIDIA — свежий Game Ready или Studio (поддержка CUDA 12.8+;
   проверка: `nvidia-smi` показывает `CUDA Version: 12.8` или выше).
2. Python 3.12 (python.org), Git, репозиторий:

   ```powershell
   git clone https://github.com/pavelmiskevich/37-2-dream.git
   cd 37-2-dream\tools\generation
   py -3.12 -m venv .venv
   .\.venv\Scripts\python.exe -m pip install --upgrade pip
   .\.venv\Scripts\python.exe -m pip install torch --index-url https://download.pytorch.org/whl/cu128
   .\.venv\Scripts\python.exe -m pip install -r requirements.txt
   .\.venv\Scripts\python.exe -c "import torch; print(torch.cuda.is_available(), torch.cuda.get_device_name(0), torch.cuda.get_device_capability(0))"
   ```

   Должно быть `True NVIDIA GeForce RTX 5070 Ti (12, 0)`. Если `False` или
   ошибка `no kernel image is available` — стоит PyTorch не под CUDA 12.8+:
   переставить с `--index-url https://download.pytorch.org/whl/cu128` (или
   `cu129`/`cu130`, если вышли).

3. Модель целиком (~33 ГБ: трансформер хранится в fp32 и при загрузке
   приводится к bf16):

   ```powershell
   .\.venv\Scripts\python.exe -c "from huggingface_hub import snapshot_download as s; s('Tongyi-MAI/Z-Image-Turbo', ignore_patterns=['assets/*'])"
   ```

### Запуск

```powershell
python thermal.py check --profile desktop   # nvidia-smi, должно быть "ready"
.\.venv\Scripts\python.exe generate.py --profile desktop --limit 5        # пробная пятёрка
.\.venv\Scripts\python.exe generate.py --profile desktop --limit 40       # весь каталог
```

Профиль `desktop`: устройство `cuda`, полный bf16, два этапа (текстовый
кодировщик и трансформер по очереди — 16 ГБ видеопамяти не вмещают оба сразу),
лимит температуры GPU 83 °C, `source: "local-desktop"` в манифесте. Если
видеопамяти всё же не хватит — `--pipeline offload` (поочерёдная выгрузка
моделей в RAM) или `--gguf unsloth/Z-Image-Turbo-GGUF/z-image-turbo-Q8_0.gguf`.

### Для сессии Claude Code на компьютере

1. Прочитать `AGENTS.md`, этот файл и `docs/generation-plan.md`.
2. Установить окружение по шагам выше, `python thermal.py check --profile desktop`.
3. Завести ветку от `main`, запустить `generate.py --profile desktop --limit N`
   (сначала `--dry-run`), посмотреть кадры.
4. Закоммитить `apps/web/public/library/stills/*.webp` и `library.json`
   (лог температуры — не коммитить, он в `.gitignore`; выдержку — в описание
   PR), открыть PR со ссылкой на задачу. PR сливает основная сессия.

## Будущее: клипы Wan 2.2 TI2V-5B на компьютере (только инструкция)

Не реализовано и на ноутбуке не запускается. Когда дойдёт до клипов:

- Модель — [Wan-AI/Wan2.2-TI2V-5B-Diffusers](https://huggingface.co/Wan-AI/Wan2.2-TI2V-5B-Diffusers),
  Apache-2.0: текст + кадр → видео 1280×704, 24 к/с, до ~5 с (121 кадр).
- В diffusers — `WanImageToVideoPipeline` / `WanPipeline` с этим репозиторием;
  при 16 ГБ видеопамяти — `pipe.enable_model_cpu_offload()` (96 ГБ RAM
  хватает), VAE — `pipe.vae.enable_tiling()`.
- Вход — готовый кадр библиотеки (`stills/<id>.webp`) и короткое описание
  движения (камера медленно наезжает, качели качнулись, свет моргнул).
- Каждый клип — через тот же `ThermalGuard` с профилем `desktop` (83 °C), в
  `apps/web/public/library/clips/<id>.mp4`, запись в `library.json` с
  `kind: "clip"`, `duration`, моделью `Wan-AI/Wan2.2-TI2V-5B`, лицензией,
  промптом, seed и `source: "local-desktop"`.
- Отдельная задача: скрипт клипов, каталог движений, ожидания по времени (минуты
  на клип).
