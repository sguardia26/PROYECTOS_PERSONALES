/* ==========================================================================
   PROJECTHUB - Centro Educativo Nonogasta (C.E.N.) - La Rioja
   Motor App-Shell (Estilo YouTube/Instagram), Sidebar Vinculado,
   Login Unificado (Detección de Rol) y Suite de Ciberseguridad
   ========================================================================== */

const STORAGE_KEY_PROJECTS = 'projecthub_cen_projects_v1';
const STORAGE_KEY_SESSION = 'projecthub_cen_session_v1';

/* ==========================================================================
   MÓDULO DE CIBERSEGURIDAD INSTITUCIONAL (C.E.N. SHIELD)
   ========================================================================== */
const Security = {
    csrfToken: '',
    sessionTimer: null,
    SESSION_TIMEOUT_MS: 30 * 60 * 1000, // 30 minutos de inactividad

    // 1. Sanitización Anti-XSS (HTML Entity Encoding estricto)
    escapeHTML(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;')
            .replace(/\//g, '&#x2F;');
    },

    // 2. Sanitizador de Enlaces Externos (Anti-Tabnabbing / Anti-Phishing)
    sanitizeURL(url) {
        if (!url || typeof url !== 'string') return '';
        const trimmed = url.trim();
        const forbiddenSchemes = /^(javascript|data|vbscript|file|blob):/i;
        if (forbiddenSchemes.test(trimmed)) return '';

        try {
            const parsed = new URL(trimmed);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                return parsed.href;
            }
        } catch (e) {
            return '';
        }
        return '';
    },

    // 3. Filtro Seguro de Archivos Adjuntos (Lista Blanca Estricta)
    validateUploadedFile(file) {
        if (!file) return { valid: true };

        const MAX_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
        const ALLOWED_EXTENSIONS = ['pdf', 'docx', 'zip', 'pptx'];
        const parts = file.name.split('.');
        const extension = parts.length > 1 ? parts.pop().toLowerCase() : '';

        const dangerousExtensions = ['php', 'phtml', 'exe', 'bat', 'cmd', 'sh', 'vbs', 'scr', 'js', 'html', 'htm'];
        for (const ext of parts) {
            if (dangerousExtensions.includes(ext.toLowerCase())) {
                return {
                    valid: false,
                    error: 'Alerta de Ciberseguridad: el archivo contiene extensiones ejecutables o scripts bloqueados.'
                };
            }
        }

        if (!ALLOWED_EXTENSIONS.includes(extension)) {
            return {
                valid: false,
                error: `Formato no permitido (.${extension}). Solo se autorizan .PDF, .DOCX, .ZIP, .PPTX.`
            };
        }

        if (file.size > MAX_SIZE_BYTES) {
            return {
                valid: false,
                error: 'El archivo supera el límite máximo permitido de 25 MB.'
            };
        }

        const sanitizedName = file.name
            .replace(/(\.\.[\/\\])+/g, '')
            .replace(/[^a-zA-Z0-9_\-\.]/g, '_');

        return { valid: true, sanitizedName };
    },

    // 4. Token Criptográfico Anti-CSRF
    generateCSRFToken() {
        const array = new Uint8Array(24);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(array);
            this.csrfToken = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
        } else {
            this.csrfToken = Math.random().toString(36).substring(2) + Date.now().toString(36);
        }

        const loginTokenInput = document.getElementById('csrfTokenLogin');
        if (loginTokenInput) loginTokenInput.value = this.csrfToken;

        const uploadTokenInput = document.getElementById('csrfTokenUpload');
        if (uploadTokenInput) uploadTokenInput.value = this.csrfToken;

        return this.csrfToken;
    },

    verifyCSRFToken(token) {
        return Boolean(token && this.csrfToken && token === this.csrfToken);
    },

    // 5. Mitigación Anti-Fuerza Bruta en el Login Unificado
    checkBruteForce() {
        const now = Date.now();
        const storedLock = parseInt(sessionStorage.getItem('cen_login_lockout') || '0', 10);
        if (storedLock && now < storedLock) {
            const remainingSecs = Math.ceil((storedLock - now) / 1000);
            this.showLockoutAlert(remainingSecs);
            return false;
        } else if (storedLock && now >= storedLock) {
            sessionStorage.removeItem('cen_login_lockout');
            sessionStorage.removeItem('cen_failed_attempts');
            this.hideLockoutAlert();
        }
        return true;
    },

    recordFailedLogin() {
        let attempts = parseInt(sessionStorage.getItem('cen_failed_attempts') || '0', 10) + 1;
        sessionStorage.setItem('cen_failed_attempts', attempts.toString());

        if (attempts >= 4) {
            const unlockAt = Date.now() + 60 * 1000;
            sessionStorage.setItem('cen_login_lockout', unlockAt.toString());
            this.showLockoutAlert(60);
            showToast('Bloqueo temporal activado por múltiples intentos fallidos.');
            return true;
        } else {
            showToast(`Contraseña demasiado corta o inválida. Intentos restantes: ${4 - attempts}`);
            return false;
        }
    },

    resetFailedLogins() {
        sessionStorage.removeItem('cen_failed_attempts');
        sessionStorage.removeItem('cen_login_lockout');
        this.hideLockoutAlert();
    },

    showLockoutAlert(seconds) {
        const box = document.getElementById('loginLockoutBox');
        const timerMsg = document.getElementById('lockoutTimerMsg');
        const submitBtn = document.getElementById('loginSubmitBtn');

        if (box) box.style.display = 'flex';
        if (submitBtn) submitBtn.disabled = true;

        let current = seconds;
        if (timerMsg) timerMsg.textContent = `Espera ${current}s antes de intentar nuevamente.`;

        if (this._lockoutInterval) clearInterval(this._lockoutInterval);
        this._lockoutInterval = setInterval(() => {
            current -= 1;
            if (current <= 0) {
                clearInterval(this._lockoutInterval);
                this.hideLockoutAlert();
            } else if (timerMsg) {
                timerMsg.textContent = `Espera ${current}s antes de intentar nuevamente.`;
            }
        }, 1000);
    },

    hideLockoutAlert() {
        const box = document.getElementById('loginLockoutBox');
        const submitBtn = document.getElementById('loginSubmitBtn');
        if (box) box.style.display = 'none';
        if (submitBtn) submitBtn.disabled = false;
        if (this._lockoutInterval) clearInterval(this._lockoutInterval);
    },

    // 6. Cierre Automático por Inactividad
    initSessionTimeout() {
        const resetTimer = () => {
            if (this.sessionTimer) clearTimeout(this.sessionTimer);
            if (currentSession) {
                this.sessionTimer = setTimeout(() => {
                    logoutSession();
                    showToast('Sesión cerrada automáticamente por inactividad.');
                }, this.SESSION_TIMEOUT_MS);
            }
        };

        window.addEventListener('mousemove', resetTimer, { passive: true });
        window.addEventListener('keydown', resetTimer, { passive: true });
        window.addEventListener('touchstart', resetTimer, { passive: true });
        resetTimer();
    }
};

