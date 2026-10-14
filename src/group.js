
/* =====================================================================
   WoW Forever – Group Levelling Planner: group setup, camp advisor, profession steps, group guide
   ===================================================================== */
const GLP_PRIMARY=['Alchemy','Blacksmithing','Enchanting','Engineering','Herbalism','Leatherworking','Mining','Skinning','Tailoring'];
const GLP_SECONDARY=['First Aid','Fishing'];
/* camp features at skill 20 (icy-veins.com/wow-forever/camping). w = value per class; ex = class buff that overwrites it */
const CAMP={
  Leatherworking:{f:'Camp Tent',e:'5% rested XP, once an hour',w:{_:10}},
  Fishing:{f:'Fish Bowl',e:'All stats',w:{_:3},ex:{Paladin:[.5,'Blessing of Kings (Paladin talent) overwrites it']}},
  Enchanting:{f:'Enchanted Lute',e:'Armor, all stats, resistances',w:{_:3.5},ex:{Druid:[1,'Mark of the Wild overwrites it']}},
  'First Aid':{f:'First Aid Kit',e:'Stamina',w:{_:3},ex:{Priest:[1,'Power Word: Fortitude overwrites it']}},
  Skinning:{f:'Camp Chair',e:'Critical strike',w:{_:1.5,Warrior:2.5,Rogue:2.5,Hunter:2.5,Paladin:2,Shaman:2,Druid:2},ex:{Druid:[.15,'Moonkin Aura (talent, level 40) overwrites it']}},
  Mining:{f:'Lodestone',e:'Attack power',w:{_:0,Warrior:3,Rogue:3,Hunter:3,Paladin:2,Shaman:2,Druid:2},ex:{Paladin:[.5,'Blessing of Might overwrites it (one blessing per player)']}},
  Blacksmithing:{f:'Sharpening Wheel',e:'Strength',w:{_:0,Warrior:3,Paladin:3,Shaman:1.5,Rogue:1.5,Druid:1.5,Hunter:.5},ex:{Shaman:[1,'Strength of Earth Totem overwrites it']}},
  Herbalism:{f:'Incense Candle',e:'Intellect',w:{_:0,Mage:3,Priest:3,Warlock:3,Druid:2,Shaman:2,Paladin:2,Hunter:1.5},ex:{Mage:[1,'Arcane Intellect overwrites it']}},
  Alchemy:{f:'Mana Well',e:'Mana per 5 sec',w:{_:0,Mage:3,Priest:3,Warlock:2.5,Druid:2,Shaman:2,Paladin:2,Hunter:1.5},ex:{Paladin:[.5,'Blessing of Wisdom overwrites it (one blessing per player)']}},
  Tailoring:{f:'Faction Banner',e:'Spirit',w:{_:.5,Priest:2,Mage:2,Druid:1.5,Shaman:1.5,Paladin:1.5,Warlock:1,Hunter:1},ex:{Priest:[.25,'Divine Spirit (talent) overwrites it']}},
  Engineering:{f:'Reagent Bot',e:'Vendor for reagents',w:{_:.3,Mage:.8,Priest:.6,Shaman:.6,Druid:.6,Paladin:.6,Rogue:.6,Warlock:.6}},
};
/* rough effort to reach skill 20 while levelling, and the level you can expect to have it by (editable later) */
const PROF20={Skinning:{eff:1,lv:7,how:'skin the beasts you kill'},Mining:{eff:2,lv:9,how:'mine Copper Veins you pass'},Herbalism:{eff:2,lv:9,how:'pick Peacebloom/Silverleaf you pass'},
  'First Aid':{eff:2,lv:9,how:'make Linen Bandages from Linen Cloth drops'},Fishing:{eff:3,lv:9,how:'buy a Fishing Pole and fish at the next water you rest by (~15 min)'},
  Tailoring:{eff:2,lv:10,how:'make Bolts of Linen Cloth and Linen items from cloth drops'},Leatherworking:{eff:3,lv:11,how:'craft Light Armor Kits from Light Leather (skinner in the group, or buy)'},
  Blacksmithing:{eff:3,lv:11,how:'make Rough Sharpening Stones / Copper items (miner in the group, or buy)'},Engineering:{eff:3,lv:11,how:'make Rough Blasting Powder / Copper parts (miner in the group, or buy)'},
  Alchemy:{eff:3,lv:11,how:'make Minor Healing Potions (herbalist in the group, or buy)'},Enchanting:{eff:5,lv:13,how:'disenchant green items and make Runed Copper Rods'}};
