import { soundFx } from './soundFx.js';

/**
 * Controlador de Realidad Aumentada (AR) con Cámara WebRTC + Modo Simulado de Aula
 * Proyecta los modelos 3D holográficos sobre el entorno real y permite capturar fotos AR
 */
export class ARStudioController {
  constructor(studio3D, elements) {
    this.studio3D = studio3D;
    this.el = elements;
    this.stream = null;
    this.arActive = false;
    this.simulatedAR = false;
  }

  async toggleCameraAR() {
    if (this.arActive && !this.simulatedAR) {
      this.stopAR();
      return;
    }
    this.stopAR();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      this.activateSimulatedAR('Este navegador no expone cámara WebRTC. Se activó el Modo AR Simulado de Aula.');
      return;
    }

    try {
      this.el.arStatus.textContent = 'Solicitando permiso de cámara...';
      // Intenta cámara trasera (celulares) y cae automáticamente a webcam en PC/notebook
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false
        });
      } catch (_) {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }

      this.el.video.srcObject = this.stream;
      await this.el.video.play();

      this.arActive = true;
      this.simulatedAR = false;
      this.el.stage.classList.add('ar-live');
      this.el.stage.classList.remove('ar-simulated');
      this.el.video.hidden = false;
      this.el.hudOverlay.hidden = false;
      this.studio3D.setARMode(true);
      this.el.btnCamera.innerHTML = '<span>⏹️</span> Desactivar Cámara AR';
      this.el.arStatus.textContent = 'AR Activo · Proyectando holograma 3D sobre tu cámara en vivo';
      soundFx.correct();
    } catch (err) {
      this.activateSimulatedAR('No se detectó cámara disponible o se denegó el permiso. Activamos Modo AR Simulado para que puedas probar igual.');
    }
  }

  activateSimulatedAR(message) {
    this.stopAR(true);
    this.arActive = true;
    this.simulatedAR = true;
    this.el.stage.classList.add('ar-live', 'ar-simulated');
    this.el.video.hidden = true;
    this.el.hudOverlay.hidden = false;
    this.studio3D.setARMode(true);
    this.el.btnCamera.innerHTML = '<span>📷</span> Probar Cámara Real';
    this.el.arStatus.textContent = message || 'Modo AR Simulado · Escritorio Holográfico DFA';
    soundFx.whoosh();
  }

  stopAR(silent = false) {
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    this.el.video.srcObject = null;
    this.el.video.hidden = true;
    this.el.hudOverlay.hidden = true;
    this.el.stage.classList.remove('ar-live', 'ar-simulated');
    this.arActive = false;
    this.simulatedAR = false;
    this.studio3D.setARMode(false);
    this.el.btnCamera.innerHTML = '<span>📷</span> Activar Cámara AR';
    if (!silent) {
      this.el.arStatus.textContent = 'Modo Laboratorio 3D · Arrastrá para rotar y hacé clic en cualquier componente';
    }
  }

  captureSnapshot() {
    const outCanvas = document.createElement('canvas');
    const w = this.studio3D.canvas.width || 1280;
    const h = this.studio3D.canvas.height || 720;
    outCanvas.width = w;
    outCanvas.height = h;
    const ctx = outCanvas.getContext('2d');

    if (this.arActive && !this.simulatedAR && this.el.video.readyState >= 2) {
      ctx.drawImage(this.el.video, 0, 0, w, h);
    } else {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, '#071124');
      grad.addColorStop(1, '#102542');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    // Superponer el render 3D WebGL
    ctx.drawImage(this.studio3D.canvas, 0, 0, w, h);

    // Marca de agua institucional DFA
    ctx.fillStyle = 'rgba(6, 11, 22, 0.72)';
    ctx.fillRect(18, h - 68, 520, 50);
    ctx.strokeStyle = '#00B4F0';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, h - 68, 520, 50);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('CAPACITACIÓN DFA «GRAL. ÁNGEL VICENTE PEÑALOZA» — AR 3D', 32, h - 46);
    ctx.fillStyle = '#F5C518';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('Tec. Sup. Guardia, Sebastián Nicolás · Sede Chilecito, La Rioja', 32, h - 27);

    const link = document.createElement('a');
    link.download = `captura_AR_DFA_${Date.now()}.png`;
    link.href = outCanvas.toDataURL('image/png');
    link.click();
    soundFx.correct();
  }
}
