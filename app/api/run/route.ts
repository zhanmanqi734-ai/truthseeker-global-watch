import { NextRequest } from 'next/server';
import { env } from 'cloudflare:workers';
import { runPipeline, windowFor, translateArticles, fillVerification, SOURCES } from '../../../lib/pipeline';
import { finishRun, failRun, startRun, getReport, getStoredArticles, type Report } from '../../../lib/store';

export const runtime='edge';
export async function POST(request:NextRequest){
  if(request.headers.get('origin')&&new URL(request.headers.get('origin')!).origin!==request.nextUrl.origin)return new Response('Forbidden',{status:403});
  const window=windowFor(new Date(),request.nextUrl.searchParams.get('final')==='1');
  const encoder=new TextEncoder();
  const stream=new ReadableStream({async start(controller){
    let closed=false;const send=(event:string,payload:any)=>{if(!closed)controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`));};let runId:number|undefined;
    try{
      send('progress',{stage:'start',message:`监测区间 ${window.start} → ${window.end}`});
      runId=await startRun(window.date);
      const prior=await getReport(window.date);
      const existing=await getStoredArticles(window.start,window.end);
      const result=await runPipeline(window,{key:(env as any).OPENAI_API_KEY,model:(env as any).OPENAI_MODEL,previous:prior?.articles||[],existing,onProgress:(stage,message,extra)=>send('progress',{stage,message,...extra})});
      if(!result.statuses.some(s=>s.ok))throw Error(`${SOURCES.length} 个 RSS 信源均不可达，本轮不覆盖已有日报。`);
      const retained=prior?.articles.filter(a=>Date.parse(a.publishedAt)>=Date.parse(window.start)&&Date.parse(a.publishedAt)<Date.parse(window.end))||[];
      const freshIds=new Set(result.articles.map(a=>a.id));
      const backfilled=await translateArticles(retained.filter(a=>!freshIds.has(a.id)),message=>send('progress',{stage:'backfill',message}));
      const articles=[...backfilled,...result.articles].map(fillVerification).sort((a,b)=>b.importance-a.importance);
      const aiCount=articles.filter(a=>a.analysisMode==='AI').length;
      const mode=aiCount===0?'规则初筛':aiCount===articles.length?'AI':'规则初筛 / 部分AI';
      const report:Report={date:window.date,generatedAt:new Date().toISOString(),windowStart:window.start,windowEnd:window.end,complete:window.complete,mode,articles,statuses:result.statuses};
      await finishRun(runId,report);send('done',{date:report.date,count:report.articles.length,mode:report.mode});
    }catch(e){const message=e instanceof Error?e.message:'任务失败';if(runId)await failRun(runId,message).catch(()=>{});send('error',{message});}
    finally{closed=true;controller.close();}
  }});
  return new Response(stream,{headers:{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}