const GLP_SLOTS=3; /* Basic Campfire: 3 features (Journeyman, Cooking 90: 5) */
const glpCfg=()=>store.glp||(store.glp={id:uid(),name:'My group',members:[],guides:[]});
let GLP_TEXTS=null; /* [{name,text}] kept in the browser database, not the main save */
async function glpTexts(){ if(GLP_TEXTS) return GLP_TEXTS; try{ GLP_TEXTS=JSON.parse(await kvGet('glp:guides')||'[]'); }catch(e){ GLP_TEXTS=[]; } return GLP_TEXTS; }
function glpFac(race){ return (RACES[race]||[0,'H'])[1]||'H'; }

/* ---------- camp advisor ---------- */
function campValue(prof,mem){ const C=CAMP[prof]; let v=0; const notes=[]; let waste=0;
  for(const m of mem){ v+=C.w[m.cls]??C.w._; }
  if(C.f==='Camp Tent') v=C.w._*mem.length;
  for(const [cls,[frac,why]] of Object.entries(C.ex||{})) if(mem.some(m=>m.cls===cls)){ waste=Math.max(waste,frac); notes.push(why); }
  return {v:Math.round(v*(1-waste)*10)/10,raw:v,waste,notes}; }
/* what it costs member m to bring prof: 0 if it's already one of their professions, else effort (+ a primary slot) */
function campCost(prof,m){ if((m.profs||[]).includes(prof)) return {c:0,ok:true};
  const isSec=GLP_SECONDARY.includes(prof); const prim=(m.profs||[]).filter(p=>GLP_PRIMARY.includes(p));
  if(!isSec&&prim.length>=2) return {c:99,ok:false,why:`${m.name} already has two main professions`};
  return {c:PROF20[prof].eff,ok:true,adds:true}; }
function campAdvise(mem){ const N=mem.length; const slots=Math.min(GLP_SLOTS,N); const profs=Object.keys(CAMP); const val=Object.fromEntries(profs.map(p=>[p,campValue(p,mem)]));
  const fixed=mem.map(m=>m.camp&&m.camp!=='auto'?(m.camp==='none'?null:m.camp):undefined);
  let best=null; const lam=0.35;
  const rec=(i,used,asg,score,cnt)=>{ if(i===N){ if(cnt>slots) return; if(!best||score>best.score) best={score,asg:[...asg]}; return; }
    const opts=fixed[i]!==undefined?[fixed[i]]:[null,...profs];
    for(const p of opts){ if(p&&used.has(p)) continue; if(p&&cnt>=slots&&fixed[i]===undefined) continue; let sc=score;
      if(p){ const c=campCost(p,mem[i]); if(!c.ok&&fixed[i]===undefined) continue; sc+=val[p].v-lam*c.c; used.add(p); }
      asg.push(p); rec(i+1,used,asg,sc,cnt+(p?1:0)); asg.pop(); if(p) used.delete(p); } };
  rec(0,new Set(),[],0,0);
  const warn=[]; const asg=best?best.asg:mem.map(()=>null); const cnt={}; asg.forEach(p=>{ if(p) cnt[p]=(cnt[p]||0)+1; });
  for(const [p,n] of Object.entries(cnt)) if(n>1) warn.push(`${CAMP[p].f} is brought twice: only one counts, so one of you is wasting the slot.`);
  if(asg.filter(Boolean).length>GLP_SLOTS) warn.push(`A Basic Campfire holds ${GLP_SLOTS} features; the extras only help once someone has Cooking 90 (Journeyman Campfire, 5 features).`);
  asg.forEach((p,i)=>{ if(!p) return; const c=campCost(p,mem[i]); if(!c.ok) warn.push(c.why+` to also take ${p}.`); if(val[p].waste>=1) warn.push(`${CAMP[p].f} (${mem[i].name}): ${val[p].notes.join('; ')}, so it does nothing for this group.`); });
  if(!asg.includes('Leatherworking')) warn.push('Nobody brings the Camp Tent (Leatherworking), the only camp feature that gives XP.');
  return {asg,val,warn,slots}; }

