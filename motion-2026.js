/* Koroma Leone Tech — lightweight, accessible 2026 interface motion. */
(function(){
 'use strict';
 if(window.__kltMotion2026Loaded)return;
 window.__kltMotion2026Loaded=true;
 var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 var smallScreen=window.matchMedia&&window.matchMedia('(max-width: 720px)').matches;
 if(reduce)return;
 var selector='.welcome,.stats,.grid-main,.stat,.panel,.module-card,.quick,.report-box';
 function reveal(root){
  if(!root||root.nodeType!==1)return;
  var nodes=[];
  if(root.matches&&root.matches(selector))nodes.push(root);
  if(root.querySelectorAll)nodes=nodes.concat(Array.from(root.querySelectorAll(selector)));
  nodes.slice(0,smallScreen?12:28).forEach(function(node){
   if(node.dataset.kltMotionSeen)return;
   node.dataset.kltMotionSeen='1';
   node.classList.add('klt-enter');
   node.addEventListener('animationend',function(){node.classList.remove('klt-enter')},{once:true});
  });
 }
 function start(){
  var view=document.getElementById('view');
  if(!view)return;
  reveal(view);
  var queued=false;
  var observer=new MutationObserver(function(records){
   if(queued)return;queued=true;
   requestAnimationFrame(function(){
    queued=false;
    records.forEach(function(record){record.addedNodes.forEach(function(node){reveal(node)})});
   });
  });
  observer.observe(view,{childList:true,subtree:true});
  window.addEventListener('pagehide',function(){observer.disconnect()},{once:true});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
 else start();
})();
