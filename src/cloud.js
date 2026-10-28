/* ---------- shared online copy (Claude-hosted page only) ----------
   Routes live in the page's database as well as in this browser, so the routes here and the ones Claude reads and edits are the same.
   routes/<id>        {id,name,rev,n,updatedAt,by,deleted?}  (n = number of parts)
   routes/<id>/parts/<k>  {s: part of the route JSON}
   guides/<gid>       {n}   guides/<gid>/parts/<k> {s: part of the guide's step text}
   Last writer wins; a route you are editing is never overwritten until your own save has gone up. */
const CLOUD={db:null,on:false,revs:{},sent:{},guides:new Set(),busy:false,again:false,timer:null};
const CL_PART=150000;
const clSplit=s=>{ const a=[]; for(let i=0;i<s.length;i+=CL_PART) a.push(s.slice(i,i+CL_PART)); return a.length?a:['']; };
const clRouteJSON=r=>JSON.stringify(r,(k,v)=>k==='raw'||k==='savedAt'?undefined:v);
function clBadge(t,warn){ const b=document.getElementById('cloudBadge'); if(!b) return; b.hidden=false; b.textContent=t; b.style.color=warn?'var(--danger)':''; }
async function clReadParts(base,n){ const out=[]; for(let k=0;k<n;k++){ const d=await CLOUD.db.doc(base+'/parts/'+k).get(); out.push(d.exists?String(d.data().s||''):''); } return out.join(''); }
async function clEnsureGuides(r){ for(const g of r.guides||[]){ if(rawCache.has(g.id)) continue; await rawLoad([g.id]); if(rawCache.has(g.id)) continue;
    const m=await CLOUD.db.doc('guides/'+g.id).get(); if(!m.exists) continue; try{ rawPut(g.id,JSON.parse(await clReadParts('guides/'+g.id,+m.data().n||0))); }catch(e){} } }
async function clPushGuides(r){ const used=new Set((r.steps||[]).filter(s=>s.src&&!s.src.auto).map(s=>s.src.g)); for(const g of r.guides||[]){ if(!used.has(g.id)||CLOUD.guides.has(g.id)) continue;
    await rawLoad([g.id]); const raw=rawCache.get(g.id)||g.raw; if(!raw) continue; const m=await CLOUD.db.doc('guides/'+g.id).get(); if(!m.exists){ const parts=clSplit(JSON.stringify(raw)); for(let k=0;k<parts.length;k++) await CLOUD.db.doc('guides/'+g.id+'/parts/'+k).set({s:parts[k]}); await CLOUD.db.doc('guides/'+g.id).set({n:parts.length,name:g.name||''}); } CLOUD.guides.add(g.id); } }
async function clPushRoute(r){ const js=clRouteJSON(r); if(CLOUD.sent[r.id]===js) return; await clPushGuides(r); const parts=clSplit(js);
  for(let k=0;k<parts.length;k++) await CLOUD.db.doc('routes/'+r.id+'/parts/'+k).set({s:parts[k]});
  const rev=(CLOUD.revs[r.id]||0)+1; await CLOUD.db.doc('routes/'+r.id).set({id:r.id,name:r.name||'',rev,n:parts.length,updatedAt:Date.now(),by:'page'}); CLOUD.revs[r.id]=rev; CLOUD.sent[r.id]=js; }
async function clPushAll(){ if(!CLOUD.on) return; if(CLOUD.busy){ CLOUD.again=true; return; } CLOUD.busy=true; clBadge('☁ Saving…');
  try{ for(const r of store.routes) await clPushRoute(r);
    for(const id of store.deleted||[]) if(CLOUD.revs[id]&&CLOUD.sent[id]!=='deleted'){ const rev=CLOUD.revs[id]+1; await CLOUD.db.doc('routes/'+id).set({id,rev,deleted:true,updatedAt:Date.now(),by:'page'}); CLOUD.revs[id]=rev; CLOUD.sent[id]='deleted'; }
    clBadge('☁ Saved online'); }
  catch(e){ clBadge('☁ Online save failed: '+(e?.code||e?.message||'error'),true); }
  finally{ CLOUD.busy=false; if(CLOUD.again){ CLOUD.again=false; clSchedule(); } } }
function clSchedule(){ if(!CLOUD.on) return; clearTimeout(CLOUD.timer); CLOUD.timer=setTimeout(clPushAll,1500); }
function clDirty(id){ const r=store.routes.find(x=>x.id===id); return !!r&&CLOUD.sent[id]!==undefined&&CLOUD.sent[id]!==clRouteJSON(r); }
async function clApply(meta){ const id=meta.id; if(!id||(CLOUD.revs[id]||0)>=(meta.rev||0)) return false; if(clDirty(id)) return false; /* your unsaved edit wins; it goes up next */
  if(meta.deleted){ CLOUD.revs[id]=meta.rev; CLOUD.sent[id]='deleted'; const i=store.routes.findIndex(r=>r.id===id); if(i>=0&&store.routes.length>1){ store.routes.splice(i,1); store.deleted=[...new Set([...(store.deleted||[]),id])]; if(route?.id===id){ route=store.routes[0]; cursor=route.steps.length-1; } return true; } return false; }
  let r=null; try{ r=JSON.parse(await clReadParts('routes/'+id,+meta.n||0)); }catch(e){ return false; } if(!r||r.id!==id) return false;
  migrateRoute(r); await clEnsureGuides(r); CLOUD.revs[id]=meta.rev; CLOUD.sent[id]=clRouteJSON(r); store.deleted=(store.deleted||[]).filter(x=>x!==id);
  const i=store.routes.findIndex(x=>x.id===id); if(i>=0) store.routes[i]=r; else store.routes.push(r); if(route?.id===id){ route=r; cursor=Math.min(cursor,r.steps.length-1); } return true; }
async function cloudInit(){ let db=null; try{ db=typeof claude!=='undefined'&&claude.use?await claude.use('db'):null; }catch(e){ db=null; } if(!db) return; CLOUD.db=db; CLOUD.on=true; clBadge('☁ Connecting…');
  try{ const snap=await db.collection('routes').get(); let changed=false; for(const d of snap.docs) if(await clApply(d.data())) changed=true;
    if(changed){ store.cur=route.id; saveNow(); refresh(); toast('Loaded the shared routes',2500); }
    await clPushAll(); /* anything only in this browser goes up */
    db.collection('routes').onSnapshot(async s=>{ let ch=false; for(const c of s.docChanges()){ if(c.type==='removed'||c.doc.metadata.hasPendingWrites) continue; if(await clApply(c.doc.data())) ch=true; } if(ch){ store.cur=route.id; saveNow(); refresh(); toast('Route updated from the shared copy',2500); } },
      e=>clBadge('☁ Live updates stopped: '+(e?.code||'error'),true)); }
  catch(e){ clBadge('☁ Online copy unavailable: '+(e?.code||e?.message||'error'),true); } }
