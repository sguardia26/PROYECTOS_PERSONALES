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
    this.active = true;
    this._init();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.z = 42;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Estrellas institucionales (celeste, blanco, dorado)
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

    // Anillos orbitales holográficos
    const ringGeo1 = new THREE.TorusGeometry(22, 0.06, 12, 100);
    const ringMat1 = new THREE.MeshBasicMaterial({ color: 0x00b4f0, transparent: true, opacity: 0.16 });
    this.ring1 = new THREE.Mesh(ringGeo1, ringMat1);
    this.ring1.rotation.x = Math.PI * 0.36;
    this.scene.add(this.ring1);

    const ringGeo2 = new THREE.TorusGeometry(30, 0.05, 12, 120);
    const ringMat2 = new THREE.MeshBasicMaterial({ color: 0xf5c518, transparent: true, opacity: 0.12 });
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
 * Visor 3D Educativo Interactivo (y motor holográfico para Realidad Aumentada)
 */
export class InteractiveStudio3D {
  constructor(canvas, onPartSelected) {
    this.canvas = canvas;
    this.onPartSelected = onPartSelected || (() => {});
    this.currentModel = 'hardware';
    this.exploded = false;
    this.explodeProgress = 0;
    this.autoRotate = true;
    this.arTransparent = false;

    this.rotY = 0.45;
    this.rotX = 0.28;
    this.targetRotY = 0.45;
    this.targetRotX = 0.28;
    this.zoom = 7.4;
    this.targetZoom = 7.4;
    this.modelScale = 1.0;

    this.isDragging = false;
    this.dragMoved = false;
    this.prevPointer = { x: 0, y: 0 };

    this.interactables = [];
    this.animatedParts = [];
    this.explodeItems = [];
    this.selectedMesh = null;

    this._init();
  }

