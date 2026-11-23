const { chromium } = require('playwright');
(async () => {
  const base = 'http://127.0.0.1:8091';
  const email = `shot-${Date.now()}@example.test`;
  const reg = await fetch(base + '/api/v1/auth/register', {method:'POST', headers:{'Content-Type':'application/json','Origin':base}, body: JSON.stringify({email, password:'correct horse battery', display_name:'Shot'})});
  if (reg.status !== 201) throw new Error('register ' + reg.status);
  const cookie = reg.headers.get('set-cookie').split(';')[0];
  const [name, value] = cookie.split('=');
  const titles = ['Dark Souls III','Kinema Citrus','Master','Обсессия','Троя','Реальные пацаны','Dune'];
  for (let i=0;i<titles.length;i++) {
    const review = 'x '.repeat(i*15) + 'отзыв';
    const res = await fetch(base + '/api/v1/items', {method:'POST', headers:{'Content-Type':'application/json','Origin':base,'Cookie':cookie}, body: JSON.stringify({kind:'movie', title:titles[i], status:'done', rating:8, review, year:2020+i})});
    if (res.status !== 201) throw new Error('item ' + res.status);
  }
  const browser = await chromium.launch({headless:true});
  const context = await browser.newContext({viewport:{width:1822,height:700}});
  await context.addCookies([{name, value, domain:'127.0.0.1', path:'/'}]);
  const page = await context.newPage();
  await page.goto(base + '/items', {waitUntil:'networkidle'});
  await page.screenshot({path:'.staging/masonry.png', fullPage:true});
  await browser.close();
})();