/* ---------- route building ---------- */
function glpNear(pts,ref,thr){ let b=null,bd=1e18; for(const p of pts){ const d=Math.hypot(p.X-ref.X,p.Y-ref.Y); if(d<bd){bd=d;b=p;} } return b&&bd<=thr?{p:b,d:bd}:null; }
function glpPts(i){ const r=SIM.res[i]; const out=[]; if(r?.pt) out.push(r.pt); const s=route.steps[i]; if(s?.path) for(const w of s.path) out.push(w); return out; }
function glpScan(pts,from,to,thr,pred){ /* first route index in [from,to] whose position is within thr yards of one of pts */
  for(let i=Math.max(0,from);i<=Math.min(to,route.steps.length-1);i++){ if(pred&&!pred(i)) continue; for(const q of glpPts(i)){ const n=glpNear(pts,q,thr); if(n) return {i,d:n.d,p:n.p}; } } return null; }
function glpClosest(pts,from,to,pred){ let b=null; for(let i=Math.max(0,from);i<=Math.min(to,route.steps.length-1);i++){ if(pred&&!pred(i)) continue; for(const q of glpPts(i)){ const n=glpNear(pts,q,1e12); if(n&&(!b||n.d<b.d)) b={i,d:n.d,p:n.p}; } } return b; }
/* where to do something at pts: on the route if it passes close; else a short detour within the preferred window; else wherever the route comes closest */
function glpPlace(pts,from,lim,pred){ const end=route.steps.length-1; let h=glpScan(pts,from,lim,THR,pred); if(h) return h;
  h=glpClosest(pts,from,lim,pred); if(h&&h.d<=DETOUR) return {...h,detour:true};
  h=glpScan(pts,from,end,THR,pred); if(h) return h; h=glpClosest(pts,from,end,pred); return h?{...h,detour:true}:null; }
