
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
  const mem=cfg.members; const adv=campAdvise(mem); const old=store.routes.filter(r=>r.glp===cfg.id); GLP_MEET=null; const gid=uid(); const built=[]; const report=[];
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
  if(cfg.built){ const r0=store.routes.filter(x=>x.glp===cfg.id); const met=r0.some(x=>x.glpMeet);
    h+=`<h4 style="margin:12px 0 4px">5 · Meet up</h4><div class="note">Where should the group get together? Members may leave their own route early when that's quicker overall.</div><div class="row" style="gap:6px;flex-wrap:wrap;align-items:center"><button class="btn" id="glpFindMeet">Find meet-up options</button><span class="note">or your own spot:</span><select id="glpCHost">${r0.map((r,i)=>`<option value="${i}"${i===(GLP_CUST.h??0)?' selected':''}>${esc(r.name)}'s route</option>`).join('')}</select><select id="glpCStep" style="max-width:340px">${glpSpotOpts(r0[GLP_CUST.h??0])}</select><button class="btn sm" id="glpCustom">Compare my spot</button>${met?'<button class="btn sm" id="glpUnmeet">Undo meet-up (back to solo routes)</button>':''}</div><div id="glpMeet">${glpMeetHTML()}</div>`; }
  if(cfg.report) h+=cfg.report.map(r=>`<div style="margin-top:4px"><b>${esc(r.name)}</b> <span class="note">${r.steps} steps from ${r.guides} guide${r.guides===1?'':'s'}</span>${r.notes.map(n=>`<div class="note">• ${esc(n)}</div>`).join('')}</div>`).join('');
  $('#glpBody').innerHTML=h; }
async function openGroup(){ await glpTexts(); glpRender(); $('#dlgGroup').showModal(); }
$('#groupBtn').addEventListener('click',openGroup);
$('#glpClose').addEventListener('click',()=>$('#dlgGroup').close());
$('#dlgGroup').addEventListener('change',async e=>{ const t=e.target; const cfg=glpCfg();
  if(t.id==='glpName'){ cfg.name=t.value; save(); return; }
  if(t.id==='glpFile'){ const T=await glpTexts(); for(const f of t.files){ const text=await f.text(); if(!parseRXP(text).length){ toast(`${f.name}: no RestedXP guide found`,3000); continue; } const k=T.findIndex(x=>x.name===f.name); if(k>=0) T[k]={name:f.name,text}; else T.push({name:f.name,text}); } await kvPut('glp:guides',JSON.stringify(T)); t.value=''; glpRender(); return; }
  if(t.id==='glpCHost'){ GLP_CUST.h=+t.value; GLP_CUST.j=null; glpRender(); return; }
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
  if(b.id==='glpFindMeet'){ const rs=store.routes.filter(x=>x.glp===cfg.id); if(rs.length<2) return toast('A meet-up needs at least two members.'); b.disabled=true; b.textContent='Working…'; await rawLoad(rs.flatMap(r=>(r.guides||[]).map(g=>g.id))); await new Promise(r=>setTimeout(r,20)); try{ GLP_MEET=glpMeetOptions(rs); }catch(err){ console.error(err); toast('Failed: '+err.message,4000); } glpRender(); return; }
  if(b.id==='glpCustom'){ const rs=store.routes.filter(x=>x.glp===cfg.id); GLP_CUST.h=+$('#glpCHost').value; GLP_CUST.j=+$('#glpCStep').value; b.disabled=true; b.textContent='Working…'; await rawLoad(rs.flatMap(r=>(r.guides||[]).map(g=>g.id))); await new Promise(r=>setTimeout(r,20)); try{ GLP_MEET=glpMeetOptions(rs,{h:GLP_CUST.h,j:GLP_CUST.j}); }catch(err){ console.error(err); toast('Failed: '+err.message,4000); } glpRender(); return; }
  if(b.dataset.glpmeet!=null){ const o=GLP_MEET?.top[+b.dataset.glpmeet]; if(!o) return; await glpApplyMeet(o,GLP_MEET.TR); glpRender(); toast('Meet-up applied: the others now follow '+GLP_MEET.TR[o.h].r.name+"'s route after meeting. Export the group guide to see it.",5000); return; }
  if(b.id==='glpUnmeet'){ for(const r of store.routes.filter(x=>x.glp===cfg.id)){ if(r.glpSolo){ r.steps=r.glpSolo; delete r.glpSolo; } delete r.glpMeet; } cursor=route.steps.length-1; PSIM.clear&&PSIM.clear(); refresh(); saveNow(); glpRender(); toast('Back to everyone on their own route.'); return; }
  if(b.id==='glpExport'){ const r=store.routes.find(x=>x.glp===cfg.id); if(!r) return; route=r; refresh(); $('#dlgGroup').close(); exportGroupGuide(); return; } });