/* ==========================================================================
   CATÁLOGO INICIAL DE PROYECTOS (5° AÑO C.E.N. NONOGASTA)
   ========================================================================== */
const initialProjects = [
    {
        id: 101,
        title: "AgroRed Nonogasta: Monitoreo de Riego y Gestión Agrícola",
        category: "IoT y Hardware",
        division: "5° Año 'A' - T.I.P.P.",
        authors: "Mercado Lucas, Ruíz Sofía, Ávila Lautaro",
        description: "Sistema automatizado con sensores de humedad de suelo y panel web en tiempo real para pequeños productores olivícolas y vitivinícolas de Nonogasta. Permite activar electroválvulas y visualizar alertas hídricas.",
        management: "Análisis de costos de producción agrícola local, reducción del 32% en desperdicio de agua y matriz FODA aplicada a cooperativas regionales en Tecnología de Gestión.",
        techs: ["HTML5", "CSS3", "JavaScript", "Arduino / ESP32", "JSON"],
        repoUrl: "https://github.com/cen-nonogasta/agrored-riego",
        attachmentName: "Informe_AgroRed_5to_CEN.pdf",
        status: "Aprobado",
        grade: 10,
        feedback: "Excelente articulación entre el prototipo electrónico de Prácticas Profesionalizantes y el estudio de factibilidad económica de Tecnología de Gestión.",
        date: "12/10/2026"
    },
    {
        id: 102,
        title: "SGA-CEN: Sistema de Gestión de Biblioteca y Préstamo de Netbooks",
        category: "Software de Gestión",
        division: "5° Año 'A' - T.I.P.P.",
        authors: "Carrizo Valentina, Olmedo Joaquín, Páez Abril",
        description: "Aplicación web para digitalizar el inventario del laboratorio de informática y biblioteca del Centro Educativo Nonogasta. Incluye generación de códigos QR por equipo, historial de préstamos y alertas de devolución.",
        management: "Relevamiento de procesos administrativos internos del colegio, optimización del tiempo de registro en un 70% y diseño de manual de procedimientos organizacionales.",
        techs: ["HTML5", "CSS3", "JavaScript", "LocalStorage", "QR.js"],
        repoUrl: "https://github.com/cen-nonogasta/sga-biblioteca",
        attachmentName: "Documentacion_SGA_CEN_v2.pdf",
        status: "Aprobado",
        grade: 9.5,
        feedback: "Interfaz muy intuitiva y directamente aplicable a la gestión diaria del laboratorio del C.E.N.",
        date: "14/10/2026"
    },
    {
        id: 103,
        title: "PyMEGest Rioja: Punto de Venta y Control de Stock Comercial",
        category: "Software de Gestión",
        division: "5° Año 'B' - T.I.P.P.",
        authors: "Bazán Santiago, Morales Martina, Gómez Nicolás",
        description: "Plataforma pensada para comercios minoristas de la localidad de Nonogasta. Permite registrar ventas diarias, emitir comprobantes internos, alertar stock crítico y visualizar reportes mensuales.",
        management: "Aplicación de herramientas de Tecnología de Gestión: flujo de caja, cálculo de punto de equilibrio, control de proveedores y análisis de rentabilidad comercial.",
        techs: ["HTML5", "CSS3", "JavaScript", "Chart.js", "MySQL"],
        repoUrl: "https://github.com/cen-nonogasta/pymegest-rioja",
        attachmentName: "Carpeta_De_Campo_PyMEGest.zip",
        status: "En Revisión",
        grade: 8.5,
        feedback: "Muy buen módulo de flujo de caja. Pendiente anexar el diagrama entidad-relación actualizado en el informe final.",
        date: "15/10/2026"
    },
    {
        id: 104,
        title: "Turismo Conectado Nonogasta - Portal Interactivo y Guía Cultural",
        category: "Sistema Web",
        division: "5° Año 'B' - T.I.P.P.",
        authors: "Romero Florencia, Vega Benjamín, Díaz Camila",
        description: "Portal web responsivo que promueve el circuito histórico, cultural y gastronómico de Nonogasta y Chilecito, integrando mapas interactivos, catálogo de artesanos y agenda de eventos.",
        management: "Plan de marketing digital, modelo Canvas de impacto comunitario y articulación con emprendedores locales relevados durante las prácticas.",
        techs: ["HTML5", "CSS3", "JavaScript", "Leaflet Maps", "Figma"],
        repoUrl: "https://github.com/cen-nonogasta/turismo-nonogasta",
        attachmentName: "Proyecto_Turismo_5toB.pdf",
        status: "Aprobado",
        grade: 9,
        feedback: "Destacado diseño visual y excelente relevamiento de campo con emprendedores locales.",
        date: "15/10/2026"
    }
];

let projectsList = [];
let currentCategoryFilter = 'TODOS';
let currentSearchQuery = '';
let currentSession = null;
let deferredInstallPrompt = null;

/* ==========================================================================
   INICIALIZACIÓN GENERAL
   ========================================================================== */
document.addEventListener('DOMContentLoaded', () => {
    Security.generateCSRFToken();
    Security.checkBruteForce();
    Security.initSessionTimeout();

    loadProjectsFromStorage();
    loadSessionFromStorage();
    renderAllViews();
    registerServiceWorker();
    setupPWAInstall();
});

/* ==========================================================================
   NAVEGACIÓN DE SECCIONES Y SIDEBAR VINCULADO (ESTILO YOUTUBE / INSTAGRAM)
   ========================================================================== */
function toggleAppSidebar() {
    if (window.innerWidth <= 900) {
        document.body.classList.toggle('mobile-sidebar-open');
    } else {
        document.body.classList.toggle('sidebar-collapsed');
    }
}

