import test from 'node:test';
import assert from 'node:assert/strict';
import {windowFor,runPipeline,SOURCES,detectTopic,translateArticles,fillVerification} from '../lib/pipeline.ts';

test('Beijing 08:00 boundaries for final and manual reports',()=>{
 const atEight=new Date('2026-10-06T00:00:00.000Z');
 assert.deepEqual(windowFor(atEight,true),{date:'2026-10-06',start:'2026-10-05T00:00:00.000Z',end:'2026-10-06T00:00:00.000Z',complete:true});
 const before=windowFor(new Date('2026-10-05T23:59:59.000Z'),false);
 assert.equal(before.date,'2026-10-06');assert.equal(before.start,'2026-10-05T00:00:00.000Z');assert.equal(before.complete,false);
 const after=windowFor(new Date('2026-10-06T00:01:00.000Z'),false);
 assert.equal(after.date,'2026-10-07');assert.equal(after.start,'2026-10-06T00:00:00.000Z');
});

test('RSS keyword, time window, advertising and URL dedup',async()=>{
 const oldFetch=globalThis.fetch;
 const xml=`<rss><channel>
 <item><title>China&amp;#039;s trade outlook faces questions</title><description>Experts debate the reported claim.</description><link>https://example.com/a?utm_source=rss</link><pubDate>Mon, 05 Oct 2026 14:00:00 GMT</pubDate></item>
 <item><title>China&amp;#039;s trade outlook faces questions</title><description>Duplicate</description><link>https://example.com/a</link><pubDate>Mon, 05 Oct 2026 14:00:00 GMT</pubDate></item>
 <item><title>Sponsored content about China</title><description>Advertisement</description><link>https://example.com/ad</link><pubDate>Mon, 05 Oct 2026 14:00:00 GMT</pubDate></item>
 <item><title>China outdated article</title><description>Outside window</description><link>https://example.com/old</link><pubDate>Sun, 04 Oct 2026 14:00:00 GMT</pubDate></item>
 <item><title>Other world story</title><description>No keyword</description><link>https://example.com/other</link><pubDate>Mon, 05 Oct 2026 14:00:00 GMT</pubDate></item>
 </channel></rss>`;
 let translationCalls=0;
 globalThis.fetch=async(url)=>String(url).includes('mymemory.translated.net')?(translationCalls++,new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'中国贸易前景受到质疑'}}),{status:200})):new Response(xml,{status:200,headers:{'content-type':'text/xml'}});
 try {const window={start:'2026-10-05T00:00:00.000Z',end:'2026-10-06T00:00:00.000Z'};const result=await runPipeline(window);assert.equal(result.statuses.length,SOURCES.length);assert.equal(result.articles.length,1);assert.equal(result.articles[0].url,'https://example.com/a');assert.match(result.articles[0].title,/China's/);assert.equal(result.articles[0].analysisMode,'规则初筛');assert.equal(result.articles[0].titleZh,'中国贸易前景受到质疑');assert.equal(result.articles[0].translationStatus,'已翻译');assert.equal(result.articles[0].topic,'经济');assert.equal(translationCalls,2);const next=await runPipeline(window,{existing:result.articles});assert.equal(next.articles[0].titleZh,result.articles[0].titleZh);assert.equal(translationCalls,2);}
 finally{globalThis.fetch=oldFetch;}
});

test('topic classification favors specific headline signals and stays uncertain without a match',()=>{
 assert.equal(detectTopic('Chinese navy holds military drills near Taiwan'),'军事');
 assert.equal(detectTopic('China wins Olympic tennis final'),'体育');
 assert.equal(detectTopic('Medvedev disqualified from China Open for hitting fan with a ball','Match with a spectator'),'体育');
 assert.equal(detectTopic('FBI arrests woman accused of spying for China'),'时政');
 assert.equal(detectTopic('China story with no details'),'其他');
});

test('translation outage preserves the original and allows a later retry',async()=>{
 const oldFetch=globalThis.fetch;
 const xml='<rss><channel><item><title>China trade outlook</title><description>China exports rose in the report.</description><link>https://example.com/retry</link><pubDate>Mon, 05 Oct 2026 14:00:00 GMT</pubDate></item></channel></rss>';
 let unavailable=true;
 globalThis.fetch=async url=>String(url).includes('mymemory.translated.net')?(unavailable?new Response('unavailable',{status:503}):new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'中国贸易前景'}}),{status:200})):new Response(xml,{status:200});
 try {const window={start:'2026-10-05T00:00:00.000Z',end:'2026-10-06T00:00:00.000Z'};const first=await runPipeline(window);assert.equal(first.articles.length,1);assert.equal(first.articles[0].translationStatus,'翻译失败');assert.equal(first.articles[0].title,'China trade outlook');unavailable=false;const second=await runPipeline(window,{existing:first.articles});assert.equal(second.articles[0].translationStatus,'已翻译');assert.equal(second.articles[0].titleZh,'中国贸易前景');}
 finally{globalThis.fetch=oldFetch;}
});

test('quota error stops further calls and old entries receive concrete verification fields',async()=>{
 const oldFetch=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('rate limited',{status:429})};
 try {
  const old={id:'old',source:'Financial Times',sourceId:'ft',title:'China export boom reaches $50 billion',titleZh:'',description:'Exports rose.',descriptionZh:'',translationStatus:'待翻译',topic:'经济',url:'https://example.com/old',publishedAt:'2026-10-05T10:00:00Z',sentiment:'中性',analysisMode:'规则初筛',summaryZh:'',claim:'未从标题与 RSS 摘要中抽出明确待核查断言。',reasons:[],checks:[],importance:50,crossSourceCount:1,cluster:'old'};
  const ready=fillVerification(old);
  assert.match(ready.verificationPoints[0],/50/);
  assert.ok(ready.recommendations.some(x=>x.url==='https://www.hkexnews.hk/'));
  const result=await translateArticles([old,{...old,id:'second'}]);
  assert.equal(calls,1);
  assert.deepEqual(result.map(x=>x.translationStatus),['翻译失败','翻译失败']);
 } finally {globalThis.fetch=oldFetch}
});
