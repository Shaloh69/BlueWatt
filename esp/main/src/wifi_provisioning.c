#include "wifi_provisioning.h"
#include "logger.h"
#include "config.h"
#include "pzem_sensor.h"
#include "relay_control.h"
#include "anomaly_detector.h"

#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_http_server.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "nvs.h"
#include "lwip/sockets.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "mdns.h"

#include <string.h>
#include <stdlib.h>
#include <stdio.h>

static httpd_handle_t       provisioning_server = NULL;
static provisioning_state_t current_state       = PROV_STATE_IDLE;
static TaskHandle_t         s_dns_task          = NULL;
static bool                 s_mdns_started      = false;

// Full BlueWatt dashboard — Readings + Relay Test + WiFi Config
// Key correctness guarantees:
//   - AbortController prevents overlapping /readings fetches
//   - Page Visibility API pauses polling when the phone screen is off
//   - .stale class is applied to ALL value elements when sensor data is invalid
//   - Relay buttons are disabled during a pending relay POST
//   - ON button is disabled whenever TRIPPED or cooldown is active
//   - No stale CSS classes remain after a fresh poll — they are always reset
static const char provisioning_html[] =
"<!DOCTYPE html><html lang='en'><head>"
"<meta charset='UTF-8'>"
"<meta name='viewport' content='width=device-width,initial-scale=1'>"
"<title>BlueWatt</title>"
"<style>"
"*{box-sizing:border-box;margin:0;padding:0}"
"body{font-family:system-ui,Arial,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh}"
"header{background:linear-gradient(135deg,#667eea,#764ba2);padding:14px 18px;"
"display:flex;align-items:center;gap:10px;box-shadow:0 2px 10px rgba(0,0,0,.5)}"
"header h1{font-size:20px;font-weight:700;color:#fff;letter-spacing:-.2px}"
"header .logo{font-size:26px}"
// Tabs
".tabs{display:flex;background:#1e293b;border-bottom:2px solid #334155}"
".tab{flex:1;padding:12px 4px;text-align:center;cursor:pointer;font-size:12px;font-weight:600;"
"color:#64748b;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .2s,border-color .2s}"
".tab.active{color:#818cf8;border-bottom-color:#818cf8}"
// Pages
".page{display:none;padding:16px;max-width:440px;margin:0 auto}"
".page.active{display:block}"
// Metric cards
".grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px}"
".card{background:#1e293b;border-radius:12px;padding:14px;text-align:center}"
".clabel{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:6px}"
".value{font-size:24px;font-weight:700;transition:color .35s,opacity .35s}"
".ok{color:#4ade80}"
".warn{color:#fbbf24}"
".bad{color:#f87171}"
".neutral{color:#818cf8}"
".stale{color:#818cf8;opacity:.3}"
".unit{font-size:11px;color:#94a3b8;margin-top:2px}"
// Connecting state / spinner
".cstate{text-align:center;padding:32px 16px;color:#64748b;font-size:13px}"
".spin{display:inline-block;width:22px;height:22px;border:3px solid #334155;"
"border-top-color:#818cf8;border-radius:50%;animation:sp .8s linear infinite;margin-bottom:10px}"
"@keyframes sp{to{transform:rotate(360deg)}}"
// Relay status dot
".dot{width:60px;height:60px;border-radius:50%;margin:0 auto 10px;transition:background .4s,box-shadow .4s}"
".dot-off{background:#334155}"
".dot-on{background:#15803d;box-shadow:0 0 20px #4ade8055}"
".dot-trip{background:#991b1b;box-shadow:0 0 20px #f8717155;animation:pulse 1s ease-in-out infinite}"
"@keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}"
".rstatus{text-align:center;padding:20px 0 14px}"
".rlbl{font-size:11px;color:#64748b;margin-bottom:8px}"
// Badges
".badge{display:inline-block;padding:5px 16px;border-radius:99px;font-size:13px;font-weight:700}"
".b-on{background:#14532d;color:#4ade80;border:1px solid #166534}"
".b-off{background:#1e293b;color:#64748b;border:1px solid #334155}"
".b-trip{background:#450a0a;color:#f87171;border:1px solid #7f1d1d}"
".rinfo{font-size:11px;color:#64748b;margin-top:8px;min-height:16px;line-height:1.5}"
// Buttons
".brow{display:flex;gap:8px;margin-bottom:10px}"
".btn{flex:1;padding:12px 6px;border:none;border-radius:10px;font-size:13px;font-weight:700;"
"cursor:pointer;transition:opacity .15s;touch-action:manipulation;user-select:none}"
".btn:disabled{opacity:.3;cursor:default}"
".btn:active:not(:disabled){opacity:.6}"
".b-on-btn{background:#14532d;color:#4ade80;border:1px solid #166534}"
".b-off-btn{background:#1e293b;color:#94a3b8;border:1px solid #334155}"
".b-trip-btn{background:#450a0a;color:#f87171;border:1px solid #7f1d1d}"
".b-rst-btn{background:#0c1a2e;color:#60a5fa;border:1px solid #1e3a5f}"
// Setup wizard
".setup-wrap{padding:16px;max-width:440px;margin:0 auto}"
".step{display:none}"
".step.active{display:block}"
".step-hdr{display:flex;align-items:center;gap:10px;margin-bottom:20px}"
".step-num{width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);"
"display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0}"
".step-title{font-size:16px;font-weight:700;color:#e2e8f0}"
".step-sub{font-size:12px;color:#64748b;margin-top:1px}"
// Progress bar
".prog{display:flex;gap:6px;margin-bottom:24px}"
".prog-dot{flex:1;height:4px;border-radius:2px;background:#1e293b;transition:background .3s}"
".prog-dot.done{background:#667eea}"
// Form
".fg{margin-bottom:16px}"
".flbl{display:block;margin-bottom:6px;color:#94a3b8;font-size:12px;font-weight:600}"
"input{width:100%;padding:12px;background:#1e293b;border:2px solid #334155;"
"border-radius:9px;color:#e2e8f0;font-size:15px;transition:border-color .2s}"
"input:focus{outline:none;border-color:#818cf8}"
".pw-wrap{position:relative}"
".pw-wrap input{padding-right:44px}"
".pw-eye{position:absolute;right:12px;top:50%;transform:translateY(-50%);"
"background:none;border:none;color:#64748b;cursor:pointer;font-size:15px;line-height:1}"
".wbtn{width:100%;padding:13px;background:linear-gradient(135deg,#667eea,#764ba2);"
"color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:700;"
"cursor:pointer;touch-action:manipulation}"
".wbtn:active{opacity:.8}"
".wbtn.sec{background:#1e293b;border:2px solid #334155;color:#94a3b8}"
".wbtn:disabled{opacity:.4;cursor:default}"
// Toast messages
".msg{margin-top:12px;padding:11px;border-radius:9px;text-align:center;font-size:13px;display:none}"
".msg.ok{display:block;background:#14532d;color:#4ade80;border:1px solid #166534}"
".msg.err{display:block;background:#450a0a;color:#f87171;border:1px solid #7f1d1d}"
// Timestamp bar
"#upd{text-align:center;font-size:10px;color:#475569;margin-top:10px;min-height:14px}"
// Network scan list
".net-item{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:8px;"
"margin-bottom:6px}"
".net-24{background:#1e293b;border:1px solid #334155;cursor:pointer}"
".net-24:active{background:#263548}"
".net-5{background:#1a0a0a;border:1px solid #7f1d1d;cursor:not-allowed;opacity:.55}"
".net-ssid{flex:1;font-size:13px;color:#e2e8f0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}"
".band-24{font-size:10px;font-weight:700;color:#4ade80;white-space:nowrap}"
".band-5{font-size:10px;font-weight:700;color:#f87171;white-space:nowrap}"
".net-sig{font-size:11px;color:#64748b;white-space:nowrap;letter-spacing:-1px}"
".scan-btn{background:none;border:1px solid #334155;color:#818cf8;border-radius:6px;"
"padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer}"
".scan-btn:active{background:#1e293b}"
".scan-btn:disabled{opacity:.4;cursor:default}"
"</style></head><body>"

