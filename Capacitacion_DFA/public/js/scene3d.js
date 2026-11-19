import * as THREE from '../vendor/three/three.module.js';
import { soundFx } from './soundFx.js';

/**
 * Fondo cósmico 3D con paralaje sincronizado al lienzo espacial tipo Prezi
 */
export class CosmicBackdrop3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.targetX = 0;
    this.targetY = 0;
    this.currentX = 0;
    this.currentY = 0;
    this._init();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 42;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    const count = 900;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const palette = [
      new THREE.Color('#00B4F0'),
      new THREE.Color('#F5C518'),
      new THREE.Color('#E2E8F0'),
      new THREE.Color('#38BDF8'),
      new THREE.Color('#10B981')
    ];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 140;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 95;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 90 - 15;
      const c = palette[Math.floor(Math.random() * palette.length)];
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: 0.42,
      vertexColors: true,
      transparent: true,
      opacity: 0.85
    });
    this.stars = new THREE.Points(geo, mat);
    this.scene.add(this.stars);

    const ringGeo1 = new THREE.TorusGeometry(22, 0.06, 12, 100);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x00b4f0, transparent: true, opacity: 0.14 });
    this.ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    this.ring1.rotation.x = Math.PI * 0.36;
    this.scene.add(this.ring1);

    const ringGeo2 = new THREE.TorusGeometry(30, 0.05, 12, 120);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xf5c518, transparent: true, opacity: 0.1 });
    this.ring2 = new THREE.Mesh(ringGeo2, ringMat2);
    this.ring2.rotation.x = -Math.PI * 0.28;
    this.ring2.rotation.y = Math.PI * 0.22;
    this.scene.add(this.ring2);

    window.addEventListener('resize', () => this.resize());
    this._animate();
  }

  setParallaxTarget(nx, ny) {
    this.targetX = nx * 8;
    this.targetY = -ny * 5;
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.currentX += (this.targetX - this.currentX) * 0.04;
    this.currentY += (this.targetY - this.currentY) * 0.04;

    this.camera.position.x = this.currentX;
    this.camera.position.y = this.currentY;
    this.camera.lookAt(0, 0, -10);

    this.stars.rotation.y += 0.00045;
    this.stars.rotation.x += 0.00018;
    this.ring1.rotation.z += 0.0012;
    this.ring2.rotation.z -= 0.0009;

    this.renderer.render(this.scene, this.camera);
  }
}

/**
 * Simulador de Diseño 3D (estilo CAD / Tinkercad) + Modelos Educativos + Motor AR
 */
export class InteractiveStudio3D {
  constructor(canvas, onPartSelected, onDesignerStateChange) {
    this.canvas = canvas;
    this.onPartSelected = onPartSelected || (() => {});
    this.onDesignerStateChange = onDesignerStateChange || (() => {});

    this.currentModel = 'designer'; // 'designer' | 'hardware' | 'system' | 'google'
    this.exploded = false;
    this.explodeProgress = 0;
    this.autoRotate = false;
    this.globalWireframe = false;
    this.arTransparent = false;

    this.rotY = 0.55;
    this.rotX = 0.34;
    this.targetRotY = 0.55;
    this.targetRotX = 0.34;
    this.zoom = 8.2;
    this.targetZoom = 8.2;
    this.modelScale = 1.0;

    this.isDragging = false;
    this.dragMoved = false;
    this.prevPointer = { x: 0, y: 0 };

    this.interactables = [];
    this.animatedParts = [];
    this.explodeItems = [];
    this.designerObjects = [];
    this.selectedMesh = null;
    this.selectedDesignerObj = null;
    this.selectionBox = null;
    this.shapeCounter = 1;

    this._init();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    this.camera.position.set(0, 1.8, this.zoom);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Iluminación CAD profesional de 3 puntos
    const ambient = new THREE.AmbientLight(0xdbeafe, 0.9);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.45);
    keyLight.position.set(7, 11, 8);
    this.scene.add(keyLight);

    const rimCyan = new THREE.PointLight(0x00b4f0, 2.1, 24);
    rimCyan.position.set(-6, 4, -5);
    this.scene.add(rimCyan);

    const rimGold = new THREE.PointLight(0xf5c518, 1.5, 22);
    rimGold.position.set(6, -1, 6);
    this.scene.add(rimGold);

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    // Plano de trabajo CAD (grilla cartesiana + ejes X/Y/Z)
    this.cadGrid = new THREE.GridHelper(9, 18, 0x00b4f0, 0x1e3a5f);
    this.cadGrid.position.y = -1.6;
    this.cadGrid.material.transparent = true;
    this.cadGrid.material.opacity = 0.55;
    this.rootGroup.add(this.cadGrid);

    this.axesHelper = new THREE.AxesHelper(2.2);
    this.axesHelper.position.set(-4.5, -1.58, -4.5);
    this.rootGroup.add(this.axesHelper);

