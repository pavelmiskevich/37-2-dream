# Компьютер с RTX 5070 Ti: кадры и клипы вручную

Инструкция для владельца: как на компьютере с RTX 5070 Ti (16 ГБ видеопамяти,
96 ГБ RAM) своими руками делать для сна **кадры** (Z-Image-Turbo) и
**видеоклипы** (Wan 2.2) по готовым промптам и отдавать их на проверку.
Claude Code на компьютер не ставится. Задачи — #126 (кадры) и #39 (клипы).

## План на один вечер

| Шаг | Что | Время |
|---|---|---|
| 1 | Поставить ComfyUI и скачать модели (разделы 1–2, 3.1, 5.1) | 30–60 мин, в основном загрузка |
| 2 | **Кадры**: 25 штук по списку из раздела 4 | ~1 час с отбором |
| 3 | **Клипы**: начать с трёх основных и варенья (раздел 6), поставить в очередь и оставить | 5–15 мин на клип |
| 4 | Перенести PNG и MP4 на ноутбук и написать мне (раздел 7) | 10 мин |

Если время есть только на одно — делайте кадры: их ждёт библиотека, а квота
Hugging Face даёт ноутбуку лишь около 8 кадров в день. Кадры идут по порядку
важности: если не успеете все, сделанные первыми нужнее остальных.

## Как это устроено

```text
компьютер: ComfyUI ──> PNG (кадры) и MP4 (клипы) ──> ноутбук (папка) ──> Claude Code
   Z-Image-Turbo: промпт + seed из этого файла            проверка, WebP/сжатие,
   Wan 2.2: кадр библиотеки + промпт + seed               карты глубины, манифест, PR
```

1. Вы ставите на компьютер ComfyUI — бесплатную программу с окнами, без
   командной строки.
2. Открываете готовый шаблон, вставляете промпт и seed из этого файла, жмёте
   **Run**.
3. Готовые файлы переносите на ноутбук и говорите мне, где они лежат.
4. Я смотрю каждый файл, показываю вам, перевожу в формат библиотеки,
   считаю карты глубины, вношу в манифест и открываю PR. Неудачное —
   переделываете с другим seed.

Модели — только эти две, обе Apache-2.0 (коммерческое использование
разрешено): **Z-Image-Turbo** от Tongyi-MAI и **Wan 2.2 TI2V-5B** от Wan-AI.
Других моделей не скачивать: у многих моделей с сайтов вроде Civitai лицензия
запрещает коммерческое использование (D-022).

## 1. Подготовка компьютера (один раз)

1. **Драйвер NVIDIA.** Свежий Game Ready или Studio — с nvidia.com или через
   NVIDIA App. Проверка в PowerShell: `nvidia-smi` — в шапке
   `CUDA Version: 12.8` или выше и `NVIDIA GeForce RTX 5070 Ti`.
2. **Место на диске.** Не меньше 60 ГБ: модели кадров ~21 ГБ, модели клипов
   ~18 ГБ, сама программа и её Python ~10 ГБ, результаты.
3. **Сон.** На время генерации компьютер не должен засыпать: «Параметры →
   Система → Питание → Переводить в спящий режим при питании от сети:
   Никогда» (на время работы).

**Температура.** Во время генерации держать открытым окно PowerShell с
командой:

```powershell
nvidia-smi --query-gpu=temperature.gpu,power.draw,utilization.gpu,memory.used --format=csv -l 5
```

Нормально — до 75–80 °C. Если **83 °C и выше** — остановить генерацию
(крестик у задачи в очереди или **Cancel**), дать остыть, проверить, что
корпус не закрыт и вентиляторы крутятся. Пик температуры пришлите вместе с
файлами — я запишу его в PR.

## 2. ComfyUI

1. Скачать **ComfyUI Desktop для Windows (NVIDIA)** с официального сайта
   comfy.org (кнопка Download). Бесплатно.
2. Установить. В мастере установки:
   - видеокарта — **NVIDIA (CUDA)**;
   - папка установки — на диске, где есть 60 ГБ (запомните путь: там будут
     модели и готовые файлы);
   - импорт из старой установки — пропустить;
   - остальное по умолчанию.

   Мастер сам скачает Python и PyTorch с поддержкой RTX 50xx — это займёт
   время.
3. Запустить ComfyUI. Откроется окно с графом из прямоугольников (узлов) —
   это нормально.

