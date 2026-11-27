/* NeverStop competitive recruitment portal.
 * A separately deployed Cloudflare Worker; GitHub Pages stays static.
 * Private D1 records and Discord secrets never enter the public website.
 */
const SESSION = "__Host-nvst_session";
const OAUTH_STATE = "__Host-nvst_oauth";
const OAUTH_NEXT = "__Host-nvst_next";
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const DISCORD = "https://discord.com/api/v10";
const APP_STATUS = new Set(["pending","reviewing","granting","approved","rejected"]);

function json(data, status=200) {
  return new Response(JSON.stringify(data), {
    status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
      "X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}
  });
}
function fail(message,status=400) { return json({error:message},status); }
function randomToken() {
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,"");
}
async function hash(token) {
  const hashBytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(token));
  return [...new Uint8Array(hashBytes)].map(n=>n.toString(16).padStart(2,"0")).join("");
}
function cookies(request) {
  const obj={};
  for(const part of (request.headers.get("Cookie")||"").split(";")) {
    const i=part.indexOf("=");if(i<0)continue;
    obj[part.slice(0,i).trim()]=part.slice(i+1).trim();
  }
  return obj;
}
function setCookie(name,value,maxAge) {
  return name+"="+value+"; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age="+maxAge;
}
function redirect(url,cookieLines=[]) {
  const r=new Response(null,{status:302,headers:{Location:url,"Cache-Control":"no-store"}});
  for(const line of cookieLines) r.headers.append("Set-Cookie",line);
  return r;
}
function configReady(env) {
  return !!(env.DB&&env.DISCORD_CLIENT_ID&&env.DISCORD_CLIENT_SECRET&&env.DISCORD_BOT_TOKEN&&
    env.DISCORD_GUILD_ID&&env.COMPETITIVE_ROLE_ID&&env.ADMIN_USER_IDS);
}
async function discordBot(env,path,method="GET") {
  const result=await fetch(DISCORD+path,{
    method,headers:{Authorization:"Bot "+env.DISCORD_BOT_TOKEN,"User-Agent":"NeverStopRecruitment/1.0"}
  });
  return result;
}
async function isGuildMember(env,userId) {
  const response=await discordBot(env,"/guilds/"+encodeURIComponent(env.DISCORD_GUILD_ID)+
    "/members/"+encodeURIComponent(userId));
  if(response.status===404)return false;
  if(!response.ok)throw new Error("Cannot verify membership ("+response.status+")");
  return true;
}
async function sessionFrom(request,env) {
  const token=cookies(request)[SESSION];
  if(!token||token.length>256)return null;
  return env.DB.prepare("SELECT token_hash,discord_id,username,csrf,expires_at FROM sessions WHERE token_hash=? AND expires_at>?")
    .bind(await hash(token),Math.floor(Date.now()/1000)).first();
}
function isAdmin(session,env) {
  return !!session && String(env.ADMIN_USER_IDS||"").split(/[\s,]+/).filter(Boolean).includes(session.discord_id);
}
function protectedMutation(request,session) {
  const origin=request.headers.get("Origin");
  if(!origin || origin!==new URL(request.url).origin)return false;
  return request.headers.get("X-CSRF-Token")===session.csrf;
}
async function requestData(request) {
  const size=Number(request.headers.get("Content-Length")||"0");
  if(size>16000)throw new Error("入力が長すぎます");
  const raw=await request.text();
  if(raw.length>16000)throw new Error("入力が長すぎます");
  try {return JSON.parse(raw);} catch {throw new Error("入力形式が正しくありません");}
}
function clean(value,max) {
  return typeof value==="string"?value.trim().slice(0,max):"";
}
async function authLogin(request,env,url) {
  if(!configReady(env))return fail("Discord連携はまだ準備中です",503);
  const state=randomToken();
  const destination=url.searchParams.get("return")==="/admin.html"?"/admin.html":"/";
  const params=new URLSearchParams({
    client_id:env.DISCORD_CLIENT_ID,
    response_type:"code",
    redirect_uri:url.origin+"/auth/callback",
    scope:"identify",
    state,
    prompt:"consent"
  });
  return redirect("https://discord.com/oauth2/authorize?"+params.toString(),
    [setCookie(OAUTH_STATE,state,600),setCookie(OAUTH_NEXT,destination==="/admin.html"?"admin":"apply",600)]);
}
async function authCallback(request,env,url) {
  const c=cookies(request),state=url.searchParams.get("state"),code=url.searchParams.get("code");
  if(!state||!code||!c[OAUTH_STATE]||state!==c[OAUTH_STATE])return fail("ログインの検証に失敗しました",403);
  const target=c[OAUTH_NEXT]==="admin"?"/admin.html":"/";
  const form=new URLSearchParams({
    client_id:env.DISCORD_CLIENT_ID,client_secret:env.DISCORD_CLIENT_SECRET,
    grant_type:"authorization_code",code,redirect_uri:url.origin+"/auth/callback"
  });
  const auth=await fetch(DISCORD+"/oauth2/token",{method:"POST",
    headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
  if(!auth.ok)return fail("Discordログインに失敗しました",502);
  const tokenInfo=await auth.json();
  const me=await fetch(DISCORD+"/users/@me",{headers:{Authorization:"Bearer "+tokenInfo.access_token}});
  if(!me.ok)return fail("Discordアカウントを取得できませんでした",502);
  const user=await me.json();
  if(!/^\d{15,25}$/.test(user.id||""))return fail("Discordアカウント情報が不正です",502);
  const token=randomToken(),csrf=randomToken(),now=Math.floor(Date.now()/1000);
  await env.DB.prepare("INSERT INTO sessions(token_hash,discord_id,username,csrf,expires_at) VALUES(?,?,?,?,?)")
    .bind(await hash(token),user.id,clean(user.global_name||user.username,100),csrf,now+SESSION_SECONDS).run();
  return redirect(target,[
    setCookie(SESSION,token,SESSION_SECONDS),
    setCookie(OAUTH_STATE,"",0),setCookie(OAUTH_NEXT,"",0)
  ]);
}
async function logout(request,env,session) {
  if(!session||!protectedMutation(request,session))return fail("ログイン情報が無効です",403);
  await env.DB.prepare("DELETE FROM sessions WHERE token_hash=?").bind(session.token_hash).run();
  const out=json({ok:true});
  out.headers.append("Set-Cookie",setCookie(SESSION,"",0));
  return out;
}
async function createApplication(request,env,session) {
  if(!session)return fail("Discordでログインしてください",401);
  if(!protectedMutation(request,session))return fail("認証トークンが一致しません",403);
  const data=await requestData(request);
  if(data.ageConfirmed!==true||data.rulesAccepted!==true)
    return fail("募集条件とルールへの同意が必要です");
  const player=clean(data.playerName,48),platform=clean(data.platform,24);
  const rank=clean(data.rank,40),peak=clean(data.peakRank,40);
  const schedule=clean(data.availability,400),reason=clean(data.reason,1600),experience=clean(data.experience,700);
  const social=clean(data.social,250);
  if(player.length<2||schedule.length<5||reason.length<15)return fail("必須項目を入力してください");
  if(!["PC","PlayStation","Xbox","その他"].includes(platform))return fail("デバイスを選択してください");
  if(!rank||!peak)return fail("現在・最高ランクを入力してください");
  if(social && !/^https:\/\/(x\.com|twitter\.com|youtube\.com|www\.youtube\.com|twitch\.tv|www\.twitch\.tv)\//i.test(social))
    return fail("SNSのURL形式を確認してください");
  if(!await isGuildMember(env,session.discord_id))
    return fail("先にNeverStopの公開Discordサーバーへ参加してください",403);
  const latest=await env.DB.prepare("SELECT status,created_at FROM applications WHERE discord_id=? ORDER BY created_at DESC LIMIT 1")
    .bind(session.discord_id).first();
  const now=Date.now();
  if(latest && latest.status!=="rejected")return fail("すでに申請があります。審査状況を確認してください",409);
  if(latest && now-Date.parse(latest.created_at)<7*86400000)return fail("再応募は前回の応募から7日後に可能です",429);
  const id=crypto.randomUUID(),date=new Date().toISOString();
  try {
    await env.DB.prepare("INSERT INTO applications(id,discord_id,discord_name,player_name,platform,rank,peak_rank,availability,experience,reason,social,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
      .bind(id,session.discord_id,session.username,player,platform,rank,peak,schedule,experience,reason,social,"pending",date,date).run();
  }catch(err) {
    if(String(err).includes("UNIQUE"))return fail("審査中の応募がすでにあります",409);
    throw err;
  }
  await audit(env,id,session.discord_id,"submitted","");
  return json({ok:true,id,status:"pending"},201);
}
async function audit(env,applicationId,actorId,event,note) {
  await env.DB.prepare("INSERT INTO review_events(id,application_id,actor_id,event,note,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(),applicationId,actorId,event,note,new Date().toISOString()).run();
}
async function adminDecision(request,env,session,id) {
  if(!session)return fail("ログインが必要です",401);
  if(!isAdmin(session,env))return fail("運営者以外は操作できません",403);
  if(!protectedMutation(request,session))return fail("認証トークンが一致しません",403);
  const {action,note}=await requestData(request);
  if(!["reviewing","approve","reject"].includes(action))return fail("操作が正しくありません");
  const memo=clean(note,500),now=new Date().toISOString();
  const record=await env.DB.prepare("SELECT id,discord_id,status FROM applications WHERE id=?").bind(id).first();
  if(!record)return fail("応募が見つかりません",404);
  if(!["pending","reviewing","role_error"].includes(record.status))return fail("この申請はすでに処理されています",409);
  if(action==="reviewing"||action==="reject"){
    const next=action==="reject"?"rejected":"reviewing";
    const r=await env.DB.prepare("UPDATE applications SET status=?,moderator_id=?,moderator_note=?,updated_at=? WHERE id=? AND status IN ('pending','reviewing','role_error')")
      .bind(next,session.discord_id,memo,now,id).run();
    if(r.meta.changes!==1)return fail("別の運営者が先に操作しました",409);
    await audit(env,id,session.discord_id,next,memo);
    return json({ok:true,status:next});
  }
  // Reserve the application to prevent double approval while Discord is called.
  const reserved=await env.DB.prepare("UPDATE applications SET status='granting',updated_at=? WHERE id=? AND status IN ('pending','reviewing','role_error')")
    .bind(now,id).run();
  if(reserved.meta.changes!==1)return fail("別の運営者が先に操作しました",409);
  try {
    const member=await isGuildMember(env,record.discord_id);
    if(!member)throw new Error("応募者がDiscordサーバーにいません");
    const assigned=await discordBot(env,"/guilds/"+encodeURIComponent(env.DISCORD_GUILD_ID)+
      "/members/"+encodeURIComponent(record.discord_id)+"/roles/"+encodeURIComponent(env.COMPETITIVE_ROLE_ID),"PUT");
    if(!assigned.ok)throw new Error("Discordのロール付与に失敗しました ("+assigned.status+")");
    await env.DB.prepare("UPDATE applications SET status='approved',moderator_id=?,moderator_note=?,role_granted_at=?,updated_at=? WHERE id=? AND status='granting'")
      .bind(session.discord_id,memo,now,now,id).run();
    await audit(env,id,session.discord_id,"approved",memo);
    return json({ok:true,status:"approved"});
  }catch(e) {
    // Keep the original approval intent visible to administrators if Discord/DB fails.
    await env.DB.prepare("UPDATE applications SET status='role_error',moderator_note=?,updated_at=? WHERE id=? AND status='granting'")
      .bind(clean(String(e.message||e),250),new Date().toISOString(),id).run();
    console.error("Approval problem",e);
    return fail("ロール付与に失敗しました。運営者が設定を確認してください",502);
  }
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url),path=url.pathname;
    try {
      if(path==="/health")return json({service:"NeverStop competition portal",configured:configReady(env)});
      if(path.startsWith("/api/")||path.startsWith("/auth/")){
        if(!configReady(env))return fail("運営システムはまだ設定中です",503);
        if(path==="/auth/login"&&request.method==="GET")return authLogin(request,env,url);
        if(path==="/auth/callback"&&request.method==="GET")return authCallback(request,env,url);
        const session=await sessionFrom(request,env);
        if(path==="/auth/logout"&&request.method==="POST")return logout(request,env,session);
        if(path==="/api/me"&&request.method==="GET"){
          if(!session)return json({authenticated:false,invite:env.PUBLIC_DISCORD_INVITE||""});
          return json({authenticated:true,user:{id:session.discord_id,name:session.username},
            admin:isAdmin(session,env),member:await isGuildMember(env,session.discord_id),
            csrf:session.csrf,invite:env.PUBLIC_DISCORD_INVITE||""});
        }
        if(path==="/api/applications/mine"&&request.method==="GET"){
          if(!session)return fail("ログインが必要です",401);
          const row=await env.DB.prepare("SELECT id,player_name,status,created_at,updated_at FROM applications WHERE discord_id=? ORDER BY created_at DESC LIMIT 1")
            .bind(session.discord_id).first();
          return json({application:row||null});
        }
        if(path==="/api/applications"&&request.method==="POST")return createApplication(request,env,session);
        if(path==="/api/admin/applications"&&request.method==="GET"){
          if(!session)return fail("ログインが必要です",401);
          if(!isAdmin(session,env))return fail("権限がありません",403);
          const rows=await env.DB.prepare("SELECT id,discord_id,discord_name,player_name,platform,rank,peak_rank,availability,experience,reason,social,status,moderator_id,moderator_note,created_at,updated_at FROM applications ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'reviewing' THEN 1 WHEN 'role_error' THEN 2 ELSE 3 END,created_at DESC LIMIT 200").all();
          return json({applications:rows.results||[]});
        }
        const match=path.match(/^\/api\/admin\/applications\/([0-9a-f-]{36})\/decision$/);
        if(match&&request.method==="POST")return adminDecision(request,env,session,match[1]);
        return fail("このAPIは存在しません",404);
      }
      if(request.method!=="GET"&&request.method!=="HEAD")return fail("Method not allowed",405);
      return env.ASSETS.fetch(request);
    }catch(e) {
      console.error("Portal error",e);
      if(e.message==="入力が長すぎます"||e.message==="入力形式が正しくありません")return fail(e.message,400);
      return fail("処理できませんでした。少し後で再度お試しください",500);
    }
  }
};