setTimeout(async()=>{ try{ if(!store.glp||!store.glp.built) await openGroup(); }catch(e){} },1500);

/* =====================================================================
   Meet-up options: who leaves their own route where, and joins whose route; ranked with fat-tailed pace uncertainty
   ===================================================================== */
const totXP=(L,x)=>{ let s=0; for(let k=1;k<L;k++) s+=XP_TABLE[k]||0; return s+(x||0); };
function glpTrack(r){ const R0=route,S0=SIM,st0=r.steps; route=r; if(r.glpSolo) r.steps=r.glpSolo; try{ simulate(); const n=r.steps.length; const T=[],P=[],L=[],X=[],G=[]; let last=null;
    for(let i=0;i<n;i++){ const x=SIM.res[i]; if(x.pt&&!x.stk) last=x.pt; T.push(x.tAt||0); P.push(last); L.push(x.after?.level||1); X.push(totXP(x.after?.level||1,x.after?.xp||0)); const s=r.steps[i]; G.push(s.src&&!s.src.auto?s.src.g:null); }
    const done=new Set(); const open=[]; /* quests in the log at each step (to report what leaving early abandons) */
    const log=new Map(); const LOG=[]; for(let i=0;i<n;i++){ const s=r.steps[i]; if(SIM.res[i].inactive){ LOG.push(log.size); continue; } if(s.t==='accept'&&s.q) log.set(s.q,1); if(s.t==='turnin'&&s.q) log.delete(s.q); if(s.t==='abandon') log.delete(s.q); LOG.push(log.size); }
    return {r,n,T,P,L,X,G,LOG,ci:charInfo(r)}; } finally{ r.steps=st0; route=R0; SIM=S0; } }
/* boats and zeppelins between the continents: [faction, zone,x,y (one end), zone,x,y (other end), secs incl. waiting] */
const GLP_PORTS=[['A',11,4.6,57.0,148,32.4,43.8,330],['A',148,33.2,40.0,141,55.0,93.0,240],['H',14,50.8,13.8,85,60.7,58.8,330],['H',14,50.8,13.8,33,31.6,29.1,330]];
const GLP_DANGER=[['A',11,20,'the Wetlands']]; /* zones a low-level walk to the port crosses */
function glpWalk(a,b,L){ const d=Math.hypot(b.X-a.X,b.Y-a.Y); const run=L>=40?11.2:7; return Math.min(d*1.3/run,d>2500&&L>=12?d/30+150:d*1.3/run); }
function glpTravel(a,b,L,fac){ if(!a||!b) return {s:0,cross:false}; const ma=META.zones[a.z]?.m, mb=META.zones[b.z]?.m;
  if(ma==null||mb==null||ma===mb){ return {s:glpWalk(a,b,L),cross:false}; }
  /* other continent: walk to a port, sail, walk on (Teldrassil needs the extra Rut'theran boat) */
  const pts=GLP_PORTS.filter(p=>!fac||p[0]===fac).flatMap(p=>{ const x=zp2plane(p[1],p[2],p[3]), y=zp2plane(p[4],p[5],p[6]); return x&&y?[[x,y,p[7],p[1]],[y,x,p[7],p[4]]]:[]; });
  let best=null; const go=(from,to,secs,legs,via)=>{ if(legs>3) return; const m0=META.zones[from.z]?.m; if(m0===mb){ const t=secs+glpWalk(from,to,L); if(!best||t<best.s) best={s:t,cross:true,via}; return; }
    for(const [x,y,bt,z] of pts){ if(META.zones[x.z]?.m!==m0||via.includes(z)) continue; go(y,to,secs+glpWalk(from,x,L)+bt,legs+1,[...via,z]); } };
  go(a,b,0,0,[]); if(!best) return {s:1200,cross:true};
  for(const [f,z,lv,nm] of GLP_DANGER) if((!fac||f===fac)&&best.via.includes(z)&&L<lv-5){ const pen=Math.min(1200,(lv-L)*60); best.s+=pen; best.danger=`walks through ${nm} (level ${lv}+) at level ${L}`; }
  return best; }