**Очередь.** Кнопка **Run** не ждёт конца работы: она ставит задачу в очередь
с текущими значениями полей. Пока идёт одна задача, можно поменять промпт,
seed и имя файла и снова нажать **Run** — так в очередь встаёт следующая.
Очередь видна на панели **Queue** слева.

## 3. Кадры: Z-Image-Turbo

### 3.1. Шаблон и модели (один раз)

1. Меню **Workflow → Browse Templates** (или значок шаблонов на левой панели)
   → раздел **Image** → шаблон **Z-Image-Turbo: Text to Image**. Откроется
   граф: один большой узел **Text to Image (Z-Image-Turbo)** и узел **Save
   Image**.
2. ComfyUI покажет окно **«Missing models»** — нажать **Download** у каждого
   файла и дождаться конца. Должны скачаться три файла:

   | Файл | Папка внутри `models` | Размер |
   |---|---|---|
   | `z_image_turbo_bf16.safetensors` | `diffusion_models` | ~12,3 ГБ |
   | `qwen_3_4b.safetensors` | `text_encoders` | ~8 ГБ |
   | `ae.safetensors` | `vae` | ~0,3 ГБ |

   Если окно не появилось, файлы лежат на huggingface.co в репозитории
   `Comfy-Org/z_image_turbo`, папка `split_files`. Скачать и положить в
   указанные папки внутри папки установки, затем перезапустить ComfyUI.
3. Сохранить шаблон себе: **Workflow → Save As** → `dream-still`. Дальше
   открывать его.

### 3.2. Настройка шаблона (один раз)

На большом узле **Text to Image (Z-Image-Turbo)** видны все нужные поля:

| Поле | Значение |
|---|---|
| `prompt` | промпт кадра из раздела 4 — целиком, по-английски |
| `width` × `height` | **`1280`** × **`720`** |
| `seed` | seed кадра из раздела 4 |
| `control after generate` | **`fixed`** — иначе seed поменяется сам, и я не смогу записать его в манифест |
| `steps` | `8` (по умолчанию) |
| `unet_name`, `clip_name`, `vae_name` | не трогать (три файла из таблицы выше) |

На узле **Save Image**: `filename_prefix` — id кадра из раздела 4, например
`elevator-day-open`. Остальное в шаблоне (cfg 1, `res_multistep`, shift 3) не
трогать — это те же настройки, что у Hugging Face, на котором сделаны
прежние кадры.

Сохранить: **Ctrl+S**.

### 3.3. Как сделать кадр

1. Вставить промпт в `prompt`, seed — в `seed`, id — в `filename_prefix`.
2. Нажать **Run**. Первый запуск дольше: модели грузятся в память. Дальше —
   секунды на кадр.
3. Кадр появится в узле **Save Image**; файл — в папке `output` внутри папки
   установки ComfyUI, имя вида `elevator-day-open_00001_.png`.
4. Посмотреть на кадр (см. «Как отбирать» ниже). Годится — следующий кадр.

Удобно ставить кадры в очередь пачкой (см. «Очередь» в разделе 2), а
смотреть потом все вместе.

### 3.4. Как отбирать

Кадр **годится**, если:

- на нём то, что сказано в промпте: место, предметы, время суток;
- это реалистичная фотография на плёнку, а не рисунок и не 3D;
- в обычных кадрах лица людей не видны крупно (люди далеко, спиной или в
  тени). В скримерах (`scare-…`) лицо или фигура крупно — так и задумано;
- нет надписей-каши на весь кадр, водяных знаков, современных телефонов и
  машин.

Кадр **не годится** — поставить seed на 1 больше (`1260101` → `1260102`;
для длинных seed тоже просто +1) и запустить снова. Промпт не менять. Не
вышло с трёх попыток — пропустить и написать мне: я поправлю промпт.
Записывайте, с каким seed вышел принятый кадр, если не с тем, что в списке.

Что-то удачное, но не по промпту (как качели на цепи с неба в
`yard-dusk-swing-hanging`), тоже присылайте — с пометкой: я поправлю теги
под то, что получилось.

## 4. Список кадров (25)

Тот же seed в ComfyUI даёт другую картинку, чем на Hugging Face, — это
нормально: в манифест я запишу, что кадр сделан на компьютере. Промпты
совпадают с каталогом `tools/generation/prompts.json` буква в букву —
вставляйте целиком.

### Спокойные — для вступления и разрядки

