const { chromium } = require('playwright');
(async () => {
  const base='http://127.0.0.1:8091';
  const email=`chk-${Date.now()}@example.test`;
  const reg=await fetch(base+'/api/v1/auth/register',{method:'POST',headers:{'Content-Type':'application/json','Origin':base},body:JSON.stringify({email,password:'correct horse battery',display_name:'Chk'})});
  const cookie=reg.headers.get('set-cookie').split(';')[0]; const [name,value]=cookie.split('=');
  for(let i=0;i<7;i++) await fetch(base+'/api/v1/items',{method:'POST',headers:{'Content-Type':'application/json','Origin':base,'Cookie':cookie},body:JSON.stringify({kind:'movie',title:'T'+i,status:'done',rating:8,review:'x '.repeat(i*15)})});
  const b=await chromium.launch({headless:true}); const c=await b.newContext({viewport:{width:1822,height:700}}); await c.addCookies([{name,value,domain:'127.0.0.1',path:'/'}]); const p=await c.newPage(); await p.goto(base+'/items',{waitUntil:'networkidle'}); await p.waitForTimeout(1000);
  console.log(await p.evaluate(()=>{const u=document.querySelector('[data-masonry]'); if(!u) return 'no container'; return {attr:u.getAttribute('data-masonry'),display:getComputedStyle(u).display,pos:getComputedStyle(u).position,height:u.style.height,children:[...u.children].slice(0,4).map(li=>({pos:getComputedStyle(li).position,top:li.style.top,left:li.style.left,h:li.offsetHeight}))};}));
  await b.close();
})();