function tSample(){ const g=()=>{ let u=0,v=0; while(!u) u=Math.random(); while(!v) v=Math.random(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); }; const z=g(); const c=g()**2+g()**2+g()**2; return Math.max(-4,Math.min(4,z/Math.sqrt(c/3))); } /* Student t, 3 d.o.f.: fat tails */
function glpMeetOptions(routes,custom){ const TR=routes.map(glpTrack); const N=TR.length;
  const Xlv=Math.min(...TR.map(t=>t.L[t.n-1])); const TX=TR.map(t=>{ const i=t.L.findIndex(l=>l>=Xlv); return t.T[i<0?t.n-1:i]; });
  const cand=t=>{ const out=new Set(); const s=Math.max(1,Math.floor(t.n/90)); for(let i=0;i<t.n;i++){ if(!t.P[i]||t.L[i]>=Xlv) continue; if(i%s===0||(i>0&&t.G[i]!==t.G[i-1])||(i>0&&t.P[i-1]&&t.P[i].z!==t.P[i-1].z)) out.add(i); } return [...out]; };
  const C=TR.map(cand);
  const rate=(t,e)=>{ let k=e; while(k>0&&t.T[e]-t.T[k]<1800) k--; const dx=t.X[e]-t.X[k], dt=t.T[e]-t.T[k]; return dx>0&&dt>0?dx/dt:Math.max(.5,t.X[e]/Math.max(60,t.T[e])); };
  const opts=[];
  const allCan=(H,j)=>{ const st=(H.r.glpSolo||H.r.steps)[j]; const g=st?.src&&!st.src.auto?G2(H.r,st.src.g):null; const c=glpStepCond(H.r,st); if(!st||st.glp||['prof','train','buy'].includes(st.t)) return false; const q=st.q?Q(st.q):null; if(q?.ra&&TR.some(t=>t.ci.rb&&!(q.ra&t.ci.rb))) return false; return !c||TR.every(t=>condFor(c,t.r)); };
  for(let h=0;h<N;h++){ const H=TR[h]; const js=custom&&custom.h===h?[...C[h],custom.j]:C[h]; for(const j of js){ const pj=H.P[j]; const isC=custom&&custom.h===h&&custom.j===j; if(!pj) continue; if(!isC&&!allCan(H,j)) continue; /* never meet on a step only the host can do (class trips, race quests) */ const es=[]; let ok=true; let mean=H.T[j];
      for(let m=0;m<N;m++){ if(m===h){ es.push(null); continue; } const M=TR[m]; let best=null; const cs=[];
        /* if this member's own route reaches the same step, they simply carry on to it (same zone, no detour) */
        const hss=H.r.glpSolo||H.r.steps; const ms=M.r.glpSolo||M.r.steps; const sg=x=>x&&x.q?x.t+':'+x.q:null; const idx=new Map(); ms.forEach((x,i)=>{ const k=sg(x); if(k&&!idx.has(k)) idx.set(k,i); }); let k=-1; for(let jj=j;jj<Math.min(hss.length,j+40)&&k<0;jj++){ const kk=idx.get(sg(hss[jj])); if(kk!=null) k=kk; }
        for(const e of (k>0?[k-1]:C[m])){ const tr=glpTravel(M.P[e],pj,M.L[e],M.ci.fac); const arr=M.T[e]+tr.s; const def=Math.max(0,H.X[j]-M.X[e]); const cu=def/rate(M,e); const ready=Math.max(arr+cu,H.T[j]); cs.push({e,T:M.T[e],cu,tr}); if(!best||ready<best.ready-60||(Math.abs(ready-best.ready)<=60&&e>best.e)) best={e,ready,tr,cu,arr}; } /* same meet time: keep questing on your own route as long as possible */
        if(!best){ ok=false; break; } best.cs=cs; es.push(best); mean=Math.max(mean,best.ready); }
      if(!ok) continue; const o={h,j,es,mean,C:mean+(TX[h]-H.T[j])}; if(isC){ o.custom=true; o.cannot=!allCan(H,j); } opts.push(o); } }
  /* one option per host and zone (the best moment to meet there) */
  const by=new Map(); for(const o of opts){ const k=o.h+'|'+TR[o.h].P[o.j].z; if(!by.has(k)||o.C<by.get(k).C) by.set(k,o); }
  const top=[...by.values()].filter(o=>!o.custom).sort((a,b)=>a.C-b.C).slice(0,8); const co=opts.find(o=>o.custom); if(co) top.push(co);
  /* Monte Carlo: shared launch factor, each member's own pace (busy starter zones: wider), travel noise; same draws for every option */
  const D=600; const sig=m=>{ const k=TR[m].L.findIndex(l=>l>=12); return k<0||k>TR[m].n*0.3?0.35:0.25; };
  const draws=Array.from({length:D},()=>({c:Math.exp(0.2*tSample()),f:TR.map((_,m)=>Math.exp(sig(m)*tSample())),t:TR.map(()=>Math.exp(0.25*tSample()))}));
  const q=(a,p)=>{ const s=[...a].sort((x,y)=>x-y); return s[Math.floor(p*(s.length-1))]; };
  for(const o of top){ const H=TR[o.h]; o.Ms=[]; o.Cs=[]; o.last=Array(N).fill(0); o.wait=Array(N).fill(0); o.exits=TR.map(()=>[]);
    for(const d of draws){ /* each player is as fast as this run says; whoever can get there soonest decides nothing: the group meets when the last one can */
      const rd=(m,x)=>(x.T+x.cu)*d.f[m]*d.c+x.tr.s*d.t[m];
      const soon=TR.map((M,m)=>m===o.h?H.T[o.j]*d.f[m]*d.c:Math.min(...o.es[m].cs.map(x=>rd(m,x))));
      const Mt=Math.max(...soon); o.last[soon.indexOf(Mt)]++;
      TR.forEach((M,m)=>{ if(m===o.h){ o.wait[m]+=Mt-soon[m]; return; } /* everyone else keeps questing on their own route and leaves just in time */
        let pick=null; for(const x of o.es[m].cs){ const r=rd(m,x); if(r<=Mt+1&&(!pick||x.e>pick.x.e)) pick={x,r}; } o.wait[m]+=Mt-pick.r; o.exits[m].push(pick.x.e); });
      o.Ms.push(Mt); o.Cs.push(Mt+(TX[o.h]-H.T[o.j])*d.c); }
    o.p10=q(o.Ms,.1); o.p50=q(o.Ms,.5); o.p90=q(o.Ms,.9); o.cMean=o.Cs.reduce((a,b)=>a+b,0)/D; o.wait=o.wait.map(w=>w/D); o.last=o.last.map(f=>f/D); o.exitR=o.exits.map(a=>a.length?[q(a,.1),q(a,.5),q(a,.9)]:null); o.win=0; o.winBy=Array(N).fill(0); }
  draws.forEach((d,k)=>{ let b=null; for(const o of top) if(!b||o.Cs[k]<b.Cs[k]) b=o; if(!b) return; b.win++; const fast=d.f.indexOf(Math.min(...d.f)); b.winBy[fast]++; });
  const fastN=Array(N).fill(0); draws.forEach(d=>fastN[d.f.indexOf(Math.min(...d.f))]++);
  for(const o of top){ o.win/=D; o.winBy=o.winBy.map((w,m)=>fastN[m]?w/fastN[m]:0);
    o.es=o.es.map((x,m)=>{ if(!x) return x; const e=o.exitR[m][1]; return {...x,...(x.cs.find(c=>c.e===e)||{}),e}; }); o.cc=glpConcerns(o,TR,Xlv); if(o.cannot) o.cc.unshift('Not everyone can do this step (race/class/profession only): meet just before or after it.'); }
  top.sort((a,b)=>a.cMean-b.cMean); return {TR,top,Xlv,D}; }
