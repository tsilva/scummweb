#!/usr/bin/env python3

from pathlib import Path
import os
import re
import sys

path = Path(sys.argv[1])
html_text = path.read_text()
updated_html = html_text.replace("<title>ScummVM</title>", "<title>scummweb</title>", 1)
updated_html = re.sub(
    r'canvas\.emscripten\{border:0 none;background:url\("logo\.svg(?:\?v=[^"]+)?"\);background-position:center;background-repeat:no-repeat;background-color:#c60;position:absolute;top:0;left:0;margin:0;width:100%;height:100%;overflow:hidden;display:block\}@media \(orientation:landscape\)\{canvas\.emscripten\{background-size:auto 33%\}\}@media \(orientation:portrait\)\{canvas\.emscripten\{background-size:80% auto\}\}',
    "canvas.emscripten{border:0 none;background:#000;position:absolute;top:0;left:0;margin:0;width:100%;height:100%;overflow:hidden;display:block}",
    updated_html,
    count=1,
)
asset_version = os.environ.get("SCUMMVM_BUNDLE_ASSET_VERSION", "dev")
redirect_script = """<script>(function(){
const exitTo=new URLSearchParams(window.location.search).get("exitTo");
if(!exitTo)return;
const resolvedExitHref=(()=>{try{const resolvedUrl=new URL(exitTo,window.location.href);return resolvedUrl.origin===window.location.origin?`${resolvedUrl.pathname}${resolvedUrl.search}${resolvedUrl.hash}`:"/"}catch{return "/"}})();
const skipIntroTarget=new URLSearchParams(window.location.search).get("skipIntroTarget");
const launchArgs=((window.location.hash||"").replace(/^#/,"").trim().split(/\\s+/).filter(Boolean));
const target=skipIntroTarget||launchArgs[0]||"";
const launchPattern=target?new RegExp(`User picked target '${target.replace(/[.*+?^${}()|[\\]\\\\]/g,"\\\\$&")}'`):null;
const escapeRedirectWindowMs=1500;
let didHandleExit=false;
let hasUserInteracted=false;
let lastInteractionAt=0;
let lastInteractionKey="";
let lastEscapeAt=0;
let recentEscapeCount=0;
let pendingExitStatus=null;
let pendingExitTimer=0;
const markUserInteraction=event=>{if(event.type==="keydown"){if(event.metaKey||event.ctrlKey||event.altKey)return;lastInteractionKey=event.key||"";lastInteractionAt=Date.now();if(event.key==="Escape"){recentEscapeCount=lastInteractionAt-lastEscapeAt<=escapeRedirectWindowMs?recentEscapeCount+1:1;lastEscapeAt=lastInteractionAt}else{recentEscapeCount=0;lastEscapeAt=0}}else{lastInteractionKey="";lastInteractionAt=Date.now();recentEscapeCount=0;lastEscapeAt=0}hasUserInteracted=true};
for(const eventName of["keydown","mousedown","touchstart"]){window.addEventListener(eventName,markUserInteraction,{capture:true,passive:eventName!=="keydown"})}
const handleExit=status=>{if(didHandleExit)return;didHandleExit=true;if(pendingExitTimer){window.clearTimeout(pendingExitTimer);pendingExitTimer=0}const exitMessage={type:"scummvm-exit",href:resolvedExitHref,status};if(window.parent&&window.parent!==window){try{window.parent.postMessage(exitMessage,window.location.origin);return}catch{}}try{window.location.replace(resolvedExitHref)}catch{window.location.href=resolvedExitHref}};
const requestExit=status=>{pendingExitStatus=Number.isFinite(status)?status:0;if(pendingExitTimer)return;pendingExitTimer=window.setTimeout((()=>{pendingExitTimer=0;if(pendingExitStatus!==null){handleExit(pendingExitStatus)}}),150)};
globalThis.__scummvmRequestExit=requestExit;
const scummwebMessageSource="scummweb";
const postParentMessage=message=>{if(!(window.parent&&window.parent!==window))return false;try{window.parent.postMessage(message,window.location.origin);return true}catch{return false}};
const buildCurrentFrameHref=()=>`${window.location.pathname}${window.location.search}${window.location.hash}`;
let readyState={state:target?"pending":"idle",target:target||null,href:buildCurrentFrameHref(),reason:target?"awaiting-launch":"no-target",source:scummwebMessageSource,emittedAt:null};
const syncReadyState=updates=>{readyState={...readyState,...updates,target:target||null,href:buildCurrentFrameHref(),source:scummwebMessageSource};globalThis.__scummwebReadyState=readyState;return readyState};
const markLaunchDetected=()=>{if(!target||readyState.state==="ready"||readyState.state==="launch-detected")return readyState;return syncReadyState({state:"launch-detected",reason:"launch-output-detected"})};
const emitGameReady=reason=>{if(!target||readyState.state==="ready")return false;const nextReadyState=syncReadyState({state:"ready",reason,emittedAt:Date.now()});postParentMessage({type:"scummvm-ready",source:scummwebMessageSource,target:nextReadyState.target,href:nextReadyState.href,reason:nextReadyState.reason,emittedAt:nextReadyState.emittedAt});return true};
syncReadyState({});
const canvas=document.getElementById("canvas");
const output=document.getElementById("output");
if(canvas){
const visibleCursorClass="scummvm-browser-cursor-visible";
const visibleHintClass="scummvm-cursor-grab-hint-visible";
const hintId="scummvm-cursor-grab-hint";
const cursorGrabHintRevealDelayMs=2500;
const readyFramePollIntervalMs=120;
const readyFrameSampleSize=32;
const readyFrameTimeoutMs=15000;
const touchTapDurationMs=260;
const touchTapMoveThresholdPx=28;
const touchClickModeStorageKey="scummweb.touchClickMode";
let gameRunning=!launchPattern;
let hoverActive=false;
let launchPollTimer=0;
let launchRevealTimer=0;
let readyFramePollTimer=0;
let readyFramePollStartedAt=0;
let activeTouchGesture=null;
let touchClickMode="left";
const readyFrameScratch=document.createElement("canvas");
readyFrameScratch.width=readyFrameSampleSize;
readyFrameScratch.height=readyFrameSampleSize;
const readyFrameContext=readyFrameScratch.getContext("2d",{willReadFrequently:true});
const cursorStyle=document.createElement("style");
cursorStyle.textContent=`#canvas{touch-action:none!important;-webkit-user-select:none;user-select:none}#canvas.${visibleCursorClass}{cursor:default!important}#${hintId}{position:fixed;top:max(1rem,calc(env(safe-area-inset-top) + .75rem));left:50%;transform:translateX(-50%);max-width:min(calc(100vw - 2rem),26rem);padding:.7rem 1rem;border:1px solid rgba(255,255,255,.3);border-radius:999px;background:rgba(12,12,12,.84);box-shadow:0 .9rem 2.5rem rgba(0,0,0,.38);color:rgba(255,255,255,.92);font:600 .9rem/1.3 "Trebuchet MS",Verdana,Tahoma,sans-serif;letter-spacing:.01em;text-align:center;opacity:0;pointer-events:none;transition:opacity 120ms ease;z-index:4}#${hintId}.${visibleHintClass}{opacity:1}`;
document.head.appendChild(cursorStyle);
const grabHint=document.createElement("div");
grabHint.id=hintId;
grabHint.textContent="Click the game to grab the cursor.";
document.body.appendChild(grabHint);
const showBrowserCursor=()=>{canvas.classList.add(visibleCursorClass)};
const allowGameCursor=()=>{canvas.classList.remove(visibleCursorClass)};
const showGrabHint=()=>{grabHint.classList.add(visibleHintClass)};
const hideGrabHint=()=>{grabHint.classList.remove(visibleHintClass)};
const hasLaunchOutput=()=>Boolean(launchPattern&&output&&launchPattern.test(output.value||""));
const hasRenderableGameFrame=()=>{if(!readyFrameContext||!canvas.width||!canvas.height)return false;try{readyFrameContext.clearRect(0,0,readyFrameSampleSize,readyFrameSampleSize);readyFrameContext.drawImage(canvas,0,0,readyFrameSampleSize,readyFrameSampleSize);const{data}=readyFrameContext.getImageData(0,0,readyFrameSampleSize,readyFrameSampleSize);let brightSampleCount=0;for(let offset=0;offset<data.length;offset+=4){if(data[offset+3]===0)continue;const brightness=data[offset]+data[offset+1]+data[offset+2];if(brightness<=24)continue;brightSampleCount+=1;if(brightSampleCount>=48)return true}}catch{}return false};
const setGameRunning=reason=>{if(gameRunning)return false;gameRunning=true;if(launchPollTimer){window.clearInterval(launchPollTimer);launchPollTimer=0}if(launchRevealTimer){window.clearTimeout(launchRevealTimer);launchRevealTimer=0}if(readyFramePollTimer){window.clearTimeout(readyFramePollTimer);readyFramePollTimer=0}readyFramePollStartedAt=0;emitGameReady(reason);return true};
const scheduleReadySignal=()=>{if(gameRunning)return false;if(hasRenderableGameFrame()){if(setGameRunning("rendered-frame-detected"))syncCursorPrompt();return true}if(readyFramePollTimer)return false;if(!readyFramePollStartedAt){readyFramePollStartedAt=Date.now()}const checkReadyFrame=()=>{readyFramePollTimer=0;if(gameRunning)return;if(hasRenderableGameFrame()){if(setGameRunning("rendered-frame-detected"))syncCursorPrompt();return}if(Date.now()-readyFramePollStartedAt>=readyFrameTimeoutMs){if(setGameRunning("rendered-frame-timeout"))syncCursorPrompt();return}readyFramePollTimer=window.setTimeout(checkReadyFrame,readyFramePollIntervalMs)};readyFramePollTimer=window.setTimeout(checkReadyFrame,readyFramePollIntervalMs);return true};
const scheduleGameRunning=()=>{if(gameRunning||launchRevealTimer)return false;markLaunchDetected();if(launchPollTimer){window.clearInterval(launchPollTimer);launchPollTimer=0}launchRevealTimer=window.setTimeout((()=>{launchRevealTimer=0;scheduleReadySignal()}),cursorGrabHintRevealDelayMs);return true};
const syncCursorPrompt=()=>{if(!gameRunning&&hasLaunchOutput())scheduleGameRunning();if(gameRunning&&hoverActive){showBrowserCursor();showGrabHint();return}hideGrabHint();allowGameCursor()};
const promptCursorGrab=()=>{hoverActive=true;syncCursorPrompt()};
const clearCursorPrompt=()=>{hoverActive=false;syncCursorPrompt()};
const releaseCursorPrompt=()=>{hideGrabHint();allowGameCursor()};
const clamp=(value,min,max)=>Math.min(Math.max(value,min),max);
const measureDistance=(pointA,pointB)=>{if(!pointA||!pointB)return Number.POSITIVE_INFINITY;return Math.hypot(pointA.clientX-pointB.clientX,pointA.clientY-pointB.clientY)};
const normalizeTouchClickMode=value=>value==="right"?"right":"left";
const setTouchClickMode=nextMode=>{touchClickMode=normalizeTouchClickMode(nextMode);try{window.localStorage.setItem(touchClickModeStorageKey,touchClickMode)}catch{}};
const getTouchClickButton=()=>touchClickMode==="right"?2:0;
const consumeTouchEvent=event=>{if(event.cancelable)event.preventDefault();if(typeof event.stopImmediatePropagation==="function")event.stopImmediatePropagation();event.stopPropagation()};
const getTouchPoint=touchLike=>{if(!touchLike)return null;const rect=canvas.getBoundingClientRect();const maxX=rect.width>0?rect.right:rect.left;const maxY=rect.height>0?rect.bottom:rect.top;const clientX=clamp(Number.isFinite(touchLike.clientX)?touchLike.clientX:rect.left,rect.left,maxX);const clientY=clamp(Number.isFinite(touchLike.clientY)?touchLike.clientY:rect.top,rect.top,maxY);return{clientX,clientY,screenX:Number.isFinite(touchLike.screenX)?touchLike.screenX:clientX,screenY:Number.isFinite(touchLike.screenY)?touchLike.screenY:clientY,pageX:Number.isFinite(touchLike.pageX)?touchLike.pageX:clientX+window.scrollX,pageY:Number.isFinite(touchLike.pageY)?touchLike.pageY:clientY+window.scrollY}};
const getGesturePoint=touchList=>{const touches=Array.from(touchList||[]);if(touches.length===0)return null;touches.sort(((leftTouch,rightTouch)=>leftTouch.clientX-rightTouch.clientX));return getTouchPoint(touches[touches.length-1])};
const focusCanvas=()=>{try{canvas.focus({preventScroll:true})}catch{}};
const dispatchPointerEvent=(eventName,point,{button=0,buttons=0}={})=>{if(typeof PointerEvent!=="function"||!point)return;const pointerEvent=new PointerEvent(eventName,{bubbles:true,cancelable:true,composed:true,pointerId:1,pointerType:"mouse",isPrimary:true,clientX:point.clientX,clientY:point.clientY,screenX:point.screenX,screenY:point.screenY,pageX:point.pageX,pageY:point.pageY,button,buttons,pressure:buttons===0?0:.5});canvas.dispatchEvent(pointerEvent)};
const dispatchMouseEvent=(eventName,point,{button=0,buttons=0,detail=1}={})=>{if(!point)return;const mouseEvent=new MouseEvent(eventName,{bubbles:true,cancelable:true,composed:true,clientX:point.clientX,clientY:point.clientY,screenX:point.screenX,screenY:point.screenY,button,buttons,detail});canvas.dispatchEvent(mouseEvent)};
const dispatchSyntheticMove=point=>{if(!point)return;focusCanvas();dispatchPointerEvent("pointermove",point,{button:0,buttons:0});dispatchMouseEvent("mousemove",point,{button:0,buttons:0,detail:0})};
const dispatchSyntheticClick=(point,button)=>{if(!point)return;const buttons=button===2?2:1;focusCanvas();dispatchSyntheticMove(point);dispatchPointerEvent("pointerdown",point,{button,buttons});dispatchMouseEvent("mousedown",point,{button,buttons});dispatchPointerEvent("pointerup",point,{button,buttons:0});dispatchMouseEvent("mouseup",point,{button,buttons:0});if(button===2){dispatchMouseEvent("contextmenu",point,{button,buttons:0,detail:2});return}dispatchMouseEvent("click",point,{button,buttons:0,detail:2})};
const handleScummwebMessage=event=>{if(event.origin!==window.location.origin||event.data?.type!=="scummweb-touch-click-mode")return;setTouchClickMode(event.data.mode)};
const handleTouchStart=event=>{if(event.touches.length===0)return;consumeTouchEvent(event);const point=getGesturePoint(event.touches);activeTouchGesture={startedAt:Date.now(),startPoint:point,lastPoint:point,moved:false};dispatchSyntheticMove(point)};
const handleTouchMove=event=>{if(!activeTouchGesture||event.touches.length===0)return;consumeTouchEvent(event);const point=getGesturePoint(event.touches);if(!point)return;if(measureDistance(activeTouchGesture.startPoint,point)>touchTapMoveThresholdPx){activeTouchGesture.moved=true}activeTouchGesture.lastPoint=point;dispatchSyntheticMove(point)};
const handleTouchEnd=event=>{consumeTouchEvent(event);const point=getGesturePoint(event.touches)||getGesturePoint(event.changedTouches)||activeTouchGesture?.lastPoint||null;if(point){dispatchSyntheticMove(point)}if(!activeTouchGesture){return}if(point&&measureDistance(activeTouchGesture.startPoint,point)>touchTapMoveThresholdPx){activeTouchGesture.moved=true}if(event.touches.length>0){activeTouchGesture.lastPoint=point||activeTouchGesture.lastPoint;return}const completedGesture={...activeTouchGesture,endedAt:Date.now(),endPoint:point||activeTouchGesture.lastPoint};activeTouchGesture=null;const gestureDuration=completedGesture.endedAt-completedGesture.startedAt;const isTap=!completedGesture.moved&&gestureDuration<=touchTapDurationMs&&completedGesture.endPoint;if(!isTap)return;dispatchSyntheticClick(completedGesture.endPoint,getTouchClickButton())};
const handleTouchCancel=event=>{consumeTouchEvent(event);activeTouchGesture=null};
try{setTouchClickMode(window.localStorage.getItem(touchClickModeStorageKey))}catch{setTouchClickMode("left")}
window.addEventListener("message",handleScummwebMessage);
canvas.addEventListener("mouseenter",promptCursorGrab,{passive:true});
canvas.addEventListener("pointerenter",promptCursorGrab,{passive:true});
canvas.addEventListener("mouseleave",clearCursorPrompt,{passive:true});
canvas.addEventListener("pointerleave",clearCursorPrompt,{passive:true});
canvas.addEventListener("contextmenu",(event=>{if(event.cancelable)event.preventDefault()}));
for(const eventName of["mousedown","touchstart"]){canvas.addEventListener(eventName,releaseCursorPrompt,{capture:true,passive:true})}
canvas.addEventListener("touchstart",handleTouchStart,{capture:true,passive:false});
canvas.addEventListener("touchmove",handleTouchMove,{capture:true,passive:false});
canvas.addEventListener("touchend",handleTouchEnd,{capture:true,passive:false});
canvas.addEventListener("touchcancel",handleTouchCancel,{capture:true,passive:false});
if(hasLaunchOutput()){scheduleGameRunning()}else if(launchPattern&&output){launchPollTimer=window.setInterval((()=>{if(hasLaunchOutput()){scheduleGameRunning();syncCursorPrompt()}}),250)}
syncCursorPrompt()
}
const shouldRedirectOnQuit=()=>{if(pendingExitStatus!==null)return true;if(!hasUserInteracted)return false;const now=Date.now();const quitFollowsRecentEscape=lastInteractionKey==="Escape"&&now-lastInteractionAt<=escapeRedirectWindowMs;if(!quitFollowsRecentEscape)return true;return recentEscapeCount>=2&&now-lastEscapeAt<=escapeRedirectWindowMs};
window.Module=window.Module||{};
const originalQuit=window.Module.quit;
window.Module.quit=function(status,toThrow){if(shouldRedirectOnQuit()){handleExit(status)}if(typeof originalQuit==="function"){return originalQuit(status,toThrow)}throw toThrow||new Error(`ScummVM exited (${status})`)}
})();</script>"""
module_loader = """<script type=module>(function(){const v=new URLSearchParams(window.location.search).get("v");const moduleUrl=v?`./scummvm_fs.js?v=${encodeURIComponent(v)}`:"./scummvm_fs.js";window.ScummvmFSReady=import(moduleUrl).then(({ScummvmFS})=>{window.ScummvmFS=ScummvmFS})})();</script>"""
script_tag = "<script src=scummvm.js async></script>"
versioned_scummvm_loader = """<script>(function(){const v=new URLSearchParams(window.location.search).get("v");window.Module=window.Module||{};const originalLocateFile=window.Module.locateFile;window.Module.locateFile=function(path,prefix){const raw=typeof originalLocateFile=="function"?originalLocateFile(path,prefix):`${prefix||""}${path}`;if(!v)return raw;const resolved=new URL(raw,window.location.href);resolved.searchParams.set("v",v);return resolved.toString()};const script=document.createElement("script");script.async=true;script.src=v?`scummvm.js?v=${encodeURIComponent(v)}`:"scummvm.js";document.body.appendChild(script)})();</script>"""
filesystem_patch = r"""const skipIntroTarget = new URLSearchParams(window.location.search).get("skipIntroTarget");
globalThis.__scummwebSkipIntroSeedStatus = {
  state: skipIntroTarget ? "pending" : "idle",
  target: skipIntroTarget,
  files: [],
};

function buildVersionedAssetUrl(assetPath) {
  const resolvedUrl = new URL(assetPath, window.location.href);
  const v = new URLSearchParams(window.location.search).get("v");

  if (v) {
    resolvedUrl.searchParams.set("v", v);
  }

  return resolvedUrl.toString();
}

function getConfiguredSavePath() {
  try {
    const iniText = FS.readFile("/home/web_user/scummvm.ini", { encoding: "utf8" });

    for (const rawLine of iniText.split("\n")) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

      if (line.startsWith("savepath=") && line.slice(9).trim()) {
        return line.slice(9).trim();
      }
    }
  } catch {}

  return "/home/web_user/.local/share/scummvm/saves";
}

function ensureDirectory(directoryPath) {
  let currentPath = "";

  for (const segment of directoryPath.split("/").filter(Boolean)) {
    currentPath += `/${segment}`;

    try {
      FS.stat(currentPath);
    } catch {
      FS.mkdir(currentPath);
    }
  }
}

function setupSkipIntroSaves() {
  if (!skipIntroTarget) {
    globalThis.__scummwebSkipIntroSeedStatus = { state: "idle", target: null, files: [] };
    return Promise.resolve();
  }

  return fetch(buildVersionedAssetUrl("games.json"))
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load games.json (${response.status})`);
      }

      return response.json();
    })
    .then((library) => {
      const matchingGame = (Array.isArray(library?.games) ? library.games : []).find(
        (game) => game?.target === skipIntroTarget
      );
      const skipIntroConfig = matchingGame?.skipIntro;

      if (
        !skipIntroConfig ||
        skipIntroConfig.strategy !== "save-slot" ||
        !Array.isArray(skipIntroConfig.saveFiles) ||
        skipIntroConfig.saveFiles.length === 0
      ) {
        globalThis.__scummwebSkipIntroSeedStatus = { state: "missing", target: skipIntroTarget, files: [] };
        return undefined;
      }

      const savePath = getConfiguredSavePath();
      ensureDirectory(savePath);

      return Promise.all(
        skipIntroConfig.saveFiles.map((fileName) => {
          const trimmedFileName = typeof fileName === "string" ? fileName.trim() : "";

          if (!trimmedFileName) {
            return Promise.resolve(null);
          }

          const assetPath = `launcher/skip-intro/${encodeURIComponent(skipIntroTarget)}/${encodeURIComponent(trimmedFileName)}`;

          return fetch(buildVersionedAssetUrl(assetPath))
            .then((assetResponse) => {
              if (!assetResponse.ok) {
                throw new Error(`Failed to load ${trimmedFileName} (${assetResponse.status})`);
              }

              return assetResponse.arrayBuffer();
            })
            .then((buffer) => {
              FS.writeFile(`${savePath}/${trimmedFileName}`, new Uint8Array(buffer));
              return trimmedFileName;
            });
        })
      ).then((seededFiles) => {
        globalThis.__scummwebSkipIntroSeedStatus = {
          state: "ready",
          target: skipIntroTarget,
          files: seededFiles.filter(Boolean),
          savePath,
          slot: skipIntroConfig.slot,
        };
      });
    })
    .catch((error) => {
      console.error("Failed to seed skip-intro save files", error);
      globalThis.__scummwebSkipIntroSeedStatus = {
        state: "error",
        target: skipIntroTarget,
        files: [],
        message: error instanceof Error ? error.message : String(error),
      };
    });
}

function setupFilesystem() {
  addRunDependency("scummvm-fs-setup");
  Promise.all([window.ScummvmFSReady || Promise.resolve(), setupLocalFilesystem()])
    .then(() => setupSkipIntroSaves())
    .then(
      () => {
        setupHTTPFilesystem("games");
        setupHTTPFilesystem("data");
        removeRunDependency("scummvm-fs-setup");
      },
      (error) => {
        removeRunDependency("scummvm-fs-setup");
        throw error;
      }
    );
}"""