**1. `elevator-day-open`** — лифт, seed `1260101`

```text
Indoors, inside a Soviet apartment block: an old elevator cabin standing open on a landing in the afternoon, the doors folded back, scratched wood-grain walls lit by pale daylight from a stairwell window, a burnt-out bulb in the ceiling, nobody, silence. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**2. `stairs-day-stripes`** — лестница, seed `1260102`

```text
Indoors, inside a Soviet apartment block: a long flight of worn concrete stairs going down, afternoon sunlight from a landing window lying in pale stripes across the steps and the painted metal railing, dust hanging in the air, nobody. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**3. `yard-day-snow`** — двор, seed `1260103`

```text
A Soviet courtyard on a quiet snowy morning seen at eye level: fresh untouched snow on a sandbox and on the benches, a swing frozen still under a cap of snow, grey five-storey panel apartment blocks around with a few lit windows, white sky, nobody. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**4. `kitchen-dusk-window`** — кухня, seed `1260104`

```text
A small Soviet kitchen at dusk with the light switched off, the window over the sink glowing deep blue, a jar of jam and a glass of tea in a metal holder on the windowsill, outside the outline of panel blocks with the first lit windows, nobody. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

### Скримеры — чтобы один сон не повторял один и тот же

**5. `scare-stairs-coat`** — лестница, seed `1260113`

```text
A figure in a long dark winter coat suddenly standing on the step right in front of the camera on a dark concrete staircase, its face grey and blank in the flash, eyes black, the railing behind it. Realistic 35mm film photograph, heavy film grain, harsh direct flash, muted desaturated colors, Russia in the 1990s, the logic of a dream, sudden shocking moment.
```

**6. `scare-kitchen-window-face`** — кухня, seed `1260114`

```text
A pale face pressed against the dark kitchen window from outside, high above the courtyard, both hands flat on the glass, eyes wide, net curtains half drawn, the dark kitchen in the foreground. Realistic 35mm film photograph, heavy film grain, harsh direct flash, muted desaturated colors, Russia in the 1990s, the logic of a dream, sudden shocking moment.
```

**7. `scare-thermometer-nurse`** — коридор термометров, seed `1260115`

```text
A nurse in a white cap suddenly bent close to the camera, holding up a long glass thermometer, her face grey and without expression, eyes black, a dark corridor lined with thermometers behind her. Realistic 35mm film photograph, heavy film grain, harsh direct flash, muted desaturated colors, Russia in the 1990s, the logic of a dream, sudden shocking moment.
```

**8. `scare-yard-swing-figure`** — двор, seed `1260116`

```text
A figure in a dark coat suddenly sitting on a swing right in front of the camera in a foggy courtyard at night, its face lifted into the flash, grey skin, eyes black, the chains of the swing in the foreground. Realistic 35mm film photograph, heavy film grain, harsh direct flash, muted desaturated colors, Russia in the 1990s, the logic of a dream, sudden shocking moment.
```

### Лифт, лестница, коридор термометров, варенье, кухня — где кадров меньше всего

**9. `elevator-mirror-37`** — лифт, seed `1260105`

```text
Inside a cramped old Soviet elevator cabin, a cracked mirror on the back wall reflecting only the empty cabin, a scratched floor indicator above the door showing 37, a dim ceiling lamp, burnt marks around the buttons. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**10. `elevator-shaft-open`** — лифт, seed `1260106`

```text
Indoors, inside a Soviet apartment block: elevator doors standing half open on a dark landing onto an empty shaft with no cabin, greasy cables hanging in the dark, a thin strip of yellow light far below, a worn doormat in front of the doors. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**11. `stairs-coats-railing`** — лестница, seed `1260107`

```text
Indoors, inside a Soviet apartment block: dozens of old winter coats hanging on the stair railing all the way up a flight of concrete stairs, like people standing in a queue, nobody inside them, a single dim bulb on the landing. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**12. `stairs-down-37`** — лестница, seed `1260108`

```text
Indoors, inside a Soviet apartment block: a narrow staircase going down, every landing exactly the same, the floor number 37 painted on the wall of each one, the bulbs dead below the second landing, darkness further down. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**13. `thermometer-corridor-doors`** — коридор термометров, seed `1260109`