function glpConcerns(o,TR,Xlv){ const out=[]; const H=TR[o.h]; const pj=H.P[o.j];
  o.es.forEach((x,m)=>{ if(!x) return; const M=TR[m]; const nm=M.r.name;
    if(x.tr.cross) out.push(`${nm} crosses to the other continent: ~${fmtT(x.tr.s)} by boat/zeppelin${x.tr.danger?' and '+x.tr.danger:''}.`); else if(x.tr.s>300) out.push(`${nm} travels ~${fmtT(x.tr.s)} to get there.`);
    const left=M.LOG[x.e]; if(left) out.push(`${nm} leaves their route at level ${M.L[x.e]} with ${left} quest${left>1?'s':''} unfinished (step ${x.e+1} of ${M.n}).`);
    const gap=(H.X[o.j]-M.X[x.e]); if(gap>0) { const lv=H.L[o.j]-M.L[x.e]; if(lv>=2) out.push(`${nm} arrives ${lv} levels below ${H.r.name}: ~${fmtT(x.cu)} of catching up.`); }
    else if(M.L[x.e]-H.L[o.j]>=2) out.push(`${nm} arrives ${M.L[x.e]-H.L[o.j]} levels above ${H.r.name}: some of the shared quests will give them less XP.`); });
  const zn=zoneName(pj?.z).toLowerCase(); if(Object.values(GLP_START).flat().some(z=>zn.includes(z))) out.push('Meets in a starter zone: the busiest place at launch, so pace there is the least predictable.');
  /* steps on the host's route that the others can't do (race/class): they wait or grind */
  const own=[]; const hs=H.r.glpSolo||H.r.steps; for(let i=o.j;i<Math.min(H.n,o.j+250);i++){ const c=glpStepCond(H.r,hs[i]); if(c&&condFor(c,H.r)) own.push(c); }
  for(const [m,x] of o.es.entries()){ if(!x) continue; const R=TR[m].r; const n=own.filter(c=>!condFor(c,R)).length; if(n>5) out.push(`${n} of ${H.r.name}'s next 250 steps are for their race/class only (${R.name} splits off or waits).`); }
  if(o.p90-o.p10>3600) out.push(`Wide range: the meet time could be anywhere from ${fmtT(o.p10)} to ${fmtT(o.p90)} in.`);
  return out; }
