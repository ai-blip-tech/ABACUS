import React from 'react';
export default function Link({href,prefetch,...props}:any){return <a {...props} href={typeof href==='string'?href:'#'}/>;}
