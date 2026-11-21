import {profileMeshPositions} from './decaro-geometry.mjs';
import {inheritedMouldingMesh} from './orac-moulding-math.mjs';
import {getDecaroContext} from './decaro-context.mjs';
import { FavoriteTabs, rememberFinish, useFinishFavorites } from './finish-favorites.tsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useScene, sceneRegistry } from '@pascal-app/core';
import { useViewer } from '@pascal-app/viewer';
import { useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { Group, Color, BufferGeometry, Float32BufferAttribute, Vector2, Vector3, Matrix4, Raycaster, Plane, DoubleSide } from 'three';
import { DECARO_VARIANTS, profileVariant, profileLength, placedProfileSegments, profileHit, validateProfile, profileReport, snapProfilePoint } from '../lib/decaro/profiles.mjs';
import { wallOpenings } from './orac-mouldings.tsx';
import { getWallWork, workBounds } from './wall-work-scope.mjs';
import './decaro-profiles.css';
const emit = (name: string, detail: any) => window.dispatchEvent(new CustomEvent('roomdesign:' + name, { detail }));
const command = (action: string, data: any = {}) => emit('wall-finish-command', { action, ...data });
const holesMm = (wall: any) => wallOpenings(wall, useScene.getState().nodes).map((r: number[]) => r.map(n => n * 1000));
const boundsMm = (wall: any, side: number) => (workBounds(wall, side) || [0, 0, 0, 0]).map((n: number) => n * 1000);
export const findDecaroProfile = (wall: any, side: number, x: number, y: number) => [...(wall.metadata?.roomDesignProfiles || [])].reverse().find((p: any) => p.side === side && profileHit(p, x * 1000, y * 1000, holesMm(wall)))?.id;
export function changeDecaroProfile(wall: any, s: any, action: string, data: any) {
    const all = wall.metadata?.roomDesignProfiles || [];
    if (action === 'profile-select')
        return { id: data.id };
    if (action === 'profile-settings') {
        const kerfMm = Number(data.kerfMm);
        if (!Number.isFinite(kerfMm) || kerfMm < 0 || kerfMm > 20)
            return { error: 'Припуск на рез: от 0 до 20 мм' };
        useScene.getState().updateNode(wall.id, { metadata: { ...wall.metadata, roomDesignProfileSettings: { kerfMm } } } as any);
        return { id: s.profileId };
    }
    if (action === 'profile-delete') {
        useScene.getState().updateNode(wall.id, { metadata: { ...wall.metadata, roomDesignProfiles: all.filter((p: any) => p.id !== s.profileId) } } as any);
        return { id: undefined };
    }
    const old = all.find((p: any) => p.id === s.profileId), record = action === 'profile-place' ? { ...data, ...getDecaroContext(), schemaVersion:1, units:'mm', id: crypto.randomUUID(), wallId: wall.id, side: s.side, roomId: getWallWork()?.surface.roomId || null } : old ? { ...old, ...data, id: old.id, side: old.side } : null;
    if (!record)
        return { error: 'Сначала выберите профиль' };
    if (action === 'profile-place' && ['D009.2A', 'D009.3A'].includes(record.variant?.model)) {
        const match = all.find((p: any) => p.variant.model === 'D009' && p.side === record.side && p.points.length === record.points.length && p.points.every((q: number[], i: number) => Math.hypot(q[0] - record.points[i][0], q[1] - record.points[i][1]) < 1));
        if (match)
            return { error: 'Здесь уже установлен D009. Выберите его и добавьте вставку в комплект — без двойного расчёта.' };
    }
    try {
        validateProfile(record, boundsMm(wall, s.side));
        if (!placedProfileSegments(record, holesMm(wall)).length)
            throw Error('Вся линия попала в проём');
        if (all.length >= 500 && action === 'profile-place')
            throw Error('На стене уже 500 профилей');
        useScene.getState().updateNode(wall.id, { metadata: { ...wall.metadata, roomDesignProfiles: action === 'profile-place' ? [...all, record] : all.map((p: any) => p.id === record.id ? record : p) } } as any);
        return { id: record.id };
    }
    catch (e) {
        return { error: (e as Error).message };
    }
}
function localPoint(e: any, wall: any, side: number, camera: any, gl: any) { const root = sceneRegistry.nodes.get(wall.id); if (!root)
    return null; root.updateWorldMatrix(true, false); const rect = gl.domElement.getBoundingClientRect(), ray = new Raycaster(); ray.setFromCamera(new Vector2((e.x - rect.left) / rect.width * 2 - 1, -(e.y - rect.top) / rect.height * 2 + 1), camera); ray.ray.applyMatrix4(new Matrix4().copy(root.matrixWorld).invert()); const p = ray.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -side * wall.thickness / 2), new Vector3()); return p ? [p.x * 1000, p.y * 1000] : null; }
