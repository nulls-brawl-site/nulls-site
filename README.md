# Null's Brawl Mod Builder

Сайт для создания `.json` модов для игры Null's Brawl.

## Структура

```
web/              — Фронтенд (nginx webroot)
  index.html      — SPA с Material Design 3
  api.php         — PHP API (история, валидация, скачивание)
  assets/
    css/style.css — MD3 стили
    js/app.js     — Логика приложения
csv/              — CSV файлы данных игры
csv_service/
  app.py          — Python Flask микросервис (чтение CSV)
```

## Запуск (production)

Сайт задеплоен на **https://nulls.bsod4ik.ru**

Стек: nginx + PHP 8.2-FPM + Python 3.11 (Flask + pandas)

## Функционал

- Редактор метаданных: `@title`, `@description`, `@author`, `@version`, `@uuid`, `@spec`, `@patches`
- CSV патчи: выбор файла → выбор строки → редактирование полей
- Несколько строк в одном CSV блоке
- Boolean-фильтры `[ColumnName]` для патчинга по условию
- Редактор `@features` с полной поддержкой: name, description, patches, root, priority, enabled, conflicts
- Редактор `@feature_groups` (RADIO_GROUP / DEFAULT)
- История проектов (автосохранение)
- Импорт JSON с Auto-Fix
- Экспорт `mod.json`
