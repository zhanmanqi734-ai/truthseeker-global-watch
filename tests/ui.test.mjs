import test from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';

test('dashboard tabs, outlet filter and article detail',async()=>{
 const w=new Window({url:'http://localhost:3000/'});
 globalThis.window=w;globalThis.document=w.document;Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});globalThis.HTMLElement=w.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const report={date:'2026-10-06',generatedAt:'2026-10-05T18:00:00Z',windowStart:'2026-10-05T00:00:00Z',windowEnd:'2026-10-05T18:00:00Z',complete:false,mode:'规则初筛',statuses:[{id:'bbc',name:'BBC News',ok:true,fetched:20,matched:1},{id:'dw',name:'Deutsche Welle',ok:true,fetched:25,matched:1}],articles:[
 {id:'a',source:'BBC News',sourceId:'bbc',title:'China trade claim requires context',titleZh:'中国贸易主张需结合背景',description:'A reported claim.',descriptionZh:'一项据报道的主张。',translationStatus:'已翻译',topic:'经济',url:'https://www.bbc.com/news/example',publishedAt:'2026-10-05T12:00:00Z',sentiment:'负面',analysisMode:'规则初筛',summaryZh:'一项据报道的主张。',claim:'待核查报道中的具体主张',reasons:['需核对原始数据'],checks:['查看原文'],importance:80,crossSourceCount:1,cluster:'a'},
 {id:'b',source:'Deutsche Welle',sourceId:'dw',title:'Chinese cultural event',titleZh:'中国文化活动',description:'A culture story.',descriptionZh:'一则文化新闻。',translationStatus:'已翻译',topic:'文化',url:'https://www.dw.com/example',publishedAt:'2026-10-05T11:00:00Z',sentiment:'中性',analysisMode:'规则初筛',summaryZh:'一则文化新闻。',claim:'未从标题与 RSS 摘要中抽出明确待核查断言。',reasons:['无明显倾向'],checks:['查看原文'],importance:50,crossSourceCount:1,cluster:'b'}]};
 const payload={report,reports:[{date:report.date,count:2}],lastRun:null,sources:[{id:'bbc',name:'BBC News',region:'英国',url:'https://feeds.bbci.co.uk/news/world/rss.xml'},{id:'dw',name:'Deutsche Welle',region:'德国',url:'https://rss.dw.com/xml/rss-en-all'}]};
 globalThis.fetch=async()=>new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
 const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {default:Home}=await import('../app/page.tsx');
 const mount=w.document.createElement('div');w.document.body.append(mount);const root=createRoot(mount);
 await act(async()=>{root.render(React.createElement(Home));await Promise.resolve()});
 assert.match(mount.textContent,/收录报道2/);
 const checkNav=[...mount.querySelectorAll('button')].find(b=>b.textContent.includes('核查线索'));
 await act(async()=>checkNav.click());
 assert.match(mount.textContent,/待核查信息点/);assert.equal(mount.querySelectorAll('.article').length,1);
 const sourceNav=[...mount.querySelectorAll('button')].find(b=>b.textContent.includes('媒体信源'));
 await act(async()=>sourceNav.click());
 assert.equal(mount.querySelectorAll('.source-card').length,2);
 const view=[...mount.querySelectorAll('.source-card')][1].querySelector('.source-view');
 await act(async()=>view.click());
 assert.equal(mount.querySelectorAll('.article').length,1);assert.match(mount.querySelector('.article').textContent,/Chinese cultural event/);
 assert.match(mount.querySelector('.article').textContent,/中国文化活动/);
 await act(async()=>mount.querySelector('.article-title').click());
 assert.ok(mount.querySelector('[role="dialog"]'));
 assert.match(mount.querySelector('[role="dialog"]').textContent,/一则文化新闻/);
 assert.match(mount.querySelector('[role="dialog"]').textContent,/A culture story/);
 assert.equal(mount.querySelector('.original').getAttribute('target'),'_blank');
 await act(async()=>mount.querySelector('[aria-label="关闭详情"]').click());
 assert.equal(mount.querySelector('[role="dialog"]'),null);
 const topicSelect=mount.querySelector('[aria-label="筛选话题"]');
 await act(async()=>{topicSelect.value='经济';topicSelect.dispatchEvent(new w.Event('change',{bubbles:true}))});
 assert.equal(mount.querySelectorAll('.article').length,0);
 await act(async()=>{topicSelect.value='文化';topicSelect.dispatchEvent(new w.Event('change',{bubbles:true}))});
 assert.equal(mount.querySelectorAll('.article').length,1);
 globalThis.fetch=async (url)=>String(url).startsWith('/api/run')?new Response('event: progress\ndata: {"stage":"collect","message":"已读取十个源"}\n\nevent: done\ndata: {"date":"2026-10-06","count":2,"mode":"规则初筛"}\n\n',{headers:{'content-type':'text/event-stream'}}):new Response(JSON.stringify(payload),{headers:{'content-type':'application/json'}});
 const runButton=[...mount.querySelectorAll('button')].find(b=>b.textContent.includes('立即运行监测'));
 await act(async()=>{runButton.click();await new Promise(resolve=>setTimeout(resolve,20))});
 assert.match(mount.textContent,/已保存 2 条报道/);
 await act(async()=>root.unmount());w.happyDOM.close();
});

