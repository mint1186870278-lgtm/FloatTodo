const fs=require('node:fs/promises');const path=require('node:path');const {atomicWrite}=require('./store.cjs');
class CredentialStore {
  constructor(dir,safeStorage){this.file=path.join(dir,'todoist-credential.enc');this.safe=safeStorage;}
  async available(){if(!await this.safe.isAsyncEncryptionAvailable())throw new Error('系统安全加密不可用，无法保存 Todoist 授权');}
  async save(token){await this.available();const encrypted=await this.safe.encryptStringAsync(token);await atomicWrite(this.file,{version:1,data:encrypted.toString('base64')});}
  async load(){try{const value=JSON.parse(await fs.readFile(this.file,'utf8'));await this.available();const result=await this.safe.decryptStringAsync(Buffer.from(value.data,'base64'));const token=typeof result==='string'?result:result.result;if(typeof token!=='string'||!token)throw new Error();if(result.shouldReEncrypt)await this.save(token);return token;}catch(e){if(e.code==='ENOENT')return null;throw new Error('本机授权无法解密，请断开后重新连接');}}
  async clear(){await fs.unlink(this.file).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
module.exports={CredentialStore};