function finishLevel(wall: any, record: any) { let level = .0015; for (const t of wall.metadata?.roomDesignTiles || [])
    if (t.side === record.side)
        level = Math.max(level, .0075); for (const f of wall.metadata?.roomDesignFinishes || [])
    if (f.side === record.side && f.surface)
        level = Math.max(level, f.surface.mode==='slats'?(f.surface.depth||.02)+.0015:.0015); return level; }
function sectionGeometry(record:any,segments:any[],wall:any){const positions=profileMeshPositions(record,segments,wall.thickness,finishLevel(wall,record)),inherited=record.sitePaint?.mode==='wall'?inheritedMouldingMesh(positions,wall.metadata?.roomDesignFinishes||[],record.side):null,geometry=new BufferGeometry();geometry.setAttribute('position',new Float32BufferAttribute(inherited?.positions||positions,3));if(inherited)geometry.setAttribute('color',new Float32BufferAttribute(inherited.hexes.flatMap((hex:string)=>new Color(hex).toArray()),3));geometry.computeVertexNormals();return geometry;}
function ProfileMesh({ wall, record, selected, active }: {
    wall: any;
    record: any;
    selected: boolean;
    active: boolean;
}) {
    const group = useRef<Group>(null), { camera, gl, invalidate } = useThree(), [draft, setDraft] = useState<any>(null), drag = useRef<any>(null), p = draft || record;
    const sceneNodes = useScene(s => s.nodes), openingKey=JSON.stringify(wallOpenings(wall,sceneNodes)),segments = useMemo(() => placedProfileSegments(p, holesMm(wall)), [p, openingKey]), geometry = useMemo(() => sectionGeometry(p, segments, wall), [p, segments, wall.thickness, wall.metadata?.roomDesignTiles, wall.metadata?.roomDesignFinishes]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    useEffect(() => { const root = group.current; return () => root?.removeFromParent(); }, []);
    useFrame(() => { const root = sceneRegistry.nodes.get(wall.id); if (group.current && root) {
        root.updateWorldMatrix(true, false);
        group.current.matrix.copy(root.matrixWorld);
        group.current.matrixWorldNeedsUpdate = true;
        group.current.visible = !root.userData.wallHidden;
    } });
    useEffect(() => { const move = (e: PointerEvent) => { const d = drag.current; if (!d)
        return; e.preventDefault(); e.stopImmediatePropagation(); const hit = localPoint({ x: e.clientX, y: e.clientY }, wall, record.side, camera, gl); if (!hit)
        return; const snap = snapProfilePoint(hit, wall, record.side, boundsMm(wall, record.side), holesMm(wall)), points = d.index === -1 ? d.points.map((p: number[]) => p.map((v, i) => v + snap.point[i] - d.anchor[i])) : d.points.map((p: number[], i: number) => i === d.index ? snap.point : p); const next = { ...record, points }; try {
        validateProfile(next, boundsMm(wall, record.side));
        d.next = next;
        setDraft({ ...next, _snapGuides: snap.guides, _dragIndex: d.index });
        invalidate();
    }
    catch { } }; const up = () => { const d = drag.current; if (!d)
        return; drag.current = null; setDraft(null); useViewer.setState({ inputDragging: false }); if (d.next)
        command('profile-update', d.next); }; const cancel = () => { drag.current = null; setDraft(null); useViewer.setState({ inputDragging: false }); }; window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', cancel, true); window.addEventListener('roomdesign:cancel-item-gesture', cancel); return () => { cancel(); window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', cancel, true); window.removeEventListener('roomdesign:cancel-item-gesture', cancel); }; }, [wall, record, camera, gl, invalidate]);
    const center = p.points.reduce((s: number[], v: number[]) => s.map((n, i) => n + v[i] / p.points.length), [0, 0]), metal = p.sitePaint?.mode === 'custom' ? p.sitePaint.hex : p.sitePaint?.mode === 'wall' ? '#ffffff' : p.variant.hex, level = finishLevel(wall, p), width = p.variant.visibleMm[p.face] / 1000;
    return <group ref={group} matrixAutoUpdate={false} userData={{ roomDesignFinishWallId: wall.id }}>{segments.map((s: any) => { const x = (s.start[0] + s.end[0]) / 2000, y = (s.start[1] + s.end[1]) / 2000, angle = Math.atan2(s.end[1] - s.start[1], s.end[0] - s.start[0]); return <group key={s.id} position={[x, y, p.side * (wall.thickness / 2 + level + .0004)]} rotation={[0, 0, angle]}><mesh raycast={() => null}><planeGeometry args={[s.lengthMm / 1000, width]}/><meshBasicMaterial color="#131416" side={DoubleSide}/></mesh>{p.led?.enabled && <mesh position={[0, 0, p.side * .0005]} raycast={() => null}><planeGeometry args={[s.lengthMm / 1000, width * .65]}/><meshStandardMaterial color={p.led.diffuser === 'black' ? '#333333' : '#eeeeee'} emissive={p.led.hex || '#fff0d0'} emissiveIntensity={(p.led.brightness ?? 70) / 100 * 2} side={DoubleSide}/></mesh>}</group>; })}<mesh geometry={geometry} raycast={() => null} receiveShadow><meshStandardMaterial color={metal} vertexColors={p.sitePaint?.mode==='wall'} metalness={p.sitePaint?.mode && p.sitePaint.mode !== 'factory' ? .08 : .8} roughness={p.sitePaint?.mode && p.sitePaint.mode !== 'factory' ? .65 : .32} side={DoubleSide}/></mesh>{selected && active && [...p.points, center].map((v: number[], i: number) => <Html key={i} position={[v[0] / 1000, v[1] / 1000, p.side * (wall.thickness / 2 + level + .025)]} center zIndexRange={[90, 80]}><button className={'rd-decaro-handle ' + (i === p.points.length ? 'is-move' : '')} style={p._snapGuides?.[0] && p._snapGuides?.[1] && (i === p._dragIndex || p._dragIndex === -1) ? { borderColor: '#26985e', color: '#26985e' } : undefined} aria-label={i === p.points.length ? 'Переместить профиль' : 'Конец профиля ' + (i + 1)} onPointerDown={e => { e.preventDefault(); e.stopPropagation(); const hit = localPoint({ x: e.clientX, y: e.clientY }, wall, p.side, camera, gl); if (!hit)
        return; drag.current = { index: i === p.points.length ? -1 : i, anchor: hit, points: p.points.map((x: number[]) => [...x]) }; useViewer.setState({ inputDragging: true }); }}>{i === p.points.length ? '✥' : ''}</button></Html>)}</group>;
}
export function DecaroScene({ selection, active }: {
    selection: any;
    active: boolean;
}) {
    const nodes = useScene(s => s.nodes), { camera, gl, invalidate } = useThree(), [tool, setTool] = useState<any>(null), [hover, setHover] = useState<any>(null), ref = useRef<any>(null), group = useRef<Group>(null);
    const selectedRef = useRef(selection);
    selectedRef.current = selection;
    useFrame(() => { const root = ref.current && sceneRegistry.nodes.get(ref.current.wallId); if (group.current && root) {
        root.updateWorldMatrix(true, false);
        group.current.matrix.copy(root.matrixWorld);
        group.current.matrixWorldNeedsUpdate = true;
    } });
    useEffect(() => {
        const publish = (t: any) => { ref.current = t; setTool(t); gl.domElement.dataset.profileDrawing = t ? 'true' : ''; gl.domElement.style.cursor = t ? 'crosshair' : 'default'; emit('profile-draw-status', t); invalidate(); }, stop = () => { publish(null); setHover(null); }, start = (e: any) => { emit('tile-stop-place', null); emit('tile-region-draw-stop', null); emit('moulding-stop-draw', null); publish({ ...e.detail, points: [] }); setHover(null); };
        const point = (e: any) => { const t = ref.current, wall = t && useScene.getState().nodes[t.wallId as any] as any; if (!t || !wall)
            return null; const hit = localPoint(e.detail, wall, t.side, camera, gl); return hit ? { wall, ...snapProfilePoint(hit, wall, t.side, boundsMm(wall, t.side), holesMm(wall), t.points.at(-1)) } : null; };
        const click = (e: any) => { const t = ref.current, hit = point(e); if (!t || !hit)
            return; if (!t.points.length) {
            publish({ ...t, points: [hit.point] });
            return;
        } const last = t.points.at(-1); if (Math.hypot(last[0] - hit.point[0], last[1] - hit.point[1]) < 1)
            return; const points = [...t.points, hit.point], record = { ...t, points }; try {
            validateProfile(record, boundsMm(hit.wall, t.side));
            const result = changeDecaroProfile(hit.wall, { side: t.side, profileId: t.recordId }, t.recordId ? 'profile-update' : 'profile-place', record);
            if (result.error)
                throw Error(result.error);
            command('profile-select', { id: result.id });
            publish({ ...t, points, recordId: result.id });
            setHover(null);
        }
        catch (err) {
            emit('profile-error', (err as Error).message);
        } };
        const move = (e: any) => { const hit = point(e); if (hit) {
            setHover(hit);
            invalidate();
        } };
        const numeric = (e: any) => { const t = ref.current; if (!t?.points.length)
            return; const wall = useScene.getState().nodes[t.wallId as any] as any, from = t.points.at(-1), angle = e.detail.angle * Math.PI / 180, end = from.map((v: number, i: number) => v + e.detail.length * (i ? Math.sin(angle) : Math.cos(angle))); try {
            const record = { ...t, points: [...t.points, end] };
            validateProfile(record, boundsMm(wall, t.side));
            const result = changeDecaroProfile(wall, { side: t.side, profileId: t.recordId }, t.recordId ? 'profile-update' : 'profile-place', record);
            if (result.error)
                throw Error(result.error);
            command('profile-select', { id: result.id });
            publish({ ...t, points: record.points, recordId: result.id });
            setHover(null);
        }
        catch (err) {
            emit('profile-error', (err as Error).message);
        } };
        const listeners: any = { 'profile-start-draw': start, 'profile-stop-draw': stop, 'profile-tool-click': click, 'profile-tool-move': move, 'profile-numeric-end': numeric, 'cancel-item-gesture': stop, 'wall-work-open': stop };
        for (const [name, fn] of Object.entries(listeners))
            window.addEventListener('roomdesign:' + name, fn as any);
        // Orbit-view drawing. Wall-work and eye-view own their canvas pointer routing.
        const down = (e: PointerEvent) => { if (!ref.current || getWallWork() || e.target !== gl.domElement || e.button !== 0)
            return; e.preventDefault(); e.stopImmediatePropagation(); click({ detail: { x: e.clientX, y: e.clientY } }); };
        const orbitMove = (e: PointerEvent) => { if (!ref.current || getWallWork() || e.target !== gl.domElement)
            return; move({ detail: { x: e.clientX, y: e.clientY } }); };
        window.addEventListener('pointerdown', down, true);
        window.addEventListener('pointermove', orbitMove, true);
        return () => { stop(); for (const [name, fn] of Object.entries(listeners))
            window.removeEventListener('roomdesign:' + name, fn as any); window.removeEventListener('pointerdown', down, true); window.removeEventListener('pointermove', orbitMove, true); };
    }, [camera, gl, invalidate]);
    useEffect(() => { if (!active)
        emit('profile-stop-draw', null); }, [active]);
    useEffect(() => { const root = group.current; return () => root?.removeFromParent(); }, [tool?.wallId, !!hover]);
    const segment = tool?.points.length && hover ? { start: tool.points.at(-1), end: hover.point } : null, wall: any = tool && nodes[tool.wallId], length = segment ? Math.hypot(segment.end[0] - segment.start[0], segment.end[1] - segment.start[1]) : 0;
    return <>{Object.values(nodes).filter((w: any) => w.type === 'wall' && w.visible !== false).flatMap((wall: any) => (wall.metadata?.roomDesignProfiles || []).map((p: any) => <ProfileMesh key={p.id} wall={wall} record={p} active={active && !tool} selected={selection?.wallId === wall.id && selection?.profileId === p.id}/>))}{tool && wall && hover && <group ref={group} userData={{ roomDesignFinishWallId: wall.id }} matrixAutoUpdate={false}>{hover.guides.map((snapped: boolean, axis: number) => snapped ? <mesh key={axis} position={[axis ? (boundsMm(wall, tool.side)[0] + boundsMm(wall, tool.side)[2]) / 2000 : hover.point[0] / 1000, axis ? hover.point[1] / 1000 : wall.height / 2, tool.side * (wall.thickness / 2 + .03)]} raycast={() => null}><planeGeometry args={axis ? [(boundsMm(wall, tool.side)[2] - boundsMm(wall, tool.side)[0]) / 1000, .002] : [.002, wall.height]}/><meshBasicMaterial color="#26985e" transparent opacity={.5} side={DoubleSide}/></mesh> : null)}{segment ? <mesh position={[(segment.start[0] + segment.end[0]) / 2000, (segment.start[1] + segment.end[1]) / 2000, tool.side * (wall.thickness / 2 + .03)]} rotation={[0, 0, Math.atan2(segment.end[1] - segment.start[1], segment.end[0] - segment.start[0])]} raycast={() => null}><planeGeometry args={[length / 1000, .007]}/><meshBasicMaterial color={hover.guides.some(Boolean) ? '#26985e' : '#9c1730'} side={DoubleSide}/></mesh> : null}<Html center position={[hover.point[0] / 1000, hover.point[1] / 1000, tool.side * (wall.thickness / 2 + .035)]}><span className="rd-decaro-length">{segment ? Math.round(length) + ' мм' : 'Начало профиля'}</span></Html></group>}</>;
}
export function DecaroPanel({ selection }: {
    selection: any;
}) {
    const [onlyFavorites, setOnlyFavorites] = useState(false), { items: favorites } = useFinishFavorites('profile');
    const [model, setModel] = useState('D008'), [color, setColor] = useState('black'), [query, setQuery] = useState(''), [face, setFace] = useState(0), [sitePaint, setPaint] = useState<any>({ mode: 'factory', hex: '#ffffff' }), [led, setLed] = useState<any>({ enabled: false, diffuser: 'white', hex: '#fff0d0', brightness: 70 }), [joints, setJoints] = useState(false), [drawing, setDrawing] = useState<any>(null), [error, setError] = useState(''), [numeric, setNumeric] = useState({ length: 1000, angle: 0 }), [kerf, setKerf] = useState(0);
    const records = (selection.profiles || []).filter((p: any) => p.side === selection.side), record = records.find((p: any) => p.id === selection.profileId), catalogVariant = DECARO_VARIANTS.find((v: any) => v.model === model && v.color === color) || DECARO_VARIANTS.find((v: any) => v.model === model), variant = record?.variant?.id === catalogVariant.id ? record.variant : catalogVariant, models = [...new Set(DECARO_VARIANTS.map((v: any) => v.model))];
    useEffect(() => setKerf(selection.profileSettings?.kerfMm || 0), [selection.wallId, selection.profileSettings?.kerfMm]);
    useEffect(() => { if (!record)
        return; setModel(record.variant.model); setColor(record.variant.color); setFace(record.face); setPaint(record.sitePaint || { mode: 'factory', hex: '#ffffff' }); setLed(record.led || { enabled: false, diffuser: 'white', hex: '#fff0d0', brightness: 70 }); setJoints(!!record.allowJoints); }, [record?.id]);
    useEffect(() => { const status = (e: any) => setDrawing(e.detail), fail = (e: any) => setError(e.detail || ''); window.addEventListener('roomdesign:profile-draw-status', status); window.addEventListener('roomdesign:profile-error', fail); return () => { window.removeEventListener('roomdesign:profile-draw-status', status); window.removeEventListener('roomdesign:profile-error', fail); }; }, []);
    const update = (data: any) => { setError(''); if (drawing)
        emit('profile-stop-draw', null); if (record)
        command('profile-update', data); }, pick = (v: any) => { rememberFinish({ kind: 'profile', id: v.id }); setModel(v.model); setColor(v.color); setFace(0); setLed({ ...led, enabled: false }); update({ variant: v, face: 0, led: { ...led, enabled: false } }); }, start = () => { setError(''); command('profile-draw', { variant: structuredClone(variant), face, sitePaint, led: variant.model === 'D007' && face === 1 ? led : { ...led, enabled: false }, allowJoints: joints }); };
    const report = profileReport(records.map((p: any) => ({ record: p, wallId: selection.wallId, holes: selection.openingsMm, title: selection.name })), kerf), sum = report.reduce((s: any, r: any) => s + r.cost, 0);
    return <section className="rd-decaro-panel"><div className="rd-decaro-heading"><b>Decaro Engineering</b><small>Разделительные профили · алюминий</small></div><FavoriteTabs value={onlyFavorites} onChange={setOnlyFavorites}/><input aria-label="Поиск профиля" value={query} onChange={e => setQuery(e.target.value)} placeholder="Decaro, модель профиля"/><div className="rd-decaro-catalog">{models.filter((m: any) => !onlyFavorites || favorites.some((f: any) => profileVariant(f.id)?.model === m)).filter((m: any) => ('Decaro ' + m).toLowerCase().includes(query.toLowerCase())).map((m: any) => { const v = DECARO_VARIANTS.find((v: any) => v.model === m); return <button key={m} className={model === m ? 'active' : ''} aria-label={'Профиль ' + m} onClick={() => pick(v)}><img src={v.image} alt={'Сечение ' + m}/><span><b>{m}</b><small>{v.sectionLabel} мм</small><small>Видимый: {v.visibleMm.join(' / ')} мм</small><strong>от {v.price} ₽/м</strong></span></button>; })}</div><div className="rd-decaro-colors" aria-label="Заводская отделка">{DECARO_VARIANTS.filter((v: any) => v.model === model).map((v: any) => <button key={v.id} title={v.factoryColor} aria-label={v.factoryColor} className={variant.id === v.id ? 'active' : ''} style={{ background: v.hex }} onClick={() => { rememberFinish({ kind: 'profile', id: v.id }); setColor(v.color); update({ variant: structuredClone(v) }); }}/>)}</div><small>{variant.factoryColor}</small><p className="rd-decaro-price"><b>{variant.price} ₽/пог. м</b><span>{variant.barPrice} ₽ / {variant.components.length ? 'комплект' : 'планка'} 3 м</span></p>{record && record.variant.price !== catalogVariant.price && <button onClick={() => update({ variant: structuredClone(catalogVariant) })}>Обновить цену: {catalogVariant.barPrice - record.variant.barPrice > 0 ? '+' : ''}{catalogVariant.barPrice - record.variant.barPrice} ₽ / 3 м</button>}<a href={variant.manual} target="_blank" rel="noreferrer">Схема и инструкция по монтажу ↗</a><details><summary>Характеристики</summary><small>{variant.material} · длина {variant.stockMm} мм · сечение {variant.sectionLabel} мм</small>{variant.parameters?.stemMm && <small>Ножка вставки: {variant.parameters.stemMm} мм · видимая часть: {variant.parameters.headMm} мм</small>}{variant.parameters?.internalGrooveNote && <small>{variant.parameters.internalGrooveNote}</small>}{variant.compatibleReference?.length > 0 && <small>Сопряжение с {variant.compatibleReference.join(', ')}. Справочно, в закупку не добавляется.</small>}{variant.components.length > 0 && <small>Комплект {variant.components.join(' + ')} — одна позиция закупки.</small>}</details><label>Рабочая сторона<select aria-label="Рабочая сторона" value={face} onChange={e => { const value = +e.target.value; setFace(value); const nextLed = { ...led, enabled: value === 1 && model === 'D007' ? led.enabled : false }; setLed(nextLed); update({ face: value, led: nextLed }); }}>{variant.sides.map((v: string, i: number) => <option key={i} value={i}>{v} · {variant.visibleMm[i]} мм</option>)}</select></label><label className="rd-decaro-check"><input type="checkbox" checked={joints} onChange={e => { setJoints(e.target.checked); update({ allowJoints: e.target.checked }); }}/>Разрешить стыки при длине более 3 м</label>
 <button className="rd-decaro-primary" onClick={drawing ? () => emit('profile-stop-draw', null) : start}>{drawing ? 'Завершить линию' : 'Нарисовать профиль'}</button>{drawing && <div className="rd-decaro-drawing"><span>{drawing.points?.length ? 'Укажите следующую точку. Esc — завершить.' : 'Кликните на стене: начало профиля'}</span>{drawing.points?.length > 0 && <><div className="rd-decaro-fields"><label>Длина, мм<input aria-label="Длина профиля, мм" type="number" min="1" value={numeric.length} onChange={e => setNumeric({ ...numeric, length: +e.target.value })}/></label><label>Угол, °<input aria-label="Угол профиля" type="number" value={numeric.angle} onChange={e => setNumeric({ ...numeric, angle: +e.target.value })}/></label></div><button onClick={() => emit('profile-numeric-end', numeric)}>Добавить по размеру</button>{drawing.points.length > 2 && <button onClick={() => { command('profile-select', { id: drawing.recordId }); command('profile-update', { points: [...drawing.points, drawing.points[0]] }); emit('profile-stop-draw', null); }}>Замкнуть контур</button>}</>}</div>}
 {record && <div className="rd-decaro-edit"><b>{record.variant.model} · {Math.round(profileLength(record.points))} мм</b><div className="rd-decaro-fields">{['От левого края, мм', 'От пола, мм'].map((label, i) => <label key={i}>{label}<input key={record.id + record.points[0][i]} type="number" aria-label={label} defaultValue={Math.round(Math.min(...record.points.map((p: number[]) => p[i])))} onKeyDown={e => { if (e.key === 'Enter')
        e.currentTarget.blur(); }} onBlur={e => { const delta = +e.target.value - Math.min(...record.points.map((p: number[]) => p[i])); update({ points: record.points.map((p: number[]) => p.map((v, j) => v + (i === j ? delta : 0))) }); }}/></label>)}</div><details><summary>Точки и размеры, мм</summary>{record.points.map((point: number[], index: number) => <div className="rd-decaro-fields" key={index}>{point.map((value: number, axis: number) => <label key={axis}>Точка {index + 1} · {axis ? 'от пола' : 'слева'}<input aria-label={'Точка ' + (index + 1) + ' ' + (axis ? 'Y' : 'X')} type="number" key={record.id + ':' + value} defaultValue={Math.round(value)} onKeyDown={e => { if (e.key === 'Enter')
        e.currentTarget.blur(); }} onBlur={e => update({ points: record.points.map((p: number[], i: number) => i === index ? p.map((v, j) => j === axis ? +e.target.value : v) : p) })}/></label>)}</div>)}</details>{record.variant.model === 'D009' && <div className="rd-decaro-fields">{[['Rizz', 'Капля'], ['RizzT', 'Т-полка']].map(([model, label]) => <button key={model} onClick={() => pick(DECARO_VARIANTS.find((v: any) => v.model === model && v.color === record.variant.color))}>Вставка: {label}</button>)}</div>}<button onClick={() => { emit('profile-stop-draw', null); command('profile-place', { ...record, points: record.points.map((p: number[]) => [p[0] + 50, p[1] + 50]) }); }}>Копировать профиль</button><button onClick={() => command('profile-delete')}>Удалить профиль</button></div>}
 <details><summary>Окрасить на объекте</summary><label>Окраска<select value={sitePaint.mode} onChange={e => { const next = { ...sitePaint, mode: e.target.value }; setPaint(next); update({ sitePaint: next }); }}><option value="factory">Заводское анодирование</option><option value="wall">В цвет стены</option><option value="custom">Другой цвет</option></select></label>{sitePaint.mode === 'custom' && <input aria-label="Цвет профиля на объекте" type="color" value={sitePaint.hex} onChange={e => { const next = { ...sitePaint, hex: e.target.value }; setPaint(next); update({ sitePaint: next }); }}/>}<small>Заводская отделка и цена сохраняются. Подготовка и грунт — по листу 2 инструкции. Окраска и работа в цену не включены.</small></details>
 {model === 'D007' && face === 1 && <details><summary>Подсветка D007</summary><label className="rd-decaro-check"><input type="checkbox" checked={led.enabled} onChange={e => { const next = { ...led, enabled: e.target.checked }; setLed(next); update({ led: next }); }}/>LED в канале</label><label>Рассеиватель<select value={led.diffuser} onChange={e => { const next = { ...led, diffuser: e.target.value }; setLed(next); update({ led: next }); }}><option value="white">Белый</option><option value="black">Чёрный</option></select></label><label>Цвет света<input type="color" value={led.hex} onChange={e => { const next = { ...led, hex: e.target.value }; setLed(next); update({ led: next }); }}/></label><label>Яркость<input type="range" min="0" max="100" value={led.brightness} onChange={e => { const next = { ...led, brightness: +e.target.value }; setLed(next); update({ led: next }); }}/></label><small>Лента и рассеиватель — отдельные позиции, требуют цены.</small></details>}
 {error && <p role="alert">{error}</p>}{records.length > 0 && <details><summary>На стене · {records.length} · {sum.toLocaleString('ru-RU')} ₽</summary>{records.map((p: any) => <button key={p.id} className={record?.id === p.id ? 'active' : ''} onClick={() => command('profile-select', { id: p.id })}>{p.variant.model} · {Math.round(profileLength(p.points))} мм · {p.variant.factoryColor.replace('анодированный ', '')}</button>)}<label>Припуск на рез, мм<input type="number" min="0" max="20" value={kerf} onChange={e => { const value = Math.max(0, Math.min(20, +e.target.value)); setKerf(value); command('profile-settings', { kerfMm: value }); }}/></label><button onClick={() => { const blob = new Blob([JSON.stringify({ kerfMm: kerf, note: kerf ? 'С припуском на рез' : 'Без припуска на рез', groups: report }, null, 2)], { type: 'application/json' }), url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'Decaro-cut-plan.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }}>Скачать раскрой стены</button></details>}
 </section>;
}