// ── Header ───────────────────────────────────────────────────────────────────
"<header><span class='logo'>&#x26A1;</span><h1>BlueWatt Monitor</h1></header>"

// ── Tab bar ──────────────────────────────────────────────────────────────────
"<div class='tabs'>"
"<div class='tab active' onclick='showTab(0)'>&#x1F4CA; Readings</div>"
"<div class='tab' onclick='showTab(1)'>&#x1F50C; Relay</div>"
"<div class='tab' onclick='showTab(2)'>&#x2699; Setup</div>"
"</div>"

// ── READINGS PAGE ─────────────────────────────────────────────────────────────
"<div class='page active' id='p0'>"
"<div class='cstate' id='cstate'><div class='spin'></div><div id='ctext'>Connecting to sensor...</div></div>"
"<div id='rdata' style='display:none'>"
"<div class='grid'>"
"<div class='card'><div class='clabel'>Voltage</div>"
"<div class='value neutral' id='v'>--</div><div class='unit'>V</div></div>"
"<div class='card'><div class='clabel'>Current</div>"
"<div class='value neutral' id='i'>--</div><div class='unit'>A</div></div>"
"<div class='card'><div class='clabel'>Active Power</div>"
"<div class='value neutral' id='p'>--</div><div class='unit'>W</div></div>"
"<div class='card'><div class='clabel'>Apparent</div>"
"<div class='value neutral' id='s'>--</div><div class='unit'>VA</div></div>"
"<div class='card'><div class='clabel'>Power Factor</div>"
"<div class='value neutral' id='pf'>--</div><div class='unit'></div></div>"
"<div class='card'><div class='clabel'>Frequency</div>"
"<div class='value neutral' id='fr'>--</div><div class='unit'>Hz</div></div>"
"</div>"
"<div class='card'>"
"<div class='clabel'>Energy Consumed</div>"
"<div class='value neutral' id='e' style='font-size:22px'>--</div>"
"<div class='unit'>Wh</div>"
"</div>"
"</div>"
"<div id='upd'></div>"
"</div>"

// ── RELAY PAGE ────────────────────────────────────────────────────────────────
"<div class='page' id='p1'>"
"<div class='rstatus'>"
"<div class='rlbl'>Relay Status</div>"
"<div class='dot dot-off' id='rdot'></div>"
"<div id='rbadge'><span class='badge b-off'>OFF</span></div>"
"<div class='rinfo' id='rinfo'></div>"
"</div>"
"<div class='brow'>"
"<button class='btn b-on-btn' id='bon' onclick='relayAct(\"on\")'>&#x25B6; ON</button>"
"<button class='btn b-off-btn' id='boff' onclick='relayAct(\"off\")'>&#x25A0; OFF</button>"
"</div>"
"<div class='brow'>"
"<button class='btn b-trip-btn' id='btrip' onclick='relayAct(\"trip\")'>&#x26A0; TEST TRIP</button>"
"<button class='btn b-rst-btn' id='brst' onclick='relayAct(\"reset\")'>&#x21BB; RESET</button>"
"</div>"
"<div class='msg' id='rmsg'></div>"
"</div>"

// ── SETUP WIZARD PAGE ─────────────────────────────────────────────────────────
"<div class='page' id='p2'>"
"<div class='setup-wrap'>"
// Progress dots
"<div class='prog'>"
"<div class='prog-dot done' id='pd0'></div>"
"<div class='prog-dot' id='pd1'></div>"
"</div>"

// ── Step 1: Server credentials ────────────────────────────────────────────────
"<div class='step active' id='s1'>"
"<div class='step-hdr'>"
"<div class='step-num'>1</div>"
"<div><div class='step-title'>Server Credentials</div>"
"<div class='step-sub'>Enter your BlueWatt server details</div></div>"
"</div>"
"<div class='fg'>"
"<label class='flbl'>Server URL</label>"
"<input type='url' id='svr_url' placeholder='https://bluewatt-api.onrender.com' autocomplete='off'>"
"</div>"
"<div class='fg'>"
"<label class='flbl'>API Key</label>"
"<div class='pw-wrap'>"
"<input type='password' id='svr_key' placeholder='bw_xxxxxxxx...'>"
"<button class='pw-eye' onclick='toggleKey()' title='Show/hide'>&#x1F441;</button>"
"</div>"
"</div>"
"<div class='fg'>"
"<label class='flbl'>Device ID</label>"
"<input type='text' id='svr_did' placeholder='bluewatt-001' autocomplete='off'>"
"</div>"
"<button class='wbtn' onclick='goStep2()'>Next &rarr; WiFi</button>"
"<div class='msg' id='smsg'></div>"
"</div>"

