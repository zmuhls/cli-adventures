import { cp, mkdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
await rm('public', {recursive:true, force:true});
await mkdir('public', {recursive:true});
await cp('index.html', 'public/index.html');
await cp('static', 'public/static', {recursive:true, filter:source => basename(source) !== '.DS_Store'});
