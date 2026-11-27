/** 管理界面 HTML（内嵌 JS，单文件部署） */

export const ADMIN_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>vCards 通讯录管理</title>
<style>
:root{--bg:#f6f7f9;--panel:#fff;--ink:#141824;--text:#1d2433;--muted:#6b7488;--faint:#98a1b3;--line:#e7eaf1;--line-soft:#eef1f6;--accent:#4f46e5;--accent-dark:#4338ca;--accent-soft:#eef1fe;--teal:#0f766e;--teal-soft:#e6f7f4;--amber:#a15c07;--amber-soft:#fff5e6;--red:#c92a2a;--red-soft:#fff1f1;--shadow-sm:0 1px 2px rgba(20,24,36,.04);--shadow:0 1px 2px rgba(20,24,36,.04),0 10px 28px -16px rgba(20,24,36,.18);--radius:15px}
*{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:radial-gradient(900px 420px at 74% -10%,#eef1ff 0%,rgba(246,247,249,0) 62%),var(--bg);color:var(--text);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
button{font:inherit;color:inherit;cursor:pointer}
input,select,textarea{font:inherit;color:inherit}
::selection{background:#dfe3ff}
code{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
.app{display:flex;min-height:100vh}

/* ── 侧栏 ───────────────────────────── */
.sidebar{position:fixed;inset:0 auto 0 0;width:256px;display:flex;flex-direction:column;padding:20px 14px 14px;background:radial-gradient(120% 55% at 0% 0%,#222a49 0%,#141824 48%,#0e1118 100%);color:#c9d1e0;z-index:30;box-shadow:12px 0 40px -24px rgba(15,19,28,.6)}
.brand{display:flex;align-items:center;gap:11px;padding:2px 8px 18px}
.logo{width:38px;height:38px;flex:none;border-radius:12px;background:linear-gradient(140deg,#7c83f8,#4338ca);display:grid;place-items:center;color:#fff;font-weight:700;font-size:15px;letter-spacing:-.4px;box-shadow:0 10px 22px -10px rgba(79,70,229,.9),inset 0 1px 0 rgba(255,255,255,.28)}
.brand b{display:block;font-size:14.5px;font-weight:600;color:#fff;letter-spacing:.1px}
.brand small{display:block;margin-top:1px;font-size:10.5px;color:#7d879b;letter-spacing:.7px}
.nav{display:flex;flex-direction:column;gap:3px;padding:0 0 16px}
.nav-item{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border:0;border-radius:10px;background:transparent;color:#98a3b8;font-size:13px;text-align:left;transition:background .16s,color .16s}
.nav-item svg{width:17px;height:17px;flex:none;opacity:.9}
.nav-item:hover{background:rgba(255,255,255,.055);color:#e8edf6}
.nav-item.on{background:linear-gradient(100deg,rgba(99,102,241,.3),rgba(99,102,241,.06));color:#fff;box-shadow:inset 0 0 0 1px rgba(129,140,248,.22)}
.nav-item .n{margin-left:auto;padding:1px 7px;border-radius:20px;background:rgba(255,255,255,.07);color:#8e9ab0;font-size:11px;font-variant-numeric:tabular-nums}
.nav-item.on .n{background:rgba(255,255,255,.15);color:#fff}
.cat-block{display:flex;flex-direction:column;min-height:0;flex:1;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)}
.side-label{margin:0 10px 9px;font-size:10px;font-weight:600;letter-spacing:1.5px;color:#6f7b91;text-transform:uppercase}
.cats{display:flex;flex-direction:column;gap:2px;overflow:auto;padding-right:2px;min-height:0}
.cats::-webkit-scrollbar{width:5px}
.cats::-webkit-scrollbar-thumb{background:rgba(255,255,255,.13);border-radius:8px}
.cats::-webkit-scrollbar-track{background:transparent}
.cat{display:flex;align-items:center;gap:9px;width:100%;padding:8px 10px;border:0;border-radius:9px;background:transparent;color:#a3aec2;text-align:left;transition:background .16s,color .16s}
.cat:hover{background:rgba(255,255,255,.06);color:#fff}
.cat.on{background:rgba(255,255,255,.09);color:#fff}
.cat-dot{width:6px;height:6px;flex:none;border-radius:50%;background:#4d5972;transition:background .16s,box-shadow .16s}
.cat.on .cat-dot{background:#a5b4fc;box-shadow:0 0 0 3px rgba(165,180,252,.16)}
.cat-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12.5px}
.cat .n{margin-left:auto;color:#77839a;font-size:10.5px;font-variant-numeric:tabular-nums}
.cat.on .n{color:#dbe1f0}
.side-foot{padding:13px 6px 0;border-top:1px solid rgba(255,255,255,.07);margin-top:12px}
.side-ver{display:flex;align-items:center;gap:7px;margin-bottom:9px;color:#7b8699;font-size:11px}
.dot-live{width:6px;height:6px;border-radius:50%;background:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.14)}
.side-refresh{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;padding:8px;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:rgba(255,255,255,.03);color:#b9c4d6;font-size:12px;transition:background .16s,color .16s}
.side-refresh:hover{background:rgba(255,255,255,.09);color:#fff}
.side-refresh svg{width:13px;height:13px}

/* ── 工作区 ─────────────────────────── */
.work{flex:1;min-width:0;margin-left:256px;display:flex;flex-direction:column}
.topbar{position:sticky;top:0;z-index:20;display:flex;align-items:flex-end;justify-content:space-between;gap:20px;padding:22px 32px 18px;background:rgba(246,247,249,.87);backdrop-filter:saturate(1.5) blur(14px);border-bottom:1px solid var(--line)}
.eyebrow{font-size:9.5px;font-weight:700;letter-spacing:1.7px;color:var(--accent);text-transform:uppercase}
h1{margin:4px 0 0;font-size:22px;font-weight:650;letter-spacing:-.55px;line-height:1.25}
.page-sub{margin:4px 0 0;font-size:12.5px;color:var(--muted)}
.top-actions{display:flex;align-items:center;gap:9px;flex:none}
.search{display:flex;align-items:center;gap:9px;width:330px;padding:0 12px;border:1px solid var(--line);border-radius:11px;background:var(--panel);box-shadow:var(--shadow-sm);transition:border-color .16s,box-shadow .16s}
.search:focus-within{border-color:#b3baf9;box-shadow:0 0 0 3px var(--accent-soft)}
.search svg{width:15px;height:15px;flex:none;color:#9aa3b4}
.search input{width:100%;min-width:0;padding:9px 0;border:0;outline:0;background:transparent;font-size:13px}
.search input::placeholder{color:#9ea6b6}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 13px;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--text);font-size:13px;white-space:nowrap;box-shadow:var(--shadow-sm);transition:background .16s,border-color .16s,color .16s,transform .12s,box-shadow .16s}
.btn svg{width:14px;height:14px}
.btn:hover{border-color:#ccd2e0;background:#fbfcff}
.btn:active{transform:translateY(1px)}
.btn:disabled{opacity:.45;cursor:default;transform:none;box-shadow:none}
.btn.primary{border-color:var(--accent);background:var(--accent);color:#fff;box-shadow:0 8px 18px -10px rgba(79,70,229,.95)}
.btn.primary:hover{background:var(--accent-dark);border-color:var(--accent-dark)}
.btn.ghost{border-color:transparent;background:transparent;box-shadow:none;color:var(--muted);padding:7px 9px}
.btn.ghost:hover{background:#f1f3f9;color:var(--text);border-color:transparent}
.btn.danger{color:var(--red)}
.btn.danger:hover{border-color:#f3c6c6;background:var(--red-soft)}
.btn.small{padding:6px 10px;font-size:12px}
.btn.danger-solid{border-color:var(--red);background:var(--red);color:#fff;box-shadow:none}
.btn.danger-solid:hover{background:#a81919;border-color:#a81919}

.content{width:100%;max-width:1240px;padding:22px 32px 56px;margin:0 auto;flex:1}

/* ── 消息条 ─────────────────────────── */
.msg{display:none;align-items:center;gap:8px;padding:10px 14px;margin-bottom:14px;border-radius:10px;font-size:12.5px;border:1px solid transparent}
.msg.show{display:flex;animation:slidein .22s ease-out}
.msg.ok{background:var(--teal-soft);color:var(--teal);border-color:#c8ece4}
.msg.err{background:var(--red-soft);color:var(--red);border-color:#f6d3d3}
@keyframes slidein{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}

/* ── 指标卡 ─────────────────────────── */
.stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.stat{display:flex;align-items:center;gap:12px;padding:14px 15px;background:var(--panel);border:1px solid var(--line);border-radius:14px;box-shadow:var(--shadow-sm);transition:box-shadow .2s,transform .2s}
.stat:hover{box-shadow:var(--shadow);transform:translateY(-1px)}
.stat .ico{width:34px;height:34px;flex:none;border-radius:10px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center}
.stat .ico svg{width:16px;height:16px}
.stat .k{font-size:11px;color:var(--muted);letter-spacing:.2px}
.stat .v{margin-top:1px;font-size:19px;font-weight:650;letter-spacing:-.4px;line-height:1.25;font-variant-numeric:tabular-nums}
.stat.accent .ico{background:var(--accent);color:#fff}
.stat.accent .v{color:var(--accent-dark)}

/* ── 面板 ───────────────────────────── */
.panel{background:var(--panel);border:1px solid var(--line);border-radius:var(--radius);box-shadow:var(--shadow-sm);overflow:hidden}
.panel-head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px;border-bottom:1px solid var(--line-soft)}
.panel-head h2{margin:0;font-size:14.5px;font-weight:600;letter-spacing:-.1px}
.panel-sub{margin:3px 0 0;color:var(--muted);font-size:11.5px}
.toolbar{display:flex;align-items:center;gap:4px;flex-wrap:wrap;justify-content:flex-end}
.check-all{display:inline-flex;align-items:center;gap:7px;padding:5px 8px;border-radius:8px;color:var(--muted);font-size:12px;white-space:nowrap;cursor:pointer}
.check-all:hover{background:#f3f5fa}
.check-all input{width:14px;height:14px;margin:0;accent-color:var(--accent)}
.sel-count{min-width:0;color:var(--accent);font-size:11.5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.tb-sep{width:1px;height:16px;background:var(--line);margin:0 3px}

/* ── 联系人列表 ─────────────────────── */
.list{padding:6px 10px 10px}
.item{display:grid;grid-template-columns:auto 40px minmax(0,1fr) auto;gap:12px;align-items:center;padding:11px 10px;border-bottom:1px solid var(--line-soft);border-radius:11px;transition:background .14s}
.item:last-child{border-bottom:0}
.item:hover{background:#f8f9fd}
.item:has(.chk:checked){background:#f6f7ff}
.item:has(.chk:checked) .name{color:#2c2f6b}
.chk{width:15px;height:15px;margin:0;flex:none;accent-color:var(--accent);cursor:pointer}
.avatar{width:38px;height:38px;flex:none;border-radius:11px;display:grid;place-items:center;font-weight:650;font-size:12.5px;letter-spacing:.2px;box-shadow:inset 0 0 0 1px rgba(20,24,36,.04)}
.item-body{min-width:0}
.line1{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.name{font-weight:600;font-size:14px;letter-spacing:-.1px}
.badge{padding:1px 7px;border-radius:20px;background:#f1f3f9;color:#5c6577;font-size:10.5px;line-height:1.6;white-space:nowrap}
.badge.user{background:var(--teal-soft);color:var(--teal)}
.badge.edited{background:var(--amber-soft);color:var(--amber)}
.book{color:var(--faint);font-size:11px;white-space:nowrap}
.tels{display:flex;gap:5px;flex-wrap:wrap;margin-top:6px}
.tel{padding:2px 8px;border:1px solid var(--line);border-radius:7px;background:#fafbfe;color:#39435a;font-size:11.5px;font-variant-numeric:tabular-nums;transition:border-color .14s,color .14s,background .14s}
.tel:hover{border-color:#bfc5f8;color:var(--accent);background:var(--accent-soft)}
.item-ops{display:flex;gap:2px;flex:none;opacity:0;transition:opacity .16s}
.item:hover .item-ops,.item:focus-within .item-ops{opacity:1}
.icon-btn{display:grid;place-items:center;width:31px;height:31px;border:1px solid transparent;border-radius:8px;background:transparent;color:var(--muted);transition:background .14s,color .14s,border-color .14s}
.icon-btn svg{width:15px;height:15px}
.icon-btn:hover{background:#eef1f8;color:var(--text);border-color:var(--line)}
.icon-btn.danger:hover{background:var(--red-soft);color:var(--red);border-color:#f6d3d3}
.empty{padding:56px 20px;text-align:center}
.empty-mark{width:44px;height:44px;margin:0 auto 12px;border-radius:13px;background:#f1f3f9;color:#98a1b3;display:grid;place-items:center;font-size:18px;font-weight:600}
.empty h3{margin:0 0 4px;font-size:13.5px;font-weight:600}
.empty p{margin:0;color:var(--muted);font-size:12px}

/* ── 抽屉 ───────────────────────────── */
.scrim{position:fixed;inset:0;z-index:40;background:rgba(14,17,24,.42);backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:opacity .24s}
.scrim.on{opacity:1;pointer-events:auto}
.drawer{position:fixed;top:0;right:0;bottom:0;z-index:50;width:480px;max-width:100%;display:flex;flex-direction:column;background:var(--panel);box-shadow:-30px 0 70px -30px rgba(14,17,24,.45);transform:translateX(102%);transition:transform .3s cubic-bezier(.32,.72,0,1)}
.drawer.on{transform:none}
.drawer-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:17px 20px;border-bottom:1px solid var(--line-soft)}
.drawer-head h2{margin:0;font-size:15px;font-weight:600;letter-spacing:-.2px}
.drawer-head .sub{margin:2px 0 0;font-size:11.5px;color:var(--muted)}
.drawer-body{flex:1;overflow:auto;padding:20px;overscroll-behavior:contain}
.profile{display:flex;align-items:center;gap:13px;padding-bottom:18px;margin-bottom:6px;border-bottom:1px solid var(--line-soft)}
.profile .avatar{width:50px;height:50px;border-radius:14px;font-size:16px}
.profile h3{margin:0 0 5px;font-size:17px;font-weight:650;letter-spacing:-.3px}
.profile-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.drow{display:grid;grid-template-columns:86px minmax(0,1fr) auto;gap:10px;align-items:start;padding:11px 0;border-bottom:1px solid var(--line-soft)}
.drow:last-of-type{border-bottom:0}
.dk{font-size:11px;color:var(--muted);padding-top:3px;letter-spacing:.2px}
.dv{font-size:13.5px;word-break:break-word}
.dv.phone{font-variant-numeric:tabular-nums;font-weight:500}
.dv-ops{display:flex;align-items:center;gap:2px;flex:none}
.drow .icon-btn{width:26px;height:26px;opacity:0}
.drow:hover .icon-btn{opacity:1}
.call{font-size:11.5px;color:var(--accent);text-decoration:none;padding:5px 7px;border-radius:7px;white-space:nowrap}
.call:hover{background:var(--accent-soft)}
.fld{margin-bottom:13px}
.lbl{display:flex;align-items:center;gap:6px;margin-bottom:5px;font-size:11px;color:var(--muted);letter-spacing:.2px}
.tag-edit{padding:0 5px;border-radius:5px;background:var(--amber-soft);color:var(--amber);font-size:10px;line-height:1.6}
.fld input,.fld select{width:100%;padding:9px 11px;border:1px solid var(--line);border-radius:9px;background:#fff;outline:0;transition:border-color .16s,box-shadow .16s}
.fld input:focus,.fld select:focus{border-color:#b3baf9;box-shadow:0 0 0 3px var(--accent-soft)}
.row-2{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px;align-items:center}
.drawer-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:20px;padding-top:16px;border-top:1px solid var(--line-soft)}
.hint-box{margin-top:16px;padding:11px 13px;border:1px dashed #d8dded;border-radius:10px;background:#fafbff;color:var(--muted);font-size:11.5px;line-height:1.6}
.hint-box b{color:var(--text)}

/* ── 账号页 ─────────────────────────── */
.acc-hero{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:22px 24px;margin-bottom:16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(115deg,#fff 30%,#f5f6ff 100%);box-shadow:var(--shadow-sm)}
.acc-hero h2{margin:0 0 6px;font-size:17px;font-weight:650;letter-spacing:-.35px}
.acc-hero p{margin:0;max-width:620px;color:var(--muted);font-size:12.5px;line-height:1.65}
.srv{display:inline-flex;align-items:center;gap:9px;margin-top:12px;padding:6px 10px;border:1px solid #dfe4f4;border-radius:9px;background:#fff;box-shadow:var(--shadow-sm)}
.srv span{font-size:9.5px;font-weight:700;letter-spacing:1px;color:var(--accent);text-transform:uppercase}
.srv b{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;font-weight:500;color:#39435a}
.srv .link-btn{border:0;background:transparent;color:var(--accent);font-size:11.5px;padding:2px 4px;border-radius:5px}
.srv .link-btn:hover{background:var(--accent-soft)}
.hero-count{flex:none;text-align:center;padding:8px 22px;border-left:1px solid var(--line)}
.hero-count b{display:block;font-size:30px;font-weight:650;letter-spacing:-1px;line-height:1.1;font-variant-numeric:tabular-nums;color:var(--accent)}
.hero-count span{font-size:11px;color:var(--muted)}
.acc-grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(330px,.88fr);gap:16px;align-items:start}
.acc{display:flex;align-items:center;gap:12px;padding:13px 17px;border-bottom:1px solid var(--line-soft);transition:background .14s}
.acc:last-child{border-bottom:0}
.acc:hover{background:#f9faff}
.acc-av{width:37px;height:37px;flex:none;border-radius:11px;display:grid;place-items:center;background:var(--accent-soft);color:var(--accent-dark);font-weight:650;font-size:14px;text-transform:uppercase}
.acc-av.mac{background:var(--teal-soft);color:var(--teal)}
.acc-main{flex:1;min-width:0}
.acc-top{display:flex;align-items:center;gap:7px}
.acc-top b{font-size:13.5px;font-weight:600;letter-spacing:-.1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{padding:1px 7px;border:1px solid transparent;border-radius:999px;font-size:10px;font-weight:600;letter-spacing:.3px;white-space:nowrap}
.pill.ios{background:var(--accent-soft);color:var(--accent-dark);border-color:#dfe3ff}
.pill.macos{background:var(--teal-soft);color:var(--teal);border-color:#c8ece4}
.acc-meta{display:flex;align-items:center;gap:6px;margin-top:4px;color:var(--faint);font-size:11px;flex-wrap:wrap}
.acc-meta code{padding:1px 5px;border-radius:4px;background:#f3f5fa;color:#6b7488;font-size:10.5px}
.acc-ops{display:flex;gap:2px;flex:none}
.acc-form-panel .panel-head{border-bottom:1px solid var(--line-soft)}
.acc-form{padding:18px}
.seg{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.seg-item{padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:#fff;text-align:left;transition:border-color .16s,background .16s,box-shadow .16s}
.seg-item b{display:block;font-size:12.5px;font-weight:600}
.seg-item small{display:block;margin-top:2px;font-size:10.5px;color:var(--muted);line-height:1.4}
.seg-item:hover{border-color:#ccd2e0;background:#fbfcff}
.seg-item.on{border-color:#b3baf9;background:var(--accent-soft);box-shadow:0 0 0 3px rgba(79,70,229,.07)}
.seg-item.on b{color:var(--accent-dark)}
.input-wrap{position:relative}
.input-wrap input{padding-right:52px}
.reveal{position:absolute;top:50%;right:5px;transform:translateY(-50%);padding:5px 8px;border:0;border-radius:7px;background:transparent;color:var(--faint);font-size:11px}
.reveal:hover{background:#f1f3f9;color:var(--text)}
.form-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:18px;padding-top:15px;border-top:1px solid var(--line-soft)}
.form-note{margin:12px 0 0;color:var(--faint);font-size:11px;line-height:1.6}
.tips{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;margin-top:16px}
.tip{display:flex;gap:11px;padding:17px 18px;border-right:1px solid var(--line-soft)}
.tip:last-child{border-right:0}
.tip-n{flex:none;width:22px;height:22px;border-radius:7px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-size:10px;font-weight:700}
.tip b{display:block;font-size:12.5px;font-weight:600;margin-bottom:3px}
.tip p{margin:0;color:var(--muted);font-size:11.5px;line-height:1.6}
body.locked{overflow:hidden}

/* ── 响应式 ─────────────────────────── */
@media(max-width:1080px){.stats{grid-template-columns:repeat(2,minmax(0,1fr))}.search{width:260px}.acc-grid{grid-template-columns:1fr}.tips{grid-template-columns:1fr}.tip{border-right:0;border-bottom:1px solid var(--line-soft)}.tip:last-child{border-bottom:0}}
@media(max-width:900px){
.app{flex-direction:column}
.sidebar{position:static;width:auto;padding:13px 14px 10px}
.brand{padding:0 4px 12px}
.nav{flex-direction:row;padding:0 0 8px}
.nav-item{flex:1;justify-content:center}
.cat-block{flex:none;padding-top:9px;border-top:1px solid rgba(255,255,255,.07)}
.side-label{display:none}
.cats{flex-direction:row;overflow-x:auto;padding-bottom:3px;scrollbar-width:none}
.cats::-webkit-scrollbar{display:none}
.cat{width:auto;flex:none;white-space:nowrap}
.side-foot{display:none}
.work{margin-left:0}
.topbar{position:static;flex-direction:column;align-items:stretch;padding:16px;gap:12px}
.top-actions{flex-wrap:wrap}
.search{width:100%;order:2}
.content{padding:14px 16px 40px}
.stats{grid-template-columns:repeat(2,minmax(0,1fr))}
.panel-head{flex-direction:column;align-items:flex-start;gap:10px}
.toolbar{justify-content:flex-start}
.item{grid-template-columns:auto 34px minmax(0,1fr)}
.item-ops{grid-column:3;opacity:1;margin-top:-4px}
.avatar{width:34px;height:34px}
.acc-hero{flex-direction:column;align-items:flex-start;gap:14px}
.hero-count{display:none}
.drawer{width:100%}
.drow{grid-template-columns:74px minmax(0,1fr) auto}
}
@media(hover:none){.item-ops{opacity:1}.drow .icon-btn{opacity:1}}
</style>
</head>
<body>
<div class="app">
<aside class="sidebar">
<div class="brand">
<div class="logo">vC</div>
<div><b>vCards</b><small>ADDRESS BOOK</small></div>
</div>
<nav class="nav">
<button type="button" class="nav-item on" data-view="contacts" onclick="setView('contacts')">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19v-1.4a3.6 3.6 0 0 0-3.6-3.6H7.6A3.6 3.6 0 0 0 4 17.6V19"></path><circle cx="10" cy="8.2" r="3.2"></circle><path d="M20 19v-1.4a3.6 3.6 0 0 0-2.7-3.5"></path><path d="M15.4 5a3.2 3.2 0 0 1 0 6.4"></path></svg>
<span>通讯录</span><span class="n" id="navContactN">0</span>
</button>
<button type="button" class="nav-item" data-view="accounts" onclick="setView('accounts')">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="10" width="16" height="10" rx="3"></rect><path d="M8 10V7.6a4 4 0 0 1 8 0V10"></path><circle cx="12" cy="15" r="1.3"></circle></svg>
<span>账号与同步</span><span class="n" id="navAccN">0</span>
</button>
</nav>
<div class="cat-block" id="catBlock">
<div class="side-label">分类浏览</div>
<div id="cats" class="cats"></div>
</div>
<div class="side-foot">
<span id="ver" class="side-ver"><span class="dot-live"></span>加载中…</span>
<button type="button" class="side-refresh" onclick="location.reload()">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7"></path><path d="M20 5v6h-6"></path></svg>
刷新数据
</button>
</div>
</aside>

<div class="work">
<header class="topbar">
<div>
<div class="eyebrow" id="pageEyebrow">CONTACTS</div>
<h1 id="pageTitle">通讯录</h1>
<p class="page-sub" id="pageSub">浏览分类、搜索号码、维护联系人</p>
</div>
<div class="top-actions">
<label class="search" id="searchWrap">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.6-3.6"></path></svg>
<input id="q" placeholder="搜索名称、分类、电话…" oninput="render()">
</label>
<button type="button" class="btn primary" id="btnNewContact" onclick="openNew()">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>
新增联系人
</button>
<button type="button" class="btn primary" id="btnNewAccount" onclick="focusAccForm()" style="display:none">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"></path></svg>
新增账号
</button>
</div>
</header>

<main class="content">
<div id="msg" class="msg"></div>

<section id="viewContacts">
<div class="stats">
<div class="stat"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 19v-1.4a3.6 3.6 0 0 0-3.6-3.6H7.6A3.6 3.6 0 0 0 4 17.6V19"></path><circle cx="10" cy="8.2" r="3.2"></circle><path d="M20 19v-1.4a3.6 3.6 0 0 0-2.7-3.5"></path></svg></div><div><div class="k">联系人总数</div><div class="v" id="metricTotal">0</div></div></div>
<div class="stat accent"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.6"></circle></svg></div><div><div class="k">当前显示</div><div class="v" id="metricShown">0</div></div></div>
<div class="stat"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"></path></svg></div><div><div class="k">已选中</div><div class="v" id="metricSelected">0</div></div></div>
<div class="stat"><div class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l8 4.5-8 4.5-8-4.5L12 4Z"></path><path d="M4 12.5L12 17l8-4.5"></path><path d="M4 16.5L12 21l8-4.5"></path></svg></div><div><div class="k">分类数</div><div class="v" id="metricBooks">0</div></div></div>
</div>

<section class="panel">
<div class="panel-head">
<div><h2>联系人列表</h2><p id="stat" class="panel-sub"></p></div>
<div class="toolbar">
<label class="check-all"><input type="checkbox" id="all" onchange="toggleAll()">全选</label>
<span id="selinfo" class="sel-count"></span>
<span class="tb-sep"></span>
<button type="button" class="btn ghost small" id="btnCopy" onclick="copySelectedNumbers()">复制号码</button>
<button type="button" class="btn ghost small" id="btnCSV" onclick="exportCSV()">导出 CSV</button>
<button type="button" class="btn ghost small" onclick="clearSel()">清空</button>
</div>
</div>
<div id="list" class="list"></div>
</section>
</section>

<section id="viewAccounts" style="display:none">
<div class="acc-hero">
<div>
<h2>同步账号</h2>
<p>每个账号按设备类型生成不同的通讯簿结构：iOS 账号按分类拆分，macOS 账号合并为一本，用更少的请求完成整本下发，避免大批量抓取超时。</p>
<div class="srv"><span>CardDAV</span><b id="srvAddr">—</b><button type="button" class="link-btn" onclick="copyText(location.origin)">复制地址</button></div>
</div>
<div class="hero-count"><b id="accTotal">0</b><span>个账号</span></div>
</div>

<div class="acc-grid">
<section class="panel">
<div class="panel-head"><div><h2>账号列表</h2><p class="panel-sub">用这些用户名和密码在设备上登录</p></div></div>
<div id="accountList"></div>
</section>

<section class="panel acc-form-panel">
<div class="panel-head"><div><h2 id="accFormTitle">新增账号</h2><p class="panel-sub" id="accFormHint">填写用户名、密码并选择设备类型</p></div></div>
<form class="acc-form" onsubmit="saveAccount(event)">
<div class="fld"><label class="lbl" for="accUser">用户名</label><input id="accUser" placeholder="例如 cn、mac、dad" autocomplete="off" required></div>
<div class="fld"><label class="lbl" for="accPass">密码</label>
<div class="input-wrap"><input id="accPass" type="password" placeholder="新增时必填，留空表示不修改" autocomplete="new-password"><button type="button" class="reveal" id="passToggle" onclick="togglePass()">显示</button></div>
</div>
<div class="fld"><span class="lbl">设备类型</span>
<div class="seg">
<button type="button" class="seg-item on" data-plat="ios" onclick="setPlatform('ios')"><b>iOS / iPadOS</b><small>按分类拆成多个通讯簿</small></button>
<button type="button" class="seg-item" data-plat="macos" onclick="setPlatform('macos')"><b>macOS</b><small>全部合并为一个通讯簿</small></button>
</div>
<input type="hidden" id="accPlatform" value="ios">
</div>
<div class="form-actions">
<button type="submit" class="btn primary" id="accSubmit">保存账号</button>
<button type="button" class="btn" id="accCancelEdit" onclick="resetAccForm()" style="display:none">取消编辑</button>
<input type="hidden" id="accOriginal">
</div>
<p class="form-note">账号密码仅用于 CardDAV 登录，与后台管理登录相互独立。</p>
</form>
</section>
</div>

<section class="panel tips">
<div class="tip"><span class="tip-n">01</span><div><b>在设备上添加账户</b><p>设置 → 通讯录 → 账户 → 添加其他账户 → CardDAV，填入上方地址与账号。</p></div></div>
<div class="tip"><span class="tip-n">02</span><div><b>修改后同步一次</b><p>保存账号会提升数据版本，回到设备手动下拉刷新即可获取最新通讯簿。</p></div></div>
<div class="tip"><span class="tip-n">03</span><div><b>手机也能直接编辑</b><p>已开放 PUT / DELETE，手机上改动的联系人会写回覆盖层并保留原字段。</p></div></div>
</section>
</section>
</main>
</div>
</div>

<div id="scrim" class="scrim" onclick="closeDrawer()"></div>
<aside id="drawer" class="drawer" role="dialog" aria-modal="true">
<div class="drawer-head">
<div><h2 id="drawerTitle">联系人</h2><p class="sub" id="drawerSub"></p></div>
<button type="button" class="icon-btn" onclick="closeDrawer()" title="关闭" aria-label="关闭">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>
</button>
</div>
<div class="drawer-body">
<div id="detail" style="display:none"></div>
<div id="editor" style="display:none"></div>
<div id="newPanel" style="display:none"></div>
</div>
</aside>

<script>
const $=id=>document.getElementById(id);
let DATA={contacts:[],version:0},BOOKS=[],CUR=null,SEL=new Set(),CAT='',VIEW='contacts';
const FIELD_NAMES={TEL:'电话',EMAIL:'邮箱',URL:'网址',ORG:'组织',ADR:'地址',NOTE:'备注',FN:'名称',N:'姓名',TITLE:'头衔',BDAY:'生日',IMPP:'即时通讯','X-SOCIALPROFILE':'社交账号'};
const TINTS=[['#eef1fe','#4338ca'],['#e6f7f4','#0f766e'],['#fdf1e6','#b45309'],['#fdeef5','#a21caf'],['#e9f2fe','#1d4ed8'],['#f2eefe','#6d28d9'],['#fdecec','#b91c1c']];
const SVG={
edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4Z"></path><path d="M13.5 6.5l4 4"></path></svg>',
trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"></path><path d="M9 7V5h6v2"></path><path d="M6 7l1 13h10l1-13"></path></svg>',
eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.6"></circle></svg>',
copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2.5"></rect><path d="M5 15V6a2 2 0 0 1 2-2h9"></path></svg>',
x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"></path></svg>'
};
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function enc(s){return encodeURIComponent(String(s??'')).replace(/'/g,'%27')}
function fieldName(label){const raw=String(label||'').replace(/^[A-Za-z0-9-]+\\./,'');const base=raw.split(';')[0].toUpperCase();return FIELD_NAMES[base]||raw}
function tintOf(s){let h=0;for(let i=0;i<String(s).length;i++)h=(h*31+String(s).charCodeAt(i))%997;return TINTS[h%TINTS.length]}
function notify(text,ok=true){const m=$('msg');m.className='msg show '+(ok?'ok':'err');m.textContent=text;clearTimeout(notify._t);notify._t=setTimeout(()=>{m.className='msg'},3500)}
async function api(path,opts={}){const r=await fetch(path,opts);const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('HTTP '+r.status));return j}

/* 视图切换 */
function setView(v){
VIEW=v;
document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('on',b.getAttribute('data-view')===v));
$('viewContacts').style.display=v==='contacts'?'block':'none';
$('viewAccounts').style.display=v==='accounts'?'block':'none';
$('catBlock').style.display=v==='contacts'?'flex':'none';
$('searchWrap').style.display=v==='contacts'?'flex':'none';
$('btnNewContact').style.display=v==='contacts'?'inline-flex':'none';
$('btnNewAccount').style.display=v==='accounts'?'inline-flex':'none';
$('pageEyebrow').textContent=v==='contacts'?'CONTACTS':'SETTINGS';
$('pageTitle').textContent=v==='contacts'?'通讯录':'账号与同步';
$('pageSub').textContent=v==='contacts'?'浏览分类、搜索号码、维护联系人':'管理 CardDAV 登录账号与设备同步方式';
if(v==='accounts')loadAccounts();
}
function openAccounts(){setView('accounts')}
function closeAccounts(){setView('contacts')}

/* 抽屉 */
function openDrawer(){$('drawer').classList.add('on');$('scrim').classList.add('on');document.body.classList.add('locked')}
function closeDrawer(){$('drawer').classList.remove('on');$('scrim').classList.remove('on');document.body.classList.remove('locked')}
function closeDetail(){closeDrawer()}
function closeEditor(){closeDrawer()}
function closeNew(){closeDrawer()}

/* 账号 */
async function loadAccounts(){
try{const data=await api('/admin/api/accounts');renderAccounts(data.accounts||[])}
catch(e){notify('加载账号失败：'+e.message,false)}
}
function renderAccounts(list){
$('accTotal').textContent=list.length;
$('navAccN').textContent=list.length;
if(!list.length){$('accountList').innerHTML='<div class="empty"><div class="empty-mark">—</div><h3>还没有账号</h3><p>在右侧新增第一个登录账号</p></div>';return}
$('accountList').innerHTML=list.map(a=>{
const ios=a.platform!=='macos';
return '<div class="acc">'+
'<div class="acc-av'+(ios?'':' mac')+'">'+esc((a.username||'?').slice(0,1))+'</div>'+
'<div class="acc-main"><div class="acc-top"><b>'+esc(a.username)+'</b><span class="pill '+(ios?'ios':'macos')+'">'+(ios?'iOS':'macOS')+'</span></div>'+
'<div class="acc-meta"><span>'+(ios?'多分类簿':'合并簿')+'</span><code>'+(ios?'/cn/addressbooks/':'/cn/macos/')+'</code></div></div>'+
'<div class="acc-ops">'+
'<button type="button" class="icon-btn" title="编辑账号" onclick="editAccount(\\''+enc(a.username)+'\\',\\''+esc(a.platform)+'\\')">'+SVG.edit+'</button>'+
'<button type="button" class="icon-btn danger" title="删除账号" onclick="delAccount(\\''+enc(a.username)+'\\')">'+SVG.trash+'</button>'+
'</div></div>';
}).join('');
}
function setPlatform(v){
$('accPlatform').value=v;
document.querySelectorAll('.seg-item').forEach(b=>b.classList.toggle('on',b.getAttribute('data-plat')===v));
}
function togglePass(){
const p=$('accPass'),t=$('passToggle'),show=p.type==='password';
p.type=show?'text':'password';t.textContent=show?'隐藏':'显示';
}
function resetAccForm(){
$('accUser').value='';$('accPass').value='';$('accPass').type='password';$('passToggle').textContent='显示';
$('accOriginal').value='';setPlatform('ios');
$('accFormTitle').textContent='新增账号';
$('accFormHint').textContent='填写用户名、密码并选择设备类型';
$('accCancelEdit').style.display='none';
}
function focusAccForm(){
const el=$('accUser');el.scrollIntoView({behavior:'smooth',block:'center'});setTimeout(()=>el.focus(),120);
}
function editAccount(username,platform){
const name=decodeURIComponent(username);
$('accUser').value=name;$('accOriginal').value=name;$('accPass').value='';$('accPass').type='password';$('passToggle').textContent='显示';
setPlatform(platform==='macos'?'macos':'ios');
$('accFormTitle').textContent='编辑账号';
$('accFormHint').textContent='密码留空则保持原密码不变';
$('accCancelEdit').style.display='inline-flex';
focusAccForm();
}
async function saveAccount(ev){
ev.preventDefault();
const username=$('accUser').value.trim();if(!username)return;
const original=$('accOriginal').value;
const password=$('accPass').value;
if(!original&&!password){notify('新增账号需要设置密码',false);$('accPass').focus();return}
const payload={username,platform:$('accPlatform').value};
if(original)payload.originalUsername=original;
if(password)payload.password=password;
try{
const r=await api('/admin/api/accounts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
notify((original?'账号已更新':'账号已创建')+'，数据版本 v'+r.version);
resetAccForm();await loadAccounts();await loadVersion();
}catch(e){notify('保存失败：'+e.message,false)}
}
async function delAccount(username){
const name=decodeURIComponent(username);
if(!confirm('确定删除账号「'+name+'」？使用该账号的设备需要重新配置。'))return;
try{
const r=await api('/admin/api/accounts',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:name})});
notify('账号已删除，数据版本 v'+r.version);
if($('accOriginal').value===name)resetAccForm();
await loadAccounts();await loadVersion();
}catch(e){notify('删除失败：'+e.message,false)}
}

/* 数据加载 */
async function loadVersion(){
try{const d=await api('/admin/api/contacts');DATA.version=d.version;$('ver').innerHTML='<span class="dot-live"></span>数据版本 v'+d.version}
catch(e){}
}
async function load(){
try{
DATA=await api('/admin/api/contacts');
BOOKS=(await api('/admin/api/books')).books;
$('ver').innerHTML='<span class="dot-live"></span>数据版本 v'+DATA.version;
$('srvAddr').textContent=location.origin;
$('navContactN').textContent=DATA.contacts.length;
$('metricBooks').textContent=BOOKS.length;
renderCats();render();
}catch(e){notify('加载失败：'+e.message,false)}
}
function tels(c){return c.fields.filter(f=>/^(?:[A-Za-z0-9-]+\\.)?TEL/i.test(f.label)&&f.value&&f.value!=='__DELETED__').map(f=>f.value)}
function catCounts(){const m={};for(const c of DATA.contacts)m[c.book]=(m[c.book]||0)+1;return m}
function renderCats(){
const counts=catCounts();
let h='<button type="button" class="cat'+(CAT===''?' on':'')+'" data-cat=""><span class="cat-dot"></span><span class="cat-name">全部联系人</span><span class="n">'+DATA.contacts.length+'</span></button>';
for(const b of BOOKS){
const n=counts[b.name]||0;
h+='<button type="button" class="cat'+(CAT===b.name?' on':'')+'" data-cat="'+esc(b.name)+'"><span class="cat-dot"></span><span class="cat-name">'+esc(b.name)+'</span><span class="n">'+n+'</span></button>';
}
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
$('stat').textContent='显示 '+list.length+' / '+DATA.contacts.length+' 个联系人'+(list.length!==DATA.contacts.length?'（已筛选）':'');
$('metricTotal').textContent=DATA.contacts.length;
$('metricShown').textContent=list.length;
$('metricSelected').textContent=SEL.size;
$('navContactN').textContent=DATA.contacts.length;
$('list').innerHTML=list.map(c=>{
const edited=c.fields.some(f=>f.edited);
const ts=tels(c);
const t=tintOf(c.name||c.uid);
const initials=(c.name||'?').trim().slice(0,2).toUpperCase();
const telHtml=ts.length?ts.map(v=>'<button type="button" class="tel" title="点击复制" onclick="copyText(\\''+enc(v)+'\\',true)">'+esc(v)+'</button>').join(''):'<span class="book">无电话</span>';
return '<div class="item">'+
'<input type="checkbox" class="chk" data-uid="'+esc(c.uid)+'"'+(SEL.has(c.uid)?' checked':'')+' onchange="toggleSel(\\''+enc(c.uid)+'\\')">'+
'<div class="avatar" style="background:'+t[0]+';color:'+t[1]+'">'+esc(initials)+'</div>'+
'<div class="item-body"><div class="line1"><span class="name">'+esc(c.name)+'</span>'+
(c.source==='user'?'<span class="badge user">我添加的</span>':'<span class="badge">GitHub</span>')+
(edited?'<span class="badge edited">已修改</span>':'')+
'<span class="book">'+esc(c.book)+'</span></div>'+
'<div class="tels">'+telHtml+'</div></div>'+
'<div class="item-ops">'+
'<button type="button" class="icon-btn" title="查看详情" onclick="openDetail(\\''+enc(c.uid)+'\\')">'+SVG.eye+'</button>'+
'<button type="button" class="icon-btn" title="编辑" onclick="openEdit(\\''+enc(c.uid)+'\\')">'+SVG.edit+'</button>'+
'</div></div>';
}).join('')||'<div class="empty"><div class="empty-mark">0</div><h3>没有匹配的联系人</h3><p>换个关键词，或在左侧切换分类</p></div>';
$('all').checked=list.length>0&&list.every(c=>SEL.has(c.uid));
updateSelInfo();
renderCats();
}
function toggleSel(uid){uid=decodeURIComponent(uid);if(SEL.has(uid))SEL.delete(uid);else SEL.add(uid);render()}
function toggleAll(){const list=filtered();const all=list.length>0&&list.every(c=>SEL.has(c.uid));list.forEach(c=>all?SEL.delete(c.uid):SEL.add(c.uid));render()}
function clearSel(){SEL.clear();render()}
function updateSelInfo(){
const has=SEL.size>0;
$('selinfo').textContent=has?'已选 '+SEL.size+' 个':'';
$('btnCopy').disabled=!has;$('btnCSV').disabled=!has;
}
async function copyText(t,dec=false){
if(dec)t=decodeURIComponent(t);
try{await navigator.clipboard.writeText(t);notify('已复制：'+t.slice(0,40))}
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

/* 详情 / 编辑 / 新增 */
function badgesOf(c){
return (c.source==='user'?'<span class="badge user">我添加的</span>':'<span class="badge">GitHub</span>')+
(c.fields.some(f=>f.edited)?'<span class="badge edited">已修改</span>':'')+
'<span class="book">'+esc(c.book)+'</span>';
}
function openDetail(uid){
const c=DATA.contacts.find(x=>x.uid===decodeURIComponent(uid));if(!c)return;
CUR=c;
$('drawerTitle').textContent='联系人详情';
$('drawerSub').textContent=c.book;
const t=tintOf(c.name||c.uid);
const initials=(c.name||'?').trim().slice(0,2).toUpperCase();
const rows=c.fields.filter(f=>f.value&&f.value!=='__DELETED__').map(f=>{
const tel=/^TEL/i.test(f.label);
return '<div class="drow"><span class="dk">'+esc(fieldName(f.label))+(f.edited?' · 已改':'')+'</span>'+
'<span class="dv'+(tel?' phone':'')+'">'+esc(f.value)+'</span>'+
'<span class="dv-ops"><button type="button" class="icon-btn" title="复制" onclick="copyText(\\''+enc(f.value)+'\\',true)">'+SVG.copy+'</button>'+
(tel?'<a class="call" href="tel:'+esc(f.value)+'">拨打</a>':'')+'</span></div>';
}).join('');
$('detail').innerHTML='<div class="profile"><div class="avatar" style="background:'+t[0]+';color:'+t[1]+'">'+esc(initials)+'</div>'+
'<div><h3>'+esc(c.name)+'</h3><div class="profile-meta">'+badgesOf(c)+'</div></div></div>'+
rows+
'<div class="drawer-actions"><button type="button" class="btn primary" onclick="openEdit(\\''+enc(c.uid)+'\\')">'+SVG.edit+'编辑此联系人</button>'+
'<button type="button" class="btn" onclick="closeDrawer()">关闭</button></div>';
$('detail').style.display='block';$('editor').style.display='none';$('newPanel').style.display='none';
openDrawer();
}
function openEdit(uid){
const c=DATA.contacts.find(x=>x.uid===decodeURIComponent(uid));if(!c)return;
CUR=c;
$('drawerTitle').textContent='编辑联系人';
$('drawerSub').textContent=c.book;
$('editor').innerHTML='<div class="profile"><div class="avatar" style="background:'+tintOf(c.name||c.uid)[0]+';color:'+tintOf(c.name||c.uid)[1]+'">'+esc((c.name||'?').trim().slice(0,2).toUpperCase())+'</div>'+
'<div><h3>'+esc(c.name)+'</h3><div class="profile-meta">'+badgesOf(c)+'</div></div></div>'+
'<div id="fields">'+
CUR.fields.map((f,i)=>
'<div class="fld" data-i="'+i+'"><label class="lbl">'+esc(fieldName(f.label))+(f.edited?'<span class="tag-edit">已修改</span>':'')+'</label>'+
'<div class="row-2"><input value="'+esc(f.value)+'" data-i="'+i+'" placeholder="'+esc(fieldName(f.label))+'">'+
'<button type="button" class="icon-btn danger" onclick="removeField('+i+')" title="删除此字段">'+SVG.trash+'</button></div></div>'
).join('')+
'</div>'+
'<form class="fld" style="margin-top:16px" onsubmit="addField(event)"><label class="lbl" for="afVal">添加电话</label>'+
'<div class="row-2"><input id="afVal" placeholder="输入号码后回车"><button type="submit" class="btn">添加</button></div></form>'+
'<div class="drawer-actions"><button type="button" class="btn primary" onclick="saveEdit()">保存修改</button>'+
'<button type="button" class="btn" onclick="openDetail(\\''+enc(c.uid)+'\\')">返回详情</button>'+
'<button type="button" class="btn danger" onclick="delContact()">删除联系人</button></div>';
$('detail').style.display='none';$('editor').style.display='block';$('newPanel').style.display='none';
openDrawer();
}
function removeField(i){
CUR.fields[i].value='__DELETED__';CUR.fields[i].edited=true;
const row=document.querySelector('#fields .fld[data-i="'+i+'"]');
if(row){row.style.opacity='.38';const inp=row.querySelector('input');if(inp)inp.disabled=true}
}
function addField(ev){
ev.preventDefault();
const v=$('afVal').value.trim();if(!v)return;
const base='TEL;TYPE=CELL';let n=1,k='+'+base;
while(CUR.fields.some(f=>f.key===k)){n++;k='+'+base+'~'+n;}
CUR.fields.push({key:k,label:base,value:v,edited:true});
const c=CUR;openEdit(c.uid);CUR=c;
const el=$('afVal');if(el)el.focus();
}
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
try{
const{fields,deleted}=collectFields();
const r=await api('/admin/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:CUR.uid,fields,deleted})});
notify('已保存，数据版本 v'+r.version);
closeDrawer();await load();
}catch(e){notify('保存失败：'+e.message,false)}
}
async function delContact(){
if(!confirm('确定删除「'+CUR.name+'」？基线联系人删除后，上游更新也不会让它复活。'))return;
try{
const r=await api('/admin/api/contact',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({uid:CUR.uid})});
notify('已删除，数据版本 v'+r.version);
closeDrawer();SEL.delete(CUR.uid);await load();
}catch(e){notify('删除失败：'+e.message,false)}
}
function openNew(){
$('drawerTitle').textContent='新增联系人';
$('drawerSub').textContent='创建在指定分类下';
$('newPanel').innerHTML='<div class="fld"><label class="lbl" for="nUid">名称</label><input id="nUid" placeholder="例如 老王便利店" required></div>'+
'<div class="fld"><label class="lbl" for="nBook">分类</label><select id="nBook"></select></div>'+
'<div class="fld"><label class="lbl">或新建分类</label><input id="nNewBook" placeholder="输入新分类名称" style="display:none"><label class="check-all" style="margin-top:6px;padding-left:0"><input type="checkbox" id="nNewBookChk" onchange="toggleNewBook()">新建一个分类</label></div>'+
'<div class="drawer-actions"><button type="button" class="btn primary" onclick="submitNew()">创建联系人</button>'+
'<button type="button" class="btn" onclick="closeDrawer()">取消</button></div>'+
'<div class="hint-box">新联系人会作为「我添加的」写入覆盖层，不会影响 GitHub 基线数据。</div>';
$('nBook').innerHTML=BOOKS.map(b=>'<option value="'+esc(b.id)+'">'+esc(b.name)+'</option>').join('');
$('nUid').value='';
$('detail').style.display='none';$('editor').style.display='none';$('newPanel').style.display='block';
openDrawer();
setTimeout(()=>$('nUid').focus(),80);
}
function toggleNewBook(){
const on=$('nNewBookChk').checked;
$('nNewBook').style.display=on?'block':'none';
$('nBook').style.display=on?'none':'block';
if(on)setTimeout(()=>$('nNewBook').focus(),40);
}
async function submitNew(){
const name=$('nUid').value.trim();
if(!name){notify('请填写名称',false);$('nUid').focus();return}
const payload={uid:name,fields:[{key:'FN#0',value:name},{key:'ORG#0',value:name}]};
if($('nNewBookChk').checked)payload.newBook=$('nNewBook').value.trim();else payload.bookId=$('nBook').value;
try{
const r=await api('/admin/api/contacts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
notify('已创建，数据版本 v'+r.version);
closeDrawer();await load();openEdit(encodeURIComponent(name));
}catch(e){notify('创建失败：'+e.message,false)}
}

document.querySelector('.nav').addEventListener('click',function(ev){
const b=ev.target.closest('[data-view]');if(b)setView(b.getAttribute('data-view'));
});
$('cats').addEventListener('click',function(ev){
const b=ev.target.closest('[data-cat]');if(b)setCat(b.getAttribute('data-cat'));
});
document.addEventListener('keydown',function(ev){
if(ev.key==='Escape'&&$('drawer').classList.contains('on'))closeDrawer();
if((ev.metaKey||ev.ctrlKey)&&String(ev.key).toLowerCase()==='k'){ev.preventDefault();if(VIEW!=='contacts')setView('contacts');$('q').focus()}
});
$('srvAddr').textContent=location.origin;
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
:root{--bg:#f6f7f9;--panel:#fff;--line:#e7eaf1;--text:#1d2433;--muted:#6b7488;--accent:#4f46e5;--accent-dark:#4338ca;--red:#c92a2a}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(120% 90% at 50% -10%,#eceefe 0%,#f6f7f9 46%,#f2f4f8 100%);color:var(--text);font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;-webkit-font-smoothing:antialiased}
.card{width:100%;max-width:396px;background:var(--panel);border:1px solid var(--line);border-radius:20px;padding:34px 32px 30px;box-shadow:0 2px 4px rgba(20,24,36,.03),0 30px 60px -34px rgba(20,24,36,.3)}
.mark{width:48px;height:48px;margin:0 auto 18px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(140deg,#7c83f8,#4338ca);color:#fff;font-size:20px;font-weight:700;letter-spacing:-.5px;box-shadow:0 12px 26px -12px rgba(79,70,229,.9),inset 0 1px 0 rgba(255,255,255,.28)}
h1{margin:0 0 6px;font-size:20px;font-weight:650;letter-spacing:-.4px;text-align:center}
.sub{margin:0 0 26px;color:var(--muted);font-size:12.5px;text-align:center}
label{display:block;margin:0 0 6px;font-size:11.5px;color:var(--muted);letter-spacing:.2px}
input{width:100%;margin:0 0 15px;padding:11px 12px;border:1px solid var(--line);border-radius:10px;background:#fff;color:var(--text);font:inherit;outline:0;transition:border-color .16s,box-shadow .16s}
input:focus{border-color:#b3baf9;box-shadow:0 0 0 3px #eef1fe}
button{width:100%;padding:11px;border:0;border-radius:10px;background:var(--accent);color:#fff;font:inherit;font-weight:500;cursor:pointer;box-shadow:0 10px 22px -12px rgba(79,70,229,.95);transition:background .16s}
button:hover{background:var(--accent-dark)}
button:disabled{opacity:.6;cursor:default}
.err{display:none;margin:0 0 13px;padding:8px 11px;border:1px solid #f6d3d3;border-radius:9px;background:#fff1f1;color:var(--red);font-size:12.5px;text-align:center}
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
