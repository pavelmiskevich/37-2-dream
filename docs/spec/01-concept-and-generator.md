# 1. Концепция и генератор сна

Спецификация v1.1, разделы 1–5, 18–19, 29–31, 41. Приоритет — у
[vision.md](../vision.md) и [decisions.md](../decisions.md).

## 1. Концепция

37.2 Dream — браузерный процедурно генерируемый сон мужчины с температурой
37,2 °C.

Главный принцип: игра не должна выглядеть как набор случайных комнат. Она должна
создавать ощущение цельного, но абсолютно нелогичного сна, где каждый запуск
отличается последовательностью, комбинацией, физикой, звуком и событиями.

Игрок не получает классическую цель «победить врага». Основная задача —
исследовать сон и посмотреть, насколько далеко он способен зайти.

> **Уточнено в v1.2:** глагол игрока — управлять своим жаром, см.
> [vision.md](../vision.md#игрок).

Ключевой юмористический принцип: **всё происходящее подаётся максимально
серьёзно, хотя логика происходящего полностью абсурдна.**

Повторяющиеся мотивы создают узнаваемый язык проекта:

- температура 37,2 °C;
- пустой советский двор;
- скрипучие качели;
- женщина с пылесосом;
- медицинский монитор;
- звук ИВЛ;
- бесконечные лестницы без перил;
- падение;
- варенье;
- голуби;
- завещание;
- лифт;
- термометры;
- медицинские и бытовые звуки;
- внезапные аудио- и видеоскримеры.

## 2. Главная функциональная идея: уникальный сон

Каждый запуск должен создавать новый сон. Допускается повторение отдельных
локаций и объектов, но полная последовательность и комбинация элементов должна
быть крайне маловероятной к повторению.

Нужно избегать:

- простого `random()` для выбора следующей комнаты;
- заранее заданного линейного сценария;
- полного рандома без драматургии;
- повторения одного и того же набора событий.

Используется seeded procedural dream generation. Каждый сон получает уникальный
DreamSeed, например:

```text
DREAM-8F72-A19C-37B2
```

Seed определяет:

- последовательность сцен;
- набор локаций;
- физические параметры;
- комбинации объектов;
- переходы;
- аудио;
- скримеры;
- диалоги;
- интенсивность абсурда;
- recurring jokes;
- продолжительность;
- вероятность повторного появления ранее увиденных элементов.

При одинаковом seed сон должен воспроизводиться детерминированно. При новом
seed — создавать другую комбинацию.

## 3. Архитектура генератора сна

Генератор должен быть многоуровневым.

```text
Dream Seed
 ├── Dream Profile
 │    ├── absurdity
 │    ├── anxiety
 │    ├── medical
 │    ├── sovietness
 │    ├── бытовуха
 │    ├── physics instability
 │    └── jumpscare intensity
 ├── Scene Graph
 │    ├── Scene
 │    ├── Transition
 │    ├── Event
 │    └── Callback
 ├── World Generator
 │    ├── geometry
 │    ├── materials
 │    ├── lighting
 │    └── objects
 ├── Physics Director
 ├── Audio Director
 ├── Jumpscare Director
 └── Dream Journal
```

## 4. Dream Profile

Перед генерацией создаётся профиль сна.

```json
{
  "temperature": 37.2,
  "absurdity": 0.91,
  "anxiety": 0.58,
  "medicalIntensity": 0.67,
  "sovietIntensity": 0.74,
  "domesticIntensity": 0.81,
  "physicsInstability": 0.63,
  "jumpscareIntensity": 0.42,
  "dreamLength": 8.7
}
```

Параметры должны не только выбирать контент, но и влиять на его поведение:

- высокий `medicalIntensity` → больше термометров, мониторов, ИВЛ и пиканья;
- высокий `sovietIntensity` → дворы, подъезды, панельные дома, качели;
- высокий `physicsInstability` → инверсия гравитации, лестницы, падения;
- высокий `absurdity` → более невозможные комбинации;
- высокий `jumpscareIntensity` → больше ложных и настоящих скримеров.

## 5. Scene Graph вместо линейного сценария

Сон представляется графом.

```text
[Советский двор]
 ├── качели → [падение]
 ├── подъезд → [лестница]
 │               └→ [термометры]
 └── автобус → [пустыня]
                 └→ [варенье]
```

Конкретный путь определяется процедурно. Примеры снов:

```text
Двор → Качели → Падение → Лестница → Лифт → Море → Варенье → Пылесос
     → Коридор термометров → Пробуждение

Квартира → Холодильник → Лестница → Советский двор → Голубь → Автобус 37,2
         → Небо → Падение → Завещание → Пылесос → Двор

Пустыня → Качели → Лифт → Больничный коридор → Варенье → Подводная физика
        → Термометры → Ложный скример → Настоящий скример → Спальня
```

## 18. Уникальность сна

Нужны несколько уровней защиты от повторов.

### 18.1 Global Seed

Уникальный seed всего сна.

### 18.2 Scene Seed

Каждая сцена получает собственный seed: `DreamSeed + SceneIndex`.

### 18.3 Event Seed

Каждое событие: `DreamSeed + SceneIndex + EventIndex`.

### 18.4 History

Хранить локально:

```text
recentScenes
recentTransitions
recentJumpscares
recentAudioEvents
recentCharacters
recentObjects
```

Недавние комбинации получают штраф вероятности.

> **Изменено решением [D-004](../decisions.md#d-004-история-не-влияет-на-генерацию-из-seed):**
> история влияет только на выбор нового seed, а не на генерацию сна из seed.

### 18.5 Weighted rarity

Каждый элемент имеет: `baseWeight`, `rarity`, `cooldown`, `compatibility`,
`incompatibility`.

```json
{
  "id": "woman_vacuum",
  "baseWeight": 0.3,
  "rarity": 0.7,
  "cooldownScenes": 3
}
```

## 19. Compatibility Matrix

Не все элементы должны сочетаться.

| Элемент A | Элемент B | Результат |
|---|---|---|
| Soviet yard | Swings | +++ |
| Soviet yard | Vacuum woman | ++ |
| Jelly | Lemon meteorites | +++ |
| Hospital | Ventilator | +++ |
| Desert | Hospital bed | ++ |
| Elevator | Ocean | +++ |
| Stairs | Gravity inversion | +++ |
| Swings | Jelly | + |
| Hospital | Soviet yard | ++ |
| Bus | Sky | +++ |

Это позволит создавать контролируемый абсурд.

## 29. Основные интерфейсы

```ts
interface DreamSeed {
  value: string;
}

interface DreamProfile {
  temperature: number;
  absurdity: number;
  anxiety: number;
  medicalIntensity: number;
  sovietIntensity: number;
  domesticIntensity: number;
  physicsInstability: number;
  jumpscareIntensity: number;
  dreamLength: number;
}

interface DreamScene {
  id: string;
  type: string;
  seed: string;
  duration: number;
  intensity: number;
  tags: string[];
}

interface DreamTransition {
  from: string;
  to: string;
  type: string;
  probability: number;
}

interface DreamEvent {
  id: string;
  type: string;
  trigger: string;
  cooldown: number;
  rarity: number;
}

interface DreamHistory {
  scenes: string[];
  transitions: string[];
  scares: string[];
  recurringEvents: string[];
}
```

## 30. Алгоритм генерации

```ts
function generateDream(seed: string): Dream {
  const rng = createSeededRng(seed);
  const profile = generateProfile(rng);
  const history = loadDreamHistory();
  const sceneCount = calculateSceneCount(profile, rng);
  const scenes = [];

  for (let i = 0; i < sceneCount; i++) {
    const candidates = getCompatibleScenes(scenes.at(-1), profile);
    const filtered = applyCooldowns(candidates, history);
    const scene = weightedPick(filtered, rng);
    scenes.push(generateScene(scene, profile, rng, history));
  }

  return connectScenes(scenes, profile, rng);
}
```

> **Изменено решением [D-004](../decisions.md#d-004-история-не-влияет-на-генерацию-из-seed):**
> `loadDreamHistory()` внутри `generateDream` ломает воспроизводимость seed.
> Cooldown внутри одного сна считается по уже выбранным сценам этого же сна;
> межсессионная история используется только при выборе нового seed.

## 31. Генерация событий внутри сцены

Сцена не должна быть статичной. Например:

```text
0–20%    normal
20–40%   strange
40–60%   absurd
60–75%   tension
75–90%   event
90–100%  transition
```

Но эти интервалы тоже должны рандомизироваться.

## 41. Ключевой принцип проекта

Проект не должен стремиться к бесконечному количеству контента. Его сила — в
комбинаторике.

```text
20 locations × 30 events × 15 transitions × 10 physics modifiers
× 20 audio events × 15 scare events × procedural parameters
```

Это даёт огромное число возможных последовательностей при относительно
небольшом количестве handcrafted assets.

Главная задача разработчика — не создавать тысячи сцен, а создавать много хорошо
сочетающихся элементов.

> **Уточнено в v1.2:** сильные моменты важнее уникальности — см. столп 5 в
> [vision.md](../vision.md#столпы).
