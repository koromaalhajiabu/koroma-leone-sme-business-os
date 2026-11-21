/* Koroma Leone SME — selectable colour palettes with a random launch option. */
(function(){
 'use strict';
 if(window.__wlDynamicAccentLoaded)return;
 window.__wlDynamicAccentLoaded=true;
 var palettes=[
  {id:'emerald',name:'Emerald',primary:'#087a58',deep:'#06503e',deepest:'#03382f',secondary:'#1668a7',secondaryDark:'#104b7c',secondarySoft:'#d9edf9',soft:'#e8f5ee',line:'#cce5d6',glow:'rgba(22,104,167,.16)',body:'#f3faf6'},
  {id:'ocean',name:'Ocean blue',primary:'#1769aa',deep:'#104b7c',deepest:'#0b3457',secondary:'#087b84',secondaryDark:'#07575e',secondarySoft:'#d8f1f1',soft:'#eaf4fc',line:'#cfe3f4',glow:'rgba(8,123,132,.16)',body:'#f2f8fc'},
  {id:'violet',name:'Royal violet',primary:'#6042a6',deep:'#422d79',deepest:'#2d2057',secondary:'#a24778',secondaryDark:'#713555',secondarySoft:'#f4dfe9',soft:'#f1edfa',line:'#ded4f2',glow:'rgba(162,71,120,.16)',body:'#f7f5fc'},
  {id:'sunset',name:'Sunset coral',primary:'#a8433f',deep:'#702d32',deepest:'#4f2027',secondary:'#87520f',secondaryDark:'#603907',secondarySoft:'#f5e7ce',soft:'#fff0ed',line:'#efd6d1',glow:'rgba(135,82,15,.16)',body:'#fff7f4'},
  {id:'teal',name:'Teal',primary:'#087f83',deep:'#07595c',deepest:'#063d41',secondary:'#326a9b',secondaryDark:'#244d71',secondarySoft:'#dceaf5',soft:'#e8f7f6',line:'#cde9e6',glow:'rgba(50,106,155,.16)',body:'#f2faf9'},
  {id:'sapphire',name:'Sapphire',primary:'#35529e',deep:'#263d79',deepest:'#1c2d59',secondary:'#874875',secondaryDark:'#603252',secondarySoft:'#f0deeb',soft:'#edf1fc',line:'#d7def3',glow:'rgba(135,72,117,.16)',body:'#f4f6fd'}
 ];
 var root=document.documentElement;
 var select=document.getElementById('wlAccentSelect');
 var choiceKey='wl-sme-accent-choice',lastKey='wl-sme-last-accent';
 function paletteById(id){return palettes.find(function(item){return item.id===id})||null}
 function randomPalette(except){
  var options=palettes.filter(function(item){return item.id!==except});
  if(!options.length)options=palettes;
  return options[Math.floor(Math.random()*options.length)];
 }
 function applyPalette(palette,choice){
  if(!palette)return;
  root.setAttribute('data-wl-accent',palette.id);
  var vars={
   '--wl-palette-primary':palette.primary,'--wl-palette-deep':palette.deep,
   '--wl-palette-deepest':palette.deepest,'--wl-palette-secondary':palette.secondary,
   '--wl-palette-secondary-dark':palette.secondaryDark,'--wl-palette-secondary-soft':palette.secondarySoft,
   '--wl-palette-soft':palette.soft,'--wl-palette-line':palette.line,
   '--wl-palette-glow':palette.glow,'--wl-palette-body':palette.body,
   '--navy':palette.primary,'--navy2':palette.deep,'--green':palette.primary,
   '--blue':palette.secondary,'--gold':palette.secondary,'--gold2':palette.secondarySoft,
   '--bg':palette.body
  };
  Object.keys(vars).forEach(function(key){root.style.setProperty(key,vars[key])});
  try{localStorage.setItem(lastKey,palette.id)}catch(e){}
  if(select&&select.value!==choice)select.value=choice;
  var name=document.getElementById('wlAccentName');
  if(name)name.textContent='Current palette: '+palette.name+(choice==='random'?' · Random on launch':'');
  var meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',root.getAttribute('data-theme')==='dark'?'#101722':palette.primary);
  window.wlCurrentAccent=palette.name;
  window.dispatchEvent(new CustomEvent('whiteLionAccentChanged',{detail:{id:palette.id,name:palette.name,choice:choice}}));
 }
 function applyChoice(choice,persist){
  var selected;
  if(choice==='random'){
   var last='';try{last=localStorage.getItem(lastKey)||''}catch(e){}
   selected=randomPalette(last);
  }else{
   selected=paletteById(choice);
   if(!selected)return;
  }
  if(persist){try{localStorage.setItem(choiceKey,choice)}catch(e){}}
  applyPalette(selected,choice);
 }
 function installSelector(){
  select=document.getElementById('wlAccentSelect');
  if(!select)return;
  var saved='random';
  try{
   var stored=localStorage.getItem(choiceKey);
   if(stored==='random'||paletteById(stored))saved=stored;
   else localStorage.setItem(choiceKey,'random');
  }catch(e){}
  select.value=saved;
  select.addEventListener('change',function(){applyChoice(select.value,true)});
 }
 var savedChoice='random';
 try{
  var storedChoice=localStorage.getItem(choiceKey);
  if(storedChoice==='random'||paletteById(storedChoice))savedChoice=storedChoice;
  else localStorage.setItem(choiceKey,'random');
 }catch(e){}
 applyChoice(savedChoice,false);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installSelector,{once:true});
 else installSelector();
 window.wlSetAccentTheme=function(choice){if(choice==='random'||paletteById(choice)){applyChoice(choice,true);if(select)select.value=choice}};
 window.wlGetAccentTheme=function(){try{return localStorage.getItem(choiceKey)||'random'}catch(e){return 'random'}};
 window.addEventListener('storage',function(event){
  if(event.key===choiceKey&&(event.newValue==='random'||paletteById(event.newValue)))applyChoice(event.newValue,false);
 });
})();
