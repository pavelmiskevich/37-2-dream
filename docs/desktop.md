# Компьютер с RTX 5070 Ti: клипы вручную

Инструкция для владельца: как на компьютере с RTX 5070 Ti (16 ГБ видеопамяти,
96 ГБ RAM) своими руками делать видеоклипы для сна по готовым промптам и
отдавать их на проверку. Claude Code на компьютер не ставится. Задача — #39.

## Как это устроено

```text
компьютер: ComfyUI + Wan 2.2 TI2V-5B ──> MP4-файлы ──> ноутбук (папка) ──> Claude Code
              кадр библиотеки + промпт                                 проверка, сжатие,
                                                                        манифест, PR
```

1. Вы ставите на компьютер ComfyUI — бесплатную программу с окнами, без
   командной строки.
2. Открываете в ней готовый шаблон Wan 2.2 5B, подставляете кадр из
   библиотеки, промпт и seed из этого файла, жмёте «Run».
3. Готовые MP4 переносите на ноутбук и говорите мне, где они лежат.
4. Я смотрю клипы по кадрам, показываю вам, сжимаю для веба, вношу в манифест
   и подключаю к монтажу. Неудачные — переделываете с другим seed или
   поправленным промптом.

## 1. Подготовка компьютера (один раз)

1. **Драйвер NVIDIA.** Свежий Game Ready или Studio — с nvidia.com или через
   NVIDIA App. Проверка в PowerShell: `nvidia-smi` — в шапке
   `CUDA Version: 12.8` или выше и `NVIDIA GeForce RTX 5070 Ti`.
2. **Место на диске.** Не меньше 40 ГБ: модели ~18 ГБ, сама программа и её
   Python ~10 ГБ, клипы.
3. **Сон.** На время генерации компьютер не должен засыпать: «Параметры →
   Система → Питание → Переводить в спящий режим при питании от сети:
   Никогда» (на время работы с клипами).

## 2. ComfyUI

1. Скачать **ComfyUI Desktop для Windows (NVIDIA)** с официального сайта
   comfy.org (кнопка Download). Бесплатно.
2. Установить. В мастере установки:
   - видеокарта — **NVIDIA (CUDA)**;
   - папка установки — на диске, где есть 40 ГБ (запомните путь: там будут
     модели и готовые видео);
   - импорт из старой установки — пропустить;
   - остальное по умолчанию.

   Мастер сам скачает Python и PyTorch с поддержкой RTX 50xx — это займёт
   время.
3. Запустить ComfyUI. Откроется окно с пустым или стартовым графом из
   прямоугольников (узлов) — это нормально.

## 3. Шаблон Wan 2.2 и модели

1. В ComfyUI: меню **Workflow → Browse Templates** (или значок шаблонов на
   левой панели) → раздел **Video** → шаблон **Wan 2.2 5B** (Text/Image to
   Video, «ti2v»). Откроется граф.
2. ComfyUI покажет окно **«Missing models»** со списком файлов — нажать
   **Download** у каждого и дождаться конца. Должны скачаться три файла:

   | Файл | Папка внутри `models` | Размер |
   |---|---|---|
   | `wan2.2_ti2v_5B_fp16.safetensors` | `diffusion_models` | ~10 ГБ |
   | `umt5_xxl_fp8_e4m3fn_scaled.safetensors` | `text_encoders` | ~6,7 ГБ |
   | `wan2.2_vae.safetensors` | `vae` | ~1,4 ГБ |

   Если окно не появилось, эти файлы лежат на huggingface.co в репозиториях
   `Comfy-Org/Wan_2.2_ComfyUI_Repackaged` и `Comfy-Org/Wan_2.1_ComfyUI_repackaged`
   (папка `split_files`). Скачать и положить в указанные папки внутри папки
   установки, затем перезапустить ComfyUI.

   Модель — Wan 2.2 TI2V-5B от Wan-AI, лицензия Apache-2.0 (коммерческое
   использование разрешено). Других моделей не скачивать: у многих моделей с
   сайтов вроде Civitai лицензия запрещает коммерческое использование.
3. Сохранить шаблон себе: **Workflow → Save As** → `dream-clip`. Дальше
   открывать его.

## 4. Настройка шаблона (один раз)

В графе найти узлы и выставить значения. Узел можно найти поиском по двойному
щелчку на пустом месте или просто по заголовку.

| Узел | Поле | Значение |
|---|---|---|
| **Load Image** | — | Если узел бледный или фиолетовый (отключён) — выделить щелчком и нажать **Ctrl+B**, чтобы включить. Без него получится видео из текста, а нужно из кадра |
| **Wan22ImageToVideoLatent** | `width` × `height` | `1280` × `704` |
| | `length` | `121` (5 секунд при 24 к/с) |
| | `batch_size` | `1` |
| **KSampler** | `seed` | из таблицы клипов ниже |
| | `control after generate` | **`fixed`** — иначе seed поменяется сам, и я не смогу записать его в манифест |
| | `steps`, `cfg`, `sampler`, `scheduler` | не трогать (по умолчанию 20, 5, `uni_pc`, `simple`) |
| **CLIP Text Encode** (верхний, зелёный, Positive) | текст | промпт клипа из таблицы ниже |
| **CLIP Text Encode** (нижний, красный, Negative) | текст | не трогать (там стандартный негативный промпт на китайском) |
| **Save Video** / **Create Video** | `fps` | `24` |
| | имя файла (`filename_prefix`) | id клипа из таблицы, например `clip-yard-swing-alone` |