```text
A long corridor of identical white doors under cold fluorescent light, every door plate reads 37,2, a glass mercury thermometer fixed to each door instead of a handle, worn linoleum, nobody. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**14. `jam-jar-kitchen-flood`** — банка варенья, seed `1260110`

```text
A Soviet kitchen at night with its floor covered by a slowly spreading pool of thick dark red jam from an overturned jar on the table, the jam reflecting a single bare bulb, the legs of the chairs standing in it. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**15. `jam-jar-room-inside`** — банка варенья, seed `1260111`

```text
Seen from inside a giant glass jar: a small furnished room at the bottom of the jar, a bed and a stool half sunk in dark jam, the curved glass walls distorting a kitchen and a window outside, red light filtering through. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**16. `kitchen-fridge-thermometers`** — кухня, seed `1260112`

```text
An old Soviet refrigerator standing open in a dark kitchen at night, its shelves holding nothing but neat rows of glass mercury thermometers, its pale light the only light in the room, a checkered oilcloth on the table. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

### Оставшиеся сцены каталога

**17. `yard-dusk-will-papers`** — двор, seed `365475107`

```text
Typewritten sheets of a last will scattered across the wet asphalt of a courtyard at dusk, stamped and signed, some stuck to a bench and a sandbox, panel apartment blocks behind in blue twilight. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**18. `yard-night-pigeons-window`** — двор, seed `1176289073`

```text
Dozens of pigeons sitting motionless in rows on a snowy courtyard fence at night, all facing the same lit window on the ground floor, a streetlight humming above. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**19. `stairwell-vacuum-sound`** — подъезд, seed `502543917`

```text
A dark stairwell of a panel apartment block, a long vacuum cleaner hose snaking down the stairs from the floor above, at the top of the flight a woman's legs and the hem of a house dress under a bare bulb. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**20. `stairs-thermometers`** — лестница, seed `1767398947`

```text
Concrete stairs of an apartment block with a mercury thermometer lying on every step, glinting under a single dim bulb, leading down to a closed basement door. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**21. `stairs-pigeons-dusk`** — лестница, seed `1746063288`

```text
Pigeons sitting on the steps of an indoor staircase at dusk, the stairwell window broken, feathers on the concrete, dusk light falling in blue stripes across the railings. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**22. `hospital-will-papers`** — больничный коридор, seed `356070734`

```text
A nurse's desk in an empty hospital corridor at night, a typed last will lying under a desk lamp with a fountain pen on top, a rubber stamp, a ventilator hissing somewhere in the dark behind. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**23. `thermometer-corridor-nurse`** — коридор термометров, seed `1633013601`

```text
A nurse in a white cap seen from behind at the far end of a corridor lined with thermometers in glass cases, she holds one up to the lamp to read it, her shadow stretched long across the linoleum. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**24. `bedroom-ventilator-snore`** — спальня, seed `1251886228`

```text
A hospital ventilator with an accordion bellows standing in an ordinary apartment bedroom at night, its tube running under the blanket of a sleeping figure, a wall carpet and a cassette radio on the shelf. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**25. `kitchen-microwave-monitor`** — кухня, seed `15354529`

