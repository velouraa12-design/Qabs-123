from playwright.sync_api import sync_playwright
import json,time,os,tempfile
from pathlib import Path
# Run against a local Vite server only. External partnership navigation is intercepted.
out=Path(os.environ.get("QABS_TEST_ARTIFACT_DIR") or tempfile.mkdtemp(prefix="qabs-partnership-test-"));out.mkdir(parents=True,exist_ok=True)
results=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/local/bin/chromium'),headless=True,args=['--no-sandbox'])
 for name,w,h in [('desktop',1440,900),('mobile',390,844)]:
  for lang in ['ar','en']:
   ctx=browser.new_context(viewport={'width':w,'height':h});ctx.add_init_script(f"localStorage.setItem('qabs_lang','{lang}')");page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   data={'size':name,'lang':lang,'checks':{}}
   try:
    page.goto('http://127.0.0.1:3000/#/',wait_until='networkidle');page.screenshot(path=str(out / f'{name}-{lang}.png'),full_page=True)
    assert page.locator('html').get_attribute('dir')==('rtl' if lang=='ar' else 'ltr');data['checks']['direction']=True
    ext='https://qabs-partnerships-preview-20261113.qabs1store.workers.dev/partnerships';links=page.locator(f'a[href="{ext}"]');assert links.count()==3,links.count();assert all(links.nth(i).get_attribute('rel')=='noreferrer' for i in range(3));data['checks']['partner_links']=3
    assert page.locator('#partnerships-title').count()==1 and page.locator('#services').count()==1;assert '\\n' not in page.locator('main').inner_text();data['checks']['sections_and_literal_newline']=True
    cards=page.locator('a.service-card[href^="#/services/"]');hrefs=cards.evaluate_all('(as)=>as.map(a=>a.getAttribute("href"))');assert len(hrefs)==9,len(hrefs)
    for link in hrefs:
     page.goto('http://127.0.0.1:3000/'+link);page.wait_for_timeout(75);assert page.locator('main h1').count()==1,link
    data['checks']['service_pages']=len(hrefs);page.goto('http://127.0.0.1:3000/#/')
    if name=='mobile':
     page.locator('button.mobilemenu').click();assert page.locator('button.mobilemenu').get_attribute('aria-expanded')=='true';assert page.locator(f'nav.topnav a[href="{ext}"]').is_visible();data['checks']['mobile_menu']=True
    ctx.route('https://qabs-partnerships-preview-20261113.qabs1store.workers.dev/**',lambda route: route.fulfill(status=200,body='Locally intercepted test destination'))
    for i in range(3):
     with page.expect_popup() as opened: links.nth(i).click()
     popup=opened.value;popup.wait_for_load_state();assert popup.url==ext,popup.url;popup.close()
    data['checks']['partner_link_clicks_intercepted']=3
    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1');data['checks']['no_horizontal_overflow']=True
    assert not errors,errors;data['checks']['javascript_errors']=0;data['result']='PASS'
   except Exception as e: data['result']='FAIL';data['error']=str(e);data['errors']=errors
   results.append(data);ctx.close()
 browser.close()
open(out / 'browser-results.json','w').write(json.dumps(results,indent=2,ensure_ascii=False));print(json.dumps(results,indent=2,ensure_ascii=False));exit(any(x['result']!='PASS' for x in results))
