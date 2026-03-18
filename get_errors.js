import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('BROWSER ERROR:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE ERROR:', error.message);
  });

  page.on('response', response => {
    if (!response.ok()) {
      console.log('NETWORK ERROR:', response.url(), response.status());
    }
  });

  try {
    await page.goto('http://localhost:5174', { waitUntil: 'networkidle0', timeout: 10000 });
  } catch (e) {
    console.log('TIMEOUT OR LOAD ERROR:', e.message);
  }
  
  await browser.close();
})();
