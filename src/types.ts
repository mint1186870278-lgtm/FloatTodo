export type Status = 'todo' | 'pending' | 'completed' | 'cancelled';
export interface Task { id:string; title:string; notes:string; dueDate:string; groupId:string; status:Status; order:number; createdAt:string; updatedAt:string }
export interface Group { id:string; name:string; collapsed:boolean }
export interface State { schemaVersion:number; revision:number; groups:Group[]; tasks:Task[]; settings:{ pinned:boolean; alwaysOnTop:boolean; autoOpacity:boolean; opacity:number; launchAtLogin:boolean; bounds:{x:number;y:number;width:number;height:number}|null;ballPosition:{x:number;y:number}|null;selectedGroupId:string;layoutVersion:number } }
export interface Receipt { id?:string; deleted?:Task; status?:string; path?:string; cancelled?:boolean; imported?:number }
export interface OpacityContext {phase:'manual'|'active'|'passive';alpha:number;focused:boolean;interactive:boolean;activeOpacity:number}
export interface Initial {state:State;mode:string;interaction:OpacityContext;warnings:string[];dataDir:string;version:string;hotkey:boolean}
export interface Result<T> {ok:boolean;data:T;error?:string}
export interface SyncPreview {id:string;switching:boolean;project:{id:string;name:string}|null;remote:{id:string;title:string;kind:string;sameName:boolean}[];local:{id:string;title:string}[];missingSections:string[];matches:number;conflicts:number}
export interface SyncStatus {connected:boolean;enabled:boolean;setupPending:boolean;account:string;projectId:string|null;projectName:string;projects:{id:string;name:string}[];lastSync:string|null;busy:boolean;queued:number;retryAt:number;error:string;preview:SyncPreview|null;conflicts:{id:string;kind:string;message:string;fields?:string[];local?:Record<string,string>;remote?:Record<string,string>}[];sections:Record<string,{id:string;name:string}>}
declare global { interface Window { floatTodo:{
  get():Promise<Result<Initial>>;
  command(command:Record<string,unknown>):Promise<Result<Receipt>>;
  window(action:string):Promise<Result<boolean>>;
  ballDrag(action:'start'|'end'):Promise<Result<boolean>>;
  pointer(action:'enter'|'leave'|'keyboard-enter'|'keyboard-leave'):Promise<Result<boolean>>;
  activeOpacity(value:number):Promise<Result<OpacityContext>>;
  panelDrag(action:'start'|'move'|'end'):Promise<Result<boolean>>;
  importData():Promise<Result<Receipt>>;
  exportData():Promise<Result<Receipt>>;
  sync(action:string,payload?:Record<string,unknown>):Promise<Result<SyncStatus>>;
  onSync(fn:(status:SyncStatus)=>void):()=>void;
  onState(fn:(state:State)=>void):()=>void;
  onMode(fn:(mode:string)=>void):()=>void;
  onNotice(fn:(message:string)=>void):()=>void;
  onSettings(fn:()=>void):()=>void;
  onInteraction(fn:(context:OpacityContext)=>void):()=>void;
} } }
