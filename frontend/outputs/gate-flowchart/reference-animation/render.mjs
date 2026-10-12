import {chromium} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
import {writeFileSync,readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {once} from 'node:events';
const dir=fileURLToPath(new URL('.',import.meta.url));
const server=createServer((req,res)=>{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(!['animation.html','reference.png'].includes(name)){res.writeHead(404).end();return}res.setHeader('Content-Type',name.endsWith('.png')?'image/png':'text/html');res.end(readFileSync(dir+name))});
server.listen(0,'127.0.0.1');await once(server,'listening');
const ffmpeg=execFileSync('/tmp/gate-video-render-env/bin/python',['-c','import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'],{encoding:'utf8'}).trim();
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:1688,height:932}});
 await page.goto(`http://127.0.0.1:${server.address().port}/animation.html?render=1`);
 await page.evaluate(()=>window.ready);
 const encoder=spawn(ffmpeg,['-y','-loglevel','error','-f','image2pipe','-vcodec','png','-framerate','30','-i','-','-an','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',dir+'gate-reference-animation.mp4']);
 let errors='';encoder.stderr.on('data',b=>errors+=b);
 const completed=once(encoder,'close');
 for(let i=0;i<300;i++){
  const data=await page.evaluate(t=>{window.renderFrame(t);return document.querySelector('canvas').toDataURL('image/png').split(',')[1]},i/30);
  const buffer=Buffer.from(data,'base64');
  if(!encoder.stdin.write(buffer))await once(encoder.stdin,'drain');
  if([45,100,165,270].includes(i))writeFileSync(dir+`check-${i}.png`,buffer);
  if(i%60===0)console.log(`Rendered ${i}/300 frames`);
 }
 encoder.stdin.end();const [code]=await completed;
 if(code!==0)throw new Error(errors);
 console.log('Saved 10-second animation: 1688 × 932, 30 fps.');
} finally {await browser.close();server.close()}
