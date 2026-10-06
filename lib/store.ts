import { env } from 'cloudflare:workers';
import type { Article } from './pipeline';

export type Report = { date:string; generatedAt:string; windowStart:string; windowEnd:string; complete:boolean; mode:string; articles:Article[]; statuses:any[]; };
function db(){if(!env.DB)throw Error('数据库尚未绑定');return env.DB;}
export async function listReports(){const {results}=await db().prepare('SELECT date, generated_at AS generatedAt, complete, mode, json_array_length(json_extract(payload, \'$.articles\')) AS count FROM reports ORDER BY date DESC LIMIT 90').all();return results;}
export async function getReport(date?:string){const stmt=date?db().prepare('SELECT payload FROM reports WHERE date = ?').bind(date):db().prepare('SELECT payload FROM reports ORDER BY date DESC LIMIT 1');const row=await stmt.first<{payload:string}>();return row?JSON.parse(row.payload) as Report:null;}
export async function getStoredArticles(start:string,end:string){const {results}=await db().prepare('SELECT analysis FROM articles WHERE published_at >= ? AND published_at < ?').bind(start,end).all<{analysis:string}>();return results.flatMap(row=>{try{return [JSON.parse(row.analysis) as Article]}catch{return []}});}
export async function startRun(date:string){const row=await db().prepare('INSERT INTO runs (report_date,started_at,status) VALUES (?,?,?) RETURNING id').bind(date,new Date().toISOString(),'running').first<{id:number}>();return row!.id;}
export async function finishRun(id:number,report:Report){const now=new Date().toISOString();const batch=report.articles.map(a=>db().prepare('INSERT INTO articles (id,source_id,title,description,url,published_at,first_seen_at,analysis) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET analysis=excluded.analysis').bind(a.id,a.sourceId,a.title,a.description,a.url,a.publishedAt,now,JSON.stringify(a)));for(let i=0;i<batch.length;i+=40)await db().batch(batch.slice(i,i+40));await db().batch([db().prepare('INSERT INTO reports (date,generated_at,window_start,window_end,complete,mode,payload) VALUES (?,?,?,?,?,?,?) ON CONFLICT(date) DO UPDATE SET generated_at=excluded.generated_at, window_start=excluded.window_start, window_end=excluded.window_end, complete=excluded.complete, mode=excluded.mode, payload=excluded.payload').bind(report.date,report.generatedAt,report.windowStart,report.windowEnd,report.complete?1:0,report.mode,JSON.stringify(report)),db().prepare('UPDATE runs SET finished_at=?,status=?,article_count=? WHERE id=?').bind(now,'done',report.articles.length,id)]);}
export async function failRun(id:number,error:string){await db().prepare('UPDATE runs SET finished_at=?,status=?,error=? WHERE id=?').bind(new Date().toISOString(),'failed',error,id).run();}
export async function saveTranslations(report:Report,items:{id:string;titleZh:string;descriptionZh:string}[]){
  const updates=new Map(items.map(x=>[x.id,x]));
  report.articles=report.articles.map(a=>{
    const x=updates.get(a.id);if(!x)return a;
    const descriptionZh=x.descriptionZh||a.descriptionZh||'';
    return {...a,titleZh:x.titleZh,descriptionZh,translationStatus:a.description&&!descriptionZh?'翻译失败':a.description?'已翻译':'无摘要',translationError:undefined,summaryZh:a.analysisMode==='AI'&&a.summaryZh?a.summaryZh:descriptionZh};
  });
  await db().prepare('UPDATE reports SET payload=? WHERE date=?').bind(JSON.stringify(report),report.date).run();
  const changed=report.articles.filter(a=>updates.has(a.id));
  if(changed.length)await db().batch(changed.map(a=>db().prepare('UPDATE articles SET analysis=? WHERE id=?').bind(JSON.stringify(a),a.id)));
}
export async function lastRun(){return await db().prepare('SELECT * FROM runs ORDER BY id DESC LIMIT 1').first();}