/* the RestedXP tag that decides who sees this step: its block header (<< ...) and the tag on its own line, if any */
function glpStepCond(r,st){ const g=st?.src&&!st.src.auto?G2(r,st.src.g):null; const gs=g?.steps[st.src.i]; if(!gs?.rx) return ''; const blk=rawCache.get(g.id)?.[gs.rx-1]; if(!blk) return ''; const out=[]; const h=blkHdrCond(blk); if(h) out.push(h);
  if(st.q){ const ln=blk.split('\n').find(l=>new RegExp('^\\s*\\.(accept|turnin|complete)\\s+'+st.q+'\\b').test(l)); const m=ln&&ln.match(/<<\s*(.+)$/); if(m) out.push(m[1].trim()); }
  return out.map(c=>'('+c+')').join(' '); }
function G2(r,id){ return (r.guides||[]).find(g=>g.id===id); }
function glpPlaceName(p){ if(!p) return '?'; const z=zoneName(p.z); return p.label&&p.label!==z?p.label+', '+z:z; }
async function glpApplyMeet(o,TR){ const H=TR[o.h]; const host=H.r; const pj=H.P[o.j]; const where=glpPlaceName(pj);
  for(const [m,x] of o.es.entries()){ const r=TR[m].r; if(!r.glpSolo) r.glpSolo=JSON.parse(JSON.stringify(r.steps)); if(!host.glpSolo) host.glpSolo=JSON.parse(JSON.stringify(host.steps));
    if(m===o.h){ r.steps=JSON.parse(JSON.stringify(r.glpSolo)); r.steps.splice(o.j,0,{id:uid(),t:'travel',kind:'note',text:`Meet the group here (${where})`,glp:1}); continue; }
    const e=o.exitR?.[m]?.[1]??x.e; const tr=glpTravel(TR[m].P[e],pj,TR[m].L[e],TR[m].ci.fac); const base=JSON.parse(JSON.stringify(r.glpSolo)).slice(0,e+1);
    base.push({id:uid(),t:'travel',kind:'note',text:`Leave your solo route here: go to ${where} and meet ${host.name}${tr.cross?' (take the boat/zeppelin)':''}. If you're ahead, keep questing and leave later; if behind, leave earlier.`,glp:1});
    const R0=route; route=host; const tail=host.glpSolo.slice(o.j).map(st=>stepFor(r,st)).map(st=>{ if(!st.src){ delete st.cw; } return st; }); route=R0; r.steps=[...base,...tail]; r.glpMeet={h:host.id,j:o.j,e};
    /* add this member's own class/race steps from the guides they now follow */
    const tg=[...new Set(tail.filter(x=>x.src&&!x.src.auto).map(x=>x.src.g))]; route=r; await rawLoad(tg); simulate(); for(const id of tg){ const g=G(id); if(g) fillGuide(g); }
    /* drop what this member can't do on the joined route: hand-ins for quests they never picked up, quests for other races/classes */
    const keep=new Set(r.steps.slice(0,base.length).map(x=>x.id)); for(let it=0;it<6;it++){ simulate(); const bad=new Set(); r.steps.forEach((x,i)=>{ if(keep.has(x.id)||!x.q) return; const er=(SIM.res[i]?.err||[]).join(' '); if(/Not in your quest log|Not available to your (race|class)|Restricted to specific|Requires one of|Requires: /.test(er)) bad.add(x.id); }); if(!bad.size) break; r.steps=r.steps.filter(x=>!bad.has(x.id)); }
    for(let it=0;it<8;it++){ simulate(); const i=r.steps.findIndex((x,i)=>!keep.has(x.id)&&/Requires level \d+/.test((SIM.res[i]?.err||[]).join(' '))); if(i<0) break; const L=+(SIM.res[i].err.join(' ').match(/Requires level (\d+)/)[1]); r.steps.splice(i,0,{id:uid(),t:'grind',mode:'to',level:L,xp:0,note:'Catch up with the group',glp:1}); }
    route=R0; }
  host.glpMeet={h:host.id,j:o.j}; cursor=route.steps.length-1; PSIM.clear&&PSIM.clear(); FQ.key=null; refresh(); saveNow(); }
