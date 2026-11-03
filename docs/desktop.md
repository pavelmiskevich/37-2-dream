# Компьютер с RTX 5070 Ti: настройка и работа с ноутбука

Пошаговая инструкция для владельца: как подготовить компьютер с RTX 5070 Ti
(16 ГБ видеопамяти, 96 ГБ RAM) и как пользоваться его мощностью, сидя за
ноутбуком. Первая задача для компьютера — #39 (видеоклипы Wan 2.2).

## Как это устроено

Видеокарту компьютера нельзя «подключить» к ноутбуку так, чтобы ноутбук считал
ею сам. Работает другая схема: **тяжёлое считает компьютер, а управляете вы с
ноутбука** (или с телефона).

```text
ноутбук / телефон ──(интернет)──> Claude Code на компьютере ──> RTX 5070 Ti
        ^                                   │
        └──────── GitHub (ветка, PR) <──────┘  кадры, клипы, манифест
```

- На компьютере работает своя сессия Claude Code: генерирует кадры и клипы,
  коммитит в ветку и открывает PR.
- С ноутбука вы пишете этой сессии через **Remote Control** (claude.ai/code
  или приложение Claude) — без настройки сети.
- Для прямого доступа к командной строке компьютера — **SSH через Tailscale**
  (необязательно, но полезно при сбоях).
- Результаты приходят на ноутбук через GitHub: `git pull` — и новые кадры и
  клипы видны в `pnpm dev`.

## Часть 1. Подготовка компьютера (один раз, за самим компьютером)

### 1. Система и драйвер

1. Обновить Windows.
2. Поставить свежий драйвер NVIDIA (Game Ready или Studio) с nvidia.com или
   через NVIDIA App.
3. Проверить в PowerShell:

   ```powershell
   nvidia-smi
   ```

   В шапке должно быть `CUDA Version: 12.8` или выше и строка
   `NVIDIA GeForce RTX 5070 Ti`.
4. Свободное место на диске — не меньше 100 ГБ: модель кадров ~33 ГБ, модель
   клипов — ещё несколько десятков ГБ, плюс окружение Python.
5. Чтобы компьютер не засыпал посреди генерации и был доступен издалека
   (PowerShell):

   ```powershell
   powercfg /change standby-timeout-ac 0
   ```

   Это правило только для компьютера. На ноутбуке режим питания не менять.

### 2. Программы

Поставить (всё бесплатно):

| Что | Откуда | Проверка |
|---|---|---|
| Git для Windows | git-scm.com | `git --version` |
| Python 3.12 | python.org (галочка «Add to PATH») | `py -3.12 --version` |
| Node.js 24 | nodejs.org (LTS 24) | `node --version` → `v24…` |
| pnpm | `corepack enable` в PowerShell от администратора | `pnpm --version` |
| GitHub CLI | cli.github.com | `gh --version` |

### 3. GitHub и авторство коммитов

```powershell
gh auth login                      # GitHub.com → HTTPS → войти как pavelmiskevich
gh auth setup-git
git config --global user.name "pavelmiskevich"
git config --global user.email "48240641+pavelmiskevich@users.noreply.github.com"
```

Почта — служебная почта аккаунта `pavelmiskevich`. С `pmiskevich@gmail.com`
коммиты GitHub припишет аккаунту `pmiskevich-cmd`.

### 4. Репозиторий

```powershell
mkdir C:\Projects -Force
cd C:\Projects
git clone https://github.com/pavelmiskevich/37-2-dream.git
cd 37-2-dream
pnpm install
pnpm test
```

`pnpm test` должен пройти: это проверка, что Node и pnpm стоят правильно.

### 5. Python и модели

По разделу «Компьютер: RTX 5070 Ti» в
[tools/generation/README.md](../tools/generation/README.md): окружение
`tools\generation\.venv`, PyTorch под CUDA 12.8 (`whl/cu128`), проверка
`True NVIDIA GeForce RTX 5070 Ti (12, 0)`, скачивание Z-Image-Turbo. Этот шаг
может сделать и Claude Code на компьютере (часть 4) — он долгий из-за
скачивания.

