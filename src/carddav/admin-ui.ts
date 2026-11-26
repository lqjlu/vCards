/** 管理界面 HTML（内嵌 JS，单文件部署） */

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>vCards 通讯录管理</title>
<style>
:root{--bg:#f5f7fb;--panel:#fff;--line:#e5e9f2;--text:#1a2235;--muted:#70798c;--accent:#4f46e5;--accent-dark:#4338ca;--accent-soft:#eef2ff;--green:#087f5b;--green-bg:#e6f7f0;--amber:#a15c07;--amber-bg:#fff4e0;--red:#c92a2a;--red-bg:#fff0f0;--shadow:0 12px 32px rgba(26,34,53,.06);--radius:16px}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
button{font:inherit;cursor:pointer}
input,select,textarea{font:inherit}
.app{min-height:100vh}
.sidebar{position:fixed;inset:0 auto 0 0;width:264px;padding:24px 16px 18px;background:linear-gradient(180deg,#161d2f 0%,#111827 100%);color:#dce3f1;display:flex;flex-direction:column;z-index:20;box-shadow:8px 0 30px rgba(17,24,39,.08)}
.brand{display:flex;align-items:center;gap:12px;padding:0 8px 22px;border-bottom:1px solid rgba(255,255,255,.08)}
.logo{width:42px;height:42px;flex:none;border-radius:13px;background:linear-gradient(135deg,#6366f1,#3b82f6);display:grid;place-items:center;color:#fff;font-weight:700;font-size:14px;letter-spacing:-.5px;box-shadow:0 8px 20px rgba(79,70,229,.35)}
.brand b{display:block;font-size:15px;font-weight:600;color:#fff;letter-spacing:.2px}
.brand small{display:block;margin-top:1px;font-size:11px;color:#8b97ad;letter-spacing:.4px}
.side-label{margin:22px 10px 10px;font-size:11px;font-weight:600;letter-spacing:1.4px;color:#75829a}
.cats{display:flex;flex-direction:column;gap:4px;overflow:auto;padding-right:3px;flex:1;min-height:0}
.cats::-webkit-scrollbar{width:5px}
.cats::-webkit-scrollbar-thumb{background:rgba(255,255,255,.14);border-radius:8px}
.cat{width:100%;display:flex;align-items:center;gap:10px;padding:10px 11px;border:0;border-radius:10px;background:transparent;color:#a8b4c9;text-align:left;transition:background .16s,color .16s,transform .16s}
.cat:hover{background:rgba(255,255,255,.07);color:#fff}
.cat:active{transform:scale(.985)}
.cat.on{color:#fff;background:linear-gradient(135deg,rgba(99,102,241,.34),rgba(59,130,246,.2));box-shadow:inset 0 0 0 1px rgba(129,140,248,.28)}
.cat-dot{width:7px;height:7px;flex:none;border-radius:50%;background:#5b6880}
.cat.on .cat-dot{background:#a5b4fc;box-shadow:0 0 0 3px rgba(165,180,252,.18)}
.cat-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.cat .n{margin-left:auto;padding:1px 8px;border-radius:20px;background:rgba(255,255,255,.07);color:#93a0b7;font-size:11px;font-variant-numeric:tabular-nums}
.cat.on .n{background:rgba(255,255,255,.14);color:#e8ecff}
.side-foot{padding:16px 8px 0;border-top:1px solid rgba(255,255,255,.08)}
.side-ver{display:block;margin-bottom:10px;color:#7f8ca3;font-size:11px}
.side-refresh{width:100%;padding:8px 10px;border:1px solid rgba(255,255,255,.12);border-radius:9px;background:rgba(255,255,255,.04);color:#cbd5e8;font-size:12px}
.side-refresh:hover{background:rgba(255,255,255,.1);color:#fff}
.workspace{margin-left:264px;min-height:100vh}
.topbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:18px;padding:18px 30px;background:rgba(245,247,251,.88);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
.eyebrow{font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--accent);text-transform:uppercase}
.topbar h1{margin:2px 0 0;font-size:21px;font-weight:650;letter-spacing:-.3px}
.top-actions{display:flex;align-items:center;gap:10px}
.search{display:flex;align-items:center;gap:9px;width:330px;padding:0 13px;border:1px solid var(--line);border-radius:11px;background:var(--panel);box-shadow:0 2px 10px rgba(26,34,53,.03);transition:border-color .16s,box-shadow .16s}
.search:focus-within{border-color:#a5b4fc;box-shadow:0 0 0 3px var(--accent-soft)}
.search svg{width:16px;height:16px;flex:none;color:#949cad}
.search input{width:100%;min-width:0;padding:10px 0;border:0;outline:0;background:transparent;color:var(--text)}
.search input::placeholder{color:#9aa2b3}
.btn{padding:9px 13px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text);font-size:13px;box-shadow:0 1px 2px rgba(26,34,53,.03);transition:border-color .16s,background .16s,transform .16s,color .16s}
.btn:hover{border-color:#c7cdda;background:#fafbff}
.btn:active{transform:translateY(1px)}
.btn.primary{border-color:var(--accent);background:var(--accent);color:#fff;box-shadow:0 6px 16px rgba(79,70,229,.22)}
.btn.primary:hover{background:var(--accent-dark);border-color:var(--accent-dark)}
.btn.danger{color:var(--red)}
.btn.danger:hover{border-color:#f3c2c2;background:var(--red-bg)}
.btn.small{padding:6px 11px;font-size:12px}
.btn:disabled{opacity:.5;cursor:default;transform:none}
.content{max-width:1180px;margin:0 auto;padding:24px 30px 48px}
.msg{padding:11px 15px;border-radius:10px;margin-bottom:16px;display:none;font-size:13px}
.msg.show{display:block}
.msg.ok{background:var(--green-bg);color:var(--green);border:1px solid #c9ecd9}
.msg.err{background:var(--red-bg);color:var(--red);border:1px solid #f5d0d0}
.metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin-bottom:18px}
.metric{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px;box-shadow:var(--shadow)}
.metric .label{font-size:12px;color:var(--muted)}
.metric .value{margin-top:5px;font-size:25px;font-weight:650;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.metric .value small{font-size:12px;font-weight:400;color:var(--muted);margin-left:4px}
.metric.highlight .value{color:var(--accent)}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow);overflow:hidden}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:18px 20px;border-bottom:1px solid var(--line)}
.panel-head h2{margin:0;font-size:15px;font-weight:600}
.panel-sub{margin:3px 0 0;color:var(--muted);font-size:12px}
.bulk{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.select-all{display:inline-flex;align-items:center;gap:7px;color:var(--muted);font-size:12px;white-space:nowrap}
.select-all input{width:15px;height:15px;accent-color:var(--accent)}
#selinfo{color:var(--accent);font-size:12px;white-space:nowrap}
.list{padding:6px 10px 10px}
.item{display:flex;align-items:flex-start;gap:13px;padding:13px 10px;border-bottom:1px solid #eef1f6;border-radius:11px;transition:background .16s}
.item:hover{background:#fafbff}
.item:last-child{border-bottom:0}
.chk{width:16px;height:16px;margin-top:11px;flex:none;accent-color:var(--accent)}
.avatar{width:38px;height:38px;flex:none;margin-top:1px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-weight:650;font-size:13px;letter-spacing:-.2px}
.item-body{flex:1;min-width:0}
.line1{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.name{font-weight:600;font-size:15px}
.badge{padding:2px 8px;border-radius:20px;background:var(--accent-soft);color:var(--accent);font-size:11px;white-space:nowrap}
.badge.user{background:var(--green-bg);color:var(--green)}
.badge.edited{background:var(--amber-bg);color:var(--amber)}
.book{color:var(--muted);font-size:12px}
.tels{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.tel{padding:2px 9px;border:1px solid var(--line);border-radius:7px;background:#f8f9fc;color:#39435a;font-size:12px;font-variant-numeric:tabular-nums;cursor:pointer;transition:border-color .16s,color .16s,background .16s}
.tel:hover{border-color:#b9c0fa;color:var(--accent);background:var(--accent-soft)}
.item-ops{display:flex;gap:6px;flex:none;margin-top:2px}
.item-ops .btn{padding:5px 10px;font-size:12px}
.empty{padding:52px 20px;text-align:center}
.empty-mark{width:46px;height:46px;margin:0 auto 12px;border-radius:14px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-size:20px;font-weight:600}
.empty h3{margin:0 0 4px;font-size:14px;font-weight:600}
.empty p{margin:0;color:var(--muted);font-size:12px}
.editor,.detail{margin:16px 20px;padding:18px;border:1px solid #dfe4f0;border-radius:14px;background:#fbfcff}
.editor h2,.detail h2{font-size:15px;font-weight:600;margin:0 0 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.field-row{display:flex;gap:8px;margin-bottom:8px;align-items:center}
.field-row .key{width:190px;color:var(--muted);font-size:12px;word-break:break-all}
.field-row input{flex:1;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--text)}
.field-row input:focus{outline:0;border-color:#a5b4fc;box-shadow:0 0 0 3px var(--accent-soft)}
.field-row .origin{font-size:11px;color:var(--amber);white-space:nowrap}
.actions{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
form.inline{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
form.inline input,form.inline select{flex:1;min-width:140px;padding:9px 10px;border:1px solid var(--line);border-radius:9px;background:#fff;color:var(--text)}
form.inline label{flex:none}
label{color:var(--muted);font-size:12px}
.drow{display:flex;gap:8px;align-items:flex-start;padding:8px 0;border-bottom:1px solid var(--line)}
.drow:last-child{border-bottom:0}
.drow .dk{width:190px;flex:none;color:var(--muted);font-size:12px;word-break:break-all}
.drow .dv{flex:1;word-break:break-all;white-space:pre-wrap}
.drow .btn{padding:2px 9px;font-size:12px}
.drow a{color:var(--accent);text-decoration:none;font-size:12px;padding:3px 7px}
@media(max-width:1000px){.metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.search{width:260px}}
@media(max-width:760px){.sidebar{position:static;width:auto;height:auto;padding:14px;box-shadow:none}.brand{padding-bottom:14px}.side-label{margin:14px 8px 8px}.cats{flex-direction:row;overflow-x:auto;padding-bottom:4px}.cat{width:auto;white-space:nowrap}.side-foot{padding-top:12px}.side-ver{margin-bottom:8px}.workspace{margin-left:0}.topbar{position:static;flex-direction:column;align-items:stretch;padding:16px}.top-actions{flex-wrap:wrap}.search{width:100%}.content{padding:16px}.metrics{grid-template-columns:1fr}.panel-head{align-items:flex-start;flex-direction:column}.bulk{justify-content:flex-start}.item{flex-wrap:wrap}.item-ops{margin-left:45px}.editor,.detail{margin:12px;padding:14px}.field-row{flex-wrap:wrap}.field-row .key,.drow .dk{width:100%}}
</style>
</head>
<body>
<div class="app">
<aside class="sidebar">
<div class="brand">
<div class="logo">vC</div>
<div><b>vCards</b><small>通讯录管理台</small></div>
</div>
<div class="side-label">分类浏览</div>
<div id="cats" class="cats"></div>
<div class="side-foot">
<span id="ver" class="side-ver"></span>
<button type="button" class="side-refresh" onclick="location.reload()">刷新数据</button>
</div>
</aside>
<div class="workspace">
<header class="topbar">
<div>
<div class="eyebrow">CONTACTS / 管理</div>
<h1>通讯录管理</h1>
</div>
<div class="top-actions">
<label class="search">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
<input id="q" placeholder="搜索名称、分类、电话、任意字段…" oninput="render()">
</label>
<button type="button" class="btn primary" onclick="openNew()">+ 新增联系人</button>
</div>
</header>
<main class="content">
<div id="msg" class="msg"></div>
<section class="metrics">
<div class="metric"><div class="label">联系人总数</div><div class="value" id="metricTotal">0</div></div>
<div class="metric highlight"><div class="label">当前显示</div><div class="value" id="metricShown">0</div></div>
<div class="metric"><div class="label">已选中</div><div class="value" id="metricSelected">0</div></div>
</section>
<section class="panel">
<div class="panel-head">
<div><h2>联系人列表</h2><p id="stat" class="panel-sub"></p></div>
<div class="bulk">
<label class="select-all"><input type="checkbox" id="all" onchange="toggleAll()"> 全选当前结果</label>
<span id="selinfo"></span>
<button type="button" class="btn small" onclick="copySelectedNumbers()">复制号码</button>
<button type="button" class="btn small" onclick="exportCSV()">导出 CSV</button>
<button type="button" class="btn small" onclick="clearSel()">清空选择</button>
</div>
</div>
<div id="newPanel" class="editor" style="display:none">
<h2>新增联系人</h2>
<form class="inline" onsubmit="submitNew(event)">
<input id="nUid" placeholder="名称 / UID（必填）" required>
<select id="nBook"></select>
<input id="nNewBook" placeholder="或输入新分类名" style="display:none">
<label><input type="checkbox" id="nNewBookChk" onchange="toggleNewBook()"> 新建分类</label>
<button type="submit" class="btn primary">创建</button>
<button type="button" class="btn" onclick="closeNew()">取消</button>
</form>
</div>
<div id="detail" class="detail" style="display:none"></div>
<div id="editor" class="editor" style="display:none"></div>
<div id="list" class="list"></div>
</section>
</main>
</div>
</div>
<script>
let DATA={contacts:[],version:0},BOOKS=[],CUR=null,SEL=new Set(),CAT='';
const $=id=>document.getElementById(id);
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
const FIELD_NAMES={TEL:'电话',EMAIL:'邮箱',URL:'网址',ORG:'组织',ADR:'地址',NOTE:'备注',FN:'名称',N:'姓名',TITLE:'头衔',BDAY:'生日',IMPP:'即时通讯','X-SOCIALPROFILE':'社交账号'};
function fieldName(label){const base=String(label||'').split(';')[0].toUpperCase();return FIELD_NAMES[base]||label}
function enc(s){return encodeURIComponent(String(s??'')).replace(/'/g,'%27')}
function notify(text,ok=true){const m=$('msg');m.className='msg show '+(ok?'ok':'err');m.textContent=text;setTimeout(()=>m.className='msg',3500)}
function closeDetail(){$('detail').style.display='none'}
function closeEditor(){$('editor').style.display='none'}
function closeNew(){$('newPanel').style.display='none'}
async function api(path,opts={}){const r=await fetch(path,opts);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j}
async function load(){
try{
DATA=await api('/admin/api/contacts');
BOOKS=(await api('/admin/api/books')).books;
$('ver').textContent='数据版本 v'+DATA.version;
const sel=$('nBook');sel.innerHTML=BOOKS.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('');
renderCats();
render();
}catch(e){notify('加载失败：'+e.message,false)}
}
function tels(c){return c.fields.filter(f=>/^TEL/i.test(f.label)&&f.value&&f.value!=='__DELETED__').map(f=>f.value)}
function catCounts(){const m={};for(const c of DATA.contacts)m[c.book]=(m[c.book]||0)+1;return m}
function renderCats(){
const counts=catCounts();
let h='<button type="button" class="cat'+(CAT===''?' on':'')+'" data-cat=""><span class="cat-dot"></span><span class="cat-name">全部联系人</span><span class="n">'+DATA.contacts.length+'</span></button>';
for(const b of BOOKS){const n=counts[b.name]||0;h+='<button type="button" class="cat'+(CAT===b.name?' on':'')+'" data-cat="'+esc(b.name)+'"><span class="cat-dot"></span><span class="cat-name">'+esc(b.name)+'</span><span class="n">'+n+'</span></button>'}
$('cats').innerHTML=h;
}
function setCat(name){CAT=name;renderCats();render()}
function filtered(){
const q=$('q').value.trim().toLowerCase();
return DATA.contacts.filter(c=>{
if(CAT&&c.book!==CAT)return false;
if(!q)return true;
return[c.name,c.book,...c.fields.map(f=>f.value)].join(' ').toLowerCase().includes(q);
});
}
function render(){
const list=filtered();
$('stat').textContent='当前显示 '+list.length+' / '+DATA.contacts.length+' 个联系人'+(list.length!==DATA.contacts.length?'（已筛选）':'');
$('metricTotal').textContent=DATA.contacts.length;
$('metricShown').textContent=list.length;
$('metricSelected').textContent=SEL.size;
$('list').innerHTML=list.map(c=>{
const edited=c.fields.some(f=>f.edited);
const ts=tels(c);
const telHtml=ts.length?ts.map(t=>'<span class="tel" title="点击复制" onclick="copyText(\\''+enc(t)+'\\',true)">'+esc(t)+'</span>').join(''):'<span class="book">无电话</span>';
const initials=(c.name||'?').trim().slice(0,2).toUpperCase();
return '<div class="item">'+
'<input type="checkbox" class="chk" data-uid="'+esc(c.uid)+'"'+(SEL.has(c.uid)?' checked':'')+' onchange="toggleSel(\\''+enc(c.uid)+'\\')">'+
'<div class="avatar">'+esc(initials)+'</div>'+
'<div class="item-body"><div class="line1"><span class="name">'+esc(c.name)+'</span>'+
(c.source==='user'?'<span class="badge user">我添加的</span>':'<span class="badge">GitHub</span>')+
(edited?'<span class="badge edited">已修改</span>':'')+
'<span class="book">'+esc(c.book)+'</span></div>'+
'<div class="tels">'+telHtml+'</div></div>'+
'<div class="item-ops"><button type="button" class="btn" onclick="openDetail(\\''+enc(c.uid)+'\\')">详情</button>'+
'<button type="button" class="btn" onclick="openEdit(\\''+enc(c.uid)+'\\')">编辑</button></div></div>';
}).join('')||'<div class="empty"><div class="empty-mark">0</div><h3>没有匹配的联系人</h3><p>换个关键词，或在左侧切换分类</p></div>';
$('all').checked=list.length>0&&list.every(c=>SEL.has(c.uid));
updateSelInfo();
renderCats();
}
function toggleSel(uid){uid=decodeURIComponent(uid);if(SEL.has(uid))SEL.delete(uid);else SEL.add(uid);render()}
function toggleAll(){const list=filtered();const all=list.every(c=>SEL.has(c.uid));list.forEach(c=>all?SEL.delete(c.uid):SEL.add(c.uid));render()}
function clearSel(){SEL.clear();render()}
function updateSelInfo(){$('selinfo').textContent=SEL.size?'已选 '+SEL.size+' 个':''}
async function copyText(t,dec=false){
if(dec)t=decodeURIComponent(t);
try{await navigator.clipboard.writeText(t);notify('已复制：'+t.slice(0,40));}
catch(e){const ta=document.createElement('textarea');ta.value=t;document.body.appendChild(ta);ta.select();document.execCommand('copy');ta.remove();notify('已复制：'+t.slice(0,40))}
}
function copySelectedNumbers(){
const lines=[];
for(const uid of SEL){const c=DATA.contacts.find(x=>x.uid===uid);if(c){const ts=tels(c);lines.push(c.name+'：'+(ts.join(' / ')||'无电话'))}}
if(!lines.length){notify('请先勾选联系人',false);return}
copyText(lines.join('\\n'));
}
function download(content,name,type){const b=new Blob([content],{type:type});const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function exportCSV(){
if(!SEL.size){notify('请先勾选联系人',false);return}
const rows=[['名称','分类','电话','来源','已修改']];
for(const uid of SEL){const c=DATA.contacts.find(x=>x.uid===uid);if(c)rows.push([c.name,c.book,tels(c).join(' / '),c.source==='user'?'我添加':'GitHub',c.fields.some(f=>f.edited)?'是':''])}
const csv='\\ufeff'+rows.map(r=>r.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\\r\\n');
download(csv,'contacts.csv','text/csv;charset=utf-8');notify('已导出 '+rows.length+' 行');
}
function openDetail(uid){
const c=DATA.contacts.find(x=>x.uid===decodeURIComponent(uid));if(!c)return;
const d=$('detail');d.style.display='block';
d.innerHTML='<h2>联系人：'+esc(c.name)+' <span class="badge">'+(c.source==='user'?'我添加':'GitHub')+'</span><span class="book">'+esc(c.book)+'</span></h2>'+
c.fields.filter(f=>f.value&&f.value!=='__DELETED__').map(f=>{
const tel=/^TEL/i.test(f.label);
return '<div class="drow"><span class="dk">'+esc(fieldName(f.label))+(f.edited?' · 已修改':'')+'</span>'+
'<span class="dv">'+esc(f.value)+'</span>'+
'<button type="button" class="btn" onclick="copyText(\\''+enc(f.value)+'\\',true)">复制</button>'+
(tel?'<a href="tel:'+esc(f.value)+'">拨打</a>':'')+'</div>';
}).join('')+
'<div class="actions"><button type="button" class="btn primary" onclick="openEdit(\\''+enc(c.uid)+'\\')">编辑此联系人</button>'+
'<button type="button" class="btn" onclick="closeDetail()">关闭</button></div>';
d.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function openEdit(uid){
CUR=DATA.contacts.find(c=>c.uid===decodeURIComponent(uid));if(!CUR)return;
$('detail').style.display='none';
const e=$('editor');e.style.display='block';
e.innerHTML='<h2>编辑：'+esc(CUR.name)+' <span class="book">'+esc(CUR.book)+'</span></h2>'+
'<div id="fields">'+
CUR.fields.map((f,i)=>
'<div class="field-row" data-i="'+i+'"><div class="key" title="'+esc(f.key)+'">'+esc(fieldName(f.label))+'</div>'+
'<input value="'+esc(f.value)+'" data-i="'+i+'" placeholder="'+esc(fieldName(f.label))+'">'+
(f.edited?'<span class="origin">已修改</span>':'')+
'<button type="button" class="btn danger" onclick="removeField('+i+')" title="删除此字段">×</button></div>'
).join('')+
'</div>'+
'<form class="inline" style="margin-top:10px" onsubmit="addField(event)">'+
'<input id="afVal" placeholder="电话号码">'+
'<button type="submit" class="btn">+ 添加电话</button></form>'+
'<div class="actions">'+
'<button type="button" class="btn primary" onclick="saveEdit()">保存</button>'+
'<button type="button" class="btn" onclick="closeEditor()">取消</button>'+
'<button type="button" class="btn danger" onclick="delContact()">删除联系人</button></div>';
e.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function removeField(i){CUR.fields[i].value='__DELETED__';CUR.fields[i].edited=true;
const row=document.querySelector('#fields .field-row[data-i="'+i+'"]');if(row)row.style.opacity='.4';}
function addField(ev){ev.preventDefault();const v=$('afVal').value.trim();if(!v)return;
const base='TEL;TYPE=CELL';let n=1,k='+'+base;
while(CUR.fields.some(f=>f.key===k)){n++;k='+'+base+'~'+n;}
CUR.fields.push({key:k,label:base,value:v,edited:true});$('afVal').value='';$('afVal').focus();openEditByUid(CUR.uid);}
function openEditByUid(uid){const c=CUR;openEdit(uid);CUR=c;}
function collectFields(){
const out=[],deleted=[];
for(let i=0;i<CUR.fields.length;i++){
const f=CUR.fields[i];
const input=document.querySelector('#fields input[data-i="'+i+'"]');
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
notify('已删除，数据版本 v'+r.version);$('editor').style.display='none';SEL.delete(CUR.uid);await load();
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
$('cats').addEventListener('click',function(ev){const b=ev.target.closest('[data-cat]');if(b)setCat(b.getAttribute('data-cat'))});
load();
</script>
</body>
</html>
`;

/** 管理页登录界面（单文件，提交后由 Worker 设置会话 Cookie 并跳转） */
export const LOGIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>登录 - vCards 通讯录管理</title>
<style>
:root{--bg:#f5f7fb;--panel:#fff;--line:#e5e9f2;--text:#1a2235;--muted:#70798c;--accent:#4f46e5;--accent-dark:#4338ca;--red:#c92a2a}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--text);font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;padding:20px}
.card{width:100%;max-width:400px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:36px 32px;box-shadow:0 12px 32px rgba(26,34,53,.06)}
.mark{width:48px;height:48px;border-radius:14px;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:600;margin:0 auto 18px}
h1{font-size:20px;font-weight:600;text-align:center;margin:0 0 6px}
.sub{text-align:center;color:var(--muted);font-size:13px;margin:0 0 26px}
label{display:block;font-size:12px;color:var(--muted);margin:0 0 6px}
input{width:100%;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--text);font:inherit;margin:0 0 16px}
input:focus{outline:0;border-color:var(--accent);box-shadow:0 0 0 3px rgba(79,70,229,.12)}
button{width:100%;padding:11px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:500;cursor:pointer}
button:hover{background:var(--accent-dark)}
button:disabled{opacity:.6;cursor:default}
.err{display:none;color:var(--red);font-size:13px;text-align:center;margin:0 0 14px}
</style>
</head>
<body>
<div class="card">
<div class="mark">V</div>
<h1>vCards 通讯录管理</h1>
<p class="sub">登录后管理黄页联系人</p>
<div class="err" id="err"></div>
<form id="f" onsubmit="login(event)">
<label for="u">用户名</label>
<input id="u" autocomplete="username" required>
<label for="p">密码</label>
<input id="p" type="password" autocomplete="current-password" required>
<button type="submit" id="btn">登录</button>
</form>
</div>
<script>
async function login(ev){
ev.preventDefault();
const err=document.getElementById('err'),btn=document.getElementById('btn');
err.style.display='none';btn.disabled=true;btn.textContent='登录中…';
try{
const r=await fetch('/admin/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:document.getElementById('u').value,password:document.getElementById('p').value})});
const j=await r.json().catch(()=>({}));
if(!r.ok){err.textContent=j.error||'登录失败';err.style.display='block';btn.disabled=false;btn.textContent='登录';return}
location.href='/admin';
}catch(e){err.textContent='网络错误：'+e.message;err.style.display='block';btn.disabled=false;btn.textContent='登录'}
}
</script>
</body>
</html>
`;
