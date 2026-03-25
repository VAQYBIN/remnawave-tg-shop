# Raccoonito Shop — Brand Book

> Версия 1.0 · На основе лендинга raccoonito-landing-page

---

## 1. Бренд

### 1.1 Название и позиционирование

| Поле | Значение |
|---|---|
| Полное название | **Raccoonito Shop** |
| Продукт | VPN-сервис |
| Аудитория | Русскоязычные пользователи, столкнувшиеся с блокировками и ограничением доступа к зарубежным сервисам |
| Дополнительный продукт | Telegram MTProto прокси |

### 1.2 Тон голоса

- **Дружелюбный**: обращение простое, без жаргона
- **Лаконичный**: минимум слов — максимум смысла
- **Надёжный**: акцент на безопасности и отсутствии логов
- **Доступный**: технические детали объясняются просто

---

## 2. Логотип и маскот

### 2.1 Маскот

Маскот бренда — **енот (raccoon)**. Отображается в виде квадратной аватарки со скруглением `rounded-full` (50%).

```
Размер: 64 × 64 px (w-16 h-16)
Форма: круглая (border-radius: 50%)
Эффект: shadow-md
Файл: raccoon-logo.webp
```

### 2.2 Логотип-связка (lockup)

Маскот + название стоят рядом через `gap-3` (12 px):

```
[🦝 аватар 64px] [gap 12px] [Raccoonito Shop — 2xl / extrabold]
```

**Применение:** только в шапке HeroSection, по центру страницы.

---

## 3. Цветовая палитра

Все цвета заданы через CSS custom properties в `src/index.css`.

### 3.1 Основные цвета

| Имя | CSS-переменная | HSL | HEX (прибл.) | Назначение |
|---|---|---|---|---|
| **Primary** | `--primary` | `197 74% 52%` | `#2AACDF` | Акцент, CTA-кнопки, иконки, рамки |
| **Background** | `--background` | `40 11% 95%` | `#F5F1ED` | Фон страницы |
| **Foreground** | `--foreground` | `0 0% 17%` | `#2B2B2B` | Основной текст |

### 3.2 Вспомогательные цвета

| Имя | CSS-переменная | HSL | HEX (прибл.) | Назначение |
|---|---|---|---|---|
| **Card** | `--card` | `0 0% 100%` | `#FFFFFF` | Фон карточек |
| **Secondary** | `--secondary` | `27 14% 48%` | `#897569` | Вторичные элементы |
| **Muted** | `--muted` | `40 8% 90%` | `#E8E4DF` | Приглушённый фон |
| **Muted Foreground** | `--muted-foreground` | `0 0% 40%` | `#666666` | Второстепенный текст |
| **Border** | `--border` | `30 8% 85%` | `#DDD8D2` | Границы элементов |
| **Surface Elevated** | `--surface-elevated` | `40 9% 92%` | `#ECEAE6` | Приподнятые поверхности |

### 3.3 Семантические цвета

| Роль | Значение |
|---|---|
| Accent | совпадает с Primary (`#2AACDF`) |
| Ring (focus) | совпадает с Primary |
| Destructive | `hsl(0 84% 60%)` — красный, только для ошибок |

### 3.4 Принцип применения цветов

```
Фон страницы    → background (#F5F1ED)
Фон карточек    → card (#FFFFFF)
CTA / Акцент    → primary (#2AACDF)
Основной текст  → foreground (#2B2B2B)
Описания/подписи → muted-foreground (#666666)
Разделители     → border (#DDD8D2)
```

---

## 4. Типографика

### 4.1 Шрифт

```
Семейство: Nunito
Источник: Google Fonts
Подключение: https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap
Fallback: sans-serif
```

### 4.2 Шкала размеров и весов

| Роль | Размер | Вес | Tailwind класс |
|---|---|---|---|
| Заголовок H1 | 30px / 36px (sm) | 800 extrabold | `text-3xl sm:text-4xl font-extrabold` |
| Бренд-нейм | 24px | 800 extrabold | `text-2xl font-extrabold` |
| H2 (секция) | 18px | 700 bold | `text-lg font-bold` |
| H3 (карточка) | 14px | 700 bold | `text-sm font-bold` |
| Тело текста | 16px | 400 regular | `text-base` |
| Вторичный текст | 12px | 400 regular | `text-xs text-muted-foreground` |

### 4.3 Межбуквенный интервал

- Бренд-нейм: `tracking-tight` (тесный трекинг для современного вида)
- Остальные тексты: по умолчанию

---

## 5. Компоненты UI

### 5.1 Кнопка (Button)

**Вариант: default (Primary CTA)**

```
Фон: primary (#2AACDF)
Текст: белый
Скругление: rounded-md (6px)
Высота (lg): 44px (h-11)
Padding: px-8 (32px)
Шрифт: font-bold
Hover: scale(1.05) + shadow-lg
Transition: all (плавная)
```

**Вариант: outline (вторичная кнопка)**

```
Фон: прозрачный
Граница: border border-input
Hover: фон accent, текст accent-foreground
```

**Вариант: outline инвертированный (на цветном баннере)**