updated_html = updated_html.replace(
    '<script type=module>import{ScummvmFS}from"./scummvm_fs.js";window.ScummvmFS=ScummvmFS</script>',
    module_loader,
    1,
)
updated_html = updated_html.replace(
    '<link href=manifest.json rel=manifest>',
    f'<link href=manifest.json?v={asset_version} rel=manifest>',
    1,
)
updated_html = updated_html.replace(
    '<link href=scummvm-192.png rel=apple-touch-icon>',
    f'<link href=scummvm-192.png?v={asset_version} rel=apple-touch-icon>',
    1,
)
updated_html = updated_html.replace(
    'background:url("logo.svg");',
    f'background:url("logo.svg?v={asset_version}");',
    1,
)
updated_html = updated_html.replace(
    'fetch("scummvm.ini")',
    'fetch((()=>{const e=new URL("scummvm.ini",window.location.href),t=new URLSearchParams(window.location.search).get("v");return t&&e.searchParams.set("v",t),e.toString()})())',
    1,
)
for current_setup_filesystem in (
    'function setupFilesystem(){addRunDependency("scummvm-fs-setup"),setupLocalFilesystem().then((()=>{setupHTTPFilesystem("games"),setupHTTPFilesystem("data"),removeRunDependency("scummvm-fs-setup")}))}',
    'function setupFilesystem(){addRunDependency("scummvm-fs-setup"),Promise.all([window.ScummvmFSReady||Promise.resolve(),setupLocalFilesystem()]).then((()=>{setupHTTPFilesystem("games"),setupHTTPFilesystem("data"),removeRunDependency("scummvm-fs-setup")}))}',
):
    if current_setup_filesystem in updated_html:
        updated_html = updated_html.replace(current_setup_filesystem, filesystem_patch, 1)
        break

updated_html = re.sub(
    r'const skipIntroTarget\s*=\s*new URLSearchParams\(window\.location\.search\)\.get\("skipIntroTarget"\);.*?(?=var Module=\{)',
    lambda _: filesystem_patch,
    updated_html,
    count=1,
    flags=re.DOTALL,
)

updated_html = re.sub(
    r'<script>\(function\(\)\{\s*const exitTo=new URLSearchParams\(window\.location\.search\)\.get\("exitTo"\);.*?</script>',
    "",
    updated_html,
    count=0,
    flags=re.DOTALL,
)

combined_loader = f"{redirect_script}{versioned_scummvm_loader}"
if script_tag in updated_html:
    updated_html = updated_html.replace(script_tag, combined_loader, 1)
else:
    updated_html = updated_html.replace(versioned_scummvm_loader, combined_loader, 1)

if updated_html != html_text:
    path.write_text(updated_html)
