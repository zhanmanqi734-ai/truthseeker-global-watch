import { NextRequest, NextResponse } from 'next/server';
import { getReport, saveTranslations } from '../../../lib/store';

export const runtime='edge';
const chinese=/[\u3400-\u9fff]/;
export async function POST(request:NextRequest){
  if(request.headers.get('origin')&&new URL(request.headers.get('origin')!).origin!==request.nextUrl.origin)return new Response('Forbidden',{status:403});
  try{
    const body=await request.json() as {date?:string;items?:{id:string;titleZh:string;descriptionZh:string}[]};
    if(!/^\d{4}-\d{2}-\d{2}$/.test(body.date||'')||!Array.isArray(body.items)||body.items.length>30)return NextResponse.json({error:'无效报告或条目'}, {status:400});
    const report=await getReport(body.date);
    if(!report)return NextResponse.json({error:'报告不存在'}, {status:404});
    const known=new Set(report.articles.map(a=>a.id));
    const items=body.items.filter(x=>typeof x.id==='string'&&known.has(x.id)&&typeof x.titleZh==='string'&&x.titleZh.length<1200&&chinese.test(x.titleZh)&&typeof x.descriptionZh==='string'&&x.descriptionZh.length<4000&&(!x.descriptionZh||chinese.test(x.descriptionZh)));
    if(!items.length)return NextResponse.json({error:'没有有效译文'}, {status:400});
    await saveTranslations(report,items);
    return NextResponse.json({saved:items.length});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'写入失败'}, {status:500});}
}