    // Grupo exclusivo del contenido de cada escena
    this.contentGroup = new THREE.Group();
    this.rootGroup.add(this.contentGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this._bindControls();
    this.loadModel('designer');
    this.resize();
    this._animate();
  }

  _bindControls() {
    const el = this.canvas;

    const onDown = (clientX, clientY) => {
      this.isDragging = true;
      this.dragMoved = false;
      this.prevPointer = { x: clientX, y: clientY };
    };

    const onMove = (clientX, clientY) => {
      if (!this.isDragging) return;
      const dx = clientX - this.prevPointer.x;
      const dy = clientY - this.prevPointer.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) this.dragMoved = true;
      this.targetRotY += dx * 0.008;
      this.targetRotX = Math.max(-0.85, Math.min(1.05, this.targetRotX + dy * 0.006));
      this.prevPointer = { x: clientX, y: clientY };
    };

    const onUp = (clientX, clientY) => {
      if (this.isDragging && !this.dragMoved) {
        this._pickObject(clientX, clientY);
      }
      this.isDragging = false;
    };

    el.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', (e) => onUp(e.clientX, e.clientY));

    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        this.isDragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        this._pinchDist = Math.hypot(dx, dy);
        this._pinchZoom = this.targetZoom;
      } else if (e.touches.length === 1) {
        onDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2 && this._pinchDist) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const factor = this._pinchDist / Math.max(10, dist);
        this.targetZoom = Math.max(3.8, Math.min(14.5, this._pinchZoom * factor));
      } else if (e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: false });
    el.addEventListener('touchend', (e) => {
      if (e.touches.length < 2) this._pinchDist = null;
      if (e.changedTouches.length === 1 && e.touches.length === 0) {
        onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    });

    if (typeof ResizeObserver !== 'undefined' && el.parentElement) {
      new ResizeObserver(() => this.resize()).observe(el.parentElement);
    }

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetZoom = Math.max(3.8, Math.min(14.5, this.targetZoom + e.deltaY * 0.005));
    }, { passive: false });
  }

  _pickObject(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const targets = this.currentModel === 'designer' ? this.designerObjects : this.interactables;
    const hits = this.raycaster.intersectObjects(targets, true);

    if (hits.length > 0) {
      let obj = hits[0].object;
      if (this.currentModel === 'designer') {
        while (obj && !obj.userData.isDesignerItem && obj.parent) obj = obj.parent;
        if (obj && obj.userData.isDesignerItem) {
          this.selectDesignerObject(obj);
          soundFx.click();
        }
        return;
      }

      while (obj && !obj.userData.info && obj.parent) obj = obj.parent;
      if (obj && obj.userData.info) {
        this._highlight(obj);
        soundFx.click();
        this.onPartSelected(obj.userData.info);
      }
    }
  }

  _highlight(target) {
    if (this.selectedMesh && this.selectedMesh.material && this.selectedMesh.material.emissive) {
      this.selectedMesh.material.emissiveIntensity = this.selectedMesh.userData.baseEmissive ?? 0.25;
    }
    const mesh = target.isMesh ? target : target.children.find((c) => c.isMesh);
    if (mesh && mesh.material && mesh.material.emissive) {
      this.selectedMesh = mesh;
      mesh.material.emissiveIntensity = 1.15;
    }
  }

  _clearContent() {
    while (this.contentGroup.children.length > 0) {
      this.contentGroup.remove(this.contentGroup.children[0]);
    }
    if (this.selectionBox) {
      this.rootGroup.remove(this.selectionBox);
      this.selectionBox = null;
    }
    this.interactables = [];
    this.animatedParts = [];
    this.explodeItems = [];
    this.designerObjects = [];
    this.selectedMesh = null;
    this.selectedDesignerObj = null;
  }

  _registerPart(obj, info, explodeOffset = [0, 0, 0]) {
    obj.userData.info = info;
    obj.userData.basePos = obj.position.clone();
    obj.userData.explodeOffset = new THREE.Vector3(...explodeOffset);
    this.contentGroup.add(obj);
    this.interactables.push(obj);
    this.explodeItems.push(obj);
    return obj;
  }

  loadModel(name) {
    this.currentModel = name;
    this.exploded = false;
    this.explodeProgress = 0;
    this._clearContent();

    if (name === 'designer') {
      this.autoRotate = false;
      this.loadDesignerPreset('workstation', true);
      this.onPartSelected({
        name: 'Simulador de Diseño 3D (CAD)',
        tag: 'Estudio Creativo · Tinkercad Style',
        color: '#00B4F0',
        desc: 'Agregá formas 3D, seleccionalas con clic y modificá su color, material, posición, escala y rotación en tiempo real. ¡También podés proyectar tu diseño en Realidad Aumentada!'
      });
    } else if (name === 'hardware') {
      this.autoRotate = true;
      this._buildHardwarePC();
      this.onPartSelected({
        name: 'PC de Escritorio 3D (Hardware)',
        tag: 'Tocá cualquier pieza',
        color: '#00B4F0',
        desc: 'Hacé clic sobre la CPU, RAM, SSD, Placa Madre, GPU o Fuente para descubrir qué hace cada componente. Activá «Desarmar (Vista Explotada)» para ver el interior separado.'
      });
    } else if (name === 'system') {
      this.autoRotate = true;
      this._buildSystemFlow();
      this.onPartSelected({
        name: 'Ciclo de un Sistema Informático',
        tag: 'Entrada → Proceso → Salida',
        color: '#10B981',
        desc: 'Observá cómo los paquetes de DATOS viajan en tiempo real desde la Entrada, se transforman en la CPU y salen convertidos en INFORMACIÓN útil.'
      });
    } else if (name === 'google') {
      this.autoRotate = true;
      this._buildGoogleCloud();
      this.onPartSelected({
        name: 'Ecosistema Google Workspace 3D',
        tag: 'Nube Sincronizada',
        color: '#4285F4',
        desc: 'Tu Cuenta de Google conecta en tiempo real a Drive, Documentos, Hojas de Cálculo y Presentaciones. Hacé clic en cada satélite orbital.'
      });
    }

    this._emitDesignerState();
  }

  // =========================================================================
  // SIMULADOR DE DISEÑO 3D (CAD INTERACTIVO)
  // =========================================================================
  _makeDesignerMaterial(colorHex, style = 'standard') {
    const color = new THREE.Color(colorHex);
    if (style === 'metal') {
      return new THREE.MeshStandardMaterial({
        color,
        metalness: 0.85,
        roughness: 0.18,
        emissive: color,
        emissiveIntensity: 0.12,
        wireframe: this.globalWireframe
      });
    }
    if (style === 'glass') {
      return new THREE.MeshPhysicalMaterial({
        color,
        transparent: true,
        opacity: 0.48,
        roughness: 0.1,
        metalness: 0.15,
        emissive: color,
        emissiveIntensity: 0.25,
        wireframe: this.globalWireframe
      });
    }
    if (style === 'wireframe') {
      return new THREE.MeshBasicMaterial({ color, wireframe: true });
    }
    return new THREE.MeshStandardMaterial({
      color,
      roughness: 0.42,
      metalness: 0.22,
      emissive: color,
      emissiveIntensity: 0.15,
      wireframe: this.globalWireframe
    });
  }

  addPrimitive(type, opts = {}) {
    if (this.currentModel !== 'designer') {
      this.loadModel('designer');
    }

    let geo;
    let label = 'Objeto';
    switch (type) {
      case 'sphere':
        geo = new THREE.SphereGeometry(0.62, 28, 20);
        label = 'Esfera';
        break;
      case 'cylinder':
        geo = new THREE.CylinderGeometry(0.48, 0.48, 1.15, 24);
        label = 'Cilindro';
        break;
      case 'cone':
        geo = new THREE.ConeGeometry(0.62, 1.2, 4);
        label = 'Pirámide';
        break;
      case 'torus':
        geo = new THREE.TorusGeometry(0.55, 0.18, 16, 40);
        label = 'Anillo 3D';
        break;
      case 'octahedron':
        geo = new THREE.OctahedronGeometry(0.66, 0);
        label = 'Cristal';
        break;
      case 'plate':
        geo = new THREE.BoxGeometry(2.2, 0.18, 1.5);
        label = 'Base / Placa';
        break;
      case 'box':
      default:
        geo = new THREE.BoxGeometry(1.0, 1.0, 1.0);
        label = 'Cubo';
        type = 'box';
        break;
    }

    const palette = ['#00B4F0', '#F5C518', '#10B981', '#A855F7', '#F97316', '#EF4444', '#38BDF8'];
    const colorHex = opts.color || palette[(this.shapeCounter - 1) % palette.length];
    const materialStyle = opts.materialStyle || 'standard';

    const mesh = new THREE.Mesh(geo, this._makeDesignerMaterial(colorHex, materialStyle));
    const spread = (this.designerObjects.length % 5 - 2) * 0.65;
    mesh.position.set(
      opts.x ?? Number(spread.toFixed(2)),
      opts.y ?? -0.95,
      opts.z ?? Number(((Math.floor(this.designerObjects.length / 5) % 3) - 1) * 0.7)
    );
    if (opts.scale) mesh.scale.setScalar(opts.scale);
    if (opts.sx || opts.sy || opts.sz) {
      mesh.scale.set(opts.sx ?? 1, opts.sy ?? 1, opts.sz ?? 1);
    }
    if (opts.rotY) mesh.rotation.y = (opts.rotY * Math.PI) / 180;

    mesh.userData = {
      isDesignerItem: true,
      id: `obj-${Date.now()}-${this.shapeCounter}`,
      name: opts.name || `${label} #${this.shapeCounter}`,
      shapeType: type,
      color: colorHex,
      materialStyle
    };
    this.shapeCounter++;

    this.contentGroup.add(mesh);
    this.designerObjects.push(mesh);
    this.selectDesignerObject(mesh);
    if (!opts.silent) soundFx.click();
    return mesh;
  }

  selectDesignerObject(mesh) {
    this.selectedDesignerObj = mesh;
    if (this.selectionBox) {
      this.rootGroup.remove(this.selectionBox);
      this.selectionBox = null;
    }
    if (mesh) {
      this.selectionBox = new THREE.BoxHelper(mesh, 0xf5c518);
      this.rootGroup.add(this.selectionBox);
      this.onPartSelected({
        name: mesh.userData.name,
        tag: `Objeto CAD · ${mesh.userData.shapeType.toUpperCase()}`,
        color: mesh.userData.color,
        desc: `Seleccionado en el Simulador 3D. Ajustá color, material, posición (X/Y/Z), escala y rotación desde el panel de propiedades.`
      });
    }
    this._emitDesignerState();
  }

  updateSelectedDesigner(props = {}) {
    const obj = this.selectedDesignerObj;
    if (!obj) return;

    if (typeof props.x === 'number') obj.position.x = props.x;
    if (typeof props.y === 'number') obj.position.y = props.y;
    if (typeof props.z === 'number') obj.position.z = props.z;
    if (typeof props.scale === 'number') obj.scale.setScalar(props.scale);
    if (typeof props.rotY === 'number') obj.rotation.y = (props.rotY * Math.PI) / 180;
    if (typeof props.color === 'string') {
      obj.userData.color = props.color;
      obj.material = this._makeDesignerMaterial(obj.userData.color, obj.userData.materialStyle);
    }
    if (typeof props.materialStyle === 'string') {
      obj.userData.materialStyle = props.materialStyle;
      obj.material = this._makeDesignerMaterial(obj.userData.color, obj.userData.materialStyle);
    }

    if (this.selectionBox) this.selectionBox.update();
    this._emitDesignerState();
  }

  duplicateSelected() {
    const obj = this.selectedDesignerObj;
    if (!obj || this.currentModel !== 'designer') return;
    this.addPrimitive(obj.userData.shapeType, {
      color: obj.userData.color,
      materialStyle: obj.userData.materialStyle,
      x: Number((obj.position.x + 0.9).toFixed(2)),
      y: Number(obj.position.y.toFixed(2)),
      z: Number((obj.position.z + 0.4).toFixed(2)),
      sx: obj.scale.x,
      sy: obj.scale.y,
      sz: obj.scale.z,
      rotY: Math.round((obj.rotation.y * 180) / Math.PI)
    });
  }

  deleteSelected() {
    const obj = this.selectedDesignerObj;
    if (!obj || this.currentModel !== 'designer') return;
    this.contentGroup.remove(obj);
    this.designerObjects = this.designerObjects.filter((o) => o !== obj);
    const next = this.designerObjects[this.designerObjects.length - 1] || null;
    this.selectDesignerObject(next);
    soundFx.click();
  }

  clearDesignerScene() {
    if (this.currentModel !== 'designer') this.loadModel('designer');
    this._clearContent();
    this.shapeCounter = 1;
    this._emitDesignerState();
    soundFx.whoosh();
  }

  loadDesignerPreset(preset, silent = false) {
    if (this.currentModel !== 'designer') this.currentModel = 'designer';
    this._clearContent();
    this.shapeCounter = 1;

    if (preset === 'workstation') {
      this.addPrimitive('plate', { name: 'Escritorio Aula', color: '#334155', materialStyle: 'standard', x: 0, y: -1.45, z: 0, sx: 2.2, sy: 1, sz: 1.6, silent: true });
      this.addPrimitive('box', { name: 'Gabinete PC', color: '#00B4F0', materialStyle: 'metal', x: -1.55, y: -0.75, z: -0.1, sx: 0.65, sy: 1.25, sz: 1.0, silent: true });
      this.addPrimitive('box', { name: 'Monitor LED', color: '#38BDF8', materialStyle: 'glass', x: 0.25, y: -0.45, z: -0.35, sx: 1.8, sy: 1.05, sz: 0.14, silent: true });
      this.addPrimitive('cylinder', { name: 'Base Monitor', color: '#F5C518', materialStyle: 'metal', x: 0.25, y: -1.15, z: -0.35, sx: 0.35, sy: 0.42, sz: 0.35, silent: true });
      this.addPrimitive('plate', { name: 'Teclado', color: '#10B981', materialStyle: 'standard', x: 0.25, y: -1.32, z: 0.55, sx: 0.65, sy: 0.45, sz: 0.32, silent: true });
    } else if (preset === 'satellite') {
      this.addPrimitive('octahedron', { name: 'Núcleo Red DFA', color: '#F5C518', materialStyle: 'metal', x: 0, y: -0.2, z: 0, scale: 1.15, silent: true });
      this.addPrimitive('torus', { name: 'Órbita Wi-Fi', color: '#00B4F0', materialStyle: 'glass', x: 0, y: -0.2, z: 0, scale: 2.1, silent: true });
      this.addPrimitive('plate', { name: 'Panel Solar Izq.', color: '#4285F4', materialStyle: 'metal', x: -1.85, y: -0.2, z: 0, sx: 0.72, sy: 0.5, sz: 0.55, silent: true });
      this.addPrimitive('plate', { name: 'Panel Solar Der.', color: '#4285F4', materialStyle: 'metal', x: 1.85, y: -0.2, z: 0, sx: 0.72, sy: 0.5, sz: 0.55, silent: true });
      this.addPrimitive('cone', { name: 'Antena Satelital', color: '#10B981', materialStyle: 'standard', x: 0, y: 0.85, z: 0, scale: 0.85, silent: true });
    }
    if (!silent) soundFx.whoosh();
    this._emitDesignerState();
  }

  toggleGlobalWireframe() {
    this.globalWireframe = !this.globalWireframe;
    this.contentGroup.traverse((child) => {
      if (child.isMesh && child.material && 'wireframe' in child.material) {
        if (child.userData?.materialStyle !== 'wireframe') {
          child.material.wireframe = this.globalWireframe;
        }
      }
    });
    soundFx.click();
    return this.globalWireframe;
  }

  exportDesignerJson() {
    const items = this.designerObjects.map((o) => ({
      name: o.userData.name,
      shapeType: o.userData.shapeType,
      color: o.userData.color,
      materialStyle: o.userData.materialStyle,
      position: { x: Number(o.position.x.toFixed(2)), y: Number(o.position.y.toFixed(2)), z: Number(o.position.z.toFixed(2)) },
      scale: { x: Number(o.scale.x.toFixed(2)), y: Number(o.scale.y.toFixed(2)), z: Number(o.scale.z.toFixed(2)) },
      rotY: Math.round((o.rotation.y * 180) / Math.PI)
    }));
    const payload = {
      app: 'Simulador Diseño 3D · Capacitación DFA',
      exportedAt: new Date().toISOString(),
      objectCount: items.length,
      objects: items
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `diseno_3d_dfa_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    soundFx.correct();
  }

  _emitDesignerState() {
    const obj = this.selectedDesignerObj;
    this.onDesignerStateChange({
      isDesignerMode: this.currentModel === 'designer',
      count: this.designerObjects.length,
      selected: obj
        ? {
            name: obj.userData.name,
            shapeType: obj.userData.shapeType,
            color: obj.userData.color,
            materialStyle: obj.userData.materialStyle,
            x: Number(obj.position.x.toFixed(2)),
            y: Number(obj.position.y.toFixed(2)),
            z: Number(obj.position.z.toFixed(2)),
            scale: Number(obj.scale.x.toFixed(2)),
            rotY: Math.round(((obj.rotation.y * 180) / Math.PI + 360) % 360)
          }
        : null
    });
  }

  // =========================================================================
  // MODELOS EDUCATIVOS 3D PREARMADOS
  // =========================================================================
  _buildHardwarePC() {
    const caseGeo = new THREE.BoxGeometry(3.2, 3.6, 2.0);
    const caseWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(caseGeo),
      new THREE.LineBasicMaterial({ color: 0x00b4f0, transparent: true, opacity: 0.75 })
    );
    const caseGlass = new THREE.Mesh(
      caseGeo,
      new THREE.MeshPhysicalMaterial({ color: 0x0f172a, transparent: true, opacity: 0.16, roughness: 0.15, metalness: 0.2 })
    );
    const chassis = new THREE.Group();
    chassis.add(caseGlass, caseWire);
    this._registerPart(chassis, {
      name: 'Gabinete / Chasis',
      tag: 'Hardware · Estructura',
      color: '#38BDF8',
      desc: 'Protege los componentes internos del polvo, golpes y organiza la ventilación del equipo.'
    }, [0, 0, -1.2]);

    const mobo = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 2.9, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x112a24, emissive: 0x0e6b38, emissiveIntensity: 0.28, roughness: 0.4, metalness: 0.4 })
    );
    mobo.position.set(0, 0.1, -0.55);
    mobo.userData.baseEmissive = 0.28;
    mobo.add(new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 2.8, 0.14)),
      new THREE.LineBasicMaterial({ color: 0xf5c518, transparent: true, opacity: 0.5 })
    ));
    this._registerPart(mobo, {
      name: 'Placa Madre (Motherboard)',
      tag: 'Hardware Interno · Conexión',
      color: '#10B981',
      desc: 'Es la «autopista» electrónica donde se conectan la CPU, la memoria RAM, el disco y todos los periféricos.'
    }, [0, 0, -0.9]);

    const cpuGroup = new THREE.Group();
    cpuGroup.position.set(-0.35, 0.75, -0.32);
    const cpuChip = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.75, 0.22),
      new THREE.MeshStandardMaterial({ color: 0x0ea5e9, emissive: 0x00b4f0, emissiveIntensity: 0.55, metalness: 0.7, roughness: 0.2 })
    );
    cpuChip.userData.baseEmissive = 0.55;
    const fan = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.05, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xf5c518, emissive: 0xf5c518, emissiveIntensity: 0.6 })
    );
    fan.position.z = 0.16;
    const spinner = new THREE.Group();
    spinner.position.z = 0.16;
    spinner.add(
      new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0xe0f2fe })),
      new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.04), new THREE.MeshBasicMaterial({ color: 0xe0f2fe }))
    );
    cpuGroup.add(cpuChip, fan, spinner);
    this.animatedParts.push({ obj: spinner, type: 'spinZ', speed: 0.12 });
    this._registerPart(cpuGroup, {
      name: 'Procesador (CPU)',
      tag: 'Hardware Interno · Cerebro',
      color: '#00B4F0',
      desc: 'Unidad Central de Procesamiento. Ejecuta millones de cálculos e instrucciones por segundo.'
    }, [-1.2, 0.9, 1.3]);

    const ramGroup = new THREE.Group();
    ramGroup.position.set(0.68, 0.75, -0.25);
    for (let i = 0; i < 2; i++) {
      const stick = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 1.05, 0.34),
        new THREE.MeshStandardMaterial({
          color: i === 0 ? 0xf5c518 : 0x38bdf8,
          emissive: i === 0 ? 0xf5c518 : 0x00b4f0,
          emissiveIntensity: 0.4,
          metalness: 0.5,
          roughness: 0.3
        })
      );
      stick.position.x = i * 0.24;
      stick.userData.baseEmissive = 0.4;
      ramGroup.add(stick);
    }
    this._registerPart(ramGroup, {
      name: 'Memoria RAM',
      tag: 'Hardware Interno · Memoria Rápida',
      color: '#F5C518',
      desc: 'La «mesa de trabajo» temporal donde viven los programas abiertos en este momento.'
    }, [1.4, 0.85, 1.1]);

    const ssd = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.28, 0.12),
      new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x9333ea, emissiveIntensity: 0.45, metalness: 0.6, roughness: 0.25 })
    );
    ssd.position.set(-0.25, -0.05, -0.4);
    ssd.userData.baseEmissive = 0.45;
    this._registerPart(ssd, {
      name: 'Almacenamiento (Disco SSD)',
      tag: 'Hardware Interno · Permanente',
      color: '#A855F7',
      desc: 'Guarda el sistema operativo, programas y documentos de forma permanente.'
    }, [-1.4, -0.1, 1.25]);

    const gpu = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 0.36, 0.82),
      new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xea580c, emissiveIntensity: 0.35, metalness: 0.65, roughness: 0.3 })
    );
    gpu.position.set(0.05, -0.58, 0.02);
    gpu.userData.baseEmissive = 0.35;
    this._registerPart(gpu, {
      name: 'Placa de Video (GPU)',
      tag: 'Hardware Interno · Gráficos 3D',
      color: '#F97316',
      desc: 'Procesa gráficos 3D, videos y simulaciones visuales en tiempo real.'
    }, [1.2, -0.65, 1.45]);

    const psu = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.62, 1.05),
      new THREE.MeshStandardMaterial({ color: 0x334155, emissive: 0xef4444, emissiveIntensity: 0.22, metalness: 0.7, roughness: 0.35 })
    );
    psu.position.set(-0.55, -1.25, -0.1);
    psu.userData.baseEmissive = 0.22;
    this._registerPart(psu, {
      name: 'Fuente de Alimentación (PSU)',
      tag: 'Hardware Interno · Energía',
      color: '#EF4444',
      desc: 'Entrega energía eléctrica segura y regulada a todos los componentes de la PC.'
    }, [-1.1, -1.2, 0.6]);

    const monGroup = new THREE.Group();
    monGroup.position.set(2.55, 0.45, 0.15);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.92, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x0284c7, emissive: 0x00b4f0, emissiveIntensity: 0.55, roughness: 0.1 })
    );
    screen.userData.baseEmissive = 0.55;
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.25, 0.45, 12), new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 }));
    stand.position.y = -0.65;
    monGroup.add(screen, stand);
    this.animatedParts.push({ obj: monGroup, type: 'float', baseY: 0.45, phase: 0.5 });
    this._registerPart(monGroup, {
      name: 'Monitor (Periférico de Salida)',
      tag: 'Hardware Externo · Salida',
      color: '#00B4F0',
      desc: 'Muestra visualmente la información procesada al usuario.'
    }, [1.2, 0.4, 0.3]);

    const kb = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.1, 0.52),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, emissive: 0x10b981, emissiveIntensity: 0.35, metalness: 0.5 })
    );
    kb.position.set(-2.45, -0.55, 0.45);
    kb.rotation.x = 0.25;
    kb.userData.baseEmissive = 0.35;
    this.animatedParts.push({ obj: kb, type: 'float', baseY: -0.55, phase: 2.1 });
    this._registerPart(kb, {
      name: 'Teclado (Periférico de Entrada)',
      tag: 'Hardware Externo · Entrada',
      color: '#10B981',
      desc: 'Permite ingresar datos, letras y comandos al sistema informático.'
    }, [-1.1, -0.35, 0.5]);
  }

  _buildSystemFlow() {
    const inputNode = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 1.25, 1.25),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.45, metalness: 0.4 })
    );
    inputNode.position.set(-2.7, 0.1, 0);
    inputNode.userData.baseEmissive = 0.45;
    this.animatedParts.push({ obj: inputNode, type: 'spinY', speed: 0.01 });
    this._registerPart(inputNode, {
      name: '1. ENTRADA (Datos Crudos)',
      tag: 'Ciclo Informático',
      color: '#38BDF8',
      desc: 'El usuario ingresa datos mediante teclado, mouse, escáner o formulario.'
    }, [-0.9, 0.5, 0]);

    const procNode = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.05, 0),
      new THREE.MeshStandardMaterial({ color: 0xf5c518, emissive: 0xd97706, emissiveIntensity: 0.55, metalness: 0.6, roughness: 0.2 })
    );
    procNode.position.set(0, 0.25, 0);
    procNode.userData.baseEmissive = 0.55;
    procNode.add(new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.04, 12, 48), new THREE.MeshBasicMaterial({ color: 0xf5c518 })));
    this.animatedParts.push({ obj: procNode, type: 'spinAll', speed: 0.014 });
    this._registerPart(procNode, {
      name: '2. PROCESAMIENTO (CPU + Software)',
      tag: 'Ciclo Informático',
      color: '#F5C518',
      desc: 'El procesador aplica las reglas del software para transformar datos en información.'
    }, [0, 1.0, 0.6]);

    const outNode = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.95, 0),
      new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.5, metalness: 0.5 })
    );
    outNode.position.set(2.7, 0.1, 0);
    outNode.userData.baseEmissive = 0.5;
    this.animatedParts.push({ obj: outNode, type: 'spinY', speed: -0.015 });
    this._registerPart(outNode, {
      name: '3. SALIDA (Información Útil)',
      tag: 'Ciclo Informático',
      color: '#10B981',
      desc: 'El resultado se presenta en pantalla, PDF, gráfico o documento impreso.'
    }, [0.9, 0.5, 0]);

    const storeNode = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.9, 24),
      new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x7e22ce, emissiveIntensity: 0.45, metalness: 0.5 })
    );
    storeNode.position.set(0, -1.1, 0.35);
    storeNode.userData.baseEmissive = 0.45;
    this._registerPart(storeNode, {
      name: '4. ALMACENAMIENTO (SSD / Google Drive)',
      tag: 'Ciclo Informático',
      color: '#A855F7',
      desc: 'Resguarda datos e informes en disco local o en la nube.'
    }, [0, -0.7, 0.9]);

    for (let i = 0; i < 6; i++) {
      const packet = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x00b4f0 : 0x10b981 })
      );
      this.contentGroup.add(packet);
      this.animatedParts.push({ obj: packet, type: 'flow', offset: i / 6 });
    }
  }

  _buildGoogleCloud() {
    const driveCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.15, 1),
      new THREE.MeshStandardMaterial({ color: 0x34a853, emissive: 0x0f9d58, emissiveIntensity: 0.48, metalness: 0.45, roughness: 0.2 })
    );
    driveCore.userData.baseEmissive = 0.48;
    const coreRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.35, 0.03, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 })
    );
    coreRing.rotation.x = Math.PI / 2;
    this.contentGroup.add(coreRing);
    this.animatedParts.push({ obj: driveCore, type: 'spinY', speed: 0.01 });
    this._registerPart(driveCore, {
      name: 'Google Drive (Núcleo en la Nube)',
      tag: '15 GB Gratuitos',
      color: '#34A853',
      desc: 'Repositorio central donde viven tus carpetas y archivos sincronizados.'
    }, [0, 0.6, 0]);

    const satellites = [
      { name: 'Documentos de Google (Docs)', tag: 'Ofimática · Textos', color: '#4285F4', hex: 0x4285f4, angle: 0, desc: 'Procesador de textos en la nube para notas, actas e informes.' },
      { name: 'Hojas de Cálculo (Sheets)', tag: 'Ofimática · Planillas', color: '#0F9D58', hex: 0x0f9d58, angle: Math.PI * 0.5, desc: 'Planillas electrónicas con fórmulas =SUMA() y =PROMEDIO().' },
      { name: 'Presentaciones (Slides)', tag: 'Ofimática · Diapositivas', color: '#FBBC05', hex: 0xfbbc05, angle: Math.PI, desc: 'Diapositivas profesionales con transiciones para exponer en clase.' },
      { name: 'Seguridad de Cuenta Google', tag: 'Privacidad', color: '#EA4335', hex: 0xea4335, angle: Math.PI * 1.5, desc: 'Cerrá sesión siempre en equipos compartidos del laboratorio.' }
    ];

    satellites.forEach((sat, idx) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.82, 0.82),
        new THREE.MeshStandardMaterial({ color: sat.hex, emissive: sat.hex, emissiveIntensity: 0.45, metalness: 0.4, roughness: 0.25 })
      );
      mesh.userData.baseEmissive = 0.45;
      const r = 2.4;
      mesh.position.set(Math.cos(sat.angle) * r, idx % 2 === 0 ? 0.35 : -0.35, Math.sin(sat.angle) * r);
      this.animatedParts.push({ obj: mesh, type: 'orbit', radius: r, angle: sat.angle, yBase: mesh.position.y });
      this._registerPart(mesh, { name: sat.name, tag: sat.tag, color: sat.color, desc: sat.desc }, [Math.cos(sat.angle) * 1.2, 0.6, Math.sin(sat.angle) * 1.2]);
    });
  }

  toggleExplode() {
    this.exploded = !this.exploded;
    soundFx.whoosh();
    return this.exploded;
  }

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    return this.autoRotate;
  }

  setScale(scale) {
    this.modelScale = scale;
    this.rootGroup.scale.setScalar(scale);
  }

  setARMode(enabled) {
    this.arTransparent = enabled;
    this.cadGrid.material.opacity = enabled ? 0.22 : 0.55;
  }

  resetView() {
    this.targetRotY = 0.55;
    this.targetRotX = 0.34;
    this.targetZoom = 8.2;
    this.setScale(1.0);
    if (this.exploded) this.toggleExplode();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth || 640;
    const h = parent.clientHeight || 480;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    const t = performance.now() * 0.001;

    if (this.autoRotate && !this.isDragging) {
      this.targetRotY += 0.0045;
    }

    this.rotY += (this.targetRotY - this.rotY) * 0.1;
    this.rotX += (this.targetRotX - this.rotX) * 0.1;
    this.zoom += (this.targetZoom - this.zoom) * 0.1;

    this.rootGroup.rotation.y = this.rotY;
    this.rootGroup.rotation.x = this.rotX;
    this.camera.position.z = this.zoom;

    if (this.selectionBox) this.selectionBox.update();

    const targetExplode = this.exploded ? 1 : 0;
    this.explodeProgress += (targetExplode - this.explodeProgress) * 0.09;

    this.explodeItems.forEach((item) => {
      if (item.userData.basePos && item.userData.explodeOffset) {
        const isOrbit = this.animatedParts.some((a) => a.obj === item && a.type === 'orbit');
        if (!isOrbit) {
          item.position.lerpVectors(
            item.userData.basePos,
            item.userData.basePos.clone().add(item.userData.explodeOffset),
            this.explodeProgress
          );
        }
      }
    });

    this.animatedParts.forEach((a) => {
      if (a.type === 'spinZ') a.obj.rotation.z += a.speed;
      if (a.type === 'spinY') a.obj.rotation.y += a.speed;
      if (a.type === 'spinAll') {
        a.obj.rotation.x += a.speed;
        a.obj.rotation.y += a.speed * 1.2;
      }
      if (a.type === 'float' && !this.exploded) {
        a.obj.position.y = a.baseY + Math.sin(t * 2.0 + a.phase) * 0.14;
      }
      if (a.type === 'flow') {
        const p = (t * 0.38 + a.offset) % 1;
        a.obj.position.x = -2.6 + p * 5.2;
        a.obj.position.y = Math.sin(p * Math.PI) * 0.55;
        a.obj.rotation.x = t * 2;
        a.obj.rotation.y = t * 2;
      }
      if (a.type === 'orbit') {
        const r = a.radius + this.explodeProgress * 1.05;
        const ang = a.angle + t * 0.42;
        a.obj.position.set(Math.cos(ang) * r, a.yBase + Math.sin(t * 1.8 + a.angle) * 0.18, Math.sin(ang) * r);
        a.obj.rotation.y += 0.015;
      }
    });

    this.renderer.render(this.scene, this.camera);
  }
}