// ── Step 2: WiFi credentials ──────────────────────────────────────────────────
"<div class='step' id='s2'>"
"<div class='step-hdr'>"
"<div class='step-num'>2</div>"
"<div><div class='step-title'>WiFi Network</div>"
"<div class='step-sub'>Select or enter your 2.4 GHz network</div></div>"
"</div>"
// 2.4 GHz notice
"<div style='background:#1a1200;border:1px solid #78350f;border-radius:9px;padding:10px 12px;"
"margin-bottom:14px;font-size:12px;color:#fbbf24;line-height:1.6'>"
"&#x26A0; <strong>ESP32 only supports 2.4 GHz WiFi.</strong> "
"5 GHz networks are shown but cannot be selected."
"</div>"
// SSID row: label + scan button
"<div class='fg'>"
"<div style='display:flex;align-items:center;justify-content:space-between;margin-bottom:6px'>"
"<label class='flbl' style='margin:0'>WiFi Network (SSID)</label>"
"<button id='scanbtn' class='scan-btn' onclick='scanNetworks()'>&#x21BB; Scan</button>"
"</div>"
"<input type='text' id='ssid' placeholder='Tap Scan or enter manually' autocomplete='off'>"
// Scan results list
"<div id='scanout' style='margin-top:8px;max-height:200px;overflow-y:auto'></div>"
"</div>"
// Password
"<div class='fg'>"
"<label class='flbl'>Password</label>"
"<div class='pw-wrap'>"
"<input type='password' id='pw' placeholder='Enter password'>"
"<button class='pw-eye' onclick='togglePw()' title='Show/hide'>&#x1F441;</button>"
"</div>"
"</div>"
// Static IP
"<div class='fg'>"
"<label class='flbl'>Static IP (optional — blank = DHCP)</label>"
"<input type='text' id='sip' placeholder='e.g. 192.168.1.100' autocomplete='off'>"
"<div style='font-size:11px;color:#64748b;margin-top:4px'>Leave blank unless you need a fixed address.</div>"
"</div>"
"<div style='display:flex;gap:10px'>"
"<button class='wbtn sec' style='flex:0 0 80px' onclick='goStep1()'>&larr; Back</button>"
"<button class='wbtn' id='sbtn' onclick='saveAll()'>&#x1F4BE; Save &amp; Connect</button>"
"</div>"
"<div class='msg' id='wmsg'></div>"
"<hr style='border-color:#334155;margin:20px 0'>"
"<div style='font-size:12px;color:#94a3b8;margin-bottom:10px'>Reset: clears saved settings and restarts into setup mode.</div>"
"<button class='wbtn' style='background:#7f1d1d;' onclick='resetWifi()'>&#x21BA; Reset All Settings</button>"
"<div class='msg' id='rmsg2'></div>"
"</div>"

"</div>"  // .setup-wrap
"</div>"  // #p2

// ── SCRIPT ───────────────────────────────────────────────────────────────────
"<script>"
// ── Tab switching ─────────────────────────────────────────────────────────────
"var tabs=document.querySelectorAll('.tab'),pages=document.querySelectorAll('.page');"
"function showTab(n){"
"tabs.forEach(function(t,i){t.classList.toggle('active',i===n);});"
"pages.forEach(function(p,i){p.classList.toggle('active',i===n);});"
"}"

// ── Wizard step navigation ────────────────────────────────────────────────────
"function goStep2(){"
"var url=document.getElementById('svr_url').value.trim(),"
"did=document.getElementById('svr_did').value.trim(),"
"msg=document.getElementById('smsg');"
"if(!url){msg.textContent='Server URL is required';msg.className='msg err';return;}"
"if(!did){msg.textContent='Device ID is required';msg.className='msg err';return;}"
"msg.className='msg';"
"document.getElementById('s1').classList.remove('active');"
"document.getElementById('s2').classList.add('active');"
"document.getElementById('pd1').classList.add('done');"
"}"
"function goStep1(){"
"document.getElementById('s2').classList.remove('active');"
"document.getElementById('s1').classList.add('active');"
"document.getElementById('pd1').classList.remove('done');"
"}"

// ── Save both server + WiFi in sequence ───────────────────────────────────────
"function saveAll(){"
"var ssid=document.getElementById('ssid').value.trim(),"
"pw=document.getElementById('pw').value,"
"sip=document.getElementById('sip').value.trim(),"
"url=document.getElementById('svr_url').value.trim(),"
"key=document.getElementById('svr_key').value.trim(),"
"did=document.getElementById('svr_did').value.trim(),"
"wmsg=document.getElementById('wmsg'),"
"sbtn=document.getElementById('sbtn');"
"if(!ssid){wmsg.textContent='Network name is required';wmsg.className='msg err';return;}"
"wmsg.textContent='Saving server settings...';wmsg.className='msg ok';"
"sbtn.disabled=true;"
// Step A: save server settings
"fetch('/settings',{"
"method:'POST',"
"headers:{'Content-Type':'application/x-www-form-urlencoded'},"
"body:'url='+encodeURIComponent(url)+'&key='+encodeURIComponent(key)+'&did='+encodeURIComponent(did)})"
".then(function(r){return r.json();})"
".then(function(d){"
"if(!d.success){wmsg.textContent='Server save failed: '+d.message;wmsg.className='msg err';sbtn.disabled=false;return;}"
// Step B: save WiFi credentials — device restarts after this
"wmsg.textContent='Server saved. Saving WiFi...';wmsg.className='msg ok';"
"return fetch('/wifi',{"
"method:'POST',"
"headers:{'Content-Type':'application/x-www-form-urlencoded'},"
"body:'ssid='+encodeURIComponent(ssid)+'&password='+encodeURIComponent(pw)+'&sip='+encodeURIComponent(sip)})"
".then(function(r){return r.json();})"
".then(function(d2){"
"if(d2.success){"
"wmsg.textContent='Done! Device is connecting to '+ssid+'...';"
"wmsg.className='msg ok';"
"}else{"
"wmsg.textContent='WiFi save failed: '+d2.message;wmsg.className='msg err';sbtn.disabled=false;"
"}"
"});"
"})"
".catch(function(e){wmsg.textContent='Error: '+e.message;wmsg.className='msg err';sbtn.disabled=false;});"
"}"

// ── Value color helpers (Philippines 220 V / 60 Hz) ───────────────────────────
"function vc(v){return(v<180||v>250)?'bad':(v<195||v>240)?'warn':'ok';}"
"function ic(a){return a>15?'bad':a>12?'warn':a>0?'ok':'neutral';}"
"function pfc(pf){return pf<0.70?'bad':pf<0.85?'warn':'ok';}"
"function fc(f){return(f<58||f>62)?'bad':(f<59||f>61)?'warn':'ok';}"

"function sv(id,txt,cls){"
"var el=document.getElementById(id);"
"el.textContent=txt;"
"el.className='value '+cls;"
"}"

// ── Update relay UI ───────────────────────────────────────────────────────────
"function setRelay(state,trips,cdms,reason){"
"var dot=document.getElementById('rdot'),"
"badge=document.getElementById('rbadge'),"
"info=document.getElementById('rinfo'),"
"bon=document.getElementById('bon');"
"if(state==='ON'){"
"dot.className='dot dot-on';"
"badge.innerHTML=\"<span class='badge b-on'>ON</span>\";}"
"else if(state==='TRIPPED'){"
"dot.className='dot dot-trip';"
"badge.innerHTML=\"<span class='badge b-trip'>TRIPPED</span>\";}"
"else{"
"dot.className='dot dot-off';"
"badge.innerHTML=\"<span class='badge b-off'>OFF</span>\";}"
"var parts=[];"
"if(trips>0)parts.push('Trips: '+trips);"
"if(reason&&reason!=='NONE')parts.push('Last: '+reason);"
"if(cdms>0&&state!=='TRIPPED')parts.push('Cooldown: '+Math.ceil(cdms/1000)+'s');"
"info.textContent=parts.join(' \u2022 ');"
"bon.disabled=(state==='TRIPPED')||(cdms>0);"
"}"

