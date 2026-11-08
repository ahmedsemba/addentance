(function () {
  'use strict';

  let hrMaster = { active: [], former: [], formerOld: [], unmatchedLeave: [] };
  let hrDbPromise = null;

  function openHrDb() {
    if (hrDbPromise) return hrDbPromise;
    hrDbPromise = new Promise(function (resolve, reject) {
      if (!window.indexedDB) return reject(new Error('المتصفح لا يدعم التخزين المحلي المتقدم'));
      const request = indexedDB.open('AhmedHRPrivateData', 2);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records');
        if (!db.objectStoreNames.contains('documents')) db.createObjectStore('documents', { keyPath: 'id' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('تعذر فتح قاعدة البيانات المحلية')); };
    });
    return hrDbPromise;
  }

  async function loadHrMaster() {
    try {
      const db = await openHrDb();
      const value = await new Promise(function (resolve, reject) {
        const tx = db.transaction('records', 'readonly');
        const req = tx.objectStore('records').get('employeeMaster');
        req.onsuccess = function () { resolve(req.result || null); };
        req.onerror = function () { reject(req.error); };
      });
      if (value && typeof value === 'object') hrMaster = value;
    } catch (err) {
      console.warn('HR local database:', err);
    }
  }

  async function saveHrMaster() {
    const db = await openHrDb();
    return new Promise(function (resolve, reject) {
      const tx = db.transaction('records', 'readwrite');
      tx.objectStore('records').put(hrMaster, 'employeeMaster');
      tx.oncomplete = function () { resolve(true); };
      tx.onerror = function () { reject(tx.error || new Error('تعذر حفظ ملفات العاملين')); };
    });
  }

  function normCode(v) { return String(v == null ? '' : v).trim(); }

  function findMasterRecord(code) {
    const c = normCode(code);
    const groups = [hrMaster.active || [], hrMaster.former || [], hrMaster.formerOld || [], hrMaster.unmatchedLeave || []];
    for (const group of groups) {
      const found = group.find(function (x) { return normCode(x.code) === c; });
      if (found) return found;
    }
    return null;
  }

  function nameForCode(code) {
    const emp = emps.find(function (x) { return normCode(x.code) === normCode(code); });
    const master = findMasterRecord(code);
    return (master && master.name) || (emp && emp.name) || '';
  }

  function typeForCode(code) {
    const emp = emps.find(function (x) { return normCode(x.code) === normCode(code); });
    const master = findMasterRecord(code);
    return (master && master.leaveTypeCode) || (emp && emp.leaveType) || '';
  }

  function addHrTab() {
    const tabs = document.querySelector('.tabs');
    const container = document.querySelector('.container');
    if (!tabs || !container || document.getElementById('tab-hrdata')) return;

    const tab = document.createElement('div');
    tab.className = 'tab';
    tab.textContent = 'ملفات العاملين';
    tab.setAttribute('onclick', "showTab('hrdata')");
    tab.addEventListener('click', function () { setTimeout(renderHRData, 0); });
    tabs.appendChild(tab);

    const panel = document.createElement('div');
    panel.id = 'tab-hrdata';
    panel.className = 'card';
    panel.style.display = 'none';
    panel.innerHTML =
      '<h3>ملفات العاملين</h3>' +
      '<div class="edit-box">' +
        '<b>1) استيراد ملف العاملين من Excel</b>' +
        '<div class="flex" style="margin-top:8px"><input type="file" id="hrExcelFile" accept=".xlsx,.xls,.csv" style="max-width:360px"><button class="btn-primary" id="hrExcelImportBtn">معاينة واستيراد العاملين</button></div>' +
        '<div class="small">يدعم ملف الشركة متعدد الشيتات مثل: في العمل، المستقيلين، والمستقيلين قديم. تتم المطابقة بكود الموظف، وتُحفظ كل بيانات المصنع. موظفو العبور فقط يمكن ربطهم بشاشة الحضور.</div>' +
        '<div id="hrExcelImportMsg" class="small" style="margin-top:6px"></div>' +
        '<hr style="border:0;border-top:1px solid #e5edf1;margin:14px 0">' +
        '<b>2) استيراد / تصدير نسخة بيانات العاملين والإجازات</b>' +
        '<div class="flex" style="margin-top:8px">' +
          '<input type="file" id="hrDataFile" accept=".json,application/json" style="max-width:360px">' +
          '<button class="btn-primary" id="hrImportBtn">استيراد بيانات العاملين والإجازات</button>' +
          '<button class="btn-sec" id="hrExportBtn">تنزيل نسخة بيانات العاملين والإجازات</button>' +
        '</div>' +
        '<div class="small">الملف الخاص لا يُرفع إلى GitHub؛ يُحفظ محليًا في هذا المتصفح فقط. لا تشارك جهازك أو نسخة البيانات مع غير المصرح لهم.</div>' +
        '<div id="hrImportMsg" class="small" style="margin-top:8px"></div>' +
      '</div>' +
      '<div class="flex" style="margin-bottom:8px">' +
        '<input id="hrSearch" placeholder="بحث بالكود أو الاسم أو الوظيفة" style="max-width:320px">' +
        '<select id="hrStatusFilter" style="max-width:190px">' +
          '<option value="all">كل الملفات</option>' +
          '<option value="active">العاملون حاليًا</option>' +
          '<option value="former">المستقيلون</option>' +
          '<option value="formerOld">المستقيلون - قديم</option>' +
          '<option value="unmatchedLeave">أكواد الإجازات غير الموجودة بملف العاملين</option>' +
        '</select>' +
      '</div>' +
      '<div id="hrDataSummary" class="summary"></div>' +
      '<div style="overflow:auto;max-height:55vh"><table id="hrDataTable"><thead><tr>' +
        '<th>الكود</th><th>الاسم</th><th>المصنع / الفرع</th><th>كود الإدارة</th><th>الوظيفة</th><th>تاريخ التعيين</th><th>الحالة</th><th>التفاصيل</th>' +
      '</tr></thead><tbody></tbody></table></div>' +
      '<div id="hrDetailBox" class="edit-box" style="display:none;margin-top:12px"><div class="flex" style="justify-content:space-between"><b id="hrDetailTitle">تفاصيل العامل</b><button class="btn-sec" id="hrDetailClose">إغلاق</button></div><div style="overflow:auto;max-height:50vh"><table id="hrDetailTable"><tbody></tbody></table></div><hr><b>مستندات الموظف (تُحفظ على هذا الجهاز فقط)</b><div class="flex"><input type="file" id="hrDocFiles" multiple accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"><button class="btn-primary" id="hrDocSaveBtn">حفظ المستندات</button></div><div id="hrDocList" class="small"></div></div>';

    container.appendChild(panel);
    document.getElementById('hrExcelImportBtn').addEventListener('click', importEmployeeWorkbook);
    document.getElementById('hrImportBtn').addEventListener('click', importHRPackage);
    document.getElementById('hrExportBtn').addEventListener('click', exportHRPackage);
    document.getElementById('hrSearch').addEventListener('input', renderHRData);
    document.getElementById('hrStatusFilter').addEventListener('change', renderHRData);
    document.getElementById('hrDocSaveBtn').addEventListener('click', saveEmployeeDocuments);
    document.getElementById('hrDetailClose').addEventListener('click', function () {
      document.getElementById('hrDetailBox').style.display = 'none';
    });
  }


  function normalizeHeader(v) {
    return String(v == null ? '' : v).toLowerCase().replace(/[\u064B-\u065F\u0670\u0640]/g,'')
      .replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[\s_\-()\/]/g,'');
  }
  function dateValue(v) {
    if (v instanceof Date && !isNaN(v)) return v.getFullYear()+'-'+String(v.getMonth()+1).padStart(2,'0')+'-'+String(v.getDate()).padStart(2,'0');
    if (typeof v === 'number' && v > 10000 && window.XLSX) {
      const d = XLSX.SSF.parse_date_code(v);
      return d ? d.y+'-'+String(d.m).padStart(2,'0')+'-'+String(d.d).padStart(2,'0') : '';
    }
    const s=String(v||'').trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    const p=s.split(/[\/.-]/);
    if(p.length===3) return p[0].length===4 ? p[0]+'-'+p[1].padStart(2,'0')+'-'+p[2].padStart(2,'0') : p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');
    return '';
  }
  async function importEmployeeWorkbook() {
    const input=document.getElementById('hrExcelFile'), msg=document.getElementById('hrExcelImportMsg');
    const file=input && input.files && input.files[0];
    if(!file){alert('اختار ملف العاملين Excel أولاً');return;}
    try {
      const bytes=new Uint8Array(await file.arrayBuffer());
      let sheets=[];
      if(file.name.toLowerCase().endsWith('.csv')) {
        const txt=new TextDecoder('windows-1256').decode(bytes);
        const delim=(txt.split(/\r?\n/)[0]||'').includes(';')?';':',';
        const rows=txt.split(/\r?\n/).filter(x=>x.trim()).map(line=>{const out=[];let cur='',q=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==='"'&&line[i+1]==='"'&&q){cur+='"';i++;}else if(ch==='"')q=!q;else if(ch===delim&&!q){out.push(cur.trim());cur='';}else cur+=ch;}out.push(cur.trim());return out;});
        sheets=[{name:'في العمل',rows}];
      } else {
        if(!window.XLSX) throw new Error('مكتبة Excel لم تُحمّل؛ حدّث الصفحة وحاول مرة أخرى');
        const wb=XLSX.read(bytes,{type:'array',cellDates:true});
        sheets=wb.SheetNames.map(name=>({name,rows:XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:''})}));
      }
      const staged=[];
      let skipped=0;
      sheets.forEach(sh=>{
        const sheetName=String(sh.name||'');
        const lower=normalizeHeader(sheetName);
        let group=lower.includes('قديم')?'formerOld':(lower.includes('مستقيل')||lower.includes('انهاء')?'former':'active');
        const rows=sh.rows||[];
        let hi=rows.findIndex(row=>{const h=row.map(normalizeHeader);return h.some(x=>['الكود','كود','كودالموظف','رقمالموظف','رقمالبصمه','employeeid','empcode'].includes(x))&&h.some(x=>['الاسم','اسمالموظف','name','employeename'].includes(x));});
        if(hi<0){skipped+=rows.length;return;}
        const heads=rows[hi].map(normalizeHeader);
        const col=(keys)=>heads.findIndex(h=>keys.includes(h));
        const ix={code:col(['الكود','كود','كودالموظف','رقمالموظف','رقمالبصمه','employeeid','empcode']),name:col(['الاسم','اسمالموظف','name','employeename']),factory:col(['المصنع','الفرع','مصنع','الجهه','جهةالعمل','location','branch']),dept:col(['الاداره','كودالاداره','الادارة','department','dept']),job:col(['الوظيفه','المسميالوظيفي','الوظيفة','job','title']),hire:col(['تاريخالتعيين','تاريخالتعين','التعيين','hiredate','joiningdate']),type:col(['نوعالعامل','نوعالاجازه','نوعالاجازة','مقيممغترب','residencytype']),status:col(['الحاله','الحالة','status']),reason:col(['سببانهاءالخدمه','سببالترك','reason'])};
        for(let i=hi+1;i<rows.length;i++){
          const row=rows[i]||[];
          const code=String(row[ix.code]??'').trim(), name=String(row[ix.name]??'').trim();
          if(!code||!name){if(row.some(v=>String(v??'').trim()))skipped++;continue;}
          const fields={};heads.forEach((h,j)=>{if(h)fields[String(rows[hi][j]||('عمود '+(j+1)))] = row[j] instanceof Date ? dateValue(row[j]) : row[j]??'';});
          const typeRaw=String(row[ix.type]??'');
          const leaveTypeCode=/مغترب|migrant/i.test(typeRaw)?'migrant':(/مقيم|resident/i.test(typeRaw)?'resident':'');
          const record={code,name,factory:String(row[ix.factory]??'').trim(),departmentCode:String(row[ix.dept]??'').trim(),job:String(row[ix.job]??'').trim(),hireDate:dateValue(row[ix.hire]),leaveTypeCode,leaveTypeLabel:leaveTypeCode==='migrant'?'مغترب':leaveTypeCode==='resident'?'مقيم':'',status:String(row[ix.status]??'').trim(),reason:String(row[ix.reason]??'').trim(),fields,sourceSheet:sheetName};
          staged.push({group,record});
        }
      });
      if(!staged.length) throw new Error('لم أجد صفوفًا بعناوين مفهومة. تأكد من وجود عمودي كود الموظف والاسم.');
      const counts={active:0,former:0,formerOld:0};
      staged.forEach(x=>counts[x.group]++);
      msg.textContent='معاينة: عاملون '+counts.active+' | مستقيليون '+counts.former+' | مستقيليون قديم '+counts.formerOld+' | صفوف غير مقروءة '+skipped+'. اضغط مرة أخرى للاعتماد.';
      if(!confirm('تمت قراءة الملف. سيتم دمج '+staged.length+' سجل حسب كود الموظف مع الاحتفاظ بالبيانات الحالية. هل تعتمد الاستيراد؟')) return;
      staged.forEach(({group,record})=>{
        ['active','former','formerOld'].forEach(k=>{hrMaster[k]=(hrMaster[k]||[]).filter(x=>normCode(x.code)!==normCode(record.code));});
        hrMaster[group]=hrMaster[group]||[];
        const idx=hrMaster[group].findIndex(x=>normCode(x.code)===normCode(record.code));
        if(idx>=0) hrMaster[group][idx]=Object.assign({},hrMaster[group][idx],record); else hrMaster[group].push(record);
        if(group==='active' && /عبور|obour/i.test(record.factory)) {
          let deptId='';
          if(record.departmentCode) {
            let d=depts.find(x=>normCode(x.name)===normCode(record.departmentCode));
            if(!d){d={id:'hrd_'+Date.now()+'_'+Math.random().toString(36).slice(2,6),name:record.departmentCode,from:'08:00',to:'16:00',off:'Friday'};depts.push(d);}
            deptId=d.id;
          }
          let emp=emps.find(x=>normCode(x.code)===normCode(record.code));
          if(!emp){emp={code:record.code,name:record.name,dept:deptId,from:'',to:''};emps.push(emp);}
          else {emp.name=record.name;if(deptId)emp.dept=deptId;}
          if(record.hireDate)emp.hireDate=record.hireDate;
          if(record.leaveTypeCode)emp.leaveType=record.leaveTypeCode;
        }
      });
      await saveHrMaster(); saveAll(); renderHRData(); renderEmps();
      msg.textContent='تم الاستيراد بنجاح: '+staged.length+' سجل. تم تحديث قائمة حضور العبور للموظفين الذين ظهر أن مصنعهم «العبور» فقط. الصفوف غير المقروءة: '+skipped+'.';
    } catch(err) { msg.textContent='تعذر الاستيراد: '+err.message; alert('تعذر استيراد ملف العاملين: '+err.message); }
  }
  async function saveEmployeeDocuments() {
    const code=normCode(window.currentHRDocumentCode), input=document.getElementById('hrDocFiles');
    const files=Array.from(input && input.files || []);
    if(!code || !files.length){alert('اختار مستندًا واحدًا على الأقل');return;}
    if(files.some(f=>f.size>20*1024*1024)){alert('حجم الملف الواحد يجب ألا يتجاوز 20 ميجابايت');return;}
    try {
      const db=await openHrDb();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('documents','readwrite'),store=tx.objectStore('documents');
        files.forEach((file,i)=>store.put({id:code+'_'+Date.now()+'_'+i,code,name:file.name,type:file.type||'application/octet-stream',size:file.size,addedAt:new Date().toISOString(),blob:file}));
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('تعذر حفظ المستندات'));
      });
      input.value=''; await renderEmployeeDocuments(code);
      alert('تم حفظ المستندات على هذا الجهاز فقط.');
    } catch(err){alert('تعذر حفظ المستندات: '+err.message);}
  }
  async function renderEmployeeDocuments(code) {
    const box=document.getElementById('hrDocList'); if(!box)return;
    box.textContent='جارٍ تحميل المستندات...';
    try {
      const db=await openHrDb();
      const docs=await new Promise((resolve,reject)=>{const tx=db.transaction('documents','readonly'),req=tx.objectStore('documents').getAll();req.onsuccess=()=>resolve(req.result.filter(x=>x.code===code));req.onerror=()=>reject(req.error);});
      box.innerHTML='';
      if(!docs.length){box.textContent='لا توجد مستندات محفوظة لهذا الموظف.';return;}
      docs.forEach(doc=>{
        const row=document.createElement('div');row.className='flex';row.style.marginTop='6px';
        const label=document.createElement('span');label.textContent=doc.name+' ('+(doc.size/1024).toFixed(0)+' KB)';row.appendChild(label);
        const open=document.createElement('button');open.className='btn-blue';open.textContent='فتح / تنزيل';open.addEventListener('click',()=>{const url=URL.createObjectURL(doc.blob);const a=document.createElement('a');a.href=url;a.download=doc.name;a.target='_blank';a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);});row.appendChild(open);
        const del=document.createElement('button');del.className='btn-danger';del.textContent='حذف';del.addEventListener('click',async()=>{if(!confirm('حذف المستند '+doc.name+'؟'))return;const db2=await openHrDb();await new Promise((resolve,reject)=>{const tx=db2.transaction('documents','readwrite');tx.objectStore('documents').delete(doc.id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});renderEmployeeDocuments(code);});row.appendChild(del);
        box.appendChild(row);
      });
    } catch(err){box.textContent='تعذر تحميل المستندات: '+err.message;}
  }

  function getHRGroups(filter) {
    const groups = [];
    if (filter === 'all' || filter === 'active') groups.push({ label: 'عامل حالي', rows: hrMaster.active || [] });
    if (filter === 'all' || filter === 'former') groups.push({ label: 'مستقيل', rows: hrMaster.former || [] });
    if (filter === 'all' || filter === 'formerOld') groups.push({ label: 'مستقيل قديم', rows: hrMaster.formerOld || [] });
    if (filter === 'all' || filter === 'unmatchedLeave') groups.push({ label: 'غير موجود في ملف العاملين', rows: hrMaster.unmatchedLeave || [] });
    return groups;
  }

  function renderHRData() {
    const body = document.querySelector('#hrDataTable tbody');
    if (!body) return;
    const filter = document.getElementById('hrStatusFilter').value || 'all';
    const search = (document.getElementById('hrSearch').value || '').trim().toLowerCase();
    const records = [];
    getHRGroups(filter).forEach(function (g) {
      (g.rows || []).forEach(function (r) { records.push({ record: r, statusLabel: g.label }); });
    });
    const filtered = records.filter(function (item) {
      const r = item.record;
      const hay = [r.code, r.name, r.factory, r.departmentCode, r.job, item.statusLabel].join(' ').toLowerCase();
      return !search || hay.includes(search);
    });
    body.innerHTML = '';
    filtered.forEach(function (item) {
      const r = item.record;
      const tr = document.createElement('tr');
      [r.code || '', r.name || '', r.factory || '', r.departmentCode || r.department || '', r.job || '', r.hireDate || '', item.statusLabel].forEach(function (v) {
        const td = document.createElement('td'); td.textContent = v == null ? '' : String(v); tr.appendChild(td);
      });
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.className = 'btn-blue'; btn.textContent = 'عرض';
      btn.addEventListener('click', function () { showHRDetails(r, item.statusLabel); });
      td.appendChild(btn); tr.appendChild(td); body.appendChild(tr);
    });
    const summary = document.getElementById('hrDataSummary');
    const count = function (k) { return (hrMaster[k] || []).length; };
    summary.textContent = 'العاملون: ' + count('active') + ' | المستقيلون: ' + count('former') +
      ' | المستقيلون قديم: ' + count('formerOld') + ' | سجلات إجازات غير مرتبطة: ' + count('unmatchedLeave') +
      ' | نتائج البحث: ' + filtered.length;
  }

  function showHRDetails(record, statusLabel) {
    const box = document.getElementById('hrDetailBox');
    const body = document.querySelector('#hrDetailTable tbody');
    const title = document.getElementById('hrDetailTitle');
    if (!box || !body) return;
    title.textContent = (record.code || '') + ' - ' + (record.name || '') + ' (' + statusLabel + ')';
    body.innerHTML = '';
    const fields = record.fields || {};
    const entries = Object.keys(fields).length ? Object.entries(fields) : Object.entries(record);
    entries.forEach(function (pair) {
      if (pair[0] === 'fields') return;
      const tr = document.createElement('tr');
      const th = document.createElement('th'); th.textContent = pair[0];
      const td = document.createElement('td'); td.textContent = pair[1] == null ? '' : String(pair[1]);
      tr.appendChild(th); tr.appendChild(td); body.appendChild(tr);
    });
    window.currentHRDocumentCode = normCode(record.code);
    document.getElementById('hrDocFiles').value = '';
    renderEmployeeDocuments(window.currentHRDocumentCode);
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function defaultAttendanceRecord() {
    return { in1: '', out1: '', delay: '', early: '', noSign: '', permHours: '', permType: 'free',
      extra: '', extraFactor: 1, absent: false, mission: false, missionPlace: '', rest: false, holiday: false };
  }

  async function importHRPackage() {
    const input = document.getElementById('hrDataFile');
    const msg = document.getElementById('hrImportMsg');
    const file = input && input.files && input.files[0];
    if (!file) { alert('اختر ملف بيانات العاملين أولاً'); return; }
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.format !== 'ahmed-hr-import-v1' || !data.employeeMaster ||
          !Array.isArray(data.employeeMaster.active) || !Array.isArray(data.leaveLedger) ||
          !data.attendanceLeave || typeof data.attendanceLeave !== 'object') {
        throw new Error('صيغة الملف غير صحيحة أو غير مكتملة');
      }
      if (!confirm('سيتم تحديث ملفات العاملين وسجل الإجازات المستورد فقط، مع الحفاظ على الحضور والانصراف والورديات والإدارات الحالية. هل تريد المتابعة؟')) return;

      hrMaster = data.employeeMaster;
      await saveHrMaster();

      const importedLedger = data.leaveLedger || [];
      const manualLedger = window.hrLeaveLedger.filter(function (x) { return !String(x.id || '').startsWith('IMP_'); });
      const manualKeys = new Set(manualLedger.filter(function (x) {
        return ['paid', 'unpaid', 'special'].includes(x.kind);
      }).map(function (x) { return [x.code, x.date, x.kind].join('|'); }));
      const cleanImported = importedLedger.filter(function (x) {
        if (!String(x.id || '').startsWith('IMP_')) return false;
        if (['paid', 'unpaid', 'special'].includes(x.kind) && manualKeys.has([x.code, x.date, x.kind].join('|'))) return false;
        return true;
      });
      window.hrLeaveLedger = manualLedger.concat(cleanImported);

      const leaveProfileMap = new Map((data.leaveProfiles || []).map(function (p) { return [normCode(p.code), p]; }));
      const activeMasterMap = new Map((hrMaster.active || []).map(function (p) { return [normCode(p.code), p]; }));
      const importedLeaveCodes = new Set(importedLedger.map(function (x) { return normCode(x.code); }));
      emps.forEach(function (emp) {
        const code = normCode(emp.code);
        const p = leaveProfileMap.get(code);
        const master = activeMasterMap.get(code);
        if (master && master.name) emp.name = master.name;
        if ((p && p.hireDate) || (master && master.hireDate)) emp.hireDate = (p && p.hireDate) || master.hireDate;
        const typeCode = (p && p.leaveTypeCode) || (master && master.leaveTypeCode);
        if (typeCode === 'migrant' || typeCode === 'resident') emp.leaveType = typeCode;
        if (importedLeaveCodes.has(code)) emp.leaveImportedThrough = data.asOf || '2026-11-08';
      });

      Object.keys(data.attendanceLeave).forEach(function (key) {
        const patch = data.attendanceLeave[key];
        const old = attendance[key] || defaultAttendanceRecord();
        if (!old.leaveStatus || old.leaveSource === 'imported' || old.leaveSource === 'imported_special') {
          attendance[key] = Object.assign({}, old, patch);
        }
      });

      saveAll();
      saveExtraModules();
      if (typeof renderDaily === 'function') renderDaily();
      if (typeof renderLeaveModule === 'function') renderLeaveModule();
      renderHRData();
      msg.textContent = 'تم الاستيراد بنجاح: ' + ((hrMaster.active || []).length) + ' عامل حالي، ' +
        ((hrMaster.former || []).length + (hrMaster.formerOld || []).length) + ' سجل مستقيل، ' +
        cleanImported.length + ' حركة إجازات مستوردة. تم الحفاظ على الحضور والإدارات والورديات الحالية.';
    } catch (err) {
      msg.textContent = 'لم يكتمل الاستيراد: ' + err.message;
      alert('تعذر استيراد الملف: ' + err.message);
    }
  }

  function downloadJSON(filename, payload) {
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function exportHRPackage() {
    const importedLedger = window.hrLeaveLedger.filter(function (x) { return String(x.id || '').startsWith('IMP_'); });
    const attendanceLeave = {};
    Object.keys(attendance).forEach(function (key) {
      const r = attendance[key];
      if (r && (r.leaveSource === 'imported' || r.leaveSource === 'imported_special')) {
        attendanceLeave[key] = {
          leaveStatus: r.leaveStatus, leaveFraction: r.leaveFraction,
          absent: r.absent, absent_manual: r.absent_manual, leaveSource: r.leaveSource
        };
      }
    });
    const importedCodes = new Set(importedLedger.map(function (x) { return normCode(x.code); }));
    const leaveProfiles = (hrMaster.active || []).filter(function (r) { return importedCodes.has(normCode(r.code)); })
      .map(function (r) { return { code: r.code, hireDate: r.hireDate, leaveTypeCode: r.leaveTypeCode, leaveTypeLabel: r.leaveTypeLabel }; });
    downloadJSON('نسخة_ملفات_العاملين_والإجازات.json', {
      format: 'ahmed-hr-import-v1', asOf: '2026-11-08',
      employeeMaster: hrMaster, leaveLedger: importedLedger,
      attendanceLeave: attendanceLeave, leaveProfiles: leaveProfiles
    });
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function ensureImportedFutureAccruals(asOf) {
    const now = new Date();
    const today = isoDate(now);
    if (asOf > today) asOf = today;
    let made = 0;
    emps.filter(function (e) { return e.leaveImportedThrough; }).forEach(function (emp) {
      if (!emp.hireDate || !['migrant', 'resident'].includes(emp.leaveType)) return;
      let cursor = new Date('2026-11-26T12:00:00');
      let guard = 0;
      while (isoDate(cursor) <= asOf && guard++ < 600) {
        const date = isoDate(cursor);
        const exists = window.hrLeaveLedger.some(function (x) { return x.code == emp.code && x.date == date && x.kind == 'accrual'; });
        if (!exists) {
          let amount = 0;
          if (emp.leaveType === 'migrant') {
            amount = (yearsAt(emp, date) >= 10 && cursor.getMonth() <= 8) ? 6 : 5;
          } else {
            const eligible = dateAddMonths(emp.hireDate, 6);
            if (date >= eligible) {
              const rate = yearsAt(emp, date) >= 10 ? 30 : 21;
              const periodStart = new Date(cursor); periodStart.setMonth(periodStart.getMonth() - 1); periodStart.setDate(26);
              const periodEnd = new Date(cursor); periodEnd.setDate(25);
              const start = new Date(Math.max(periodStart.getTime(), new Date(eligible + 'T12:00:00').getTime()));
              const totalDays = Math.round((periodEnd - periodStart) / 86400000) + 1;
              const eligibleDays = Math.max(0, Math.round((periodEnd - start) / 86400000) + 1);
              amount = rate / 12 * Math.min(1, eligibleDays / totalDays);
            }
          }
          if (amount > 0) {
            window.hrLeaveLedger.push({ id: 'FUT' + date + '_' + emp.code, date: date, code: emp.code,
              kind: 'accrual', label: 'استحقاق شهري', add: amount, deduct: 0,
              note: 'استحقاق تلقائي بعد تاريخ استيراد الأرصدة' });
            made++;
          } else {
            window.hrLeaveLedger.push({ id: 'FUT0' + date + '_' + emp.code, date: date, code: emp.code,
              kind: 'accrual', label: 'تسجيل دورة بدون استحقاق بعد الاستيراد', add: 0, deduct: 0,
              note: 'حفظ نقطة الدورة لمنع التكرار' });
          }
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    });
    return made;
  }

  const originalEnsureAccruals = window.ensureAccruals;
  if (typeof originalEnsureAccruals === 'function') {
    window.ensureAccruals = function (asOf) {
      const allEmployees = emps;
      let made = 0;
      try {
        emps = allEmployees.filter(function (e) { return !e.leaveImportedThrough; });
        made = originalEnsureAccruals(asOf);
      } finally {
        emps = allEmployees;
      }
      made += ensureImportedFutureAccruals(asOf);
      saveExtraModules();
      return made;
    };
  }

  const originalRenderLeaveModule = window.renderLeaveModule;
  if (typeof originalRenderLeaveModule === 'function') {
    window.renderLeaveModule = function () {
      originalRenderLeaveModule();
      const asOf = document.getElementById('accrualDate').value || '2026-11-08';
      const codes = new Set();
      emps.forEach(function (e) { codes.add(normCode(e.code)); });
      window.hrLeaveLedger.forEach(function (x) { codes.add(normCode(x.code)); });
      const bal = document.getElementById('leaveBalances');
      if (bal) {
        bal.innerHTML = '<b>الأرصدة حتى ' + asOf + '</b><br>';
        Array.from(codes).filter(Boolean).sort(function (a, b) { return a.localeCompare(b, 'en', { numeric: true }); }).forEach(function (code) {
          const emp = emps.find(function (e) { return normCode(e.code) === code; });
          const label = nameForCode(code);
          const type = typeForCode(code);
          const typeLabel = type === 'migrant' ? 'مغترب' : type === 'resident' ? 'مقيم' : 'النوع غير محدد';
          const line = document.createElement('div');
          line.textContent = code + ' - ' + label + ' (' + typeLabel + '): ' + ledgerBalance(code, asOf).toFixed(2) + ' يوم';
          bal.appendChild(line);
        });
      }
      const body = document.querySelector('#leaveTable tbody');
      if (body) {
        body.innerHTML = '';
        window.hrLeaveLedger.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (x) {
          const tr = document.createElement('tr');
          const values = [x.date, x.code, nameForCode(x.code), x.label || x.kind,
            Number(x.add || 0).toFixed(2), Number(x.deduct || 0).toFixed(2),
            ledgerBalance(x.code, x.date).toFixed(2), x.note || ''];
          values.forEach(function (v) { const td = document.createElement('td'); td.textContent = v == null ? '' : String(v); tr.appendChild(td); });
          body.appendChild(tr);
        });
      }
    };
  }

  window.exportLeaveLedger = function () {
    const rows = [['التاريخ', 'الكود', 'الاسم', 'الحركة', 'إضافة', 'خصم', 'الرصيد بعد الحركة', 'ملاحظات']];
    window.hrLeaveLedger.slice().sort(function (a, b) { return a.date.localeCompare(b.date); }).forEach(function (x) {
      rows.push([x.date, x.code, nameForCode(x.code), x.label || x.kind, x.add || 0, x.deduct || 0,
        ledgerBalance(x.code, x.date), x.note || '']);
    });
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'حركة الإجازات');
    XLSX.writeFile(wb, 'حركة_أرصدة_الإجازات.xlsx');
  };

  addHrTab();
  loadHrMaster().then(renderHRData);
  window.renderHRData = renderHRData;
  window.importHRPackage = importHRPackage;
  window.exportHRPackage = exportHRPackage;
})();