Проверка защиты от перегрева:

```powershell
cd C:\Projects\37-2-dream\tools\generation
python thermal.py check --profile desktop
```

Должно быть `ready`.

### 6. Claude Code

1. Установить (PowerShell):

   ```powershell
   irm https://claude.ai/install.ps1 | iex
   ```

   Если команда изменилась — актуальная есть на странице установки в
   документации Claude Code.
2. Войти тем же аккаунтом claude.ai, что и на ноутбуке: `claude` → вход через
   браузер.
3. Перенести с ноутбука свои глобальные правила — файл
   `%USERPROFILE%\.claude\CLAUDE.md` положить по тому же пути на компьютере.
   Там запреты на подписи об авторстве, правило «только мои ишью» и правила
   безопасности. Без этого файла сессия на компьютере их не знает. Правила
   проекта (`AGENTS.md`) придут вместе с репозиторием.
4. Защитные хуки `%USERPROFILE%\.claude\hooks\injection-guard\` и их записи в
   `%USERPROFILE%\.claude\settings.json` перенесите сами: агентам менять их
   запрещено. Если в путях внутри `settings.json` стоит имя пользователя
   ноутбука, исправьте его на имя пользователя компьютера.

## Часть 2. Работа с ноутбука через Remote Control (основной способ)

Remote Control позволяет писать сессии Claude Code, запущенной на компьютере, из
браузера или приложения Claude на ноутбуке или телефоне. Команды и генерация
выполняются на компьютере. Порты открывать и сеть настраивать не нужно.

На компьютере (один раз после каждой перезагрузки):

```powershell
cd C:\Projects\37-2-dream
claude
```

В открывшейся сессии ввести `/remote-control`. Если такой команды нет —
`/help` покажет актуальное название. Окно терминала не закрывать: пока оно
открыто, сессия доступна.

На ноутбуке открыть **claude.ai/code** (или приложение Claude): сессия
компьютера появится в списке. Дальше с ней можно говорить как здесь.

Проверка: попросите сессию выполнить `nvidia-smi` — в ответе должна быть
RTX 5070 Ti.

## Часть 3. Прямой доступ по SSH через Tailscale (по желанию)

Нужен, если хотите сами запускать команды на компьютере с ноутбука, смотреть
температуру или перезапускать сессию, не подходя к компьютеру.

### 3.1. Tailscale — сеть между ноутбуком и компьютером

1. Поставить Tailscale (tailscale.com, бесплатный личный план) на компьютер и
   на ноутбук.
2. Войти на обоих одним аккаунтом.
3. В админке Tailscale посмотреть имя компьютера, например `rtx-pc`.
   Проверка с ноутбука: `ping rtx-pc`.

Tailscale работает и из дома, и из другой сети — проброс портов на роутере не
нужен.

### 3.2. SSH-сервер на компьютере

PowerShell **от администратора** на компьютере:

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
# чтобы по SSH открывался PowerShell, а не cmd
New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
  -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force
```

### 3.3. Вход по ключу, без пароля

На ноутбуке:

```powershell
ssh-keygen -t ed25519            # Enter на все вопросы
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub
```

Скопировать выведенную строку. На компьютере, в PowerShell от администратора
(если ваша учётная запись на компьютере — администратор, а обычно так и есть):

```powershell
Add-Content C:\ProgramData\ssh\administrators_authorized_keys "ВСТАВИТЬ_СТРОКУ_КЛЮЧА"
icacls C:\ProgramData\ssh\administrators_authorized_keys /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F"
```

Если учётная запись не администратор — та же строка в
`%USERPROFILE%\.ssh\authorized_keys` на компьютере, без `icacls`.

