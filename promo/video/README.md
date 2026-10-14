# Промо-ролик TAJCODE LAB

Вертикальный ролик 1080×1920, 30 fps, 22.5 с, без звука — под Reels, Stories, TikTok, Shorts и Telegram-сторис.

Готовый файл: `tajcode-lab-promo.mp4`.

## Сцены

1. Хук — «Нужен сайт, приложение или бот?»
2. Оффер — «Технологии, которые двигают бизнес вперёд»
3. Услуги — сайты, приложения, CRM, Telegram-боты
4. Процесс — бриф → дизайн → разработка → запуск
5. Цена — сайт под ключ от 500$
6. CTA — tajcode-lab.ru, @tajcodelab_bot

## Правка и рендер

Анимация — функция `render(t)` в `scene.html`, кадр полностью определяется временем.
Превью в браузере: открыть `scene.html?play`.

```bash
cd promo/video
mkdir -p node_modules && ln -sfn "$(npm root -g)/playwright" node_modules/playwright
node render.mjs            # → tajcode-lab-promo.mp4
node render.mjs --stills   # контрольные кадры still-*.png
```

Нужны Playwright (Chromium) и ffmpeg. Папка `promo/` исключена из деплоя через `.vercelignore`.
