import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {collectSnapshot,officialUrls,reader,sha} from '../src/refresh.js';

function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'nexus-refresh-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const output=path.join(root,'macro-calendar.json'),urls=officialUrls('2026-10-28');
  const calls=[],clock=()=>new Date(Date.UTC(2026,9,28,12,0,calls.length)).toISOString();
  const options={output,clock,run:{id:'123',attempt:'1',source_commit:'a'.repeat(40)},
    fetcher:async url=>{calls.push(url);return new Response('public fixture '+url,{status:200});},
    collectFed:async get=>{await get(urls[3]);return [{source:'FED'}];},
    collectBls:async get=>{await get(urls[0]);return {events:[{source:'BLS'}],rawCount:100};},
    collectBea:async get=>{await get('https://www.bea.gov/news/schedule');return [{source:'BEA'}];},
    validate:events=>assert.equal(events.length,3),sort:events=>events};
  return {root,output,urls,calls,options,read:name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'))};
}
test('successful refresh binds raw official sources, actual acquisition times and output hashes',async t=>{
  const x=setup(t),s=await collectSnapshot(x.options),r=x.read('macro-calendar-refresh.json');
  assert.equal(s.status,'SUCCESS');assert.equal(s.timezone,'America/New_York');
  assert.deepEqual(s.authority_sources.map(x=>x.url),x.urls);
  assert.equal(x.calls.length,5);assert.equal(new Set(x.calls).size,5);
  assert.equal(r.snapshot_sha256,sha(fs.readFileSync(path.join(x.root,'macro-calendar-snapshot.json'))));
  assert.equal(r.calendar_sha256,sha(fs.readFileSync(x.output)));
  assert.ok(s.authority_sources.every(x=>x.status===200&&x.body_sha256===sha(x.body)&&x.started_at<=x.collected_at));
  assert.ok(r.source_checks.every(x=>!('body' in x)));
  assert.equal(s.coverage.kind,'OFFICIAL_MONTHLY_SCOPE_PENDING_CONSUMER_VALIDATION');
});
test('unchanged events still get new source times and refresh evidence',async t=>{
  const x=setup(t);await collectSnapshot(x.options);const first=x.read('macro-calendar-refresh.json');
  x.options.clock=()=> '2026-10-28T18:00:00.000Z';x.options.run={...x.options.run,id:'124'};
  await collectSnapshot(x.options);const next=x.read('macro-calendar-refresh.json');
  assert.equal(first.calendar_sha256,next.calendar_sha256);
  assert.notEqual(first.snapshot_sha256,next.snapshot_sha256);assert.notEqual(first.started_at,next.started_at);
});
test('source 403 is attempted once and publishes failure without replacing old calendar',async t=>{
  const x=setup(t);fs.writeFileSync(x.output,'old calendar exact bytes');
  x.options.fetcher=async url=>{x.calls.push(url);return new Response('',{status:url===x.urls[0]?403:200});};
  await assert.rejects(collectSnapshot(x.options),/HTTP_403/);
  const r=x.read('macro-calendar-refresh.json');assert.equal(r.status,'FAILED');assert.equal(r.failed_stage,'BLS');
  assert.equal(r.reason,'HTTP_403');assert.equal(r.previous_calendar_retained,true);
  assert.equal(x.calls.filter(u=>u===x.urls[0]).length,1);
  assert.equal(fs.readFileSync(x.output,'utf8'),'old calendar exact bytes');
  assert.equal(r.source_checks.at(-1).status,403);assert.equal(r.source_checks.at(-1).body_bytes,0);
});
test('parser failure is not a fresh successful calendar and retains source health',async t=>{
  const x=setup(t);x.options.collectBea=async get=>{await get('https://www.bea.gov/news/schedule');throw Error('bad row');};
  await assert.rejects(collectSnapshot(x.options),/bad row/);
  const r=x.read('macro-calendar-refresh.json');assert.equal(r.status,'FAILED');assert.equal(r.reason,'COLLECTOR_OR_PARSER_FAILED');
  assert.equal(r.failed_stage,'BEA');assert.equal(r.source_checks.at(-1).status,200);
  assert.equal(fs.existsSync(x.output),false);
});
test('network timeout records failure and does not retry',async t=>{
  const x=setup(t);x.options.fetcher=async url=>{x.calls.push(url);throw new DOMException('timed out','TimeoutError');};
  await assert.rejects(collectSnapshot(x.options),/SOURCE_TIMEOUT/);
  assert.equal(x.calls.length,1);assert.equal(x.read('macro-calendar-refresh.json').reason,'SOURCE_TIMEOUT');
});
test('acquisition rejects unexpected targets and bounds source size',async()=>{
  let n=0;const r=reader('2026-10-28',{fetcher:async()=>{n++;return new Response('x'.repeat(3000001));}});
  await assert.rejects(r.get('https://unapproved.invalid/'),/UNEXPECTED_OFFICIAL_SOURCE/);assert.equal(n,0);
  await assert.rejects(r.get(officialUrls('2026-10-28')[0]),/SOURCE_TOO_LARGE/);assert.equal(n,1);
  assert.equal(r.rows[0].body,'');assert.equal(r.rows[0].error,'SOURCE_TOO_LARGE');
});
