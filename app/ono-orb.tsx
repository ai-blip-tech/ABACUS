"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export type OnoState = "idle" | "hoverReady" | "openReady" | "composing" | "listening" | "thinking" | "speaking" | "success" | "error" | "moving";

type OnoOrbProps = {
  state: OnoState;
  size: number;
  expanded: boolean;
  velocityX?: number;
  velocityY?: number;
  audioLevel?: number;
  reducedMotion?: boolean;
};

type LiveProps = Omit<OnoOrbProps, "size">;

const STATE_INDEX: Record<OnoState, number> = {
  idle: 0,
  listening: 1,
  thinking: 2,
  speaking: 3,
  success: 4,
  error: 5,
  moving: 6,
  hoverReady: 7,
  openReady: 8,
  composing: 9,
};

const vertexShader = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * .5 + .5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

const fragmentShader = `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform float uState;
uniform float uStateAge;
uniform float uAudio;
uniform float uExpand;
uniform float uReady;
uniform float uIdleScenario;
uniform float uIdleProgress;
uniform vec2 uVelocity;
uniform vec2 uResolution;

#define PI 3.14159265359

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

vec3 orbit(float phase, float radius, float vertical, float speed) {
  float a = phase + uTime * speed;
  return vec3(cos(a) * radius, vertical + sin(a * .73) * radius * .34, sin(a) * radius * .34);
}

void liquidCenters(out vec3 c0, out vec3 c1, out vec3 c2, out vec3 c3, out vec3 c4, out vec3 radii) {
  float idleT = uTime * .62;
  float expansionKick = sin(min(uStateAge * 7.4, PI)) * .12 * abs(uExpand - .5) * 2.0;
  c0 = vec3(-.14 + sin(idleT) * .10, -.43 - expansionKick + cos(idleT * .74) * .025, -.03);
  c1 = vec3(.23 + sin(idleT * .71 + 2.1) * .13, -.33 + sin(idleT * .53) * .035, .08);
  c2 = vec3(-.34 + cos(idleT * .47) * .035, -.23 + cos(idleT * .58) * .10, -.11);
  c3 = vec3(.09 + cos(idleT * .83) * .15, -.06 + sin(idleT * .44) * .04, .02);
  c4 = vec3(.35, -.12 + sin(idleT * .66) * .11, -.14);
  radii = vec3(.53, .34, .29);

  float eventEnvelope = pow(sin(clamp(uIdleProgress, 0.0, 1.0) * PI), 2.0);
  if (uState < .5) {
    if (uIdleScenario > .5 && uIdleScenario < 1.5) {
      float wave = sin(uIdleProgress * PI * 2.0);
      c0.x -= eventEnvelope * .13;
      c1 += vec3(eventEnvelope * .12, wave * .07, 0.0);
      c2.y += eventEnvelope * .10;
    } else if (uIdleScenario > 1.5 && uIdleScenario < 2.5) {
      c4 = mix(c4, vec3(.67, .06, -.06), eventEnvelope);
      c3 = mix(c3, vec3(.45, -.04, -.02), eventEnvelope * .72);
    } else if (uIdleScenario > 2.5 && uIdleScenario < 3.5) {
      float lift = sin(clamp(uIdleProgress * 1.08, 0.0, 1.0) * PI);
      c4 = vec3(.16 + sin(uIdleProgress * 5.2) * .08, -.03 + lift * .43, -.04);
      c3.y += lift * .10;
    } else if (uIdleScenario > 3.5) {
      float fold = sin(uIdleProgress * PI * 2.0) * eventEnvelope;
      c3 += vec3(fold * .30, eventEnvelope * .13, -.08);
      c1.x -= fold * .13;
    }
    if (uReady > .015) {
      float riseA = fract(uTime * .76 + .17);
      float riseB = fract(uTime * .57 + .69);
      c3 = mix(c3, vec3(-.18 + sin(riseA * 5.1) * .10, -.34 + riseA * .70, -.03), uReady);
      c4 = mix(c4, vec3(.20 + cos(riseB * 4.4) * .12, -.38 + riseB * .62, -.11), uReady * .82);
    }
  } else if (uState > .5 && uState < 1.5) {
    float listen = .10 + uAudio * .23;
    c1.y += sin(uTime * 3.1) * listen;
    c2.x -= sin(uTime * 2.7) * listen * .65;
    c3 = orbit(.8, .22 + uAudio * .08, -.02, .72);
    c4 = orbit(3.2, .32, -.18, -.48);
  } else if (uState > 1.5 && uState < 2.5) {
    c0 = orbit(.2, .18, -.10, .72);
    c1 = orbit(1.5, .38, -.03, 1.05);
    c2 = orbit(3.1, .42, .08, .88);
    c3 = orbit(4.5, .32, .02, 1.18);
    c4 = orbit(5.7, .26, -.12, .95);
    radii = vec3(.43, .30, .27);
  } else if (uState > 2.5 && uState < 3.5) {
    float pulse = .5 + .5 * sin(uTime * (3.1 + uAudio * 2.5));
    c0.y = -.25 + pulse * .16;
    c1 = orbit(.4, .27 + pulse * .09, -.18, .66);
    c2 = orbit(2.4, .34 + pulse * .08, -.02, -.52);
    c3 = orbit(4.1, .26 + pulse * .12, .11, .74);
    c4 = orbit(5.5, .36, -.16, -.43);
  } else if (uState > 3.5 && uState < 4.5) {
    float merge = smoothstep(.0, .78, min(uStateAge, 1.0));
    c1 = mix(vec3(.40, .12, .0), vec3(.12, -.24, .02), merge);
    c2 = mix(vec3(-.42, -.03, .08), vec3(-.14, -.28, -.03), merge);
    c3 = mix(vec3(.12, .42, -.06), vec3(.03, -.12, .04), merge);
    c4 = mix(vec3(-.18, .20, .10), vec3(.17, -.18, -.07), merge);
  } else if (uState > 4.5 && uState < 5.5) {
    float shock = exp(-uStateAge * 2.6) * sin(uStateAge * 18.0);
    c0.x -= .18 + shock * .13;
    c1 += vec3(.38 + shock * .10, .20, .0);
    c2 += vec3(-.22, .24 - shock * .07, .0);
    c3 += vec3(.21, -.14, .0);
    radii = vec3(.45, .28, .25);
  } else if (uState > 5.5 && uState < 6.5) {
    vec2 lag = clamp(-uVelocity * .25, vec2(-.32), vec2(.32));
    c0.xy += lag;
    c1.xy += lag * .85;
    c2.xy += lag * 1.18;
    c3.xy += lag * .62;
    c4.xy += lag * 1.30;
  } else if (uState > 6.5 && uState < 8.5) {
    float readySpeed = uState < 7.5 ? 1.0 : .68;
    float riseA = fract(uTime * .76 * readySpeed + .17);
    float riseB = fract(uTime * .57 * readySpeed + .69);
    float wake = smoothstep(0.0, .62, min(uStateAge, .62));
    c0.y -= sin(min(uStateAge * 5.1, PI)) * .07;
    c1.y += sin(uTime * 1.8) * .065 * wake;
    c3 = vec3(-.18 + sin(riseA * 5.1) * .10, -.34 + riseA * .70, -.03);
    c4 = vec3(.20 + cos(riseB * 4.4) * .12, -.38 + riseB * .62, -.11);
    radii = vec3(.50, .33, .27);
  } else if (uState > 8.5) {
    float gather = .5 + .5 * sin(uTime * 1.15);
    c0 = vec3(-.08,-.40,-.03);
    c1 = vec3(.18,-.34 + gather * .025,.05);
    c2 = vec3(-.27,-.29,-.08);
    c3 = vec3(.02,-.28,.01);
    c4 = vec3(.25,-.31,-.08);
  }
}

float liquidField(vec3 p, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 r) {
  float d = 0.0;
  d += r.x * r.x / max(dot(p-c0,p-c0), .012);
  d += r.y * r.y / max(dot(p-c1,p-c1), .012);
  d += r.z * r.z / max(dot(p-c2,p-c2), .012);
  d += .24 * .24 / max(dot(p-c3,p-c3), .012);
  d += .19 * .19 / max(dot(p-c4,p-c4), .012);
  return d;
}

vec3 liquidNormal(vec3 p, vec3 c0, vec3 c1, vec3 c2, vec3 c3, vec3 c4, vec3 r) {
  float e = .016;
  float x1 = liquidField(p + vec3(e,0.,0.),c0,c1,c2,c3,c4,r);
  float x0 = liquidField(p - vec3(e,0.,0.),c0,c1,c2,c3,c4,r);
  float y1 = liquidField(p + vec3(0.,e,0.),c0,c1,c2,c3,c4,r);
  float y0 = liquidField(p - vec3(0.,e,0.),c0,c1,c2,c3,c4,r);
  float z1 = liquidField(p + vec3(0.,0.,e),c0,c1,c2,c3,c4,r);
  float z0 = liquidField(p - vec3(0.,0.,e),c0,c1,c2,c3,c4,r);
  return normalize(vec3(x1-x0,y1-y0,z1-z0));
}

void main() {
  vec2 aspect = vec2(uResolution.x / max(uResolution.y, 1.0), 1.0);
  vec2 uv = (vUv * 2.0 - 1.0) * aspect;
  float rr = dot(uv, uv);
  if (rr > 1.0) discard;

  float sphereZ = sqrt(max(0.0, 1.0 - rr));
  vec3 shellN = normalize(vec3(uv, sphereZ));
  vec3 view = vec3(0.,0.,1.);
  float fresnel = pow(1.0 - max(dot(shellN, view), 0.0), 2.7);

  vec3 c0; vec3 c1; vec3 c2; vec3 c3; vec3 c4; vec3 radii;
  liquidCenters(c0,c1,c2,c3,c4,radii);
  float jitter = (hash21(gl_FragCoord.xy) - .5) * .014;
  float front = -sphereZ;
  float span = sphereZ * 2.0;
  float hit = 0.0;
  vec3 hitP = vec3(0.0);
  for (int i=0; i<34; i++) {
    float fi = (float(i) + .45 + jitter) / 34.0;
    vec3 p = vec3(uv * .94, front + span * fi);
    float boundary = 1.0 - smoothstep(.78, 1.0, dot(p,p));
    float field = liquidField(p,c0,c1,c2,c3,c4,radii) * boundary;
    if (field > 1.72 && hit < .5) { hit = 1.0; hitP = p; }
  }

  vec3 color = vec3(.80,.79,.75) * .035;
  float alpha = .10 + fresnel * .46;
  if (hit > .5) {
    vec3 n = liquidNormal(hitP,c0,c1,c2,c3,c4,radii);
    vec3 key = normalize(vec3(-.55,.74,.82));
    vec3 fill = normalize(vec3(.64,-.18,.72));
    float spec = pow(max(dot(reflect(-key,n),view),0.0), 42.0);
    float wet = pow(max(dot(reflect(-fill,n),view),0.0), 18.0);
    float facing = .20 + .80 * max(dot(n,key),0.0);
    vec3 oilShadow = mix(vec3(.012,.010,.010), vec3(.137,.027,.051), uReady);
    vec3 oilFace = mix(vec3(.075,.057,.052), vec3(.337,.063,.106), uReady);
    vec3 oilReflect = mix(vec3(.78,.73,.66), vec3(.553,.149,.220), uReady);
    color = mix(oilShadow, oilFace, facing * .55);
    color += oilReflect * spec * (.50 + uReady * .16) + mix(vec3(.28,.17,.15),vec3(.42,.07,.12),uReady) * wet * .22;
    color *= .82 + hitP.z * .12;
    alpha = .985;
  }

  float primary = pow(max(dot(shellN,normalize(vec3(-.52,.68,.52))),0.0), 34.0);
  float secondary = pow(max(dot(shellN,normalize(vec3(.72,-.30,.62))),0.0), 18.0);
  float edgeBand = smoothstep(.72,1.0,rr) * (1.0-smoothstep(.965,1.0,rr));
  color += vec3(1.0,.985,.94) * primary * (.72 + uReady * .16);
  color += vec3(.72,.69,.64) * secondary * .14;
  color += vec3(.84,.83,.79) * fresnel * .20;
  color += vec3(.92,.90,.84) * edgeBand * .12;
  alpha = max(alpha, edgeBand * .48 + fresnel * .28);

  float rim = smoothstep(.89,1.0,rr);
  color = mix(color, vec3(.82,.81,.77), rim * .18);
  alpha = clamp(alpha + rim * .18, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha);
}`;

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Shader allocation failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Shader compilation failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