let GLP_MEET=null; const GLP_CUST={h:0,j:null};
function glpSpotOpts(r){ if(!r) return ''; const R0=route,st0=r.steps; route=r; if(r.glpSolo) r.steps=r.glpSolo; let out=''; try{ simulate(); let prev=''; r.steps.forEach((x,i)=>{ const p=SIM.res[i]?.pt; if(!p||SIM.res[i].stk||x.glp) return; const nm=glpPlaceName(p); if(nm===prev) return; prev=nm;
    out+=`<option value="${i}"${GLP_CUST.j===i?' selected':''}>Step ${i+1} · lvl ${SIM.res[i].before?.level||1} · ${esc(nm)}</option>`; }); } finally{ r.steps=st0; route=R0; simulate(); } return out; }
function glpMeetHTML(){ if(!GLP_MEET) return ''; const {TR,top,Xlv,D}=GLP_MEET; const N=TR.length; const nm=m=>`<b style="color:${CLS_COL[TR[m].r.char.cls]}">${esc(TR[m].r.name)}</b>`;
  return `<div class="note" style="margin:4px 0">Ranked by the expected time until everyone is level ${Xlv}. Each option uses ${D} simulated launches: a shared “how busy is the server” factor, each player's own pace (fat-tailed, wider in starter zones) and travel delays.</div>`+
  top.map((o,k)=>{ const H=TR[o.h]; const pj=H.P[o.j];
    return `<div style="border:1px solid ${o.custom?'var(--gold,#ffcd46)':'var(--line)'};border-radius:8px;padding:6px 8px;margin:6px 0"><div>${o.custom?'<span class="note" style="color:#ffcd46">★ Your spot · </span>':''}<b>${k+1}. Meet at ${esc(glpPlaceName(pj))}</b> on ${nm(o.h)}'s route (their step ${o.j+1}, level ${H.L[o.j]}) <span class="note">· best in ${Math.round(o.win*100)}% of simulations</span></div>
    <div class="note">Meet after ~${fmtT(o.p50)} <span title="10th–90th percentile">(likely ${fmtT(o.p10)}–${fmtT(o.p90)})</span> · everyone level ${Xlv} after ~${fmtT(o.cMean)}</div>
    ${o.es.map((x,m)=>{ const R=o.exitR[m]; const lst=`the one everyone waits for in ${Math.round(o.last[m]*100)}% of runs`;
      return x?`<div class="note">• ${nm(m)} leaves their route around step ${R[1]+1} (level ${TR[m].L[R[1]]}, ${esc(zoneName(TR[m].P[R[1]]?.z))}; anywhere from step ${R[0]+1} to ${R[2]+1} depending on pace), ${x.tr.s>30?'~'+fmtT(x.tr.s)+' travel':'already there'}. They're ${lst}; idle ~${fmtT(o.wait[m])} on average.</div>`:`<div class="note">• ${nm(m)} carries on with their route to step ${o.j+1}. They're ${lst}; idle ~${fmtT(o.wait[m])} on average.</div>`; }).join('')}
    ${o.winBy.map((w,m)=>w>=.4&&N>1?`<div class="note">→ the best choice in ${Math.round(w*100)}% of runs where ${esc(TR[m].r.name)} is the fastest.</div>`:'').join('')}
    ${o.cc.map(c=>`<div class="note" style="color:#ffb27a">⚠ ${esc(c)}</div>`).join('')}
    <button class="btn sm" data-glpmeet="${k}">Use this</button></div>`; }).join(''); }