```text
A dark kitchen at night where the glowing display of an old microwave oven shows a green heartbeat line instead of a clock, its light falling on a plate of cold food and a jar of jam. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

## 5. Клипы: Wan 2.2

### 5.1. Шаблон и модели (один раз)

1. Меню **Workflow → Browse Templates** → раздел **Video** → шаблон **Wan 2.2
   5B** (Text/Image to Video, «ti2v»). Откроется граф.
2. В окне **«Missing models»** скачать три файла:

   | Файл | Папка внутри `models` | Размер |
   |---|---|---|
   | `wan2.2_ti2v_5B_fp16.safetensors` | `diffusion_models` | ~10 ГБ |
   | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `text_encoders` | ~6,7 ГБ |
   | `wan2.2_vae.safetensors` | `vae` | ~1,4 ГБ |

   Если окно не появилось, эти файлы лежат на huggingface.co в репозиториях
   `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` и `Comfy-Org/Wan_2.1_ComfyUI_repackaged`
   (папка `split_files`). Скачать и положить в указанные папки, затем
   перезапустить ComfyUI.
3. Сохранить шаблон себе: **Workflow → Save As** → `dream-clip`.

### 5.2. Настройка шаблона (один раз)

Узел можно найти поиском по двойному щелчку на пустом месте или по
заголовку.

| Узел | Поле | Значение |
|---|---|---|
| **Load Image** | — | Если узел бледный или фиолетовый (отключён) — выделить щелчком и нажать **Ctrl+B**, чтобы включить. Без него получится видео из текста, а нужно из кадра |
| **Wan22ImageToVideoLatent** | `width` × `height` | `1280` × `704` |
| | `length` | `121` (5 секунд при 24 к/с) |
| | `batch_size` | `1` |
| **KSampler** | `seed` | из списка клипов ниже |
| | `control after generate` | **`fixed`** |
| | `steps`, `cfg`, `sampler`, `scheduler` | не трогать (по умолчанию 20, 5, `uni_pc`, `simple`) |
| **CLIP Text Encode** (верхний, зелёный, Positive) | текст | промпт клипа |
| **CLIP Text Encode** (нижний, красный, Negative) | текст | не трогать (стандартный негативный промпт на китайском) |
| **Save Video** / **Create Video** | `fps` | `24` |
| | имя файла (`filename_prefix`) | id клипа, например `clip-yard-swing-alone` |

Сохранить: **Ctrl+S**.

### 5.3. Как сделать клип

1. Скачать входной кадр по ссылке из списка (файл `.webp`).
2. В узле **Load Image** нажать **choose file to upload** и выбрать кадр.
   Кадр 1280×720 программа сама подрежет до 1280×704 по центру.
3. Вставить промпт в верхний **CLIP Text Encode**, seed — в **KSampler**,
   id — в имя файла **Save Video**.
4. Нажать **Run**. Ориентировочно 5–15 минут на клип; первый — дольше.
5. Готовое видео — в узле **Save Video** и в папке `output`.

**Если не хватает видеопамяти** (ошибка `out of memory`): закрыть игры и
браузер с видео, повторить. Не помогло — уменьшить `length` до `97` (4 с).
Кадры и клипы одновременно не запускать: обе модели в видеопамять не влезут.

**Если клип не вышел.** Картинка поплыла, появились лишние люди, лицо
крупно, камера поехала — поставить seed на 10 больше (`390101` → `390111`,
затем `390121`) и запустить снова. Движение слишком слабое или слишком
резкое — напишите мне, я поправлю промпт.

## 6. Список клипов

Общие правила промптов: камера неподвижна, движение одно и медленное, людей и
лица не показывать крупно. Промпт вставлять целиком, по-английски.

### Основные три (#39)

**1. `clip-yard-swing-alone`** — качели раскачиваются сами

- Кадр: `yard-dusk-empty-swing` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/yard-dusk-empty-swing.webp>
- Seed: `390101`
- Промпт:

  ```text
  Static camera, no camera movement. A foggy empty Soviet courtyard at dusk. The old red metal swing slowly starts to swing back and forth by itself, a little higher with every swing, while nobody is around. Wet asphalt, the street lamp glowing in the fog, the apartment blocks and everything else stay completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**2. `clip-yard-vacuum-woman-turn`** — женщина с пылесосом поворачивает голову

- Кадр: `yard-night-vacuum-woman` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/yard-night-vacuum-woman.webp>
- Seed: `390102`
- Промпт:

  ```text
  Static camera, no camera movement. Night in a wet Soviet courtyard. The elderly woman in a dark coat standing beside an old vacuum cleaner slowly turns her head towards the camera and then stays completely still, her face remains hidden in shadow. The empty swing behind her sways very slightly. Fog around the street lamp, lit windows, nothing else moves. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**3. `clip-stairwell-door-opens`** — дверь медленно открывается

- Кадр: `stairwell-door-ajar` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/stairwell-door-ajar.webp>
- Seed: `390103`
- Промпт:

  ```text
  Static camera, no camera movement. A dark Soviet apartment stairwell. The padded double door at the end of the corridor slowly swings open by itself, revealing more dim yellow light behind it, and nobody comes through. Dust floating in the air, deep shadows on the walls, nothing else moves. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

### Варенье и спокойные — к новым кадрам библиотеки

**4. `clip-jam-spoon-drip`** — варенье тянется с ложки

