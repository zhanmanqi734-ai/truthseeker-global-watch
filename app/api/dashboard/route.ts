import { NextRequest, NextResponse } from 'next/server';
import { getReport, listReports, lastRun } from '../../../lib/store';
import { SOURCES } from '../../../lib/pipeline';

export const runtime='edge';
export async function GET(request:NextRequest){try{const date=request.nextUrl.searchParams.get('date')||undefined;const [report,reports,run]=await Promise.all([getReport(date),listReports(),lastRun()]);return NextResponse.json({report,reports,lastRun:run,sources:SOURCES.map(({id,name,region,url})=>({id,name,region,url}))},{headers:{'Cache-Control':'no-store'}});}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'读取失败'},{status:500});}}
