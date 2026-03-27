// ===== FitBurn v3 — Cloud Sync Edition =====
const App = (() => {
    const STORAGE_KEY = 'fitburn_data_v3';
    const EXERCISE_TYPES = {
        running:{name:'跑步',emoji:'🏃',met:9.8,hasDistance:true},walking:{name:'走路',emoji:'🚶',met:3.8,hasDistance:true},
        cycling:{name:'騎自行車',emoji:'🚴',met:7.5,hasDistance:true},swimming:{name:'游泳',emoji:'🏊',met:8.0,hasDistance:true},
        hiit:{name:'HIIT',emoji:'🔥',met:12.0,hasDistance:false},weight:{name:'重量訓練',emoji:'🏋️',met:6.0,hasDistance:false},
        yoga:{name:'瑜伽',emoji:'🧘',met:3.0,hasDistance:false},jump_rope:{name:'跳繩',emoji:'⏭️',met:11.0,hasDistance:false},
        dance:{name:'跳舞',emoji:'💃',met:6.5,hasDistance:false},basketball:{name:'籃球',emoji:'🏀',met:8.0,hasDistance:false},
        badminton:{name:'羽毛球',emoji:'🏸',met:5.5,hasDistance:false},tennis:{name:'網球',emoji:'🎾',met:7.0,hasDistance:false},
        hiking:{name:'爬山',emoji:'🥾',met:6.0,hasDistance:true},stair:{name:'爬樓梯',emoji:'🪜',met:9.0,hasDistance:false},
        elliptical:{name:'橢圓機',emoji:'🏃‍♂️',met:5.0,hasDistance:false},rowing:{name:'划船機',emoji:'🚣',met:7.0,hasDistance:false},
    };
    const ACT_MULT = {sedentary:{name:'久坐',f:1.2},light:{name:'輕度活動',f:1.375},moderate:{name:'中度活動',f:1.55},active:{name:'高度活動',f:1.725},very_active:{name:'非常活躍',f:1.9}};
    const GOAL_DEF = {maintain:{name:'維持體重',d:0},slow:{name:'慢速減重',d:250},moderate:{name:'適度減重',d:500},fast:{name:'快速減重',d:750}};
    const QUOTES = ['💪 每一步都算數，堅持下去就是勝利！','🌟 今天的汗水，是明天的自信！','🔥 你比昨天更強了！','🏆 成功不是終點，而是每天的堅持！',
        '✨ 最好的投資就是投資自己的健康！','🚀 不要等待完美時刻，現在就開始！','🎯 小小的進步也是進步！','💫 健康的身體是最珍貴的財富！'];

    let currentDate = todayStr(), chart = null, weightChart = null, pendingAnalysis = null;
    let obStep = 1, obData = {gender:'',age:0,height:0,weight:0,activity:'',goal:'moderate',apiKey:''};
    let editingField = '', historyDays = 14;

    // ===== DATA =====
    function load() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultData(); } catch { return defaultData(); } }
    function save(d) { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); }
    function defaultData() { return { profile:{gender:'',age:0,height:0,weight:0,activity:'moderate',goal:'moderate',apiKey:''},onboarded:false,userId:'',scriptUrl:'',records:{},weightLog:[],waterLog:{},lastSync:'' }; }
    function dayRec(date) { const d=load(); if(!d.records[date]){d.records[date]={foods:[],exercises:[]};save(d);} return d.records[date]; }

    // ===== HELPERS =====
    function todayStr() { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
    function fmtDate(s) { if(s===todayStr()) return '今天'; const d=new Date(s); const y=new Date();y.setDate(y.getDate()-1); const ys=`${y.getFullYear()}-${String(y.getMonth()+1).padStart(2,'0')}-${String(y.getDate()).padStart(2,'0')}`; if(s===ys) return '昨天'; return `${d.getMonth()+1}/${d.getDate()} (${['日','一','二','三','四','五','六'][d.getDay()]})`; }
    function genId() { return Date.now().toString(36)+Math.random().toString(36).substr(2,5); }
    function nowTime() { const d=new Date(); return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }

    // ===== BMR / TDEE / BMI =====
    function calcBMR(p) { if(!p.gender||!p.weight||!p.height||!p.age) return 0; return Math.round(p.gender==='male' ? 10*p.weight+6.25*p.height-5*p.age+5 : 10*p.weight+6.25*p.height-5*p.age-161); }
    function calcTDEE(p) { return Math.round(calcBMR(p)*(ACT_MULT[p.activity]?.f||1.55)); }
    function calcTarget(p) { return Math.max(1200, calcTDEE(p)-(GOAL_DEF[p.goal]?.d||500)); }
    function calcBMI(p) { if(!p.weight||!p.height) return 0; return (p.weight/((p.height/100)**2)).toFixed(1); }
    function bmiCat(bmi) { if(bmi<18.5) return '過輕'; if(bmi<24) return '正常'; if(bmi<27) return '過重'; return '肥胖'; }

    // ===== CLOUD API =====
    async function cloudCall(action, data={}) {
        const d = load();
        if (!d.scriptUrl) return null;
        try {
            const body = { action, userId: d.userId, ...data };
            const res = await fetch(d.scriptUrl, { method:'POST', body:JSON.stringify(body), headers:{'Content-Type':'text/plain'}, redirect:'follow' });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return await res.json();
        } catch(e) { console.warn('Cloud API error:', e); return null; }
    }

    function showSyncBar(msg, type='sync') {
        const bar = document.getElementById('syncBar');
        bar.style.display = 'flex';
        bar.className = `sync-bar ${type}`;
        document.getElementById('syncText').textContent = msg;
        if (type !== 'sync') setTimeout(() => { bar.style.display = 'none'; }, 3000);
    }

    function hideSyncBar() { document.getElementById('syncBar').style.display = 'none'; }

    // ===== INIT =====
    function init() {
        const d = load();
        if (!d.userId && !d.onboarded) { showScreen('loginScreen'); return; }
        if (!d.onboarded) { showScreen('onboardingScreen'); renderObStep(); return; }
        showScreen('mainScreen');
        renderAll();
        const el=document.getElementById('motivationalQuote'); if(el) el.textContent=QUOTES[Math.floor(Math.random()*QUOTES.length)];
        const ts=document.getElementById('exerciseType'); if(ts) ts.addEventListener('change',updateExercisePreview);
        const di=document.getElementById('exerciseDuration'); if(di) di.addEventListener('input',updateExercisePreview);
        // Restore saved script URL to login field
        if(d.scriptUrl){const su=document.getElementById('loginScriptUrl');if(su)su.value=d.scriptUrl;}
    }

    function showScreen(id) { document.querySelectorAll('.screen').forEach(s=>s.style.display='none'); document.getElementById(id).style.display=''; }

    // ===== LOGIN =====
    function switchLoginTab(tab) {
        document.querySelectorAll('.login-tab').forEach(t=>t.classList.remove('active'));
        document.querySelector(`.login-tab:${tab==='login'?'first':'last'}-child`).classList.add('active');
        document.getElementById('loginForm').style.display = tab==='login'?'':'none';
        document.getElementById('registerForm').style.display = tab==='register'?'':'none';
    }

    async function doLogin() {
        const userId = document.getElementById('loginUserId').value.trim();
        const scriptUrl = document.getElementById('loginScriptUrl').value.trim();
        if (!userId) { toast('⚠️ 請輸入帳號'); return; }
        const d = load();
        d.userId = userId; d.scriptUrl = scriptUrl; save(d);
        if (scriptUrl) {
            showSyncBar('登入中...');
            const res = await cloudCall('login', { userId });
            hideSyncBar();
            if (res?.success) {
                d.profile = res.profile; d.onboarded = true; save(d);
                showScreen('mainScreen'); renderAll(); toast('✅ 登入成功！');
                // Background sync
                syncFromCloud();
                return;
            } else if (res) { toast('⚠️ ' + (res.error||'登入失敗')); return; }
        }
        // Offline or no cloud — check local
        if (d.onboarded) { showScreen('mainScreen'); renderAll(); toast('✅ 離線模式登入'); }
        else { showScreen('onboardingScreen'); renderObStep(); }
    }

    async function doRegister() {
        const userId = document.getElementById('regUserId').value.trim();
        const scriptUrl = document.getElementById('loginScriptUrl').value.trim();
        if (!userId || userId.length < 2) { toast('⚠️ 帳號至少需要 2 個字元'); return; }
        const d = load(); d.userId = userId; d.scriptUrl = scriptUrl; save(d);
        if (scriptUrl) {
            showSyncBar('註冊中...');
            const res = await cloudCall('register', { userId });
            hideSyncBar();
            if (res?.success) { toast('✅ 註冊成功！'); showScreen('onboardingScreen'); renderObStep(); return; }
            else if (res) { toast('⚠️ ' + (res.error||'註冊失敗')); return; }
        }
        showScreen('onboardingScreen'); renderObStep();
    }

    function useOffline() {
        const d = load(); d.userId = 'local_' + Date.now(); d.scriptUrl = ''; save(d);
        showScreen('onboardingScreen'); renderObStep();
    }

    function showSetupGuide() { document.getElementById('setupGuideModal').style.display = 'flex'; }

    function logout() {
        if (!confirm('確定要登出嗎？本地資料會保留。')) return;
        const d = load(); d.userId = ''; d.onboarded = false; save(d);
        location.reload();
    }

    // ===== ONBOARDING (same as before but with cloud save) =====
    function renderObStep() {
        document.querySelectorAll('.onboarding-step').forEach(s=>s.classList.remove('active'));
        document.querySelector(`.onboarding-step[data-step="${obStep}"]`)?.classList.add('active');
        document.querySelectorAll('.step-dot').forEach(dot=>{const s=parseInt(dot.dataset.step);dot.classList.toggle('active',s===obStep);dot.classList.toggle('done',s<obStep);});
        document.getElementById('obBack').style.visibility = obStep===1?'hidden':'visible';
        document.getElementById('obNext').innerHTML = obStep===4 ? '<span class="material-symbols-rounded">check</span> 開始使用' : '下一步 <span class="material-symbols-rounded">arrow_forward</span>';
        if (obStep===4) updateGoalDeficits();
    }
    function selectGender(g) { obData.gender=g; document.querySelectorAll('.gender-option').forEach(el=>el.classList.toggle('selected',el.dataset.gender===g)); }
    function selectActivity(l) { obData.activity=l; document.querySelectorAll('.activity-option').forEach(el=>el.classList.toggle('selected',el.dataset.level===l)); }
    function selectGoal(g) { obData.goal=g; document.querySelectorAll('.goal-option').forEach(el=>el.classList.toggle('selected',el.dataset.goal===g)); }
    function updateGoalDeficits() {
        const tdee=calcTDEE(obData);
        document.getElementById('deficitMaintain').textContent=`${tdee} kcal`;
        document.getElementById('deficitSlow').textContent=`${Math.max(1200,tdee-250)} kcal`;
        document.getElementById('deficitModerate').textContent=`${Math.max(1200,tdee-500)} kcal`;
        document.getElementById('deficitFast').textContent=`${Math.max(1200,tdee-750)} kcal`;
    }

    async function obNext() {
        if(obStep===1 && !obData.gender){toast('⚠️ 請選擇性別');return;}
        if(obStep===2){obData.age=parseInt(document.getElementById('obAge').value)||0;obData.height=parseFloat(document.getElementById('obHeight').value)||0;obData.weight=parseFloat(document.getElementById('obWeight').value)||0;
            if(!obData.age||obData.age<10){toast('⚠️ 請輸入有效的年齡');return;} if(!obData.height||obData.height<100){toast('⚠️ 請輸入有效的身高');return;} if(!obData.weight||obData.weight<30){toast('⚠️ 請輸入有效的體重');return;}}
        if(obStep===3 && !obData.activity){toast('⚠️ 請選擇活動量');return;}
        if(obStep===4){
            obData.apiKey=document.getElementById('obApiKey').value.trim();
            const d=load(); d.profile={...obData}; d.onboarded=true;
            if(obData.weight) d.weightLog=[{date:todayStr(),weight:obData.weight}];
            save(d);
            // Cloud save
            if(d.scriptUrl) { cloudCall('saveProfile',{...d.profile}); if(obData.weight) cloudCall('saveWeight',{date:todayStr(),weight:obData.weight}); }
            showScreen('mainScreen'); renderAll(); toast('🎉 設定完成！開始你的健康之旅吧！');
            // Setup listeners after entering main screen
            const ts=document.getElementById('exerciseType');if(ts)ts.addEventListener('change',updateExercisePreview);
            const di=document.getElementById('exerciseDuration');if(di)di.addEventListener('input',updateExercisePreview);
            const el=document.getElementById('motivationalQuote');if(el)el.textContent=QUOTES[Math.floor(Math.random()*QUOTES.length)];
            return;
        }
        obStep++; renderObStep();
    }
    function obBack() { if(obStep>1){obStep--;renderObStep();} }

    // ===== PAGE NAV =====
    function switchPage(pageId) {
        document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
        document.getElementById(pageId).classList.add('active');
        document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
        const nb=document.querySelector(`.nav-item[data-page="${pageId}"]`); if(nb)nb.classList.add('active');
        window.scrollTo({top:0,behavior:'smooth'});
        if(pageId==='pageCharts') renderChartsPage();
        if(pageId==='pageProfile') renderProfilePage();
        if(pageId==='pageHistory') renderHistoryPage();
    }

    // ===== RENDER ALL =====
    function renderAll() { renderDate(); renderProfileBanner(); renderDashboard(); renderFoodList(); renderExerciseList(); updateCloudBadge(); }

    function prevDay() { const d=new Date(currentDate);d.setDate(d.getDate()-1);currentDate=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;renderAll(); }
    function nextDay() { if(currentDate>=todayStr()) return; const d=new Date(currentDate);d.setDate(d.getDate()+1);currentDate=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;renderAll(); }
    function renderDate() { document.getElementById('dateDisplay').textContent=fmtDate(currentDate); }

    function renderProfileBanner() {
        const d=load(),p=d.profile,bmr=calcBMR(p),tdee=calcTDEE(p),bmi=calcBMI(p);
        document.getElementById('profileAvatar').textContent=p.gender==='female'?'👩':'👨';
        const h=new Date().getHours(); document.getElementById('profileGreeting').textContent=`${h<12?'早安':h<18?'午安':'晚安'}！加油💪`;
        document.getElementById('profileStats').textContent=`BMR: ${bmr} | TDEE: ${tdee}`;
        const bmiEl=document.getElementById('profileBMI'); bmiEl.querySelector('.bmi-value').textContent=bmi||'--'; bmiEl.querySelector('.bmi-label').textContent=bmi?`BMI·${bmiCat(parseFloat(bmi))}`:'BMI';
    }

    function renderDashboard() {
        const d=load(),p=d.profile,rec=dayRec(currentDate);
        const ti=rec.foods.reduce((s,f)=>s+(f.calories||0),0), tb=rec.exercises.reduce((s,e)=>s+(e.calories||0),0), tgt=calcTarget(p), rem=tgt-ti+tb;
        animateValue('totalIntake',ti); animateValue('totalBurn',tb); animateValue('netCalories',Math.max(0,rem));
        document.getElementById('targetDisplay').textContent=tgt;
        const pct=tgt>0?Math.min((ti/tgt)*100,115):0, deg=Math.min((pct/100)*360,360);
        const ring=document.getElementById('calorieRing');
        let rc='var(--accent-green)'; if(pct>85)rc='var(--accent-orange)'; if(pct>100)rc='var(--accent-red)';
        ring.style.background=`conic-gradient(${rc} 0deg,${rc} ${deg}deg,rgba(255,255,255,0.05) ${deg}deg,rgba(255,255,255,0.05) 360deg)`;
        const rv=document.getElementById('netCalories'); rv.style.color=rem<0?'var(--accent-red)':rem<300?'var(--accent-orange)':'var(--text-primary)';
        const st=document.getElementById('ringStatus');
        if(ti===0&&tb===0) st.innerHTML='<span class="material-symbols-rounded">emoji_events</span> 開始記錄今天的飲食和運動吧！';
        else if(rem>0) st.innerHTML=`<span class="material-symbols-rounded">thumb_up</span> 還可以攝取 ${rem} kcal`;
        else st.innerHTML=`<span class="material-symbols-rounded">warning</span> 已超過目標 ${Math.abs(rem)} kcal`;
        document.querySelector('.ring-label').textContent=rem>=0?'剩餘可攝取 kcal':'已超出 kcal';
    }

    function animateValue(id,target) { const el=document.getElementById(id);if(!el)return;const cur=parseInt(el.textContent)||0;if(cur===target)return;const diff=target-cur,steps=20,sv=diff/steps;let step=0;const t=setInterval(()=>{step++;if(step>=steps){el.textContent=target;clearInterval(t);}else el.textContent=Math.round(cur+sv*step);},25); }

    function updateCloudBadge() {
        const d=load(), badge=document.getElementById('cloudBadge');
        if(!badge) return;
        if(d.scriptUrl) { badge.className='cloud-badge'; badge.innerHTML='<span class="material-symbols-rounded">cloud_done</span><span>已連線</span>'; }
        else { badge.className='cloud-badge offline'; badge.innerHTML='<span class="material-symbols-rounded">cloud_off</span><span>離線</span>'; }
    }

    // ===== FOOD PHOTO =====
    async function handleFoodPhoto(event) {
        const file=event.target.files[0]; if(!file) return; event.target.value='';
        const d=load(); if(!d.profile.apiKey){toast('⚠️ 請先在「我的」頁面設定 Gemini API Key');return;}
        const base64=await fileToBase64(file), imageUrl=URL.createObjectURL(file);
        const modal=document.getElementById('foodAnalysisModal'), content=document.getElementById('foodAnalysisContent');
        content.innerHTML=`<img src="${imageUrl}" class="analysis-image"><div class="analysis-loading"><div class="analysis-spinner"></div><p class="pulse">AI 正在分析食物和熱量...</p></div>`;
        modal.style.display='flex';
        try {
            const result=await analyzeWithGemini(d.profile.apiKey,base64,file.type);
            pendingAnalysis={foods:result,imageUrl:base64}; renderAnalysisResult(result,imageUrl);
        } catch(err) { content.innerHTML=`<img src="${imageUrl}" class="analysis-image"><div class="analysis-loading"><p style="color:var(--accent-red)">❌ ${err.message}</p><div class="analysis-actions"><button class="btn btn-secondary" onclick="App.closeFoodAnalysis()">關閉</button></div></div>`; }
    }
    function fileToBase64(file) { return new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);}); }
    async function analyzeWithGemini(apiKey,base64,mimeType) {
        const url=`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const prompt='你是專業營養師。分析食物圖片，辨識所有食物並估算熱量。以JSON格式回覆：[{"name":"食物名稱","portion":"份量","calories":數字}]。calories必須是整數。';
        const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt},{inlineData:{mimeType:mimeType||'image/jpeg',data:base64}}]}],generationConfig:{temperature:0.2,maxOutputTokens:1024}})});
        if(!res.ok){const e=await res.json().catch(()=>({}));throw new Error(e.error?.message||`API錯誤(${res.status})`);}
        const r=await res.json(),text=r.candidates?.[0]?.content?.parts?.[0]?.text||'',m=text.match(/\[[\s\S]*\]/);
        if(!m) throw new Error('無法解析AI回覆'); return JSON.parse(m[0]);
    }
    function renderAnalysisResult(foods,imageUrl) {
        const content=document.getElementById('foodAnalysisContent'), tc=foods.reduce((s,f)=>s+(f.calories||0),0);
        content.innerHTML=`<img src="${imageUrl}" class="analysis-image"><div class="analysis-results">${foods.map(f=>`<div class="analysis-food-item"><div><div class="analysis-food-name">${f.name}</div><div class="analysis-food-portion">${f.portion||''}</div></div><div class="analysis-food-cal">${f.calories} kcal</div></div>`).join('')}<div class="analysis-total"><span>總計</span><span class="analysis-total-val">${tc} kcal</span></div></div><div class="analysis-actions"><button class="btn btn-secondary" onclick="App.closeFoodAnalysis()">取消</button><button class="btn btn-primary" onclick="App.confirmFoodAnalysis()"><span class="material-symbols-rounded">add</span> 加入紀錄</button></div>`;
    }
    function confirmFoodAnalysis() {
        if(!pendingAnalysis) return; const d=load(),rec=dayRec(currentDate);
        pendingAnalysis.foods.forEach(food=>{ if(food.calories>0){ const imgData=pendingAnalysis.imageUrl?`data:image/jpeg;base64,${pendingAnalysis.imageUrl}`:'';
            const item={id:genId(),name:food.name,portion:food.portion||'',calories:food.calories,time:nowTime(),imageUrl:imgData};
            rec.foods.push(item);
            if(d.scriptUrl) cloudCall('saveFood',{date:currentDate,...item,imageData:pendingAnalysis.imageUrl||''}); }});
        d.records[currentDate]=rec; save(d); pendingAnalysis=null; closeFoodAnalysis(); renderAll(); toast('✅ 已新增食物紀錄');
    }
    function closeFoodAnalysis() { document.getElementById('foodAnalysisModal').style.display='none'; pendingAnalysis=null; }

    // ===== MANUAL FOOD =====
    function openManualFood() { document.getElementById('manualFoodName').value=''; document.getElementById('manualFoodCalories').value=''; document.getElementById('manualFoodModal').style.display='flex'; setTimeout(()=>document.getElementById('manualFoodName').focus(),100); }
    function closeManualFood() { document.getElementById('manualFoodModal').style.display='none'; }
    function addManualFood() {
        const name=document.getElementById('manualFoodName').value.trim(), cal=parseInt(document.getElementById('manualFoodCalories').value);
        if(!name){toast('⚠️ 請輸入食物名稱');return;} if(!cal||cal<=0){toast('⚠️ 請輸入有效的熱量');return;}
        const d=load(),rec=dayRec(currentDate),item={id:genId(),name,calories:cal,time:nowTime(),imageUrl:''};
        rec.foods.push(item); d.records[currentDate]=rec; save(d);
        if(d.scriptUrl) cloudCall('saveFood',{date:currentDate,...item,imageData:''});
        closeManualFood(); renderAll(); toast('✅ 已新增食物紀錄');
    }

    // ===== EXERCISE =====
    function openExercise() { document.getElementById('exerciseType').value='running';document.getElementById('exerciseDuration').value='';document.getElementById('exerciseDistance').value='';document.getElementById('exerciseDistanceGroup').style.display='';document.getElementById('exerciseCalValue').textContent='0';document.getElementById('exerciseModal').style.display='flex';setTimeout(()=>document.getElementById('exerciseDuration').focus(),100); }
    function closeExercise() { document.getElementById('exerciseModal').style.display='none'; }
    function updateExercisePreview() {
        const type=document.getElementById('exerciseType').value, dur=parseInt(document.getElementById('exerciseDuration').value)||0, info=EXERCISE_TYPES[type], d=load(), w=d.profile.weight||70;
        document.getElementById('exerciseCalValue').textContent=Math.round(info.met*w*(dur/60));
        document.getElementById('exerciseDistanceGroup').style.display=info.hasDistance?'':'none';
    }
    function addExercise() {
        const type=document.getElementById('exerciseType').value, dur=parseInt(document.getElementById('exerciseDuration').value), dist=parseFloat(document.getElementById('exerciseDistance').value)||0;
        if(!dur||dur<=0){toast('⚠️ 請輸入運動時長');return;}
        const d=load(),info=EXERCISE_TYPES[type],w=d.profile.weight||70,cal=Math.round(info.met*w*(dur/60));
        const rec=dayRec(currentDate),item={id:genId(),type,typeName:info.name,emoji:info.emoji,duration:dur,distance:dist||null,calories:cal,time:nowTime()};
        rec.exercises.push(item); d.records[currentDate]=rec; save(d);
        if(d.scriptUrl) cloudCall('saveExercise',{date:currentDate,...item});
        closeExercise(); renderAll(); toast(`✅ ${info.emoji} ${info.name} ${dur}分鐘 消耗 ${cal} kcal`);
    }

    // ===== RENDER LISTS =====
    function renderFoodList() {
        const rec=dayRec(currentDate),c=document.getElementById('foodList'); document.getElementById('foodCount').textContent=`${rec.foods.length} 筆`;
        if(!rec.foods.length){c.innerHTML='<div class="empty-state"><span class="material-symbols-rounded">no_meals</span><p>還沒有紀錄</p></div>';return;}
        c.innerHTML=rec.foods.map(f=>`<div class="record-item">${f.imageUrl?`<img src="${f.imageUrl}" class="record-thumb">`:'<div class="record-emoji food-emoji">🍱</div>'}<div class="record-info"><div class="record-name">${f.name}</div><div class="record-meta">${f.time||''}${f.portion?' · '+f.portion:''}</div></div><div class="record-calories intake">+${f.calories}</div><button class="record-delete" onclick="App.deleteFood('${f.id}')"><span class="material-symbols-rounded">delete</span></button></div>`).join('');
    }
    function renderExerciseList() {
        const rec=dayRec(currentDate),c=document.getElementById('exerciseList'); document.getElementById('exerciseCount').textContent=`${rec.exercises.length} 筆`;
        if(!rec.exercises.length){c.innerHTML='<div class="empty-state"><span class="material-symbols-rounded">directions_run</span><p>記錄運動看看消耗了多少熱量！</p></div>';return;}
        c.innerHTML=rec.exercises.map(ex=>{let m=`${ex.time||''} · ${ex.duration}分鐘`;if(ex.distance)m+=` · ${ex.distance}km`;return `<div class="record-item"><div class="record-emoji exercise-emoji">${ex.emoji||'💪'}</div><div class="record-info"><div class="record-name">${ex.typeName||ex.type}</div><div class="record-meta">${m}</div></div><div class="record-calories burn">-${ex.calories}</div><button class="record-delete" onclick="App.deleteExercise('${ex.id}')"><span class="material-symbols-rounded">delete</span></button></div>`;}).join('');
    }
    function deleteFood(id) { const d=load(),rec=d.records[currentDate]; if(!rec) return; rec.foods=rec.foods.filter(f=>f.id!==id); save(d); if(d.scriptUrl)cloudCall('deleteFood',{id,date:currentDate}); renderAll(); toast('🗑️ 已刪除'); }
    function deleteExercise(id) { const d=load(),rec=d.records[currentDate]; if(!rec) return; rec.exercises=rec.exercises.filter(e=>e.id!==id); save(d); if(d.scriptUrl)cloudCall('deleteExercise',{id,date:currentDate}); renderAll(); toast('🗑️ 已刪除'); }

    // ===== WEIGHT / WATER =====
    function openWeightLog() { document.getElementById('weightLogInput').value=load().profile.weight||''; document.getElementById('weightLogModal').style.display='flex'; }
    function closeWeightLog() { document.getElementById('weightLogModal').style.display='none'; }
    function saveWeightLog() {
        const w=parseFloat(document.getElementById('weightLogInput').value); if(!w||w<30){toast('⚠️ 請輸入有效的體重');return;}
        const d=load(); d.profile.weight=w; if(!d.weightLog)d.weightLog=[]; const today=todayStr(),ex=d.weightLog.findIndex(l=>l.date===today);
        if(ex>=0) d.weightLog[ex].weight=w; else d.weightLog.push({date:today,weight:w}); save(d);
        if(d.scriptUrl) cloudCall('saveWeight',{date:today,weight:w});
        closeWeightLog(); renderAll(); toast('✅ 體重已記錄');
    }
    function openWaterLog() { renderWater(); document.getElementById('waterLogModal').style.display='flex'; }
    function closeWaterLog() { document.getElementById('waterLogModal').style.display='none'; }
    function addWater(ml) {
        const d=load(),today=todayStr(); if(!d.waterLog)d.waterLog={}; d.waterLog[today]=(d.waterLog[today]||0)+ml; save(d);
        if(d.scriptUrl) cloudCall('saveWater',{date:today,amount:d.waterLog[today]});
        renderWater(); toast(`💧 +${ml}ml`);
    }
    function renderWater() { const d=load(),total=d.waterLog?.[todayStr()]||0,pct=Math.min((total/2000)*100,100); document.getElementById('waterTotal').textContent=`今日已喝：${total} ml`; document.getElementById('waterBarFill').style.width=pct+'%'; }

    // ===== CHARTS PAGE =====
    function renderChartsPage() {
        const d=load(),p=d.profile; document.getElementById('chartBMR').textContent=calcBMR(p)||'--'; document.getElementById('chartTDEE').textContent=calcTDEE(p)||'--';
        const bmi=calcBMI(p); document.getElementById('chartBMI').textContent=bmi||'--'; document.getElementById('chartBMILabel').textContent=bmi?`BMI·${bmiCat(parseFloat(bmi))}`:'BMI';
        document.getElementById('chartGoal').textContent=calcTarget(p); renderTrendChart(d); renderWeightChart(d);
    }
    function renderTrendChart(data) {
        const ctx=document.getElementById('trendChart').getContext('2d'),labels=[],ia=[],ba=[];
        for(let i=6;i>=0;i--){const d=new Date();d.setDate(d.getDate()-i);const ds=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;labels.push(`${d.getMonth()+1}/${d.getDate()}`);const rec=data.records[ds];ia.push(rec?rec.foods.reduce((s,f)=>s+(f.calories||0),0):0);ba.push(rec?rec.exercises.reduce((s,e)=>s+(e.calories||0),0):0);}
        if(chart)chart.destroy();
        chart=new Chart(ctx,{type:'line',data:{labels,datasets:[{label:'攝取',data:ia,borderColor:'#00d4aa',backgroundColor:'rgba(0,212,170,0.1)',fill:true,tension:0.4,borderWidth:2,pointRadius:3,pointBackgroundColor:'#00d4aa',pointBorderColor:'#0a0a1a',pointBorderWidth:2},{label:'消耗',data:ba,borderColor:'#7c5cfc',backgroundColor:'rgba(124,92,252,0.1)',fill:true,tension:0.4,borderWidth:2,pointRadius:3,pointBackgroundColor:'#7c5cfc',pointBorderColor:'#0a0a1a',pointBorderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'top',labels:{color:'rgba(240,240,245,0.6)',font:{size:11},boxWidth:10,padding:12}},tooltip:{backgroundColor:'rgba(18,18,42,0.95)',callbacks:{label:c=>` ${c.dataset.label}: ${c.parsed.y} kcal`}}},scales:{x:{grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'rgba(240,240,245,0.4)',font:{size:10}}},y:{grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'rgba(240,240,245,0.4)',font:{size:10}},beginAtZero:true}}}});
    }
    function renderWeightChart(data) {
        const ctx=document.getElementById('weightChart').getContext('2d'),logs=data.weightLog||[];
        if(weightChart)weightChart.destroy();
        if(!logs.length){weightChart=new Chart(ctx,{type:'line',data:{labels:['--'],datasets:[{label:'體重',data:[0],borderColor:'#00d2d3'}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{display:false},y:{display:false}}}});return;}
        const l14=logs.slice(-14);
        weightChart=new Chart(ctx,{type:'line',data:{labels:l14.map(l=>{const d=new Date(l.date);return `${d.getMonth()+1}/${d.getDate()}`;}),datasets:[{label:'體重(kg)',data:l14.map(l=>l.weight),borderColor:'#00d2d3',backgroundColor:'rgba(0,210,211,0.1)',fill:true,tension:0.4,borderWidth:2,pointRadius:4,pointBackgroundColor:'#00d2d3',pointBorderColor:'#0a0a1a',pointBorderWidth:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>` ${c.parsed.y} kg`}}},scales:{x:{grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'rgba(240,240,245,0.4)',font:{size:10}}},y:{grid:{color:'rgba(255,255,255,0.03)'},ticks:{color:'rgba(240,240,245,0.4)',font:{size:10},callback:v=>v+' kg'}}}}});
    }

    // ===== HISTORY PAGE =====
    async function renderHistoryPage() {
        const d=load(), container=document.getElementById('historyList');
        // Local history
        const dates = Object.keys(d.records).sort().reverse().slice(0, historyDays);
        if(!dates.length){container.innerHTML='<div class="empty-state"><span class="material-symbols-rounded">event_note</span><p>開始記錄後就能看到歷史紀錄</p></div>';} 
        else { container.innerHTML=dates.map(date=>{
            const rec=d.records[date],ti=rec.foods.reduce((s,f)=>s+(f.calories||0),0),tb=rec.exercises.reduce((s,e)=>s+(e.calories||0),0),tgt=calcTarget(d.profile),net=ti-tb;
            const dt=new Date(date),ok=net<=tgt;
            return `<div class="history-day-card" onclick="App.showHistoryDetail('${date}')"><div class="history-day-date"><div class="day">${dt.getDate()}</div><div class="month">${dt.getMonth()+1}月</div></div><div class="history-day-info"><div class="history-day-summary">攝取 ${ti} · 消耗 ${tb} kcal</div><div class="history-day-detail">${rec.foods.length} 餐 · ${rec.exercises.length} 項運動</div></div><div class="history-day-status ${ok?'success':'over'}">${ok?'✓ 達標':'⚠ 超標'}</div></div>`;
        }).join(''); }
        // Encouragement
        loadEncouragement();
    }

    async function loadEncouragement() {
        const d=load(), msgEl=document.getElementById('encouragementMessages');
        if(d.scriptUrl) {
            const res = await cloudCall('getEncouragement');
            if(res?.success && res.messages?.length) { msgEl.innerHTML=res.messages.map(m=>`<div class="encouragement-msg">${m}</div>`).join(''); return; }
        }
        // Local encouragement
        const msgs=[];
        if(d.weightLog?.length>=2){const first=d.weightLog[0].weight,last=d.weightLog[d.weightLog.length-1].weight,diff=(last-first).toFixed(1);
            if(diff<0) msgs.push(`🎉 太棒了！已減 ${Math.abs(diff)} kg（${first}→${last}）！`);
            else if(diff>0) msgs.push(`💪 體重增加了 ${diff} kg，持續記錄就是好的開始！`);
            else msgs.push('⚖️ 體重維持穩定，繼續保持！');}
        const recDays=Object.keys(d.records).length; if(recDays>0) msgs.push(`📊 已持續記錄 ${recDays} 天，堅持就是力量！`);
        // Recent 7 days
        const recent7=[];for(let i=0;i<7;i++){const dt=new Date();dt.setDate(dt.getDate()-i);const ds=`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;if(d.records[ds])recent7.push(d.records[ds]);}
        const exDays=recent7.filter(r=>r.exercises.length>0).length;
        if(exDays>=5) msgs.push(`🔥 過去7天有${exDays}天運動，你是運動達人！`);
        else if(exDays>=3) msgs.push(`🏃 過去7天有${exDays}天運動，繼續保持！`);
        else if(exDays>0) msgs.push(`🚶 試著增加運動頻率，每天走路也有幫助！`);
        if(!msgs.length) msgs.push('🌟 開始記錄你的第一天吧！每一步都很重要！');
        msgEl.innerHTML=msgs.map(m=>`<div class="encouragement-msg">${m}</div>`).join('');
    }

    function loadMoreHistory() { historyDays+=14; renderHistoryPage(); }

    function showHistoryDetail(date) {
        const d=load(),rec=d.records[date]; if(!rec) return;
        const dt=new Date(date);
        document.getElementById('historyDetailTitle').innerHTML=`<span class="material-symbols-rounded">calendar_today</span> ${dt.getMonth()+1}/${dt.getDate()} (${['日','一','二','三','四','五','六'][dt.getDay()]})`;
        const content=document.getElementById('historyDetailContent');
        let html='<div class="history-detail-section"><div class="history-detail-title">🍽️ 飲食紀錄</div>';
        if(rec.foods.length){
            html+=rec.foods.map(f=>`${f.imageUrl?`<img src="${f.imageUrl}" class="history-food-img">`:''}
                <div class="record-item"><div class="record-emoji food-emoji">🍱</div><div class="record-info"><div class="record-name">${f.name}</div><div class="record-meta">${f.time||''}${f.portion?' · '+f.portion:''}</div></div><div class="record-calories intake">+${f.calories}</div></div>`).join('');
        } else html+='<p style="color:var(--text-tertiary);font-size:13px">無紀錄</p>';
        html+='</div><div class="history-detail-section"><div class="history-detail-title">💪 運動紀錄</div>';
        if(rec.exercises.length){
            html+=rec.exercises.map(ex=>`<div class="record-item"><div class="record-emoji exercise-emoji">${ex.emoji||'💪'}</div><div class="record-info"><div class="record-name">${ex.typeName||ex.type}</div><div class="record-meta">${ex.duration}分鐘${ex.distance?' · '+ex.distance+'km':''}</div></div><div class="record-calories burn">-${ex.calories}</div></div>`).join('');
        } else html+='<p style="color:var(--text-tertiary);font-size:13px">無紀錄</p>';
        html+='</div>';
        content.innerHTML=html;
        document.getElementById('historyDetailModal').style.display='flex';
    }

    // ===== PROFILE PAGE =====
    function renderProfilePage() {
        const d=load(),p=d.profile,bmi=calcBMI(p);
        document.getElementById('profileCardAvatar').textContent=p.gender==='female'?'👩':'👨';
        document.getElementById('profileCardName').textContent=`BMI: ${bmi||'--'} · ${bmi?bmiCat(parseFloat(bmi)):'--'}`;
        document.getElementById('profileCardSub').textContent=`${p.height||'--'}cm / ${p.weight||'--'}kg / ${p.age||'--'}歲 · ${d.userId||'本地'}`;
        document.getElementById('settingGenderDisplay').textContent=p.gender==='male'?'男性':p.gender==='female'?'女性':'--';
        document.getElementById('settingAgeDisplay').textContent=p.age?`${p.age} 歲`:'--';
        document.getElementById('settingHeightDisplay').textContent=p.height?`${p.height} cm`:'--';
        document.getElementById('settingWeightDisplay').textContent=p.weight?`${p.weight} kg`:'--';
        document.getElementById('settingActivityDisplay').textContent=ACT_MULT[p.activity]?.name||'--';
        document.getElementById('settingGoalDisplay').textContent=GOAL_DEF[p.goal]?.name||'--';
        document.getElementById('settingTargetDisplay').textContent=`${calcTarget(p)} kcal`;
        document.getElementById('settingApiKeyDisplay').textContent=p.apiKey?'已設定 ✓':'未設定';
        document.getElementById('settingScriptUrlDisplay').textContent=d.scriptUrl?'已設定 ✓':'未設定';
        document.getElementById('settingLastSync').textContent=d.lastSync?d.lastSync.replace('T',' ').substr(0,16):'--';
        updateCloudBadge();
    }

    // ===== EDIT FIELD =====
    function editField(field) {
        editingField=field; const d=load(),p=d.profile;
        const modal=document.getElementById('editModal'),title=document.getElementById('editModalTitle'),content=document.getElementById('editModalContent');
        switch(field){
            case 'gender': title.textContent='選擇性別'; content.innerHTML=`<div class="gender-picker"><button class="gender-option ${p.gender==='male'?'selected':''}" data-gender="male" onclick="document.querySelectorAll('#editModalContent .gender-option').forEach(e=>e.classList.remove('selected'));this.classList.add('selected')"><span class="gender-icon">👨</span><span class="gender-label">男性</span></button><button class="gender-option ${p.gender==='female'?'selected':''}" data-gender="female" onclick="document.querySelectorAll('#editModalContent .gender-option').forEach(e=>e.classList.remove('selected'));this.classList.add('selected')"><span class="gender-icon">👩</span><span class="gender-label">女性</span></button></div>`; break;
            case 'age': title.textContent='設定年齡'; content.innerHTML=`<div class="form-group"><label>年齡</label><div class="input-with-unit"><input type="number" id="editValue" class="input-field" value="${p.age||''}" min="10" max="100"><span class="input-unit">歲</span></div></div>`; break;
            case 'height': title.textContent='設定身高'; content.innerHTML=`<div class="form-group"><label>身高</label><div class="input-with-unit"><input type="number" id="editValue" class="input-field" value="${p.height||''}" min="100" max="250"><span class="input-unit">cm</span></div></div>`; break;
            case 'weight': title.textContent='設定體重'; content.innerHTML=`<div class="form-group"><label>體重</label><div class="input-with-unit"><input type="number" id="editValue" class="input-field" value="${p.weight||''}" min="30" max="300" step="0.1"><span class="input-unit">kg</span></div></div>`; break;
            case 'activity': title.textContent='選擇活動量'; content.innerHTML=`<div class="activity-list">${Object.entries(ACT_MULT).map(([k,v])=>`<button class="activity-option ${p.activity===k?'selected':''}" data-level="${k}" onclick="document.querySelectorAll('#editModalContent .activity-option').forEach(e=>e.classList.remove('selected'));this.classList.add('selected')"><div class="activity-text"><div class="activity-name">${v.name}</div><div class="activity-desc">係數: ${v.f}</div></div></button>`).join('')}</div>`; break;
            case 'goal': title.textContent='減重目標'; const tdee=calcTDEE(p); content.innerHTML=`<div class="goal-list">${Object.entries(GOAL_DEF).map(([k,v])=>`<button class="goal-option ${p.goal===k?'selected':''}" data-goal="${k}" onclick="document.querySelectorAll('#editModalContent .goal-option').forEach(e=>e.classList.remove('selected'));this.classList.add('selected')"><div class="goal-text"><div class="goal-name">${v.name}</div><div class="goal-desc">赤字 ${v.d} kcal/天</div></div><div class="goal-deficit">${Math.max(1200,tdee-v.d)} kcal</div></button>`).join('')}</div>`; break;
            case 'targetCalories': title.textContent='每日目標熱量'; content.innerHTML=`<div class="form-group"><label>目標熱量（自動計算：${calcTarget(p)} kcal）</label><div class="input-with-unit"><input type="number" id="editValue" class="input-field" value="${calcTarget(p)}" min="800" max="5000"><span class="input-unit">kcal</span></div></div>`; break;
            case 'apiKey': title.textContent='Gemini API Key'; content.innerHTML=`<div class="form-group"><label>API Key</label><input type="password" id="editValue" class="input-field" value="${p.apiKey||''}" placeholder="輸入 API Key..."></div>`; break;
            case 'scriptUrl': title.textContent='雲端同步網址'; content.innerHTML=`<div class="form-group"><label>Google Apps Script 部署網址</label><input type="text" id="editValue" class="input-field" value="${d.scriptUrl||''}" placeholder="貼上網址..."></div><p class="input-hint">部署方式請參考「查看部署教學」</p>`; break;
        }
        modal.style.display='flex'; setTimeout(()=>{const inp=document.getElementById('editValue');if(inp)inp.focus();},100);
    }
    function closeEditModal() { document.getElementById('editModal').style.display='none'; }
    function saveEditModal() {
        const d=load(),p=d.profile;
        switch(editingField){
            case 'gender': const s=document.querySelector('#editModalContent .gender-option.selected'); if(s)p.gender=s.dataset.gender; break;
            case 'age': p.age=parseInt(document.getElementById('editValue').value)||p.age; break;
            case 'height': p.height=parseFloat(document.getElementById('editValue').value)||p.height; break;
            case 'weight': p.weight=parseFloat(document.getElementById('editValue').value)||p.weight; break;
            case 'activity': const a=document.querySelector('#editModalContent .activity-option.selected'); if(a)p.activity=a.dataset.level; break;
            case 'goal': const g=document.querySelector('#editModalContent .goal-option.selected'); if(g)p.goal=g.dataset.goal; break;
            case 'apiKey': p.apiKey=document.getElementById('editValue').value.trim(); break;
            case 'scriptUrl': d.scriptUrl=document.getElementById('editValue').value.trim(); break;
        }
        d.profile=p; save(d);
        if(d.scriptUrl && editingField!=='scriptUrl' && editingField!=='apiKey') cloudCall('saveProfile',{...p});
        closeEditModal(); renderAll(); renderProfilePage(); toast('✅ 已更新');
    }

    // ===== CLOUD SYNC =====
    async function manualSync() {
        const d=load(); if(!d.scriptUrl){toast('⚠️ 請先設定雲端同步網址');return;}
        showSyncBar('正在同步資料到雲端...');
        try {
            const res=await cloudCall('syncAll',{records:d.records,weightLog:d.weightLog,waterLog:d.waterLog});
            if(res?.success){d.lastSync=new Date().toISOString();save(d);showSyncBar('✅ 同步完成！','success');toast('☁️ 雲端同步完成');renderProfilePage();}
            else showSyncBar('❌ 同步失敗','error');
        } catch(e) { showSyncBar('❌ 同步失敗','error'); }
    }

    async function syncFromCloud() {
        const d=load(); if(!d.scriptUrl) return;
        // Pull weight history
        const wRes=await cloudCall('getWeightHistory');
        if(wRes?.success && wRes.logs?.length) { d.weightLog=wRes.logs; save(d); }
    }

    // ===== QUICK ADD / RESET =====
    function openQuickAdd() { document.getElementById('quickAddSheet').style.display='flex'; }
    function closeQuickAdd() { document.getElementById('quickAddSheet').style.display='none'; }
    function resetData() { if(confirm('確定要清除所有本地資料嗎？')){localStorage.removeItem(STORAGE_KEY);location.reload();} }

    // ===== TOAST =====
    let toastTimer=null;
    function toast(msg) {
        let t=document.querySelector('.toast'); if(!t){t=document.createElement('div');t.className='toast';document.body.appendChild(t);}
        if(toastTimer){clearTimeout(toastTimer);t.classList.remove('show');}
        t.innerHTML=`<span class="material-symbols-rounded">check_circle</span> ${msg}`;
        void t.offsetWidth; t.classList.add('show');
        toastTimer=setTimeout(()=>{t.classList.remove('show');toastTimer=null;},2500);
    }

    // ===== BOOT =====
    document.addEventListener('DOMContentLoaded', init);

    return {selectGender,selectActivity,selectGoal,obNext,obBack,switchPage,prevDay,nextDay,handleFoodPhoto,openManualFood,closeManualFood,addManualFood,
        closeFoodAnalysis,confirmFoodAnalysis,deleteFood,openExercise,closeExercise,addExercise,deleteExercise,openWeightLog,closeWeightLog,saveWeightLog,
        openWaterLog,closeWaterLog,addWater,openQuickAdd,closeQuickAdd,editField,closeEditModal,saveEditModal,resetData,
        switchLoginTab,doLogin,doRegister,useOffline,showSetupGuide,logout,manualSync,showHistoryDetail,loadMoreHistory};
})();
