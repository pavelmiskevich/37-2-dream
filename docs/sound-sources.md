# Источники звука: Openverse

Решение — D-031. Каталог кандидатов —
[assets/sounds/openverse.json](../assets/sounds/openverse.json).

Основа звука сна — синтезатор `apps/web/src/audio` (D-011): монитор, ИВЛ,
пылесос → турбина, гул, дыхание, кухня, скрип качелей и удар скримера
считаются в браузере и меняются вместе со сном. Записи нужны для того, что
синтез не передаёт достоверно, — прежде всего бытовой реальности, которая
просачивается в сон (D-020): храп, микроволновка, чайник, холодильник, кровать.
Эти записи пока только **кандидаты**: в репозитории нет ни одного аудиофайла,
приложение их не играет.

## Что такое Openverse

[Openverse](https://openverse.org) — поисковик по открыто лицензированным
медиа (проект WordPress). Для звука он собирает Freesound, Jamendo, Wikimedia
и другие источники: около 5,2 млн аудиофайлов, из них порядка 590 тыс.
звуковых эффектов. У каждого результата сразу есть лицензия, ссылка на
страницу автора и готовая строка атрибуции.

## Как искать

```text
GET https://api.openverse.org/v1/audio/?q=<запрос>&license=cc0&source=freesound&page_size=20
```

- **Только `license=cc0`.** Правило проекта: внешние ассеты — только CC0
  (AGENTS.md). CC BY не берём, даже если запись хорошая. Public Domain Mark
  (`pdm`) — только после отдельного согласия владельца.
- **Только `source=freesound`.** Jamendo — музыка, а сну музыка не нужна.
- Ключ не нужен. Анонимно — около 200 поисковых запросов в сутки; API бывает
  медленным: первый запрос по новой фразе часто идёт дольше 30 с, иногда
  отвечает 500. Поэтому таймаут 60 с, один повтор, пауза 2–3 с между
  запросами, сырые ответы — во временную папку вне репозитория.
- Один запрос на тип звука, по-английски, двумя-тремя словами
  (`snoring`, `bed creak`, `fluorescent light hum`). Слишком точная фраза
  (`wind courtyard`) находит почти ничего.
- Отбор — по названию, тегам, длительности и описанию на странице Freesound.
  Тон проекта: реалистично, бытово, тревожно. Не берём мультяшное
  (`cartoon`), игровое, музыкальное, стилизованное (зомби, монстры, «хоррор»
  с эффектами) и учебные синтетические заготовки.

### Поля результата

| Поле | Что это |
|---|---|
| `id` | id записи в Openverse |
| `foreign_landing_url` | страница звука на Freesound — там его слушают |
| `url` | прямая ссылка на файл: превью Freesound в MP3 (`cdn.freesound.org/previews/…-hq.mp3`, ~128–190 кбит/с), скачивается без ключа |
| `alt_files` | оригинал (WAV/FLAC) — через API Freesound, нужен вход; для сна хватает превью |
| `duration` | длительность, мс |
| `attribution` | готовая строка атрибуции — копировать **без изменений** |

### Атрибуция

CC0 атрибуции не требует, но проект всё равно записывает источник каждого
внешнего ассета в `assets/CREDITS.md` (AGENTS.md). Когда запись попадёт в
приложение, в `CREDITS.md` идёт её поле `attribution` дословно и ссылка
`foreign_landing_url`. Пока записи не используются, `CREDITS.md` не трогаем.

## Кандидаты

Поиск 2026-10-30: 38 запросов к API, из них 24 ответили (по одному на тип
звука), 14 упали — 12 по таймауту, 2 с ошибкой 500. В каталоге 25 типов и 88
кандидатов, все CC0 1.0 с Freesound. Ссылки `url` рабочие: два превью
(`monitor`, `vacuum`) скачаны во временную папку — MP3 44 и 133 с, как в
`duration`.

«Синтез» — звук уже делает движок `apps/web/src/audio`; запись тогда —
альтернатива или сравнение. «Нужна запись» — синтеза нет.

| Тип звука | Что это во сне | Сейчас | Кандидатов |
|---|---|---|---|
| [`snoring`](#snoring) | храп — правда об ИВЛ (`ventilator → snoring`), пробуждение | нужна запись | 4 |
| [`microwave`](#microwave) | микроволновка — правда о мониторе (`monitor → microwave`) | нужна запись | 4 |
| [`vacuum`](#vacuum) | пылесос за стеной → турбина (`vacuum → cleaning`) | синтез `vacuum` | 4 |
| [`bed_creak`](#bed_creak) | скрип кровати — правда о качелях (`swing_creak → bed_creak`) | нужна запись | 4 |
| [`swing_creak`](#swing_creak) | скрип качелей во дворе | синтез `swing.creak` | 3 |
| [`kettle`](#kettle) | чайник — «принесли чай», пробуждение | нужна запись | 4 |
| [`kitchen`](#kitchen) | кухня за дверью: ложка в стакане, чашка | синтез `kitchen` | 4 |
| [`fridge`](#fridge) | холодильник — гул квартиры | нужна запись (под синтезом `hum`) | 4 |
| [`room_tone`](#room_tone) | тишина комнаты, подъезда | нужна запись (у `silence` своей подложки нет) | 4 |
| [`monitor`](#monitor) | кардиомонитор | синтез `monitor` | 3 |
| [`ventilator`](#ventilator) | ИВЛ | синтез `ventilator` | 1 |
| [`breath`](#breath) | дыхание героя | синтез `breath` | 4 |
| [`pigeons`](#pigeons) | голуби (тег мотива `pigeons`) | нужна запись | 4 |
| [`elevator`](#elevator) | лифт (локация `elevator`) | нужна запись | 4 |
| [`footsteps_stairs`](#footsteps_stairs) | шаги в подъезде (`stairwell`, `stairs`) | нужна запись | 4 |
| [`fluorescent_hum`](#fluorescent_hum) | гул люминесцентной лампы, коридоры | частично: синтез `hum` — сетевой гул | 4 |
| [`dripping_water`](#dripping_water) | капающая вода, долгие планы | нужна запись | 4 |
| [`hospital_ambience`](#hospital_ambience) | больничный коридор (`hospital_corridor`) | нужна запись (там звучит только монитор) | 4 |
| [`wind`](#wind) | ветер во дворе ночью (`yard`) | нужна запись | 1 |
| [`door_slam`](#door_slam) | железная дверь подъезда, лифта; ложная тревога | нужна запись | 4 |
| [`door_creak`](#door_creak) | скрип двери в квартире, подъезде | нужна запись | 2 |
| [`impact`](#impact) | удар скримера | синтез `stinger.hit`; запись — подложка | 4 |
| [`clock`](#clock) | часы в спальне перед сном | нужна запись | 4 |
| [`heartbeat`](#heartbeat) | сердцебиение под долгим планом | нужна запись | 3 |
| [`radiator`](#radiator) | стук батареи, трубы в квартире | нужна запись | 3 |

### snoring

Запрос: `snoring`.

- [Male Snore 1](https://freesound.org/people/mattyharm/sounds/432997) — mattyharm, 34 с. Тяжёлый мужской храп с носовым призвуком; ближе всего к ритму ИВЛ во сне.
- [Snoring](https://freesound.org/people/swapnil_gt/sounds/370336) — swapnil_gt, 87 с. Мужчина храпит в комнате: хватит на петлю под пробуждением.
- [Light snores of a man sleeping](https://freesound.org/people/khenshom/sounds/500803) — khenshom, 35 с. Лёгкий храп спящего мужчины в помещении: тихий вариант для спальни перед сном.
- [Terrible snore](https://freesound.org/people/iampagan/sounds/174453) — iampagan, 56 с. Неровный, хриплый храп с дыханием; проверить, не становится ли смешно.

### microwave

Запрос: `microwave beep`.

- [Microwave Finish](https://freesound.org/people/bmusic92/sounds/232929) — bmusic92, 8 с. Полевая запись: микроволновка заканчивает — те самые писки, которыми оказывается монитор.
- [microwave](https://freesound.org/people/gallagho/sounds/27367) — gallagho, 10 с. Гул мотора микроволновки и писк одним дублем.
- [Microwave](https://freesound.org/people/lmbubec/sounds/119454) — lmbubec, 16 с. Гудение работающей микроволновки и писк.
- [Microwave Oven](https://freesound.org/people/Filmscore/sounds/268525) — Filmscore, 22 с. Микроволновка работает и пищит, на кухне.

### vacuum

Запрос: `vacuum cleaner`.

- [vacuum cleaner nasty hum heard through ceiling](https://freesound.org/people/kyles/sounds/637928) — kyles, 133 с. Пылесос, слышный сквозь потолок: ровно «реальность просачивается» от соседей.
- [Vacuum cleaner 1, type 'Progress Stuttgart'](https://freesound.org/people/ohrpilot/sounds/182012) — ohrpilot, 68 с. Старый пылесос «Progress Stuttgart»: грубее и старше мотор.
- [Vacuum Cleaner](https://freesound.org/people/katfolker/sounds/426880) — katfolker, 160 с. Длинный ровный дубль уборки: подложка на весь сон.
- [Vacuum Cleaner switch on, run, switch off 2](https://freesound.org/people/DJ%20Burnham/sounds/141682) — DJ Burnham, 37 с. Включение, работа, выключение: пылесос, который замолкает, может закончить сон.

### bed_creak

Запрос: `bed creak`.

- [bed springs old noisy various creaks and movements get up sit down3](https://freesound.org/people/kyles/sounds/635480) — kyles, 93 с. Старые шумные пружины кровати, разные скрипы и движения: кто-то ворочается.
- [bed creaking](https://freesound.org/people/krb21/sounds/118605) — krb21, 35 с. Скрип пружин кровати.
- [bedsprings#own#2](https://freesound.org/people/StinkhornAdrian/sounds/390515) — StinkhornAdrian, 20 с. Скрипучие пружины кровати.
- [Foley_Natural_Wood_Bed_Creaks_Mono](https://freesound.org/people/Nox_Sound/sounds/570599) — Nox_Sound, 80 с. Скрип деревянной рамы кровати: суше, ближе к крюкам качелей.

### swing_creak

Запрос: `swing creak`.

- [sfx_swing_hojdacka](https://freesound.org/people/bajko/sounds/387896) — bajko, 17 с. Детские качели: скрип цепи и петли, металл.
- [Train Passing By While Swingset Creaks_Chains](https://freesound.org/people/dannydandanshababaloo/sounds/593172) — dannydandanshababaloo, 40 с. Скрипят цепи качелей, мимо идёт поезд: двор, за которым железная дорога.
- [Creaking and Swinging Gate](https://freesound.org/people/dannydandanshababaloo/sounds/593179) — dannydandanshababaloo, 7 с. Скрипучая качающаяся калитка: запасной скрип для двора.

### kettle

Запрос: `kettle boiling`.

- [Tea kettle boiling whistling](https://freesound.org/people/sethlind/sounds/265017) — sethlind, 28 с. Чайник на плите закипает до свиста.
- [Kettle Boiling Whistle](https://freesound.org/people/blwuens/sounds/515154) — blwuens, 25 с. Чайник закипает до свиста: другой дубль.
- [Electric Kettle Boiling](https://freesound.org/people/mhtaylor67/sounds/126039) — mhtaylor67, 79 с. Электрический чайник закипает, полевая запись: нарастающий гул без свиста.
- [Kettle boils and pouring water](https://freesound.org/people/MariaDelCastillo/sounds/445855) — MariaDelCastillo, 161 с. Чайник закипает, потом наливают воду: весь чай целиком.

### kitchen

Запрос: `spoon stirring cup`.

- [Spoon Stirring Cup](https://freesound.org/people/bolkmar/sounds/424488) — bolkmar, 39 с. Ложка размешивает в чашке, полевая запись.
- [Putting a cup on a table and stirring in it](https://freesound.org/people/jvdicke/sounds/455010) — jvdicke, 8 с. Чашку ставят на стол и размешивают.
- [stirring tea](https://freesound.org/people/taya_yelton/sounds/469237) — taya_yelton, 41 с. Размешивают чай.
- [Kitchen - coffee or tea being poured into mug and stirred](https://freesound.org/people/jodybruchon/sounds/433888) — jodybruchon, 58 с. Чай наливают в кружку и размешивают: кухня за дверью.

### fridge

Запрос: `refrigerator hum`.

- [Refrigerator humming](https://freesound.org/people/RCSound99/sounds/651210) — RCSound99, 31 с. Ровное гудение холодильника, годится в петлю.
- [Refrigerator](https://freesound.org/people/Filmscore/sounds/339980) — Filmscore, 30 с. Гул компрессора холодильника.
- [room tone apartment kitchen night with noisy fridge refrigerator](https://freesound.org/people/kyles/sounds/635715) — kyles, 94 с. Кухня квартиры ночью, шумный холодильник: холодильник вместе с комнатой.
- [Broken Fridge Slowly Going Insane](https://freesound.org/people/lolamadeus/sounds/216664) — lolamadeus, 175 с. Неисправный компрессор гудит неровно: тревожно; проверить, что это не обработка (название стилизованное).

### room_tone

Запрос: `room tone apartment`.

- [Interior bedroom apartment night room tone roomtone](https://freesound.org/people/franciscopcoutinho/sounds/466123) — franciscopcoutinho, 180 с. Спальня квартиры ночью, тон комнаты: основа для спальни.
- [room tone apartment small room quiet +distant drips and traffic haze](https://freesound.org/people/kyles/sounds/637797) — kyles, 87 с. Маленькая тихая комната, далёкие капли и машины.
- [indoor_ apartments_hall_noise 2](https://freesound.org/people/Kostrava/sounds/333960) — Kostrava, 162 с. Холл многоквартирного дома: бетон, далёкий гул — подъезд.
- [room tone apartment hallway quiet night fluorescent light hum and distant noises and police siren Montreal, Canada](https://freesound.org/people/kyles/sounds/635718) — kyles, 171 с. Коридор дома ночью, гудит люминесцентная лампа, далёкие шумы и полицейская сирена.

### monitor

Запрос: `heart monitor beep`.

- [HEART_MONITOR/MACHINE_BEEP](https://freesound.org/people/dansotak/sounds/137698) — dansotak, 70 с. Писк кардиомонитора: настоящий тембр для сравнения с синтезом.
- [heart monitor running, speeding up, flatlining](https://freesound.org/people/vestibule-door/sounds/668979) — vestibule-door, 44 с. Монитор пищит, ускоряется и уходит в прямую линию: вся дуга скримера.
- [heart monitor beep](https://freesound.org/people/gustavo.hanke/sounds/517508) — gustavo.hanke, 10 с. Писк монитора и прямая линия.

### ventilator

Запрос: `ventilator hospital`.

- [Breathing machine](https://freesound.org/people/VoxHumanaMusiCurators/sounds/703025) — VoxHumanaMusiCurators, 36 с. Аппарат дыхания в больнице: единственная настоящая ИВЛ в выдаче.

### breath

Запрос: `breathing`.

- [Male Breathing Slow](https://freesound.org/people/Kodack/sounds/271045) — Kodack, 13 с. Медленное испуганное мужское дыхание.
- [breathing](https://freesound.org/people/launemax/sounds/274769) — launemax, 69 с. Дыхание с тегами «страх», «сон».
- [Breathing, nose, calm](https://freesound.org/people/giddster/sounds/336531) — giddster, 18 с. Спокойное мужское дыхание носом: засыпание.
- [Heavy Breathing](https://freesound.org/people/Shinplaster/sounds/240867) — Shinplaster, 11 с. Тяжёлое мужское дыхание: ожидание перед скримером.

### pigeons

Запрос: `pigeons`.

- [Pigeons and squabs](https://freesound.org/people/BeeProductive/sounds/389409) — BeeProductive, 59 с. Городские голуби на насесте: воркование и хлопки крыльев.
- [Pigeons Taking Off](https://freesound.org/people/AMTR/sounds/138029) — AMTR, 8 с. Голуби взлетают: внезапный шум крыльев, ложная тревога перед скримером.
- [pigeon territorial coo](https://freesound.org/people/5ro4/sounds/649390) — 5ro4, 4 с. Близкое воркование голубя.
- [birds city early morning echo with pigeon on window sill middle1 heavy skyline Montreal, Canada](https://freesound.org/people/kyles/sounds/452444) — kyles, 128 с. Город ранним утром, голубь на подоконнике: может открывать пробуждение.

### elevator

Запрос: `elevator`.

- [Creepy old elevator 2](https://freesound.org/people/bassboybg/sounds/218928) — bassboybg, 45 с. Старый лифт, шестерни и металл: ближе всего к советскому лифту.
- [Creepy old elevator 1](https://freesound.org/people/bassboybg/sounds/218927) — bassboybg, 37 с. Механика старого лифта: второй дубль.
- [Old Elevator](https://freesound.org/people/Dimas3010/sounds/365642) — Dimas3010, 21 с. Открываются двери старого лифта.
- [elevator door cutoff](https://freesound.org/people/tsbertalan/sounds/77790) — tsbertalan, 13 с. Мотор лифта и обрыв дверей, полевая запись.

### footsteps_stairs

Запрос: `footsteps stairs`.

- [0804stairwell](https://freesound.org/people/sagetyrtle/sounds/58407) — sagetyrtle, 86 с. Ботинки по лестнице гулкого подъезда, бинауральная запись.
- [Japan_Matsudo_Hotel_Stairwell_Footsteps](https://freesound.org/people/RutgerMuller/sounds/365412) — RutgerMuller, 19 с. Шаги на лестнице гостиницы с эхом.
- [200112 Footsteps stairs slow med fast walking run up down hotel echo MONTREAL](https://freesound.org/people/TRP/sounds/566416) — TRP, 103 с. Шаги по лестнице от медленных до быстрых, вверх и вниз, с эхом.
- [Footsteps_Up_Stairs](https://freesound.org/people/georgisound/sounds/368832) — georgisound, 22 с. Шаги вверх по бетонной лестнице.

### fluorescent_hum

Запрос: `fluorescent light hum`.

- [Fluorescent lamps in hospital 03](https://freesound.org/people/Daphne_in_Wonderland/sounds/383484) — Daphne_in_Wonderland, 16 с. Люминесцентные лампы в больничном коридоре.
- [neon tube fluorescent light hum cu2](https://freesound.org/people/kyles/sounds/454098) — kyles, 82 с. Гул люминесцентной трубки вблизи, годится в петлю.
- [Noisy old fluorescent light](https://freesound.org/people/Brokkolix/sounds/676841) — Brokkolix, 76 с. Шумная старая люминесцентная лампа.
- [FXLM neon lights flicker bathroom](https://freesound.org/people/LudwigMueller/sounds/202612) — LudwigMueller, 31 с. Мигающая лампа в ванной: мерцание на склейке.

### dripping_water

Запрос: `dripping water`.

- [Juliet Clarke dripping water ](https://freesound.org/people/julietclarke/sounds/444193) — julietclarke, 13 с. Кран капает в раковину, полевая запись.
- [Dripping water - far](https://freesound.org/people/16FPanskaSimonMartin/sounds/497161) — 16FPanskaSimonMartin, 98 с. Раковина капает где-то вдали: квартира ночью.
- [Boiler room_2(dripping water)](https://freesound.org/people/o_ciz/sounds/475509) — o_ciz, 179 с. Подвальная котельная, капает вода: под подъездом.
- [gotejamento - dripping water on shower drain](https://freesound.org/people/hchiurciu/sounds/515361) — hchiurciu, 179 с. Вода капает в слив душа.

### hospital_ambience

Запрос: `hospital corridor ambience`.

- [HOSPITAL - LONG CORRIDOR - ATMO / AMB (02)](https://freesound.org/people/tferrino/sounds/618353) — tferrino, 107 с. Длинный больничный коридор, атмосфера.
- [Room Tone, Empty Hospital](https://freesound.org/people/Kinoton/sounds/670070) — Kinoton, 180 с. Тон пустой больничной палаты, гул вентиляции (нашёлся по «ventilator hospital»).
- [hospital hall3 heavy ventilation, distant sounds, elevator open and cart comes out](https://freesound.org/people/kyles/sounds/451886) — kyles, 34 с. Больничный холл, сильная вентиляция, далёкие звуки, лифт (по «ventilator hospital»).
- [room tone hospital exam room noisy ventilation Montreal, Canada](https://freesound.org/people/kyles/sounds/451922) — kyles, 223 с. Смотровая больницы, шумная вентиляция (по «ventilator hospital»).

### wind

Запрос: `wind courtyard`.

- [windy night](https://freesound.org/people/barkenov/sounds/383161) — barkenov, 142 с. Ветреная ночь: деревья и скрипящая калитка — двор ночью. Единственное попадание: запрос был слишком узким.

### door_slam

Запрос: `metal door slam`.

- [Metal Door Slam Heavy Reverb 1](https://freesound.org/people/Sheyvan/sounds/570004) — Sheyvan, 7 с. Удар тяжёлой железной двери с длинным хвостом эха: дверь подъезда.
- [Metal Door Slamming 1](https://freesound.org/people/rdneubauer/sounds/93781) — rdneubauer, 15 с. Хлопает железная дверь.
- [Large Metal Lift Door Closing](https://freesound.org/people/lolamadeus/sounds/161230) — lolamadeus, 4 с. Закрываются большие железные двери лифта: лязг и скрежет.
- [Metal door in MU 1](https://freesound.org/people/bsumusictech/sounds/83507) — bsumusictech, 8 с. Железная дверь в здании.

### door_creak

Запрос: `swing creak / bed creak (no query of its own)`.

- [Julian's Door - open and close, hinge only](https://freesound.org/people/SpliceSound/sounds/218321) — SpliceSound, 68 с. Только петли деревянной двери, открыть и закрыть: медленный скрип без удара.
- [Big door creak](https://freesound.org/people/jemburyturner/sounds/273466) — jemburyturner, 6 с. Большая старая деревянная дверь со скрипом открывается.

### impact

Запрос: `impact boom`.

- [Heavy Impacts](https://freesound.org/people/Nightflame/sounds/397596) — Nightflame, 11 с. Тяжёлые низкие удары с реверберацией: физические, не трейлерные.
- [Stone dropping to ground_northern87](https://freesound.org/people/northern87/sounds/369981) — northern87, 27 с. Камень падает на землю: глухой настоящий удар.
- [Boom_01](https://freesound.org/people/Faulkin/sounds/336487) — Faulkin, 1 с. Полый низкий удар.
- [Metal Hit](https://freesound.org/people/NachtmahrTV/sounds/556708) — NachtmahrTV, 3 с. Удар по металлу.

### clock

Запрос: `clock ticking`.

- [Old alarm clock ticking](https://freesound.org/people/PlayPauseAndRewind/sounds/132341) — PlayPauseAndRewind, 30 с. Тикает старый механический будильник, металл: часы у кровати.
- [Kitchen wall clock ticking](https://freesound.org/people/giddster/sounds/414470) — giddster, 37 с. Маленькие кухонные настенные часы.
- [Wall Clock Ticks, Quartz Clock](https://freesound.org/people/Kinoton/sounds/353174) — Kinoton, 62 с. Кварцевые настенные часы, ровно.
- [Clock ticks close to mic](https://freesound.org/people/BonnyOrbit/sounds/380782) — BonnyOrbit, 60 с. Кухонные часы тикают у самого микрофона.

### heartbeat

Запрос: `heartbeat`.

- [Human Heartbeat (60 BPM)](https://freesound.org/people/FenrirFangs/sounds/213181) — FenrirFangs, 5 с. Сердце через стетоскоп, 60 ударов в минуту.
- [Heartbeats, increasing rhythm](https://freesound.org/people/giddster/sounds/452764) — giddster, 69 с. Сердцебиение с нарастающим ритмом: разгон перед скримером.
- [heartbeat (fast but inconsistent)](https://freesound.org/people/ultraaxvii/sounds/533909) — ultraaxvii, 15 с. Быстрое неровное сердцебиение: испуг.

### radiator

Запрос: `radiator pipes`.

- [Old gurgling radiator](https://freesound.org/people/Spamanator/sounds/573791) — Spamanator, 30 с. Булькает старая батарея, полевая запись: центральное отопление старого дома.
- [Mysterious Radiator Sounds](https://freesound.org/people/simonjsounds/sounds/712920) — simonjsounds, 97 с. Трубы отопления потрескивают и щёлкают, металл, полевая запись.
- [RADIATOR](https://freesound.org/people/SamuelGremaud/sounds/454857) — SamuelGremaud, 18 с. Вода булькает в трубах батареи.

## Чего не нашлось

- **Настоящая ИВЛ** — одна запись на весь Freesound-CC0 (`ventilator`).
  ИВЛ остаётся синтезом; храп (`snoring`) — её правда на пробуждении.
- **Ветер во дворе** — один кандидат: фраза `wind courtyard` оказалась
  слишком узкой. Следующий поиск — `wind night` или `wind trees`.
- **Микроволновка, ровный гул без писка** (`microwave oven running`) — оба
  запроса упали по таймауту. Гул есть в кандидатах `microwave` вместе с
  писком.
- **Не искали — не хватило лимита запросов:** далёкий ночной город, голоса
  через стену, шелест бумаги (завещание), стеклянная крышка банки (варенье).
  Скрип двери отдельно не искали: два кандидата нашлись по запросам скрипа
  качелей и кровати.
- **Голоса мотивов** — `lift_voice` и «Ты чай будешь?» с кухни (`tea_offer`)
  — по-русски на Freesound не найти. Это либо запись своим голосом, либо
  синтез, либо мотив без голоса.
- **CC BY и Public Domain Mark** не искали вовсе (правило «только CC0»).

## Что дальше

1. Владелец слушает кандидатов по ссылкам на Freesound и отмечает, какие
   брать (и какие типы звука подключать первыми).
2. Отдельной задачей выбранные файлы скачиваются по `url` в
   `apps/web/public/sounds/` (рядом с `public/library/`), получают запись в
   манифесте звуков и в `assets/CREDITS.md` (поле `attribution` дословно).
3. Ещё одной задачей движок учится играть записи (буфер Web Audio в нужном
   слое, громкость и приглушение — как у синтеза), а монтажный лист —
   ставить их. Детерминизм не меняется: какая запись звучит, по-прежнему
   решает seed.
