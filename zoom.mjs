import { chromium } from 'playwright-core';
const BASE = 'http://localhost:8953';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 4 });
await page.addInitScript(() => {
  localStorage.setItem('frequencylab.v1.preferences', JSON.stringify({
    version: 1, savedAt: new Date().toISOString(),
    data: { experienceLevel: 'simple', reducedMotion: false, hapticsEnabled: true,
      comfortableOutputLevel: 0.5, sampleRate: 48000, biometricsEnabled: false,
      analyticsEnabled: true, theme: 'dark', defaultBinauralMode: 'offset',
      noteReferenceHz: 440, dspDebugEnabled: false,
      onboardingCompletedAt: '2026-01-01T00:00:00.000Z' },
  }));
});
page.on('pageerror', (e) => console.log('PAGEERROR:', e.message.slice(0,200)));
page.on('console', (m) => { if (m.type()==='error') console.log('CONSOLE:', m.text().slice(0,200)); });
await page.goto(BASE + '/', { waitUntil: 'networkidle' });
await page.waitForTimeout(4500);
console.log('url:', page.url());
console.log('body:', (await page.locator('body').innerText()).replace(/\n+/g,' | ').slice(0,200));
const all = await page.getByRole('button').all();
const labels = [];
for (const b of all) labels.push(((await b.getAttribute('aria-label')) || (await b.innerText())).replace(/\n/g,' ').trim().slice(0,44));
console.log('buttons on screen:', JSON.stringify(labels, null, 1));
const tabs = await page.getByRole('tab').all();
const tn = []; for (const t of tabs) tn.push(((await t.getAttribute('aria-label')) || '').trim());
console.log('tabs:', tn.join(' | '));
const btn = page.getByRole('button', { name: /profile and settings/i }).first();
console.log('found:', await btn.count());
const box = await btn.boundingBox();
console.log('box:', JSON.stringify(box));
await btn.screenshot({ path: '/tmp/flshots/50-profile-btn.png' });
await page.screenshot({ path: '/tmp/flshots/51-header.png', clip: { x: 250, y: 0, width: 180, height: 70 } });
// Does it actually contain an <svg> with drawn geometry?
const info = await btn.evaluate((el) => {
  const svg = el.querySelector('svg');
  if (!svg) return { svg: false };
  const r = svg.getBoundingClientRect();
  const shapes = [...svg.querySelectorAll('circle,path')].map((s) => ({
    tag: s.tagName,
    stroke: getComputedStyle(s).stroke,
    strokeWidth: getComputedStyle(s).strokeWidth,
    fill: getComputedStyle(s).fill,
  }));
  const b = el.getBoundingClientRect();
  return { svg: true, svgRect: {x: Math.round(r.x), y: Math.round(r.y), w: r.width, h: r.height},
           btnRect: {x: Math.round(b.x), y: Math.round(b.y), w: b.width, h: b.height},
           rimTag: el.children[1] ? el.children[1].tagName + ' pos=' + getComputedStyle(el.children[1]).position : 'none',
           shapes };
});
console.log('svg:', JSON.stringify(info, null, 1));
const html = await btn.evaluate((el) => el.outerHTML);
console.log('\nOUTER HTML:\n' + html.slice(0, 1400));
await browser.close();
