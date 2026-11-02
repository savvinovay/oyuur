# Oyuur

[![CI](https://github.com/savvinovay/oyuur/actions/workflows/ci.yml/badge.svg)](https://github.com/savvinovay/oyuur/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/savvinovay/oyuur/graph/badge.svg)](https://codecov.io/gh/savvinovay/oyuur)
[![Release](https://img.shields.io/github/v/release/savvinovay/oyuur)](https://github.com/savvinovay/oyuur/releases/latest)

Oyuur («лес» по-якутски) — трекер привычек с игрой и друзьями. У каждой привычки своё дерево: раз в день его поливаешь, серия дней растёт, дерево растёт, из деревьев складывается твой лес. Друзья видят серии друг друга.

- `app/` — приложение: Expo, React Native, TypeScript (Android и веб).
- `server/` — сервер друзей и аккаунтов: Node 24 без зависимостей.

## Запуск

```bash
cd app && npm ci && npx expo start
```

```bash
cd server && DB_PATH=./dev.db PORT=8790 node src/main.js
```

Тесты: `npm test` в `app/` и `server/`, проверка типов — `npm run typecheck` в `app/`.

## Выпуски

Номер версии — `expo.version` в `app/app.json` (x.y.z), такой же в `app/package.json` и `server/package.json`. Метка `vX.Y.Z` собирает APK и веб-версию и кладёт их в [Releases](https://github.com/savvinovay/oyuur/releases).

APK подписан открытым тестовым ключом React Native (`app/credentials/`), чтобы вставать поверх прежних тестовых сборок. Это сборка для тестеров, не для магазина.
