export function isSameOrigin(request:Request){
 const origin=request.headers.get('origin');if(!origin)return true;
 try{const url=new URL(origin);return ['http:','https:'].includes(url.protocol)&&url.host===(request.headers.get('host')||new URL(request.url).host);}catch{return false;}
}