function navigateToSection(sectionName) {
    // 1. Ocultar todas las secciones y mostrar la seleccionada
    document.querySelectorAll('.app-section').forEach(sec => {
        sec.classList.remove('active');
    });

    const target = document.getElementById(`section-${sectionName}`);
    if (target) {
        target.classList.add('active');
    }

    // 2. Sincronizar estado activo en el Sidebar Principal
    document.querySelectorAll('.sidebar-link[data-section]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionName);
    });

    // 3. Sincronizar estado activo en la Barra Inferior Móvil
    document.querySelectorAll('.bottom-nav-btn[data-section]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionName);
    });

    // Cerrar sidebar móvil si estaba abierto en pantallas chicas
    document.body.classList.remove('mobile-sidebar-open');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function handleProtectedNavigation(sectionName) {
    if (!currentSession) {
        showToast('Inicia sesión en el Acceso Único para ingresar a esta sección.');
        openLoginModal();
        return;
    }

    const canEvaluate = currentSession.role === 'DOCENTE' ||
                        currentSession.role === 'ADMINISTRADOR' ||
                        (Array.isArray(currentSession.roles) && currentSession.roles.some(r => r.codigo === 'DOCENTE' || r.codigo === 'ADMINISTRADOR'));

    if (sectionName === 'evaluacion' && !canEvaluate) {
        showToast('Sección exclusiva para los roles DOCENTE o ADMINISTRADOR.');
        return;
    }

    navigateToSection(sectionName);
}

function quickCategoryJump(categoryName) {
    navigateToSection('vitrina');
    const targetPill = Array.from(document.querySelectorAll('#categoryPills .filter-pill'))
        .find(btn => btn.dataset.category === categoryName);
    setCategoryFilter(categoryName, targetPill);
}

function handleGlobalSearch(query) {
    currentSearchQuery = (query || '').toLowerCase().trim();
    // Si el usuario escribe en el buscador superior y no está en vitrina, lo lleva automáticamente a vitrina
    const vitrinaSection = document.getElementById('section-vitrina');
    if (currentSearchQuery.length > 0 && vitrinaSection && !vitrinaSection.classList.contains('active')) {
        navigateToSection('vitrina');
    }
    filterProjects();
}

/* ==========================================================================
   LOGIN UNIFICADO CONECTADO A SUPABASE (RELACIONAL, NORMALIZADO Y MULTIRROL)
   ========================================================================== */
function openLoginModal() {
    Security.generateCSRFToken();
    Security.checkBruteForce();
    openModal('loginModal');
}

function fillUnifiedDemo(targetRole) {
    const userField = document.getElementById('loginUsername');
    const passField = document.getElementById('loginPassword');

    if (targetRole === 'ADMINISTRADOR') {
        userField.value = 'admin.cen@cennonogasta.edu.ar';
        passField.value = 'cen2026admin';
        showToast('Cuenta Multirrol (ADMINISTRADOR + DOCENTE) cargada. También puedes usar DNI 32500100 o usuario sguardia.admin.');
    } else if (targetRole === 'DOCENTE') {
        userField.value = 'docente.practicas@cennonogasta.edu.ar';
        passField.value = 'cen2026docente';
        showToast('Cuenta DOCENTE cargada. También puedes usar DNI 34800200 o usuario docente.practicas.');
    } else {
        userField.value = 'alumno.5to.tipp@cennonogasta.edu.ar';
        passField.value = 'cen2026alumno';
        showToast('Cuenta ALUMNO cargada. También puedes usar DNI 47900300 o usuario mateo.carrizo.');
    }
}

async function handleLoginSubmit(event) {
    event.preventDefault();

    if (!Security.checkBruteForce()) return;

    const csrfToken = document.getElementById('csrfTokenLogin')?.value;
    if (!Security.verifyCSRFToken(csrfToken)) {
        showToast('Error de seguridad: token de sesión inválido. Recarga la página.');
        return;
    }

    const identifier = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!identifier || !password || password.length < 6) {
        Security.recordFailedLogin();
        return;
    }

    const submitBtn = document.getElementById('loginSubmitBtn');
    const originalBtnHTML = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Verificando en Supabase...';
    }

    try {
        if (!window.ProjectHubAuth) {
            throw new Error('El cliente de seguridad de Supabase aún se está inicializando. Intenta de nuevo.');
        }

        const result = await window.ProjectHubAuth.signInUnified(identifier, password);

        if (!result.ok) {
            if (result.code === 'ACCOUNT_LOCKED') {
                Security.showLockoutAlert(result.remainingSeconds || 60);
                showToast(result.message);
            } else {
                Security.recordFailedLogin();
            }
            return;
        }

        Security.resetFailedLogins();

        const profileData = result.profile;
        if (!profileData || !profileData.usuario) {
            showToast('Cuenta autenticada, pero sin ficha en la entidad pública de usuarios.');
            return;
        }

        buildAndSaveRelationalSession(profileData);
        updateAuthUI();
        closeModal('loginModal');
        document.getElementById('loginForm').reset();

        const rolesNames = currentSession.roles.map(r => r.codigo).join(' + ');
        if (currentSession.role === 'ADMINISTRADOR' || currentSession.role === 'DOCENTE') {
            navigateToSection('evaluacion');
            showToast(`Bienvenido/a ${currentSession.displayName} | Roles activos en BD: [${rolesNames}]`);
        } else {
            navigateToSection('cargar');
            showToast(`Bienvenido/a ${currentSession.displayName} | Rol activo: [${rolesNames}]`);
        }
    } catch (err) {
        console.error('[Login Error]', err);
        showToast(err.message || 'No se pudo completar la autenticación con Supabase.');
    } finally {
        if (submitBtn && !submitBtn.disabled) {
            submitBtn.innerHTML = originalBtnHTML;
        } else if (submitBtn && !sessionStorage.getItem('cen_login_lockout')) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = originalBtnHTML;
        }
    }
}

function buildAndSaveRelationalSession(profileData, preferredActiveRole = null) {
    const u = profileData.usuario;
    const rolesArray = Array.isArray(profileData.roles) && profileData.roles.length > 0
        ? profileData.roles
        : [{ codigo: 'ALUMNO', nombre: 'Alumno Desarrollador (5° Año)', es_rol_principal: true }];

    const primaryRoleCode = preferredActiveRole && rolesArray.some(r => r.codigo === preferredActiveRole)
        ? preferredActiveRole
        : (profileData.rol_principal || rolesArray[0].codigo);

    currentSession = {
        userId: u.id,
        dni: u.dni,
        cuil: u.cuil,
        username: u.username,
        email: u.email,
        nombres: u.nombres,
        apellidos: u.apellidos,
        displayName: `${u.nombres} ${u.apellidos}`,
        role: primaryRoleCode,
        roles: rolesArray,
        perfilesRol: profileData.perfiles_rol || {},
        usuarioRaw: u,
        loginTime: new Date().toLocaleTimeString('es-AR'),
        token: Security.csrfToken
    };

    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(currentSession));
}