const DETOUR=700;
const lvAt=i=>SIM.res[i]?.after?.level||1;
function profTrainers(prof){ const fac=charInfo(route).fac; return Object.keys(META.ptrn||{}).map(ptrainerOf).filter(t=>t&&t.prof===prof&&(!t.fac||t.fac.includes(fac))&&t.sp?.length); }
function glpBlk(s){ if(!s?.src||s.src.auto) return null; const g=G(s.src.g); const x=g?.steps[s.src.i]; return x?.rx?g.id+':'+x.rx:null; }
function glpInsert(at,step){ while(at>0&&at<route.steps.length&&glpBlk(route.steps[at-1])&&glpBlk(route.steps[at-1])===glpBlk(route.steps[at])) at++; /* never split a guide step in two */ route.steps.splice(at,0,{...step,id:uid(),glp:1}); simulate(); return at; }
const THR=180;
const GLP_START={Human:['elwynn','northshire'],Dwarf:['dun morogh','coldridge'],Gnome:['dun morogh','coldridge'],'Night Elf':['teldrassil','shadowglen'],Orc:['durotar','valley of trials'],Troll:['durotar','valley of trials'],Tauren:['mulgore','red cloud','camp narache'],Undead:['tirisfal','deathknell']};
function glpProfSteps(m,campProf){ const notes=[]; const all=[...new Set([...(m.profs||[]),...(campProf?[campProf]:[])])].filter(p=>p!=='Cooking');
  const learned={};
  for(const prof of all){ /* already in the guide? */
    const have=route.steps.findIndex(s=>(s.t==='prof'&&s.act==='learn'&&s.prof===prof)); if(have>=0){ learned[prof]=have; continue; }
    const ts=profTrainers(prof); const pts=ts.flatMap(ptrainerPts); if(!pts.length){ notes.push(`No ${prof} trainer found for your faction.`); continue; }
    let lim=route.steps.length-1; if(prof===campProf){ const tgo=route.steps.findIndex(s=>s.t==='turnin'&&/^The Great Outdoors$/.test(Q(s.q)?.n||'')); if(tgo>=0) lim=tgo; }
    const l5=i=>lvAt(i)>=5; const hit=glpPlace(pts,0,lim,l5); const detour=!!hit?.detour;
    if(!hit){ notes.push(`Couldn't place learning ${prof}.`); continue; }
    const at=glpInsert(hit.i+1,{t:'prof',act:'learn',prof,npc:hit.p.npc,npcName:hit.p.label,unote:PROF20[prof]?`Level ${prof} to 20 on the way: ${PROF20[prof].how}`:''});
    for(const k in learned) if(learned[k]>=at) learned[k]++; learned[prof]=at; if(detour) notes.push(`Learn ${prof}: the route never passes a trainer, so this is a detour to ${hit.p.label} (${Math.round(hit.d)} yd away) at step ${hit.i+2}.`);
    }
  if(campProf){ const prof=campProf; const ci=charInfo(route);
    const vs=Object.entries(DB.q).filter(([id,q])=>q.n==='Camping 101: '+prof&&(!q.ra||!ci.rb||(q.ra&ci.rb))).map(([id,q])=>({id:+id,q,gp:(q.s?.n||[]).flatMap(n=>entPts('n',n)),fp:(q.f?.n||[]).flatMap(n=>entPts('n',n))})).filter(v=>v.gp.length&&v.fp.length);
    const li=learned[prof]??-1; if(li<0){ notes.push(`Camping 101: ${prof} needs ${prof} learned first.`); return notes; }
    const tgo=route.steps.findIndex(s=>s.t==='turnin'&&/^The Great Outdoors$/.test(Q(s.q)?.n||'')); const from=Math.max(li,tgo);
    if(tgo<0){ notes.push(`The guide doesn't do The Great Outdoors (starter-zone camp quest), so Camping 101: ${prof} isn't added: pick it up at your starter camp, and hand it in to a ${prof} trainer at skill 20.`); return notes; }
    let best=null; for(const v of vs){ const a=glpPlace(v.gp,from,from); if(!a) continue; if(!best||(!a.detour&&best.a.detour)||(!!a.detour===!!best.a.detour&&a.i<best.a.i)) best={v,a}; }
    if(!best){ notes.push(`No Camping 101: ${prof} quest found for ${m.race}.`); return notes; }
    const {v,a}=best; const ai=glpInsert(Math.max(a.i+1,li+1),{t:'accept',q:v.id}); if(a.detour) notes.push(`Camping 101: ${prof} is picked up from ${entName('n',v.q.s.n[0])}, ${Math.round(a.d)} yd off your route (step ${ai+1}).`);
    const L=Math.max(PROF20[prof]?.lv||10,lvAt(li)+(PROF20[prof]?.eff<=2?1:2)); const ok=i=>lvAt(i)>=L; const f0=route.steps.findIndex((x,i)=>i>ai&&ok(i));
    const t=f0<0?null:glpPlace(v.fp,f0,Math.min(route.steps.length-1,f0+60),ok); const det=!!t?.detour;
    if(!t){ notes.push(`Camping 101: ${prof} hand-in (${entName('n',v.q.f.n[0])}) never comes near your route after level ${L}.`); return notes; }
    const cix=glpInsert(t.i+1,{t:'complete',q:v.id}); glpInsert(cix+1,{t:'turnin',q:v.id,unote:`Needs ${prof} 20. Learn the ${CAMP[prof]?.f||'camp'} recipe and add it to the group campfire.`});
    if(det) notes.push(`Camping 101: ${prof} hand-in at ${entName('n',v.q.f.n[0])} is a ${Math.round(t.d)} yd detour (step ${t.i+2}).`); }
  return notes; }