// ── Polling state ─────────────────────────────────────────────────────────────
"var ctrl=null,tid=null,gotData=false,errCount=0;"

"function poll(){"
"if(ctrl)ctrl.abort();"
"ctrl=new AbortController();"
"fetch('/readings',{signal:ctrl.signal,cache:'no-store'})"
".then(function(r){return r.json();})"
".then(function(d){"
"errCount=0;"
"if(d.valid&&!gotData){"
"gotData=true;"
"document.getElementById('cstate').style.display='none';"
"document.getElementById('rdata').style.display='block';"
"}"
"if(!d.valid&&!gotData){"
"document.getElementById('ctext').textContent='Waiting for sensor data...';"
"}"
"var ok=d.valid;"
"sv('v', ok?d.v.toFixed(1):'--',  ok?vc(d.v):'stale');"
"sv('i', ok?d.i.toFixed(3):'--',  ok?ic(d.i):'stale');"
"sv('p', ok?d.p.toFixed(1):'--',  ok?'neutral':'stale');"
"sv('s', ok?d.s.toFixed(1):'--',  ok?'neutral':'stale');"
"sv('pf',ok?d.pf.toFixed(2):'--', ok?pfc(d.pf):'stale');"
"sv('fr',ok?d.f.toFixed(1):'--',  ok?fc(d.f):'stale');"
"sv('e', ok?d.e.toFixed(0):'--',  ok?'neutral':'stale');"
"setRelay(d.relay,d.trip_count||0,d.cooldown_ms||0,d.last_reason||'NONE');"
"var t=new Date();"
"document.getElementById('upd').textContent="
"(ok?'Updated ':'Sensor offline \u2014 ')"
"+t.getHours().toString().padStart(2,'0')+':'"
"+t.getMinutes().toString().padStart(2,'0')+':'"
"+t.getSeconds().toString().padStart(2,'0');"
"})"
".catch(function(e){"
"if(e.name==='AbortError')return;"
"errCount++;"
"if(errCount>=3)"
"document.getElementById('upd').textContent='Connection lost \u2014 retrying...';"
"});"
"}"

"document.addEventListener('visibilitychange',function(){"
"if(document.hidden){"
"clearInterval(tid);tid=null;"
"if(ctrl){ctrl.abort();ctrl=null;}"
"}else{"
"poll();"
"tid=setInterval(poll,2000);"
"}"
"});"
"poll();"
"tid=setInterval(poll,2000);"

// ── Relay control ─────────────────────────────────────────────────────────────
"var rPending=false;"
"function relayAct(action){"
"if(rPending)return;"
"rPending=true;"
"var msg=document.getElementById('rmsg');"
"msg.className='msg';"
"document.querySelectorAll('#p1 .btn').forEach(function(b){b.disabled=true;});"
"fetch('/relay',{"
"method:'POST',"
"headers:{'Content-Type':'application/x-www-form-urlencoded'},"
"body:'action='+action})"
".then(function(r){return r.json();})"
".then(function(d){"
"msg.textContent=d.message;"
"msg.className='msg '+(d.ok?'ok':'err');"
"rPending=false;"
"['boff','btrip','brst'].forEach(function(id){"
"document.getElementById(id).disabled=false;});"
"poll();"
"})"
".catch(function(e){"
"msg.textContent='Error: '+e.message;"
"msg.className='msg err';"
"rPending=false;"
"document.querySelectorAll('#p1 .btn').forEach(function(b){b.disabled=false;});"
"});"
"}"

// ── Show/hide helpers ─────────────────────────────────────────────────────────
"function togglePw(){"
"var i=document.getElementById('pw');"
"i.type=i.type==='password'?'text':'password';"
"}"
"function toggleKey(){"
"var i=document.getElementById('svr_key');"
"i.type=i.type==='password'?'text':'password';"
"}"

// ── WiFi scan ─────────────────────────────────────────────────────────────────
// _nets stores the last scan result so pickNet(i) can read the SSID safely.
"var _nets=[];"
"function escHtml(s){"
"return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');"
"}"
"function sigBars(rssi){"
"return rssi>-60?'\u2588\u2588\u2588':rssi>-75?'\u2588\u2588\u2591':'\u2588\u2591\u2591';"
"}"
"function scanNetworks(){"
"var btn=document.getElementById('scanbtn'),"
"out=document.getElementById('scanout');"
"btn.disabled=true;"
"out.innerHTML='<div style=\"color:#64748b;font-size:12px;text-align:center;padding:10px\">Scanning...</div>';"
"fetch('/scan',{cache:'no-store'})"
".then(function(r){return r.json();})"
".then(function(nets){"
"_nets=nets;"
"if(!nets.length){"
"out.innerHTML='<div style=\"color:#64748b;font-size:12px;text-align:center;padding:10px\">No networks found</div>';"
"btn.disabled=false;return;"
"}"
"var html='';"
"for(var i=0;i<nets.length;i++){"
"var n=nets[i],is24=n.band==='2.4';"
"html+='<div class=\"net-item '+(is24?'net-24':'net-5')+'\"'"
"+(is24?' onclick=\"pickNet('+i+')\"':'')+'>'"
"+'<span class=\"net-ssid\">'+escHtml(n.ssid||'(hidden)')+'</span>'"
"+'<span class=\"'+(is24?'band-24':'band-5')+'\">'+n.band+' GHz</span>'"
"+'<span class=\"net-sig\">'+sigBars(n.rssi)+'</span>'"
"+'</div>';"
"}"
"out.innerHTML=html;"
"btn.disabled=false;"
"})"
".catch(function(){"
"out.innerHTML='<div style=\"color:#f87171;font-size:12px;text-align:center;padding:10px\">Scan failed</div>';"
"btn.disabled=false;"
"});"
"}"
"function pickNet(i){"
"if(_nets[i])document.getElementById('ssid').value=_nets[i].ssid;"
"}"

// ── Reset all settings ────────────────────────────────────────────────────────
"function resetWifi(){"
"if(!confirm('Reset all settings and restart into setup mode?'))return;"
"var msg=document.getElementById('rmsg2');"
"msg.textContent='Resetting...';msg.className='msg ok';"
"fetch('/wifi/reset',{method:'POST'})"
".then(function(){msg.textContent='Restarting \u2014 connect to BlueWatt-Setup...';msg.className='msg ok';})"
".catch(function(e){msg.textContent='Error: '+e.message;msg.className='msg err';});"
"}"
"</script></body></html>";