function switchActiveUserRole(newRoleCode) {
    if (!currentSession || !Array.isArray(currentSession.roles)) return;
    const exists = currentSession.roles.some(r => r.codigo === newRoleCode);
    if (!exists) return;

    currentSession.role = newRoleCode;
    localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(currentSession));
    updateAuthUI();

    if (newRoleCode === 'ALUMNO') {
        navigateToSection('cargar');
    } else {
        navigateToSection('evaluacion');
    }
    showToast(`Vista cambiada al Rol asignado: ${newRoleCode}`);
}

async function logoutSession() {
    try {
        if (window.ProjectHubAuth) {
            await window.ProjectHubAuth.signOut();
        }
    } catch (e) {
        console.warn('Cierre de sesión local:', e);
    }
    currentSession = null;
    localStorage.removeItem(STORAGE_KEY_SESSION);
    updateAuthUI();
    navigateToSection('inicio');
    showToast('Sesión finalizada de forma segura en Supabase.');
}

function updateAuthUI() {
    const guestActions = document.getElementById('guestActions');
    const loggedActions = document.getElementById('loggedUserActions');
    const sidebarEvalBtn = document.getElementById('sidebarEvaluationBtn');
    const sidebarLoginBtn = document.getElementById('sidebarLoginBtn');
    const mobileBottomAuthLabel = document.getElementById('mobileBottomAuthLabel');
    const roleSwitcher = document.getElementById('roleSwitcherSelect');

    if (!currentSession) {
        if (guestActions) guestActions.style.display = 'block';
        if (loggedActions) loggedActions.style.display = 'none';
        if (sidebarLoginBtn) sidebarLoginBtn.style.display = 'flex';
        if (mobileBottomAuthLabel) mobileBottomAuthLabel.textContent = 'Acceder';
        if (roleSwitcher) roleSwitcher.style.display = 'none';
        return;
    }

    if (guestActions) guestActions.style.display = 'none';
    if (loggedActions) loggedActions.style.display = 'flex';
    if (sidebarLoginBtn) sidebarLoginBtn.style.display = 'none';

    const safeRole = Security.escapeHTML(currentSession.role);
    const safeName = Security.escapeHTML(currentSession.displayName);

    const badge = document.getElementById('activeRoleBadge');
    const userName = document.getElementById('activeUserName');
    if (badge) badge.textContent = safeRole;
    if (userName) userName.textContent = safeName;
    if (mobileBottomAuthLabel) mobileBottomAuthLabel.textContent = safeRole;

    // Si el usuario tiene múltiples roles en la tabla intermedia usuarios_roles, habilitar el selector
    if (roleSwitcher) {
        const rolesList = Array.isArray(currentSession.roles) ? currentSession.roles : [];
        if (rolesList.length > 1) {
            roleSwitcher.style.display = 'inline-block';
            roleSwitcher.innerHTML = rolesList.map(r => {
                const code = Security.escapeHTML(r.codigo);
                const selected = r.codigo === currentSession.role ? 'selected' : '';
                return `<option value="${code}" ${selected}>Rol: ${code}</option>`;
            }).join('');
        } else {
            roleSwitcher.style.display = 'none';
        }
    }

    if (sidebarEvalBtn) {
        const canEval = currentSession.role === 'DOCENTE' || currentSession.role === 'ADMINISTRADOR';
        sidebarEvalBtn.style.opacity = canEval ? '1' : '0.65';
    }
}

function openUserProfileModal() {
    if (!currentSession) {
        openLoginModal();
        return;
    }

    const u = currentSession.usuarioRaw || {};
    const roles = Array.isArray(currentSession.roles) ? currentSession.roles : [];
    const perfiles = currentSession.perfilesRol || {};

    const rolesBadgesHTML = roles.map(r => `
        <span class="badge-status status-aprobado" style="font-size: 0.78rem; padding: 0.35rem 0.75rem;">
            <i class="fa-solid fa-user-check"></i> ${Security.escapeHTML(r.codigo)}
            ${r.es_rol_principal ? ' (Principal)' : ' (Secundario)'}
        </span>
    `).join('');

    let roleEntitiesHTML = '';

    if (perfiles.administrador) {
        const adm = perfiles.administrador;
        roleEntitiesHTML += `
            <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                <h4 style="color:var(--gold-primary); font-size:0.88rem; margin-bottom:0.5rem;">
                    <i class="fa-solid fa-user-shield"></i> ENTIDAD: public.administradores (Legajo: ${Security.escapeHTML(adm.legajo_admin)})
                </h4>
                <p style="font-size:0.84rem; color:var(--text-secondary);">
                    <strong>Cargo:</strong> ${Security.escapeHTML(adm.cargo_institucional)}<br>
                    <strong>Área:</strong> ${Security.escapeHTML(adm.departamento_area)} • <strong>Nivel Acceso:</strong> ${Security.escapeHTML(adm.nivel_acceso)}/10<br>
                    <strong>Resolución:</strong> ${Security.escapeHTML(adm.resolucion_designacion || 'N/A')}
                </p>
            </div>
        `;
    }

    if (perfiles.docente) {
        const doc = perfiles.docente;
        const materias = Array.isArray(doc.espacios_curriculares) ? doc.espacios_curriculares.join(', ') : '';
        const cursos = Array.isArray(doc.cursos_asignados) ? doc.cursos_asignados.join(', ') : '';
        roleEntitiesHTML += `
            <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                <h4 style="color:var(--gold-primary); font-size:0.88rem; margin-bottom:0.5rem;">
                    <i class="fa-solid fa-chalkboard-user"></i> ENTIDAD: public.docentes (Legajo: ${Security.escapeHTML(doc.legajo_docente)})
                </h4>
                <p style="font-size:0.84rem; color:var(--text-secondary);">
                    <strong>Título:</strong> ${Security.escapeHTML(doc.titulo_profesional)} (${Security.escapeHTML(doc.situacion_revista)})<br>
                    <strong>Espacios Curriculares:</strong> ${Security.escapeHTML(materias)}<br>
                    <strong>Cursos Asignados:</strong> ${Security.escapeHTML(cursos)}
                </p>
            </div>
        `;
    }

    if (perfiles.alumno) {
        const alu = perfiles.alumno;
        roleEntitiesHTML += `
            <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                <h4 style="color:var(--gold-primary); font-size:0.88rem; margin-bottom:0.5rem;">
                    <i class="fa-solid fa-user-graduate"></i> ENTIDAD: public.alumnos (Matrícula: ${Security.escapeHTML(alu.matricula_legajo)})
                </h4>
                <p style="font-size:0.84rem; color:var(--text-secondary);">
                    <strong>Curso:</strong> ${Security.escapeHTML(alu.anio_cursado)}° Año "${Security.escapeHTML(alu.division)}" (${Security.escapeHTML(alu.turno)}) - ${Security.escapeHTML(alu.orientacion_tecnica)}<br>
                    <strong>Equipo de Proyecto:</strong> ${Security.escapeHTML(alu.nombre_equipo_proyecto || 'Sin asignar')} (${Security.escapeHTML(alu.rol_en_equipo || '')})<br>
                    <strong>Tutor Legal:</strong> ${Security.escapeHTML(alu.tutor_legal_nombre || 'No registrado')} (${Security.escapeHTML(alu.tutor_legal_parentesco || '')})
                </p>
            </div>
        `;
    }

    const container = document.getElementById('userProfileModalContent');
    if (container) {
        container.innerHTML = `
            <div class="login-header" style="text-align:left; border-bottom:1px solid var(--gold-border); padding-bottom:1rem; margin-bottom:1.2rem;">
                <span class="badge-category">Ficha Relacional Supabase (3FN)</span>
                <h3 style="color:var(--gold-primary); font-size:1.35rem; margin-top:0.35rem;">
                    ${Security.escapeHTML(currentSession.displayName)}
                </h3>
                <p style="color:var(--text-secondary); font-size:0.85rem;">
                    Usuario: <strong>@${Security.escapeHTML(currentSession.username)}</strong> • DNI: <strong>${Security.escapeHTML(currentSession.dni)}</strong> • CUIL: <strong>${Security.escapeHTML(currentSession.cuil || 'N/A')}</strong>
                </p>
            </div>

            <div style="margin-bottom:1.2rem;">
                <strong style="display:block; font-size:0.78rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.45rem;">
                    Roles Asignados en Tabla Intermedia (public.usuarios_roles):
                </strong>
                <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                    ${rolesBadgesHTML}
                </div>
            </div>

            <div style="display:grid; gap:1rem; margin-bottom:1.2rem;">
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                    <h4 style="color:var(--gold-primary); font-size:0.88rem; margin-bottom:0.5rem;">
                        <i class="fa-solid fa-address-card"></i> ENTIDAD PRINCIPAL: public.usuarios
                    </h4>
                    <p style="font-size:0.84rem; color:var(--text-secondary);">
                        <strong>Correo Institucional:</strong> ${Security.escapeHTML(currentSession.email)}<br>
                        <strong>Teléfono:</strong> ${Security.escapeHTML(u.telefono || 'No especificado')} • <strong>Localidad:</strong> ${Security.escapeHTML(u.localidad || 'Nonogasta')}, ${Security.escapeHTML(u.provincia || 'La Rioja')}<br>
                        <strong>Domicilio:</strong> ${Security.escapeHTML(u.domicilio || 'No especificado')}
                    </p>
                </div>
                ${roleEntitiesHTML}
            </div>

            <div style="display:flex; justify-content:flex-end;">
                <button class="btn btn-primary" onclick="closeModal('userProfileModal')">
                    <i class="fa-solid fa-check"></i> Cerrar Ficha
                </button>
            </div>
        `;
    }

    openModal('userProfileModal');
}