async function glpBuild(){ const cfg=glpCfg(); const texts=await glpTexts(); if(!texts.length) return toast('Add a guide file first.',3000); if(!cfg.members.length) return toast('Add at least one group member.',3000);
  const mem=cfg.members; const adv=campAdvise(mem); const old=store.routes.filter(r=>r.glp===cfg.id); const gid=uid(); const built=[]; const report=[];
  $('#glpMsg').textContent='Building routes…'; await new Promise(r=>setTimeout(r,30));
  for(const [k,m] of mem.entries()){
    route=newRoute({name:m.name,char:{faction:glpFac(m.race),race:m.race,cls:m.cls,level:1,xp:0,party:mem.length,dungeons:{},xprate:1}}); route.glp=cfg.id; route.group=gid; route.member=true; store.routes.push(route); cursor=-1; history=[];
    for(const t of texts) importGuides(t.text,false); refresh();
    const ok=route.guides.filter(guideOK); const refd=new Set(ok.flatMap(g=>nextGuides(g).found||[]).map(g=>g.id)); const heads=ok.filter(x=>!refd.has(x.id)); const sz=GLP_START[m.race]||[];
    const lv0=x=>{ const mm=x.name.match(/^\s*(\d+)\s*-\s*(\d+)\b/); return mm?+mm[1]:99; }; const lvl=ok.filter(x=>lv0(x)<99); const min=Math.min(...lvl.map(lv0));
    let g=lvl.find(x=>lv0(x)===min&&sz.some(z=>x.name.toLowerCase().includes(z)))||lvl.find(x=>lv0(x)===min&&!refd.has(x.id))||lvl.find(x=>lv0(x)===min)||heads[0]||ok[0];
    if(g&&lv0(g)>1&&lv0(g)<99){ route.char.level=lv0(g); report.push&&0; } const used=[]; let prev=null;
    while(g&&used.length<80){ if(prev) continueWith(prev,g.id); else { g.from=0; g.to=g.steps.length-1; refresh(); } connectGuide(g); used.push(g.id); prev=g; g=(nextGuides(g).found||[]).find(x=>guideOK(x)&&!used.includes(x.id)); }
    simulate(); const notes=glpProfSteps(m,adv.asg[k]); cursor=route.steps.length-1; refresh(); built.push(route);
    if(route.char.level>1) notes.unshift(`The guide starts at level ${route.char.level}, so ${m.name} starts there too.`); report.push({m,steps:route.steps.length,guides:used.length,notes}); $('#glpMsg').textContent=`Built ${k+1}/${mem.length}…`; await new Promise(r=>setTimeout(r,0)); }
  for(const r of old){ store.deleted=[...(store.deleted||[]),r.id]; kvDel('route:'+r.id); } store.routes=store.routes.filter(r=>!old.includes(r));
  route=built[0]; cursor=route.steps.length-1; FQ.key=null; PSIM.clear&&PSIM.clear(); refresh(); saveNow();
  cfg.built=Date.now(); cfg.report=report.map(x=>({name:x.m.name,steps:x.steps,guides:x.guides,notes:x.notes})); save(); glpRender(); toast(`Built ${built.length} member routes. Export the group guide when ready.`,4000); }

