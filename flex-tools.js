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
function init(){tableIds.forEach(id=>attach(document.getElementById(id)));}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
const root=document.querySelector('.container')||document.body;
new MutationObserver(init).observe(root,{childList:true,subtree:true});
})();