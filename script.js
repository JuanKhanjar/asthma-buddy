(() => {
  // --- Stronger iOS audio unlock on first interaction ---
  const unlockOnce = () => {
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C) { const ctx = new C(); if (ctx.state === "suspended") ctx.resume(); }
    } catch {}
    const a = new Audio(); a.muted = true; a.play().catch(()=>{});
    window.removeEventListener("touchend", unlockOnce);
    window.removeEventListener("click", unlockOnce);
  };
  window.addEventListener("touchend", unlockOnce, { once: true });
  window.addEventListener("click", unlockOnce, { once: true });

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  // ===== SELECTORS =====
  const el = {
    themeToggle: document.getElementById("theme-toggle"),
    success: document.getElementById("success-line"),
    cfgForm: document.getElementById("cfg-form"),
    child: document.getElementById("child-name"),
    med: document.getElementById("med-name"),
    puffs: document.getElementById("puffs"),
    note: document.getElementById("extra-note"),
    alarmTime: document.getElementById("alarm-time"),
    snoozeMin: document.getElementById("snooze-min"),
    alarmSound: document.getElementById("alarm-sound"),
    alarmVolume: document.getElementById("alarm-volume"),
    soundEnabled: document.getElementById("sound-enabled"),
    notifyEnabled: document.getElementById("notify-enabled"),
    voiceTools: document.getElementById("voice-tools"),
    fileTools: document.getElementById("file-tools"),
    recStart: document.getElementById("rec-start"),
    recStop: document.getElementById("rec-stop"),
    recPlay: document.getElementById("rec-play"),
    recDelete: document.getElementById("rec-delete"),
    recMeterBar: document.getElementById("rec-meter-bar"),
    recStatus: document.getElementById("rec-status"),
    fileInput: document.getElementById("file-input"),
    filePlay: document.getElementById("file-play"),
    fileDelete: document.getElementById("file-delete"),
    fileStatus: document.getElementById("file-status"),
    test: document.getElementById("test-alarm"),
    saveICS: document.getElementById("save-ics"),
    markNow: document.getElementById("mark-now"),
    clearToday: document.getElementById("clear-today"),
    streak: document.getElementById("streak"),
    thisMonth: document.getElementById("this-month"),
    lastTaken: document.getElementById("last-taken"),
    cal: document.getElementById("cal"),
    logList: document.getElementById("log-list"),
    exportCSV: document.getElementById("export-csv"),
    printBtn: document.getElementById("print"),
    alarmOverlay: document.getElementById("alarm-overlay"),
    alarmPuffs: document.getElementById("alarm-puffs"),
    alarmMed: document.getElementById("alarm-med"),
    alarmTaken: document.getElementById("alarm-taken"),
    alarmSnooze: document.getElementById("alarm-snooze"),
    alarmStop: document.getElementById("alarm-stop"),
    tipPuffs: document.getElementById("tip-puffs"),
    tipMed: document.getElementById("tip-med"),
  };

  // ===== STORAGE =====
  const STORE = "asthma_buddy_v4_ios_codec";
  const state = JSON.parse(localStorage.getItem(STORE) || JSON.stringify({
    theme:"light", child:"Little Khanjar", med:"Ventolin", puffs:2, note:"",
    alarmTime:"07:30", snoozeMin:5,
    soundEnabled:true, notifyEnabled:false,
    alarmSound:"chime", alarmVolume:0.9,
    logs:{}, lastAlarmFire:null, nextSnoozeAt:null
  }));
  const save = ()=>localStorage.setItem(STORE, JSON.stringify(state));
  const today = () => new Date().toISOString().slice(0,10);
  const fmtTime = d => d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
  const showOk = (msg) => { el.success.textContent = msg; el.success.classList.add("visible"); setTimeout(()=>el.success.classList.remove("visible"), 2200); };
  const zeroPad = n => String(n).padStart(2,"0");

  // ===== THEME =====
  const setTheme = m => { document.documentElement.setAttribute("data-theme", m); el.themeToggle.checked = (m==="dark"); };
  setTheme(state.theme || "light");
  el.themeToggle.addEventListener("change", ()=>{ state.theme = el.themeToggle.checked ? "dark":"light"; setTheme(state.theme); save(); });

  // ===== INIT FORM =====
  const syncTips = () => { el.tipPuffs.textContent = state.puffs; el.tipMed.textContent = state.med; };
  el.child.value=state.child; el.med.value=state.med; el.puffs.value=state.puffs; el.note.value=state.note;
  el.alarmTime.value=state.alarmTime; el.snoozeMin.value=state.snoozeMin;
  el.soundEnabled.checked=!!state.soundEnabled; el.notifyEnabled.checked=!!state.notifyEnabled;
  el.alarmSound.value=state.alarmSound||"chime"; el.alarmVolume.value=state.alarmVolume??0.9; syncTips();

  function toggleSoundTools(){
    el.voiceTools.classList.toggle("hidden", el.alarmSound.value!=="voice");
    el.fileTools.classList.toggle("hidden", el.alarmSound.value!=="file");
  }
  toggleSoundTools();

  el.cfgForm.addEventListener("input", ()=>{
    state.child = el.child.value.trim() || "Little Khanjar";
    state.med   = el.med.value.trim() || "Ventolin";
    state.puffs = Math.max(1, Math.min(12, +el.puffs.value || 2));
    state.note  = el.note.value.trim();
    state.alarmTime = el.alarmTime.value || "07:30";
    state.snoozeMin = +el.snoozeMin.value || 5;
    state.soundEnabled = !!el.soundEnabled.checked;
    state.notifyEnabled = !!el.notifyEnabled.checked;
    state.alarmSound = el.alarmSound.value;
    state.alarmVolume = +el.alarmVolume.value;
    save(); renderAlarmCard(); renderUI(); toggleSoundTools(); syncTips();
  });

  // ===== AUDIO =====
  let audioCtx=null, alarmLoopTimer=null, alarmAudioEl=null, alarmAudioURL=null;
  const ensureAudioContext=()=>{ if(!audioCtx) audioCtx = new (window.AudioContext||window.webkitAudioContext)(); return audioCtx; };
  const beep=(ctx,f=880,d=400,v=0.9)=>{ const o=ctx.createOscillator(), g=ctx.createGain(); o.type="sine"; o.frequency.value=f; const t=Math.max(0.05,Math.min(1,v))*0.6; g.gain.setValueAtTime(0.0001,ctx.currentTime); g.gain.exponentialRampToValueAtTime(t,ctx.currentTime+0.02); g.gain.exponentialRampToValueAtTime(0.0001,ctx.currentTime+d/1000); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime+d/1000+0.05); };
  const startPattern=(kind)=>{ if(!state.soundEnabled) return; const ctx=ensureAudioContext(); stopPattern();
    if(kind==="chime"){ beep(ctx,880,450,state.alarmVolume); alarmLoopTimer=setInterval(()=>{ beep(ctx,880,450,state.alarmVolume); setTimeout(()=>beep(ctx,660,350,state.alarmVolume),250); },1800); }
    else if(kind==="beep"){ beep(ctx,1000,220,state.alarmVolume); alarmLoopTimer=setInterval(()=>beep(ctx,1000,220,state.alarmVolume),600); }
    else if(kind==="birds"){ const chirp=()=>{ beep(ctx,2400,120,state.alarmVolume); setTimeout(()=>beep(ctx,1800,120,state.alarmVolume),120); setTimeout(()=>beep(ctx,2200,120,state.alarmVolume),260); }; chirp(); alarmLoopTimer=setInterval(chirp,1800); } };
  const stopPattern=()=>{ if(alarmLoopTimer){ clearInterval(alarmLoopTimer); alarmLoopTimer=null; } };
  const playBlobLoop=async(blob)=>{ if(!state.soundEnabled||!blob) return; stopBlob(); const url=URL.createObjectURL(blob); const a=new Audio(url); a.loop=true; a.volume=Math.max(0,Math.min(1,state.alarmVolume)); try{ await a.play(); }catch{} alarmAudioEl=a; alarmAudioURL=url; };
  const stopBlob=()=>{ if(alarmAudioEl){ alarmAudioEl.pause(); alarmAudioEl.currentTime=0; } if(alarmAudioURL) URL.revokeObjectURL(alarmAudioURL); alarmAudioEl=null; alarmAudioURL=null; };
  const stopAllSound=()=>{ stopPattern(); stopBlob(); };

  // ===== IndexedDB for audio blobs =====
  const idb={ db:null,
    open:()=>new Promise((res,rej)=>{ const req=indexedDB.open("asthma_buddy_audio",1); req.onupgradeneeded=e=>{ e.target.result.createObjectStore("sounds"); }; req.onsuccess=e=>{ idb.db=e.target.result; res(idb.db); }; req.onerror=()=>rej(req.error); }),
    put:async(k,b)=>{ const db=idb.db||await idb.open(); return new Promise((res,rej)=>{ const tx=db.transaction("sounds","readwrite"); tx.objectStore("sounds").put(b,k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); },
    get:async(k)=>{ const db=idb.db||await idb.open(); return new Promise((res,rej)=>{ const tx=db.transaction("sounds","readonly"); const rq=tx.objectStore("sounds").get(k); rq.onsuccess=()=>res(rq.result||null); rq.onerror=()=>rej(rq.error); }); },
    del:async(k)=>{ const db=idb.db||await idb.open(); return new Promise((res,rej)=>{ const tx=db.transaction("sounds","readwrite"); tx.objectStore("sounds").delete(k); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); }
  };

  // ===== Recording (codec picker for iOS) =====
  const pickMime = () => {
    const cand = [
      "audio/mp4",                       // m4a – best for iOS
      "audio/mp4;codecs=mp4a.40.2",
      "audio/aac",
      "audio/mpeg",                      // mp3
      "audio/webm;codecs=opus",         // Chrome
      "audio/webm"
    ];
    for (const t of cand) {
      try { if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) return t; } catch {}
    }
    return ""; // let browser decide
  };

  let recStream=null, rec=null, recChunks=[], meterRAF=null, analyser=null, mimeSel=pickMime();
  const updateRecStatus=async()=>{ const has=await idb.get("voice"); el.recStatus.textContent = has ? `Recording saved (${mimeSel||"auto"})` : "No recording saved yet."; el.recPlay.disabled=!has; el.recDelete.disabled=!has; };

  el.recStart.addEventListener("click", async ()=>{
    try{ recStream=await navigator.mediaDevices.getUserMedia({audio:true}); }catch{ alert("Microphone permission denied."); return; }
    const ctx=ensureAudioContext(); const src=ctx.createMediaStreamSource(recStream); analyser=ctx.createAnalyser(); analyser.fftSize=1024; src.connect(analyser);
    const draw=()=>{ const buf=new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(buf); let sum=0; for(let i=0;i<buf.length;i++){ const v=(buf[i]-128)/128; sum+=v*v; } const rms=Math.sqrt(sum/buf.length); el.recMeterBar.style.width=`${Math.min(100,Math.max(0,rms*150))}%`; meterRAF=requestAnimationFrame(draw); }; meterRAF=requestAnimationFrame(draw);

    recChunks=[]; try{
      rec=new MediaRecorder(recStream, mimeSel ? { mimeType: mimeSel } : undefined);
    }catch{ rec=new MediaRecorder(recStream); }
    rec.ondataavailable=e=>e.data&&recChunks.push(e.data);
    rec.onstop=async()=>{ cancelAnimationFrame(meterRAF); meterRAF=null; if(recStream){ recStream.getTracks().forEach(t=>t.stop()); recStream=null; } el.recStop.disabled=true;
      const type = rec.mimeType || mimeSel || "audio/mp4";
      const blob=new Blob(recChunks,{type});
      await idb.put("voice",blob); await updateRecStatus(); showOk("Recording saved");
    };
    rec.start(); el.recStart.disabled=true; el.recStop.disabled=false; el.recStatus.textContent="Recording… speak now.";
  });

  el.recStop.addEventListener("click", ()=>{ if(rec&&rec.state!=="inactive") rec.stop(); el.recStart.disabled=false; });
  el.recPlay.addEventListener("click", async ()=>{ const blob=await idb.get("voice"); if(!blob) return; const url=URL.createObjectURL(blob); const a=new Audio(url); a.volume=Math.max(0,Math.min(1,state.alarmVolume)); a.play().finally(()=>URL.revokeObjectURL(url)); });
  el.recDelete.addEventListener("click", async ()=>{ await idb.del("voice"); await updateRecStatus(); showOk("Recording deleted"); });

  // ===== File upload =====
  const updateFileStatus=async()=>{ const blob=await idb.get("file"); el.fileStatus.textContent = blob ? "File saved." : "No file uploaded."; el.filePlay.disabled=!blob; el.fileDelete.disabled=!blob; };
  el.fileInput.addEventListener("change", async (e)=>{ const f=e.target.files?.[0]; if(!f) return; await idb.put("file",f); await updateFileStatus(); showOk("Audio file saved"); e.target.value=""; });
  el.filePlay.addEventListener("click", async ()=>{ const blob=await idb.get("file"); if(!blob) return; const url=URL.createObjectURL(blob); const a=new Audio(url); a.volume=Math.max(0,Math.min(1,state.alarmVolume)); a.play().finally(()=>URL.revokeObjectURL(url)); });
  el.fileDelete.addEventListener("click", async ()=>{ await idb.del("file"); await updateFileStatus(); showOk("Audio file deleted"); });

  // ===== Notifications =====
  const ensureNotifyPermission=async()=>{ if(!state.notifyEnabled) return false; if(!("Notification" in window)) return false; if(Notification.permission==="granted") return true; try{ const p=await Notification.requestPermission(); return p==="granted"; }catch{ return false; } };
  const notify=async(title,body)=>{ if(!(await ensureNotifyPermission())) return; try{ const n=new Notification(title,{body}); n.onclick=()=>window.focus(); }catch{} };

  // ===== Alarm overlay =====
  const renderAlarmCard=()=>{ document.getElementById("alarm-puffs").textContent=state.puffs; document.getElementById("alarm-med").textContent=state.med; };
  renderAlarmCard();
  const openAlarm=async()=>{ renderAlarmCard(); el.alarmOverlay.classList.remove("hidden"); const k=state.alarmSound; if(k==="voice"){ const b=await idb.get("voice"); if(b) await playBlobLoop(b); else startPattern("chime"); } else if(k==="file"){ const b=await idb.get("file"); if(b) await playBlobLoop(b); else startPattern("chime"); } else { startPattern(k); } };
  const closeAlarm=()=>{ el.alarmOverlay.classList.add("hidden"); stopAllSound(); };

  const markTaken=(when=new Date())=>{ const key=when.toISOString().slice(0,10); state.logs[key]={ taken:true, time:fmtTime(when), puffs:state.puffs, med:state.med, note:state.note }; state.lastAlarmFire=key; state.nextSnoozeAt=null; save(); closeAlarm(); showOk("Marked as taken — great job!"); renderUI(); };
  const snooze=()=>{ const ms=(+state.snoozeMin||5)*60*1000; state.nextSnoozeAt=Date.now()+ms; save(); closeAlarm(); showOk(`Snoozed for ${state.snoozeMin} min`); };

  // ===== Main loop (foreground) =====
  const timeToMsToday=(t)=>{ const [hh,mm]=(t||"07:30").split(":").map(x=>+x); const now=new Date(); const d=new Date(now.getFullYear(),now.getMonth(),now.getDate(),hh,mm,0,0); return d.getTime(); };
  const loop=async()=>{ const now=Date.now(); const todayKey=today();
    if(state.nextSnoozeAt && now>=state.nextSnoozeAt){ state.nextSnoozeAt=null; save(); await notify("Asthma Buddy","Snooze ended — time to take your puffs."); openAlarm(); return; }
    const done=!!state.logs[todayKey]?.taken; const alarmMs=timeToMsToday(state.alarmTime); const windowMs=60*1000;
    if(!done && (!state.lastAlarmFire || state.lastAlarmFire!==todayKey)){ if(Math.abs(now-alarmMs)<=windowMs){ state.lastAlarmFire=todayKey; save(); await notify("Asthma Buddy","It’s time for the morning puff."); openAlarm(); } }
  };
  setInterval(loop, 4000);

  // ===== Calendar & Logs =====
  const renderCalendar=()=>{ const mount=el.cal; mount.innerHTML=""; const now=new Date(); const y=now.getFullYear(), m=now.getMonth(); const first=new Date(y,m,1); const start=first.getDay(); const days=new Date(y,m+1,0).getDate(); const padStart=(start+6)%7;
    ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d=>{ const h=document.createElement("div"); h.className="cal-cell"; h.style.background="transparent"; h.style.border="none"; h.innerHTML=`<div class="d" style="color:var(--muted)">${d}</div>`; mount.appendChild(h); });
    for(let i=0;i<padStart;i++){ const c=document.createElement("div"); c.className="cal-cell"; c.style.visibility="hidden"; mount.appendChild(c); }
    for(let day=1; day<=days; day++){ const c=document.createElement("div"); c.className="cal-cell"; const d=new Date(y,m,day); const key=d.toISOString().slice(0,10); const taken=!!state.logs[key]?.taken; if(key===today()) c.classList.add("today"); c.innerHTML=`<div class="d">${day}</div>${taken?`<div class="ok"><i class="fa-solid fa-check"></i></div>`:`<div class="miss"><i class="fa-regular fa-circle-xmark"></i></div>`}`; c.addEventListener("click",()=>{ if(taken){ if(confirm(`Clear mark for ${key}?`)){ delete state.logs[key]; save(); renderUI(); } } else { state.logs[key]={ taken:true, time:state.alarmTime, puffs:state.puffs, med:state.med, note:state.note }; save(); renderUI(); } }); mount.appendChild(c); }
  };

  const renderLogs=()=>{ const list=el.logList; list.innerHTML=""; const items=Object.entries(state.logs).map(([d,info])=>({date:d,...info})).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,60);
    items.forEach(it=>{ const row=document.createElement("div"); row.className="log-card"; row.innerHTML=`<div><div><strong>${it.date}</strong> · ${it.time||""}</div><div class="meta">${it.puffs} puff(s) of ${it.med}${it.note?` · ${it.note}`:""}</div></div><div class="actions"><button data-edit="${it.date}"><i class="fa-regular fa-pen-to-square"></i></button><button data-del="${it.date}"><i class="fa-regular fa-trash-can"></i></button></div>`; row.addEventListener("click",(e)=>{ const del=e.target.closest("[data-del]"); const edit=e.target.closest("[data-edit]"); if(del){ delete state.logs[del.dataset.del]; save(); renderUI(); } if(edit){ const d=edit.dataset.edit; const cur=state.logs[d]; const newTime=prompt(`Edit time for ${d}`, cur.time||"07:30"); if(newTime!==null){ cur.time=newTime; save(); renderUI(); } } }); list.appendChild(row); });
    const count=list.children.length; if(count>3){ const first=list.querySelector(".log-card"); const h=first?first.getBoundingClientRect().height:64; const gap=8; list.classList.add("scrollable"); list.style.maxHeight=`${Math.round(h*3 + gap*2)}px`; } else { list.classList.remove("scrollable"); list.style.maxHeight=""; }
  };

  const calcStreak=()=>{ let s=0; let d=new Date(); for(;;){ const k=d.toISOString().slice(0,10); if(state.logs[k]?.taken){ s++; d.setDate(d.getDate()-1); } else break; } return s; };
  const countThisMonth=()=>{ const now=new Date(); const ym=`${now.getFullYear()}-${zeroPad(now.getMonth()+1)}`; return Object.keys(state.logs).filter(k=>k.startsWith(ym)&&state.logs[k].taken).length; };
  const renderSummary=()=>{ el.streak.textContent=calcStreak(); el.thisMonth.textContent=countThisMonth(); const last=Object.keys(state.logs).filter(k=>state.logs[k].taken).sort().pop(); el.lastTaken.textContent=last?`${last} · ${state.logs[last].time||""}`:"—"; };
  const renderUI=()=>{ renderSummary(); renderCalendar(); renderLogs(); };

  // Buttons
  el.test.addEventListener("click", async ()=>{ await ensureNotifyPermission(); openAlarm(); });
  el.saveICS.addEventListener("click", ()=>{ const ics=makeICSDaily(state.child||"Child","Morning asthma puffs",state.alarmTime); const blob=new Blob([ics],{type:"text/calendar;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="asthma-buddy-reminder.ics"; a.click(); URL.revokeObjectURL(url); });
  el.markNow.addEventListener("click", ()=>markTaken(new Date()));
  el.clearToday.addEventListener("click", ()=>{ const k=today(); delete state.logs[k]; save(); renderUI(); });
  el.exportCSV.addEventListener("click", ()=>{ const rows=[["Date","Time","Puffs","Medicine","Note"]]; Object.entries(state.logs).sort(([a],[b])=>a.localeCompare(b)).forEach(([d,info])=>rows.push([d,info.time||"",info.puffs,info.med,(info.note||"").replace(/,/g,";")])); const csv=rows.map(r=>r.join(",")).join("\n"); const blob=new Blob([csv],{type:"text/csv;charset=utf-8"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="asthma-log.csv"; a.click(); URL.revokeObjectURL(url); });
  el.printBtn.addEventListener("click", ()=>window.print());
  el.alarmTaken.addEventListener("click", ()=>markTaken(new Date()));
  el.alarmSnooze.addEventListener("click", ()=>snooze());
  el.alarmStop.addEventListener("click", ()=>stopAllSound());

  // Init
  (async ()=>{ await updateRecStatus(); await updateFileStatus(); })();
  renderUI(); loop(); setInterval(loop, 4000);

  // ===== ICS helpers =====
  function makeICSDaily(person,title,timeHHMM){
    const uid = cryptoRandom()+"@asthma-buddy";
    const dtStamp = toICSDateTime(new Date());
    const [hh,mm] = (timeHHMM||"07:30").split(":").map(Number);
    const d = new Date(); d.setHours(hh,mm,0,0);
    const DTSTART = toICSDateTime(d,true);
    return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Asthma Buddy//EN","CALSCALE:GREGORIAN","BEGIN:VEVENT",`UID:${uid}`,`DTSTAMP:${dtStamp}`,`SUMMARY:${escapeICS(`${title} – ${person}`)}`,`DESCRIPTION:${escapeICS("Daily reminder created by Asthma Buddy")}`,`DTSTART:${DTSTART}`,"RRULE:FREQ=DAILY","END:VEVENT","END:VCALENDAR"].join("\r\n");
  }
  function escapeICS(s){ return (s||"").replace(/,/g,"\\,").replace(/;/g,"\\;").replace(/\n/g,"\\n"); }
  function toICSDateTime(d,floating=false){ const y=d.getFullYear(), m=zeroPad(d.getMonth()+1), dd=zeroPad(d.getDate()); const hh=zeroPad(d.getHours()), mm=zeroPad(d.getMinutes()), ss=zeroPad(d.getSeconds()); return floating?`${y}${m}${dd}T${hh}${mm}${ss}`:`${y}${m}${dd}T${hh}${mm}${ss}Z`; }
  function cryptoRandom(){ try{ return [...crypto.getRandomValues(new Uint8Array(8))].map(b=>b.toString(16).padStart(2,"0")).join(""); }catch{ return Math.random().toString(16).slice(2); } }
})();