/* ---------- dialog ---------- */
function glpRender(){ const cfg=glpCfg(); const mem=cfg.members; const adv=mem.length?campAdvise(mem):null;
  const opt=(arr,v)=>arr.map(n=>`<option${n===v?' selected':''}>${n}</option>`).join('');
  const raceOpts=v=>Object.keys(RACES).filter(n=>n!=='Skyborne').map(n=>`<option${n===v?' selected':''}>${n}</option>`).join('');
  let h=`<div class="row" style="gap:8px;align-items:center"><label style="flex:1">Group name<input type="text" id="glpName" value="${esc(cfg.name)}"></label></div>
  <h4 style="margin:10px 0 4px">1 · Solo guide</h4><div class="note">One or more RestedXP guide files: from the Forever Route Planner, or the stock RestedXP guides. Each member follows the parts for their race and class.</div>
  <div id="glpGuides" class="note" style="margin:4px 0">${(GLP_TEXTS||[]).map((t,i)=>`<div>📄 ${esc(t.name)} <span class="note">(${Math.round(t.text.length/1024)} KB)</span> <button class="btn sm" data-glpdelg="${i}">✕</button></div>`).join('')||'<i>No guide yet.</i>'}</div>
  <label class="btn sm" style="cursor:pointer">Add guide file…<input type="file" id="glpFile" accept=".lua,.txt,text/plain" multiple hidden></label>
  <h4 style="margin:12px 0 4px">2 · Group</h4>
  <table class="ptab" style="width:100%"><tr><th>Name</th><th>Race</th><th>Class</th><th>Main professions</th><th>Camp feature</th><th></th></tr>
  ${mem.map((m,i)=>{ const pr=m.profs||[]; const a=adv?.asg[i];
    return `<tr data-glpm="${i}"><td><input type="text" data-k="name" value="${esc(m.name)}" style="width:100px"></td><td><select data-k="race">${raceOpts(m.race)}</select></td><td><select data-k="cls" style="color:${CLS_COL[m.cls]}">${opt(Object.keys(CLASSES),m.cls)}</select></td>
    <td><select data-k="p0"><option value="">–</option>${opt(GLP_PRIMARY,pr[0])}</select> <select data-k="p1"><option value="">–</option>${opt(GLP_PRIMARY,pr[1])}</select></td>
    <td><select data-k="camp"><option value="auto"${!m.camp||m.camp==='auto'?' selected':''}>Auto${a&&(!m.camp||m.camp==='auto')?': '+CAMP[a].f:''}</option><option value="none"${m.camp==='none'?' selected':''}>None</option>${Object.keys(CAMP).map(p=>`<option value="${p}"${m.camp===p?' selected':''}>${CAMP[p].f} (${p})</option>`).join('')}</select></td>
    <td><button class="btn sm" data-glpdel="${i}">✕</button></td></tr>`; }).join('')}</table>
  <button class="btn sm" id="glpAdd"${mem.length>=5?' disabled':''}>+ Add member</button> <span class="note">Everyone learns Cooking (the guide covers it; it's needed to place the campfire).</span>`;
  if(adv){ const rows=Object.keys(CAMP).map(p=>({p,...adv.val[p]})).sort((a,b)=>b.v-a.v);
    h+=`<h4 style="margin:12px 0 4px">3 · Camp (Basic Campfire: ${GLP_SLOTS} features, one per player)</h4>
    <div>${adv.asg.map((p,i)=>p?`<div>⛺ <b style="color:${CLS_COL[mem[i].cls]}">${esc(mem[i].name)}</b> brings <b>${CAMP[p].f}</b> (${p} 20): ${CAMP[p].e}${campCost(p,mem[i]).adds?` <span class="note">· adds ${p}${GLP_SECONDARY.includes(p)?' (secondary skill)':''}</span>`:''}</div>`:'').join('')}</div>
    ${adv.warn.map(w=>`<div class="note" style="color:#ff9a6a">⚠ ${esc(w)}</div>`).join('')}
    <details style="margin-top:4px"><summary class="note">Value of every feature for this group</summary><table class="ptab"><tr><th>Feature</th><th>Profession</th><th>Gives</th><th>Value</th><th>Effort to 20</th><th>Notes</th></tr>${rows.map(r=>`<tr><td>${CAMP[r.p].f}</td><td>${r.p}</td><td>${CAMP[r.p].e}</td><td>${r.v}</td><td>${'●'.repeat(PROF20[r.p].eff)} <span class="note">~lvl ${PROF20[r.p].lv}</span></td><td class="note">${esc(r.notes.join('; '))}</td></tr>`).join('')}</table>
    <div class="note">Camp buffs don't stack with a class buff of the same stat: the class buff overwrites it.</div></details>`; }
  h+=`<h4 style="margin:12px 0 4px">4 · Build</h4><div class="row" style="gap:6px;flex-wrap:wrap"><button class="btn gold" id="glpBuild">${cfg.built?'Rebuild':'Build'} member routes</button><button class="btn" id="glpExport"${cfg.built?'':' disabled'}>Export group guide</button></div><div id="glpMsg" class="note" style="margin-top:4px"></div>`;
  if(cfg.report) h+=cfg.report.map(r=>`<div style="margin-top:4px"><b>${esc(r.name)}</b> <span class="note">${r.steps} steps from ${r.guides} guide${r.guides===1?'':'s'}</span>${r.notes.map(n=>`<div class="note">• ${esc(n)}</div>`).join('')}</div>`).join('');
  $('#glpBody').innerHTML=h; }