// ── Captive-portal DNS redirect ───────────────────────────────────────────────
// Listens on UDP:53 and answers every query with 192.168.4.1, so that the OS
// captive-portal detector gets redirected to our dashboard instead of timing out.
static void dns_redirect_task(void *pvParam)
{
    int sock = socket(AF_INET, SOCK_DGRAM, 0);
    if (sock < 0) { vTaskDelete(NULL); return; }

    int opt = 1;
    setsockopt(sock, SOL_SOCKET, SO_REUSEADDR, &opt, sizeof(opt));

    struct sockaddr_in addr = {
        .sin_family      = AF_INET,
        .sin_port        = htons(53),
        .sin_addr.s_addr = htonl(INADDR_ANY),
    };
    if (bind(sock, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        ESP_LOGE(TAG_PROV, "DNS: bind failed");
        close(sock);
        vTaskDelete(NULL);
        return;
    }
    ESP_LOGI(TAG_PROV, "DNS redirect server up on port 53 → 192.168.4.1");

    uint8_t buf[256];
    while (1) {
        struct sockaddr_in client;
        socklen_t clen = sizeof(client);
        int n = recvfrom(sock, buf, sizeof(buf), 0, (struct sockaddr *)&client, &clen);
        if (n < 12) continue;

        // Build response in-place: set QR=1 AA=1 RA=1, ANCOUNT=1
        uint8_t resp[512];
        memcpy(resp, buf, n);
        resp[2]  = 0x85;  // QR AA TC RD
        resp[3]  = 0x80;  // RA Z RCODE=0
        resp[6]  = 0x00; resp[7]  = 0x01;  // ANCOUNT = 1
        resp[8]  = 0x00; resp[9]  = 0x00;  // NSCOUNT = 0
        resp[10] = 0x00; resp[11] = 0x00;  // ARCOUNT = 0

        // Skip past question section (labels end with 0x00 byte)
        int pos = 12;
        while (pos < n && buf[pos] != 0) { pos += (uint8_t)buf[pos] + 1; }
        pos += 5;  // null label + QTYPE(2) + QCLASS(2)

        // Append A-record answer pointing to 192.168.4.1
        int r = pos;
        resp[r++] = 0xC0; resp[r++] = 0x0C;  // name pointer → offset 12
        resp[r++] = 0x00; resp[r++] = 0x01;  // TYPE  A
        resp[r++] = 0x00; resp[r++] = 0x01;  // CLASS IN
        resp[r++] = 0x00; resp[r++] = 0x00;  // TTL (high)
        resp[r++] = 0x00; resp[r++] = 0x3C;  // TTL 60 s
        resp[r++] = 0x00; resp[r++] = 0x04;  // RDLENGTH = 4
        resp[r++] = 192;  resp[r++] = 168;
        resp[r++] = 4;    resp[r++] = 1;     // 192.168.4.1

        sendto(sock, resp, r, 0, (struct sockaddr *)&client, clen);
    }
    close(sock);
    vTaskDelete(NULL);
}

// ── Captive-portal HTTP handlers ──────────────────────────────────────────────
// Android checks /generate_204 and expects HTTP 204.
static esp_err_t captive_204_handler(httpd_req_t *req)
{
    httpd_resp_set_status(req, "204 No Content");
    httpd_resp_send(req, NULL, 0);
    return ESP_OK;
}

// iOS/macOS check /hotspot-detect.html and expect "Success" in the body.
static esp_err_t captive_success_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, "<HTML><HEAD><TITLE>Success</TITLE></HEAD><BODY>Success</BODY></HTML>", HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

// Catch-all: redirect anything else to the dashboard root.
static esp_err_t captive_redirect_handler(httpd_req_t *req)
{
    httpd_resp_set_status(req, "302 Found");
    httpd_resp_set_hdr(req, "Location", "http://192.168.4.1/");
    httpd_resp_set_type(req, "text/plain");
    httpd_resp_send(req, "Redirecting to dashboard...", HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

static esp_err_t provisioning_page_handler(httpd_req_t *req)
{
    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, provisioning_html, strlen(provisioning_html));
    return ESP_OK;
}

static void url_decode(char *dst, const char *src, size_t max_len)
{
    size_t j = 0;
    for (size_t i = 0; src[i] && j < max_len - 1; i++) {
        if (src[i] == '+') {
            dst[j++] = ' ';
        } else if (src[i] == '%' && src[i+1] && src[i+2]) {
            char hex[3] = {src[i+1], src[i+2], '\0'};
            dst[j++] = (char)strtol(hex, NULL, 16);
            i += 2;
        } else {
            dst[j++] = src[i];
        }
    }
    dst[j] = '\0';
}

static esp_err_t wifi_credentials_handler(httpd_req_t *req)
{
    char buf[256];
    int remaining = req->content_len;

    if (remaining <= 0 || remaining >= (int)sizeof(buf)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid content length");
        return ESP_FAIL;
    }

    int ret = httpd_req_recv(req, buf, remaining);
    if (ret <= 0) {
        return ESP_FAIL;
    }
    buf[ret] = '\0';

    char ssid_enc[128]  = {0};
    char pass_enc[128]  = {0};
    char sip_enc[32]    = {0};
    char ssid[64]       = {0};
    char password[64]   = {0};
    char static_ip[20]  = {0};

    char *ssid_start = strstr(buf, "ssid=");
    char *pass_start = strstr(buf, "password=");
    char *sip_start  = strstr(buf, "sip=");

    if (ssid_start) {
        ssid_start += 5;
        char *end = strchr(ssid_start, '&');
        size_t len = end ? (size_t)(end - ssid_start) : strlen(ssid_start);
        if (len < sizeof(ssid_enc)) {
            strncpy(ssid_enc, ssid_start, len);
            ssid_enc[len] = '\0';
            url_decode(ssid, ssid_enc, sizeof(ssid));
        }
    }

    if (pass_start) {
        pass_start += 9;
        char *end = strchr(pass_start, '&');
        size_t len = end ? (size_t)(end - pass_start) : strlen(pass_start);
        if (len < sizeof(pass_enc)) {
            strncpy(pass_enc, pass_start, len);
            pass_enc[len] = '\0';
            url_decode(password, pass_enc, sizeof(password));
        }
    }

    if (sip_start) {
        sip_start += 4;
        char *end = strchr(sip_start, '&');
        size_t len = end ? (size_t)(end - sip_start) : strlen(sip_start);
        if (len < sizeof(sip_enc)) {
            strncpy(sip_enc, sip_start, len);
            sip_enc[len] = '\0';
            url_decode(static_ip, sip_enc, sizeof(static_ip));
        }
    }

    ESP_LOGI(TAG_PROV, "Credentials received — SSID: %s  StaticIP: %s",
             ssid, strlen(static_ip) > 0 ? static_ip : "(DHCP)");

    esp_err_t err = wifi_provisioning_save_credentials(ssid, password);

    // Save static IP (or clear it if left blank so DHCP is used)
    if (err == ESP_OK) {
        nvs_handle_t h;
        if (nvs_open(PROV_NVS_NAMESPACE, NVS_READWRITE, &h) == ESP_OK) {
            nvs_set_str(h, "static_ip", static_ip);
            nvs_commit(h);
            nvs_close(h);
        }
    }

    char response[128];
    if (err == ESP_OK) {
        current_state = PROV_STATE_CREDENTIALS_RECEIVED;
        snprintf(response, sizeof(response),
                 "{\"success\":true,\"message\":\"Credentials saved\"}");
    } else {
        snprintf(response, sizeof(response),
                 "{\"success\":false,\"message\":\"Save failed: %s\"}", esp_err_to_name(err));
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, response, strlen(response));
    return ESP_OK;
}

// POST /wifi/reset — clear credentials + static IP, then restart into AP mode
static esp_err_t wifi_reset_handler(httpd_req_t *req)
{
    ESP_LOGW(TAG_PROV, "WiFi reset requested — clearing NVS and restarting");

    wifi_provisioning_clear_credentials();

    // Also clear static IP
    nvs_handle_t h;
    if (nvs_open(PROV_NVS_NAMESPACE, NVS_READWRITE, &h) == ESP_OK) {
        nvs_erase_key(h, "static_ip");
        nvs_commit(h);
        nvs_close(h);
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_send(req, "{\"ok\":true}", HTTPD_RESP_USE_STRLEN);

    // Small delay so the HTTP response is flushed before restart
    vTaskDelay(pdMS_TO_TICKS(300));
    esp_restart();
    return ESP_OK;
}

// GET /readings — return latest PZEM data + relay state as JSON
static esp_err_t readings_handler(httpd_req_t *req)
{
    pzem_data_t d;
    pzem_sensor_get_last(&d);

    relay_state_t  rs          = relay_get_state();
    uint32_t       trips       = relay_get_trip_count();
    uint32_t       cooldown_ms = relay_get_cooldown_remaining_ms();
    const char    *last_reason = anomaly_type_to_string(relay_get_last_trip_reason());
    const char    *relay_str   = (rs == RELAY_STATE_ON)     ? "ON"      :
                                 (rs == RELAY_STATE_TRIPPED) ? "TRIPPED" : "OFF";

    char buf[320];
    if (d.valid) {
        snprintf(buf, sizeof(buf),
            "{\"valid\":true,\"v\":%.1f,\"i\":%.3f,\"p\":%.1f,\"s\":%.1f,"
            "\"pf\":%.2f,\"e\":%.0f,\"f\":%.1f,"
            "\"relay\":\"%s\",\"trip_count\":%lu,"
            "\"cooldown_ms\":%lu,\"last_reason\":\"%s\"}",
            d.v_rms, d.i_rms, d.power, d.power_apparent,
            d.power_factor, d.energy, d.frequency,
            relay_str, (unsigned long)trips,
            (unsigned long)cooldown_ms, last_reason);
    } else {
        snprintf(buf, sizeof(buf),
            "{\"valid\":false,\"relay\":\"%s\",\"trip_count\":%lu,"
            "\"cooldown_ms\":%lu,\"last_reason\":\"%s\"}",
            relay_str, (unsigned long)trips,
            (unsigned long)cooldown_ms, last_reason);
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_send(req, buf, strlen(buf));
    return ESP_OK;
}

// POST /relay — body: action=on|off|trip|reset
static esp_err_t relay_handler(httpd_req_t *req)
{
    char buf[64];
    int len = httpd_req_recv(req, buf, sizeof(buf) - 1);
    if (len <= 0) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Empty body");
        return ESP_FAIL;
    }
    buf[len] = '\0';

    bool ok = true;
    const char *msg = "Done";

    if (strstr(buf, "action=on")) {
        esp_err_t err = relay_set_state(RELAY_STATE_ON);
        ok  = (err == ESP_OK);
        msg = ok ? "Relay turned ON" : "Failed (cooldown or tripped)";
    } else if (strstr(buf, "action=off")) {
        esp_err_t err = relay_set_state(RELAY_STATE_OFF);
        ok  = (err == ESP_OK);
        msg = ok ? "Relay turned OFF" : "Failed (busy or invalid state)";
    } else if (strstr(buf, "action=trip")) {
        relay_emergency_cutoff(ANOMALY_NONE);
        ok  = true;
        msg = "Test trip triggered — relay TRIPPED";
    } else if (strstr(buf, "action=reset")) {
        esp_err_t err = relay_set_state(RELAY_STATE_OFF);
        ok  = (err == ESP_OK);
        if (ok) {
            // Clear overcurrent counter and fire-detector baseline so the
            // next valid reading doesn't immediately re-trip the relay.
            anomaly_detector_reset();
            msg = "Relay reset to OFF";
        } else {
            msg = "Reset failed";
        }
    } else {
        ok  = false;
        msg = "Unknown action";
    }

    char resp[128];
    snprintf(resp, sizeof(resp), "{\"ok\":%s,\"message\":\"%s\"}",
             ok ? "true" : "false", msg);

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_send(req, resp, strlen(resp));
    return ESP_OK;
}

// POST /settings — save server URL, API key, and device ID to NVS
static esp_err_t settings_handler(httpd_req_t *req)
{
    char buf[400];
    int remaining = req->content_len;

    if (remaining <= 0 || remaining >= (int)sizeof(buf)) {
        httpd_resp_send_err(req, HTTPD_400_BAD_REQUEST, "Invalid content length");
        return ESP_FAIL;
    }

    int ret = httpd_req_recv(req, buf, remaining);
    if (ret <= 0) return ESP_FAIL;
    buf[ret] = '\0';

    char url_enc[200]  = {0};
    char key_enc[100]  = {0};
    char did_enc[100]  = {0};
    char server_url[160] = {0};
    char api_key[80]     = {0};
    char device_id[80]   = {0};

    char *url_start = strstr(buf, "url=");
    char *key_start = strstr(buf, "key=");
    char *did_start = strstr(buf, "did=");

    if (url_start) {
        url_start += 4;
        char *end = strchr(url_start, '&');
        size_t len = end ? (size_t)(end - url_start) : strlen(url_start);
        if (len < sizeof(url_enc)) {
            strncpy(url_enc, url_start, len);
            url_enc[len] = '\0';
            url_decode(server_url, url_enc, sizeof(server_url));
        }
    }
    if (key_start) {
        key_start += 4;
        char *end = strchr(key_start, '&');
        size_t len = end ? (size_t)(end - key_start) : strlen(key_start);
        if (len < sizeof(key_enc)) {
            strncpy(key_enc, key_start, len);
            key_enc[len] = '\0';
            url_decode(api_key, key_enc, sizeof(api_key));
        }
    }
    if (did_start) {
        did_start += 4;
        char *end = strchr(did_start, '&');
        size_t len = end ? (size_t)(end - did_start) : strlen(did_start);
        if (len < sizeof(did_enc)) {
            strncpy(did_enc, did_start, len);
            did_enc[len] = '\0';
            url_decode(device_id, did_enc, sizeof(device_id));
        }
    }

    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err == ESP_OK) {
        if (strlen(server_url) > 0) nvs_set_str(handle, "server_url", server_url);
        if (strlen(api_key)    > 0) nvs_set_str(handle, "api_key",    api_key);
        if (strlen(device_id)  > 0) nvs_set_str(handle, "device_id",  device_id);
        err = nvs_commit(handle);
        nvs_close(handle);
    }

    ESP_LOGI(TAG_PROV, "Server settings saved: url=%s  device=%s  key_len=%d  key_prefix=%.8s",
             server_url, device_id, (int)strlen(api_key), api_key);

    char response[128];
    if (err == ESP_OK) {
        snprintf(response, sizeof(response), "{\"success\":true,\"message\":\"Saved\"}");
    } else {
        snprintf(response, sizeof(response),
                 "{\"success\":false,\"message\":\"NVS error: %s\"}", esp_err_to_name(err));
    }

    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    httpd_resp_send(req, response, strlen(response));
    return ESP_OK;
}

// GET /scan — scan visible WiFi APs and return JSON array.
// Each entry: {"ssid":"...","rssi":-60,"ch":6,"band":"2.4"} or "5" for 5 GHz.
// Channel ≤ 13 → 2.4 GHz.  Channel ≥ 36 → 5 GHz.
// Results sorted strongest-first (up to 20 APs).
static esp_err_t scan_handler(httpd_req_t *req)
{
    wifi_scan_config_t scan_cfg = {
        .ssid        = NULL,
        .bssid       = NULL,
        .channel     = 0,
        .show_hidden = false,
        .scan_type   = WIFI_SCAN_TYPE_ACTIVE,
        .scan_time.active.min = 100,
        .scan_time.active.max = 300,
    };

    esp_err_t err = esp_wifi_scan_start(&scan_cfg, true /* blocking */);
    if (err != ESP_OK) {
        ESP_LOGW(TAG_PROV, "Scan failed: %s", esp_err_to_name(err));
        httpd_resp_set_type(req, "application/json");
        httpd_resp_send(req, "[]", 2);
        return ESP_OK;
    }

    uint16_t ap_count = 0;
    esp_wifi_scan_get_ap_num(&ap_count);
    if (ap_count > 20) ap_count = 20;

    if (ap_count == 0) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_send(req, "[]", 2);
        return ESP_OK;
    }

    wifi_ap_record_t *records = (wifi_ap_record_t *)malloc(sizeof(wifi_ap_record_t) * ap_count);
    if (!records) {
        httpd_resp_set_type(req, "application/json");
        httpd_resp_send(req, "[]", 2);
        return ESP_OK;
    }
    esp_wifi_scan_get_ap_records(&ap_count, records);

    // Sort by RSSI descending (strongest first) — bubble sort, n ≤ 20
    for (int i = 0; i < (int)ap_count - 1; i++) {
        for (int j = 0; j < (int)ap_count - i - 1; j++) {
            if (records[j].rssi < records[j + 1].rssi) {
                wifi_ap_record_t tmp = records[j];
                records[j]          = records[j + 1];
                records[j + 1]      = tmp;
            }
        }
    }

    // Build JSON: each entry ≤ ~120 chars (SSID 32 bytes + escaping + metadata)
    char *json = (char *)malloc(ap_count * 120 + 8);
    if (!json) { free(records); httpd_resp_set_type(req, "application/json"); httpd_resp_send(req, "[]", 2); return ESP_OK; }

    int pos = 0;
    json[pos++] = '[';

    for (int i = 0; i < (int)ap_count; i++) {
        // Escape SSID for JSON: replace \ with \\ and " with \"
        char ssid_safe[70] = {0};
        int si = 0;
        for (int j = 0; j < 32 && records[i].ssid[j] && si < 66; j++) {
            char c = (char)records[i].ssid[j];
            if (c == '\\' || c == '"') ssid_safe[si++] = '\\';
            ssid_safe[si++] = c;
        }

        const char *band = (records[i].primary <= 13) ? "2.4" : "5";

        pos += snprintf(json + pos, 120,
            "%s{\"ssid\":\"%s\",\"rssi\":%d,\"ch\":%d,\"band\":\"%s\"}",
            i > 0 ? "," : "",
            ssid_safe, records[i].rssi, records[i].primary, band);
    }

    json[pos++] = ']';
    json[pos]   = '\0';

    ESP_LOGI(TAG_PROV, "Scan: %d APs found", ap_count);
    httpd_resp_set_type(req, "application/json");
    httpd_resp_set_hdr(req, "Cache-Control", "no-store");
    httpd_resp_send(req, json, pos);

    free(records);
    free(json);
    return ESP_OK;
}

static esp_err_t start_provisioning_server(void)
{
    httpd_config_t config   = HTTPD_DEFAULT_CONFIG();
    config.server_port      = 80;
    config.max_uri_handlers = 16;
    config.lru_purge_enable = true;
    // Wildcard matching lets us register a catch-all "/*" handler for captive
    // portal redirects.  Specific URIs registered first still take priority.
    config.uri_match_fn     = httpd_uri_match_wildcard;

    if (httpd_start(&provisioning_server, &config) != ESP_OK) {
        ESP_LOGE(TAG_PROV, "Failed to start HTTP server");
        return ESP_FAIL;
    }

    // ── Main dashboard routes (registered first so wildcard never steals them) ─
    httpd_uri_t root_uri = {
        .uri     = "/",
        .method  = HTTP_GET,
        .handler = provisioning_page_handler,
    };
    httpd_register_uri_handler(provisioning_server, &root_uri);

    httpd_uri_t wifi_uri = {
        .uri     = "/wifi",
        .method  = HTTP_POST,
        .handler = wifi_credentials_handler,
    };
    httpd_register_uri_handler(provisioning_server, &wifi_uri);

    httpd_uri_t wifi_reset_uri = {
        .uri     = "/wifi/reset",
        .method  = HTTP_POST,
        .handler = wifi_reset_handler,
    };
    httpd_register_uri_handler(provisioning_server, &wifi_reset_uri);

    httpd_uri_t readings_uri = {
        .uri     = "/readings",
        .method  = HTTP_GET,
        .handler = readings_handler,
    };
    httpd_register_uri_handler(provisioning_server, &readings_uri);

    httpd_uri_t relay_uri = {
        .uri     = "/relay",
        .method  = HTTP_POST,
        .handler = relay_handler,
    };
    httpd_register_uri_handler(provisioning_server, &relay_uri);

    httpd_uri_t settings_uri = {
        .uri     = "/settings",
        .method  = HTTP_POST,
        .handler = settings_handler,
    };
    httpd_register_uri_handler(provisioning_server, &settings_uri);

    httpd_uri_t scan_uri = {
        .uri     = "/scan",
        .method  = HTTP_GET,
        .handler = scan_handler,
    };
    httpd_register_uri_handler(provisioning_server, &scan_uri);

    // ── Captive-portal handlers ───────────────────────────────────────────────
    // Android: expects HTTP 204 from /generate_204
    httpd_uri_t gen204_uri = {
        .uri     = "/generate_204",
        .method  = HTTP_GET,
        .handler = captive_204_handler,
    };
    httpd_register_uri_handler(provisioning_server, &gen204_uri);

    // iOS/macOS: expects "Success" body from /hotspot-detect.html
    httpd_uri_t hotspot_uri = {
        .uri     = "/hotspot-detect.html",
        .method  = HTTP_GET,
        .handler = captive_success_handler,
    };
    httpd_register_uri_handler(provisioning_server, &hotspot_uri);

    // Catch-all GET: redirect any other path (Windows checks, etc.) to dashboard
    httpd_uri_t catchall_uri = {
        .uri     = "/*",
        .method  = HTTP_GET,
        .handler = captive_redirect_handler,
    };
    httpd_register_uri_handler(provisioning_server, &catchall_uri);

    ESP_LOGI(TAG_PROV, "HTTP server started on port 80 (captive-portal enabled)");
    return ESP_OK;
}

esp_err_t wifi_provisioning_init(void)
{
    // NVS already initialized in app_main; this is a no-op guard
    ESP_LOGI(TAG_PROV, "Provisioning module initialized");
    return ESP_OK;
}

esp_err_t wifi_provisioning_start_ap(void)
{
    ESP_LOGI(TAG_PROV, "Starting provisioning AP...");

    wifi_config_t wifi_config = {
        .ap = {
            .ssid           = PROV_AP_SSID,
            .ssid_len       = strlen(PROV_AP_SSID),
            .channel        = PROV_AP_CHANNEL,
            .password       = PROV_AP_PASSWORD,
            .max_connection = PROV_AP_MAX_CONN,
            .authmode       = WIFI_AUTH_WPA2_PSK,
        },
    };

    // APSTA mode lets us scan for nearby networks while the setup AP is active.
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    current_state = PROV_STATE_AP_STARTED;
    start_provisioning_server();

    // DNS redirect on port 53: makes every hostname resolve to 192.168.4.1 so
    // the OS captive-portal detector is automatically redirected to our page.
    if (s_dns_task == NULL) {
        xTaskCreate(dns_redirect_task, "dns_redir", 3072, NULL, 5, &s_dns_task);
    }

    ESP_LOGI(TAG_PROV, "AP ready — SSID='%s'  PW='%s'  URL=http://192.168.4.1",
             PROV_AP_SSID, PROV_AP_PASSWORD);
    return ESP_OK;
}

void wifi_provisioning_stop_ap(void)
{
    // Stop DNS task before tearing down the network interface
    if (s_dns_task) {
        vTaskDelete(s_dns_task);
        s_dns_task = NULL;
    }
    if (provisioning_server) {
        httpd_stop(provisioning_server);
        provisioning_server = NULL;
    }
    esp_wifi_stop();
    current_state = PROV_STATE_IDLE;
    ESP_LOGI(TAG_PROV, "Provisioning AP stopped");
}

esp_err_t wifi_provisioning_save_credentials(const char *ssid, const char *password)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(PROV_NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    err = nvs_set_str(handle, PROV_NVS_KEY_SSID, ssid);
    if (err == ESP_OK) err = nvs_set_str(handle, PROV_NVS_KEY_PASS, password);
    if (err == ESP_OK) err = nvs_set_u8(handle,  PROV_NVS_KEY_FLAG, 1);
    if (err == ESP_OK) err = nvs_commit(handle);

    nvs_close(handle);
    if (err == ESP_OK) ESP_LOGI(TAG_PROV, "Credentials saved to NVS");
    return err;
}

esp_err_t wifi_provisioning_load_credentials(char *ssid, size_t ssid_len,
                                              char *password, size_t pass_len)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(PROV_NVS_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) return err;

    err = nvs_get_str(handle, PROV_NVS_KEY_SSID, ssid, &ssid_len);
    if (err == ESP_OK) err = nvs_get_str(handle, PROV_NVS_KEY_PASS, password, &pass_len);

    nvs_close(handle);
    return err;
}