Сохранить: **Ctrl+S**.

## 5. Как сделать один клип

1. Скачать входной кадр по ссылке из таблицы (файл `.webp`, сохранить куда
   удобно).
2. В узле **Load Image** нажать **choose file to upload** и выбрать кадр.
   Кадр 1280×720 программа сама подрежет до 1280×704 по центру.
3. Вставить промпт клипа в верхний **CLIP Text Encode**, seed — в
   **KSampler**, id — в имя файла **Save Video**.
4. Нажать **Run** (или **Queue**). Прогресс — зелёная рамка на работающем
   узле и полоса вверху. Первый запуск дольше: модели грузятся в память.
   Ориентировочно 5–15 минут на клип.
5. Готовое видео появится в узле **Save Video** — посмотреть прямо там. Файл —
   в папке `output` внутри папки установки ComfyUI.

**Температура.** Во время генерации держать открытым окно PowerShell с
командой:

```powershell
nvidia-smi --query-gpu=temperature.gpu,power.draw,utilization.gpu,memory.used --format=csv -l 5
```

Нормально — до 75–80 °C. Если **83 °C и выше** — остановить генерацию
(крестик у задачи в очереди или **Cancel**), дать остыть, проверить, что
корпус не закрыт и вентиляторы крутятся. Цифры пика пришлите вместе с
клипами — я запишу их в PR.

**Если не хватает видеопамяти** (ошибка `out of memory`): закрыть игры и
браузер с видео, повторить. Не помогло — уменьшить `length` до `97` (4 с).

## 6. Клипы для #39

Общие правила промптов: камера неподвижна, движение одно и медленное, людей и
лица не показывать крупно. Стиль — как у кадров библиотеки. Промпт вставлять
целиком, по-английски.

### Основные три

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

### Запасные — если основные не выйдут или захочется ещё

**4. `clip-hospital-ventilator-breathing`** — аппарат дышит

- Кадр: `hospital-corridor-ventilator` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/hospital-corridor-ventilator.webp>
- Seed: `390104`
- Промпт:

  ```text
  Static camera, no camera movement. An empty hospital corridor with pale blue tiles. The hose of the old medical ventilator slowly rises and falls as if the machine were breathing on its own, and the farthest fluorescent tube flickers twice. Nobody is there, nothing else moves. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and unsettling dream atmosphere.
  ```

**5. `clip-bedroom-spider-crawl`** — паук ползёт по потолку

- Кадр: `bedroom-spider-ceiling` —
  <https://github.com/pavelmiskevich/37-2-dream/raw/main/apps/web/public/library/stills/bedroom-spider-ceiling.webp>
- Seed: `390105`
- Промпт:

  ```text
  Static camera, no camera movement. A dark Soviet-era bedroom at night. The enormous spider on the ceiling slowly moves its long legs and crawls a short distance across the cracked plaster towards the bed, then freezes. Faint light through the curtains, the bed and the room stay still. Realistic 35mm film footage, heavy film grain, muted desaturated colors, quiet, uneasy and dread-filled dream atmosphere.
  ```

### Если клип не вышел

- Картинка поплыла, появились лишние люди, лицо крупно, камера поехала —
  поставить seed на 1 больше (`390101` → `390111`, затем `390121` и т. д.) и
  запустить снова. Промпт не менять.
- Движение слишком слабое или слишком резкое — напишите мне, я поправлю
  промпт.
- Записывайте, с каким seed вышел удачный клип.

## 7. Как отдать клипы на проверку

1. Взять из папки `output` ComfyUI готовые MP4 (имя начинается с id клипа).
   Сжимать и перекодировать не нужно — я сделаю это сам.
2. Перенести на ноутбук любым способом: флешка, облако, сеть. Положить в одну
   папку, например `C:\Users\Asus\Videos\dream-clips\` (не в папку
   репозитория).
3. Написать мне: путь к папке и для каждого клипа — seed, с которым он вышел,
   если не тот, что в таблице; правили ли промпт; пик температуры.

Что делаю я:

- смотрю каждый клип по кадрам и проверяю длину, размер и частоту кадров;
  показываю вам ключевые кадры;
- сжимаю для веба (MP4 H.264, ~1–3 МБ на клип), кладу в
  `apps/web/public/library/clips/<id>.mp4`;
- вношу в манифест: `kind: "clip"`, длительность, промпт, seed, модель
  `Wan-AI/Wan2.2-TI2V-5B`, лицензия Apache-2.0, источник — компьютер,
  ComfyUI и id входного кадра;
- подключаю клипы к монтажу и открываю PR с `Closes #39` и адресом для
  проверки сна с клипом.

## Позже

Если ручной режим надоест, на компьютер можно поставить Claude Code и
управлять им с ноутбука через Remote Control — тогда он будет делать всё это
сам. Пока владелец решил работать вручную (2026-11-04).