async function openGroup(){ await glpTexts(); glpRender(); $('#dlgGroup').showModal(); }
$('#groupBtn').addEventListener('click',openGroup);
$('#glpClose').addEventListener('click',()=>$('#dlgGroup').close());
$('#dlgGroup').addEventListener('change',async e=>{ const t=e.target; const cfg=glpCfg();
  if(t.id==='glpName'){ cfg.name=t.value; save(); return; }
  if(t.id==='glpFile'){ const T=await glpTexts(); for(const f of t.files){ const text=await f.text(); if(!parseRXP(text).length){ toast(`${f.name}: no RestedXP guide found`,3000); continue; } const k=T.findIndex(x=>x.name===f.name); if(k>=0) T[k]={name:f.name,text}; else T.push({name:f.name,text}); } await kvPut('glp:guides',JSON.stringify(T)); t.value=''; glpRender(); return; }
  const tr=t.closest('[data-glpm]'); if(!tr) return; const m=cfg.members[+tr.dataset.glpm]; const k=t.dataset.k;
  if(k==='name') m.name=t.value.trim()||m.name; else if(k==='race'){ m.race=t.value; } else if(k==='cls') m.cls=t.value; else if(k==='camp') m.camp=t.value;
  else if(k==='p0'||k==='p1'){ const pr=[...(m.profs||[])]; pr[k==='p0'?0:1]=t.value||undefined; m.profs=pr.filter(Boolean); }
  save(); glpRender(); });
$('#dlgGroup').addEventListener('click',async e=>{ const cfg=glpCfg(); const b=e.target.closest('button'); if(!b) return;
  if(b.id==='glpAdd'){ const last=cfg.members[cfg.members.length-1]; const race=last?.race||'Orc'; const fac=glpFac(race); const cl=['Warrior','Priest','Mage','Hunter','Rogue'].find(c=>!cfg.members.some(m=>m.cls===c))||'Warrior';
    cfg.members.push({name:'Member '+(cfg.members.length+1),race,cls:cl,profs:[],camp:'auto'}); save(); glpRender(); return; }
  if(b.dataset.glpdel!=null){ cfg.members.splice(+b.dataset.glpdel,1); save(); glpRender(); return; }
  if(b.dataset.glpdelg!=null){ const T=await glpTexts(); T.splice(+b.dataset.glpdelg,1); await kvPut('glp:guides',JSON.stringify(T)); glpRender(); return; }
  if(b.id==='glpBuild'){ b.disabled=true; try{ await glpBuild(); } catch(err){ console.error(err); $('#glpMsg').textContent='Build failed: '+err.message; } finally{ b.disabled=false; } return; }
  if(b.id==='glpExport'){ const r=store.routes.find(x=>x.glp===cfg.id); if(!r) return; route=r; refresh(); $('#dlgGroup').close(); exportGroupGuide(); return; } });
setTimeout(async()=>{ try{ if(!store.glp||!store.glp.built) await openGroup(); }catch(e){} },1500);
