import { XMLParser } from 'fast-xml-parser';
import { Annotation, StateGraph, START, END } from '@langchain/langgraph';

export const SOURCES = [
  { id:'bbc', name:'BBC News', region:'英国', url:'https://feeds.bbci.co.uk/news/world/asia/china/rss.xml' },
  { id:'guardian', name:'The Guardian', region:'英国', url:'https://www.theguardian.com/world/rss' },
  { id:'washpost', name:'The Washington Post', region:'美国', url:'https://feeds.washingtonpost.com/rss/world' },
  { id:'aljazeera', name:'Al Jazeera', region:'卡塔尔', url:'https://www.aljazeera.com/xml/rss/all.xml' },
  { id:'dw', name:'Deutsche Welle', region:'德国', url:'https://rss.dw.com/xml/rss-en-all' },
  { id:'france24', name:'France 24', region:'法国', url:'https://www.france24.com/en/rss' },
  { id:'euronews', name:'Euronews', region:'欧洲', url:'https://www.euronews.com/rss' },
  { id:'npr', name:'NPR', region:'美国', url:'https://feeds.npr.org/1004/rss.xml' },
  { id:'ft', name:'Financial Times', region:'英国', url:'https://www.ft.com/world?format=rss' },
  { id:'nikkei', name:'Nikkei Asia', region:'日本', url:'https://asia.nikkei.com/rss/feed/nar' },
  { id:'nyt', name:'The New York Times', region:'美国', url:'https://rss.nytimes.com/services/xml/rss/nyt/World.xml', feeds:['https://rss.nytimes.com/services/xml/rss/nyt/World.xml','https://rss.nytimes.com/services/xml/rss/nyt/Business.xml','https://rss.nytimes.com/services/xml/rss/nyt/Technology.xml'] },
  { id:'scmp', name:'South China Morning Post', region:'中国香港', url:'https://www.scmp.com/rss/4/feed' },
  { id:'sky', name:'Sky News', region:'英国', url:'https://feeds.skynews.com/feeds/rss/world.xml', feeds:['https://feeds.skynews.com/feeds/rss/world.xml','https://feeds.skynews.com/feeds/rss/business.xml'] },
  { id:'voa', name:'Voice of America', region:'美国', url:'https://www.voanews.com/api/zmjuqtl-vomx-tpey_jqq' },
  { id:'cbc', name:'CBC News', region:'加拿大', url:'https://www.cbc.ca/webfeed/rss/rss-world' },
  { id:'conversation', name:'The Conversation', region:'国际', url:'https://theconversation.com/topics/china-336/articles.atom' },
] as const;