- Кадр: `jam-jar-spoon-viscous` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/jam-jar-spoon-viscous.webp>
- Seed: `390106`
- Промпт:

  ```text
  Static camera, no camera movement. Extreme close-up of a silver teaspoon above an open glass jar. Thick dark cherry jam slowly stretches down from the spoon in one long sticky thread and very slowly drips into the jar, the surface of the jam barely trembling. Nothing else moves. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**5. `clip-yard-laundry-wind`** — бельё колышется во дворе

- Кадр: `yard-day-laundry` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/yard-day-laundry.webp>
- Seed: `390107`
- Промпт:

  ```text
  Static camera, no camera movement. A Soviet courtyard on an overcast day. The white sheets drying on the ropes in the foreground slowly billow and settle in a light wind. The old woman on the distant bench sits completely still with her back to the camera, the panel apartment blocks do not move. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet and calm dream atmosphere.
  ```

**6. `clip-stairwell-sunbeam-dust`** — пыль в солнечном луче на площадке

- Кадр: `stairwell-day-sunlight` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/stairwell-day-sunlight.webp>
- Seed: `390108`
- Промпт:

  ```text
  Static camera, no camera movement. A quiet Soviet apartment stairwell landing in the afternoon. Specks of dust slowly drift and turn in the slanted beam of pale sunlight falling across the steps, the light very slowly dims and brightens as a cloud passes. The stairs, the railing and the plant on the windowsill stay completely still, nobody. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet and calm dream atmosphere.
  ```

**7. `clip-elevator-button-37`** — кнопка 37 мигает

- Кадр: `elevator-buttons-37` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/elevator-buttons-37.webp>
- Seed: `390109`
- Промпт:

  ```text
  Static camera, no camera movement. Close-up of an old elevator button panel full of buttons numbered 37. The glowing button slowly fades out, and a moment later another button numbered 37 lights up by itself, then another. The wood-grain walls and the panel stay completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

### Запасные — если основные не выйдут или захочется ещё

**8. `clip-hospital-ventilator-breathing`** — аппарат дышит

- Кадр: `hospital-corridor-ventilator` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/hospital-corridor-ventilator.webp>
- Seed: `390104`
- Промпт:

  ```text
  Static camera, no camera movement. An empty hospital corridor with pale blue tiles. The hose of the old medical ventilator slowly rises and falls as if the machine were breathing on its own, and the farthest fluorescent tube flickers twice. Nobody is there, nothing else moves. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**9. `clip-bedroom-spider-crawl`** — паук ползёт по потолку

- Кадр: `bedroom-spider-ceiling` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/bedroom-spider-ceiling.webp>
- Seed: `390105`
- Промпт:

  ```text
  Static camera, no camera movement. A dark Soviet-era bedroom at night. The enormous spider on the ceiling slowly moves its long legs and crawls a short distance across the cracked plaster towards the bed, then freezes. Faint light through the curtains, the bed and the room stay still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and dread-filled dream atmosphere.
  ```

## 7. Как отдать результат

1. Взять из папки `output` ComfyUI готовые PNG (кадры) и MP4 (клипы) — имя
   начинается с id. Сжимать и перекодировать не нужно — я сделаю это сам.
   Неудачные попытки не присылать.
2. Перенести на ноутбук любым способом: флешка, облако, сеть. Положить в одну
   папку, например `C:\Users\Asus\Pictures\dream-desktop\` (не в папку
   репозитория).
3. Написать мне: путь к папке и для каждого файла, где что-то отличалось от
   списка, — seed, с которым он вышел; правили ли промпт; пик температуры.

Что делаю я:

- **Кадры:** смотрю каждый и показываю вам; перевожу в WebP 1280×720;
  считаю карты глубины на ноутбуке; вношу в манифест: промпт и seed из
  каталога, модель `Tongyi-MAI/Z-Image-Turbo`, лицензия Apache-2.0, источник —
  компьютер, ComfyUI; если seed другой — правлю его в каталоге; открываю PR.
- **Клипы:** смотрю по кадрам и проверяю длину, размер и частоту кадров;
  сжимаю для веба (MP4 H.264, ~1–3 МБ на клип), кладу в
  `apps/web/public/library/clips/<id>.mp4`; вношу в манифест: `kind: "clip"`,
  длительность, промпт, seed, модель `Wan-AI/Wan2.2-TI2V-5B`, лицензия
  Apache-2.0, источник — компьютер, ComfyUI и id входного кадра; подключаю к
  монтажу и открываю PR с `Closes #39` и адресом сна с клипом.

## Позже

Если ручной режим надоест, на компьютер можно поставить Claude Code и
управлять им с ноутбука через Remote Control — тогда он будет делать всё это
сам. Пока владелец решил работать вручную (2026-11-04).
