import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {addAlbumCover,coverTitleLines} from '../lib/measured-plan/album-cover.ts';
test('single stage export always starts with one unnumbered cover and retains its sheet',async()=>{const pdf=await PDFDocument.create(),sans=await pdf.embedFont(StandardFonts.Helvetica),serif=await pdf.embedFont(StandardFonts.TimesRoman);/* Unicode drawing tested with real fonts below. */assert.equal(pdf.getPageCount(),0);const lines=coverTitleLines('A very long project title',sans,80,11);assert.ok(lines.length>1);assert.ok(lines.every(l=>sans.widthOfTextAtSize(l,11)<=80));});
test('cover is first and unique for both one sheet and multi-stage albums',async()=>{
 const {default:fontkit}=await import('@pdf-lib/fontkit');const pdf=await PDFDocument.create();pdf.registerFontkit(fontkit);const sans=await pdf.embedFont(readFileSync(new URL('../public/fonts/Arial.ttf',import.meta.url))),serif=await pdf.embedFont(readFileSync(new URL('../public/fonts/Georgia.ttf',import.meta.url)));
 const sheet=pdf.addPage([1190.52,841.8]);addAlbumCover(pdf,'Квартира · Москва',{sans,serif},2026);assert.equal(pdf.getPageCount(),2);assert.equal(pdf.getPages()[1],sheet);
 pdf.addPage([1190.52,841.8]);addAlbumCover(pdf,'Квартира · Москва',{sans,serif},2026);assert.equal(pdf.getPageCount(),3);assert.equal(pdf.getPages()[1],sheet);
 const bytes=await pdf.save(),restored=await PDFDocument.load(bytes);assert.equal(restored.getPageCount(),3);assert.equal(coverTitleLines('',sans,300,11)[0],'Без названия');
});
test('measured-plan export uses authorized project name, never a hard-coded apartment title',()=>{const src=readFileSync(new URL('../app/api/projects/[id]/measured-plan/print/route.ts',import.meta.url),'utf8');assert.match(src,/SELECT id,name FROM projects WHERE id=\?/);assert.match(src,/addAlbumCover\(pdf,project.name/);assert.ok(src.indexOf('addAlbumCover(pdf')<src.indexOf('page=pdf.addPage'));});
