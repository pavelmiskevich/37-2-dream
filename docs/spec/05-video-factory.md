# 5. Видеофабрика (ЗАМОРОЖЕНО)

> **Заморожено решением [D-001](../decisions.md#d-001-игра-первой-видеофабрика-заморожена).**
> Ничего из этого раздела сейчас не реализуется. Из него в ядро игры переходит
> только одно требование: детерминированная симуляция с фиксированным шагом и
> лог ввода, чтобы сыгранный сон можно было воспроизвести.

Спецификация v1.1, разделы 27.1–27.14 и 42.1.

## 27.1 Автоматическая генерация видео и публикация

Начиная с версии 1.1, архитектура проекта фиксирует принцип: ComfyUI не является
обязательной частью 37.2 Dream и не входит в основной production pipeline.

Основным источником визуального контента является собственный procedural Dream
Engine на TypeScript + Three.js. Это позволяет использовать один и тот же
DreamSeed для:

- интерактивного browser experience;
- воспроизводимого cinematic render;
- 5-минутного YouTube-эпизода;
- отдельного 37-секундного Short;
- thumbnail;
- метаданных и Dream Journal.

LLM используется как Dream Director, а не как генератор кадров. Он может
формировать высокоуровневую драматургию, реплики, narration, camera mood, sound
direction, название и описание, но не должен самостоятельно определять физику
или нарушать deterministic core.

### Production pipeline

```text
Dream Seed
  ↓
Dream Profile
  ↓
Scene Graph
  ↓
Timeline
  ↓
Cinematic Director
  ↓
Three.js Renderer
  ↓
Frames / Render Manifest
  ↓
FFmpeg
  ├── 5-min Episode 16:9
  └── 37-sec Short 9:16
  ↓
Thumbnail + Title + Description + Subtitles
  ↓
YouTube Data API
```

### Главный принцип

Browser Game и Video Factory используют один Dream Engine, а не две независимые
системы генерации.

```text
              Dream Seed
                  ↓
             Dream Engine
          (deterministic core)
                  ↓
        ┌─────────┴─────────┐
        ↓                   ↓
 Interactive Mode     Cinematic Mode
        ↓                   ↓
  Browser / PWA      Headless Renderer
                            ↓
                         FFmpeg
                            ↓
                    YouTube / Shorts
```

Это гарантирует, что сон, который пользователь увидел в браузере, можно
воспроизвести как конкретный видеоэпизод по тому же seed.

> **Уточнение v1.2:** в интерактивном режиме ввод игрока меняет ход сна, поэтому
> для воспроизведения нужен не только seed, но и лог ввода (D-001).

## 27.2 Cinematic Render Mode

В Three.js необходимо предусмотреть отдельный режим Cinematic Render Mode. Он не
зависит от пользовательского FPS и не должен захватывать видео простым screen
recording.

Рендер должен управляться детерминированным simulation clock:

```text
frame 0 → simulation time = 0.000 → update world → render frame
frame 1 → simulation time = 0.0333 → …
```

Для 30 FPS `dt = 1 / 30`, для 60 FPS `dt = 1 / 60`.

Таким образом один и тот же seed и одинаковые параметры рендера должны давать
одинаковую последовательность кадров.

Не рекомендуется делать production video pipeline зависимым от:

- реального времени;
- текущего FPS браузера;
- пользовательского ввода;
- случайного `Math.random()`;
- screen capture рабочего стола.

## 27.3 Headless Rendering

Для автоматической генерации эпизодов используется headless browser или
специализированный offscreen WebGL/WebGPU renderer.

Предпочтительная схема MVP:

```text
.NET Render Worker → Chromium / Headless Browser → 37.2 Dream Web Renderer
→ Frame sequence → FFmpeg
```

Renderer получает:

- DreamSeed;
- DreamProfile;
- SceneGraph;
- cinematic timeline;
- camera path;
- resolution;
- FPS;
- quality preset.

Renderer возвращает:

- последовательность кадров либо video stream;
- render manifest;
- timing information;
- ошибки/метрики;
- seed и renderer version.

Важно сохранять `rendererVersion`, поскольку изменение движка в будущем может
изменить внешний вид старого seed.

## 27.4 Cinematic Director

Над Scene Graph располагается слой постановки:

```text
Dream Scene
  ↓
Cinematic Director
  ├── Shot Selection
  ├── Camera Path
  ├── Camera Lens
  ├── Character Blocking
  ├── Lighting
  ├── Focus / DOF
  ├── Transition
  ├── Timing
  └── Scare Timing
```

Камера должна поддерживать несколько типов:

- cockpit / first person;
- rear / camera behind character;
- cinematic follow;
- wide establishing shot;
- top-down;
- track/scene overview;
- close-up;
- impossible camera;
- falling camera.

Камера является частью seed-driven timeline и должна быть воспроизводимой.

## 27.5 Audio Production Pipeline

Звук также должен быть частью deterministic timeline. Базовые категории:
Ambient, Location, Physics, Recurring, Tension, Scare, Transition, Narration.

Вместо записи звука непосредственно во время browser render создаётся
audio/event manifest:

```ts
interface AudioCue {
  id: string;
  startTime: number;
  duration?: number;
  asset: string;
  volume: number;
  pitch?: number;
  spatial?: boolean;
  category: string;
}
```

После этого аудио собирается в финальный master через FFmpeg и/или offline
audio rendering.

Ключевые фирменные звуки проекта:

- скрип качелей;
- ИВЛ;
- *pip… pip…*;
- пылесос;
- гул турбины;
- советский двор;
- шаги;
- дыхание;
- тиканье;
- звук падения;
- внезапная тишина.

## 27.6 LLM как Dream Director

LLM не является ядром генерации мира. Его роль:

```text
Dream Engine → Structured Scene Graph → LLM Dream Director
→ Cinematic / Narrative Instructions
```

LLM может генерировать:

- краткую драматургическую дугу;
- реплики;
- narration;
- визуальное описание конкретной сцены;
- camera mood;
- sound direction;
- название;
- description;
- subtitles;
- teaser/hook для Short.

LLM не должен самостоятельно:

- менять seed;
- создавать физические правила;
- обходить compatibility matrix;
- бесконтрольно добавлять новые объекты;
- ломать continuity;
- определять случайность runtime.

Это позволяет сохранить авторский стиль и воспроизводимость.

> **Уточнение v1.2:** ответ LLM недетерминирован, поэтому его результат нужно
> сохранять как артефакт с привязкой к seed и версиям, а не генерировать заново.

## 27.7 5-минутный эпизод и 37-секундный Short

Каждый Dream Seed может порождать два разных cinematic products.

### Full Episode

Целевая длительность ≈ 5 минут. Формат: 16:9, 1080p MVP, 30 FPS MVP.

Эпизод строится как самостоятельный сон:

```text
Hook → Normality → First anomaly → Escalation → Absurd peak → False calm
→ Scare / punchline → Awakening
```

### Short

Short не должен быть простым crop/clip из длинного видео. Он имеет отдельную
постановку:

```text
0–3s    Hook
3–12s   Setup
12–25s  Escalation
25–32s  WTF moment
32–35s  False calm
35–37s  Scare / punchline
```

Формат: 9:16, ровно 37 секунд.

Short использует тот же Dream Seed, но может иметь отдельный ShortSeed:
`ShortSeed = Hash(DreamSeed + "SHORT")`. Это позволяет сохранить связь с
основным сном и одновременно сделать Short самостоятельным произведением.

## 27.8 Thumbnail и metadata factory

После рендера автоматически создаются:

- thumbnail;
- title;
- description;
- hashtags;
- subtitles;
- episode ID;
- Dream Seed reference.

Thumbnail желательно получать из реального кадра эпизода, а не создавать
полностью отдельной системой, чтобы визуальная идентичность совпадала с видео.

Для каждого опубликованного видео сохраняются: `DreamSeed`, `RendererVersion`,
`EngineVersion`, `EpisodeVersion`, `ShortVersion`, `ThumbnailVersion`,
`MetadataVersion`.

## 27.9 Автоматический production loop

Production factory может работать пакетно:

```text
Generate N seeds → Validate uniqueness → Build Dream Profiles
→ Build Scene Graphs → Director pass → Render → Quality checks
→ FFmpeg encode → Thumbnail / metadata → Upload / schedule
```

Перед публикацией необходимо выполнять автоматические проверки:

- render completed;
- audio exists;
- no missing assets;
- expected duration;
- expected aspect ratio;
- expected FPS;
- no broken scene;
- no duplicate recent dream;
- no empty/black render beyond configured limits;
- subtitles match final timeline;
- metadata generated.

> **Риск (v1.2):** пакетная генерация однотипных роликов попадает под правило
> YouTube о неаутентичном (массово произведённом) контенте и может лишить канал
> монетизации.

## 27.10 .NET Orchestrator

Для production automation рекомендуется отдельный C#/.NET orchestrator.

```text
37.2 Dream Engine → .NET Orchestrator → PostgreSQL + Redis → Render Workers
→ Headless Three.js → FFmpeg → YouTube Data API
```

**PostgreSQL** хранит: Dreams; Seeds; Dream Profiles; Scene Graphs; Episodes;
Shorts; Render Jobs; Render Versions; publication metadata; generation history.

**Redis** используется для: locks; job state; distributed coordination; rate
limiting; temporary render state; caching.

**Kafka** не обязателен для MVP. Подключается при появлении реальной потребности
в распределённой production pipeline: `DreamGenerated`, `RenderQueued`,
`RenderCompleted`, `VideoEncoded`, `ThumbnailGenerated`, `UploadCompleted`,
`PublishScheduled`.

## 27.11 Renderer abstraction

Чтобы не закрывать путь к AI-video в будущем, renderer должен иметь абстракцию:

```ts
interface IRenderProvider {
  render(request: RenderRequest): Promise<RenderResult>;
}
```

Первичная реализация — `ThreeJsRenderer`. Возможная будущая —
`RemoteAiVideoRenderer`.

Это означает:

- MVP работает без ComfyUI;
- основной контент остаётся deterministic;
- отдельные сцены в будущем можно усиливать AI-video;
- Dream Engine не зависит от конкретного видеогенератора.

ComfyUI может быть подключён позднее как внешний экспериментальный provider, но
не должен становиться обязательной зависимостью проекта.

## 27.12 Стратегия разработки

Перед созданием полной video factory необходимо сделать вертикальный срез:

```text
1 DreamSeed → Dream Profile → Scene Graph → 30–60 sec cinematic
→ Headless render → FFmpeg → готовый Short
```

После подтверждения качества:

```text
30–60 sec → 5 min Episode → 37 sec Short → Batch rendering
→ Automatic publishing
```

Это снижает риск построить сложную инфраструктуру до проверки художественного
качества.

## 27.13 Почему ComfyUI не является базовым решением

Для проекта 37.2 Dream важнее:

- стабильность персонажей и объектов;
- deterministic seed;
- физика;
- повторяемость;
- процедурные комбинации;
- авторская логика;
- единый игровой и cinematic world;
- контролируемые переходы;
- recurring characters;
- повторяющиеся звуковые мотивы.

Генеративное видео может дать более «нейросетевой» визуальный wow-effect, но
одновременно повышает риск:

- визуального дрейфа;
- неповторяемости;
- нарушения continuity;
- усложнения автоматизации;
- GPU-зависимости;
- роста стоимости production.

Поэтому базовый production path версии 1.1: Procedural 3D + Cinematic Director +
Headless Renderer + FFmpeg + LLM Director + YouTube API.

## 27.14 Единый контентный цикл проекта

В версии 1.1 37.2 Dream рассматривается не только как browser game.

```text
                 Dream Seed
                     ↓
                Dream Engine
                     ↓
      ┌──────────────┼──────────────┐
      ↓              ↓              ↓
 Browser / PWA   Episode 5 min   Short 37 sec
      ↓              ↓              ↓
   Player         YouTube         Shorts
      └──────────────┼──────────────┘
                     ↓
                 Comments
                     ↓
               Future Seeds
```

Таким образом YouTube становится не отдельным проектом, а distribution layer
поверх того же Dream Engine.

## 42.1 Definition of Done для Video Factory v1.1

Video Factory считается готовой для MVP, если:

- один DreamSeed воспроизводимо создаёт одинаковый Scene Graph;
- browser mode и cinematic mode используют один Dream Engine;
- cinematic render работает без screen recording;
- render управляется deterministic simulation clock;
- headless renderer способен получить минимум 30–60 секунд готового видео;
- FFmpeg собирает корректный video + audio master;
- генерируется отдельный 37-секундный Short;
- Short имеет вертикальный формат 9:16;
- full episode имеет горизонтальный формат 16:9;
- сохраняются EngineVersion и RendererVersion;
- отсутствует обязательная зависимость от ComfyUI;
- LLM не управляет физикой и deterministic randomness;
- metadata и thumbnail могут быть сгенерированы автоматически;
- pipeline умеет выполнить end-to-end тест Seed → Render → Encode;
- предусмотрен интерфейс IRenderProvider для будущего AI renderer;
- YouTube publishing layer изолирован от Dream Engine.
