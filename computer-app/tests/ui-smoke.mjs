import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const server=spawn('python',['local-learning/service.py'],{cwd:'..',stdio:'inherit'});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage({viewport:{width:390,height:844}});
 await page.goto('http://127.0.0.1:8765/computer/');
 await page.getByRole('button',{name:'Log in as Guest'}).click({timeout:30000});
 await page.getByRole('button',{name:'Open Synthia Human Design',exact:true}).click();
 const frame=page.frameLocator('iframe[title="Synthia phone app"]');
 await frame.getByRole('navigation',{name:'Main navigation'}).waitFor();
 const bounds=await page.locator('.computer-window').boundingBox();
 assert(bounds.width<=390&&bounds.x>=0,'Phone app window must fit viewport');
 await page.getByRole('button',{name:'⌂ Home',exact:true}).click();
 await page.getByRole('button',{name:'Open Settings',exact:true}).click();
 await page.getByRole('button',{name:'Background',exact:true}).click();
 await page.locator('button').filter({hasText:'Nature'}).last().click();
 const stored=await page.evaluate(()=>JSON.parse(localStorage.getItem('synthia_computer_preferences')));
 assert(stored.theme.wallpaper==='/computer/wallpaper-nature.svg');
 await page.getByRole('button',{name:'⌂ Home',exact:true}).click();
 await mkdir('screenshots',{recursive:true});
 await page.screenshot({path:'screenshots/phone-hub.png'});
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:'screenshots/computer-hub.png'});
 console.log('Phone launcher, embedded Human Design, viewport fit, wallpaper customization and persistence passed.');
}finally{await browser.close();server.kill('SIGTERM');}
