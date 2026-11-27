/* Frontend for the Worker-hosted competitive review portal. */
const $=(id)=>document.getElementById(id);
const page=document.body.dataset.page;
let me=null,applications=[],activeFilter="all";
function notice(message,error=false){
  const n=$("notice");n.hidden=!message;n.textContent=message||"";n.className="notice "+(error?"error":"ok");
}
async function api(path,options={}){
  const res=await fetch(path,{credentials:"same-origin",...options});
  let payload;try{payload=await res.json();}catch{payload={error:"通信エラー"};}
  if(!res.ok)throw new Error(payload.error||"処理できませんでした");
  return payload;
}
function el(tag,className="",value){
  const n=document.createElement(tag);if(className)n.className=className;
  if(value!==undefined)n.textContent=String(value);return n;
}
const statuses={pending:"未審査",reviewing:"保留",granting:"ロール付与中",role_error:"付与エラー",approved:"承認済み",rejected:"不採用"};
async function logout(){
  await api("/auth/logout",{method:"POST",headers:{"X-CSRF-Token":me.csrf,"Origin":location.origin}});
  location.assign("/");
}
async function applicant(){
  $("login-panel").hidden=!!me.authenticated;
  $("identity-panel").hidden=!me.authenticated;
  if(!me.authenticated)return;
  $("identity-name").textContent=me.user.name+" / Discord";
  $("logout").addEventListener("click",()=>logout().catch(e=>notice(e.message,true)));
  if(!me.member){
    $("guild-message").textContent="まずNeverStopの公開Discordに参加してください。参加後にこのページを再読み込みしてください。";
    const a=el("a","textlink","Discordに参加 ↗");a.href=me.invite||"https://discord.gg/ppSVvAr8Bt";a.target="_blank";a.rel="noopener noreferrer";
    $("identity-panel").append(a);return;
  }
  $("guild-message").textContent="コミュニティへの参加を確認しました。競技部門への応募は審査制です。";
  const {application}=await api("/api/applications/mine");
  if(application){
    $("existing-application").hidden=false;
    $("application-state").textContent=application.player_name+" / "+(statuses[application.status]||application.status)+"（申請日: "+application.created_at.slice(0,10)+"）";
    if(application.status!=="rejected")return;
    $("application-state").textContent+="。不採用後の再応募は7日以上経過してから可能です。";
  }
  $("application-panel").hidden=false;
  $("apply-form").addEventListener("submit",async e=>{
    e.preventDefault();
    const f=e.currentTarget;
    const data=Object.fromEntries(new FormData(f).entries());
    data.ageConfirmed=$("ageConfirmed").checked;
    data.rulesAccepted=$("rulesAccepted").checked;
    const button=f.querySelector("[type=submit]");button.disabled=true;notice("申請内容を送信しています…");
    try{
      await api("/api/applications",{method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":me.csrf},body:JSON.stringify(data)});
      notice("申請を受け付けました。運営の審査結果はここで確認できます。");
      $("application-panel").hidden=true;
      $("existing-application").hidden=false;
      $("application-state").textContent="審査待ち";
    }catch(err){notice(err.message,true);}finally{button.disabled=false;}
  });
}
function stat(count,label){
  const n=el("div","stat"),b=el("b","",count),s=el("span","",label);n.append(b,s);return n;
}
function detail(label,value){
  const node=el("div","detail"),header=el("span","",label),text=el("div","",value||"—");
  node.append(header,text);return node;
}
function decisionButton(label,action,className,record,textarea){
  const btn=el("button",className,label);btn.type="button";
  btn.addEventListener("click",async()=>{
    if(!confirm(label+"：この申請を処理しますか？"))return;
    const buttons=textarea.parentNode.querySelectorAll("button");buttons.forEach(b=>b.disabled=true);
    try{
      await api("/api/admin/applications/"+record.id+"/decision",{
        method:"POST",headers:{"Content-Type":"application/json","X-CSRF-Token":me.csrf},
        body:JSON.stringify({action,note:textarea.value})
      });
      notice("審査結果を保存しました。");await loadApplications();
    }catch(e){notice(e.message,true);buttons.forEach(b=>b.disabled=false);}
  });return btn;
}
function applicantCard(record){
  const details=el("details","application"),summary=el("summary");
  const left=el("div"),title=el("b","",record.player_name),sub=el("small","",
    record.discord_name+" · "+record.rank+" · "+record.created_at.slice(0,10));
  left.append(title,sub);
  summary.append(left,el("span","state "+record.status,statuses[record.status]||record.status));
  details.append(summary);
  const body=el("div","details"),grid=el("div","detail-grid");
  for(const [label,value] of [
    ["Discord",record.discord_name+" ("+record.discord_id+")"],
    ["使用環境",record.platform],["現在ランク",record.rank],["最高到達",record.peak_rank],
    ["活動時間帯",record.availability],["競技経験",record.experience],["応募理由",record.reason],
    ["SNS",record.social],["運営メモ",record.moderator_note]
  ])grid.append(detail(label,value));
  body.append(grid);
  if(["pending","reviewing","role_error"].includes(record.status)){
    const area=el("div","review");
    area.append(el("strong","","審査操作"));
    const memo=el("textarea");memo.placeholder="運営メモ（任意・最大500文字）";memo.maxLength=500;
    area.append(memo);
    const buttons=el("div","actions");
    if(record.status==="pending")buttons.append(decisionButton("保留する","reviewing","secondary",record,memo));
    buttons.append(
      decisionButton(record.status==="role_error"?"ロール付与を再試行":"承認してロール付与","approve","primary",record,memo),
      decisionButton("不採用","reject","secondary danger",record,memo)
    );
    area.append(buttons);body.append(area);
  }
  details.append(body);return details;
}
function renderApplications(){
  const count=(s)=>applications.filter(a=>a.status===s).length;
  const summary=$("summary-row");summary.replaceChildren(
    stat(count("pending"),"未審査"),stat(count("reviewing"),"保留"),
    stat(count("approved"),"承認済み"),stat(count("rejected"),"不採用")
  );
  $("total-count").textContent="("+applications.length+")";
  const list=$("applications");list.replaceChildren();
  let shown=applications.filter(a=>activeFilter==="all"||a.status===activeFilter);
  if(!shown.length)list.append(el("div","empty","該当する申請はありません。"));
  else for(const record of shown)list.append(applicantCard(record));
}
async function loadApplications(){
  const data=await api("/api/admin/applications");
  applications=data.applications;
  renderApplications();
}
async function admin(){
  $("admin-login").hidden=!!me.authenticated;
  if(!me.authenticated)return;
  if(!me.admin){notice("このアカウントには審査権限がありません。",true);return;}
  $("admin-workspace").hidden=false;
  $("admin-login").hidden=true;
  $("admin-logout").addEventListener("click",()=>logout().catch(e=>notice(e.message,true)));
  $("refresh").addEventListener("click",()=>loadApplications().catch(e=>notice(e.message,true)));
  document.querySelectorAll("[data-filter]").forEach(button=>button.addEventListener("click",()=>{
    activeFilter=button.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach(b=>b.classList.toggle("active",b===button));
    renderApplications();
  }));
  await loadApplications();
}
(async function init(){
  try{
    me=await api("/api/me");
    if(page==="apply")await applicant();
    else await admin();
  }catch(e){notice(e.message,true);}
})();
