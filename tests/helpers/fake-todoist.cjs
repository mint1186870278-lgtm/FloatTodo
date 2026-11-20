const {ApiError}=require('../../electron/todoist-client.cjs');
class FakeTodoist {
  constructor(){this.user={id:'account1234'};this.projects=[{id:'p1',name:'FloatTodo'}];this.labels=[{id:'l1',name:'floattodo-pending'},{id:'l2',name:'floattodo-cancelled'}];this.sectionRows=['work','life','content','study'].map((name,i)=>({id:`s${i}`,project_id:'p1',name}));this.rows=[];this.seen=new Map();this.mapping={};this.calls=[];this.serial=100;this.fail=null;this.loseResponse=false;}
  stop(){}
  async metadata(){this.maybeFail();return structuredClone({user:this.user,projects:this.projects,labels:this.labels,sync_token:'cursor1'});}
  async sections(id){return structuredClone(this.sectionRows.filter(t=>t.project_id===id));}
  async tasks(id){this.maybeFail();return structuredClone(this.rows.filter(t=>t.project_id===id&&!t.checked&&!t.is_deleted));}
  async completed(id){this.maybeFail();return structuredClone(this.rows.filter(t=>t.project_id===id&&t.checked&&!t.is_deleted));}
  maybeFail(){if(this.fail)throw this.fail;}
  add(title='remote',extra={}){const t={id:`r${++this.serial}`,project_id:'p1',section_id:'s0',content:title,description:'',labels:[],due:null,checked:false,updated_at:new Date().toISOString(),...extra};this.rows.push(t);return t;}
  async sync(token,commands=[]){
    this.calls.push(structuredClone(commands));this.maybeFail();const status={};const resolve=v=>this.mapping[v]||v;
    for(const c of commands){if(this.seen.has(c.uuid)){status[c.uuid]=this.seen.get(c.uuid);continue;}
      const a=structuredClone(c.args);for(const k of ['id','project_id','section_id'])if(a[k])a[k]=resolve(a[k]);
      let row;if(c.type==='project_add'){row={id:`p${++this.serial}`,name:a.name};this.projects.push(row);}
      else if(c.type==='section_add'){row={id:`s${++this.serial}`,...a};this.sectionRows.push(row);}
      else if(c.type==='label_add'){row={id:`l${++this.serial}`,...a};this.labels.push(row);}
      else if(c.type==='item_add'){row=this.add(a.content,a);}
      else {row=this.rows.find(t=>t.id===a.id);if(!row){status[c.uuid]={error_code:404};continue;}if(c.type==='item_update')Object.assign(row,a);if(c.type==='item_move')row.section_id=a.section_id;if(c.type==='item_complete')row.checked=true;if(c.type==='item_uncomplete')row.checked=false;}
      if(c.temp_id)this.mapping[c.temp_id]=row.id;status[c.uuid]='ok';this.seen.set(c.uuid,'ok');
    }
    if(commands.length&&this.loseResponse){this.loseResponse=false;throw new ApiError('NETWORK');}
    return structuredClone({sync_token:'cursor2',full_sync:token==='*',sync_status:status,temp_id_mapping:this.mapping,items:this.rows,sections:this.sectionRows,projects:this.projects,labels:this.labels});
  }
}
module.exports={FakeTodoist};
