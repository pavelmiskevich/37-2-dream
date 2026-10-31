# Внешние ассеты

Правило проекта: внешние ассеты — только CC0 (AGENTS.md). У каждого записаны
файл в репозитории, источник, автор, лицензия и строка атрибуции источника
дословно. Кадры и клипы библиотеки сюда не входят: они сгенерированы моделями
проекта, их происхождение — в `apps/web/public/library/library.json`.

## Звуки пробуждения

Записи с [Freesound](https://freesound.org) через Openverse (D-031), выбраны
владельцем 2026-10-31 (#68), подключены к пробуждению (D-032). Каталог
кандидатов — [sounds/openverse.json](sounds/openverse.json).

Исходник каждой — превью Freesound в MP3 (поле `url` каталога, оригинал без
входа недоступен). Обработка одна для всех: ffmpeg вырезает фрагмент,
сводит в моно 44,1 кГц, выравнивает громкость (интегральная громкость
EBU R128: короткие записи −20 LUFS, тон комнаты −30 LUFS; пик не выше −1 dBFS)
и кодирует в MP3 (96 кбит/с, тон комнаты — 64 кбит/с), без тегов.

### `apps/web/public/sounds/snore.mp3` — храп

- Источник: [Male Snore 1](https://freesound.org/people/mattyharm/sounds/432997)
- Автор: mattyharm
- Лицензия: CC0 1.0
- Атрибуция: "Male Snore 1.wav" by mattyharm is marked with CC0 1.0. To view the terms, visit https://creativecommons.org/publicdomain/zero/1.0/.
- Обработка: фрагмент 4,55–7,05 с (один тяжёлый вдох с храпом), затухание
  0,3 с в конце; +2,2 дБ.

### `apps/web/public/sounds/microwave.mp3` — микроволновка

- Источник: [Microwave Oven](https://freesound.org/people/Filmscore/sounds/268525)
- Автор: Filmscore
- Лицензия: CC0 1.0
- Атрибуция: "Microwave Oven.wav" by Filmscore is marked with CC0 1.0. To view the terms, visit https://creativecommons.org/publicdomain/zero/1.0/.
- Обработка: фрагмент 17,4–21,4 с (печь работает и выключается со своим
  писком на 18,58 с); тот же писк (18,56–18,78 с) наложен ещё дважды через
  0,6 и 1,2 с — три писка, как у монитора сна; затухание 0,6 с в конце;
  −6,1 дБ.

### `apps/web/public/sounds/bed-creak.mp3` — скрип кровати

- Источник: [bed springs old noisy various creaks and movements get up sit down3](https://freesound.org/people/kyles/sounds/635480)
- Автор: kyles
- Лицензия: CC0 1.0
- Атрибуция: "bed springs old noisy various creaks and movements get up sit down3.flac" by kyles is marked with CC0 1.0. To view the terms, visit https://creativecommons.org/publicdomain/zero/1.0/.
- Обработка: фрагмент 27,4–31,0 с (кто-то ворочается на старых пружинах),
  затухание 0,6 с в конце; +7,0 дБ (ограничено пиком, −23 LUFS).

### `apps/web/public/sounds/kettle.mp3` — чайник

- Источник: [Tea kettle boiling whistling](https://freesound.org/people/sethlind/sounds/265017)
- Автор: sethlind
- Лицензия: CC0 1.0
- Атрибуция: "Tea kettle boiling whistling.wav" by sethlind is marked with CC0 1.0. To view the terms, visit https://creativecommons.org/publicdomain/zero/1.0/.
- Обработка: фрагмент 12,4–21,0 с (свист в полную силу, чайник снимают с
  плиты на 15,0 с, кипение стихает), нарастание 0,3 с и затухание 1,5 с;
  −7,3 дБ.

### `apps/web/public/sounds/room-hallway.mp3` — тон комнаты, коридор

- Источник: [room tone apartment hallway quiet night fluorescent light hum and distant noises and police siren Montreal, Canada](https://freesound.org/people/kyles/sounds/635718)
- Автор: kyles
- Лицензия: CC0 1.0
- Атрибуция: "room tone apartment hallway quiet night fluorescent light hum and distant noises and police siren Montreal, Canada.flac" by kyles is marked with CC0 1.0. To view the terms, visit https://creativecommons.org/publicdomain/zero/1.0/.
- Обработка: петля 19 с из фрагмента 40–60 с (без сирены): 41–60 с, первая
  секунда фрагмента (40–41 с) вплетена кроссфейдом в последнюю, так что конец
  переходит в начало без шва; +1,9 дБ.

### `apps/web/public/sounds/room-hall.mp3` — тон комнаты, подъезд

- Источник: [indoor_ apartments_hall_noise 2](https://freesound.org/people/Kostrava/sounds/333960)
- Автор: Kostrava
- Лицензия: CC0 1.0
- Атрибуция: "indoor_ apartments_hall_noise 2" by Kostrava is marked with CC0 1.0. To view the terms, visit https://creativecommons.org/publicdomain/zero/1.0/.
- Обработка: петля 19 с из фрагмента 60–80 с, как у `room-hallway.mp3`;
  +31,4 дБ (запись очень тихая, около −61 LUFS).
