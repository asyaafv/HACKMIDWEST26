import * as THREE from 'three';
import { entrancePose } from './entrance-timeline';

type Pose = ReturnType<typeof entrancePose>;
export interface EntranceScene {
  render(time: number, pose: Pose): void;
  resize(): void;
  dispose(): void;
}

const rainbow = ['#ff3044', '#ff9510', '#ffe62b', '#1fdb65', '#00bdf7', '#134cff', '#a32aff', '#e52af3'].map(c => new THREE.Color(c));

/** Procedural, self-contained scene: no network assets, models, or image decoding. */
export function createEntranceScene(canvas: HTMLCanvasElement): EntranceScene {
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-5, 5, 4.35, -4.35, .1, 80);
  camera.position.set(0, 3.8, 14); camera.lookAt(0, 2.4, 0);
  const scenery = new THREE.Group(), mascot = new THREE.Group(), gate = new THREE.Group();
  scene.add(scenery, mascot); scenery.add(gate);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const baseOpacities = new Map<THREE.Material, number>();
  let width = 1, height = 1, viewHeight = 8.7, disposed = false;
  const material = <T extends THREE.Material>(value: T) => { materials.add(value); baseOpacities.set(value, value.opacity); return value; };
  const texture = <T extends THREE.Texture>(value: T) => { textures.add(value); return value; };
  const mesh = (geometry: THREE.BufferGeometry, mat: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    geometries.add(geometry);
    const object = new THREE.Mesh(geometry, mat); object.position.set(x, y, z); parent.add(object); return object;
  };
  const stone = (color: number) => material(new THREE.MeshStandardMaterial({ color, roughness: 1, metalness: 0, flatShading: true, transparent: true }));
  const stones = [stone(0x606060), stone(0x707070), stone(0x7c7c7c), stone(0x535353), stone(0x898989)];
  const iron = material(new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0, roughness: 1, transparent: true }));
  const edge = material(new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0, roughness: 1, transparent: true }));
  const darkStone = stone(0x2c2c2c);
  const fadeGroup = (group: THREE.Object3D, opacity: number) => {
    group.traverse(object => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        const mats = Array.isArray(object.material) ? object.material : [object.material];
        mats.forEach(mat => { mat.opacity = (baseOpacities.get(mat) ?? 1) * opacity; });
      }
    });
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose());
    scene.clear(); renderer.dispose(); renderer.forceContextLoss();
  };

  try {
    scene.add(new THREE.HemisphereLight(0xe5e5e5, 0x242424, 1.9));
    const key = new THREE.DirectionalLight(0xffffff, 3); key.position.set(-4, 7, 6); scene.add(key);


    // Individually beveled blocks and radial voussoirs make the arch tangible at close range.
    const block = (w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z = 0) => {
      const shape = new THREE.Shape();
      shape.moveTo(-w / 2 + .035, -h / 2); shape.lineTo(w / 2 - .035, -h / 2);
      shape.lineTo(w / 2, -h / 2 + .035); shape.lineTo(w / 2, h / 2 - .035);
      shape.lineTo(w / 2 - .035, h / 2); shape.lineTo(-w / 2 + .035, h / 2);
      shape.lineTo(-w / 2, h / 2 - .035); shape.lineTo(-w / 2, -h / 2 + .035); shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: d - .05, bevelEnabled: true, bevelThickness: .025, bevelSize: .025, bevelSegments: 1, steps: 1 });
      geometry.translate(0, 0, -d / 2);
      return mesh(geometry, mat, scenery, x, y, z);
    };
    for (const side of [-1, 1]) {
      block(.95, .26, 1.3, stones[3], side * 2.11, .08);
      for (let row = 0; row < 6; row++) block(.64 + (row % 2) * .05, .455, 1.04, stones[(row + (side + 1)) % stones.length], side * 2.1, .46 + row * .48);
      block(.88, .2, 1.22, stones[2], side * 2.1, 3.18);
      // A restrained buttress and its sloped cap on either side.
      block(.48, 1.7, .84, stones[3], side * 2.65, .86, -.16);
      const cap = mesh(new THREE.ConeGeometry(.42, .33, 4), stones[1], scenery, side * 2.65, 1.86, -.16);
      cap.rotation.y = Math.PI / 4;
    }
    for (let i = 0; i < 13; i++) {
      const a = i * Math.PI / 13 + .012, b = (i + 1) * Math.PI / 13 - .012;
      const shape = new THREE.Shape();
      shape.moveTo(Math.cos(a) * 1.78, Math.sin(a) * 1.78);
      shape.lineTo(Math.cos(a) * 2.46, Math.sin(a) * 2.46);
      shape.lineTo(Math.cos(b) * 2.46, Math.sin(b) * 2.46);
      shape.lineTo(Math.cos(b) * 1.78, Math.sin(b) * 1.78); shape.closePath();
      mesh(new THREE.ExtrudeGeometry(shape, { depth: 1.04, bevelEnabled: true, bevelThickness: .025, bevelSize: .02, bevelSegments: 1, steps: 1 }), stones[(i * 3) % stones.length], scenery, 0, 3.15, -.55);
    }
    block(.39, .62, 1.21, stones[4], 0, 5.28, .05);
    // Floating diorama plinth, with a short path leading out through the gate.
    const plinth = mesh(new THREE.CylinderGeometry(3.12, 2.85, .25, 9), darkStone, scenery, 0, -.13, .25);
    plinth.scale.z = .64;
    for (let i = 0; i < 3; i++) block(2.5 + i * .16, .085, .68, stones[3], 0, -.01 - i * .04, .8 + i * .71);

    // Portcullis bars terminate in downward iron points. Its lift remains below the arch crown.
    for (let i = -2; i <= 2; i++) {
      const x = i * .67, top = 3.15 + Math.sqrt(1.72 ** 2 - x ** 2);
      mesh(new THREE.BoxGeometry(.065, top - .25, .09), iron, gate, x, (top + .25) / 2, .64);
      const tip = mesh(new THREE.ConeGeometry(.075, .23, 4), edge, gate, x, .16, .64); tip.rotation.z = Math.PI;
    }
    for (const y of [.68, 2.76, 3.62]) {
      const barWidth = y < 3.15 ? 3.48 : 2 * Math.sqrt(1.72 ** 2 - (y - 3.15) ** 2);
      mesh(new THREE.BoxGeometry(barWidth, .065, .13), iron, gate, 0, y, .66);
      for (let i = -2; i <= 2; i++) mesh(new THREE.SphereGeometry(.052, 6, 4), edge, gate, i * .67, y, .75);
    }
    // Clip the rising iron into the masonry instead of letting it emerge above the arch.
    renderer.localClippingEnabled = true;
    const lintel = new THREE.Plane(new THREE.Vector3(0, -1, 0), 5.05);
    iron.clippingPlanes = [lintel]; edge.clippingPlanes = [lintel];

    const sphereGeometry = new THREE.SphereGeometry(.97, 64, 40);
    // Face-local band coordinates keep the original logo's diagonal color ordering.
    // Preserve the logo's saturated bands instead of washing them out with the
    // gate's scene lighting. The geometry still turns and occludes in 3D.
    const bodyMaterial = material(new THREE.MeshBasicMaterial({ transparent: true, toneMapped: false }));
    bodyMaterial.onBeforeCompile = shader => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRainbowPosition;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRainbowPosition = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vRainbowPosition;\nvec3 stripe(float n) { ${rainbow.map((c, i) => `if (n < ${((i + 1) / 8).toFixed(4)}) return vec3(${c.r.toFixed(5)}, ${c.g.toFixed(5)}, ${c.b.toFixed(5)});`).join(' ')} return vec3(1.0,0.05,0.7); }`).replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = stripe(clamp(0.5 - (vRainbowPosition.y - vRainbowPosition.x * 0.64) / 2.48, 0.0, 0.999));');
    };
    mesh(sphereGeometry, bodyMaterial, mascot);
    const white = material(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, toneMapped: false }));
    const pupilMat = material(new THREE.MeshBasicMaterial({ color: 0x020202, transparent: true, toneMapped: false }));
    const eyes = [-1, 1].map(side => {
      const eye = new THREE.Group(); eye.position.set(side * .427, .035, 1.01); mascot.add(eye);
      mesh(new THREE.TorusGeometry(.291, .027, 8, 64), white, eye);
      const pupil = mesh(new THREE.CapsuleGeometry(.135, .164, 8, 24), pupilMat, eye, 0, 0, .04); pupil.scale.z = .45;
      const highlight = mesh(new THREE.CapsuleGeometry(.052, .153, 8, 20), white, eye, 0, 0, .113); highlight.scale.z = .25;
      return { eye, pupil, highlight };
    });

    // Camera-aligned rain fills the viewport behind the gate, including its
    // outer edges; the center is quieter to keep the mascot readable.
    const codeCanvas = document.createElement('canvas');
    const ctx = codeCanvas.getContext('2d')!;
    const codeTexture = texture(new THREE.CanvasTexture(codeCanvas)); codeTexture.colorSpace = THREE.SRGBColorSpace;
    codeTexture.minFilter = THREE.LinearFilter; codeTexture.magFilter = THREE.LinearFilter;
    const rainMaterial = material(new THREE.MeshBasicMaterial({ map: codeTexture, transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
    scene.add(camera);
    const rain = mesh(new THREE.PlaneGeometry(1, 1), rainMaterial, camera, 0, 0, -25);
    // Dense, outlined digits use the same binary clock while staying transparent
    // enough to read the original eye shapes beneath the reflection.
    const eyeCanvas = document.createElement('canvas'); eyeCanvas.width = eyeCanvas.height = 256;
    const eyeCtx = eyeCanvas.getContext('2d')!;
    const eyeTexture = texture(new THREE.CanvasTexture(eyeCanvas)); eyeTexture.colorSpace = THREE.SRGBColorSpace;
    eyeTexture.minFilter = THREE.LinearFilter; eyeTexture.magFilter = THREE.LinearFilter;
    const reflectionMaterial = material(new THREE.ShaderMaterial({
      uniforms: { code: { value: eyeTexture }, opacity: { value: 1 }, gaze: { value: 0 } },
      transparent: true, depthWrite: false, toneMapped: false,
      vertexShader: 'varying vec2 vUv; void main() { vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'uniform sampler2D code; uniform float opacity; uniform float gaze; varying vec2 vUv; void main() { vec2 p=(vUv-.5)*2.0; float mask=1.0-smoothstep(.90,1.0,dot(p,p)); vec4 c=texture2D(code,vec2(clamp(1.0-vUv.x+gaze*.018,0.0,1.0),vUv.y)); gl_FragColor=vec4(c.rgb,c.a*mask*opacity); }',
    }));
    eyes.forEach(({ eye }) => mesh(new THREE.PlaneGeometry(.535, .535), reflectionMaterial, eye, 0, 0, .135));
    let lastCodeFrame = -1, lastRainFrame = -1;
    const drawCode = (time: number) => {
      const frame = Math.floor(time / 20); if (frame === lastCodeFrame) return; lastCodeFrame = frame;
      const rainFrame = Math.floor(time / 33);
      if (rainFrame !== lastRainFrame) {
        lastRainFrame = rainFrame;
        const w = codeCanvas.width, h = codeCanvas.height, resolution = w / width;
        const fontSize = (width < 1024 ? 18 : 22) * resolution;
        const columnWidth = fontSize * 1.45, rowHeight = fontSize * 1.45;
        const columns = Math.ceil(w / columnWidth), rows = Math.ceil(h / rowHeight) + 2;
        ctx.clearRect(0, 0, w, h);
        ctx.font = `700 ${fontSize}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (let col = 0; col < columns; col++) {
          const x = (col + .5) * columnWidth;
          const speed = (.13 + (col % 7) * .017) * resolution;
          const head = (time * speed + col * 137 * resolution) % h;
          const offset = (time * speed + col * 17 * resolution) % rowHeight;
          for (let row = -1; row < rows; row++) {
            const y = (row + .5) * rowHeight + offset;
            const distance = ((head - y + h) % h) / h;
            const trail = Math.max(.12, 1 - distance * 1.15);
            const centerDistance = Math.hypot((x - w / 2) / (w * .28), (y - h / 2) / (h * .36));
            const focus = .22 + .78 * Math.min(1, centerDistance);
            const alpha = trail * focus;
            ctx.fillStyle = distance < .055 ? `rgba(204,255,222,${alpha})` : `rgba(48,255,139,${alpha})`;
            ctx.fillText((col * 7 + row * 3 + Math.floor(time / 240)) % 5 < 2 ? '1' : '0', x, y);
          }
        }
        codeTexture.needsUpdate = true;
      }
      eyeCtx.clearRect(0, 0, 256, 256);
      // Only the digits have alpha: the original eyes remain visible beneath.
      eyeCtx.font = '800 36px monospace'; eyeCtx.textAlign = 'center'; eyeCtx.textBaseline = 'middle';
      eyeCtx.lineJoin = 'round';
      for (let col = 0; col < 5; col++) {
        const offset = (time * (.21 + col * .025) + col * 17) % 42;
        for (let row = -1; row < 8; row++) {
          const digit = (col * 7 + row * 3 + Math.floor(time / 180) + 30) % 5 < 2 ? '1' : '0';
          const x = (col + .5) * 256 / 5, y = row * 42 + offset;
          eyeCtx.strokeStyle = '#02150b'; eyeCtx.lineWidth = 5;
          eyeCtx.strokeText(digit, x, y);
          eyeCtx.fillStyle = (row + col + 8) % 5 === 0 ? '#c7ffe0' : '#39ff89';
          eyeCtx.strokeStyle = eyeCtx.fillStyle; eyeCtx.lineWidth = 1.6;
          eyeCtx.strokeText(digit, x, y); eyeCtx.fillText(digit, x, y);
        }
      }
      eyeTexture.needsUpdate = true;
    };

    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      const mobile = width < 1024, aspect = width / height;
      viewHeight = Math.max(8.7, (mobile ? 7.7 : 10.4) / aspect);
      camera.left = -viewHeight * aspect / 2; camera.right = viewHeight * aspect / 2;
      camera.top = viewHeight / 2; camera.bottom = -viewHeight / 2; camera.updateProjectionMatrix();
      renderer.setSize(width, height, false);
      rain.scale.set(viewHeight * aspect, viewHeight, 1);
      const resolution = Math.min(1, 1280 / width, 960 / height);
      codeCanvas.width = Math.max(1, Math.round(width * resolution));
      codeCanvas.height = Math.max(1, Math.round(height * resolution));
      lastCodeFrame = lastRainFrame = -1;
    };
    const flightPosition = new THREE.Vector3(), targetPosition = new THREE.Vector3();
    const render = (time: number, pose: Pose) => {
      if (disposed) return;
      drawCode(time);
      scenery.visible = pose.scenery > 0;
      fadeGroup(scenery, pose.reveal * pose.scenery);
      rainMaterial.opacity = pose.code * pose.scenery;
      gate.position.y = pose.gate * 4.75;
      mascot.position.set(0, 2.02 + Math.sin(time / 420) * .045 * (1 - pose.flight), -.65 + pose.flight * 4.7);
      mascot.rotation.set(0, pose.gaze * .12, 0);
      let scale = 1.16;
      if (pose.handoff > 0 && width >= 1024) {
        const logo = document.querySelector('.brand img')?.getBoundingClientRect();
        if (logo && logo.left >= 0 && logo.width > 0) {
          flightPosition.copy(mascot.position);
          const depth = flightPosition.clone().project(camera).z;
          targetPosition.set((logo.left + logo.width / 2) / width * 2 - 1, 1 - (logo.top + logo.height / 2) / height * 2, depth).unproject(camera);
          mascot.position.lerp(targetPosition, pose.handoff);
          // The source logo's sphere occupies about 72% of its square image.
          scale = THREE.MathUtils.lerp(scale, logo.width * .72 * viewHeight / (height * 1.94), pose.handoff);
        }
      }
      if (width < 1024) scale = THREE.MathUtils.lerp(scale, .08, pose.handoff);
      mascot.scale.setScalar(scale * (.93 + .07 * pose.reveal));
      fadeGroup(mascot, pose.reveal * pose.mascotOpacity);
      eyes.forEach(({ eye, pupil, highlight }, i) => {
        eye.scale.y = Math.max(.055, pose.eyes[i]);
        pupil.position.x = pose.gaze * .061; highlight.position.x = pose.gaze * .061;
      });
      reflectionMaterial.uniforms.opacity.value = pose.code * .62 * pose.mascotOpacity;
      reflectionMaterial.uniforms.gaze.value = pose.gaze;
      renderer.render(scene, camera);
    };
    resize(); render(0, entrancePose(0));
    return { render, resize, dispose };
  } catch (error) { dispose(); throw error; }
}