bool wifi_provisioning_is_configured(void)
{
    nvs_handle_t handle;
    uint8_t flag = 0;
    if (nvs_open(PROV_NVS_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) return false;
    nvs_get_u8(handle, PROV_NVS_KEY_FLAG, &flag);
    nvs_close(handle);
    return flag == 1;
}

esp_err_t wifi_provisioning_clear_credentials(void)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(PROV_NVS_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;
    nvs_erase_all(handle);
    err = nvs_commit(handle);
    nvs_close(handle);
    ESP_LOGI(TAG_PROV, "Credentials cleared");
    return err;
}

provisioning_state_t wifi_provisioning_get_state(void)
{
    return current_state;
}

esp_err_t wifi_provisioning_load_static_ip(char *ip, size_t ip_len)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(PROV_NVS_NAMESPACE, NVS_READONLY, &handle);
    if (err != ESP_OK) return err;
    err = nvs_get_str(handle, "static_ip", ip, &ip_len);
    nvs_close(handle);
    return err;
}

esp_err_t wifi_provisioning_start_sta_server(void)
{
    if (provisioning_server != NULL) {
        return ESP_OK;   // Already running — nothing to do
    }
    esp_err_t err = start_provisioning_server();
    if (err == ESP_OK) {
        ESP_LOGI(TAG_PROV, "Local dashboard available at http://<device-ip>/ or http://bluewatt.local/");

        // Start mDNS so the ESP is always reachable at http://bluewatt.local/
        // regardless of what IP the router assigns.
        if (!s_mdns_started) {
            if (mdns_init() == ESP_OK) {
                mdns_hostname_set("bluewatt");
                mdns_instance_name_set("BlueWatt Energy Monitor");
                mdns_service_add(NULL, "_http", "_tcp", 80, NULL, 0);
                s_mdns_started = true;
                ESP_LOGI(TAG_PROV, "mDNS started — open http://bluewatt.local/ from any device on the same network");
            } else {
                ESP_LOGW(TAG_PROV, "mDNS init failed — use IP address instead");
            }
        }
    }
    return err;
}


