const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function clickByTextIfExists(page, candidates) {
  for (const text of candidates) {
    const locator = page.getByText(text, { exact: false }).first();
    if (await locator.count()) {
      try {
        await locator.click({ timeout: 1500 });
        return true;
      } catch {
        // Ignore and try next candidate.
      }
    }
  }
  return false;
}

async function safeNavigate(page, section, holdMs = 2500) {
  await page.evaluate((target) => {
    if (typeof window.navigate === 'function') window.navigate(target);
    else {
      location.hash = `#${target}`;
    }
  }, section);
  await wait(holdMs);
}

(async () => {
  const appDir = __dirname;
  const indexUrl = `file:///${path.join(appDir, 'index.html').replace(/\\/g, '/')}`;
  const appUrl = `file:///${path.join(appDir, 'app.html').replace(/\\/g, '/')}?profile=student`;

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 768 },
    recordVideo: {
      dir: path.join(appDir, 'demo-output'),
      size: { width: 1366, height: 768 }
    }
  });

  const page = await context.newPage();

  try {
    // 0-4s: Landing page + role picker.
    await page.goto(indexUrl, { waitUntil: 'load' });
    await wait(1300);
    await clickByTextIfExists(page, ['Get Started', 'Sign In', 'Start']);
    await wait(600);
    await clickByTextIfExists(page, ['Student', 'Standard']);
    await wait(1500);

    // Fallback directly into app shell if modal/redirect did not trigger.
    if (!page.url().toLowerCase().includes('app.html')) {
      await page.goto(appUrl, { waitUntil: 'load' });
      await wait(1200);
    }

    // 4-8s: Dashboard.
    await safeNavigate(page, 'dashboard', 3000);

    // 8-12s: Tracker (add one transaction).
    await safeNavigate(page, 'tracker', 1800);
    const amount = page.locator('#tx-amount');
    if (await amount.count()) {
      await amount.fill('75');
      await page.locator('#tx-desc').fill('Demo transaction');
      await page.locator('#tx-form button[type="submit"]').click();
      await wait(1300);
    }

    // 12-15s: Budget planner.
    await safeNavigate(page, 'budget', 2500);

    // 15-18s: Savings goals.
    await safeNavigate(page, 'goals', 2500);

    // 18-21s: Saving challenge.
    await safeNavigate(page, 'challenge', 2500);

    // 21-24s: Recommendations.
    await safeNavigate(page, 'recommend', 2500);

    // 24-27s: Analytics.
    await safeNavigate(page, 'analytics', 2500);

    // 27-30s: Settings + account switch.
    await safeNavigate(page, 'settings', 1300);
    const profileSelect = page.locator('select').filter({ hasText: 'Student' }).first();
    if (await profileSelect.count()) {
      await profileSelect.selectOption('standard').catch(() => {});
      await wait(900);
      await profileSelect.selectOption('student').catch(() => {});
      await wait(900);
    } else {
      await wait(1800);
    }
  } finally {
    await context.close();
    await browser.close();
  }

  // Move recorded file to a stable output name.
  const outputDir = path.join(appDir, 'demo-output');
  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.webm'));
  if (!files.length) {
    throw new Error('No video file was produced.');
  }

  files.sort((a, b) => {
    const aTime = fs.statSync(path.join(outputDir, a)).mtimeMs;
    const bTime = fs.statSync(path.join(outputDir, b)).mtimeMs;
    return bTime - aTime;
  });

  const latest = path.join(outputDir, files[0]);
  const finalPath = path.join(appDir, 'budgetit-demo-30s.webm');
  fs.copyFileSync(latest, finalPath);

  console.log(`Demo video created: ${finalPath}`);
})();