test('editor can save bilingual report fields without external translation calls',async()=>{
 const w=new Window({url:'http://localhost:3000/'});
 globalThis.window=w;globalThis.document=w.document;globalThis.FormData=w.FormData;Object.defineProperty(globalThis,'navigator',{value:w.navigator,configurable:true});globalThis.HTMLElement=w.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const report={date:'2026-10-07',generatedAt:'2026-10-06T18:00:00Z',windowStart:'2026-10-06T00:00:00Z',windowEnd:'2026-10-06T18:00:00Z',complete:false,mode:'规则初筛',statuses:[],articles:[{id:'new',source:'BBC News',sourceId:'bbc',title:'China trade briefing',titleZh:'',description:'An economic update.',descriptionZh:'',translationStatus:'待翻译',topic:'经济',url:'https://www.bbc.com/news/new',publishedAt:'2026-10-06T12:00:00Z',sentiment:'中性',analysisMode:'规则初筛',summaryZh:'',claim:'',reasons:[],checks:[],importance:50,crossSourceCount:1,cluster:'new'}]};
 const saved=[];
 globalThis.fetch=async (url,opts)=>{
   if(String(url).startsWith('/api/dashboard'))return new Response(JSON.stringify({report,reports:[{date:report.date,count:1}],lastRun:null,sources:[]}));
   if(String(url)==='/api/translations'){saved.push(JSON.parse(opts.body));return new Response(JSON.stringify({saved:1}));}
   throw Error('Unexpected request '+url);
 };
 const React=await import('react');const {act}=React;const {createRoot}=await import('react-dom/client');const {default:Home}=await import('../app/page.tsx');
 const mount=w.document.createElement('div');w.document.body.append(mount);const root=createRoot(mount);
 await act(async()=>{root.render(React.createElement(Home));await Promise.resolve()});
 await act(async()=>mount.querySelector('.article-title').click());
 const form=mount.querySelector('.translation-editor form');
 form.querySelector('[name="titleZh"]').value='中国贸易简报';form.querySelector('[name="descriptionZh"]').value='一则经济动态。';
 await act(async()=>{form.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await new Promise(resolve=>setTimeout(resolve,10))});
 assert.equal(saved.length,1);assert.equal(saved[0].items[0].titleZh,'中国贸易简报');
 assert.match(mount.querySelector('.article').textContent,/一则经济动态/);
 await act(async()=>root.unmount());w.happyDOM.close();
});