/* ==========================================================================
   PERSISTENCIA Y RENDERIZADO DE VITRINA (CON PROTECCIÓN ANTI-XSS)
   ========================================================================== */
function loadProjectsFromStorage() {
    const saved = localStorage.getItem(STORAGE_KEY_PROJECTS);
    if (saved) {
        try {
            projectsList = JSON.parse(saved);
        } catch (e) {
            projectsList = [...initialProjects];
        }
    } else {
        projectsList = [...initialProjects];
        saveProjectsToStorage();
    }
}

function saveProjectsToStorage() {
    localStorage.setItem(STORAGE_KEY_PROJECTS, JSON.stringify(projectsList));
}

async function loadSessionFromStorage() {
    const savedSession = localStorage.getItem(STORAGE_KEY_SESSION);
    if (savedSession) {
        try {
            currentSession = JSON.parse(savedSession);
        } catch (e) {
            currentSession = null;
        }
    }
    updateAuthUI();

    // Sincronizar con la sesión activa de Supabase si existe
    if (window.ProjectHubAuth) {
        try {
            const { data } = await window.ProjectHubAuth.client.auth.getSession();
            if (data?.session) {
                const freshProfile = await window.ProjectHubAuth.fetchCurrentUserProfile();
                if (freshProfile && freshProfile.usuario) {
                    buildAndSaveRelationalSession(freshProfile, currentSession?.role);
                    updateAuthUI();
                }
            } else if (currentSession) {
                currentSession = null;
                localStorage.removeItem(STORAGE_KEY_SESSION);
                updateAuthUI();
            }
        } catch (err) {
            console.warn('[C.E.N. Auth Sync]', err);
        }
    }
}

function renderAllViews() {
    updateStatsCounters();
    filterProjects();
    renderStudentSubmissions();
    renderTeacherEvaluationTable();
}

function updateStatsCounters() {
    const totalProjects = projectsList.length;
    const approvedCount = projectsList.filter(p => p.status === 'Aprobado').length;

    let studentCount = 0;
    projectsList.forEach(p => {
        studentCount += (p.authors || '').split(',').length;
    });

    const elTotal = document.getElementById('statTotalProjects');
    const elStudents = document.getElementById('statTotalStudents');
    const elApproved = document.getElementById('statApprovedProjects');

    if (elTotal) elTotal.textContent = totalProjects;
    if (elStudents) elStudents.textContent = studentCount;
    if (elApproved) elApproved.textContent = approvedCount;
}

function setCategoryFilter(category, btnElement) {
    currentCategoryFilter = category;
    document.querySelectorAll('#categoryPills .filter-pill').forEach(btn => {
        btn.classList.remove('active');
    });
    if (btnElement) btnElement.classList.add('active');
    filterProjects();
}

function filterProjects() {
    const statusFilter = document.getElementById('statusFilter')?.value || 'TODOS';

    const filtered = projectsList.filter(proj => {
        const matchesCategory = currentCategoryFilter === 'TODOS' || proj.category === currentCategoryFilter;
        const matchesStatus = statusFilter === 'TODOS' || proj.status === statusFilter;
        const matchesSearch = !currentSearchQuery ||
            (proj.title || '').toLowerCase().includes(currentSearchQuery) ||
            (proj.authors || '').toLowerCase().includes(currentSearchQuery) ||
            (proj.description || '').toLowerCase().includes(currentSearchQuery) ||
            (proj.techs || []).join(' ').toLowerCase().includes(currentSearchQuery);

        return matchesCategory && matchesStatus && matchesSearch;
    });

    renderProjectsGrid(filtered);
}