export default function OnoOrb({ state, size, expanded, velocityX = 0, velocityY = 0, audioLevel = 0, reducedMotion }: OnoOrbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [systemReducedMotion, setSystemReducedMotion] = useState(false);
  const effectiveReducedMotion = reducedMotion ?? systemReducedMotion;
  const liveRef = useRef<LiveProps>({ state, expanded, velocityX, velocityY, audioLevel, reducedMotion: effectiveReducedMotion });
  const [fallback, setFallback] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReducedMotion(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    liveRef.current = { state, expanded, velocityX, velocityY, audioLevel, reducedMotion: effectiveReducedMotion };
  }, [state, expanded, velocityX, velocityY, audioLevel, effectiveReducedMotion]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, premultipliedAlpha: false });
    if (!gl) {
      setFallback(true);
      return;
    }

    let vertex: WebGLShader | null = null;
    let fragment: WebGLShader | null = null;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let frame = 0;
    let visible = true;
    let lastDraw = 0;
    let stateAge = 0;
    let lastState = liveRef.current.state;
    let lastExpanded = liveRef.current.expanded;
    let smoothAudio = 0;
    let smoothReady = 0;
    const smoothVelocity = { x: 0, y: 0 };
    let smoothExpand = liveRef.current.expanded ? 1 : 0;
    let lastTime = performance.now();
    let elapsed = 0;
    let idleScenario = 0;
    let lastIdleScenario = 0;
    let idleProgress = 0;
    let idleEventClock = 0;
    let idleEventDuration = 8;
    let idleGapClock = 0;
    let idleGapDuration = 3.8;
    let randomSeed = 0x6d2b79f5;

    const random = () => {
      randomSeed ^= randomSeed << 13;
      randomSeed ^= randomSeed >>> 17;
      randomSeed ^= randomSeed << 5;
      return (randomSeed >>> 0) / 4294967296;
    };

    const nextIdleScenario = () => {
      const weighted = [1, 1, 1, 1, 2, 2, 4, 4, 3];
      let next = weighted[Math.floor(random() * weighted.length)];
      if (next === lastIdleScenario) next = weighted[(weighted.indexOf(next) + 4 + Math.floor(random() * 3)) % weighted.length];
      if (next === lastIdleScenario) next = next === 1 ? 2 : 1;
      lastIdleScenario = next;
      return next;
    };

    const idleDuration = (scenario: number) => {
      if (scenario === 1) return 7 + random() * 4;
      if (scenario === 2) return 5 + random() * 3;
      if (scenario === 3) return 6 + random() * 3;
      if (scenario === 4) return 6 + random() * 4;
      return 8;
    };

    try {
      vertex = compile(gl, gl.VERTEX_SHADER, vertexShader);
      fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentShader);
      program = gl.createProgram();
      if (!program) throw new Error("Program allocation failed");
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Program link failed");
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
      gl.useProgram(program);
      const position = gl.getAttribLocation(program, "aPosition");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    } catch (error) {
      console.warn("Ono orb WebGL fallback:", error);
      setFallback(true);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return;
    }

    const locations = {
      time: gl.getUniformLocation(program, "uTime"),
      state: gl.getUniformLocation(program, "uState"),
      stateAge: gl.getUniformLocation(program, "uStateAge"),
      audio: gl.getUniformLocation(program, "uAudio"),
      expand: gl.getUniformLocation(program, "uExpand"),
      ready: gl.getUniformLocation(program, "uReady"),
      idleScenario: gl.getUniformLocation(program, "uIdleScenario"),
      idleProgress: gl.getUniformLocation(program, "uIdleProgress"),
      velocity: gl.getUniformLocation(program, "uVelocity"),
      resolution: gl.getUniformLocation(program, "uResolution"),
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2.5, Math.max(2, window.devicePixelRatio || 1));
      const width = Math.max(2, Math.round(rect.width * dpr));
      const height = Math.max(2, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (!visible || document.hidden) return;
      const live = liveRef.current;
      const wantsReady = live.state === "hoverReady" || live.state === "openReady" || live.state === "composing";
      const active = live.state !== "idle" || Math.abs(smoothReady - (wantsReady ? 1 : 0)) > .002 || Math.abs(smoothExpand - (live.expanded ? 1 : 0)) > .002;
      const interval = live.reducedMotion ? 1000 : active ? 1000 / 60 : 1000 / 30;
      if (now - lastDraw < interval) return;
      const rawDelta = Math.min(1.1, Math.max(.001, (now - lastTime) / 1000));
      const delta = Math.min(.05, rawDelta);
      lastTime = now;
      lastDraw = now;
      elapsed += rawDelta * (live.reducedMotion ? .42 : 1);
      if (live.state !== lastState || live.expanded !== lastExpanded) {
        lastState = live.state;
        lastExpanded = live.expanded;
        stateAge = 0;
      } else {
        stateAge += rawDelta;
      }
      const targetExpand = live.expanded ? 1 : 0;
      smoothExpand += (targetExpand - smoothExpand) * Math.min(1, delta * 8.5);
      smoothReady += ((wantsReady ? 1 : 0) - smoothReady) * Math.min(1, delta * (wantsReady ? 5.2 : 2.35));
      smoothAudio += (Math.max(0, Math.min(1, live.audioLevel || 0)) - smoothAudio) * Math.min(1, delta * 11);
      smoothVelocity.x += (Math.max(-1, Math.min(1, (live.velocityX || 0) / 420)) - smoothVelocity.x) * Math.min(1, delta * 7);
      smoothVelocity.y += (Math.max(-1, Math.min(1, -(live.velocityY || 0) / 420)) - smoothVelocity.y) * Math.min(1, delta * 7);
      if (live.state === "idle" && smoothReady < .03) {
        if (live.reducedMotion) {
          idleScenario = 1;
          idleProgress = (elapsed % 18) / 18;
        } else if (idleScenario === 0) {
          idleGapClock += rawDelta;
          idleProgress = 0;
          if (idleGapClock >= idleGapDuration) {
            idleScenario = nextIdleScenario();
            idleEventDuration = idleDuration(idleScenario);
            idleEventClock = 0;
            idleGapClock = 0;
          }
        } else {
          idleEventClock += rawDelta;
          idleProgress = Math.min(1, idleEventClock / idleEventDuration);
          if (idleProgress >= 1) {
            idleScenario = 0;
            idleProgress = 0;
            idleGapDuration = 3 + random() * 4;
            idleGapClock = 0;
          }
        }
      } else {
        idleScenario = 0;
        idleProgress = 0;
        idleEventClock = 0;
        idleGapClock = 0;
      }
      resize();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(locations.time, elapsed);
      gl.uniform1f(locations.state, live.reducedMotion ? 0 : STATE_INDEX[live.state]);
      gl.uniform1f(locations.stateAge, stateAge);
      gl.uniform1f(locations.audio, smoothAudio);
      gl.uniform1f(locations.expand, smoothExpand);
      gl.uniform1f(locations.ready, smoothReady);
      gl.uniform1f(locations.idleScenario, idleScenario);
      gl.uniform1f(locations.idleProgress, idleProgress);
      gl.uniform2f(locations.velocity, live.reducedMotion ? 0 : smoothVelocity.x, live.reducedMotion ? 0 : smoothVelocity.y);
      gl.uniform2f(locations.resolution, canvas.width, canvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; }, { threshold: .01 });
    observer.observe(canvas);
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    };
  }, [fragmentShader]);

  return (
    <span
      className={`ono-orb${fallback ? " is-fallback" : ""}${expanded ? " is-expanded" : ""}`}
      style={{ "--ono-size": `${size}px` } as CSSProperties}
      data-state={state}
      aria-hidden="true"
    >
      <span className="ono-orb-shadow" />
      <canvas ref={canvasRef} className="ono-orb-canvas" />
      {fallback && <span className="ono-orb-fallback" />}
    </span>
  );
}