export type Article = { id:string; source:string; sourceId:string; title:string; titleZh:string; description:string; descriptionZh:string; translationStatus:'已翻译'|'翻译失败'|'待翻译'|'无摘要'; translationError?:string; topic:string; url:string; publishedAt:string; sentiment:'正面'|'中性'|'负面'|'待研判'; analysisMode:'AI'|'规则初筛'; summaryZh:string; claim:string; reasons:string[]; checks:string[]; verificationPoints?:string[]; recommendations?:{label:string;url:string;action:string}[]; importance:number; crossSourceCount:number; cluster:string; };
type SourceStatus = { id:string; name:string; ok:boolean; fetched:number; matched:number; error?:string };
type PipelineState = { raw:Article[]; articles:Article[]; statuses:SourceStatus[]; mode:'AI'|'规则初筛'; windowStart:string; windowEnd:string; };
const GraphState = Annotation.Root({
  raw:Annotation<Article[]>({reducer:(_,v)=>v,default:()=>[]}),
  articles:Annotation<Article[]>({reducer:(_,v)=>v,default:()=>[]}),
  statuses:Annotation<SourceStatus[]>({reducer:(_,v)=>v,default:()=>[]}),
  mode:Annotation<'AI'|'规则初筛'>({reducer:(_,v)=>v,default:()=> '规则初筛'}),
  windowStart:Annotation<string>(), windowEnd:Annotation<string>(),
});
const parser = new XMLParser({ignoreAttributes:false, attributeNamePrefix:'@_', textNodeName:'#text', trimValues:true, processEntities:true});
const array = <T>(x:T|T[]|undefined):T[] => x===undefined?[]:Array.isArray(x)?x:[x];
function clean(value:unknown) { const s=typeof value==='string'?value:typeof value==='number'?String(value):value&&typeof value==='object'&&'#text' in value?String((value as {'#text':unknown})['#text']):''; return s.replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&#(\d+);|&#x([\da-f]+);/gi,(_,decimal,hex)=>String.fromCodePoint(parseInt(decimal||hex,hex?16:10))).replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;|&#39;/g,"'").replace(/\s+/g,' ').trim().slice(0,850); }
function normalizeLink(value:any):string { if(Array.isArray(value))value=value.find(x=>x?.['@_rel']==='alternate')||value.find(x=>x?.['@_href'])||value[0];const raw=typeof value==='string'?value:typeof value==='object'?(value?.['@_href']||value?.['#text']||''):''; try { const u=new URL(raw); if(u.protocol!=='https:'&&u.protocol!=='http:')return ''; u.hash=''; for(const k of [...u.searchParams.keys()])if(/^utm_|^fbclid$|^gclid$/i.test(k))u.searchParams.delete(k); return u.toString(); }catch{return '';} }
async function hash(s:string) { const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)); return [...new Uint8Array(d)].slice(0,12).map(b=>b.toString(16).padStart(2,'0')).join(''); }
function xmlEntries(xml:string):any[] { const data=parser.parse(xml); return array(data?.rss?.channel?.item ?? data?.feed?.entry ?? data?.['rdf:RDF']?.item); }
function published(entry:any):string { const raw=clean(entry.pubDate||entry['dc:date']||entry.published||entry.updated||entry.date);const d=new Date(raw);return Number.isNaN(+d)?'':d.toISOString(); }
async function readFeed(source:typeof SOURCES[number],feedUrl:string,start:number,end:number):Promise<{articles:Article[];fetched:number;matched:number}> {
    const response=await fetch(feedUrl,{headers:{'Accept':'application/rss+xml, application/atom+xml, text/xml, application/xml','User-Agent':'TruthSeeker private research RSS reader/1.0'},signal:AbortSignal.timeout(14000)});
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const xml=await response.text();if(xml.length>2_000_000)throw Error('订阅源超出 2 MB 限额');
    const entries=xmlEntries(xml);
    if(!entries.length)throw Error('未解析出 RSS/Atom 条目');
    const articles:Article[]=[];
    for(const entry of entries){
      const title=clean(entry.title);const description=clean(entry.description||entry.summary||entry['content:encoded']||entry.content);
      const url=normalizeLink(entry.link||entry.id||entry.guid);const time=published(entry); const t=Date.parse(time);
      if(!title||!url||!Number.isFinite(t)||t<start||t>=end)continue;
      articles.push({id:await hash(url),source:source.name,sourceId:source.id,title,titleZh:'',description,descriptionZh:'',translationStatus:'待翻译',topic:'其他',url,publishedAt:time,sentiment:'待研判',analysisMode:'规则初筛',summaryZh:'',claim:'',reasons:[],checks:[],importance:0,crossSourceCount:1,cluster:''});
    }
    return {articles,fetched:entries.length,matched:articles.length};
}
async function readSource(source:typeof SOURCES[number],start:number,end:number):Promise<{articles:Article[];status:SourceStatus}> {
  const feeds='feeds' in source?source.feeds:[source.url];
  const results=await Promise.allSettled(feeds.map(url=>readFeed(source,url,start,end)));
  const good=results.filter((r):r is PromiseFulfilledResult<Awaited<ReturnType<typeof readFeed>>>=>r.status==='fulfilled');
  const errors=results.filter((r):r is PromiseRejectedResult=>r.status==='rejected').map(r=>r.reason instanceof Error?r.reason.message:'读取失败');
  return {articles:good.flatMap(r=>r.value.articles),status:{id:source.id,name:source.name,ok:good.length>0,fetched:good.reduce((n,r)=>n+r.value.fetched,0),matched:good.reduce((n,r)=>n+r.value.matched,0),...(errors.length?{error:errors.join('；')}: {})}};
}
const chinaPattern=/\bchina\b|\bchinese\b/i;
const adPattern=/\b(advertisement|sponsored content|paid post|partner content)\b/i;
const suspiciousPattern=/\b(claims?|alleged|accused|reportedly|rumou?r|fake|disinformation|secret|cover.up|leaked|unverified)\b/i;
const negativePattern=/\b(crisis|threat|sanction|ban|spy|espionage|crackdown|abuse|attack|tension|dispute|protest|risk|repression|collapse|violation)\b/i;
const positivePattern=/\b(breakthrough|agreement|cooperation|growth|recovery|progress|innovation|success)\b/i;
function tokens(title:string) {return new Set(title.toLowerCase().replace(/[^a-z0-9 ]/g,' ').split(/\s+/).filter(x=>x.length>3&&!['china','chinese','about','after','from','with','says','amid'].includes(x)));}
function similarity(a:string,b:string){const x=tokens(a),y=tokens(b);const shared=[...x].filter(v=>y.has(v)).length;return shared/Math.max(1,Math.min(x.size,y.size));}
const topicRules:[string,RegExp][]=[
  ['军事',/\b(military|army|navy|air force|defen[cs]e|weapon|missile|warship|fighter jet|drill|taiwan strait)\b/i],
  ['时政',/\b(politic|election|diplomat|minister|president|parliament|government|policy|summit|sanction|legislation|tariff|embassy|party congress|spy|spying|espionage|intelligence|fbi)\w*/i],
  ['经济',/\b(econom|trade|market|stock|bank|investment|business|export|import|inflation|gdp|currency|manufactur|property|finance|supply chain)\w*/i],
  ['科技',/\b(technolog|ai|artificial intelligence|chip|semiconductor|robot|space|satellite|quantum|electric vehicle|evs|battery|cyber|scientist)\w*/i],
  ['环境',/\b(climate|environment|carbon|emission|pollution|renewable|solar|wind power|wildlife|flood|drought|green energy)\w*/i],
  ['体育',/\b(sport|olympic|football|soccer|basketball|tennis|athlet|medal|championship|tournament|world cup|china open|spectator)\w*/i],
  ['文化',/\b(cultur|film|cinema|music|art|museum|literature|festival|heritage|fashion|tourism|book)\w*/i],
  ['社会',/\b(societ|social|health|hospital|education|school|student|population|migration|family|worker|community|crime|disaster)\w*/i],
];
export function detectTopic(title:string,description=''){
  const scored=topicRules.map(([topic,pattern],index)=>({topic,index,score:(title.match(new RegExp(pattern.source,'gi'))||[]).length*3+(description.match(new RegExp(pattern.source,'gi'))||[]).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index);
  return scored[0]?.topic||'其他';
}
function classify(article:Article):Article {const txt=`${article.title} ${article.description}`;const neg=negativePattern.test(txt),pos=positivePattern.test(txt),sus=suspiciousPattern.test(txt),topic=detectTopic(article.title,article.description);const figures=[...new Set(txt.match(/(?:[$€£¥]\s?)?\d+(?:[.,]\d+)*(?:\s?(?:billion|million|trillion|%|percent|years?|亿元|万亿))?/gi)||[])].filter(x=>/\d/.test(x)).slice(0,4);const verificationPoints=[...(figures.length?[`核对报道所述数值（${figures.join('、')}）的币种、统计口径、时间和一手出处；RSS 摘录未提供这些依据。`]:[]),...(sus?[`核实“${article.title}”中的指称由谁提出、有无原始文件或完整引语支持。`]:[]),`确认“${article.title}”的标题表述与原文正文是否一致；目前仅取得 RSS 标题和摘要。`];const recommendations=[{label:'媒体原文',url:article.url,action:'核对全文、作者、发布日期、完整引语及引用的原始材料。'},...(topic==='经济'||topic==='科技'?[{label:'公司公告与港交所披露易',url:'https://www.hkexnews.hk/',action:'若涉及上市、融资或业绩，按公司名称检索公告和招股文件。'}]:[]),...(topic==='时政'?[{label:'APEC 官方网站',url:'https://www.apec.org/',action:'若涉及 APEC 会议安排，核对主办方议程、日期和新闻稿。'}]:[]),...(topic==='体育'?[{label:'国际网球联合会',url:'https://www.itftennis.com/',action:'若涉及网球赛事，核对赛事规则、比分及赛事组织方通报。'}]:[])];return {...article,topic,sentiment:neg?'负面':pos?'正面':'中性',analysisMode:'规则初筛',claim:verificationPoints[0],verificationPoints,recommendations,reasons:[neg?'标题或摘要出现负面语境词，属规则初筛。':pos?'标题或摘要出现正面语境词，属规则初筛。':'标题与摘要无明显倾向词。','不能据 RSS 摘录判定报道真伪。'],checks:recommendations.map(x=>`${x.action} ${x.url}`)};}
export function fillVerification(article:Article):Article {
  if(article.verificationPoints?.length&&article.recommendations?.length)return article;
  const defaults=classify(article);
  return {...article,
    verificationPoints:article.verificationPoints?.length?article.verificationPoints:article.claim&&!article.claim.startsWith('未从')?[article.claim,...(defaults.verificationPoints||[])]:defaults.verificationPoints,
    recommendations:article.recommendations?.length?article.recommendations:defaults.recommendations,
  };
}
type AIResult={id:string;sentiment:'正面'|'中性'|'负面';summaryZh:string;claim:string;reasons:string[];checks:string[]};
async function modelBatch(items:Article[],key:string,model:string,kind:'classify'|'summarize'):Promise<Map<string,AIResult>>{
  const schema={type:'object',additionalProperties:false,required:['items'],properties:{items:{type:'array',items:{type:'object',additionalProperties:false,required:['id','sentiment','summaryZh','claim','reasons','checks'],properties:{id:{type:'string'},sentiment:{type:'string',enum:['正面','中性','负面']},summaryZh:{type:'string'},claim:{type:'string'},reasons:{type:'array',items:{type:'string'}},checks:{type:'array',items:{type:'string'}}}}}}};
  const instruction=kind==='classify'?'研判报道标题与 RSS 摘要对中国的叙事倾向，并提取可核查的具体主张。不要推断报道真伪。':'用中文精简概述标题和 RSS 摘要，明确待核查信息点与可供交叉核对的来源类型。不得编造原文未提供的事实。';
  const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model,store:false,instructions:`你是国际新闻事实核查编辑。${instruction} 仅使用给定文本。标题或摘要不足时明确说明。每项 id 原样返回。`,input:JSON.stringify(items.map(({id,title,description,source})=>({id,title,description,source}))),text:{format:{type:'json_schema',name:'news_monitor_results',strict:true,schema}}}),signal:AbortSignal.timeout(35000)});
  if(!response.ok)throw Error(`模型接口 HTTP ${response.status}`);
  const body:any=await response.json();const text=body.output_text||body.output?.flatMap((x:any)=>x.content||[]).filter((x:any)=>x.type==='output_text').map((x:any)=>x.text).join('');
  const parsed=JSON.parse(text);return new Map((parsed.items as AIResult[]).map(x=>[x.id,x]));
}
export function windowFor(now=new Date(),final=false){
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const obj=Object.fromEntries(parts.map(x=>[x.type,x.value]));const y=+obj.year,m=+obj.month,d=+obj.day,h=+obj.hour;
  const todayEight=Date.UTC(y,m-1,d,0,0,0);
  const end=final?(h>=8?todayEight:todayEight-86400000):now.getTime();
  const start=final?end-86400000:(h>=8?todayEight:todayEight-86400000);
  const reportDate=new Date(final?end:start+86400000).toISOString().slice(0,10);
  return {date:reportDate,start:new Date(start).toISOString(),end:new Date(end).toISOString(),complete:final};
}
export async function enrichTranslations(items:Article[],prior:Article[]=[],progress?:(message:string)=>void):Promise<Article[]>{
  const cache=new Map(prior.filter(a=>a.titleZh&&(!a.description||a.descriptionZh)).map(a=>[a.id,a]));
  const result=items.map(a=>{
    const old=cache.get(a.id);
    return old&&old.title===a.title&&old.description===a.description?{...a,titleZh:old.titleZh,descriptionZh:old.descriptionZh,translationStatus:old.translationStatus,summaryZh:old.summaryZh}:a;
  });
  progress?.(`已沿用 ${result.filter(a=>a.titleZh).length}/${items.length} 条已校订中文对照`);
  return result;
}
function segments(input:string){
  const pieces:string[]=[];let part='';
  for(const word of input.split(/\s+/)){
    if(!word)continue;
    if(new TextEncoder().encode(word).length>450){if(part){pieces.push(part);part='';}for(let i=0;i<word.length;i+=350)pieces.push(word.slice(i,i+350));continue;}
    const next=part?`${part} ${word}`:word;
    if(new TextEncoder().encode(next).length>450){pieces.push(part);part=word;}else part=next;
  }
  if(part)pieces.push(part);return pieces;
}
async function translateText(input:string){
  if(!input)return '';
  const outputs:string[]=[];
  for(const segment of segments(input)){
    const url=new URL('https://api.mymemory.translated.net/get');url.searchParams.set('q',segment);url.searchParams.set('langpair','en|zh-CN');
    const response=await fetch(url,{signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error(`翻译服务 HTTP ${response.status}`);
    const data:any=await response.json();const translated=String(data.responseData?.translatedText||'').trim();
    if(data.responseStatus!==200||!/[\u3400-\u9fff]/.test(translated))throw Error(String(data.responseDetails||'未取得有效中文译文').slice(0,180));
    outputs.push(translated);
  }
  return outputs.join(' ');
}
export async function translateArticles(items:Article[],onProgress?:(message:string)=>void):Promise<Article[]>{
  let translated=0,failed=0,quotaExceeded=false;
  // The free provider has an anonymous daily quota; keep requests bounded and persist failures for later retry.
  async function one(article:Article):Promise<Article>{
    if(article.titleZh&&(!article.description||article.descriptionZh))return article;
    if(quotaExceeded){failed++;return {...article,translationStatus:'翻译失败',translationError:'免费翻译服务限额已用尽，等待下轮重试'};}
    let titleZh=article.titleZh,descriptionZh=article.descriptionZh;
    try{
      if(!titleZh)titleZh=await translateText(article.title);
      if(article.description&&!descriptionZh)descriptionZh=await translateText(article.description);
      translated++;return {...article,titleZh,descriptionZh,translationStatus:article.description?'已翻译':'无摘要',translationError:undefined,summaryZh:article.summaryZh||descriptionZh};
    }catch(error){failed++;const message=error instanceof Error?error.message:'翻译服务暂时不可用';if(/429|quota|limit|配额|限额/i.test(message))quotaExceeded=true;return {...article,titleZh,descriptionZh,translationStatus:'翻译失败',translationError:message};}
  }
  const output:Article[]=[];
  for(const item of items)output.push(await one(item));
  onProgress?.(`本次自动翻译 ${translated} 条，失败 ${failed} 条；失败条目已记录并将在下轮重试`);
  return output;
}
export async function runPipeline(window:{start:string;end:string},options:{key?:string;model?:string;previous?:Article[];existing?:Article[];onProgress?:(stage:string,message:string,extra?:object)=>void}={}){
  const progress=options.onProgress||(()=>{});const key=options.key;const model=options.model||'gpt-4.1-mini';
  const graph=new StateGraph(GraphState)
    .addNode('collect',async(s:PipelineState)=>{progress('collect',`正在读取 ${SOURCES.length} 个 RSS 信源`);const result=await Promise.all(SOURCES.map(x=>readSource(x,Date.parse(s.windowStart),Date.parse(s.windowEnd))));const statuses=result.map(x=>x.status);progress('collect',`已读取 ${statuses.filter(x=>x.ok).length}/${SOURCES.length} 个信源，扫描 ${statuses.reduce((n,x)=>n+x.fetched,0)} 条`,{statuses});return {raw:result.flatMap(x=>x.articles),statuses};})
    .addNode('filter',async(s:PipelineState)=>{const seen=new Set<string>();const cache=new Map([...(options.existing||[]),...(options.previous||[])].map(a=>[a.id,a]));const articles=s.raw.filter(a=>{if(!chinaPattern.test(`${a.title} ${a.description}`)||adPattern.test(`${a.title} ${a.description}`)||seen.has(a.url))return false;seen.add(a.url);return true;}).map(a=>cache.get(a.id)||a);progress('filter',`筛出 ${articles.length} 条含 China / Chinese 的新闻；已缓存 ${articles.filter(a=>!!a.titleZh).length} 条旧链接`);return {articles};})
    .addNode('analyze',async(s:PipelineState)=>{const known=new Set([...(options.existing||[]),...(options.previous||[])].map(a=>a.id));let articles=s.articles.map(a=>known.has(a.id)&&a.claim?a:classify(a));const unexamined=articles.filter(a=>!known.has(a.id));if(key&&unexamined.length){let success=0;for(let i=0;i<unexamined.length;i+=8){try{const results=await modelBatch(unexamined.slice(i,i+8),key,model,'classify');articles=articles.map(a=>{const r=results.get(a.id);return r?{...a,sentiment:r.sentiment,claim:r.claim,reasons:r.reasons,checks:r.checks,verificationPoints:r.claim?[r.claim]:a.verificationPoints,analysisMode:'AI' as const}:a;});success+=results.size;}catch(e){progress('analyze',`模型批次未完成：${e instanceof Error?e.message:'未知错误'}；保留规则初筛`);}}progress('analyze',`模型完成 ${success}/${unexamined.length} 条新报道研判`);}else progress('analyze',key?'既有链接沿用已存研判':'未配置模型密钥，已标记规则初筛');return {articles,mode:key?'AI':'规则初筛'};})
    .addNode('summarize',async(s:PipelineState)=>{let articles=await translateArticles(s.articles,message=>progress('summarize',message));if(key&&articles.length){const newIds=new Set([...(options.existing||[]),...(options.previous||[])].map(a=>a.id));const pending=articles.filter(a=>!newIds.has(a.id));let success=0;for(let i=0;i<pending.length;i+=8){try{const results=await modelBatch(pending.slice(i,i+8),key,model,'summarize');articles=articles.map(a=>{const r=results.get(a.id);return r?{...a,summaryZh:r.summaryZh,claim:r.claim||a.claim,verificationPoints:r.claim?[r.claim]:a.verificationPoints}:a;});success+=results.size;}catch(e){progress('summarize',`模型摘要未完成：${e instanceof Error?e.message:'未知错误'}；保留逐段译文`);}}progress('summarize',`模型完成 ${success}/${pending.length} 条中文摘要`);}return {articles};})
    .addNode('rank',async(s:PipelineState)=>{const articles=s.articles.map(a=>{const siblings=s.articles.filter(b=>b.id!==a.id&&b.sourceId!==a.sourceId&&similarity(a.title,b.title)>=.65);const sources=new Set([a.sourceId,...siblings.map(x=>x.sourceId)]);const age=Math.max(0,(Date.parse(s.windowEnd)-Date.parse(a.publishedAt))/3600000);const importance=Math.min(100,Math.round(25+Math.max(0,24-age)*1.2+(sources.size-1)*18+(a.sentiment==='负面'?12:0)+(suspiciousPattern.test(a.title)?10:0)));return {...a,importance,crossSourceCount:sources.size,cluster:[a.id,...siblings.map(x=>x.id)].sort()[0]};}).sort((a,b)=>b.importance-a.importance);progress('rank',`已按时效、跨站提及与核查价值排序 ${articles.length} 条`);return {articles};})
    .addEdge(START,'collect').addEdge('collect','filter').addEdge('filter','analyze').addEdge('analyze','summarize').addEdge('summarize','rank').addEdge('rank',END).compile();
  return await graph.invoke({windowStart:window.start,windowEnd:window.end,raw:[],articles:[],statuses:[],mode:'规则初筛'}) as PipelineState;
}
