# Компьютер с RTX 5070 Ti: кадры и клипы вручную

Инструкция для владельца: как на компьютере с RTX 5070 Ti (16 ГБ видеопамяти,
96 ГБ RAM) своими руками делать для сна **кадры** (Z-Image-Turbo) и
**видеоклипы** (Wan 2.2) по готовым промптам и отдавать их на проверку.
Claude Code на компьютер не ставится.

> **Теперь можно не вручную (#147, D-042).** Если ComfyUI на компьютере
> слушает сеть Tailscale, кадры и клипы ставит в очередь и забирает Claude
> Code с ноутбука: [tools/comfy/README.md](../tools/comfy/README.md). Вам
> остаются разделы 1–2, 3.1 и 5.1 (поставить ComfyUI и модели, один раз),
> включение сервера по сети (там же, в README), отбор результатов и
> температура. Ручной режим ниже остаётся запасным; промпты клипов из
> раздела 6 лежат и в `tools/comfy/clips.json` — менять их надо в обоих
> местах.

Первая партия — 25 кадров и 9 клипов — сделана 2026-11-22 (#128, #39).
Сейчас в списках **вторая партия** (#132): 30 кадров (раздел 4) и 16 клипов
(раздел 6). Делать её можно самому или поручить другой модели: файл
самодостаточен, в репозиторий исполнителю писать ничего не нужно —
только сделать файлы и положить их в папку (раздел 7).

## План на один вечер

| Шаг | Что | Время |
|---|---|---|
| 1 | Поставить ComfyUI и скачать модели (разделы 1–2, 3.1, 5.1) | 30–60 мин, в основном загрузка |
| 2 | **Кадры**: 30 штук по списку из раздела 4 | ~1–1,5 часа с отбором |
| 3 | **Перезапустить ComfyUI** и сделать **клипы** (раздел 6): поставить в очередь и оставить | 5–15 мин на клип |
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

На узле **Save Image**: `filename_prefix` — id кадра и seed через
подчёркивание, например `yard-day-dandelions_1320104`. Остальное в шаблоне (cfg 1, `res_multistep`, shift 3) не
трогать — это те же настройки, что у Hugging Face, на котором сделаны
прежние кадры.

Сохранить: **Ctrl+S**.

### 3.3. Как сделать кадр

1. Вставить промпт в `prompt`, seed — в `seed`, id — в `filename_prefix`.
2. Нажать **Run**. Первый запуск дольше: модели грузятся в память. Дальше —
   секунды на кадр.
3. Кадр появится в узле **Save Image**; файл — в папке `output` внутри папки
   установки ComfyUI, имя вида `yard-day-dandelions_1320104_00001_.png`.
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
Seed в имени файла поменять вместе с seed в узле. Записывать его отдельно
не нужно: настоящий seed я читаю из самого файла — ComfyUI сохраняет туда
весь граф.

Что-то удачное, но не по промпту (как качели на цепи с неба в
`yard-dusk-swing-hanging`), тоже присылайте — с пометкой: я поправлю теги
под то, что получилось.

## 4. Список кадров (30)

Тот же seed в ComfyUI даёт другую картинку, чем на Hugging Face, — это
нормально. Промпты совпадают с каталогом `tools/generation/prompts.json`
буква в букву — вставляйте целиком.

**Падение с высоты** модели даётся трудно: она охотно рисует окно или
лестницу, но без обрыва. Кадр без ощущения высоты — не годится, seed +1.
Если обрыва нет и с трёх попыток, а кадр сам по себе хороший — пришлите с
пометкой, я сделаю из него обычный кадр места.

### Падение с высоты — самый страшный кошмар

**1. `fall-bed-over-drop`** — спальня, seed `1300104`

```text
High-angle view of a bedroom on the top floor of a nine-storey Soviet apartment block at night whose outer wall is missing, the floor ends in a broken concrete edge right past the foot of the bed, rumpled white sheets hang over the edge, beyond it a sheer drop down the facade to a dark courtyard with tiny street lamps far below, a bedside lamp still on. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**2. `fall-hospital-corridor-edge`** — больничный коридор, seed `1300107`

```text
An empty hospital corridor with pale tiles and humming fluorescent lamps that ends abruptly mid-air, the floor tiles broken off at an edge, beyond it a deep night drop down the side of a tall hospital building to street lamps far below, a wheelchair standing at the edge. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**3. `fall-stairs-missing-flight`** — лестница, seed `1320102`

```text
A flight of worn concrete stairs in a Soviet stairwell that breaks off in mid-air halfway down, the missing steps leave a gap over a deep dark drop of many floors, the handrail goes on alone into the darkness, a single bare bulb above. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

### Спокойные — для вступления и разрядки

**4. `yard-day-dandelions`** — двор, seed `1320104`

```text
A quiet Soviet courtyard on a warm late morning, dandelions in the long grass, a sandbox with a forgotten red bucket, laundry on a line, sunlight on the panel facades, nobody around. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**5. `kitchen-day-tea-glass`** — кухня, seed `1320105`

```text
A glass of tea in a metal holder on an oilcloth table in an old Soviet kitchen in the morning, thin steam rising, a sugar bowl and a plate of bread, sunlight on the tiles, a small radio on the windowsill. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**6. `stairs-day-cat-window`** — лестница, seed `1320106`

```text
A tabby cat asleep on the wide windowsill of a stairwell landing in the afternoon sun, a potted aloe beside it, dust in the light, the worn stairs going up. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**7. `hospital-corridor-day-plants`** — больничный коридор, seed `1320107`

```text
A quiet hospital corridor in the afternoon, tall windows throwing sunlight on the linoleum, potted ficus plants and a row of empty chairs, a round wall clock, nobody around. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

### Скримеры — чтобы один сон не повторял один и тот же

**8. `scare-fall-ground-rushing`** — двор, seed `1300109`

```text
Extreme vertigo, a view straight down while falling from the ninth floor, the concrete wall and windows of a Soviet apartment block streaking past in heavy motion blur at the edges of the frame, the courtyard asphalt with a tiny swing far below rushing up at the camera, no people. Realistic 35mm film photograph, heavy film grain, harsh direct flash, muted desaturated colors, Russia in the 1990s, the logic of a dream, sudden shocking moment.
```

**9. `scare-bedroom-wardrobe-face`** — спальня, seed `1320108`

```text
A grey face with black eyes suddenly peering out of the gap of a dark wardrobe door right next to the camera in a bedroom at night, long thin fingers on the edge of the door. Realistic 35mm film photograph, heavy film grain, harsh direct flash, muted desaturated colors, Russia in the 1990s, the logic of a dream, sudden shocking moment.
```

**10. `scare-elevator-door-figure`** — лифт, seed `1320109`

```text
The doors of an old elevator open onto a tall figure standing right in the doorway, a dark coat, a grey face lit by the flash, eyes black, the landing pitch dark behind it. Realistic 35mm film photograph, heavy film grain, harsh direct flash, muted desaturated colors, Russia in the 1990s, the logic of a dream, sudden shocking moment.
```

**11. `scare-stairs-hands-railing`** — лестница, seed `1320110`

```text
Dozens of pale hands suddenly reaching through the bars of a stairwell railing towards the camera in a pitch-dark stairwell. Realistic 35mm film photograph, heavy film grain, harsh direct flash, muted desaturated colors, Russia in the 1990s, the logic of a dream, sudden shocking moment.
```

### Подъезд, лестница, лифт, коридор термометров, варенье

**12. `stairwell-night-padded-doors`** — подъезд, seed `1320114`

```text
A dim stairwell landing at night with four apartment doors upholstered in quilted brown leatherette, every door numbered 37, one slightly open with a thin line of yellow light, a worn doormat. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**13. `stairwell-chalk-thermometers`** — подъезд, seed `1320115`

```text
Children's chalk drawings covering the floor and walls of a stairwell landing: dozens of thermometers all showing 37.2, a stick figure lying in a bed, a piece of chalk left on the step. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**14. `stairs-water-flowing`** — лестница, seed `1320116`

```text
Water flowing steadily down the worn concrete stairs of a Soviet stairwell like a quiet stream, a bare bulb reflected in it, a single slipper floating down, walls painted green. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**15. `thermometer-corridor-snow`** — коридор термометров, seed `1320119`

```text
A long corridor lined with wall thermometers where snow is falling from the ceiling and lies on the floor in drifts, the mercury of every thermometer at 37.2, a single path of footprints through the snow. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**16. `thermometer-corridor-bath`** — коридор термометров, seed `1320120`

```text
A cast-iron bathtub standing in the middle of a long corridor lined with thermometers, filled to the brim with silver mercury, a towel hanging over its edge. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**17. `jam-jar-swing-inside`** — банка варенья, seed `1320121`

```text
A small swing set standing inside a large glass jam jar on a kitchen windowsill, half sunk in dark cherry jam, the courtyard visible through the glass and the window behind. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**18. `jam-jar-wasp-giant`** — банка варенья, seed `1320122`

```text
A giant wasp the size of a dog trapped inside an enormous jam jar in a dim pantry, its wings stuck in the jam, the lid screwed on, shelves of jars all around. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**19. `jam-jar-pantry-rooms`** — банка варенья, seed `1320123`

```text
Long shelves in a dark pantry lined with jam jars, inside each jar a tiny lit room: a bedroom, a hospital ward, a stairwell, all slowly sinking in dark jam. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**20. `elevator-doors-snow-yard`** — лифт, seed `1320128`

```text
The doors of an old Soviet elevator open not onto a landing but onto a snowy courtyard in daylight, snow drifting into the cabin onto the scratched floor, the button panel glowing. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**21. `elevator-indicator-37`** — лифт, seed `1320129`

```text
Above the closed doors of an old elevator on a dim landing, a mechanical floor indicator where every number reads 37, the call button glowing red, scratched paint on the doors. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

### Двор, больница, спальня, кухня

**22. `yard-night-snow-footprints`** — двор, seed `1320111`

```text
A snowy Soviet courtyard at night under a single street lamp, a line of bare footprints in the fresh snow leads to the swing and stops there, the swing seat empty and slightly swaying, no one around. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**23. `yard-dusk-carpet-beating`** — двор, seed `1320112`

```text
A patterned carpet hung over a metal carpet-beating frame in a Soviet courtyard at dusk, a distant woman in a headscarf standing beside it with a beater raised, frozen mid-motion, lit windows behind. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**24. `yard-day-garages-fog`** — двор, seed `1320113`

```text
A row of rusty metal garages behind Soviet apartment blocks in thick fog, one garage door open onto darkness, a child's bicycle lying on the wet ground, crows on the roofs. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**25. `hospital-nurse-station-night`** — больничный коридор, seed `1320117`

```text
An empty nurses' station in a hospital corridor at night, a desk lamp on, a telephone receiver off the hook hanging by its cord, an old monitor showing a flat green line, a cup of tea still steaming. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**26. `hospital-gurney-sheet`** — больничный коридор, seed `1320118`

```text
A gurney in a dim hospital corridor at night with a figure fully covered by a white sheet, one bare foot showing with a paper tag tied to the toe that reads 37.2, a fluorescent lamp above. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**27. `bedroom-night-wardrobe-ajar`** — спальня, seed `1320124`

```text
A dark Soviet bedroom at night, a tall wooden wardrobe with its door slightly ajar, total darkness inside the gap, a coat sleeve hanging out, faint light from the window across the floor. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**28. `bedroom-night-tv-static`** — спальня, seed `1320125`

```text
An old Soviet television on a lacquered cabinet in a dark bedroom showing grey static, its glow on the rumpled bed and the carpet on the wall, the wall clock stopped at seven past three. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**29. `kitchen-dusk-table-set`** — кухня, seed `1320126`

```text
A kitchen table in an old Soviet apartment at dusk set for many guests, plates of food, glasses of compote and a jar of jam, every chair empty, the light from the window fading. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

**30. `kitchen-night-gas-stove`** — кухня, seed `1320127`

```text
All four burners of an old gas stove burning with blue flames in a dark Soviet kitchen at night, no pots on them, nobody there, the window reflecting the flames. Realistic 35mm film photograph, heavy film grain, muted desaturated colors, faces hidden in shadow, Russia in the 1990s, Soviet-era interiors and courtyards, the logic of a dream, quiet, uneasy and unsettling atmosphere.
```

## Между кадрами и клипами

**Перезапустите ComfyUI.** Обе модели в 16 ГБ видеопамяти не помещаются;
ComfyUI выгрузит модель кадров и сам, но она останется в обычной памяти и
будет мешать длинным клипам. Перезапуск занимает минуту и чистит всё.
Можно и кнопкой **Free model and node cache** (или **Unload Models**), если
она есть в вашей версии.

## 5. Клипы: Wan 2.2

### 5.1. Шаблон и модели (один раз)

1. Меню **Workflow → Browse Templates** → раздел **Video** → шаблон **Wan 2.2
   5B Video Generation**. В каталоге он подписан «Text to Video», но это та
   самая модель TI2V-5B, она умеет и из кадра. Шаблоны с **14B** не брать:
   слишком тяжёлые, и настройки ниже не для них. Откроется граф.
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
| | имя файла (`filename_prefix`) | id клипа и seed, например `clip-roof-edge-toes_391001` (по умолчанию там `video/ComfyUI` — заменить) |

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
крупно, камера поехала — поставить seed на 10 больше (`391001` → `391011`,
затем `391021`) и запустить снова. Движение слишком слабое или слишком
резкое — напишите мне, я поправлю промпт.

## 6. Список клипов (16)

Общие правила промптов: камера неподвижна (кроме клипов падения), движение
одно и медленное, людей и лица не показывать крупно. Промпт вставлять
целиком, по-английски.

Первая партия принята: качели, женщина с пылесосом, дверь (закрывается, а не
открывается — оставлено так), варенье с ложки, бельё, пыль в луче, кнопки
37, паук. `clip-hospital-ventilator-breathing` не двигался ни с одним seed —
в кадре нечему «дышать»; вместо него ниже меха аппарата у кровати и
гаснущие лампы того же коридора.

**Если движения нет** с двух-трёх seed — не мучить дальше: значит, модель
не видит в кадре, чему двигаться. Пропустить и написать мне.

### Падение с высоты — первыми

Единственное исключение из общих правил: здесь **камера движется** — срывается
с края и падает вниз. Неподвижный кадр с наездом падения не передаёт (#137);
настоящее падение даст только видео. Клип годится, если в нём видно само
падение: камера уходит за край и летит вниз, всё смазывается. Если камера
стоит на месте или плавно наезжает — seed +10; не вышло с трёх seed —
пропустить и написать мне.

**1. `clip-fall-roof-plunge`** — камера срывается с края крыши и летит вниз во двор

- Кадр: `fall-roof-edge-yard` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/fall-roof-edge-yard.webp>
- Seed: `391001`
- Промпт:

  ```text
  First-person view from the edge of the flat roof of a nine-storey Soviet apartment block, bare toes at the edge. The camera suddenly tips forward over the edge and falls straight down along the facade towards the courtyard, faster and faster, the rows of windows streaking past upwards, the swing and the asphalt rushing up at the camera. Realistic 35mm film footage, heavy film grain, strong motion blur, muted desaturated colors, terrifying dream atmosphere.
  ```

**2. `clip-fall-stairwell-drop`** — камера падает в пролёт лестницы

- Кадр: `fall-stairwell-well-down` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/fall-stairwell-well-down.webp>
- Seed: `391002`
- Промпт:

  ```text
  First-person view looking down a flight of stairs in a Soviet stairwell. The camera suddenly pitches forward and falls down the stairwell, tumbling, the railings and the steps streaking past, the tiled floor far below rushing up at the camera. Realistic 35mm film footage, heavy film grain, strong motion blur, muted desaturated colors, terrifying dream atmosphere.
  ```

**3. `clip-fall-balcony-drop`** — камера падает с балкона в туман

- Кадр: `fall-balcony-no-railing` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/fall-balcony-no-railing.webp>
- Seed: `391003`
- Промпт:

  ```text
  First-person view from a high balcony of a Soviet apartment block at night over a foggy street. The camera tips over the railing and falls down past the balconies of the lower floors, faster and faster, the street lamps in the fog rushing up at the camera. Realistic 35mm film footage, heavy film grain, strong motion blur, muted desaturated colors, terrifying dream atmosphere.
  ```

**4. `clip-fall-elevator-drop`** — камера проваливается сквозь пол лифта в шахту

- Кадр: `fall-elevator-no-floor` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/fall-elevator-no-floor.webp>
- Seed: `391004`
- Промпт:

  ```text
  Inside an old Soviet elevator cabin with a hole in the floor. The camera drops through the hole into the dark elevator shaft and falls, the greasy cables and the thin lit outlines of the landing doors flashing past upwards, faster and faster. Realistic 35mm film footage, heavy film grain, strong motion blur, muted desaturated colors, terrifying dream atmosphere.
  ```

### Аппарат ИВЛ — вместо неподвижного коридора

**5. `clip-bedroom-ventilator-bellows`** — меха аппарата у кровати сжимаются и разжимаются

- Кадр: `bedroom-ventilator-snore` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/bedroom-ventilator-snore.webp>
- Seed: `391005`
- Промпт:

  ```text
  Static camera, no camera movement. A sleeping man in a bed connected by a tube to a large machine with accordion bellows. The bellows of the machine slowly expand and contract in a steady rhythm like breathing, the tube moves slightly with each breath, and the man's chest rises and falls. Nothing else in the room moves. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**6. `clip-hospital-lamps-go-out`** — лампы в коридоре гаснут одна за другой

- Кадр: `hospital-corridor-ventilator` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/hospital-corridor-ventilator.webp>
- Seed: `391006`
- Промпт:

  ```text
  Static camera, no camera movement. An empty hospital corridor with pale blue tiles and a row of fluorescent lamps on the ceiling. The farthest lamp flickers and goes dark, then the next one, and the next, the darkness slowly coming down the corridor towards the camera, then all lamps light up again at once. The walls, the floor and the machine stay completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and dread-filled dream atmosphere.
  ```

### Тихие — для вступления и разрядки

**7. `clip-yard-snow-falling`** — во дворе начинается снег

- Кадр: `yard-day-snow` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/yard-day-snow.webp>
- Seed: `391007`
- Промпт:

  ```text
  Static camera, no camera movement. A snowy Soviet courtyard with a swing and benches in daylight. Soft snow begins to fall slowly over the empty courtyard and the swing sways very slightly. The buildings stay completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet and calm but strange dream atmosphere.
  ```

**8. `clip-kitchen-curtain-breeze`** — тюль на кухне колышется

- Кадр: `kitchen-window-jam-curtain` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/kitchen-window-jam-curtain.webp>
- Seed: `391008`
- Промпт:

  ```text
  Static camera, no camera movement. An open kitchen window in an old Soviet apartment, a jar of jam on the sill. The net curtain slowly billows inwards and outwards in a light breeze. The jar, the window frame and the courtyard outside stay completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet and calm but strange dream atmosphere.
  ```

### Места и мотивы

**9. `clip-microwave-heartbeat`** — по окну микроволновки бежит пульс

- Кадр: `kitchen-microwave-monitor` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/kitchen-microwave-monitor.webp>
- Seed: `391009`
- Промпт:

  ```text
  Static camera, no camera movement. A dark kitchen with an old microwave oven on the counter. The green heartbeat line on the microwave door slowly runs from left to right like a hospital monitor and the green digits flicker. The plate of food and the kitchen stay completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**10. `clip-stairs-coats-sway`** — пальто на перилах качаются, будто кто-то прошёл

- Кадр: `stairs-coats-railing` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/stairs-coats-railing.webp>
- Seed: `391010`
- Промпт:

  ```text
  Static camera, no camera movement. A Soviet stairwell with many coats hanging along the stair railing. The coats sway slightly one after another from the bottom of the stairs to the top, as if someone invisible walked up past them. The stairs, the walls and the lamp stay completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**11. `clip-yard-pigeons-turn`** — голуби на ограде разом поворачивают головы

- Кадр: `yard-night-pigeons-window` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/yard-night-pigeons-window.webp>
- Seed: `391011`
- Промпт:

  ```text
  Static camera, no camera movement. A row of pigeons sitting on a low fence in front of a Soviet apartment block at night. All the pigeons slowly turn their heads towards the camera at the same moment and then stay completely still. The building, the street lamp and the windows do not move. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**12. `clip-elevator-mirror-figure`** — фигура в зеркале лифта поднимает голову

- Кадр: `elevator-mirror-37` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/elevator-mirror-37.webp>
- Seed: `391012`
- Промпт:

  ```text
  Static camera, no camera movement. Inside an old Soviet elevator cabin with a cracked mirror on the back wall. The hooded figure reflected in the mirror slowly raises its head, while the cabin in front of the mirror stays empty. The lamp and the 37 on the display stay still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and dread-filled dream atmosphere.
  ```

**13. `clip-jam-flood-spread`** — варенье растекается по столу и капает

- Кадр: `jam-jar-kitchen-flood` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/jam-jar-kitchen-flood.webp>
- Seed: `391013`
- Промпт:

  ```text
  Static camera, no camera movement. A tipped-over jar of dark jam on a kitchen table. The jam slowly spreads across the table from the jar and starts to drip over the edge. The kitchen and the chairs stay completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**14. `clip-stairwell-vacuum-hose`** — шланг пылесоса сползает по ступеньке

- Кадр: `stairwell-vacuum-sound` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/stairwell-vacuum-sound.webp>
- Seed: `391014`
- Промпт:

  ```text
  Static camera, no camera movement. A dark stairwell, a vacuum cleaner hose lying down the stairs from a woman standing at the top. The hose twitches and slowly slides down one step like a living thing. The woman's legs and the stairs stay completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and dread-filled dream atmosphere.
  ```

**15. `clip-thermometer-door-light`** — дальняя дверь коридора приоткрывается, полоска света

- Кадр: `thermometer-corridor-doors` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/thermometer-corridor-doors.webp>
- Seed: `391015`
- Промпт:

  ```text
  Static camera, no camera movement. A long pale corridor with numbered doors and thermometers on the walls. The farthest door slowly opens a little, letting a strip of light out onto the floor, then the light goes out. Nothing else moves. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**16. `clip-fridge-light-flicker`** — свет в открытом холодильнике мигает

- Кадр: `kitchen-fridge-thermometers` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/kitchen-fridge-thermometers.webp>
- Seed: `391016`
- Промпт:

  ```text
  Static camera, no camera movement. An old fridge standing open in a dark kitchen, its shelves full of thermometers. The light inside the fridge flickers and the glass thermometers glint, then the fridge door slowly swings a little towards closing. The kitchen stays completely still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

## 7. Как отдать результат

1. Взять из папки `output` ComfyUI готовые PNG (кадры) и MP4 (клипы) — имя
   начинается с id. Сжимать и перекодировать не нужно — я сделаю это сам.
   Неудачные попытки не присылать.
2. Перенести на ноутбук любым способом: флешка, облако, сеть. Положить в одну
   папку, например `C:\Users\Asus\Pictures\dream-desktop\` (не в папку
   репозитория).
3. Написать мне путь к папке; правили ли промпт; пик температуры. Seed
   писать не нужно: он в имени файла, а настоящий я читаю из метаданных.

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

Ручной режим заменён сетевым (2026-11-26, #147): Claude Code на ноутбуке
управляет ComfyUI компьютера через его API, ставить Claude Code на
компьютер не понадобилось.
