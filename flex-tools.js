(function(){
'use strict';
const tableIds=['dailyTable','reportTable','empTable','deptTable','leaveTable','rosterTable','hrDataTable'];
function exportVisible(table){
 const rows=[];
 const head=table.querySelector('thead tr');
 if(head) rows.push(Array.from(head.cells).map(c=>c.innerText.trim()));
 Array.from(table.querySelectorAll('tbody tr')).filter(r=>r.style.display!=='none').forEach(tr=>rows.push(Array.from(tr.cells).map(c=>c.innerText.trim())));
 if(rows.length<2)return alert('لا توجد نتائج ظاهرة للتصدير');
 if(!window.XLSX)return alert('مكتبة Excel لم تُحمّل؛ حدّث الصفحة وحاول مرة أخرى');
 const wb=XLSX.utils.book_new(),ws=XLSX.utils.aoa_to_sheet(rows);
 XLSX.utils.book_append_sheet(wb,ws,'النتائج');
 XLSX.writeFile(wb,'تصدير_'+(table.id||'البيانات')+'_'+new Date().toISOString().slice(0,10)+'.xlsx');
}
function attach(table){
 if(!table||table.dataset.flexToolbar==='1')return;
 table.dataset.flexToolbar='1';
 const bar=document.createElement('div');bar.className='flex';bar.style.cssText='margin:8px 0;align-items:center;gap:8px;flex-wrap:wrap';
 const search=document.createElement('input');search.type='search';search.placeholder='فلترة سريعة داخل الجدول...';search.style.cssText='max-width:260px;min-width:170px';
 const count=document.createElement('span');count.className='small';
 const clear=document.createElement('button');clear.type='button';clear.className='btn-sec';clear.textContent='مسح الفلتر';
 const exp=document.createElement('button');exp.type='button';exp.className='btn-blue';exp.textContent='تصدير الظاهر';
 function apply(){
  const q=search.value.trim().toLocaleLowerCase();
  let shown=0,total=0;
  table.querySelectorAll('tbody tr').forEach(tr=>{
   total++;
   const match=!q||tr.innerText.toLocaleLowerCase().includes(q);
   tr.style.display=match?'':'none';if(match)shown++;
  });
  count.textContent='ظاهر '+shown+' من '+total;
 }
 search.addEventListener('input',apply);
 clear.addEventListener('click',()=>{search.value='';apply();});
 exp.addEventListener('click',()=>exportVisible(table));
 bar.append(search,clear,exp,count);
 table.parentElement.insertBefore(bar,table);
 const body=table.querySelector('tbody');
 if(body)new MutationObserver(apply).observe(body,{childList:true,subtree:true});
 apply();
}

function enableLeaveMovementActions(){
 if(typeof window.renderLeaveModule!=='function'||window.renderLeaveModule.__flexWrapped)return;
 const original=window.renderLeaveModule;
 const wrapped=function(){
  original();
  const table=document.getElementById('leaveTable'),body=table&&table.querySelector('tbody');
  const ledger=window.hrLeaveLedger;
  if(!body||!Array.isArray(ledger))return;
  const sorted=ledger.map((item,index)=>({item,index})).sort((a,b)=>String(a.item.date||'').localeCompare(String(b.item.date||'')));
  sorted.forEach((entry,rowIndex)=>{
   const tr=body.rows[rowIndex];if(!tr)return;
   const x=entry.item;
   const td=document.createElement('td');
   if(['accrual','year_close'].includes(x.kind)){
    td.textContent='حركة تلقائية محمية';
   }else{
    const edit=document.createElement('button');edit.type='button';edit.className='btn-blue';edit.textContent='تعديل';
    edit.onclick=function(){
     const date=prompt('تاريخ الحركة YYYY-MM-DD',x.date||'');if(date===null)return;
     if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return alert('صيغة التاريخ غير صحيحة');
     const current=Number(x.add||0)>0?Number(x.add):-(Number(x.deduct||0));
     const amountText=prompt('عدد الأيام: موجب للإضافة وسالب للخصم',String(current));if(amountText===null)return;
     const amount=Number(amountText);if(!Number.isFinite(amount)||amount===0)return alert('أدخل عدد أيام صحيحًا غير صفر');
     const note=prompt('ملاحظات الحركة',x.note||'');if(note===null)return;
     x.date=date;x.add=amount>0?amount:0;x.deduct=amount<0?Math.abs(amount):0;x.note=note;
     window.hrLeaveLedger=ledger;window.saveExtraModules();wrapped();
    };
    const del=document.createElement('button');del.type='button';del.className='btn-danger';del.style.marginInlineStart='4px';del.textContent='حذف';
    del.onclick=function(){
     if(!confirm('حذف حركة الإجازة اليدوية هذه؟ لن يتم حذف الحركات التلقائية أو سجلات الحضور.'))return;
     ledger.splice(entry.index,1);window.hrLeaveLedger=ledger;window.saveExtraModules();wrapped();
    };
    td.append(edit,del);
   }
   tr.appendChild(td);
  });
  const head=table.querySelector('thead tr');if(head&&!head.dataset.flexActions){const th=document.createElement('th');th.textContent='إدارة الحركة';head.appendChild(th);head.dataset.flexActions='1';}
 };
 wrapped.__flexWrapped=true;window.renderLeaveModule=wrapped;
}

function init(){tableIds.forEach(id=>attach(document.getElementById(id)));enableLeaveMovementActions();enableScheduleEditing();enableSecurityRotationBuilder();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
const root=document.querySelector('.container')||document.body;
new MutationObserver(init).observe(root,{childList:true,subtree:true});
})();
function enableScheduleEditing(){
 if(typeof window.renderRosterTable==='function'&&!window.renderRosterTable.__flexWrapped){
  const original=window.renderRosterTable;
  const wrapped=function(){
   original();
   const table=document.getElementById('rosterTable'),body=table&&table.querySelector('tbody');if(!body)return;
   const rows=weeklyRosters.slice();
   rows.forEach((r,index)=>{
    const tr=body.rows[index];if(!tr)return;
    const td=document.createElement('td');
    const edit=document.createElement('button');edit.type='button';edit.className='btn-blue';edit.textContent='تعديل';
    edit.onclick=function(){
     const start=prompt('بداية الأسبوع YYYY-MM-DD',r.start);if(start===null)return;
     if(!/^\d{4}-\d{2}-\d{2}$/.test(start))return alert('صيغة التاريخ غير صحيحة');
     const shift=prompt('الوردية بصيغة HH:MM|HH:MM',r.from+'|'+r.to);if(shift===null)return;
     if(!/^\d{2}:\d{2}\|\d{2}:\d{2}$/.test(shift))return alert('صيغة الوردية غير صحيحة');
     const off=prompt('يوم الراحة: Friday / Saturday / Sunday / Monday / Tuesday / Wednesday / Thursday / None',r.off||'Friday');if(off===null)return;
     if(!['Friday','Saturday','Sunday','Monday','Tuesday','Wednesday','Thursday','None'].includes(off))return alert('يوم الراحة غير صحيح');
     const p=shift.split('|'),d=new Date(start+'T12:00:00');d.setDate(d.getDate()+6);
     const end=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
     if(weeklyRosters.some(x=>x.id!==r.id&&x.code===r.code&&x.start<=end&&x.end>=start))return alert('يوجد جدول آخر متداخل لهذا الموظف');
     r.start=start;r.end=end;r.from=p[0];r.to=p[1];r.off=off;saveExtraModules();wrapped();
    };
    td.appendChild(edit);tr.appendChild(td);
   });
   const head=table.querySelector('thead tr');if(head&&!head.dataset.flexEdit){const th=document.createElement('th');th.textContent='تعديل';head.appendChild(th);head.dataset.flexEdit='1';}
  };
  wrapped.__flexWrapped=true;window.renderRosterTable=wrapped;
 }
 if(typeof window.renderShiftTable==='function'&&!window.renderShiftTable.__flexWrapped){
  const original=window.renderShiftTable;
  const wrapped=function(){
   original();
   const table=document.getElementById('shiftTable'),body=table&&table.querySelector('tbody');if(!body)return;
   const rows=variableShifts.slice().sort((a,b)=>a.start.localeCompare(b.start));
   rows.forEach((s,index)=>{
    const tr=body.rows[index];if(!tr)return;
    const td=document.createElement('td');
    const edit=document.createElement('button');edit.type='button';edit.className='btn-blue';edit.textContent='تعديل';
    edit.onclick=function(){
     const start=prompt('بداية الوردية YYYY-MM-DDTHH:MM',s.start);if(start===null)return;
     const end=prompt('نهاية الوردية YYYY-MM-DDTHH:MM',s.end);if(end===null)return;
     if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(end)||new Date(end)<=new Date(start))return alert('راجع تاريخ ووقت بداية ونهاية الوردية');
     const extraText=prompt('ساعات الإضافي',String(s.extra||0));if(extraText===null)return;
     const extra=Number(extraText);if(!Number.isFinite(extra)||extra<0)return alert('قيمة الإضافي غير صحيحة');
     const factorText=prompt('معامل الإضافي: 1 أو 2',String(s.factor||1));if(factorText===null)return;
     if(!['1','2'].includes(factorText))return alert('المعامل يجب أن يكون 1 أو 2');
     const note=prompt('الملاحظات',s.note||'');if(note===null)return;
     s.start=start;s.end=end;s.hours=(new Date(end)-new Date(start))/3600000;s.extra=extra;s.factor=Number(factorText);s.note=note;
     saveExtraModules();wrapped();
    };
    td.appendChild(edit);tr.appendChild(td);
   });
   const head=table.querySelector('thead tr');if(head&&!head.dataset.flexEdit){const th=document.createElement('th');th.textContent='تعديل';head.appendChild(th);head.dataset.flexEdit='1';}
  };
  wrapped.__flexWrapped=true;window.renderShiftTable=wrapped;
 }
}

