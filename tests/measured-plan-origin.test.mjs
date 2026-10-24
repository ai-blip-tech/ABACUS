import test from 'node:test';
import assert from 'node:assert/strict';
import {isSameOrigin} from '../lib/measured-plan/request-origin.ts';
test('allows browser origin using Host even when Next internally normalizes URL to localhost',()=>{assert.equal(isSameOrigin(new Request('http://localhost:3134/api',{headers:{Host:'127.0.0.1:3134',Origin:'http://127.0.0.1:3134'}})),true);});
test('rejects another origin, port, malformed origin and null origin',()=>{for(const origin of ['https://attacker.example','http://127.0.0.1:4197','null','not-a-url'])assert.equal(isSameOrigin(new Request('http://localhost:3134/api',{headers:{Host:'127.0.0.1:3134',Origin:origin}})),false);});