```
Фон: primary-foreground (белый)
Текст: primary (#2AACDF)
Граница: border-primary-foreground
Hover: bg-primary-foreground/90
```

---

### 5.2 Карточка (Card)

**InfoCard**

```
Фон: card (#FFFFFF)
Левая граница: 3px solid primary (#2AACDF)
Тень: shadow-sm
Padding: p-4 (16px)
Иконка: 16px, цвет primary
Заголовок: text-sm font-bold
Описание: text-xs text-muted-foreground, leading-relaxed
```

**StepCard**

```
Нет обёртки-карточки, только flex-строка
Бейдж с номером: primary background
Заголовок шага: font-bold text-sm
Описание шага: text-xs text-muted-foreground
gap: gap-3
```

---

### 5.3 Badge (бейдж)

```
Используется: нумерация шагов
Фон: primary
Текст: primary-foreground (белый)
Шрифт: font-bold
```

---

### 5.4 VpnBanner (баннер-призыв)

```
Фон: primary (#2AACDF) — полностью цветной
Граница: совпадает с фоном
Padding: p-5 (20px)
Иконка: Bot (lucide), text-primary-foreground
Заголовок: text-sm font-bold text-primary-foreground
Описание: text-xs text-primary-foreground/80
Кнопка: outline-инвертированная (см. 5.1)
Раскладка: flex-col на мобиле, flex-row на sm+
```

---

### 5.5 Accordion (FAQ)

```
Вопрос (триггер): стандартный Radix AccordionTrigger
Ответ: text-muted-foreground
Анимация: accordion-down / accordion-up, 0.2s ease-out
```

---

### 5.6 Separator (разделитель)

```
Цвет: border (#DDD8D2)
Применение: перед футером
```

---

## 6. Раскладка и сетка

### 6.1 Контейнер

```
Максимальная ширина: 960px (2xl breakpoint)
Центрирование: mx-auto
Горизонтальный padding: 1.5rem (24px)
Вертикальный padding страницы: py-10 (40px)
```

### 6.2 Структура страницы

```
min-h-screen bg-background
└── container max-w-3xl (48rem) py-10 space-y-8
    ├── HeroSection        ← по центру, space-y-4
    ├── StepsSection       ← 1–3 колонки, gap-3
    ├── InfoSection        ← 1–3 колонки, gap-3
    ├── VpnBanner          ← полная ширина
    ├── FaqSection         ← полная ширина, accordion
    └── Footer             ← separator + текст xs по центру
```

### 6.3 Адаптивность

| Брейкпоинт | Поведение |
|---|---|
| mobile (default) | 1 колонка, H1 = 30px |
| sm (640px+) | 3 колонки в StepsSection и InfoSection, H1 = 36px |
| 2xl / max-width | контейнер ограничен 960px |

---

## 7. Скругления

| Имя | Переменная | Значение |
|---|---|---|
| Base radius | `--radius` | `0.5rem` (8px) |
| `rounded-lg` | | 8px |
| `rounded-md` | | 6px |
| `rounded-sm` | | 4px |
| Маскот / аватар | | `rounded-full` (50%) |

---

## 8. Иконографика

**Библиотека:** [Lucide React](https://lucide.dev)

| Иконка | Контекст |
|---|---|
| `Bot` | VpnBanner — означает Telegram-бота |
| `HelpCircle` | InfoCard — «Что такое MTProto» |
| `Zap` | InfoCard — «Зачем нужен» |
| `Shield` | InfoCard — «Безопасно ли это» |

**Размер иконок:**
- Inline в карточках: `w-4 h-4` (16px)
- В баннере: `w-5 h-5` (20px)

**Цвет:** всегда `text-primary` на белом фоне, `text-primary-foreground` на цветном фоне.

---

## 9. Анимация и интерактивность

| Элемент | Эффект |
|---|---|
| CTA-кнопка (primary) | `hover:scale-105 hover:shadow-lg transition-all` |
| Outline-кнопка (баннер) | `hover:scale-105 hover:shadow-md transition-all` |
| Accordion | `accordion-down` / `accordion-up`, 0.2s ease-out |

---

## 10. Копирайтинг и голос бренда

### 10.1 Слоган

> **«Свободный Telegram за одно нажатие»**

### 10.2 Подзаголовок

> *Бесплатный MTProto прокси — без регистрации и приложений*

### 10.3 CTA-тексты

| Кнопка | Текст |
|---|---|
| Главный CTA | **Подключить прокси** |
| Баннер VPN | **Получить VPN** |

### 10.4 Принципы текста

- Короткие, конкретные предложения
- Русский язык, обращение безлично (не «ты», не «вы»)
- Технические термины объясняются в тексте рядом
- Акцент на трёх ценностях: **бесплатно**, **безопасно**, **легко**

---

## 11. Недопустимые паттерны

- Не использовать тёмный режим (dark mode не реализован)
- Не добавлять тени тяжелее `shadow-md` к карточкам
- Не использовать цвета вне палитры
- Не изменять скругления маскота (должен быть `rounded-full`)
- Не применять шрифт с весом ниже 400 или выше 800
- Не размещать контент шире 960px

---

*Raccoonito Shop · raccoonito.org · Сервис не связан с Telegram Inc.*