function getCategoryIcon(category) {
    switch (category) {
        case 'Sistema Web': return 'fa-globe';
        case 'Software de Gestión': return 'fa-chart-line';
        case 'IoT y Hardware': return 'fa-microchip';
        case 'App Móvil': return 'fa-mobile-screen-button';
        default: return 'fa-laptop-code';
    }
}

function getStatusBadgeClass(status) {
    if (status === 'Aprobado') return 'status-aprobado';
    if (status === 'En Revisión') return 'status-revision';
    return 'status-desarrollo';
}

function getInitials(authorsStr) {
    if (!authorsStr) return 'CEN';
    const firstAuthor = authorsStr.split(',')[0].trim();
    const parts = firstAuthor.split(' ');
    if (parts.length >= 2) {
        return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return firstAuthor.substring(0, 2).toUpperCase();
}

function renderProjectsGrid(list) {
    const container = document.getElementById('projectsGridContainer');
    if (!container) return;

    if (list.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3.5rem; background: var(--bg-card); border: 1px dashed var(--gold-border); border-radius: var(--radius-lg);">
                <i class="fa-solid fa-folder-open" style="font-size: 3rem; color: var(--gold-primary); margin-bottom: 1rem;"></i>
                <h3>No se encontraron proyectos con ese criterio</h3>
                <p style="color: var(--text-secondary); margin-top: 0.4rem;">Prueba seleccionar otra categoría o limpia el buscador superior.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(proj => {
        const safeTitle = Security.escapeHTML(proj.title);
        const safeCategory = Security.escapeHTML(proj.category);
        const safeDivision = Security.escapeHTML(proj.division);
        const safeDescription = Security.escapeHTML(proj.description);
        const safeManagement = Security.escapeHTML(proj.management);
        const safeAttachment = Security.escapeHTML(proj.attachmentName);
        const safeStatus = Security.escapeHTML(proj.status);
        const safeInitials = Security.escapeHTML(getInitials(proj.authors));

        const authorList = proj.authors ? proj.authors.split(',') : [];
        const firstAuthor = Security.escapeHTML(authorList[0] || '');
        const extraAuthorsCount = authorList.length > 1 ? authorList.length - 1 : 0;

        const techChips = (proj.techs || []).map(t => `<span class="tech-chip">${Security.escapeHTML(t)}</span>`).join('');

        return `
            <article class="project-card">
                <div class="project-banner">
                    <div class="project-banner-pattern"></div>
                    <div class="project-top-badges">
                        <span class="badge-category">${safeCategory}</span>
                        <span class="badge-status ${getStatusBadgeClass(proj.status)}">
                            <i class="fa-solid fa-circle" style="font-size: 0.5rem;"></i> ${safeStatus}
                        </span>
                    </div>
                    <i class="fa-solid ${getCategoryIcon(proj.category)} project-category-icon"></i>
                </div>

                <div class="project-body">
                    <div class="project-course-tag">${safeDivision} • C.E.N.</div>
                    <h3 class="project-title">${safeTitle}</h3>
                    <p class="project-desc">${safeDescription}</p>

                    <div class="gestion-box">
                        <strong><i class="fa-solid fa-diagram-project"></i> Articulación Tec. de Gestión:</strong>
                        <span>${safeManagement}</span>
                    </div>

                    <div class="tech-stack">
                        ${techChips}
                    </div>

                    <div class="project-footer">
                        <div class="authors-info">
                            <div class="authors-avatar">${safeInitials}</div>
                            <div class="authors-text">
                                <strong>${firstAuthor} ${extraAuthorsCount > 0 ? `(+${extraAuthorsCount})` : ''}</strong>
                                <span>Adjunto: ${safeAttachment}</span>
                            </div>
                        </div>

                        <button class="btn btn-outline" style="padding: 0.45rem 0.85rem; font-size: 0.8rem;" onclick="openProjectDetail(${proj.id})">
                            Ver Proyecto <i class="fa-solid fa-arrow-up-right-from-square"></i>
                        </button>
                    </div>
                </div>
            </article>
        `;
    }).join('');
}

/* ==========================================================================
   MODAL DE FICHA DETALLADA Y ENLACES SEGUROS
   ========================================================================== */
function openProjectDetail(projectId) {
    const proj = projectsList.find(p => p.id === projectId);
    if (!proj) return;

    const safeTitle = Security.escapeHTML(proj.title);
    const safeCategory = Security.escapeHTML(proj.category);
    const safeDivision = Security.escapeHTML(proj.division);
    const safeAuthors = Security.escapeHTML(proj.authors);
    const safeDescription = Security.escapeHTML(proj.description);
    const safeManagement = Security.escapeHTML(proj.management);
    const safeAttachment = Security.escapeHTML(proj.attachmentName);
    const safeStatus = Security.escapeHTML(proj.status);
    const safeFeedback = Security.escapeHTML(proj.feedback || '');
    const safeDate = Security.escapeHTML(proj.date || '');
    const cleanRepoUrl = Security.sanitizeURL(proj.repoUrl);

    const techChips = (proj.techs || []).map(t => `<span class="tech-chip" style="font-size:0.82rem; padding:0.35rem 0.8rem;">${Security.escapeHTML(t)}</span>`).join('');

    const content = document.getElementById('projectDetailContent');
    content.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:0.65rem; align-items:center; margin-bottom:0.85rem;">
            <span class="badge-category">${safeCategory}</span>
            <span class="badge-status ${getStatusBadgeClass(proj.status)}">${safeStatus}</span>
            <span style="color:var(--text-muted); font-size:0.82rem;"><i class="fa-regular fa-calendar"></i> Presentado: ${safeDate}</span>
            ${proj.grade ? `<span class="grade-pill">Calificación: ${proj.grade} / 10</span>` : ''}
        </div>

        <h2 style="font-family:var(--font-heading); font-size:clamp(1.2rem, 3vw, 1.55rem); color:var(--gold-primary); margin-bottom:0.5rem;">
            ${safeTitle}
        </h2>
        <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:1.5rem;">
            <i class="fa-solid fa-users" style="color:var(--gold-primary);"></i> <strong>Equipo Desarrollador (${safeDivision}):</strong> ${safeAuthors}
        </p>

        <div style="display:grid; gap:1.25rem; margin-bottom:1.5rem;">
            <div style="background:var(--bg-surface); padding:1.2rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                <h4 style="color:var(--gold-primary); font-family:var(--font-heading); font-size:0.92rem; margin-bottom:0.45rem;">
                    <i class="fa-solid fa-laptop-code"></i> DESARROLLO TÉCNICO (PRÁCTICAS PROFESIONALIZANTES)
                </h4>
                <p style="color:var(--text-primary); font-size:0.92rem;">${safeDescription}</p>
            </div>

            <div style="background:var(--bg-surface); padding:1.2rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                <h4 style="color:var(--gold-primary); font-family:var(--font-heading); font-size:0.92rem; margin-bottom:0.45rem;">
                    <i class="fa-solid fa-chart-pie"></i> VIABILIDAD Y GESTIÓN ORGANIZACIONAL (TECNOLOGÍA DE GESTIÓN)
                </h4>
                <p style="color:var(--text-primary); font-size:0.92rem;">${safeManagement}</p>
            </div>

            ${proj.feedback ? `
            <div style="background:rgba(16, 185, 129, 0.08); padding:1.1rem; border-radius:var(--radius-md); border:1px solid rgba(16, 185, 129, 0.35);">
                <h4 style="color:var(--status-approved); font-size:0.86rem; text-transform:uppercase; margin-bottom:0.35rem;">
                    <i class="fa-solid fa-comment-dots"></i> Devolución del Equipo Docente:
                </h4>
                <p style="color:var(--text-secondary); font-size:0.88rem;">"${safeFeedback}"</p>
            </div>
            ` : ''}
        </div>

        <div style="margin-bottom:1.5rem;">
            <strong style="display:block; font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem; text-transform:uppercase;">Stack Tecnológico Implementado:</strong>
            <div class="tech-stack">
                ${techChips}
            </div>
        </div>

        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:1rem; padding-top:1.2rem; border-top:1px solid var(--gold-border);">
            <div style="display:flex; align-items:center; gap:0.65rem;">
                <i class="fa-solid fa-file-pdf" style="font-size:1.5rem; color:var(--gold-primary);"></i>
                <div>
                    <strong style="display:block; font-size:0.85rem;">Documentación Adjunta</strong>
                    <span style="font-size:0.78rem; color:var(--text-muted);">${safeAttachment}</span>
                </div>
            </div>

            <div style="display:flex; gap:0.75rem; flex-wrap:wrap;">
                <button class="btn btn-outline" onclick="showToast('Descarga segura iniciada: ${safeAttachment}')">
                    <i class="fa-solid fa-download"></i> Descargar Informe
                </button>
                ${cleanRepoUrl ? `
                <button type="button" class="btn btn-primary" onclick="inspectExternalLink('${cleanRepoUrl}')">
                    <i class="fa-brands fa-github"></i> Ver Repositorio Externo
                </button>
                ` : ''}
            </div>
        </div>
    `;

    openModal('projectDetailModal');
}

function inspectExternalLink(url) {
    const cleanUrl = Security.sanitizeURL(url);
    if (!cleanUrl) {
        showToast('Enlace bloqueado por protocolo inseguro.');
        return;
    }

    const display = document.getElementById('safeLinkDisplay');
    const proceedBtn = document.getElementById('safeLinkProceedBtn');

    if (display) display.textContent = cleanUrl;
    if (proceedBtn) {
        proceedBtn.href = cleanUrl;
        proceedBtn.setAttribute('rel', 'noopener noreferrer');
        proceedBtn.setAttribute('target', '_blank');
    }

    openModal('linkSafetyModal');
}

/* ==========================================================================
   CARGA DE PROYECTOS Y EVALUACIÓN DOCENTE
   ========================================================================== */
function updateFileLabel(inputElement) {
    const label = document.getElementById('fileDropText');
    if (inputElement.files && inputElement.files.length > 0) {
        const file = inputElement.files[0];
        const validation = Security.validateUploadedFile(file);

        if (!validation.valid) {
            inputElement.value = '';
            showToast(validation.error);
            label.innerHTML = `<span style="color:var(--danger);"><i class="fa-solid fa-triangle-exclamation"></i> Archivo rechazado por seguridad. Usa .PDF, .DOCX o .ZIP.</span>`;
            return;
        }

        const safeFilename = Security.escapeHTML(validation.sanitizedName || file.name);
        label.innerHTML = `<strong style="color:var(--gold-primary);"><i class="fa-solid fa-file-circle-check"></i> Archivo verificado:</strong> ${safeFilename} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
    }
}

function handleProjectSubmit(event) {
    event.preventDefault();

    const csrfToken = document.getElementById('csrfTokenUpload')?.value;
    if (!Security.verifyCSRFToken(csrfToken)) {
        showToast('Error de seguridad: token de formulario inválido.');
        return;
    }

    const title = document.getElementById('projTitle').value.trim();
    const category = document.getElementById('projCategory').value;
    const division = document.getElementById('projDivision').value.trim();
    const authors = document.getElementById('projAuthors').value.trim();
    const description = document.getElementById('projDescription').value.trim();
    const management = document.getElementById('projManagement').value.trim();
    const techsRaw = document.getElementById('projTechs').value.trim();
    const repoUrlRaw = document.getElementById('projRepo').value.trim();
    const fileInput = document.getElementById('projFileInput');

    const sanitizedRepoUrl = repoUrlRaw ? Security.sanitizeURL(repoUrlRaw) : '';
    if (repoUrlRaw && !sanitizedRepoUrl) {
        showToast('La URL del repositorio debe comenzar con https:// o http://');
        return;
    }

    let attachmentName = '';
    if (fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const validation = Security.validateUploadedFile(file);
        if (!validation.valid) {
            showToast(validation.error);
            return;
        }
        attachmentName = validation.sanitizedName || file.name;
    } else {
        attachmentName = `Informe_${title.substring(0, 15).replace(/[^a-zA-Z0-9]/g, '_')}_5toCEN.pdf`;
    }

    const newProject = {
        id: Date.now(),
        title,
        category,
        division,
        authors,
        description,
        management,
        techs: techsRaw.split(',').map(t => t.trim()).filter(Boolean),
        repoUrl: sanitizedRepoUrl,
        attachmentName,
        status: "En Revisión",
        grade: null,
        feedback: "Proyecto recibido en plataforma. Pendiente de evaluación por los docentes de Prácticas Profesionalizantes y Tecnología de Gestión.",
        date: new Date().toLocaleDateString('es-AR')
    };

    projectsList.unshift(newProject);
    saveProjectsToStorage();
    renderAllViews();

    document.getElementById('projectUploadForm').reset();
    document.getElementById('fileDropText').textContent = 'Haz clic aquí para seleccionar el documento del proyecto (Informe PDF, Manual de Usuario o Código .ZIP)';
    Security.generateCSRFToken();

    showToast('¡Proyecto adjuntado con éxito! Redirigiendo a la Vitrina...');
    navigateToSection('vitrina');
}

function renderStudentSubmissions() {
    const tbody = document.getElementById('studentSubmissionsTable');
    if (!tbody) return;

    tbody.innerHTML = projectsList.map(proj => {
        const safeTitle = Security.escapeHTML(proj.title);
        const safeCategory = Security.escapeHTML(proj.category);
        const safeDate = Security.escapeHTML(proj.date || '');
        const safeAuthors = Security.escapeHTML(proj.authors);
        const safeAttachment = Security.escapeHTML(proj.attachmentName);
        const safeStatus = Security.escapeHTML(proj.status);
        const safeFeedback = Security.escapeHTML(proj.feedback || '');

        return `
            <tr>
                <td>
                    <strong style="color:var(--text-primary); display:block;">${safeTitle}</strong>
                    <span style="font-size:0.76rem; color:var(--gold-primary);">${safeCategory} • ${safeDate}</span>
                </td>
                <td>${safeAuthors}</td>
                <td><i class="fa-regular fa-file-pdf" style="color:var(--gold-primary);"></i> ${safeAttachment}</td>
                <td><span class="badge-status ${getStatusBadgeClass(proj.status)}">${safeStatus}</span></td>
                <td>
                    ${proj.grade ? `<span class="grade-pill">${proj.grade}/10</span>` : '<span style="color:var(--text-muted);">Sin calificar</span>'}
                    <p style="font-size:0.76rem; color:var(--text-muted); margin-top:0.2rem;">${safeFeedback}</p>
                </td>
            </tr>
        `;
    }).join('');
}

function renderTeacherEvaluationTable() {
    const tbody = document.getElementById('teacherEvaluationTable');
    if (!tbody) return;

    tbody.innerHTML = projectsList.map(proj => {
        const safeTitle = Security.escapeHTML(proj.title);
        const safeCategory = Security.escapeHTML(proj.category);
        const safeAuthors = Security.escapeHTML(proj.authors);
        const safeDivision = Security.escapeHTML(proj.division);
        const safeAttachment = Security.escapeHTML(proj.attachmentName);
        const safeStatus = Security.escapeHTML(proj.status);

        return `
            <tr>
                <td>
                    <strong style="color:var(--text-primary); display:block;">${safeTitle}</strong>
                    <span class="badge-category" style="margin-top:0.2rem; display:inline-block;">${safeCategory}</span>
                </td>
                <td>
                    <strong>${safeAuthors}</strong>
                    <div style="font-size:0.74rem; color:var(--text-muted);">${safeDivision}</div>
                </td>
                <td>
                    <span style="font-size:0.82rem;"><i class="fa-solid fa-paperclip" style="color:var(--gold-primary);"></i> ${safeAttachment}</span>
                </td>
                <td>
                    <span class="badge-status ${getStatusBadgeClass(proj.status)}">${safeStatus}</span>
                </td>
                <td>
                    ${proj.grade ? `<span class="grade-pill">${proj.grade} / 10</span>` : '<span style="color:var(--text-muted);">Pendiente</span>'}
                </td>
                <td>
                    <div style="display:flex; gap:0.45rem; flex-wrap:wrap;">
                        <button class="btn btn-primary" style="padding:0.38rem 0.7rem; font-size:0.76rem;" onclick="openEvaluationModal(${proj.id})">
                            <i class="fa-solid fa-pen-to-square"></i> Evaluar
                        </button>
                        <button class="btn btn-ghost" style="padding:0.38rem 0.6rem; font-size:0.76rem;" onclick="openProjectDetail(${proj.id})" title="Ver Ficha">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openEvaluationModal(projectId) {
    const proj = projectsList.find(p => p.id === projectId);
    if (!proj) return;

    document.getElementById('evalProjectId').value = proj.id;
    document.getElementById('evalProjectTitleSubtitle').textContent = `${proj.title} (${proj.authors})`;
    document.getElementById('evalStatus').value = proj.status;
    document.getElementById('evalGrade').value = proj.grade || '';
    document.getElementById('evalFeedback').value = proj.feedback || '';

    openModal('evaluateModal');
}

function saveTeacherEvaluation(event) {
    event.preventDefault();
    const projectId = Number(document.getElementById('evalProjectId').value);
    const status = document.getElementById('evalStatus').value;
    const grade = parseFloat(document.getElementById('evalGrade').value);
    const feedback = document.getElementById('evalFeedback').value.trim();

    const index = projectsList.findIndex(p => p.id === projectId);
    if (index !== -1) {
        projectsList[index].status = status;
        projectsList[index].grade = isNaN(grade) ? null : grade;
        projectsList[index].feedback = feedback;

        saveProjectsToStorage();
        renderAllViews();
        closeModal('evaluateModal');
        showToast('Evaluación docente guardada y publicada.');
    }
}

function exportProjectsSummary() {
    showToast('Exportando planilla de seguimiento de 5° Año C.E.N. Nonogasta...');
}

/* ==========================================================================
   PWA, TEMA VISUAL Y UTILIDADES DE MODALES
   ========================================================================== */
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
}

function setupPWAInstall() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredInstallPrompt = e;
    });

    window.addEventListener('appinstalled', () => {
        deferredInstallPrompt = null;
        showToast('¡PROJECTHUB instalado como aplicación en tu dispositivo!');
    });
}

function triggerAppInstall() {
    if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        deferredInstallPrompt.userChoice.then(() => {
            deferredInstallPrompt = null;
        });
    } else {
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const msg = isMobile
            ? 'En tu móvil, abre el menú del navegador (⋮) y selecciona "Instalar aplicación" o "Agregar a pantalla principal".'
            : 'Haz clic en el icono de instalación (⊕) en la barra de direcciones de tu navegador para descargar PROJECTHUB en tu PC.';
        showToast(msg);
    }
}

function openModal(modalId) {
    document.getElementById(modalId)?.classList.add('open');
}

function closeModal(modalId) {
    document.getElementById(modalId)?.classList.remove('open');
}

function toggleTheme() {
    const html = document.documentElement;
    const current = html.getAttribute('data-theme');
    const icon = document.querySelector('#themeToggleBtn i');

    if (current === 'light') {
        html.removeAttribute('data-theme');
        if (icon) icon.className = 'fa-solid fa-sun';
        showToast('Modo Oscuro activado');
    } else {
        html.setAttribute('data-theme', 'light');
        if (icon) icon.className = 'fa-solid fa-moon';
        showToast('Modo Claro activado');
    }
}

function showToast(message) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const safeMessage = Security.escapeHTML(message);
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <i class="fa-solid fa-shield-halved" style="color:var(--gold-primary);"></i>
        <span style="font-size: 0.86rem; font-weight: 600;">${safeMessage}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3600);
}
