# 4. Платформа, стек, этапы

Спецификация v1.1, разделы 23–26, 27 (стек), 28, 36–40, 42, 43. Приоритет — у
[vision.md](../vision.md) и [decisions.md](../decisions.md).

## 23. Responsive UX

Целевые классы ширины:

```text
320–479 px
480–767 px
768–1023 px
1024–1439 px
1440–1919 px
1920+
Ultrawide
```

Поддержать:

- portrait;
- landscape;
- 16:9;
- 16:10;
- 4:3;
- 21:9;
- динамический viewport;
- safe-area insets.

Не использовать фиксированную игровую камеру, рассчитанную только на 16:9.

## 24. Mobile

Управление:

- touch;
- virtual joystick;
- tap;
- swipe;
- hold.

Дополнительно:

- vibration;
- device orientation, если разрешено;
- fullscreen;
- installable PWA.

Вибрация должна иметь fallback и не быть обязательной. (Vibration API не
поддерживается в iOS Safari.)

## 25. PWA

> **Отложено до окончания первого среза**, см. [vision.md](../vision.md#сейчас-не-делаем).

Обязательные компоненты:

```text
manifest.webmanifest
service-worker
offline shell
icons
splash configuration
install prompt
cache strategy
```

Кэшировать:

- engine;
- UI;
- common textures;
- common audio;
- common shaders;
- low-resolution scare videos.

Большие видео и редкие ассеты можно загружать по необходимости.

## 26. Производительность

Целевые значения:

- **Desktop:** 60 FPS.
- **Mobile:** 30 FPS минимум, 60 FPS — целевой режим на современных устройствах.

Использовать:

- instancing;
- object pooling;
- texture atlases;
- LOD;
- frustum culling;
- occlusion where practical;
- compressed textures;
- lazy loading;
- asset streaming;
- adaptive resolution;
- dynamic effects quality.

## 27. Рекомендуемый технологический стек

(В исходном PDF этот раздел ошибочно тоже пронумерован как 27.)

### Client

TypeScript, WebGL/WebGPU-compatible rendering layer. Для MVP предпочтительно:

- Three.js;
- TypeScript;
- Web Audio API;
- Vite;
- PWA plugin.

WebGPU можно добавить как progressive enhancement, сохранив fallback.

### Backend

MVP может работать без backend. Local-first: seed, история снов, настройки,
journal хранятся локально.

Позже можно добавить backend для:

- sharing dreams;
- global statistics;
- dream gallery;
- leaderboards;
- generated dream IDs.

## 28. Suggested project structure

```text
37-2-dream/
├── apps/
│   └── web/
├── packages/
│   ├── dream-core/
│   ├── dream-generator/
│   ├── scene-system/
│   ├── physics/
│   ├── audio/
│   ├── scares/
│   ├── procedural-world/
│   ├── ui/
│   └── shared/
├── assets/
│   ├── audio/
│   ├── textures/
│   ├── models/
│   ├── videos/
│   └── fonts/
├── docs/
├── tests/
└── tools/
    ├── renderer/
    ├── ffmpeg/
    ├── youtube/
    └── generation/
```

> Пакеты заводятся по мере надобности, а не все сразу. Стартовая структура
> описана в [AGENTS.md](../../AGENTS.md).

## 36. UX-принцип

Не объяснять всё. Никаких длинных tutorial screens. Игрок должен постепенно
понять:

- 37,2 — центральный мотив;
- сон имеет память;
- объекты возвращаются;
- мир процедурный;
- физика ненадёжна;
- скримеры могут быть ложными;
- звуки могут предсказывать события;
- качели являются одним из ключевых переходов.

## 37. MVP

> **Заменено в v1.2** первым вертикальным срезом из
> [vision.md](../vision.md#первый-вертикальный-срез-сон-на-три-минуты).

Первый playable prototype:

- **6 локаций:** советский двор; лестница; квартира; падение; варенье; термометры.
- **5 recurring events:** качели; пылесос; ИВЛ; монитор; голубь.
- **3 перехода:** падение; дверь; изменение мира.
- **2 скримера:** false scare; real scare.
- **1 генератор:** seed → profile → scene graph → runtime.

## 38. Phase 2

Добавить:

- автобус;
- лифт;
- пустыню;
- больницу;
- море;
- дополнительные recurring characters;
- видеоскримеры;
- vibration;
- spatial audio;
- dream journal;
- replay по seed.

## 39. Phase 3

Добавить:

- community dream seeds;
- sharing;
- QR-код конкретного сна;
- URL вида `/dream/37-2-A81F9C`;
- просмотр сна другого пользователя;
- ежедневный seed;
- коллекцию редких событий;
- скрытые сцены.

## 40. Репозиторий

Название: `37-2-dream` — короткое, запоминающееся и сразу связано с центральной
механикой проекта.

Альтернативы: `dream-37-2`, `fever-dream-37-2`, `37-2-fever-dream`,
`dream-at-37-2`, `37-2-sleep`, `fever-dream-machine`.

Основное название проекта: **37.2 Dream**. Подзаголовок: *A procedurally
generated fever dream.*

## 42. Definition of Done

MVP считается готовым, если:

- каждый новый seed создаёт отличающийся маршрут;
- одинаковый seed воспроизводим;
- сцены не повторяются подряд без специальной причины;
- recurring jokes имеют cooldown;
- переходы процедурные;
- физика может изменяться между сценами;
- аудио реагирует на состояние сна;
- ИВЛ и монитор появляются контекстно;
- есть false и real scares;
- есть хотя бы один видеоскример;
- есть советский двор с качелями;
- есть падение;
- есть варенье;
- есть лестницы без перил;
- есть 37,2 °C как глобальный мотив;
- игра работает в desktop и mobile;
- PWA устанавливается;
- игра сохраняет seed и журнал локально;
- при потере сети уже загруженный основной контент продолжает работать.

## 43. Итоговое видение

37.2 Dream — это не просто генератор случайных сюрреалистических сцен. Это
система, которая создаёт ощущение: «Я понятия не имею, почему я здесь, но
почему-то всё это кажется совершенно нормальным».

Игрок должен выйти из каждого сна с ощущением, что он действительно побывал
внутри чужого, больного, нелогичного, но удивительно последовательного сна.

Главный художественный контраст: **абсолютно серьёзная атмосфера + максимально
идиотские события.**

И центральная фраза проекта: **37,2 °C. Ничего страшного. Просто приснилось.**
