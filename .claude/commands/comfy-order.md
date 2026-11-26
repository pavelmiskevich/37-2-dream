---
description: Выполнить заказ генерации на компьютере по tools/comfy/AGENT.md (для лёгкой модели)
argument-hint: <имя заказа из tools/comfy/orders>
---

Прочитай `tools/comfy/AGENT.md` и выполни ровно то, что там написано, для заказа
`tools/comfy/orders/$ARGUMENTS.json`. Больше ничего не делай: не правь файлы, не
запускай других команд, кроме `node tools/comfy/comfy.mjs run …` (инструментом
Bash с `timeout: 600000`), повторяй её, пока код выхода 2, в конце дай короткий
отчёт владельцу по-русски.
