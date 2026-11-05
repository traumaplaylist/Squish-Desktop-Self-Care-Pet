// Рендерит иконки из SVG питомца: resources/icon.png (256, для установщика) и resources/tray.png (32).
// Запуск: node scripts/make-icons.mjs (нужен Playwright Chromium). PNG коммитятся в репозиторий.
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const svg = (size) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="22 34 156 156" width="${size}" height="${size}">
  <defs><radialGradient id="g" cx="38%" cy="30%" r="80%">
    <stop offset="0%" stop-color="#C9F4E6"/><stop offset="55%" stop-color="#9EE6CF"/><stop offset="100%" stop-color="#6FCBAF"/>
  </radialGradient></defs>
  <ellipse cx="76" cy="176" rx="14" ry="8" fill="#6FCBAF"/><ellipse cx="124" cy="176" rx="14" ry="8" fill="#6FCBAF"/>
  <path d="M100 42 C150 42 172 80 172 122 C172 160 142 180 100 180 C58 180 28 160 28 122 C28 80 50 42 100 42 Z" fill="url(#g)"/>
  <ellipse cx="72" cy="70" rx="20" ry="11" fill="#fff" opacity=".35" transform="rotate(-20 72 70)"/>
  <ellipse cx="76" cy="112" rx="17" ry="20" fill="#fff"/><ellipse cx="124" cy="112" rx="17" ry="20" fill="#fff"/>
  <circle cx="76" cy="114" r="10.5" fill="#2E2A3D"/><circle cx="124" cy="114" r="10.5" fill="#2E2A3D"/>
  <circle cx="72.5" cy="109.5" r="3.6" fill="#fff"/><circle cx="120.5" cy="109.5" r="3.6" fill="#fff"/>
  <ellipse cx="58" cy="133" rx="11" ry="6" fill="#FF9FB2" opacity=".5"/><ellipse cx="142" cy="133" rx="11" ry="6" fill="#FF9FB2" opacity=".5"/>
  <path d="M93 137 Q100 143 107 137" fill="none" stroke="#2E2A3D" stroke-width="3.2" stroke-linecap="round"/>
</svg>`;

const browser = await chromium.launch(
  process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
);
const page = await browser.newPage();
for (const [file, size] of [
  ['resources/icon.png', 256],
  ['resources/tray.png', 32],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(size)}</body></html>`,
  );
  writeFileSync(file, await page.locator('svg').screenshot({ omitBackground: true }));
  console.log('ok', file);
}
await browser.close();