function enableSecurityRotationBuilder(){
 const tab=document.getElementById('tab-shifts');
 if(!tab||document.getElementById('securityRotationBox'))return;
 const box=document.createElement('div');box.id='securityRotationBox';box.className='edit-box';
 box.innerHTML=`
 <b>إنشاء دورة ورديات الأمن تلقائيًا (3 أسابيع متكررة)</b>
 <div class="small">اختر الموظف وتاريخ بداية أول أسبوع. كل أسبوع مدته 7 أيام. يوم الراحة الأسبوعي الأساسي يختلف حسب الموظف. الجمعة في الأسبوع الأول 7 ص–7 م (4 ساعات إضافية)، وفي الثاني 7 م–7 ص (4 ساعات إضافية)، وفي الثالث راحة ليلية ثابتة للجميع. في الأسبوع الثالث يجتمع يوم الجمعة مع يوم الراحة الشخصي؛ وهما يومَا التعويض عن 8 ساعات الجمعة الإضافية في الأسبوعين السابقين. بداية الأسبوع التالي تكون الوردية الصباحية يوم السبت.</div>
 <div class="flex" style="align-items:end;flex-wrap:wrap">
  <div><label>الموظف</label><select id="rotEmp"></select></div>
  <div><label>بداية أول أسبوع</label><input type="date" id="rotStart"></div>
  <div><label>راحة الموظف الأساسية</label><select id="rotOff"><option value="Saturday">السبت</option><option value="Sunday">الأحد</option><option value="Monday">الإثنين</option><option value="Tuesday">الثلاثاء</option><option value="Wednesday">الأربعاء</option><option value="Thursday">الخميس</option><option value="Friday">الجمعة</option><option value="None">بدون</option></select></div>
  <div><label>عدد مرات تكرار الدورة</label><input type="number" id="rotCycles" min="1" max="24" value="4" style="width:90px"></div>
 </div>
 <div class="flex" style="flex-wrap:wrap">
  <div><label>الأسبوع الأول</label><select id="rotShift1"><option value="07:00|15:00">صباحي 7 ص–3 م</option><option value="15:00|23:00">مسائي 3 م–11 م</option><option value="23:00|07:00">ليلي 11 م–7 ص</option></select></div>
  <div><label>الأسبوع الثاني</label><select id="rotShift2"><option value="15:00|23:00">مسائي 3 م–11 م</option><option value="07:00|15:00">صباحي 7 ص–3 م</option><option value="23:00|07:00">ليلي 11 م–7 ص</option></select></div>
  <div><label>الأسبوع الثالث</label><select id="rotShift3"><option value="23:00|07:00">ليلي 11 م–7 ص</option><option value="07:00|15:00">صباحي 7 ص–3 م</option><option value="15:00|23:00">مسائي 3 م–11 م</option></select></div>
  <div><label>جمعة الأسبوع الأول</label><div class="flex"><input type="time" id="rotFri1From" value="07:00"><input type="time" id="rotFri1To" value="19:00"></div></div>
  <div><label>جمعة الأسبوع الثاني</label><div class="flex"><input type="time" id="rotFri2From" value="19:00"><input type="time" id="rotFri2To" value="07:00"></div></div>
 </div>
 <button type="button" class="btn-primary" onclick="buildSecurityRotation()">إنشاء الدورة وحفظها</button>
 `;
 const roster=tab.querySelector('#rosterTable');
 if(roster&&roster.parentElement)tab.insertBefore(box,roster.parentElement);
 else tab.insertBefore(box,tab.firstChild);
 const fill=()=>{const sel=document.getElementById('rotEmp'),old=sel.value;sel.innerHTML='';(emps||[]).filter(e=>e.active!==false).forEach(e=>{const o=document.createElement('option');o.value=e.code;o.textContent=e.code+' - '+e.name;sel.appendChild(o);});if(old)sel.value=old;};
 fill();box.addEventListener('click',fill);
}
function buildSecurityRotation(){
 const code=document.getElementById('rotEmp').value,start=document.getElementById('rotStart').value,off=document.getElementById('rotOff').value,cycles=Number(document.getElementById('rotCycles').value);
 const emp=(emps||[]).find(e=>String(e.code)===String(code));
 if(!emp||!start||!Number.isInteger(cycles)||cycles<1||cycles>24)return alert('اختر موظفًا وتاريخ بداية وعدد دورات من 1 إلى 24');
 if(start&&new Date(start+'T12:00:00').getDay()!==6)return alert('بداية دورة الأمن يجب أن تكون يوم السبت؛ لأن الأسبوع الثالث ينتهي براحة الجمعة الليلية ثم تبدأ الوردية الصباحية يوم السبت.');
 const shifts=[document.getElementById('rotShift1').value,document.getElementById('rotShift2').value,document.getElementById('rotShift3').value].map(x=>x.split('|'));
 const f1=[document.getElementById('rotFri1From').value,document.getElementById('rotFri1To').value],f2=[document.getElementById('rotFri2From').value,document.getElementById('rotFri2To').value];
 if(!f1[0]||!f1[1]||!f2[0]||!f2[1])return alert('أدخل مواعيد الجمعة في الأسبوعين الأول والثاني');
 const dayName=iso=>['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date(iso+'T12:00:00').getDay()];
 const addDays=(iso,n)=>{const d=new Date(iso+'T12:00:00');d.setDate(d.getDate()+n);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');};
 const fridayOffset=(5-new Date(start+'T12:00:00').getDay()+7)%7;
 const plans=[];
 for(let c=0;c<cycles;c++)for(let w=0;w<3;w++){
  const ws=addDays(start,(c*3+w)*7),we=addDays(ws,6),friday=addDays(ws,fridayOffset),[from,to]=shifts[w];
  if(w<2&&off===dayName(friday))return alert('يوم الراحة الأساسي للموظف يوافق الجمعة، بينما توجد وردية جمعة في أول أسبوعين. اختر يوم راحة آخر أو عدّل وردية الجمعة.');
  if(weeklyRosters.some(x=>String(x.code)===String(code)&&x.start<=we&&x.end>=ws))return alert('يوجد جدول أسبوعي محفوظ ومتداخل مع '+ws+' إلى '+we+'؛ لم يتم إنشاء أي جزء من الدورة.');
  plans.push({ws,we,friday,w,from,to});
 }
 for(const p of plans){
  if(p.w<2){
   const times=p.w===0?f1:f2;
   let endDate=p.friday;
   if(times[1]<=times[0])endDate=addDays(p.friday,1);
   const st=p.friday+'T'+times[0],en=endDate+'T'+times[1];
   if(variableShifts.some(x=>String(x.code)===String(code)&&x.start&&x.start.slice(0,10)===p.friday))return alert('توجد وردية متغيرة محفوظة بالفعل في '+st+'؛ لم يتم إنشاء الدورة.');
  }
 }
 if(!confirm('سيتم إنشاء '+plans.length+' جدول أسبوعي للموظف '+emp.name+'، مع ورديتي الجمعة (12 ساعة لكل منهما)، وراحة الجمعة الليلية الثابتة في الأسبوع الثالث بالإضافة إلى يوم الراحة الشخصي كتعويض عن 8 ساعات إضافية إجمالًا. تكرار الدورة '+cycles+' مرة. لن تُحذف أي سجلات حضور سابقة. متابعة؟'))return;
 plans.forEach(p=>{
  weeklyRosters.push({id:'ROT-'+Date.now()+'-'+Math.random().toString(36).slice(2),code:String(code),start:p.ws,end:p.we,from:p.from,to:p.to,off,off2:p.w===2?'Friday':''});
  if(p.w<2){
   const times=p.w===0?f1:f2,endDate=times[1]<=times[0]?addDays(p.friday,1):p.friday,st=p.friday+'T'+times[0],en=endDate+'T'+times[1];
   variableShifts.push({id:'ROT-S-'+Date.now()+'-'+Math.random().toString(36).slice(2),code:String(code),start:st,end:en,hours:(new Date(en)-new Date(st))/3600000,extra:0,factor:1,note:p.w===0?'وردية جمعة 12 ساعة - 4 ساعات إضافية - تعويضها براحة الأسبوع الثالث':'وردية جمعة ليلية 12 ساعة - 4 ساعات إضافية - تعويضها براحة الأسبوع الثالث'});
  }
 });
 saveExtraModules();if(typeof renderRosterTable==='function')renderRosterTable();if(typeof renderShiftTable==='function')renderShiftTable();if(typeof renderDaily==='function')renderDaily();
 alert('تم إنشاء دورة الورديات وحفظها. راجع جدول الأسابيع والورديات المتغيرة قبل اعتماد الحضور.');
}
