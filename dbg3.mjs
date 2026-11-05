import { chromium } from 'playwright-core';
let b; try { b = await chromium.launch(); } catch { b = await chromium.launch({ channel: 'chrome' }); }
const ctx = await b.newContext();
const lg = await ctx.newPage();
await lg.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded' });
await lg.fill('input[type="email"]', 'jovangoodluck+testparent@myitutor.com');
await lg.fill('input[type="password"]', 'StagingTest!Parent26');
await lg.click('button[type="submit"]'); await lg.waitForTimeout(6000); await lg.close();
const p = await ctx.newPage();
await p.setViewportSize({ width: 390, height: 844 });
await p.goto('http://localhost:3000/parent/dashboard', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(8000);
const btns = await p.evaluate(() => Array.from(document.querySelectorAll('button')).map((b,i) => i+': '+(b.innerText||'').replace(/\s+/g,' ').trim().slice(0,44)));
console.log(btns.join('\n'));
