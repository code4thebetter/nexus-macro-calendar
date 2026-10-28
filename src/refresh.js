// Public calendar evidence only. No Trading code, credentials, or account data.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
export const timezone = 'America/New_York';
const months = 'january february march april may june july august september october november december'.split(' ');
export function officialUrls(day) {
  if (!/^2026-\d{2}-\d{2}$/.test(day)) throw Error('UNSUPPORTED_CALENDAR_YEAR');
  const m=Number(day.slice(5,7)); if(m<1||m>12) throw Error('INVALID_MONTH');
  return ['https://www.bls.gov/schedule/news_release/bls.ics',`https://www.bls.gov/schedule/2026/${day.slice(5,7)}_sched_list.htm`,`https://www.federalreserve.gov/newsevents/2026-${months[m-1]}.htm`,'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm'];
}
export function reader(day,{fetcher=fetch,clock=()=>new Date().toISOString()}={}) {
  const allowed=new Set([...officialUrls(day),'https://www.bea.gov/news/schedule']),rows=[],cache=new Map();
  async function get(url,options={}) {
    if(!allowed.has(url))throw Error('UNEXPECTED_OFFICIAL_SOURCE');
    if(cache.has(url))return new Response(cache.get(url).body,{status:200});
    const row={url,started_at:clock(),collected_at:null,status:0,body:'',body_sha256:sha(''),headers:{},error:null};
    try {
      const r=await fetcher(url,{...options,redirect:'error',signal:AbortSignal.timeout(15000)});row.status=r.status;
      if(!Number.isInteger(row.status))throw Error('HTTP_STATUS_UNAVAILABLE');
      if(row.status!==200){await r.body?.cancel();throw Error('HTTP_'+row.status);}
      const stream=r.body.getReader(),parts=[];let size=0;for(;;){const p=await stream.read();if(p.done)break;size+=p.value.length;if(size>3000000){await stream.cancel();throw Error('SOURCE_TOO_LARGE');}parts.push(p.value);}const bytes=Buffer.concat(parts),body=bytes.toString('utf8');if(!Buffer.from(body).equals(bytes))throw Error('SOURCE_ENCODING');
      row.body=body;row.body_sha256=sha(body);row.headers={etag:r.headers?.get('etag')??null,last_modified:r.headers?.get('last-modified')??null};
      row.collected_at=clock();rows.push(row);cache.set(url,row);return new Response(body,{status:200});
    } catch(e) {
      row.collected_at=clock();row.error=/^(HTTP_\d{3}|SOURCE_TOO_LARGE|HTTP_STATUS_UNAVAILABLE)$/.test(e.message)?e.message:e.name==='TimeoutError'?'SOURCE_TIMEOUT':'SOURCE_FETCH_FAILED';rows.push(row);throw Error(row.error);
    }
  }
  return {get,rows};
}
export function atomicJson(file,value) {
  fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp',bytes=JSON.stringify(value,null,2)+'\n';
  fs.writeFileSync(tmp,bytes,{flag:'wx'});if(sha(fs.readFileSync(tmp))!==sha(bytes))throw Error('OUTPUT_READBACK');fs.renameSync(tmp,file);return sha(bytes);
}
export async function collectSnapshot({collectFed,collectBls,collectBea,validate,sort,output,fetcher=fetch,clock=()=>new Date().toISOString(),run={}}) {
  const started_at=clock(),day=new Intl.DateTimeFormat('en-CA',{timeZone:timezone}).format(new Date(started_at));
  const input=reader(day,{fetcher,clock}),sources={},statusPath=path.join(path.dirname(output),'macro-calendar-refresh.json'),snapshotPath=path.join(path.dirname(output),'macro-calendar-snapshot.json');
  let stage='FED';const previousCalendarHash=fs.existsSync(output)?sha(fs.readFileSync(output)):null;
  const health=()=>input.rows.map(({body,...r})=>({...r,body_bytes:Buffer.byteLength(body)}));
  try {
    const fed=await collectFed(input.get);sources.FED={status:'PASS',events:fed.length};console.log('FED events :',fed.length);
    stage='BLS';const bls=await collectBls(input.get);sources.BLS={status:'PASS',events:bls.events.length,raw_events:bls.rawCount};console.log('BLS events :',bls.events.length);
    stage='BEA';const bea=await collectBea(input.get);sources.BEA={status:'PASS',events:bea.length};console.log('BEA events :',bea.length);
    stage='AUTHORITY_SOURCES';for(const url of officialUrls(day))await input.get(url,{'headers':{'User-Agent':'NEXUS-Macro-Calendar/1.0'}});
    const events=sort([...fed,...bls.events,...bea]);validate(events);
    const completed_at=clock(),authority_sources=officialUrls(day).map(url=>input.rows.find(r=>r.url===url));
    const coverage={kind:'OFFICIAL_MONTHLY_SCOPE_PENDING_CONSUMER_VALIDATION',from_day:day.slice(0,7)+'-01',until_day:new Date(Date.UTC(2026,Number(day.slice(5,7)),1)).toISOString().slice(0,10),timezone};
    const snapshot={schema:'NEXUS_MACRO_CALENDAR_SNAPSHOT_1',status:'SUCCESS',repository:'code4thebetter/nexus-macro-calendar',timezone,scope_day:day,started_at,completed_at,run,sources,coverage,events,authority_sources};
    // Git commit publishes these together; consumers fetch one pinned commit and
    // verify both hashes. A partial filesystem write never authorizes a snapshot.
    const calendar_sha256=atomicJson(output,events),snapshot_sha256=atomicJson(snapshotPath,snapshot);
    atomicJson(statusPath,{schema:'NEXUS_MACRO_CALENDAR_REFRESH_1',status:'SUCCESS',started_at,completed_at,run,scope_day:day,timezone,sources,source_checks:health(),coverage,calendar_sha256,snapshot_sha256});
    return snapshot;
  } catch(e) {
    sources[stage]={status:'FAILED'};
    atomicJson(statusPath,{schema:'NEXUS_MACRO_CALENDAR_REFRESH_1',status:'FAILED',started_at,completed_at:clock(),run,scope_day:day,timezone,failed_stage:stage,reason:/^(HTTP_\d{3}|SOURCE_TIMEOUT|SOURCE_FETCH_FAILED|SOURCE_TOO_LARGE)$/.test(e.message)?e.message:'COLLECTOR_OR_PARSER_FAILED',sources,source_checks:health(),previous_calendar_retained:previousCalendarHash!==null&&fs.existsSync(output)&&sha(fs.readFileSync(output))===previousCalendarHash});
    throw e;
  }
}