  _init() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 100);
    this.camera.position.set(0, 1.4, this.zoom);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true // Permite capturar foto AR
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;

    // Iluminación profesional de estudio
    const ambient = new THREE.AmbientLight(0xdbeafe, 0.85);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
    keyLight.position.set(6, 10, 8);
    this.scene.add(keyLight);

    const rimCyan = new THREE.PointLight(0x00b4f0, 2.2, 22);
    rimCyan.position.set(-5, 3, -4);
    this.scene.add(rimCyan);

    const rimGold = new THREE.PointLight(0xf5c518, 1.6, 20);
    rimGold.position.set(5, -2, 5);
    this.scene.add(rimGold);

    // Base holográfica sutil
    this.gridHelper = new THREE.PolarGridHelper(3.8, 12, 5, 48, 0x00b4f0, 0x1e3a5f);
    this.gridHelper.position.y = -2.05;
    this.gridHelper.material.transparent = true;
    this.gridHelper.material.opacity = 0.35;
    this.scene.add(this.gridHelper);

    this.rootGroup = new THREE.Group();
    this.scene.add(this.rootGroup);

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();

    this._bindControls();
    this.loadModel('hardware');
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
      this.targetRotX = Math.max(-0.85, Math.min(0.95, this.targetRotX + dy * 0.006));
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
      if (e.touches.length === 1) {
        onDown(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 1) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        onUp(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      }
    });

    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.targetZoom = Math.max(4.2, Math.min(12.5, this.targetZoom + e.deltaY * 0.004));
    }, { passive: false });
  }

  _pickObject(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.interactables, true);
    if (hits.length > 0) {
      let obj = hits[0].object;
      while (obj && !obj.userData.info && obj.parent) {
        obj = obj.parent;
      }
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

  _clearRoot() {
    while (this.rootGroup.children.length > 0) {
      this.rootGroup.remove(this.rootGroup.children[0]);
    }
    this.interactables = [];
    this.animatedParts = [];
    this.explodeItems = [];
    this.selectedMesh = null;
  }

  _registerPart(obj, info, explodeOffset = [0, 0, 0]) {
    obj.userData.info = info;
    obj.userData.basePos = obj.position.clone();
    obj.userData.explodeOffset = new THREE.Vector3(...explodeOffset);
    this.rootGroup.add(obj);
    this.interactables.push(obj);
    this.explodeItems.push(obj);
    return obj;
  }

  loadModel(name) {
    this.currentModel = name;
    this.exploded = false;
    this.explodeProgress = 0;
    this._clearRoot();

    if (name === 'hardware') {
      this._buildHardwarePC();
      this.onPartSelected({
        name: 'PC de Escritorio 3D (Hardware)',
        tag: 'Tocá cualquier pieza',
        color: '#00B4F0',
        desc: 'Hacé clic sobre la CPU, RAM, SSD, Placa Madre, GPU o Fuente para descubrir qué hace cada componente. Activá «Desarmar (Vista Explotada)» para ver el interior separado.'
      });
    } else if (name === 'system') {
      this._buildSystemFlow();
      this.onPartSelected({
        name: 'Ciclo de un Sistema Informático',
        tag: 'Entrada → Proceso → Salida',
        color: '#10B981',
        desc: 'Observá cómo los paquetes de DATOS viajan en tiempo real desde la Entrada, se transforman en la CPU y salen convertidos en INFORMACIÓN útil.'
      });
    } else if (name === 'google') {
      this._buildGoogleCloud();
      this.onPartSelected({
        name: 'Ecosistema Google Workspace 3D',
        tag: 'Nube Sincronizada',
        color: '#4285F4',
        desc: 'Tu Cuenta de Google conecta en tiempo real a Drive, Documentos, Hojas de Cálculo y Presentaciones. Hacé clic en cada satélite orbital.'
      });
    }
  }

  _buildHardwarePC() {
    // 1. Gabinete translúcido (Chasis)
    const caseGeo = new THREE.BoxGeometry(3.2, 3.6, 2.0);
    const caseEdges = new THREE.EdgesGeometry(caseGeo);
    const caseWire = new THREE.LineSegments(
      caseEdges,
      new THREE.LineBasicMaterial({ color: 0x00b4f0, transparent: true, opacity: 0.75 })
    );
    const caseGlass = new THREE.Mesh(
      caseGeo,
      new THREE.MeshPhysicalMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.16,
        roughness: 0.15,
        metalness: 0.2
      })
    );
    const chassis = new THREE.Group();
    chassis.add(caseGlass, caseWire);
    this._registerPart(chassis, {
      name: 'Gabinete / Chasis',
      tag: 'Hardware · Estructura',
      color: '#38BDF8',
      desc: 'Protege los componentes internos del polvo, golpes y organiza la ventilación del equipo.'
    }, [0, 0, -1.2]);

    // 2. Placa Madre (Motherboard)
    const moboMat = new THREE.MeshStandardMaterial({
      color: 0x112a24,
      emissive: 0x0e6b38,
      emissiveIntensity: 0.28,
      roughness: 0.4,
      metalness: 0.4
    });
    const mobo = new THREE.Mesh(new THREE.BoxGeometry(2.5, 2.9, 0.12), moboMat);
    mobo.position.set(0, 0.1, -0.55);
    mobo.userData.baseEmissive = 0.28;
    // Líneas de circuito doradas
    const trace = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(2.4, 2.8, 0.14)),
      new THREE.LineBasicMaterial({ color: 0xf5c518, transparent: true, opacity: 0.5 })
    );
    mobo.add(trace);
    this._registerPart(mobo, {
      name: 'Placa Madre (Motherboard)',
      tag: 'Hardware Interno · Conexión',
      color: '#10B981',
      desc: 'Es la «autopista» electrónica donde se conectan la CPU, la memoria RAM, el disco y todos los periféricos para comunicarse entre sí.'
    }, [0, 0, -0.9]);

    // 3. Procesador (CPU) + Disipador giratorio
    const cpuGroup = new THREE.Group();
    cpuGroup.position.set(-0.35, 0.75, -0.32);
    const cpuChip = new THREE.Mesh(
      new THREE.BoxGeometry(0.75, 0.75, 0.22),
      new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x00b4f0,
        emissiveIntensity: 0.55,
        metalness: 0.7,
        roughness: 0.2
      })
    );
    cpuChip.userData.baseEmissive = 0.55;
    const fan = new THREE.Mesh(
      new THREE.TorusGeometry(0.28, 0.05, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xf5c518, emissive: 0xf5c518, emissiveIntensity: 0.6 })
    );
    fan.position.z = 0.16;
    const blade1 = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.08, 0.04), new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));
    const blade2 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.48, 0.04), new THREE.MeshBasicMaterial({ color: 0xe0f2fe }));
    const spinner = new THREE.Group();
    spinner.position.z = 0.16;
    spinner.add(blade1, blade2);
    cpuGroup.add(cpuChip, fan, spinner);
    this.animatedParts.push({ obj: spinner, type: 'spinZ', speed: 0.12 });
    this._registerPart(cpuGroup, {
      name: 'Procesador (CPU)',
      tag: 'Hardware Interno · Cerebro',
      color: '#00B4F0',
      desc: 'Unidad Central de Procesamiento. Ejecuta millones de cálculos e instrucciones por segundo: es el «cerebro» del sistema informático.'
    }, [-1.2, 0.9, 1.3]);

    // 4. Memoria RAM (2 módulos paralelos)
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
      desc: 'Es la «mesa de trabajo» temporal: guarda los programas y pestañas abiertos ahora mismo para trabajar rápido. Al apagar la PC se vacía.'
    }, [1.4, 0.85, 1.1]);

    // 5. Disco Sólido (SSD NVMe)
    const ssd = new THREE.Mesh(
      new THREE.BoxGeometry(0.95, 0.28, 0.12),
      new THREE.MeshStandardMaterial({
        color: 0xa855f7,
        emissive: 0x9333ea,
        emissiveIntensity: 0.45,
        metalness: 0.6,
        roughness: 0.25
      })
    );
    ssd.position.set(-0.25, -0.05, -0.4);
    ssd.userData.baseEmissive = 0.45;
    this._registerPart(ssd, {
      name: 'Almacenamiento (Disco SSD)',
      tag: 'Hardware Interno · Permanente',
      color: '#A855F7',
      desc: 'El «archivero» permanente de tu computadora: guarda el sistema operativo, programas, fotos y documentos incluso cuando apagás el equipo.'
    }, [-1.4, -0.1, 1.25]);

    // 6. Placa de Video (GPU)
    const gpuGroup = new THREE.Group();
    gpuGroup.position.set(0.05, -0.58, 0.02);
    const gpuBody = new THREE.Mesh(
      new THREE.BoxGeometry(2.05, 0.36, 0.82),
      new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xea580c,
        emissiveIntensity: 0.35,
        metalness: 0.65,
        roughness: 0.3
      })
    );
    gpuBody.userData.baseEmissive = 0.35;
    gpuGroup.add(gpuBody);
    this._registerPart(gpuGroup, {
      name: 'Placa de Video (GPU)',
      tag: 'Hardware Interno · Gráficos 3D',
      color: '#F97316',
      desc: 'Procesa imágenes, videos, presentaciones fluidas y gráficos 3D como el modelo holográfico que estás rotando en este momento.'
    }, [1.2, -0.65, 1.45]);

    // 7. Fuente de Alimentación (PSU)
    const psu = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.62, 1.05),
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        emissive: 0xef4444,
        emissiveIntensity: 0.22,
        metalness: 0.7,
        roughness: 0.35
      })
    );
    psu.position.set(-0.55, -1.35, -0.1);
    psu.userData.baseEmissive = 0.22;
    this._registerPart(psu, {
      name: 'Fuente de Alimentación (PSU)',
      tag: 'Hardware Interno · Energía',
      color: '#EF4444',
      desc: 'Convierte la corriente eléctrica del enchufe en energía segura y estable para alimentar todos los circuitos de la computadora.'
    }, [-1.1, -1.3, 0.6]);

    // 8. Monitor periférico flotante (Salida)
    const monGroup = new THREE.Group();
    monGroup.position.set(2.55, 0.45, 0.15);
    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 0.92, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x00b4f0,
        emissiveIntensity: 0.55,
        roughness: 0.1
      })
    );
    screen.userData.baseEmissive = 0.55;
    const stand = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.25, 0.45, 12),
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.8 })
    );
    stand.position.y = -0.65;
    monGroup.add(screen, stand);
    this.animatedParts.push({ obj: monGroup, type: 'float', baseY: 0.45, phase: 0.5 });
    this._registerPart(monGroup, {
      name: 'Monitor (Periférico de Salida)',
      tag: 'Hardware Externo · Salida',
      color: '#00B4F0',
      desc: 'Muestra visualmente la información procesada. Junto con la impresora y los parlantes, forma parte de los periféricos de SALIDA.'
    }, [1.2, 0.4, 0.3]);

    // 9. Teclado periférico flotante (Entrada)
    const kb = new THREE.Mesh(
      new THREE.BoxGeometry(1.35, 0.1, 0.52),
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x10b981,
        emissiveIntensity: 0.35,
        metalness: 0.5
      })
    );
    kb.position.set(-2.45, -0.55, 0.45);
    kb.rotation.x = 0.25;
    kb.userData.baseEmissive = 0.35;
    this.animatedParts.push({ obj: kb, type: 'float', baseY: -0.55, phase: 2.1 });
    this._registerPart(kb, {
      name: 'Teclado (Periférico de Entrada)',
      tag: 'Hardware Externo · Entrada',
      color: '#10B981',
      desc: 'Permite ingresar datos, letras, números y comandos al sistema. El mouse, el micrófono y el escáner también son periféricos de ENTRADA.'
    }, [-1.1, -0.35, 0.5]);
  }

  _buildSystemFlow() {
    // 1. Entrada (Input)
    const inputNode = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 1.25, 1.25),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.45, metalness: 0.4 })
    );
    inputNode.position.set(-2.7, 0, 0);
    inputNode.userData.baseEmissive = 0.45;
    this.animatedParts.push({ obj: inputNode, type: 'spinY', speed: 0.01 });
    this._registerPart(inputNode, {
      name: '1. ENTRADA (Datos Crudos)',
      tag: 'Ciclo Informático',
      color: '#38BDF8',
      desc: 'El usuario ingresa datos mediante teclado, mouse, escáner o formulario (ej.: nombre del agente, asistencia, fecha).'
    }, [-0.9, 0.5, 0]);

    // 2. Proceso Central (CPU Icosaedro)
    const procNode = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.05, 0),
      new THREE.MeshStandardMaterial({ color: 0xf5c518, emissive: 0xd97706, emissiveIntensity: 0.55, wireframe: false, metalness: 0.6, roughness: 0.2 })
    );
    procNode.position.set(0, 0.2, 0);
    procNode.userData.baseEmissive = 0.55;
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(1.45, 0.04, 12, 48),
      new THREE.MeshBasicMaterial({ color: 0xf5c518 })
    );
    procNode.add(halo);
    this.animatedParts.push({ obj: procNode, type: 'spinAll', speed: 0.014 });
    this._registerPart(procNode, {
      name: '2. PROCESAMIENTO (CPU + Software)',
      tag: 'Ciclo Informático',
      color: '#F5C518',
      desc: 'El procesador aplica las reglas del software (fórmulas, ordenamiento, filtros) para transformar los datos crudos en información útil.'
    }, [0, 1.0, 0.6]);

    // 3. Salida (Output)
    const outNode = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.95, 0),
      new THREE.MeshStandardMaterial({ color: 0x10b981, emissive: 0x059669, emissiveIntensity: 0.5, metalness: 0.5 })
    );
    outNode.position.set(2.7, 0, 0);
    outNode.userData.baseEmissive = 0.5;
    this.animatedParts.push({ obj: outNode, type: 'spinY', speed: -0.015 });
    this._registerPart(outNode, {
      name: '3. SALIDA (Información con Sentido)',
      tag: 'Ciclo Informático',
      color: '#10B981',
      desc: 'El resultado se presenta al usuario en pantalla, PDF, gráfico o documento impreso listo para tomar decisiones.'
    }, [0.9, 0.5, 0]);

    // 4. Almacenamiento / Nube abajo
    const storeNode = new THREE.Mesh(
      new THREE.CylinderGeometry(0.85, 0.85, 0.9, 24),
      new THREE.MeshStandardMaterial({ color: 0xa855f7, emissive: 0x7e22ce, emissiveIntensity: 0.45, metalness: 0.5 })
    );
    storeNode.position.set(0, -1.65, 0.35);
    storeNode.userData.baseEmissive = 0.45;
    this._registerPart(storeNode, {
      name: '4. ALMACENAMIENTO (SSD / Google Drive)',
      tag: 'Ciclo Informático',
      color: '#A855F7',
      desc: 'Resguarda tanto los datos originales como los informes finales de forma segura en disco local o en la nube.'
    }, [0, -0.9, 0.9]);

    // Partículas de datos viajando entre Entrada → Proceso → Salida
    for (let i = 0; i < 6; i++) {
      const packet = new THREE.Mesh(
        new THREE.BoxGeometry(0.22, 0.22, 0.22),
        new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0x00b4f0 : 0x10b981 })
      );
      this.rootGroup.add(packet);
      this.animatedParts.push({ obj: packet, type: 'flow', offset: i / 6 });
    }
  }

  _buildGoogleCloud() {
    // Núcleo central: Google Drive
    const driveCore = new THREE.Mesh(
      new THREE.OctahedronGeometry(1.15, 1),
      new THREE.MeshStandardMaterial({
        color: 0x34a853,
        emissive: 0x0f9d58,
        emissiveIntensity: 0.48,
        metalness: 0.45,
        roughness: 0.2
      })
    );
    driveCore.userData.baseEmissive = 0.48;
    const coreRing = new THREE.Mesh(
      new THREE.TorusGeometry(2.35, 0.03, 12, 64),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.5 })
    );
    coreRing.rotation.x = Math.PI / 2;
    this.rootGroup.add(coreRing);
    this.animatedParts.push({ obj: driveCore, type: 'spinY', speed: 0.01 });
    this._registerPart(driveCore, {
      name: 'Google Drive (Núcleo en la Nube)',
      tag: '15 GB Gratuitos',
      color: '#34A853',
      desc: 'Repositorio central donde viven tus carpetas y archivos sincronizados. Podés compartirlos como Lector, Comentarista o Editor.'
    }, [0, 0.6, 0]);

    // Satélites orbitales
    const satellites = [
      {
        name: 'Documentos de Google (Docs)',
        tag: 'Ofimática · Textos',
        color: '#4285F4',
        hex: 0x4285f4,
        angle: 0,
        desc: 'Procesador de textos en la nube ideal para redactar actas, notas, memorándums e informes con guardado automático.'
      },
      {
        name: 'Hojas de Cálculo (Sheets)',
        tag: 'Ofimática · Datos y Fórmulas',
        color: '#0F9D58',
        hex: 0x0f9d58,
        angle: Math.PI * 0.5,
        desc: 'Planillas electrónicas para controlar asistencias, inventarios y automatizar cálculos con =SUMA() y =PROMEDIO().'
      },
      {
        name: 'Presentaciones de Google (Slides)',
        tag: 'Ofimática · Exposiciones',
        color: '#FBBC05',
        hex: 0xfbbc05,
        angle: Math.PI,
        desc: 'Diseñá diapositivas profesionales con imágenes, títulos claros y transiciones para exponer en el aula.'
      },
      {
        name: 'Seguridad de Cuenta Google',
        tag: 'Acceso y Privacidad',
        color: '#EA4335',
        hex: 0xea4335,
        angle: Math.PI * 1.5,
        desc: 'Tu cuenta @gmail.com es la llave de todo. Usá contraseñas seguras y cerrá sesión siempre en equipos compartidos.'
      }
    ];

    satellites.forEach((sat, idx) => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.82, 0.82, 0.82),
        new THREE.MeshStandardMaterial({
          color: sat.hex,
          emissive: sat.hex,
          emissiveIntensity: 0.45,
          metalness: 0.4,
          roughness: 0.25
        })
      );
      mesh.userData.baseEmissive = 0.45;
      const r = 2.4;
      mesh.position.set(Math.cos(sat.angle) * r, (idx % 2 === 0 ? 0.35 : -0.35), Math.sin(sat.angle) * r);
      this.animatedParts.push({ obj: mesh, type: 'orbit', radius: r, angle: sat.angle, yBase: mesh.position.y });
      this._registerPart(mesh, {
        name: sat.name,
        tag: sat.tag,
        color: sat.color,
        desc: sat.desc
      }, [Math.cos(sat.angle) * 1.2, 0.6, Math.sin(sat.angle) * 1.2]);
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
    this.gridHelper.material.opacity = enabled ? 0.16 : 0.35;
  }

  resetView() {
    this.targetRotY = 0.45;
    this.targetRotX = 0.28;
    this.targetZoom = 7.4;
    this.setScale(1.0);
    if (this.exploded) this.toggleExplode();
  }

  resize() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const w = parent.clientWidth || 640;
    const h = parent.clientHeight || 420;
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

    // Transición suave de Vista Explotada
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

    // Animaciones individuales
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
