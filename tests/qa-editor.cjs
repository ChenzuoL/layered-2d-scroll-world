const {createRequire}=require('node:module');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const requireQA=process.env.PLAYWRIGHT_ROOT?createRequire(path.resolve(process.env.PLAYWRIGHT_ROOT,'package.json')):require;
const {chromium}=requireQA('playwright-core');
const root=path.resolve(__dirname,'../templates/starter'),out=process.env.QA_OUTPUT||'/tmp/layered-calibration-qa';fs.mkdirSync(out,{recursive:true});
const mime={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.webp':'image/webp'};
const server=http.createServer((req,res)=>{const file=path.join(root,req.url==='/'?'editor.html':req.url);fs.readFile(file,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(e?'missing':b);});});
const base=JSON.parse(fs.readFileSync(root+'/config/world.json'));
const payload=json=>({name:'agent-draft.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/local/bin/google-chrome',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const errors=[],checks=[];
 try{
 for(const [width,height] of [[1440,1000],[390,844]]){
  const page=await browser.newPage({viewport:{width,height}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
  await page.goto(`http://127.0.0.1:${server.address().port}/editor.html`,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.calibration?.inspect().ready);
  assert.equal(await page.locator('#chapter').inputValue(),'woodland');assert.ok(await page.locator('.layer').count());
  const inspect=()=>page.evaluate(()=>window.calibration.inspect());
  const setNumber=async(selector,value)=>{const input=page.locator(selector);await input.fill(String(value));await input.dispatchEvent('change');};
  await page.locator('#asset').selectOption('asset:squirrel#1');await setNumber('#ix-number',.9);
  assert.equal((await inspect()).config.chapters[1].elements[5].x,.9);
  await setNumber('#iheight-number',1.4);await setNumber('#iz-number',-3);
  assert.ok((await inspect()).diff.some(r=>r.path==='/height'));
  await page.screenshot({path:path.join(out,`${width}-assets.png`),fullPage:true});
  // Click and drag an opaque part of the sprite at its projected center.
  const position=await page.evaluate(()=>window.calibration.point('scene','asset:squirrel#1'));
  const canvas=await page.locator('canvas').boundingBox();assert.ok(position.x>=canvas.x&&position.x<=canvas.x+canvas.width);
  await page.mouse.move(position.x,position.y);await page.mouse.down();await page.mouse.move(position.x+20,position.y-12,{steps:6});await page.mouse.up();
  assert.notEqual((await inspect()).config.chapters[1].elements[5].x,.9);
  // Repeated assets are independently identified. Draft imports also change camera and guide.
  const current=(await inspect()).config,draft=structuredClone(current);
  draft.chapters[1].elements.push({...draft.chapters[1].elements[2],id:'extra-maple',x:-1,z:-5});
  draft.chapters[1].camera.to[0]+=.5;draft.chapters[1].camera.look[1]+=.2;draft.chapters[1].guidePath[1][0]+=.6;
  draft.chapters[1].elements[2].width=5;
  await page.locator('#import-file').setInputFiles(payload(draft));await page.waitForFunction(()=>window.calibration.inspect().pendingDraft);
  assert.ok((await inspect()).diff.some(r=>r.scope.includes('extra-maple')));
  assert.ok((await inspect()).diff.some(r=>r.path.includes('/camera/to')));
  await page.locator('#compare').check();assert.ok((await inspect()).before);assert.equal(await page.locator('#asset option').count(),8);
  await page.locator('#compare').uncheck();await page.locator('#asset').selectOption('id:extra-maple');
  await setNumber('#ix-number',-1.4);assert.equal((await inspect()).config.chapters[1].elements.at(-1).x,-1.4);
  await page.locator('#revert').click();assert.ok(!(await inspect()).pendingDraft);assert.deepEqual((await inspect()).config,current);
  // Reimport same file, apply, then camera and guide controls.
  await page.locator('#import-file').setInputFiles(payload(draft));await page.waitForFunction(()=>window.calibration.inspect().pendingDraft);await page.locator('#apply').click();
  await page.locator('[data-target="camera"]').click();await page.locator('#view-mode').selectOption('overview');await page.locator('#camera-mode').selectOption('to');await setNumber('#cz-number',10);
  assert.equal((await inspect()).config.chapters[1].camera.to[2],10);assert.ok((await inspect()).helpers>8);
  await page.locator('#camera-mode').selectOption('look');await setNumber('#cy-number',1.6);assert.equal((await inspect()).config.chapters[1].camera.look[1],1.6);
  await page.screenshot({path:path.join(out,`${width}-camera.png`),fullPage:true});
  await page.locator('[data-target="guide"]').click();await page.locator('#guide-point').selectOption('1');await setNumber('#gz-number',-4.5);
  assert.equal((await inspect()).config.chapters[1].guidePath[1][2],-4.5);
  const handle=await page.evaluate(()=>window.calibration.point('guide',1));const prior=(await inspect()).config.chapters[1].guidePath[1];
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+18,handle.y-10,{steps:6});await page.mouse.up();
  const shifted=(await inspect()).config.chapters[1].guidePath[1];assert.notEqual(shifted[0],prior[0]);assert.equal(shifted[2],prior[2]);
  await page.screenshot({path:path.join(out,`${width}-guide.png`),fullPage:true});
  await page.locator('#view-mode').selectOption('camera');await page.locator('#preview-time').evaluate(el=>{el.value=.75;el.dispatchEvent(new Event('input'));});assert.equal(await page.locator('#preview-value').textContent(),'75%');
  const fullPromise=page.waitForEvent('download');await page.locator('#download').click();const full=await fullPromise;const fullJSON=JSON.parse(fs.readFileSync(await full.path()));
  const patchPromise=page.waitForEvent('download');await page.locator('#download-patch').click();const patch=await patchPromise;const patchJSON=JSON.parse(fs.readFileSync(await patch.path()));
  const {applyPatch}=await import(path.join(root,'engine/calibration.js'));assert.deepEqual(applyPatch(base,patchJSON),fullJSON);
  const beforeBad=JSON.stringify((await inspect()).config);const bad=structuredClone(fullJSON);bad.chapters[1].elements[0].height=-5;
  await page.locator('#import-file').setInputFiles(payload(bad));await page.waitForFunction(()=>document.getElementById('status').dataset.error==='true');assert.equal(JSON.stringify((await inspect()).config),beforeBad);
  const missing=structuredClone(fullJSON);missing.assets.cloud.file='missing-calibration-test.webp';await page.locator('#import-file').setInputFiles(payload(missing));await page.waitForFunction(()=>document.getElementById('status').textContent.startsWith('Draft rejected:'));assert.equal(JSON.stringify((await inspect()).config),beforeBad);
  // Back to ordinary scene selection, layer buttons must select the exact instance.
  await page.locator('[data-target="scene"]').click();await page.locator('[data-instance="id:extra-maple"]').click();assert.equal((await inspect()).selection,'id:extra-maple');
  await page.locator('#reset').click();assert.equal(await page.locator('#preview-time').inputValue(),'0');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  checks.push({width,height,drag:true,importApplyRevert:true,camera:true,guide:true,fullAndPatchRoundtrip:true,invalidImportSafe:true,helpers:(await inspect()).helpers});
  await page.close({runBeforeUnload:false});
 }
 fs.writeFileSync(path.join(out,'report.json'),JSON.stringify({errors,checks},null,2));assert.deepEqual(errors,[]);console.log(JSON.stringify({errors,checks}));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
