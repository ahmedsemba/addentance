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

function init(){tableIds.forEach(id=>attach(document.getElementById(id)));enableLeaveMovementActions();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
const root=document.querySelector('.container')||document.body;
new MutationObserver(init).observe(root,{childList:true,subtree:true});
})();