На ноутбуке добавить в `%USERPROFILE%\.ssh\config`:

```text
Host rtx
    HostName rtx-pc
    User ИМЯ_ПОЛЬЗОВАТЕЛЯ_НА_КОМПЬЮТЕРЕ
```

Проверка с ноутбука:

```powershell
ssh rtx nvidia-smi
```

### 3.4. Что делать по SSH

- Смотреть температуру и загрузку: `ssh rtx nvidia-smi`.
- Посмотреть лог защиты: `ssh rtx "Get-Content C:\Projects\37-2-dream\tools\generation\logs\thermal-desktop.csv -Tail 20"`.
- Короткие команды и проверки.

Долгую генерацию по SSH не запускать: при обрыве связи Windows завершает
процессы сеанса, и генерация оборвётся. Долгое — через сессию Claude Code на
компьютере (часть 2).

Если компьютер перезагрузился и сессия Claude Code пропала, её нужно снова
запустить в окне на самом компьютере — подойти или зайти удалённым рабочим
столом. Встроенный «Удалённый рабочий стол» Windows работает поверх Tailscale,
если на компьютере Windows Pro (адрес — то же имя `rtx-pc`).

### 3.5. Может ли сессия на ноутбуке сама работать на компьютере по SSH

Технически да (`ssh rtx "…"`), но защита injection-guard на ноутбуке пускает в
сеть только хосты из списка разрешённых, и `rtx-pc` туда добавляете только вы.
Пока проще разделить роли: компьютер считает и открывает PR, ноутбук ревьюит.

## Часть 4. Первая задача на компьютере — #39

Когда части 1 и 2 готовы, напишите сессии на компьютере (через Remote Control
или за самим компьютером):

> Прочитай AGENTS.md, docs/handoff.md, docs/desktop.md,
> tools/generation/README.md и ишью #39. Проверь окружение:
> `nvidia-smi`, PyTorch видит RTX 5070 Ti, `thermal.py check --profile desktop`
> даёт ready; чего не хватает — доставь по README. Затем сделай #39: скрипт
> клипов Wan 2.2 TI2V-5B через ThermalGuard с профилем desktop, 2–3 клипа из
> кадров библиотеки, манифест, подключение к монтажу. Ветка от main, PR с
> `Closes #39`, без слияния. Каждый клип покажи мне до коммита.

Дальше:

1. Сессия на компьютере открывает PR.
2. Вы или основная сессия на ноутбуке смотрите PR. Сливает одна сессия, с
   вашего разрешения — чтобы две сессии не сливали одновременно.
3. На ноутбуке: `git pull`, `pnpm dev`, посмотреть сон с клипами.

Пока компьютер работает над веткой, на ноутбуке не менять те же файлы
(`library.json`, `prompts.json`, монтажный лист) — иначе будут конфликты.

## Что ещё можно отдать компьютеру

- **Кадры.** Z-Image-Turbo в полном bf16 — без квоты Hugging Face и без нагрева
  ноутбука (`generate.py --profile desktop`).
- **Кэш промптов** для ноутбука: `--profile desktop --encode-only`, затем
  скопировать `tools/generation/cache/embeds`.
- **Сборки и тесты** больших веток — чтобы не греть ноутбук.

## Чек-лист готовности

- [ ] `nvidia-smi` на компьютере: RTX 5070 Ti, CUDA 12.8+.
- [ ] `pnpm test` в клоне на компьютере проходит.
- [ ] PyTorch: `True NVIDIA GeForce RTX 5070 Ti (12, 0)`.
- [ ] `python thermal.py check --profile desktop` → `ready`.
- [ ] `git config --global user.email` — служебная почта `pavelmiskevich`.
- [ ] `%USERPROFILE%\.claude\CLAUDE.md` перенесён.
- [ ] Сессия компьютера видна на claude.ai/code с ноутбука.
- [ ] (по желанию) `ssh rtx nvidia-smi` с ноутбука работает.
