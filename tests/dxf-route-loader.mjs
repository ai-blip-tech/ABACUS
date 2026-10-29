import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export async function resolve(specifier,context,nextResolve){
 if(specifier==='@/lib/auth')return{url:'data:text/javascript,export async function requireTenantUser(request){return request.headers.get("x-dxf-test-auth")==="yes"?{id:"dxf-user",tenantId:"dxf-tenant"}:null}',shortCircuit:true};
 if(specifier.startsWith('@/')){for(const ext of ['.ts','.tsx']){const url=new URL('../'+specifier.slice(2)+ext,import.meta.url);if(existsSync(fileURLToPath(url)))return{url:url.href,shortCircuit:true};}}
 if(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)&&context.parentURL?.startsWith('file:')){for(const ext of ['.ts','.tsx']){const url=new URL(specifier+ext,context.parentURL);if(existsSync(fileURLToPath(url)))return{url:url.href,shortCircuit:true};}}
 return nextResolve(specifier,context);
}
