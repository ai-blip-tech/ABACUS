import {useEffect, type RefObject} from 'react';
import {useThree} from '@react-three/fiber';
import {OrthographicCamera} from 'three';
import type {CabinetSpecification} from './cabinet-specification';

type CaptureCabinet = (dimensions: [number, number, number]) => Promise<CabinetSpecification['photos']>;

function snapshot(source: HTMLCanvasElement): Promise<Blob> {
  const frame = document.createElement('canvas');
  const scale = Math.min(1, 1400 / Math.max(source.width, source.height));
  frame.width = Math.max(1, Math.round(source.width * scale));
  frame.height = Math.max(1, Math.round(source.height * scale));
  const pixels = frame.getContext('2d', {willReadFrequently: true});
  if (!pixels) throw Error('Не удалось снять 3D-изображение комода.');
  pixels.drawImage(source, 0, 0, frame.width, frame.height);
  const alpha = pixels.getImageData(0, 0, frame.width, frame.height).data;
  let left = frame.width, top = frame.height, right = -1, bottom = -1;
  for (let y = 0; y < frame.height; y++) {
    for (let x = 0; x < frame.width; x++) {
      if (alpha[(y * frame.width + x) * 4 + 3] < 32) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) throw Error('В 3D-кадре не видно комода. Верните его в кадр.');
  const width = right - left + 1, height = bottom - top + 1;
  const margin = Math.round(Math.max(width, height) * .09);
  const photo = document.createElement('canvas');
  photo.width = width + 2 * margin;
  photo.height = height + 2 * margin;
  const context = photo.getContext('2d')!;
  context.fillStyle = '#faf7f2';
  context.fillRect(0, 0, photo.width, photo.height);
  context.drawImage(frame, left, top, width, height, margin, margin, width, height);
  return new Promise((resolve, reject) => photo.toBlob(image => {
    if (image) resolve(image);
    else reject(Error('Не удалось сохранить 3D-изображение комода.'));
  },'image/jpeg',.9));
}

export function CabinetPhoto({capture,onReady}: {capture: RefObject<CaptureCabinet | null>; onReady: (ready:boolean) => void}) {
  const {gl, scene, camera, invalidate} = useThree();
  useEffect(() => {
    capture.current = async dimensions => {
      const canvas = gl.domElement;
      if (!canvas.width || !canvas.height) throw Error('Дождитесь загрузки 3D-модели.');
      const scale = Math.max(...dimensions);
      const [width, height] = dimensions.map(value => value / scale);
      const aspect = canvas.width / canvas.height;
      const halfHeight = Math.max(height, width / aspect) * .58;
      const halfWidth = halfHeight * aspect;
      const frontCamera = new OrthographicCamera(-halfWidth, halfWidth, halfHeight, -halfHeight, .01, 10);
      frontCamera.position.set(0, height / 2, 3);
      frontCamera.lookAt(0, height / 2, 0);
      const measurements = scene.getObjectByName('cabinet-measurements');
      const showMeasurements = measurements?.visible ?? false;
      try {
        if (measurements) measurements.visible = false;
        gl.render(scene, camera);
        const view = snapshot(canvas);
        gl.render(scene, frontCamera);
        const front = snapshot(canvas);
        const [viewPhoto, frontPhoto] = await Promise.all([view, front]);
        return {view:viewPhoto, front:frontPhoto};
      } finally {
        if (measurements) measurements.visible = showMeasurements;
        gl.render(scene, camera);
        invalidate();
      }
    };
    onReady(true);
    return () => {capture.current = null;onReady(false);};
  },[gl,scene,camera,invalidate,capture,onReady]);
  return null;
}
