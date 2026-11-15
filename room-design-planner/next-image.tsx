import React from 'react';
export default function Image({src,fill,priority,unoptimized,loader,quality,placeholder,blurDataURL,...props}:any){const url=typeof src==='string'?src:src?.src;return <img {...props} src={url?.startsWith('/icons/')?'https://editor.pascal.app'+url:url} style={{...(fill?{position:'absolute',inset:0,width:'100%',height:'100%'}:{}),...props.style}}/>;}
