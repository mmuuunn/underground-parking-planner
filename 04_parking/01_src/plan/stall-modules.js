/* Planning catalogue; dimensions are project settings, never a legal verdict.
 * Defaults are planning dimensions; quota applicability is project-specific.
 */
(function(root){
  'use strict';
  const CATALOGUE=Object.freeze({
    normal:Object.freeze({id:'normal',label:'일반',widthMm:2500,depthMm:5000}),
    expanded:Object.freeze({id:'expanded',label:'확장',widthMm:2600,depthMm:5200}),
    accessible:Object.freeze({id:'accessible',label:'장애인',widthMm:3300,depthMm:5000,sharedClearanceMm:null,preferNearCore:true}),
    compact:Object.freeze({id:'compact',label:'경형',widthMm:2000,depthMm:3600}),
  });
  function catalogue(cfg,overrides={}){
    const out={};for(const[id,spec]of Object.entries(CATALOGUE))out[id]={...spec,...(id==='normal'?{widthMm:cfg.stallW,depthMm:cfg.stallD}:{}),...overrides[id],id};
    return out;
  }
  function row(G,options,axis,coordinate,side){
    const id=axis+':'+Math.round(coordinate-(axis==='h'?G.b[1]:G.b[0]))+':'+(side>0?'+':'-');
    const kinds=catalogue(G.cfg,options.stallModules),type=options.stallRowTypes?.[id]||options.stallType||'normal',spec=kinds[type];
    if(!spec)throw new RangeError('알 수 없는 칸 종류: '+type);
    if(!(spec.widthMm>0&&spec.depthMm>0))throw new RangeError(spec.label+' 칸의 프로젝트 폭·깊이를 먼저 정하세요');
    if(type==='accessible'&&!(spec.sharedClearanceMm>0))throw new RangeError('장애인 칸의 공유 여유 폭을 먼저 정하세요');
    return {...spec,id,moduleId:type,axis,coordinateMm:Math.round(coordinate),side,stallType:type};
  }
  const api={CATALOGUE,catalogue,row};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else(root.UGP=root.UGP||{}).stallModules=api;
})(this);
