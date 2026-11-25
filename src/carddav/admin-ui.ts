/** 管理界面 HTML（内嵌 JS，单文件部署） */

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>vCards 通讯录管理</title>
<style>
:root{--bg:#f7f7f5;--card:#fff;--line:#e3e2de;--text:#2c2c2a;--muted:#77766f;--accent:#185fa5;--accent-bg:#e6f1fb;--green:#0f6e56;--green-bg:#e1f5ee;--red:#a32d2d;--amber:#854f0b;--amber-bg:#faeeda}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
header{background:var(--card);border-bottom:1px solid var(--line);padding:14px 20px;position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
h1{font-size:16px;font-weight:500;margin:0}
.spacer{flex:1}
input,select,textarea,button{font:inherit;border:1px solid var(--line);border-radius:8px;padding:8px 10px;background:var(--card);color:var(--text)}
input:focus,select:focus,textarea:focus{outline:2px solid var(--accent-bg);border-color:var(--accent)}
button{cursor:pointer;background:var(--card)}
button.primary{background:var(--accent);color:#fff;border-color:var(--accent)}
button.danger{color:var(--red)}
button:disabled{opacity:.5;cursor:default}
main{max-width:920px;margin:20px auto;padding:0 16px}
.toolbar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.toolbar input{flex:1;min-width:200px}
.list{display:flex;flex-direction:column;gap:8px}
.item{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px}
.item .name{font-weight:500;flex:1}
.badge{font-size:12px;padding:2px 8px;border-radius:20px;background:var(--accent-bg);color:var(--accent)}
.badge.user{background:var(--green-bg);color:var(--green)}
.badge.edited{background:var(--amber-bg);color:var(--amber)}
.book{color:var(--muted);font-size:12px}
.editor{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px;margin-top:14px}
.editor h2{font-size:15px;font-weight:500;margin:0 0 12px}
.field-row{display:flex;gap:8px;margin-bottom:8px;align-items:center}
.field-row .key{width:200px;color:var(--muted);font-size:12px;word-break:break-all}
.field-row input{flex:1}
.field-row .origin{font-size:11px;color:var(--amber);white-space:nowrap}
.actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
.msg{padding:10px 14px;border-radius:8px;margin-bottom:12px;display:none}
.msg.show{display:block}
.msg.ok{background:var(--green-bg);color:var(--green)}
.msg.err{background:#fcebeb;color:var(--red)}
form.inline{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
form.inline input,form.inline select{flex:1;min-width:140px}
label{color:var(--muted);font-size:12px}
</style>
</head>
<body>
<header>
<h1>vCards 通讯录管理</h1>
<span class="spacer"></span>
<span id="ver" class="book"></span>
<button onclick="location.reload()">刷新</button>
</header>
<main>
<div id="msg" class="msg"></div>
<div class="toolbar">
<input id="q" placeholder="搜索名称、分类、电话…" oninput="render()">
<button class="primary" onclick="openNew()">+ 新增联系人</button>
</div>
<div id="newPanel" class="editor" style="display:none">
<h2>新增联系人</h2>
<form class="inline" onsubmit="submitNew(event)">
<input id="nUid" placeholder="名称 / UID（必填）" required>
<select id="nBook"></select>
<input id="nNewBook" placeholder="或输入新分类名" style="display:none">
<label><input type="checkbox" id="nNewBookChk" onchange="toggleNewBook()" style="width:auto"> 新建分类</label>
<button type="submit" class="primary">创建</button>
<button type="button" onclick="document.getElementById('newPanel').style.display='none'">取消</button>
</form>
</div>
<div id="editor" class="editor" style="display:none"></div>
<div id="list" class="list"></div>
</main>
<script>
let DATA={contacts:[],version:0}, BOOKS=[], CUR=null;
const $=id=>document.getElementById(id);
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function notify(text,ok=true){const m=$('msg');m.className='msg show '+(ok?'ok':'err');m.textContent=text;setTimeout(()=>m.className='msg',3500)}
async function api(path,opts={}){const r=await fetch(path,opts);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j}
async function load(){
try{
DATA=await api('/admin/api/contacts');
BOOKS=(await api('/admin/api/books')).books;
$('ver').textContent='数据版本 v'+DATA.version;
const sel=$('nBook');sel.innerHTML=BOOKS.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('');
render();
}catch(e){notify('加载失败：'+e.message,false)}
}
function render(){
const q=$('q').value.trim().toLowerCase();
const list=DATA.contacts.filter(c=>!q||[c.name,c.book,...c.fields.map(f=>f.value)].join(' ').toLowerCase().includes(q));
$('list').innerHTML=list.map(c=>{
const edited=c.fields.some(f=>f.edited);
return '<div class="item"><span class="name">'+esc(c.name)+'</span>'+
'<span class="book">'+esc(c.book)+'</span>'+
(c.source==='user'?'<span class="badge user">我添加的</span>':'')+
(edited?'<span class="badge edited">已修改</span>':'')+
'<button onclick="openEdit(\''+encodeURIComponent(c.uid)+'\')">编辑</button></div>';
}).join('')||'<div class="book">没有匹配的联系人</div>';
}
function openEdit(uid){
CUR=DATA.contacts.find(c=>c.uid===decodeURIComponent(uid));if(!CUR)return;
const e=$('editor');e.style.display='block';
e.innerHTML='<h2>编辑：'+esc(CUR.name)+' <span class="book">'+esc(CUR.book)+'</span></h2>'+
'<div id="fields">'+
CUR.fields.map((f,i)=>
'<div class="field-row"><div class="key" title="'+esc(f.key)+'">'+esc(f.label)+'</div>'+
'<input value="'+esc(f.value)+'" data-i="'+i+'">'+
(f.edited?'<span class="origin">已修改</span>':'')+
'<button class="danger" onclick="removeField('+i+')" title="删除此字段">×</button></div>'
).join('')+
'</div>'+
'<form class="inline" style="margin-top:10px" onsubmit="addField(event)">'+
'<input id="afKey" placeholder="新字段类型，如 TEL;TYPE=CELL" required>'+
'<input id="afVal" placeholder="字段值">'+
'<button type="submit">+ 添加字段</button></form>'+
'<div class="actions">'+
'<button class="primary" onclick="saveEdit()">保存</button>'+
'<button onclick="$(\'editor\').style.display=\'none\'">取消</button>'+
'<button class="danger" onclick="delContact()">删除联系人</button></div>';
e.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function removeField(i){CUR.fields[i].value='__DELETED__';CUR.fields[i].edited=true;
const row=document.querySelector('#fields .field-row[data-i="'+i+'"]');if(row)row.style.opacity='.4';}
function addField(ev){ev.preventDefault();const k=$('afKey').value.trim(),v=$('afVal').value.trim();if(!k)return;
CUR.fields.push({key:'+'+k,label:k,value:v,edited:true});$('afVal').value='';$('afKey').value='';openEditByUid(CUR.uid);}
function openEditByUid(uid){const c=CUR;openEdit(uid);CUR=c;}
function collectFields(){
const out=[],deleted=[];
for(const f of CUR.fields){
const input=document.querySelector('#fields input[data-i="'+CUR.fields.indexOf(f)+'"]');
const val=input?input.value:f.value;
if(val==='__DELETED__'){deleted.push(f.key);continue}
out.push({key:f.key,value:val});
}
return{fields:out,deleted};
}
async function saveEdit(){
try{const{fields,deleted}=collectFields();
const r=await api('/admin/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:CUR.uid,fields,deleted})});
notify('已保存，数据版本 v'+r.version);$('editor').style.display='none';await load();
}catch(e){notify('保存失败：'+e.message,false)}
}
async function delContact(){
if(!confirm('确定删除「'+CUR.name+'」？基线联系人删除后，上游更新也不会让它复活。'))return;
try{const r=await api('/admin/api/contact',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:CUR.uid})});
notify('已删除，数据版本 v'+r.version);$('editor').style.display='none';await load();
}catch(e){notify('删除失败：'+e.message,false)}
}
function openNew(){$('newPanel').style.display='block';$('nUid').value='';$('nUid').focus()}
function toggleNewBook(){const on=$('nNewBookChk').checked;$('nNewBook').style.display=on?'block':'none';$('nBook').style.display=on?'none':'block'}
async function submitNew(ev){
ev.preventDefault();
const uid=$('nUid').value.trim();if(!uid)return;
const payload={uid,fields:[{key:'FN#0',value:uid},{key:'ORG#0',value:uid}]};
if($('nNewBookChk').checked)payload.newBook=$('nNewBook').value.trim();else payload.bookId=$('nBook').value;
try{const r=await api('/admin/api/contacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
notify('已创建，数据版本 v'+r.version);$('newPanel').style.display='none';await load();openEdit(encodeURIComponent(uid));
}catch(e){notify('创建失败：'+e.message,false)}
}
load();
</script>
</body>
</html>`;
