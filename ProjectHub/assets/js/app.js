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

// Estado relacional en vivo sincronizado desde Supabase PostgreSQL (3FN)
let systemDB = {
    usuarios: [],
    docentes: [],
    alumnos: [],
    proyectos: [],
    asignaturas: []
};
let activeAdminTab = 'usuarios';

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

    if (window.ProjectHubAuth) {
        refreshSystemDataFromSupabase(false);
    } else {
        window.addEventListener('supabase-ready', () => {
            refreshSystemDataFromSupabase(false);
        });
    }
});

async function refreshSystemDataFromSupabase(showNotification = false) {
    if (!window.ProjectHubAuth) return;
    try {
        const data = await window.ProjectHubAuth.fetchSystemSupervisionData();
        if (data) {
            systemDB.usuarios = Array.isArray(data.usuarios) ? data.usuarios : [];
            systemDB.docentes = Array.isArray(data.docentes) ? data.docentes : [];
            systemDB.alumnos = Array.isArray(data.alumnos) ? data.alumnos : [];
            systemDB.proyectos = Array.isArray(data.proyectos) ? data.proyectos : [];
            systemDB.asignaturas = Array.isArray(data.asignaturas) ? data.asignaturas : [];

            // Mapear los proyectos activos de la BD hacia la Vitrina y bandejas del sistema
            const activeDbProjects = systemDB.proyectos.filter(p => p.activo !== false);
            if (activeDbProjects.length > 0) {
                projectsList = activeDbProjects.map(p => ({
                    id: p.id,
                    codigo_proyecto: p.codigo_proyecto,
                    title: p.titulo,
                    category: p.categoria,
                    division: p.division,
                    authors: p.autores_resumen || (p.alumnos_rel || []).map(a => a.nombre_completo).join(', ') || 'Equipo 5° Año',
                    description: p.descripcion_tecnica,
                    management: p.articulacion_gestion,
                    techs: Array.isArray(p.tecnologias) ? p.tecnologias : ['HTML5', 'CSS3', 'JavaScript'],
                    repoUrl: p.repositorio_url || '',
                    demoUrl: p.demo_produccion_url || '',
                    modalidadEntrega: p.modalidad_entrega || 'Despliegue Cloud + GitHub + Base de Datos',
                    plataformaDespliegue: p.plataforma_despliegue || 'Vercel',
                    motorBaseDatos: p.motor_base_datos || 'Supabase (PostgreSQL)',
                    databaseProyectoUrl: p.database_proyecto_url || '',
                    snippetCodigoFuente: p.snippet_codigo_fuente || '',
                    instruccionesEjecucion: p.instrucciones_ejecucion || '',
                    enProduccionPublica: p.en_produccion_publica !== false,
                    attachmentName: p.archivo_adjunto_nombre || 'Informe_Tecnico.pdf',
                    status: p.estado || 'En Revisión',
                    grade: p.calificacion,
                    feedback: p.devolucion_docente || '',
                    date: p.fecha_formateada || '2026',
                    alumnos_rel: p.alumnos_rel || [],
                    docentes_rel: p.docentes_rel || [],
                    asignaturas_rel: p.asignaturas_rel || [],
                    activo: p.activo
                }));
                saveProjectsToStorage();
            }

            renderAllViews();
            renderAdminSupervisionDashboard();
            renderDocenteDashboard();
            renderAlumnoDashboard();

            if (showNotification) {
                showToast('Base de datos relacional Supabase sincronizada en tiempo real.');
            }
        }
    } catch (err) {
        console.warn('[Sincronización Supabase]', err);
    }
}

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

    // 3. Sincronizar estado activo en la Barra Superior Rápida por Rol (#topbarRoleQuickNav)
    document.querySelectorAll('#topbarRoleQuickNav .topbar-nav-pill[data-section]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.section === sectionName);
    });

    // 4. Sincronizar estado activo en la Barra Inferior Móvil
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

    const isAdmin = currentSession.role === 'ADMINISTRADOR' ||
                    (Array.isArray(currentSession.roles) && currentSession.roles.some(r => r.codigo === 'ADMINISTRADOR'));

    const canEvaluate = isAdmin ||
                        currentSession.role === 'DOCENTE' ||
                        (Array.isArray(currentSession.roles) && currentSession.roles.some(r => r.codigo === 'DOCENTE'));

    if (sectionName === 'administracion' && !isAdmin) {
        showToast('Sección exclusiva para el Rol ADMINISTRADOR. Inicia sesión con una cuenta de Administrador.');
        return;
    }

    if (sectionName === 'evaluacion' && !canEvaluate) {
        showToast('Sección exclusiva para los roles DOCENTE o ADMINISTRADOR.');
        return;
    }

    if (sectionName === 'administracion' || sectionName === 'evaluacion' || sectionName === 'cargar') {
        refreshSystemDataFromSupabase(false);
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
        await refreshSystemDataFromSupabase(false);

        const rolesNames = currentSession.roles.map(r => r.codigo).join(' + ');
        if (currentSession.role === 'ADMINISTRADOR') {
            navigateToSection('administracion');
            showToast(`Bienvenido/a ${currentSession.displayName} | Panel de Supervisión General (Roles: ${rolesNames})`);
        } else if (currentSession.role === 'DOCENTE') {
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
    renderDocenteDashboard();
    renderAlumnoDashboard();

    if (newRoleCode === 'ADMINISTRADOR') {
        navigateToSection('administracion');
    } else if (newRoleCode === 'DOCENTE') {
        navigateToSection('evaluacion');
    } else {
        navigateToSection('cargar');
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

function renderTopbarQuickNavForRole(roleCode) {
    const topbarNav = document.getElementById('topbarRoleQuickNav');
    if (!topbarNav) return;

    const activeSec = Array.from(document.querySelectorAll('.app-section.active'))[0]?.id?.replace('section-', '') || 'inicio';

    if (!currentSession || roleCode === 'VISITANTE') {
        topbarNav.innerHTML = `
            <button type="button" class="topbar-nav-pill ${activeSec === 'inicio' ? 'active' : ''}" data-section="inicio" onclick="navigateToSection('inicio')">
                <i class="fa-solid fa-house"></i> <span>Inicio</span>
            </button>
            <button type="button" class="topbar-nav-pill ${activeSec === 'vitrina' ? 'active' : ''}" data-section="vitrina" onclick="navigateToSection('vitrina')">
                <i class="fa-solid fa-compass"></i> <span>Vitrina</span>
            </button>
        `;
        return;
    }

    if (roleCode === 'ALUMNO') {
        topbarNav.innerHTML = `
            <button type="button" class="topbar-nav-pill ${activeSec === 'inicio' ? 'active' : ''}" data-section="inicio" onclick="navigateToSection('inicio')" title="Página Principal">
                <i class="fa-solid fa-house"></i> <span>Inicio</span>
            </button>
            <button type="button" class="topbar-nav-pill ${activeSec === 'vitrina' ? 'active' : ''}" data-section="vitrina" onclick="navigateToSection('vitrina')" title="Vitrina de Proyectos">
                <i class="fa-solid fa-compass"></i> <span>Vitrina</span>
            </button>
            <button type="button" class="topbar-nav-pill" onclick="jumpToAlumnoModule('proyectos')" title="Módulo 1: Mis Proyectos (GitHub / Supabase / Vercel / Local)">
                <i class="fa-solid fa-diagram-project"></i> <span>Mis Proyectos</span>
            </button>
            <button type="button" class="topbar-nav-pill" onclick="jumpToAlumnoModule('calificaciones')" title="Módulo 2: Mis Calificaciones y Devoluciones">
                <i class="fa-solid fa-award"></i> <span>Calificaciones</span>
            </button>
            <button type="button" class="topbar-nav-pill" onclick="jumpToAlumnoModule('asignaturas')" title="Módulo 3: Mis Asignaturas Asignadas">
                <i class="fa-solid fa-book-bookmark"></i> <span>Asignaturas</span>
            </button>
        `;
        return;
    }

    if (roleCode === 'DOCENTE') {
        topbarNav.innerHTML = `
            <button type="button" class="topbar-nav-pill ${activeSec === 'inicio' ? 'active' : ''}" data-section="inicio" onclick="navigateToSection('inicio')">
                <i class="fa-solid fa-house"></i> <span>Inicio</span>
            </button>
            <button type="button" class="topbar-nav-pill ${activeSec === 'vitrina' ? 'active' : ''}" data-section="vitrina" onclick="navigateToSection('vitrina')">
                <i class="fa-solid fa-compass"></i> <span>Vitrina</span>
            </button>
            <button type="button" class="topbar-nav-pill" onclick="jumpToDocenteModule('estudiantes')" title="Módulo 1: Mis Estudiantes">
                <i class="fa-solid fa-user-graduate"></i> <span>Estudiantes</span>
            </button>
            <button type="button" class="topbar-nav-pill" onclick="jumpToDocenteModule('proyectos')" title="Módulo 2: Mis Proyectos">
                <i class="fa-solid fa-diagram-project"></i> <span>Proyectos</span>
            </button>
            <button type="button" class="topbar-nav-pill" onclick="jumpToDocenteModule('asignaturas')" title="Módulo 3: Mis Asignaturas">
                <i class="fa-solid fa-book-bookmark"></i> <span>Asignaturas</span>
            </button>
        `;
        return;
    }

    // ADMINISTRADOR
    topbarNav.innerHTML = `
        <button type="button" class="topbar-nav-pill ${activeSec === 'inicio' ? 'active' : ''}" data-section="inicio" onclick="navigateToSection('inicio')">
            <i class="fa-solid fa-house"></i> <span>Inicio</span>
        </button>
        <button type="button" class="topbar-nav-pill ${activeSec === 'vitrina' ? 'active' : ''}" data-section="vitrina" onclick="navigateToSection('vitrina')">
            <i class="fa-solid fa-compass"></i> <span>Vitrina</span>
        </button>
        <button type="button" class="topbar-nav-pill" onclick="jumpToAdminModule('usuarios')">
            <i class="fa-solid fa-users-gear"></i> <span>Usuarios</span>
        </button>
        <button type="button" class="topbar-nav-pill" onclick="jumpToAdminModule('docentes')">
            <i class="fa-solid fa-chalkboard-user"></i> <span>Docentes</span>
        </button>
        <button type="button" class="topbar-nav-pill" onclick="jumpToAdminModule('alumnos')">
            <i class="fa-solid fa-user-graduate"></i> <span>Alumnos</span>
        </button>
        <button type="button" class="topbar-nav-pill" onclick="jumpToAdminModule('proyectos')">
            <i class="fa-solid fa-diagram-project"></i> <span>Proyectos</span>
        </button>
        <button type="button" class="topbar-nav-pill" onclick="jumpToAdminModule('asignaturas')">
            <i class="fa-solid fa-book-bookmark"></i> <span>Asignaturas</span>
        </button>
    `;
}

function updateAuthUI() {
    const guestActions = document.getElementById('guestActions');
    const loggedActions = document.getElementById('loggedUserActions');
    const sidebarUploadBtn = document.getElementById('sidebarUploadBtn');
    const sidebarEvalBtn = document.getElementById('sidebarEvaluationBtn');
    const sidebarAdminBtn = document.getElementById('sidebarAdminBtn');
    const sidebarAdminQuickGroup = document.getElementById('sidebarAdminQuickGroup');
    const sidebarDocenteQuickGroup = document.getElementById('sidebarDocenteQuickGroup');
    const sidebarAlumnoQuickGroup = document.getElementById('sidebarAlumnoQuickGroup');
    const sidebarRoleContextChip = document.getElementById('sidebarRoleContextChip');
    const sidebarRoleContextText = document.getElementById('sidebarRoleContextText');
    const sidebarLoginBtn = document.getElementById('sidebarLoginBtn');
    const mobileBottomAuthLabel = document.getElementById('mobileBottomAuthLabel');
    const roleSwitcher = document.getElementById('roleSwitcherSelect');

    // 1. MODO VISITANTE (Sin sesión iniciada): ocultar accesos exclusivos de roles
    if (!currentSession) {
        if (guestActions) guestActions.style.display = 'block';
        if (loggedActions) loggedActions.style.display = 'none';
        if (sidebarLoginBtn) sidebarLoginBtn.style.display = 'flex';
        if (mobileBottomAuthLabel) mobileBottomAuthLabel.textContent = 'Acceder';
        if (roleSwitcher) roleSwitcher.style.display = 'none';

        // Personalización automática del Sidebar y Topbar para Visitante
        if (sidebarRoleContextChip) sidebarRoleContextChip.style.display = 'inline-flex';
        if (sidebarRoleContextText) sidebarRoleContextText.textContent = 'MODO VISITANTE';
        if (sidebarUploadBtn) sidebarUploadBtn.style.display = 'none';
        if (sidebarEvalBtn) sidebarEvalBtn.style.display = 'none';
        if (sidebarAdminBtn) sidebarAdminBtn.style.display = 'none';
        if (sidebarAdminQuickGroup) sidebarAdminQuickGroup.style.display = 'none';
        if (sidebarDocenteQuickGroup) sidebarDocenteQuickGroup.style.display = 'none';
        if (sidebarAlumnoQuickGroup) sidebarAlumnoQuickGroup.style.display = 'none';
        renderTopbarQuickNavForRole('VISITANTE');
        return;
    }

    if (guestActions) guestActions.style.display = 'none';
    if (loggedActions) loggedActions.style.display = 'flex';
    if (sidebarLoginBtn) sidebarLoginBtn.style.display = 'none';

    const activeRole = currentSession.role || 'ALUMNO';
    const safeRole = Security.escapeHTML(activeRole);
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
                const selected = r.codigo === activeRole ? 'selected' : '';
                return `<option value="${code}" ${selected}>Rol: ${code}</option>`;
            }).join('');
        } else {
            roleSwitcher.style.display = 'none';
        }
    }

    // 2. PERSONALIZACIÓN AUTOMÁTICA DEL TOPBAR Y SIDEBAR SEGÚN EL ROL ACTIVO (ALUMNO | DOCENTE | ADMINISTRADOR)
    renderTopbarQuickNavForRole(activeRole);

    if (sidebarRoleContextChip) sidebarRoleContextChip.style.display = 'inline-flex';
    if (sidebarRoleContextText) sidebarRoleContextText.textContent = `ROL: ${activeRole}`;

    if (activeRole === 'ADMINISTRADOR') {
        if (sidebarUploadBtn) {
            sidebarUploadBtn.style.display = 'flex';
            sidebarUploadBtn.style.opacity = '1';
        }
        if (sidebarEvalBtn) {
            sidebarEvalBtn.style.display = 'flex';
            sidebarEvalBtn.style.opacity = '1';
        }
        if (sidebarAdminBtn) {
            sidebarAdminBtn.style.display = 'flex';
            sidebarAdminBtn.style.opacity = '1';
        }
        if (sidebarAdminQuickGroup) sidebarAdminQuickGroup.style.display = 'block';
        if (sidebarDocenteQuickGroup) sidebarDocenteQuickGroup.style.display = 'none';
        if (sidebarAlumnoQuickGroup) sidebarAlumnoQuickGroup.style.display = 'none';
    } else if (activeRole === 'DOCENTE') {
        if (sidebarUploadBtn) sidebarUploadBtn.style.display = 'none';
        if (sidebarEvalBtn) {
            sidebarEvalBtn.style.display = 'flex';
            sidebarEvalBtn.style.opacity = '1';
        }
        if (sidebarAdminBtn) sidebarAdminBtn.style.display = 'none';
        if (sidebarAdminQuickGroup) sidebarAdminQuickGroup.style.display = 'none';
        if (sidebarDocenteQuickGroup) sidebarDocenteQuickGroup.style.display = 'block';
        if (sidebarAlumnoQuickGroup) sidebarAlumnoQuickGroup.style.display = 'none';
    } else {
        // ROL ALUMNO
        if (sidebarUploadBtn) {
            sidebarUploadBtn.style.display = 'flex';
            sidebarUploadBtn.style.opacity = '1';
        }
        if (sidebarEvalBtn) sidebarEvalBtn.style.display = 'none';
        if (sidebarAdminBtn) sidebarAdminBtn.style.display = 'none';
        if (sidebarAdminQuickGroup) sidebarAdminQuickGroup.style.display = 'none';
        if (sidebarDocenteQuickGroup) sidebarDocenteQuickGroup.style.display = 'none';
        if (sidebarAlumnoQuickGroup) sidebarAlumnoQuickGroup.style.display = 'block';
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
    renderDocenteDashboard();
    renderAlumnoDashboard();
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
        const isOnline = proj.enProduccionPublica !== false && Boolean(proj.demoUrl);
        const deployBadgeHTML = isOnline
            ? `<span class="deploy-badge-online"><i class="fa-solid fa-globe"></i> En Red: ${Security.escapeHTML(proj.plataformaDespliegue || 'Vercel')}</span>`
            : `<span class="deploy-badge-local"><i class="fa-solid fa-laptop-code"></i> ${Security.escapeHTML(proj.plataformaDespliegue || 'Código / Local')}</span>`;

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
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:0.4rem; flex-wrap:wrap; margin-bottom:0.35rem;">
                        <div class="project-course-tag" style="margin-bottom:0;">${safeDivision} • C.E.N.</div>
                        ${deployBadgeHTML}
                    </div>
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
                                <span>BD: ${Security.escapeHTML(proj.motorBaseDatos || 'Relacional SQL')}</span>
                            </div>
                        </div>

                        <button class="btn btn-outline" style="padding: 0.45rem 0.85rem; font-size: 0.8rem;" onclick="openProjectDetail('${proj.id}')">
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
    const proj = projectsList.find(p => String(p.id) === String(projectId));
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
    const cleanDemoUrl = Security.sanitizeURL(proj.demoUrl);
    const safeModalidad = Security.escapeHTML(proj.modalidadEntrega || 'Despliegue Cloud + GitHub + Base de Datos');
    const safePlataforma = Security.escapeHTML(proj.plataformaDespliegue || 'Vercel');
    const safeMotorBd = Security.escapeHTML(proj.motorBaseDatos || 'Supabase (PostgreSQL)');
    const safeDatabaseUrl = Security.escapeHTML(proj.databaseProyectoUrl || 'Esquema local / No especificado');
    const safeInstrucciones = Security.escapeHTML(proj.instruccionesEjecucion || '');
    const safeSnippet = Security.escapeHTML(proj.snippetCodigoFuente || '');
    const isOnline = proj.enProduccionPublica !== false && Boolean(cleanDemoUrl);

    const techChips = (proj.techs || []).map(t => `<span class="tech-chip" style="font-size:0.82rem; padding:0.35rem 0.8rem;">${Security.escapeHTML(t)}</span>`).join('');

    const content = document.getElementById('projectDetailContent');
    content.innerHTML = `
        <div style="display:flex; flex-wrap:wrap; gap:0.65rem; align-items:center; margin-bottom:0.85rem;">
            <span class="badge-category">${safeCategory}</span>
            <span class="badge-status ${getStatusBadgeClass(proj.status)}">${safeStatus}</span>
            ${isOnline
                ? `<span class="deploy-badge-online"><i class="fa-solid fa-globe"></i> En Funcionamiento Público (${safePlataforma})</span>`
                : `<span class="deploy-badge-local"><i class="fa-solid fa-laptop-code"></i> Entorno Local / Offline (${safePlataforma})</span>`
            }
            <span style="color:var(--text-muted); font-size:0.82rem;"><i class="fa-regular fa-calendar"></i> Presentado: ${safeDate}</span>
            ${proj.grade ? `<span class="grade-pill">Calificación: ${proj.grade} / 10</span>` : ''}
        </div>

        <h2 style="font-family:var(--font-heading); font-size:clamp(1.2rem, 3vw, 1.55rem); color:var(--gold-primary); margin-bottom:0.5rem;">
            ${safeTitle}
        </h2>
        <p style="color:var(--text-secondary); font-size:0.9rem; margin-bottom:1.25rem;">
            <i class="fa-solid fa-users" style="color:var(--gold-primary);"></i> <strong>Equipo Desarrollador (${safeDivision}):</strong> ${safeAuthors}
        </p>

        <div style="display:grid; gap:1.15rem; margin-bottom:1.35rem;">
            <div style="background:var(--bg-surface); padding:1.1rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                <h4 style="color:var(--gold-primary); font-family:var(--font-heading); font-size:0.9rem; margin-bottom:0.45rem;">
                    <i class="fa-solid fa-cloud-arrow-up"></i> INFRAESTRUCTURA DE ENTREGA: REPOSITORIO, BASE DE DATOS Y DESPLIEGUE
                </h4>
                <p style="color:var(--text-secondary); font-size:0.86rem; line-height:1.55;">
                    <strong>Modalidad:</strong> ${safeModalidad}<br>
                    <strong>Hosting / Estado en Red:</strong> ${safePlataforma} (${isOnline ? 'Publicado en vivo en Internet' : 'Ejecución Local / Offline en Laboratorio'})<br>
                    <strong>Motor de Base de Datos:</strong> ${safeMotorBd} • <strong>Referencia BD:</strong> <code>${safeDatabaseUrl}</code>
                    ${safeInstrucciones ? `<br><strong>Guía de Ejecución / Prueba:</strong> ${safeInstrucciones}` : ''}
                </p>
            </div>

            <div style="background:var(--bg-surface); padding:1.1rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                <h4 style="color:var(--gold-primary); font-family:var(--font-heading); font-size:0.9rem; margin-bottom:0.45rem;">
                    <i class="fa-solid fa-laptop-code"></i> DESARROLLO TÉCNICO (PRÁCTICAS PROFESIONALIZANTES)
                </h4>
                <p style="color:var(--text-primary); font-size:0.9rem;">${safeDescription}</p>
            </div>

            <div style="background:var(--bg-surface); padding:1.1rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                <h4 style="color:var(--gold-primary); font-family:var(--font-heading); font-size:0.9rem; margin-bottom:0.45rem;">
                    <i class="fa-solid fa-chart-pie"></i> VIABILIDAD Y GESTIÓN ORGANIZACIONAL (TECNOLOGÍA DE GESTIÓN)
                </h4>
                <p style="color:var(--text-primary); font-size:0.9rem;">${safeManagement}</p>
            </div>

            ${safeSnippet ? `
            <div style="background:var(--bg-surface); padding:1.1rem; border-radius:var(--radius-md); border:1px solid var(--gold-border);">
                <h4 style="color:var(--gold-primary); font-family:var(--font-heading); font-size:0.88rem; margin-bottom:0.35rem;">
                    <i class="fa-solid fa-code"></i> FRAGMENTO DE CÓDIGO FUENTE / ARQUITECTURA COMPARTIDA EN EL SISTEMA
                </h4>
                <pre class="code-snippet-box">${safeSnippet}</pre>
            </div>
            ` : ''}

            ${proj.feedback ? `
            <div style="background:rgba(16, 185, 129, 0.08); padding:1.1rem; border-radius:var(--radius-md); border:1px solid rgba(16, 185, 129, 0.35);">
                <h4 style="color:var(--status-approved); font-size:0.86rem; text-transform:uppercase; margin-bottom:0.35rem;">
                    <i class="fa-solid fa-comment-dots"></i> Devolución del Equipo Docente:
                </h4>
                <p style="color:var(--text-secondary); font-size:0.88rem;">"${safeFeedback}"</p>
            </div>
            ` : ''}
        </div>

        <div style="margin-bottom:1.35rem;">
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

            <div style="display:flex; gap:0.65rem; flex-wrap:wrap;">
                <button class="btn btn-outline" onclick="showToast('Descarga segura iniciada: ${safeAttachment}')">
                    <i class="fa-solid fa-download"></i> Descargar Informe
                </button>
                ${cleanDemoUrl ? `
                <button type="button" class="btn btn-gold-outline" onclick="inspectExternalLink('${cleanDemoUrl}')">
                    <i class="fa-solid fa-globe"></i> Abrir Dominio en Vivo (${safePlataforma})
                </button>
                ` : ''}
                ${cleanRepoUrl ? `
                <button type="button" class="btn btn-primary" onclick="inspectExternalLink('${cleanRepoUrl}')">
                    <i class="fa-brands fa-github"></i> Ver Repositorio GitHub
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

async function handleProjectSubmit(event) {
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

    const techsArray = techsRaw.split(',').map(t => t.trim()).filter(Boolean);

    if (window.ProjectHubAuth && currentSession) {
        try {
            const payload = {
                titulo: title,
                categoria: category,
                division: division,
                autores_resumen: authors,
                descripcion_tecnica: description,
                articulacion_gestion: management,
                tecnologias: techsArray,
                repositorio_url: sanitizedRepoUrl,
                archivo_adjunto_nombre: attachmentName,
                estado: 'En Revisión',
                activo: true
            };
            if (currentSession.role === 'ALUMNO' && currentSession.userId) {
                payload.alumnos_ids = [currentSession.userId];
            }
            await window.ProjectHubAuth.saveProjectRelational(payload);
            await refreshSystemDataFromSupabase(false);
        } catch (err) {
            console.warn('[Upload Project DB]', err);
        }
    } else {
        const newProject = {
            id: Date.now(),
            title,
            category,
            division,
            authors,
            description,
            management,
            techs: techsArray,
            repoUrl: sanitizedRepoUrl,
            attachmentName,
            status: "En Revisión",
            grade: null,
            feedback: "Proyecto recibido en plataforma. Pendiente de evaluación.",
            date: new Date().toLocaleDateString('es-AR')
        };
        projectsList.unshift(newProject);
        saveProjectsToStorage();
        renderAllViews();
    }

    document.getElementById('projectUploadForm').reset();
    document.getElementById('fileDropText').textContent = 'Haz clic aquí para seleccionar el documento del proyecto (Informe PDF, Manual de Usuario o Código .ZIP)';
    Security.generateCSRFToken();

    showToast('¡Proyecto registrado en la Base de Datos Relacional! Redirigiendo a la Vitrina...');
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
                        <button class="btn btn-primary" style="padding:0.38rem 0.7rem; font-size:0.76rem;" onclick="openEvaluationModal('${proj.id}')">
                            <i class="fa-solid fa-pen-to-square"></i> Evaluar
                        </button>
                        <button class="btn btn-ghost" style="padding:0.38rem 0.6rem; font-size:0.76rem;" onclick="openProjectDetail('${proj.id}')" title="Ver Ficha">
                            <i class="fa-solid fa-eye"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openEvaluationModal(projectId) {
    const proj = projectsList.find(p => String(p.id) === String(projectId));
    if (!proj) return;

    document.getElementById('evalProjectId').value = proj.id;
    document.getElementById('evalProjectTitleSubtitle').textContent = `${proj.title} (${proj.authors})`;
    document.getElementById('evalStatus').value = proj.status;
    document.getElementById('evalGrade').value = proj.grade || '';
    document.getElementById('evalFeedback').value = proj.feedback || '';

    openModal('evaluateModal');
}

async function saveTeacherEvaluation(event) {
    event.preventDefault();
    const projectId = document.getElementById('evalProjectId').value;
    const status = document.getElementById('evalStatus').value;
    const grade = parseFloat(document.getElementById('evalGrade').value);
    const feedback = document.getElementById('evalFeedback').value.trim();

    const index = projectsList.findIndex(p => String(p.id) === String(projectId));
    if (index !== -1) {
        projectsList[index].status = status;
        projectsList[index].grade = isNaN(grade) ? null : grade;
        projectsList[index].feedback = feedback;

        if (window.ProjectHubAuth && String(projectId).length > 20) {
            try {
                await window.ProjectHubAuth.saveProjectRelational({
                    id: projectId,
                    estado: status,
                    calificacion: isNaN(grade) ? null : grade,
                    devolucion_docente: feedback
                });
                await refreshSystemDataFromSupabase(false);
            } catch (err) {
                console.warn('[Save Eval Supabase]', err);
            }
        }

        saveProjectsToStorage();
        renderAllViews();
        closeModal('evaluateModal');
        showToast('Evaluación docente guardada en Supabase y publicada.');
    }
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

/* ==========================================================================
   MÓDULO DE SUPERVISIÓN INTEGRAL DEL ADMINISTRADOR (5 SUB-MÓDULOS + CRUD BOOLEANO)
   1) Usuarios | 2) Docentes | 3) Alumnos | 4) Proyectos | 5) Asignaturas
   ========================================================================== */

const selectedAdminIds = {
    USUARIO: new Set(),
    DOCENTE: new Set(),
    ALUMNO: new Set(),
    PROYECTO: new Set(),
    ASIGNATURA: new Set()
};

function getEntityFromTab(tabName) {
    const map = {
        usuarios: 'USUARIO',
        docentes: 'DOCENTE',
        alumnos: 'ALUMNO',
        proyectos: 'PROYECTO',
        asignaturas: 'ASIGNATURA'
    };
    return map[tabName] || 'USUARIO';
}

function switchAdminTab(tabName) {
    activeAdminTab = tabName;

    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.admintab === tabName);
    });

    document.querySelectorAll('.admin-subview').forEach(sub => {
        sub.classList.remove('active');
    });

    const targetSubview = document.getElementById(`admin-subview-${tabName}`);
    if (targetSubview) {
        targetSubview.classList.add('active');
    }

    updateBulkActionBar();
}

function toggleRowSelection(entidad, id, isChecked) {
    const set = selectedAdminIds[entidad];
    if (!set) return;

    if (isChecked) {
        set.add(String(id));
    } else {
        set.delete(String(id));
    }

    renderCurrentAdminEntityTable(entidad);
    updateBulkActionBar();
}

function toggleSelectAllInModule(entidad, isChecked) {
    const set = selectedAdminIds[entidad];
    if (!set) return;

    set.clear();
    if (isChecked) {
        const visibleIds = getFilteredIdsForEntity(entidad);
        visibleIds.forEach(id => set.add(String(id)));
    }

    renderCurrentAdminEntityTable(entidad);
    updateBulkActionBar();
}

function clearModuleSelection() {
    const entidad = getEntityFromTab(activeAdminTab);
    if (selectedAdminIds[entidad]) {
        selectedAdminIds[entidad].clear();
    }
    const selectAllChk = document.getElementById(`selectAll_${entidad}`);
    if (selectAllChk) selectAllChk.checked = false;

    renderCurrentAdminEntityTable(entidad);
    updateBulkActionBar();
}

function getFilteredIdsForEntity(entidad) {
    if (entidad === 'USUARIO') {
        const query = (document.getElementById('adminSearchUsuarios')?.value || '').toLowerCase().trim();
        const filterEstado = document.getElementById('adminFilterEstadoUsuarios')?.value || 'TODOS';
        return systemDB.usuarios.filter(u => {
            const isAct = u.activo !== false;
            if (filterEstado === 'ACTIVOS' && !isAct) return false;
            if (filterEstado === 'INACTIVOS' && isAct) return false;
            if (!query) return true;
            return (
                (u.nombre_completo || '').toLowerCase().includes(query) ||
                (u.dni || '').toLowerCase().includes(query) ||
                (u.email || '').toLowerCase().includes(query) ||
                (u.username || '').toLowerCase().includes(query)
            );
        }).map(u => u.id);
    }
    if (entidad === 'DOCENTE') {
        const query = (document.getElementById('adminSearchDocentes')?.value || '').toLowerCase().trim();
        return systemDB.docentes.filter(d => {
            if (!query) return true;
            return (
                (d.nombre_completo || '').toLowerCase().includes(query) ||
                (d.legajo_docente || '').toLowerCase().includes(query) ||
                (d.especialidad || '').toLowerCase().includes(query) ||
                (d.dni || '').toLowerCase().includes(query)
            );
        }).map(d => d.usuario_id);
    }
    if (entidad === 'ALUMNO') {
        const query = (document.getElementById('adminSearchAlumnos')?.value || '').toLowerCase().trim();
        return systemDB.alumnos.filter(al => {
            if (!query) return true;
            return (
                (al.nombre_completo || '').toLowerCase().includes(query) ||
                (al.matricula_legajo || '').toLowerCase().includes(query) ||
                (al.dni || '').toLowerCase().includes(query) ||
                (al.division || '').toLowerCase().includes(query)
            );
        }).map(al => al.usuario_id);
    }
    if (entidad === 'PROYECTO') {
        const query = (document.getElementById('adminSearchProyectos')?.value || '').toLowerCase().trim();
        return systemDB.proyectos.filter(p => {
            if (!query) return true;
            return (
                (p.titulo || '').toLowerCase().includes(query) ||
                (p.codigo_proyecto || '').toLowerCase().includes(query) ||
                (p.categoria || '').toLowerCase().includes(query)
            );
        }).map(p => p.id);
    }
    if (entidad === 'ASIGNATURA') {
        const query = (document.getElementById('adminSearchAsignaturas')?.value || '').toLowerCase().trim();
        return systemDB.asignaturas.filter(a => {
            if (!query) return true;
            return (
                (a.nombre || '').toLowerCase().includes(query) ||
                (a.codigo || '').toLowerCase().includes(query) ||
                (a.campo_formativo || '').toLowerCase().includes(query)
            );
        }).map(a => a.id);
    }
    return [];
}

function renderCurrentAdminEntityTable(entidad) {
    if (entidad === 'USUARIO') renderAdminUsuariosTable();
    else if (entidad === 'DOCENTE') renderAdminDocentesTable();
    else if (entidad === 'ALUMNO') renderAdminAlumnosTable();
    else if (entidad === 'PROYECTO') renderAdminProyectosTable();
    else if (entidad === 'ASIGNATURA') renderAdminAsignaturasTable();
}

function updateBulkActionBar() {
    const entidad = getEntityFromTab(activeAdminTab);
    const set = selectedAdminIds[entidad] || new Set();
    const count = set.size;

    const bar = document.getElementById('adminBulkActionBar');
    const countPill = document.getElementById('adminBulkCountPill');
    const labelText = document.getElementById('adminBulkLabelText');
    const editBtn = document.getElementById('adminBulkEditBtn');

    if (!bar) return;

    if (count > 0) {
        bar.classList.add('visible');
        if (countPill) countPill.textContent = count;
        if (labelText) {
            labelText.textContent = count === 1
                ? `registro seleccionado en Gestión de ${entidad}`
                : `registros seleccionados en Gestión de ${entidad}`;
        }
        if (editBtn) {
            editBtn.innerHTML = count === 1
                ? `<i class="fa-solid fa-pen-to-square"></i> Editar Seleccionado`
                : `<i class="fa-solid fa-pen-to-square"></i> Editar Primero (${count})`;
        }
    } else {
        bar.classList.remove('visible');
    }
}

async function handleBulkAction(accion) {
    const entidad = getEntityFromTab(activeAdminTab);
    const idsArray = Array.from(selectedAdminIds[entidad] || []);
    if (idsArray.length === 0) {
        showToast('Selecciona al menos un registro marcando la casilla de la izquierda.');
        return;
    }

    if (accion === 'VER_DETALLE') {
        openAdminVerInfoMultiple(entidad, idsArray);
        return;
    }

    if (accion === 'EDITAR') {
        const firstId = idsArray[0];
        if (idsArray.length > 1) {
            showToast(`Abriendo edición del primer registro seleccionado (${idsArray.length} marcados).`);
        }
        if (entidad === 'USUARIO') openAdminUserModal(firstId);
        else if (entidad === 'DOCENTE') openAdminUserModal(firstId, 'DOCENTE');
        else if (entidad === 'ALUMNO') openAdminUserModal(firstId, 'ALUMNO');
        else if (entidad === 'PROYECTO') openAdminProjectModal(firstId);
        else if (entidad === 'ASIGNATURA') openAdminAsignaturaModal(firstId);
        return;
    }

    if (accion === 'ELIMINAR_DEFINITIVO') {
        const confirmMsg = `⚠️ ATENCIÓN (CIBERSEGURIDAD C.E.N.):\n\nSe eliminarán DEFINITIVAMENTE de la base de datos los registros seleccionados (${idsArray.length}) que YA se encuentren en estado INACTIVO (activo = false).\n\nLos registros que aún estén activos no se borrarán por seguridad.\n¿Confirmas la eliminación física definitiva?`;
        if (!window.confirm(confirmMsg)) return;
    }

    try {
        const res = await window.ProjectHubAuth.executeBatchOperation(entidad, idsArray, accion);
        clearModuleSelection();
        await refreshSystemDataFromSupabase(false);

        if (accion === 'ELIMINAR_DEFINITIVO') {
            if (res?.omitidos_por_activos > 0) {
                showToast(`Eliminados definitivos: ${res.procesados}. Omitidos por estar aún Activos: ${res.omitidos_por_activos} (Primero debes Desactivarlos).`);
            } else {
                showToast(`Se eliminaron definitivamente ${res?.procesados || idsArray.length} registros inactivos de la BD.`);
            }
        } else if (accion === 'DESACTIVAR') {
            showToast(`${res?.procesados || idsArray.length} registros pasaron a estado INACTIVO (ya puedes eliminarlos definitivamente si lo requieres).`);
        } else if (accion === 'REACTIVAR') {
            showToast(`${res?.procesados || idsArray.length} registros fueron REACTIVADOS en el sistema.`);
        }
    } catch (err) {
        showToast(err.message || 'No se pudo completar la operación en lote.');
    }
}

function renderAdminSupervisionDashboard() {
    // Actualizar contadores KPI del Administrador
    const kpiUsuarios = document.getElementById('adminKpiUsuarios');
    const kpiDocentes = document.getElementById('adminKpiDocentes');
    const kpiAlumnos = document.getElementById('adminKpiAlumnos');
    const kpiAsignaturas = document.getElementById('adminKpiAsignaturas');

    const activeUsersCount = systemDB.usuarios.filter(u => u.activo !== false).length;
    const activeDocentesCount = systemDB.docentes.filter(d => d.activo !== false).length;
    const activeAlumnosCount = systemDB.alumnos.filter(a => a.activo !== false).length;
    const activeAsignaturasCount = systemDB.asignaturas.filter(asg => asg.activo !== false).length;

    if (kpiUsuarios) kpiUsuarios.textContent = `${activeUsersCount} / ${systemDB.usuarios.length}`;
    if (kpiDocentes) kpiDocentes.textContent = `${activeDocentesCount} / ${systemDB.docentes.length}`;
    if (kpiAlumnos) kpiAlumnos.textContent = `${activeAlumnosCount} / ${systemDB.alumnos.length}`;
    if (kpiAsignaturas) kpiAsignaturas.textContent = `${activeAsignaturasCount} / ${systemDB.asignaturas.length}`;

    // También actualizar el contador de alumnos de la portada principal con los alumnos reales de la BD
    const elHomeStudents = document.getElementById('statTotalStudents');
    if (elHomeStudents && activeAlumnosCount > 0) {
        elHomeStudents.textContent = activeAlumnosCount;
    }

    renderAdminUsuariosTable();
    renderAdminDocentesTable();
    renderAdminAlumnosTable();
    renderAdminProyectosTable();
    renderAdminAsignaturasTable();
    updateBulkActionBar();
}

function renderBooleanBadge(isActive) {
    if (isActive !== false) {
        return `<span class="bool-badge-true"><i class="fa-solid fa-circle-check"></i> ACTIVO</span>`;
    }
    return `<span class="bool-badge-false"><i class="fa-solid fa-ban"></i> INACTIVO</span>`;
}

/* --------------------------------------------------------------------------
   1. RENDERIZADO DE USUARIOS (public.usuarios + public.usuarios_roles)
   -------------------------------------------------------------------------- */
function renderAdminUsuariosTable() {
    const tbody = document.getElementById('adminUsuariosTableBody');
    if (!tbody) return;

    const query = (document.getElementById('adminSearchUsuarios')?.value || '').toLowerCase().trim();
    const filterEstado = document.getElementById('adminFilterEstadoUsuarios')?.value || 'TODOS';

    const filtered = systemDB.usuarios.filter(u => {
        const isAct = u.activo !== false;
        if (filterEstado === 'ACTIVOS' && !isAct) return false;
        if (filterEstado === 'INACTIVOS' && isAct) return false;

        if (!query) return true;
        return (
            (u.nombre_completo || '').toLowerCase().includes(query) ||
            (u.dni || '').toLowerCase().includes(query) ||
            (u.email || '').toLowerCase().includes(query) ||
            (u.username || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron usuarios con ese filtro.</td></tr>`;
        return;
    }

    const selectedSet = selectedAdminIds.USUARIO;

    tbody.innerHTML = filtered.map(u => {
        const isAct = u.activo !== false;
        const isSelected = selectedSet.has(String(u.id));
        const rolesList = Array.isArray(u.roles) ? u.roles : [];
        const rolesChips = rolesList.map(r => `
            <span class="rel-pill" style="${r.es_rol_principal ? 'border-color:var(--gold-primary); color:var(--gold-primary);' : ''}">
                <i class="fa-solid fa-user-tag"></i> ${Security.escapeHTML(r.codigo)}${r.es_rol_principal ? ' ★' : ''}
            </span>
        `).join('');

        const fichas = [];
        if (u.ficha_admin) fichas.push(`<span class="rel-pill"><i class="fa-solid fa-user-shield"></i> ${Security.escapeHTML(u.ficha_admin.legajo_admin)}</span>`);
        if (u.ficha_docente) fichas.push(`<span class="rel-pill"><i class="fa-solid fa-chalkboard-user"></i> ${Security.escapeHTML(u.ficha_docente.legajo_docente)}</span>`);
        if (u.ficha_alumno) fichas.push(`<span class="rel-pill"><i class="fa-solid fa-user-graduate"></i> ${Security.escapeHTML(u.ficha_alumno.matricula_legajo)}</span>`);

        return `
            <tr class="${isAct ? '' : 'row-inactivo'} ${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleRowSelection('USUARIO', '${u.id}', this.checked)">
                </td>
                <td>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(u.nombre_completo)}</strong>
                    <span style="font-size:0.75rem; color:var(--gold-primary);">@${Security.escapeHTML(u.username)} • DNI: ${Security.escapeHTML(u.dni)}</span>
                </td>
                <td>
                    <div style="font-size:0.82rem;">${Security.escapeHTML(u.email)}</div>
                    <small style="color:var(--text-muted);">${Security.escapeHTML(u.telefono || 'Sin tel.')} • ${Security.escapeHTML(u.localidad || 'Nonogasta')}</small>
                </td>
                <td><div class="rel-pill-list">${rolesChips || '<span style="color:var(--text-muted);">Sin rol</span>'}</div></td>
                <td><div class="rel-pill-list">${fichas.join('') || '<span style="color:var(--text-muted);">Básica</span>'}</div></td>
                <td>${renderBooleanBadge(isAct)}</td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('USUARIO', '${u.id}')" title="Ver Ficha Relacional Completa">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminUserModal('${u.id}')" title="Editar Usuario y Roles">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('USUARIO', '${u.id}', false, '${Security.escapeHTML(u.nombre_completo)}')" title="Desactivar (Pasa a estado Inactivo)">
                                <i class="fa-solid fa-power-off"></i> Desactivar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('USUARIO', '${u.id}', true, '${Security.escapeHTML(u.nombre_completo)}')" title="Reactivar a estado Activo">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
                            </button>
                            <button class="btn-action-sm btn-action-hard-delete" onclick="handleAdminHardDelete('USUARIO', '${u.id}', '${Security.escapeHTML(u.nombre_completo)}')" title="Eliminar definitivamente de la base de datos">
                                <i class="fa-solid fa-trash-can"></i> Eliminar Definitivo
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   2. RENDERIZADO DE DOCENTES (CON PROYECTOS, ALUMNOS Y ASIGNATURAS)
   -------------------------------------------------------------------------- */
function renderAdminDocentesTable() {
    const tbody = document.getElementById('adminDocentesTableBody');
    if (!tbody) return;

    const query = (document.getElementById('adminSearchDocentes')?.value || '').toLowerCase().trim();

    const filtered = systemDB.docentes.filter(d => {
        if (!query) return true;
        return (
            (d.nombre_completo || '').toLowerCase().includes(query) ||
            (d.legajo_docente || '').toLowerCase().includes(query) ||
            (d.especialidad || '').toLowerCase().includes(query) ||
            (d.dni || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron docentes registrados.</td></tr>`;
        return;
    }

    const selectedSet = selectedAdminIds.DOCENTE;

    tbody.innerHTML = filtered.map(d => {
        const isAct = d.activo !== false;
        const isSelected = selectedSet.has(String(d.usuario_id));
        const asigsHTML = (d.asignaturas_rel || []).map(a => `
            <span class="rel-pill"><i class="fa-solid fa-book"></i> ${Security.escapeHTML(a.nombre)} (${Security.escapeHTML(a.rol_catedra)})</span>
        `).join('');

        const proysHTML = (d.proyectos_rel || []).map(p => `
            <span class="rel-pill"><i class="fa-solid fa-diagram-project"></i> ${Security.escapeHTML(p.codigo_proyecto)}: ${Security.escapeHTML(p.titulo.substring(0, 28))}...</span>
        `).join('');

        const alusHTML = (d.alumnos_rel || []).map(al => `
            <span class="rel-pill"><i class="fa-solid fa-user-graduate"></i> ${Security.escapeHTML(al.nombre_completo)} (${Security.escapeHTML(al.curso)})</span>
        `).join('');

        return `
            <tr class="${isAct ? '' : 'row-inactivo'} ${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleRowSelection('DOCENTE', '${d.usuario_id}', this.checked)">
                </td>
                <td>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(d.nombre_completo)}</strong>
                    <span style="font-size:0.75rem; color:var(--gold-primary);">Legajo: ${Security.escapeHTML(d.legajo_docente)} • ${Security.escapeHTML(d.situacion_revista)}</span>
                    <div style="font-size:0.74rem; color:var(--text-muted);">${Security.escapeHTML(d.titulo_profesional)}</div>
                </td>
                <td><div class="rel-pill-list">${asigsHTML || '<span style="color:var(--text-muted);">Sin asignaturas</span>'}</div></td>
                <td><div class="rel-pill-list">${proysHTML || '<span style="color:var(--text-muted);">Sin proyectos</span>'}</div></td>
                <td><div class="rel-pill-list">${alusHTML || '<span style="color:var(--text-muted);">Sin alumnos</span>'}</div></td>
                <td>${renderBooleanBadge(isAct)}</td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('DOCENTE', '${d.usuario_id}')">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminUserModal('${d.usuario_id}', 'DOCENTE')">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('DOCENTE', '${d.usuario_id}', false, '${Security.escapeHTML(d.nombre_completo)}')">
                                <i class="fa-solid fa-power-off"></i> Desactivar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('DOCENTE', '${d.usuario_id}', true, '${Security.escapeHTML(d.nombre_completo)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
                            </button>
                            <button class="btn-action-sm btn-action-hard-delete" onclick="handleAdminHardDelete('DOCENTE', '${d.usuario_id}', '${Security.escapeHTML(d.nombre_completo)}')">
                                <i class="fa-solid fa-trash-can"></i> Eliminar Definitivo
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   3. RENDERIZADO DE ALUMNOS (CON PROYECTOS, DOCENTES Y ASIGNATURAS)
   -------------------------------------------------------------------------- */
function renderAdminAlumnosTable() {
    const tbody = document.getElementById('adminAlumnosTableBody');
    if (!tbody) return;

    const query = (document.getElementById('adminSearchAlumnos')?.value || '').toLowerCase().trim();

    const filtered = systemDB.alumnos.filter(al => {
        if (!query) return true;
        return (
            (al.nombre_completo || '').toLowerCase().includes(query) ||
            (al.matricula_legajo || '').toLowerCase().includes(query) ||
            (al.dni || '').toLowerCase().includes(query) ||
            (al.division || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron alumnos registrados.</td></tr>`;
        return;
    }

    const selectedSet = selectedAdminIds.ALUMNO;

    tbody.innerHTML = filtered.map(al => {
        const isAct = al.activo !== false;
        const isSelected = selectedSet.has(String(al.usuario_id));
        const proysHTML = (al.proyectos_rel || []).map(p => `
            <span class="rel-pill"><i class="fa-solid fa-laptop-code"></i> ${Security.escapeHTML(p.titulo.substring(0, 30))}... (${Security.escapeHTML(p.estado)})</span>
        `).join('');

        const docsHTML = (al.docentes_rel || []).map(d => `
            <span class="rel-pill"><i class="fa-solid fa-chalkboard-user"></i> Prof. ${Security.escapeHTML(d.nombre_completo)}</span>
        `).join('');

        const asigsHTML = (al.asignaturas_rel || []).map(a => `
            <span class="rel-pill"><i class="fa-solid fa-book-bookmark"></i> ${Security.escapeHTML(a.nombre)}</span>
        `).join('');

        return `
            <tr class="${isAct ? '' : 'row-inactivo'} ${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleRowSelection('ALUMNO', '${al.usuario_id}', this.checked)">
                </td>
                <td>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(al.nombre_completo)}</strong>
                    <span style="font-size:0.75rem; color:var(--gold-primary);">Matrícula: ${Security.escapeHTML(al.matricula_legajo)} • ${al.anio_cursado}° "${Security.escapeHTML(al.division)}" (${Security.escapeHTML(al.turno)})</span>
                    <div style="font-size:0.74rem; color:var(--text-muted);">DNI: ${Security.escapeHTML(al.dni)} ${al.promedio_general ? `• Promedio: ${al.promedio_general}` : ''}</div>
                </td>
                <td><div class="rel-pill-list">${proysHTML || '<span style="color:var(--text-muted);">Sin proyecto asignado</span>'}</div></td>
                <td><div class="rel-pill-list">${docsHTML || '<span style="color:var(--text-muted);">Sin docentes asignados</span>'}</div></td>
                <td><div class="rel-pill-list">${asigsHTML || '<span style="color:var(--text-muted);">Sin asignaturas</span>'}</div></td>
                <td>${renderBooleanBadge(isAct)}</td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('ALUMNO', '${al.usuario_id}')">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminUserModal('${al.usuario_id}', 'ALUMNO')">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('ALUMNO', '${al.usuario_id}', false, '${Security.escapeHTML(al.nombre_completo)}')">
                                <i class="fa-solid fa-power-off"></i> Desactivar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('ALUMNO', '${al.usuario_id}', true, '${Security.escapeHTML(al.nombre_completo)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
                            </button>
                            <button class="btn-action-sm btn-action-hard-delete" onclick="handleAdminHardDelete('ALUMNO', '${al.usuario_id}', '${Security.escapeHTML(al.nombre_completo)}')">
                                <i class="fa-solid fa-trash-can"></i> Eliminar Definitivo
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   4. RENDERIZADO DE PROYECTOS (CON ALUMNOS, DOCENTES Y ASIGNATURAS)
   -------------------------------------------------------------------------- */
function renderAdminProyectosTable() {
    const tbody = document.getElementById('adminProyectosTableBody');
    if (!tbody) return;

    const query = (document.getElementById('adminSearchProyectos')?.value || '').toLowerCase().trim();

    const filtered = systemDB.proyectos.filter(p => {
        if (!query) return true;
        return (
            (p.titulo || '').toLowerCase().includes(query) ||
            (p.codigo_proyecto || '').toLowerCase().includes(query) ||
            (p.categoria || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron proyectos registrados.</td></tr>`;
        return;
    }

    const selectedSet = selectedAdminIds.PROYECTO;

    tbody.innerHTML = filtered.map(p => {
        const isAct = p.activo !== false;
        const isSelected = selectedSet.has(String(p.id));
        const alusHTML = (p.alumnos_rel || []).map(a => `
            <span class="rel-pill"><i class="fa-solid fa-user-graduate"></i> ${Security.escapeHTML(a.nombre_completo)}</span>
        `).join('');

        const docsHTML = (p.docentes_rel || []).map(d => `
            <span class="rel-pill"><i class="fa-solid fa-chalkboard-user"></i> ${Security.escapeHTML(d.nombre_completo)}</span>
        `).join('');

        const asigsHTML = (p.asignaturas_rel || []).map(asg => `
            <span class="rel-pill"><i class="fa-solid fa-book"></i> ${Security.escapeHTML(asg.nombre)}</span>
        `).join('');

        return `
            <tr class="${isAct ? '' : 'row-inactivo'} ${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleRowSelection('PROYECTO', '${p.id}', this.checked)">
                </td>
                <td>
                    <span class="badge-category" style="margin-bottom:0.25rem; display:inline-block;">${Security.escapeHTML(p.codigo_proyecto)} • ${Security.escapeHTML(p.categoria)}</span>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(p.titulo)}</strong>
                    <small style="color:var(--text-muted);">${Security.escapeHTML(p.division)}</small>
                </td>
                <td><div class="rel-pill-list">${alusHTML || Security.escapeHTML(p.autores_resumen || 'Sin alumnos')}</div></td>
                <td><div class="rel-pill-list">${docsHTML || '<span style="color:var(--text-muted);">Sin asignar</span>'}</div></td>
                <td><div class="rel-pill-list">${asigsHTML || '<span style="color:var(--text-muted);">Sin vincular</span>'}</div></td>
                <td>
                    <span class="badge-status ${getStatusBadgeClass(p.estado)}">${Security.escapeHTML(p.estado)}</span>
                    ${p.calificacion ? `<div style="margin-top:0.3rem;"><span class="grade-pill">${p.calificacion}/10</span></div>` : ''}
                </td>
                <td>${renderBooleanBadge(isAct)}</td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('PROYECTO', '${p.id}')">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminProjectModal('${p.id}')">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('PROYECTO', '${p.id}', false, '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-power-off"></i> Desactivar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('PROYECTO', '${p.id}', true, '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
                            </button>
                            <button class="btn-action-sm btn-action-hard-delete" onclick="handleAdminHardDelete('PROYECTO', '${p.id}', '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-trash-can"></i> Eliminar Definitivo
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   5. RENDERIZADO DE ASIGNATURAS (CON DOCENTES, ALUMNOS Y PROYECTOS)
   -------------------------------------------------------------------------- */
function renderAdminAsignaturasTable() {
    const tbody = document.getElementById('adminAsignaturasTableBody');
    if (!tbody) return;

    const query = (document.getElementById('adminSearchAsignaturas')?.value || '').toLowerCase().trim();

    const filtered = systemDB.asignaturas.filter(a => {
        if (!query) return true;
        return (
            (a.nombre || '').toLowerCase().includes(query) ||
            (a.codigo || '').toLowerCase().includes(query) ||
            (a.campo_formativo || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron asignaturas registradas.</td></tr>`;
        return;
    }

    const selectedSet = selectedAdminIds.ASIGNATURA;

    tbody.innerHTML = filtered.map(a => {
        const isAct = a.activo !== false;
        const isSelected = selectedSet.has(String(a.id));
        const docsHTML = (a.docentes_rel || []).map(d => `
            <span class="rel-pill"><i class="fa-solid fa-chalkboard-user"></i> ${Security.escapeHTML(d.nombre_completo)} (${Security.escapeHTML(d.rol_catedra)})</span>
        `).join('');

        const alusHTML = (a.alumnos_rel || []).map(al => `
            <span class="rel-pill"><i class="fa-solid fa-user-graduate"></i> ${Security.escapeHTML(al.nombre_completo)}</span>
        `).join('');

        const proysHTML = (a.proyectos_rel || []).map(p => `
            <span class="rel-pill"><i class="fa-solid fa-diagram-project"></i> ${Security.escapeHTML(p.codigo_proyecto)}: ${Security.escapeHTML(p.titulo.substring(0, 24))}...</span>
        `).join('');

        return `
            <tr class="${isAct ? '' : 'row-inactivo'} ${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleRowSelection('ASIGNATURA', '${a.id}', this.checked)">
                </td>
                <td>
                    <span class="badge-category" style="margin-bottom:0.25rem; display:inline-block;">${Security.escapeHTML(a.codigo)}</span>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(a.nombre)}</strong>
                    <small style="color:var(--gold-primary);">${Security.escapeHTML(a.campo_formativo)}</small>
                </td>
                <td>
                    <strong>${a.anio_cursado}° Año (Div: ${Security.escapeHTML(a.division)})</strong>
                    <div style="font-size:0.76rem; color:var(--text-muted);">${a.carga_horaria_semanal} hs/sem • ${Security.escapeHTML(a.regimen)}</div>
                </td>
                <td><div class="rel-pill-list">${docsHTML || '<span style="color:var(--text-muted);">Sin docente</span>'}</div></td>
                <td><div class="rel-pill-list">${alusHTML || '<span style="color:var(--text-muted);">Sin alumnos</span>'}</div></td>
                <td><div class="rel-pill-list">${proysHTML || '<span style="color:var(--text-muted);">Sin proyectos</span>'}</div></td>
                <td>${renderBooleanBadge(isAct)}</td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('ASIGNATURA', '${a.id}')">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminAsignaturaModal('${a.id}')">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('ASIGNATURA', '${a.id}', false, '${Security.escapeHTML(a.nombre)}')">
                                <i class="fa-solid fa-power-off"></i> Desactivar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('ASIGNATURA', '${a.id}', true, '${Security.escapeHTML(a.nombre)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
                            </button>
                            <button class="btn-action-sm btn-action-hard-delete" onclick="handleAdminHardDelete('ASIGNATURA', '${a.id}', '${Security.escapeHTML(a.nombre)}')">
                                <i class="fa-solid fa-trash-can"></i> Eliminar Definitivo
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* ==========================================================================
   ACCIÓN BOOLEANA (DESACTIVAR / REACTIVAR) Y ELIMINACIÓN DEFINITIVA DE BD
   ========================================================================== */
async function handleAdminToggleBoolean(entidad, id, nuevoEstado, nombreEtiqueta) {
    if (!window.ProjectHubAuth) return;

    try {
        await window.ProjectHubAuth.toggleEntityBooleanState(entidad, id, nuevoEstado);
        await refreshSystemDataFromSupabase(false);
        const accionTexto = nuevoEstado
            ? `Reactivado (activo = true): ${nombreEtiqueta}`
            : `Desactivado a estado INACTIVO (activo = false): ${nombreEtiqueta}. Ahora tienes disponible "Eliminar Definitivo" si deseas borrarlo de la BD.`;
        showToast(accionTexto);
    } catch (err) {
        showToast(err.message || 'No se pudo cambiar el estado booleano en la base de datos.');
    }
}

async function handleAdminHardDelete(entidad, id, nombreEtiqueta) {
    if (!window.ProjectHubAuth) return;

    const confirmMsg = `⚠️ CONFIRMACIÓN DE ELIMINACIÓN DEFINITIVA DE LA BASE DE DATOS:\n\nEl registro "${nombreEtiqueta}" (${entidad}) ya se encuentra en estado INACTIVO.\n\n¿Deseas eliminarlo COMPLETAMENTE y de forma permanente de Supabase PostgreSQL? Esta acción no se puede deshacer.`;
    if (!window.confirm(confirmMsg)) return;

    try {
        const res = await window.ProjectHubAuth.hardDeleteInactiveEntity(entidad, id);
        selectedAdminIds[entidad]?.delete(String(id));
        await refreshSystemDataFromSupabase(false);
        showToast(res?.mensaje || `Registro eliminado definitivamente de la base de datos: ${nombreEtiqueta}`);
    } catch (err) {
        showToast(err.message || 'No se pudo eliminar definitivamente el registro.');
    }
}

function openAdminVerInfoMultiple(entidad, idsArray) {
    if (!idsArray || idsArray.length === 0) return;
    if (idsArray.length === 1) {
        openAdminVerInfo(entidad, idsArray[0]);
        return;
    }

    const content = document.getElementById('adminVerInfoContent');
    if (!content) return;

    const cardsHTML = idsArray.map((id, idx) => {
        if (entidad === 'USUARIO') {
            const u = systemDB.usuarios.find(x => String(x.id) === String(id));
            if (!u) return '';
            const roles = (u.roles || []).map(r => r.codigo).join(', ');
            return `
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border); margin-bottom:0.75rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:var(--gold-primary); font-size:0.95rem;">#${idx + 1} • ${Security.escapeHTML(u.nombre_completo)} (@${Security.escapeHTML(u.username)})</strong>
                        ${renderBooleanBadge(u.activo)}
                    </div>
                    <p style="font-size:0.83rem; color:var(--text-secondary); margin-top:0.35rem;">
                        DNI: <strong>${Security.escapeHTML(u.dni)}</strong> | Email: <strong>${Security.escapeHTML(u.email)}</strong> | Roles: <strong>${Security.escapeHTML(roles)}</strong>
                    </p>
                </div>
            `;
        }
        if (entidad === 'DOCENTE') {
            const d = systemDB.docentes.find(x => String(x.usuario_id) === String(id));
            if (!d) return '';
            return `
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border); margin-bottom:0.75rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:var(--gold-primary); font-size:0.95rem;">#${idx + 1} • Prof. ${Security.escapeHTML(d.nombre_completo)} (${Security.escapeHTML(d.legajo_docente)})</strong>
                        ${renderBooleanBadge(d.activo)}
                    </div>
                    <p style="font-size:0.83rem; color:var(--text-secondary); margin-top:0.35rem;">
                        Título: <strong>${Security.escapeHTML(d.titulo_profesional)}</strong> | Asignaturas: ${(d.asignaturas_rel || []).length} | Proyectos: ${(d.proyectos_rel || []).length} | Alumnos: ${(d.alumnos_rel || []).length}
                    </p>
                </div>
            `;
        }
        if (entidad === 'ALUMNO') {
            const al = systemDB.alumnos.find(x => String(x.usuario_id) === String(id));
            if (!al) return '';
            return `
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border); margin-bottom:0.75rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:var(--gold-primary); font-size:0.95rem;">#${idx + 1} • ${Security.escapeHTML(al.nombre_completo)} (${Security.escapeHTML(al.matricula_legajo)})</strong>
                        ${renderBooleanBadge(al.activo)}
                    </div>
                    <p style="font-size:0.83rem; color:var(--text-secondary); margin-top:0.35rem;">
                        Curso: <strong>${al.anio_cursado}° "${Security.escapeHTML(al.division)}"</strong> | Proyectos: ${(al.proyectos_rel || []).length} | Docentes: ${(al.docentes_rel || []).length} | Asignaturas: ${(al.asignaturas_rel || []).length}
                    </p>
                </div>
            `;
        }
        if (entidad === 'PROYECTO') {
            const p = systemDB.proyectos.find(x => String(x.id) === String(id));
            if (!p) return '';
            return `
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border); margin-bottom:0.75rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:var(--gold-primary); font-size:0.95rem;">#${idx + 1} • ${Security.escapeHTML(p.codigo_proyecto)} - ${Security.escapeHTML(p.titulo)}</strong>
                        ${renderBooleanBadge(p.activo)}
                    </div>
                    <p style="font-size:0.83rem; color:var(--text-secondary); margin-top:0.35rem;">
                        Categoría: <strong>${Security.escapeHTML(p.categoria)}</strong> | Dictamen: <strong>${Security.escapeHTML(p.estado)}</strong> | Alumnos: ${(p.alumnos_rel || []).length}
                    </p>
                </div>
            `;
        }
        if (entidad === 'ASIGNATURA') {
            const a = systemDB.asignaturas.find(x => String(x.id) === String(id));
            if (!a) return '';
            return `
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border); margin-bottom:0.75rem;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <strong style="color:var(--gold-primary); font-size:0.95rem;">#${idx + 1} • ${Security.escapeHTML(a.codigo)} - ${Security.escapeHTML(a.nombre)}</strong>
                        ${renderBooleanBadge(a.activo)}
                    </div>
                    <p style="font-size:0.83rem; color:var(--text-secondary); margin-top:0.35rem;">
                        Campo: <strong>${Security.escapeHTML(a.campo_formativo)}</strong> | Carga: ${a.carga_horaria_semanal} hs | Docentes: ${(a.docentes_rel || []).length} | Alumnos: ${(a.alumnos_rel || []).length}
                    </p>
                </div>
            `;
        }
        return '';
    }).join('');

    content.innerHTML = `
        <div class="login-header" style="text-align:left; border-bottom:1px solid var(--gold-border); padding-bottom:0.9rem; margin-bottom:1.1rem;">
            <span class="badge-category">Inspección Múltiple • ${idsArray.length} Registros Seleccionados (${entidad})</span>
            <h3 style="color:var(--gold-primary); font-size:1.3rem; margin-top:0.3rem;">Detalle Comparativo de Selección</h3>
        </div>
        <div style="max-height:420px; overflow-y:auto; padding-right:0.3rem;">
            ${cardsHTML}
        </div>
        <div style="margin-top:1.2rem; display:flex; justify-content:flex-end;">
            <button class="btn btn-primary" onclick="closeModal('adminVerInfoModal')">
                <i class="fa-solid fa-check"></i> Cerrar Vista Múltiple
            </button>
        </div>
    `;
    openModal('adminVerInfoModal');
}

/* ==========================================================================
   MODAL "VER INFO" RELACIONAL COMPLETA (PARA LAS 5 ENTIDADES)
   ========================================================================== */
function openAdminVerInfo(entidad, id) {
    const content = document.getElementById('adminVerInfoContent');
    if (!content) return;

    let html = '';

    if (entidad === 'USUARIO') {
        const u = systemDB.usuarios.find(x => String(x.id) === String(id));
        if (!u) return;
        const roles = (u.roles || []).map(r => `<span class="badge-category">${Security.escapeHTML(r.codigo)}${r.es_rol_principal ? ' (Principal)' : ''}</span>`).join(' ');
        html = `
            <div class="login-header" style="text-align:left; border-bottom:1px solid var(--gold-border); padding-bottom:0.9rem; margin-bottom:1.1rem;">
                <span class="badge-category">VerInfo • Entidad Principal public.usuarios</span>
                <h3 style="color:var(--gold-primary); font-size:1.35rem; margin-top:0.3rem;">${Security.escapeHTML(u.nombre_completo)}</h3>
                <p style="color:var(--text-secondary);">Estado Booleano: ${renderBooleanBadge(u.activo)}</p>
            </div>
            <div style="display:grid; gap:1rem;">
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary); display:block; margin-bottom:0.4rem;">Atributos Personales y de Seguridad:</strong>
                    <p style="font-size:0.86rem; color:var(--text-secondary);">
                        <strong>UUID:</strong> <code>${Security.escapeHTML(u.id)}</code><br>
                        <strong>DNI:</strong> ${Security.escapeHTML(u.dni)} • <strong>CUIL:</strong> ${Security.escapeHTML(u.cuil || 'No registrado')}<br>
                        <strong>Usuario:</strong> @${Security.escapeHTML(u.username)} • <strong>Email:</strong> ${Security.escapeHTML(u.email)}<br>
                        <strong>Teléfono:</strong> ${Security.escapeHTML(u.telefono || 'No registrado')} • <strong>Domicilio:</strong> ${Security.escapeHTML(u.domicilio || 'No registrado')} (${Security.escapeHTML(u.localidad || 'Nonogasta')})<br>
                        <strong>Roles Asignados en <code>usuarios_roles</code>:</strong> ${roles}
                    </p>
                </div>
                ${u.ficha_admin ? `<div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);"><strong style="color:var(--gold-primary);">Ficha Administrador (${Security.escapeHTML(u.ficha_admin.legajo_admin)}):</strong><p style="font-size:0.85rem;">Cargo: ${Security.escapeHTML(u.ficha_admin.cargo_institucional)} | Área: ${Security.escapeHTML(u.ficha_admin.departamento_area)}</p></div>` : ''}
                ${u.ficha_docente ? `<div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);"><strong style="color:var(--gold-primary);">Ficha Docente (${Security.escapeHTML(u.ficha_docente.legajo_docente)}):</strong><p style="font-size:0.85rem;">Título: ${Security.escapeHTML(u.ficha_docente.titulo_profesional)} | Especialidad: ${Security.escapeHTML(u.ficha_docente.especialidad)}</p></div>` : ''}
                ${u.ficha_alumno ? `<div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);"><strong style="color:var(--gold-primary);">Ficha Alumno (${Security.escapeHTML(u.ficha_alumno.matricula_legajo)}):</strong><p style="font-size:0.85rem;">Curso: ${u.ficha_alumno.anio_cursado}° "${Security.escapeHTML(u.ficha_alumno.division)}" | Tutor Legal: ${Security.escapeHTML(u.ficha_alumno.tutor_legal_nombre || 'N/A')}</p></div>` : ''}
            </div>
        `;
    } else if (entidad === 'DOCENTE') {
        const d = systemDB.docentes.find(x => String(x.usuario_id) === String(id));
        if (!d) return;
        const asigs = (d.asignaturas_rel || []).map(a => `<li><strong>${Security.escapeHTML(a.codigo)} - ${Security.escapeHTML(a.nombre)}</strong> (${Security.escapeHTML(a.rol_catedra)})</li>`).join('');
        const proys = (d.proyectos_rel || []).map(p => `<li><strong>${Security.escapeHTML(p.codigo_proyecto)} - ${Security.escapeHTML(p.titulo)}</strong> [${Security.escapeHTML(p.estado)}] (${Security.escapeHTML(p.rol_supervision)})</li>`).join('');
        const alus = (d.alumnos_rel || []).map(a => `<li><strong>${Security.escapeHTML(a.nombre_completo)}</strong> (Matrícula: ${Security.escapeHTML(a.matricula_legajo)} - Curso: ${Security.escapeHTML(a.curso)}) - ${Security.escapeHTML(a.tipo_tutoria)}</li>`).join('');

        html = `
            <div class="login-header" style="text-align:left; border-bottom:1px solid var(--gold-border); padding-bottom:0.9rem; margin-bottom:1.1rem;">
                <span class="badge-category">VerInfo • Supervisión Relacional de Docente</span>
                <h3 style="color:var(--gold-primary); font-size:1.35rem; margin-top:0.3rem;">Prof. ${Security.escapeHTML(d.nombre_completo)}</h3>
                <p style="color:var(--text-secondary);">Legajo: <strong>${Security.escapeHTML(d.legajo_docente)}</strong> • DNI: <strong>${Security.escapeHTML(d.dni)}</strong> • ${renderBooleanBadge(d.activo)}</p>
            </div>
            <div style="display:grid; gap:1rem; font-size:0.86rem;">
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-graduation-cap"></i> Datos Académicos y Profesionales:</strong>
                    <p style="margin-top:0.3rem; color:var(--text-secondary);">
                        Título: <strong>${Security.escapeHTML(d.titulo_profesional)}</strong> | Especialidad: <strong>${Security.escapeHTML(d.especialidad)}</strong><br>
                        Situación de Revista: ${Security.escapeHTML(d.situacion_revista)} | Carga Horaria: ${d.carga_horaria_semanal || 12} hs semanales | Correo: ${Security.escapeHTML(d.email)}
                    </p>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-book"></i> Asignaturas que Dicta (${(d.asignaturas_rel || []).length}):</strong>
                    <ul style="margin:0.4rem 0 0 1.2rem; color:var(--text-secondary);">${asigs || '<li>Sin asignaturas asignadas</li>'}</ul>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-diagram-project"></i> Proyectos que Supervisa / Evalúa (${(d.proyectos_rel || []).length}):</strong>
                    <ul style="margin:0.4rem 0 0 1.2rem; color:var(--text-secondary);">${proys || '<li>Sin proyectos asignados</li>'}</ul>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-user-graduate"></i> Alumnos Asignados bajo Tutoría (${(d.alumnos_rel || []).length}):</strong>
                    <ul style="margin:0.4rem 0 0 1.2rem; color:var(--text-secondary);">${alus || '<li>Sin alumnos asignados</li>'}</ul>
                </div>
            </div>
        `;
    } else if (entidad === 'ALUMNO') {
        const al = systemDB.alumnos.find(x => String(x.usuario_id) === String(id));
        if (!al) return;
        const proys = (al.proyectos_rel || []).map(p => `<li><strong>${Security.escapeHTML(p.codigo_proyecto)} - ${Security.escapeHTML(p.titulo)}</strong> (${Security.escapeHTML(p.rol_en_proyecto)}) - Estado: ${Security.escapeHTML(p.estado)} ${p.calificacion ? `[Nota: ${p.calificacion}/10]` : ''}</li>`).join('');
        const docs = (al.docentes_rel || []).map(d => `<li><strong>Prof. ${Security.escapeHTML(d.nombre_completo)}</strong> (Legajo: ${Security.escapeHTML(d.legajo_docente)}) - ${Security.escapeHTML(d.tipo_tutoria)}</li>`).join('');
        const asigs = (al.asignaturas_rel || []).map(a => `<li><strong>${Security.escapeHTML(a.codigo)} - ${Security.escapeHTML(a.nombre)}</strong> (${Security.escapeHTML(a.condicion_cursada)}) ${a.calificacion_cursada ? `- Nota Cursada: ${a.calificacion_cursada}` : ''}</li>`).join('');

        html = `
            <div class="login-header" style="text-align:left; border-bottom:1px solid var(--gold-border); padding-bottom:0.9rem; margin-bottom:1.1rem;">
                <span class="badge-category">VerInfo • Supervisión Relacional de Alumno</span>
                <h3 style="color:var(--gold-primary); font-size:1.35rem; margin-top:0.3rem;">${Security.escapeHTML(al.nombre_completo)}</h3>
                <p style="color:var(--text-secondary);">Matrícula: <strong>${Security.escapeHTML(al.matricula_legajo)}</strong> • Curso: <strong>${al.anio_cursado}° "${Security.escapeHTML(al.division)}"</strong> • ${renderBooleanBadge(al.activo)}</p>
            </div>
            <div style="display:grid; gap:1rem; font-size:0.86rem;">
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-id-card"></i> Ficha Académica y Familiar:</strong>
                    <p style="margin-top:0.3rem; color:var(--text-secondary);">
                        DNI: <strong>${Security.escapeHTML(al.dni)}</strong> | Email: <strong>${Security.escapeHTML(al.email)}</strong> | Promedio General: <strong>${al.promedio_general || 'S/C'}</strong><br>
                        Equipo / Rol Técnico: ${Security.escapeHTML(al.nombre_equipo_proyecto || 'General')} (${Security.escapeHTML(al.rol_en_equipo || 'Desarrollador')})<br>
                        Tutor Legal: <strong>${Security.escapeHTML(al.tutor_legal_nombre || 'No especificado')}</strong> (Tel: ${Security.escapeHTML(al.tutor_legal_telefono || 'N/A')})
                    </p>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-diagram-project"></i> Proyectos Agregados / Participación (${(al.proyectos_rel || []).length}):</strong>
                    <ul style="margin:0.4rem 0 0 1.2rem; color:var(--text-secondary);">${proys || '<li>Sin proyectos vinculados</li>'}</ul>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-chalkboard-user"></i> Docentes Asignados (${(al.docentes_rel || []).length}):</strong>
                    <ul style="margin:0.4rem 0 0 1.2rem; color:var(--text-secondary);">${docs || '<li>Sin docentes asignados</li>'}</ul>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-book-bookmark"></i> Asignaturas que Cursa (${(al.asignaturas_rel || []).length}):</strong>
                    <ul style="margin:0.4rem 0 0 1.2rem; color:var(--text-secondary);">${asigs || '<li>Sin asignaturas vinculadas</li>'}</ul>
                </div>
            </div>
        `;
    } else if (entidad === 'PROYECTO') {
        const p = systemDB.proyectos.find(x => String(x.id) === String(id));
        if (!p) return;
        const alus = (p.alumnos_rel || []).map(a => `<li><strong>${Security.escapeHTML(a.nombre_completo)}</strong> (${Security.escapeHTML(a.matricula_legajo)} - ${Security.escapeHTML(a.curso)}) - ${Security.escapeHTML(a.rol_en_proyecto)}</li>`).join('');
        const docs = (p.docentes_rel || []).map(d => `<li><strong>Prof. ${Security.escapeHTML(d.nombre_completo)}</strong> (${Security.escapeHTML(d.legajo_docente)}) - ${Security.escapeHTML(d.rol_supervision)}</li>`).join('');
        const asigs = (p.asignaturas_rel || []).map(a => `<li><strong>${Security.escapeHTML(a.codigo)} - ${Security.escapeHTML(a.nombre)}</strong> (${Security.escapeHTML(a.aporte_curricular || 'Articulación')})</li>`).join('');
        const cleanRepo = Security.sanitizeURL(p.repositorio_url || '');
        const cleanDemo = Security.sanitizeURL(p.demo_produccion_url || '');
        const isOnline = p.en_produccion_publica !== false && Boolean(cleanDemo);

        html = `
            <div class="login-header" style="text-align:left; border-bottom:1px solid var(--gold-border); padding-bottom:0.9rem; margin-bottom:1.1rem;">
                <span class="badge-category">${Security.escapeHTML(p.codigo_proyecto)} • ${Security.escapeHTML(p.categoria)}</span>
                <h3 style="color:var(--gold-primary); font-size:1.3rem; margin-top:0.3rem;">${Security.escapeHTML(p.titulo)}</h3>
                <p style="color:var(--text-secondary);">Dictamen: <strong>${Security.escapeHTML(p.estado)}</strong> ${p.calificacion ? `• Calificación: <strong>${p.calificacion}/10</strong>` : ''} • ${renderBooleanBadge(p.activo)}</p>
            </div>
            <div style="display:grid; gap:0.9rem; font-size:0.86rem;">
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-cloud-arrow-up"></i> Infraestructura de Entrega (GitHub / Base de Datos / Despliegue):</strong>
                    <p style="color:var(--text-secondary); margin-top:0.3rem; line-height:1.5;">
                        <strong>Modalidad:</strong> ${Security.escapeHTML(p.modalidad_entrega || 'Despliegue Cloud + GitHub + Base de Datos')}<br>
                        <strong>Estado en Red:</strong> ${isOnline ? `<span class="deploy-badge-online"><i class="fa-solid fa-globe"></i> Publicado en Vivo (${Security.escapeHTML(p.plataforma_despliegue || 'Vercel')})</span>` : `<span class="deploy-badge-local"><i class="fa-solid fa-laptop-code"></i> Ejecución Local / Offline (${Security.escapeHTML(p.plataforma_despliegue || 'Local')})</span>`}<br>
                        <strong>Repositorio Externo:</strong> ${cleanRepo ? `<a href="${cleanRepo}" target="_blank" rel="noopener noreferrer" style="color:var(--gold-primary);">${Security.escapeHTML(cleanRepo)}</a>` : 'No registrado'}<br>
                        <strong>Dominio Público (Demo):</strong> ${cleanDemo ? `<a href="${cleanDemo}" target="_blank" rel="noopener noreferrer" style="color:#10B981;">${Security.escapeHTML(cleanDemo)}</a>` : 'Ejecución Local / Sin dominio web'}<br>
                        <strong>Base de Datos:</strong> ${Security.escapeHTML(p.motor_base_datos || 'Supabase (PostgreSQL)')} • <code>${Security.escapeHTML(p.database_proyecto_url || 'Esquema Local')}</code>
                        ${p.instrucciones_ejecucion ? `<br><strong>Instrucciones de Ejecución:</strong> ${Security.escapeHTML(p.instrucciones_ejecucion)}` : ''}
                    </p>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);">Desarrollo Técnico (Prácticas Profesionalizantes):</strong>
                    <p style="color:var(--text-secondary); margin-top:0.25rem;">${Security.escapeHTML(p.descripcion_tecnica)}</p>
                    <strong style="color:var(--gold-primary); display:block; margin-top:0.65rem;">Articulación Organizacional (Tecnología de Gestión):</strong>
                    <p style="color:var(--text-secondary); margin-top:0.25rem;">${Security.escapeHTML(p.articulacion_gestion)}</p>
                    ${p.devolucion_docente ? `<strong style="color:var(--status-approved); display:block; margin-top:0.65rem;"><i class="fa-solid fa-comment-dots"></i> Devolución Pedagógica Docente:</strong><p style="color:var(--text-primary); margin-top:0.25rem;">"${Security.escapeHTML(p.devolucion_docente)}"</p>` : ''}
                </div>
                ${p.snippet_codigo_fuente ? `
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-code"></i> Código Fuente / Arquitectura Compartida en el Sistema:</strong>
                    <pre class="code-snippet-box">${Security.escapeHTML(p.snippet_codigo_fuente)}</pre>
                </div>
                ` : ''}
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-user-graduate"></i> Alumnos Integrantes (${(p.alumnos_rel || []).length}):</strong>
                    <ul style="margin:0.35rem 0 0 1.2rem; color:var(--text-secondary);">${alus || '<li>Sin alumnos vinculados</li>'}</ul>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-chalkboard-user"></i> Docentes Supervisores / Evaluadores (${(p.docentes_rel || []).length}):</strong>
                    <ul style="margin:0.35rem 0 0 1.2rem; color:var(--text-secondary);">${docs || '<li>Sin docentes vinculados</li>'}</ul>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-book-bookmark"></i> Asignaturas Articuladas (${(p.asignaturas_rel || []).length}):</strong>
                    <ul style="margin:0.35rem 0 0 1.2rem; color:var(--text-secondary);">${asigs || '<li>Sin asignaturas vinculadas</li>'}</ul>
                </div>
            </div>
        `;
    } else if (entidad === 'ASIGNATURA') {
        const a = systemDB.asignaturas.find(x => String(x.id) === String(id));
        if (!a) return;
        const docs = (a.docentes_rel || []).map(d => `<li><strong>Prof. ${Security.escapeHTML(d.nombre_completo)}</strong> (${Security.escapeHTML(d.legajo_docente)}) - Rol: ${Security.escapeHTML(d.rol_catedra)}</li>`).join('');
        const alus = (a.alumnos_rel || []).map(al => `<li><strong>${Security.escapeHTML(al.nombre_completo)}</strong> (Matrícula: ${Security.escapeHTML(al.matricula_legajo)}) - ${Security.escapeHTML(al.condicion_cursada)}</li>`).join('');
        const proys = (a.proyectos_rel || []).map(p => `<li><strong>${Security.escapeHTML(p.codigo_proyecto)} - ${Security.escapeHTML(p.titulo)}</strong> [${Security.escapeHTML(p.estado)}]</li>`).join('');

        html = `
            <div class="login-header" style="text-align:left; border-bottom:1px solid var(--gold-border); padding-bottom:0.9rem; margin-bottom:1.1rem;">
                <span class="badge-category">${Security.escapeHTML(a.codigo)} • ${Security.escapeHTML(a.campo_formativo)}</span>
                <h3 style="color:var(--gold-primary); font-size:1.35rem; margin-top:0.3rem;">${Security.escapeHTML(a.nombre)}</h3>
                <p style="color:var(--text-secondary);">${a.anio_cursado}° Año (División: ${Security.escapeHTML(a.division)}) • ${a.carga_horaria_semanal} hs cátedra • ${renderBooleanBadge(a.activo)}</p>
            </div>
            <div style="display:grid; gap:0.9rem; font-size:0.86rem;">
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);">Descripción Curricular:</strong>
                    <p style="color:var(--text-secondary); margin-top:0.25rem;">${Security.escapeHTML(a.descripcion || 'Espacio curricular de 5° Año T.I.P.P.')}</p>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-chalkboard-user"></i> Docentes a Cargo (${(a.docentes_rel || []).length}):</strong>
                    <ul style="margin:0.35rem 0 0 1.2rem; color:var(--text-secondary);">${docs || '<li>Sin docentes asignados</li>'}</ul>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-user-graduate"></i> Alumnos Cursando (${(a.alumnos_rel || []).length}):</strong>
                    <ul style="margin:0.35rem 0 0 1.2rem; color:var(--text-secondary);">${alus || '<li>Sin alumnos inscriptos</li>'}</ul>
                </div>
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);"><i class="fa-solid fa-diagram-project"></i> Proyectos Articulados (${(a.proyectos_rel || []).length}):</strong>
                    <ul style="margin:0.35rem 0 0 1.2rem; color:var(--text-secondary);">${proys || '<li>Sin proyectos articulados</li>'}</ul>
                </div>
            </div>
        `;
    }

    content.innerHTML = html + `
        <div style="margin-top:1.3rem; display:flex; justify-content:flex-end;">
            <button class="btn btn-primary" onclick="closeModal('adminVerInfoModal')">
                <i class="fa-solid fa-check"></i> Cerrar Ficha
            </button>
        </div>
    `;
    openModal('adminVerInfoModal');
}

/* ==========================================================================
   MODALES DE ALTA Y MODIFICACIÓN RELACIONAL (USUARIOS / DOCENTES / ALUMNOS)
   ========================================================================== */
function renderCheckboxGroup(containerId, items, idKey, labelFormatter, selectedIdsSet) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!items || items.length === 0) {
        container.innerHTML = `<span style="font-size:0.78rem; color:var(--text-muted);">No hay registros disponibles para vincular.</span>`;
        return;
    }

    container.innerHTML = items.map(item => {
        const val = String(item[idKey]);
        const checked = selectedIdsSet.has(val) ? 'checked' : '';
        const labelText = Security.escapeHTML(labelFormatter(item));
        return `
            <label class="checkbox-item-card">
                <input type="checkbox" value="${Security.escapeHTML(val)}" ${checked}>
                <span>${labelText}</span>
            </label>
        `;
    }).join('');
}

function getCheckedValuesFromContainer(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return [];
    return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);
}

function toggleAdminUserRoleSections() {
    const isDocente = document.getElementById('chkRolDocente')?.checked;
    const isAlumno = document.getElementById('chkRolAlumno')?.checked;

    const docSec = document.getElementById('admSectionDocenteFields');
    const aluSec = document.getElementById('admSectionAlumnoFields');

    if (docSec) docSec.style.display = isDocente ? 'block' : 'none';
    if (aluSec) aluSec.style.display = isAlumno ? 'block' : 'none';
}

function openAdminUserModal(userId = null, defaultRole = 'ALUMNO') {
    const form = document.getElementById('adminUserIntegralForm');
    if (form) form.reset();

    document.getElementById('admUserId').value = userId || '';
    const titleEl = document.getElementById('adminUserFormTitle');

    const userObj = userId ? systemDB.usuarios.find(u => String(u.id) === String(userId)) : null;
    const docRelObj = userId ? systemDB.docentes.find(d => String(d.usuario_id) === String(userId)) : null;
    const aluRelObj = userId ? systemDB.alumnos.find(a => String(a.usuario_id) === String(userId)) : null;

    if (userObj) {
        if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-user-pen"></i> Modificar Ficha y Relaciones: ${Security.escapeHTML(userObj.nombre_completo)}`;
        document.getElementById('admUserNombres').value = userObj.nombres || '';
        document.getElementById('admUserApellidos').value = userObj.apellidos || '';
        document.getElementById('admUserDni').value = userObj.dni || '';
        document.getElementById('admUserCuil').value = userObj.cuil || '';
        document.getElementById('admUserUsername').value = userObj.username || '';
        document.getElementById('admUserEmail').value = userObj.email || '';
        document.getElementById('admUserTelefono').value = userObj.telefono || '';
        document.getElementById('admUserDomicilio').value = userObj.domicilio || '';
        document.getElementById('admUserActivo').value = userObj.activo !== false ? 'true' : 'false';

        const roleCodes = (userObj.roles || []).map(r => r.codigo);
        document.getElementById('chkRolAdmin').checked = roleCodes.includes('ADMINISTRADOR');
        document.getElementById('chkRolDocente').checked = roleCodes.includes('DOCENTE');
        document.getElementById('chkRolAlumno').checked = roleCodes.includes('ALUMNO');

        const principalRole = (userObj.roles || []).find(r => r.es_rol_principal)?.codigo || roleCodes[0] || defaultRole;
        document.getElementById('admUserRolPrincipal').value = principalRole;

        if (userObj.ficha_docente || docRelObj) {
            const fd = userObj.ficha_docente || docRelObj;
            document.getElementById('admDocLegajo').value = fd.legajo_docente || '';
            document.getElementById('admDocTitulo').value = fd.titulo_profesional || '';
            document.getElementById('admDocEspecialidad').value = fd.especialidad || '';
            document.getElementById('admDocSituacion').value = fd.situacion_revista || 'Titular';
        }

        if (userObj.ficha_alumno || aluRelObj) {
            const fa = userObj.ficha_alumno || aluRelObj;
            document.getElementById('admAluMatricula').value = fa.matricula_legajo || '';
            document.getElementById('admAluDivision').value = fa.division || 'A';
            document.getElementById('admAluRolEquipo').value = fa.rol_en_equipo || '';
            document.getElementById('admAluPromedio').value = fa.promedio_general || '';
            document.getElementById('admAluTutorNombre').value = fa.tutor_legal_nombre || '';
            document.getElementById('admAluTutorTelefono').value = fa.tutor_legal_telefono || '';
        }
    } else {
        if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-user-plus"></i> Agregar Nuevo ${defaultRole} al Sistema`;
        document.getElementById('admUserActivo').value = 'true';
        document.getElementById('chkRolAdmin').checked = (defaultRole === 'ADMINISTRADOR');
        document.getElementById('chkRolDocente').checked = (defaultRole === 'DOCENTE');
        document.getElementById('chkRolAlumno').checked = (defaultRole === 'ALUMNO');
        document.getElementById('admUserRolPrincipal').value = defaultRole;
    }

    // Poblar checkboxes de relaciones N:M para Docente
    const docAsigSet = new Set((docRelObj?.asignaturas_rel || []).map(x => String(x.id)));
    const docProySet = new Set((docRelObj?.proyectos_rel || []).map(x => String(x.id)));
    const docAluSet = new Set((docRelObj?.alumnos_rel || []).map(x => String(x.usuario_id)));

    renderCheckboxGroup('admDocAsignaturasCheckboxes', systemDB.asignaturas, 'id', a => `${a.codigo} - ${a.nombre}`, docAsigSet);
    renderCheckboxGroup('admDocProyectosCheckboxes', systemDB.proyectos, 'id', p => `${p.codigo_proyecto}: ${p.titulo}`, docProySet);
    renderCheckboxGroup('admDocAlumnosCheckboxes', systemDB.alumnos, 'usuario_id', al => `${al.nombre_completo} (${al.anio_cursado}° ${al.division})`, docAluSet);

    // Poblar checkboxes de relaciones N:M para Alumno
    const aluAsigSet = new Set((aluRelObj?.asignaturas_rel || []).map(x => String(x.id)));
    const aluDocSet = new Set((aluRelObj?.docentes_rel || []).map(x => String(x.usuario_id)));
    const aluProySet = new Set((aluRelObj?.proyectos_rel || []).map(x => String(x.id)));

    renderCheckboxGroup('admAluAsignaturasCheckboxes', systemDB.asignaturas, 'id', a => `${a.codigo} - ${a.nombre}`, aluAsigSet);
    renderCheckboxGroup('admAluDocentesCheckboxes', systemDB.docentes, 'usuario_id', d => `Prof. ${d.nombre_completo} (${d.legajo_docente})`, aluDocSet);
    renderCheckboxGroup('admAluProyectosCheckboxes', systemDB.proyectos, 'id', p => `${p.codigo_proyecto}: ${p.titulo}`, aluProySet);

    const rolesBox = document.getElementById('admSectionRolesSelectorBox');
    if (rolesBox) rolesBox.style.display = 'block';

    toggleAdminUserRoleSections();
    openModal('adminUserFormModal');
}

function openDocenteStudentModal(studentUserId = null) {
    openAdminUserModal(studentUserId, 'ALUMNO');
    const rolesBox = document.getElementById('admSectionRolesSelectorBox');
    const docSec = document.getElementById('admSectionDocenteFields');
    const aluSec = document.getElementById('admSectionAlumnoFields');
    const titleEl = document.getElementById('adminUserFormTitle');

    // En modo DOCENTE, fijar el rol en ALUMNO y ocultar selector de otros roles
    document.getElementById('chkRolAdmin').checked = false;
    document.getElementById('chkRolDocente').checked = false;
    document.getElementById('chkRolAlumno').checked = true;
    document.getElementById('admUserRolPrincipal').value = 'ALUMNO';

    if (rolesBox) rolesBox.style.display = 'none';
    if (docSec) docSec.style.display = 'none';
    if (aluSec) aluSec.style.display = 'block';

    // Si es un estudiante nuevo creado por el docente, pre-marcar al docente actual como su tutor
    if (!studentUserId && currentSession?.userId) {
        const currentDocSet = new Set([String(currentSession.userId)]);
        renderCheckboxGroup('admAluDocentesCheckboxes', systemDB.docentes, 'usuario_id', d => `Prof. ${d.nombre_completo} (${d.legajo_docente})`, currentDocSet);
        if (titleEl) {
            titleEl.innerHTML = `<i class="fa-solid fa-user-graduate"></i> Agregar Nuevo Estudiante a Mi Cátedra / Tutoría`;
        }
    }
}

async function submitAdminUserIntegralForm(event) {
    event.preventDefault();
    if (!window.ProjectHubAuth) return;

    const rolesSelected = [];
    if (document.getElementById('chkRolAdmin').checked) rolesSelected.push('ADMINISTRADOR');
    if (document.getElementById('chkRolDocente').checked) rolesSelected.push('DOCENTE');
    if (document.getElementById('chkRolAlumno').checked) rolesSelected.push('ALUMNO');

    if (rolesSelected.length === 0) {
        showToast('Debes seleccionar al menos un Rol para el usuario.');
        return;
    }

    const rolPrincipal = document.getElementById('admUserRolPrincipal').value;
    if (!rolesSelected.includes(rolPrincipal)) {
        rolesSelected.push(rolPrincipal);
    }

    const payload = {
        id: document.getElementById('admUserId').value || null,
        nombres: document.getElementById('admUserNombres').value.trim(),
        apellidos: document.getElementById('admUserApellidos').value.trim(),
        dni: document.getElementById('admUserDni').value.trim(),
        cuil: document.getElementById('admUserCuil').value.trim(),
        username: document.getElementById('admUserUsername').value.trim(),
        email: document.getElementById('admUserEmail').value.trim(),
        password: document.getElementById('admUserPassword').value,
        telefono: document.getElementById('admUserTelefono').value.trim(),
        domicilio: document.getElementById('admUserDomicilio').value.trim(),
        activo: document.getElementById('admUserActivo').value === 'true',
        roles: rolesSelected,
        rol_principal: rolPrincipal
    };

    if (rolesSelected.includes('DOCENTE')) {
        payload.legajo_docente = document.getElementById('admDocLegajo').value.trim();
        payload.titulo_profesional = document.getElementById('admDocTitulo').value.trim();
        payload.especialidad = document.getElementById('admDocEspecialidad').value.trim();
        payload.situacion_revista = document.getElementById('admDocSituacion').value;
        payload.asignaturas_ids = getCheckedValuesFromContainer('admDocAsignaturasCheckboxes');
        payload.proyectos_ids = getCheckedValuesFromContainer('admDocProyectosCheckboxes');
        payload.alumnos_ids = getCheckedValuesFromContainer('admDocAlumnosCheckboxes');
    }

    if (rolesSelected.includes('ALUMNO')) {
        payload.matricula_legajo = document.getElementById('admAluMatricula').value.trim();
        payload.division = document.getElementById('admAluDivision').value;
        payload.rol_en_equipo = document.getElementById('admAluRolEquipo').value.trim();
        payload.promedio_general = document.getElementById('admAluPromedio').value || null;
        payload.tutor_legal_nombre = document.getElementById('admAluTutorNombre').value.trim();
        payload.tutor_legal_telefono = document.getElementById('admAluTutorTelefono').value.trim();
        payload.asignaturas_ids = getCheckedValuesFromContainer('admAluAsignaturasCheckboxes');
        payload.docentes_ids = getCheckedValuesFromContainer('admAluDocentesCheckboxes');
        payload.proyectos_ids = getCheckedValuesFromContainer('admAluProyectosCheckboxes');
    }

    try {
        await window.ProjectHubAuth.saveUserIntegral(payload);
        await refreshSystemDataFromSupabase(false);
        closeModal('adminUserFormModal');
        showToast('Usuario, roles y vínculos relacionales guardados en Supabase.');
    } catch (err) {
        showToast(err.message || 'Error al guardar el usuario en la base de datos.');
    }
}

/* ==========================================================================
   MODAL DE ALTA Y MODIFICACIÓN RELACIONAL DE PROYECTOS (ADMIN / DOCENTE / ALUMNO)
   ========================================================================== */
function openAdminProjectModal(projectId = null) {
    const form = document.getElementById('adminProjectRelationalForm');
    if (form) form.reset();

    document.getElementById('admProjId').value = projectId || '';
    const pObj = projectId ? systemDB.proyectos.find(p => String(p.id) === String(projectId)) : null;

    const evalGroup = document.getElementById('admProjEvaluationFieldsGroup');
    const isStudentRole = currentSession?.role === 'ALUMNO';
    if (evalGroup) {
        evalGroup.style.display = isStudentRole ? 'none' : 'block';
    }

    if (pObj) {
        document.getElementById('admProjCodigo').value = pObj.codigo_proyecto || '';
        document.getElementById('admProjCategoria').value = pObj.categoria || 'Sistema Web';
        document.getElementById('admProjTitulo').value = pObj.titulo || '';
        document.getElementById('admProjDivision').value = pObj.division || '5° Año A - T.I.P.P.';
        document.getElementById('admProjTecnologias').value = Array.isArray(pObj.tecnologias) ? pObj.tecnologias.join(', ') : '';
        document.getElementById('admProjDescripcion').value = pObj.descripcion_tecnica || '';
        document.getElementById('admProjGestion').value = pObj.articulacion_gestion || '';
        document.getElementById('admProjModalidad').value = pObj.modalidad_entrega || 'Despliegue Cloud + GitHub + Base de Datos';
        document.getElementById('admProjEnProduccion').value = pObj.en_produccion_publica !== false ? 'true' : 'false';
        document.getElementById('admProjRepo').value = pObj.repositorio_url || '';
        document.getElementById('admProjDemoUrl').value = pObj.demo_produccion_url || '';
        document.getElementById('admProjPlataforma').value = pObj.plataforma_despliegue || 'Vercel';
        document.getElementById('admProjMotorBd').value = pObj.motor_base_datos || 'Supabase (PostgreSQL)';
        document.getElementById('admProjDatabaseUrl').value = pObj.database_proyecto_url || '';
        document.getElementById('admProjInstrucciones').value = pObj.instrucciones_ejecucion || '';
        document.getElementById('admProjSnippetCodigo').value = pObj.snippet_codigo_fuente || '';
        document.getElementById('admProjEstado').value = pObj.estado || 'En Revisión';
        document.getElementById('admProjCalificacion').value = pObj.calificacion || '';
        document.getElementById('admProjActivo').value = pObj.activo !== false ? 'true' : 'false';
        document.getElementById('admProjDevolucion').value = pObj.devolucion_docente || '';
    } else {
        document.getElementById('admProjCodigo').value = `PRJ-2026-${100 + systemDB.proyectos.length + 1}`;
        document.getElementById('admProjModalidad').value = 'Despliegue Cloud + GitHub + Base de Datos';
        document.getElementById('admProjEnProduccion').value = 'true';
        document.getElementById('admProjPlataforma').value = 'Vercel';
        document.getElementById('admProjMotorBd').value = 'Supabase (PostgreSQL)';
        document.getElementById('admProjEstado').value = 'En Revisión';
        document.getElementById('admProjActivo').value = 'true';
    }

    const aluSet = new Set((pObj?.alumnos_rel || []).map(x => String(x.usuario_id)));
    const docSet = new Set((pObj?.docentes_rel || []).map(x => String(x.usuario_id)));
    const asigSet = new Set((pObj?.asignaturas_rel || []).map(x => String(x.id)));

    // Si es un proyecto nuevo y quien lo abre es un DOCENTE, pre-seleccionarlo como Docente Supervisor
    if (!pObj && currentSession?.role === 'DOCENTE' && currentSession?.userId) {
        docSet.add(String(currentSession.userId));
    }

    // Si quien lo abre es un ALUMNO, asegurarse de que quede seleccionado en su propio proyecto y pre-marcar sus asignaturas/docentes
    if (currentSession?.role === 'ALUMNO' && currentSession?.userId) {
        aluSet.add(String(currentSession.userId));
        if (!pObj) {
            const miFichaAlu = systemDB.alumnos.find(a => String(a.usuario_id) === String(currentSession.userId));
            (miFichaAlu?.asignaturas_rel || []).forEach(asg => asigSet.add(String(asg.id)));
            (miFichaAlu?.docentes_rel || []).forEach(doc => docSet.add(String(doc.usuario_id)));
        }
    }

    renderCheckboxGroup('admProjAlumnosCheckboxes', systemDB.alumnos, 'usuario_id', al => `${al.nombre_completo} (${al.anio_cursado}° ${al.division})`, aluSet);
    renderCheckboxGroup('admProjDocentesCheckboxes', systemDB.docentes, 'usuario_id', d => `Prof. ${d.nombre_completo} (${d.legajo_docente})`, docSet);
    renderCheckboxGroup('admProjAsignaturasCheckboxes', systemDB.asignaturas, 'id', a => `${a.codigo} - ${a.nombre}`, asigSet);

    openModal('adminProjectFormModal');
}

function openAlumnoProjectModal(projectId = null) {
    openAdminProjectModal(projectId);
    const titleEl = document.getElementById('adminProjectFormTitle');
    if (titleEl) {
        titleEl.innerHTML = projectId
            ? `<i class="fa-solid fa-pen-to-square"></i> Modificar Mi Proyecto (GitHub / Supabase / Vercel / Código Local)`
            : `<i class="fa-solid fa-cloud-arrow-up"></i> Subir / Registrar Mi Proyecto Integrador`;
    }
}

async function submitAdminProjectRelationalForm(event) {
    event.preventDefault();
    if (!window.ProjectHubAuth) return;

    const techsArr = document.getElementById('admProjTecnologias').value
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

    const alumnosSelected = getCheckedValuesFromContainer('admProjAlumnosCheckboxes');
    if (currentSession?.role === 'ALUMNO' && currentSession?.userId && !alumnosSelected.includes(String(currentSession.userId))) {
        alumnosSelected.push(String(currentSession.userId));
    }

    const payload = {
        id: document.getElementById('admProjId').value || null,
        codigo_proyecto: document.getElementById('admProjCodigo').value.trim(),
        categoria: document.getElementById('admProjCategoria').value,
        titulo: document.getElementById('admProjTitulo').value.trim(),
        division: document.getElementById('admProjDivision').value.trim(),
        tecnologias: techsArr,
        descripcion_tecnica: document.getElementById('admProjDescripcion').value.trim(),
        articulacion_gestion: document.getElementById('admProjGestion').value.trim(),
        modalidad_entrega: document.getElementById('admProjModalidad')?.value || 'Despliegue Cloud + GitHub + Base de Datos',
        en_produccion_publica: document.getElementById('admProjEnProduccion')?.value === 'true',
        repositorio_url: document.getElementById('admProjRepo').value.trim(),
        demo_produccion_url: document.getElementById('admProjDemoUrl')?.value.trim() || '',
        plataforma_despliegue: document.getElementById('admProjPlataforma')?.value.trim() || 'Vercel',
        motor_base_datos: document.getElementById('admProjMotorBd')?.value.trim() || 'Supabase (PostgreSQL)',
        database_proyecto_url: document.getElementById('admProjDatabaseUrl')?.value.trim() || '',
        instrucciones_ejecucion: document.getElementById('admProjInstrucciones')?.value.trim() || '',
        snippet_codigo_fuente: document.getElementById('admProjSnippetCodigo')?.value.trim() || '',
        estado: document.getElementById('admProjEstado').value,
        calificacion: document.getElementById('admProjCalificacion').value || null,
        activo: document.getElementById('admProjActivo').value === 'true',
        devolucion_docente: document.getElementById('admProjDevolucion').value.trim(),
        alumnos_ids: alumnosSelected,
        docentes_ids: getCheckedValuesFromContainer('admProjDocentesCheckboxes'),
        asignaturas_ids: getCheckedValuesFromContainer('admProjAsignaturasCheckboxes')
    };

    try {
        await window.ProjectHubAuth.saveProjectRelational(payload);
        await refreshSystemDataFromSupabase(false);
        closeModal('adminProjectFormModal');
        showToast('Proyecto integrador, despliegue, base de datos y vínculos guardados en Supabase.');
    } catch (err) {
        showToast(err.message || 'Error al guardar el proyecto en la base de datos.');
    }
}

/* ==========================================================================
   MODAL DE ALTA Y MODIFICACIÓN RELACIONAL DE ASIGNATURAS (ADMIN)
   ========================================================================== */
function openAdminAsignaturaModal(asignaturaId = null) {
    const form = document.getElementById('adminAsignaturaRelationalForm');
    if (form) form.reset();

    document.getElementById('admAsigId').value = asignaturaId || '';
    const aObj = asignaturaId ? systemDB.asignaturas.find(a => String(a.id) === String(asignaturaId)) : null;

    if (aObj) {
        document.getElementById('admAsigCodigo').value = aObj.codigo || '';
        document.getElementById('admAsigNombre').value = aObj.nombre || '';
        document.getElementById('admAsigCampo').value = aObj.campo_formativo || 'Formación Técnica Específica';
        document.getElementById('admAsigDivision').value = aObj.division || 'Todas';
        document.getElementById('admAsigHoras').value = aObj.carga_horaria_semanal || 4;
        document.getElementById('admAsigActivo').value = aObj.activo !== false ? 'true' : 'false';
        document.getElementById('admAsigDescripcion').value = aObj.descripcion || '';
    } else {
        document.getElementById('admAsigCodigo').value = `CEN-5TO-AS${systemDB.asignaturas.length + 1}`;
        document.getElementById('admAsigActivo').value = 'true';
    }

    const docSet = new Set((aObj?.docentes_rel || []).map(x => String(x.usuario_id)));
    const aluSet = new Set((aObj?.alumnos_rel || []).map(x => String(x.usuario_id)));
    const proySet = new Set((aObj?.proyectos_rel || []).map(x => String(x.id)));

    renderCheckboxGroup('admAsigDocentesCheckboxes', systemDB.docentes, 'usuario_id', d => `Prof. ${d.nombre_completo} (${d.legajo_docente})`, docSet);
    renderCheckboxGroup('admAsigAlumnosCheckboxes', systemDB.alumnos, 'usuario_id', al => `${al.nombre_completo} (${al.anio_cursado}° ${al.division})`, aluSet);
    renderCheckboxGroup('admAsigProyectosCheckboxes', systemDB.proyectos, 'id', p => `${p.codigo_proyecto}: ${p.titulo}`, proySet);

    openModal('adminAsignaturaFormModal');
}

async function submitAdminAsignaturaRelationalForm(event) {
    event.preventDefault();
    if (!window.ProjectHubAuth) return;

    const payload = {
        id: document.getElementById('admAsigId').value || null,
        codigo: document.getElementById('admAsigCodigo').value.trim(),
        nombre: document.getElementById('admAsigNombre').value.trim(),
        campo_formativo: document.getElementById('admAsigCampo').value,
        division: document.getElementById('admAsigDivision').value,
        carga_horaria_semanal: parseInt(document.getElementById('admAsigHoras').value || '4', 10),
        activo: document.getElementById('admAsigActivo').value === 'true',
        descripcion: document.getElementById('admAsigDescripcion').value.trim(),
        docentes_ids: getCheckedValuesFromContainer('admAsigDocentesCheckboxes'),
        alumnos_ids: getCheckedValuesFromContainer('admAsigAlumnosCheckboxes'),
        proyectos_ids: getCheckedValuesFromContainer('admAsigProyectosCheckboxes')
    };

    try {
        await window.ProjectHubAuth.saveAsignaturaRelational(payload);
        await refreshSystemDataFromSupabase(false);
        closeModal('adminAsignaturaFormModal');
        showToast('Asignatura y sus relaciones académicas guardadas en Supabase.');
    } catch (err) {
        showToast(err.message || 'Error al guardar la asignatura en la base de datos.');
    }
}

/* ==========================================================================
   MODAL 11: CARGA MÚLTIPLE DE REGISTROS (AGREGAR UNO O MÁS EN CUALQUIER MÓDULO)
   ========================================================================== */
let batchRowCounter = 0;

function openBatchAddModal(entidad = 'USUARIO') {
    const cleanEntidad = (entidad === 'PROYECTOS') ? 'PROYECTO'
        : (entidad === 'ALUMNOS' || entidad === 'ESTUDIANTES') ? 'ALUMNO'
        : (entidad === 'DOCENTES') ? 'DOCENTE'
        : (entidad === 'ASIGNATURAS') ? 'ASIGNATURA'
        : (entidad === 'USUARIOS') ? 'USUARIO'
        : entidad;

    document.getElementById('batchAddEntityType').value = cleanEntidad;
    const container = document.getElementById('batchAddRowsContainer');
    const titleEl = document.getElementById('batchAddTitle');
    const subEl = document.getElementById('batchAddSubtitle');

    if (container) container.innerHTML = '';
    batchRowCounter = 0;

    const labelsMap = {
        USUARIO: 'Usuarios Multirrol',
        DOCENTE: 'Docentes del Plantel',
        ALUMNO: 'Alumnos de 5° Año',
        PROYECTO: 'Proyectos Integradores',
        ASIGNATURA: 'Asignaturas Curriculares'
    };

    if (subEl) subEl.textContent = `Carga Múltiple • Módulo ${cleanEntidad}`;
    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-layer-group"></i> Agregar Uno o Más ${labelsMap[cleanEntidad] || cleanEntidad}`;
    }

    // Iniciar con 2 filas listas para completar (el usuario puede quitar o agregar más)
    addNewRowToBatchModal();
    addNewRowToBatchModal();
    openModal('adminBatchAddModal');
}

function addNewRowToBatchModal() {
    const entidad = document.getElementById('batchAddEntityType')?.value || 'USUARIO';
    const container = document.getElementById('batchAddRowsContainer');
    if (!container) return;

    batchRowCounter += 1;
    const idx = batchRowCounter;
    const card = document.createElement('div');
    card.className = 'multi-row-entry-card';
    card.dataset.rowIndex = idx;

    let fieldsHTML = '';

    if (entidad === 'USUARIO' || entidad === 'DOCENTE' || entidad === 'ALUMNO') {
        const defaultRole = entidad === 'USUARIO' ? 'ALUMNO' : entidad;
        fieldsHTML = `
            <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(175px, 1fr)); gap:0.65rem;">
                <div class="form-group">
                    <label>Nombres *</label>
                    <input type="text" class="form-control b-nombres" required placeholder="Ej: Juan Ignacio">
                </div>
                <div class="form-group">
                    <label>Apellidos *</label>
                    <input type="text" class="form-control b-apellidos" required placeholder="Ej: Bazán">
                </div>
                <div class="form-group">
                    <label>DNI *</label>
                    <input type="text" class="form-control b-dni" required placeholder="Ej: 47800123">
                </div>
                <div class="form-group">
                    <label>Usuario *</label>
                    <input type="text" class="form-control b-username" required placeholder="Ej: juan.bazan">
                </div>
                <div class="form-group">
                    <label>Correo Institucional *</label>
                    <input type="email" class="form-control b-email" required placeholder="usuario@cennonogasta.edu.ar">
                </div>
                <div class="form-group">
                    <label>Contraseña Inicial</label>
                    <input type="text" class="form-control b-password" value="cen2026seguro" placeholder="cen2026seguro">
                </div>
                ${entidad === 'USUARIO' ? `
                <div class="form-group">
                    <label>Rol Principal</label>
                    <select class="form-control b-rol">
                        <option value="ALUMNO">ALUMNO</option>
                        <option value="DOCENTE">DOCENTE</option>
                        <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                    </select>
                </div>` : `<input type="hidden" class="b-rol" value="${defaultRole}">`}
                ${entidad === 'DOCENTE' ? `
                <div class="form-group">
                    <label>Legajo Docente</label>
                    <input type="text" class="form-control b-legajo" placeholder="DOC-CEN-0${idx}">
                </div>
                <div class="form-group">
                    <label>Título / Especialidad</label>
                    <input type="text" class="form-control b-especialidad" placeholder="Prof. en Informática">
                </div>` : ''}
                ${entidad === 'ALUMNO' ? `
                <div class="form-group">
                    <label>Matrícula</label>
                    <input type="text" class="form-control b-matricula" placeholder="ALU-2026-0${idx}">
                </div>
                <div class="form-group">
                    <label>División (A o B)</label>
                    <select class="form-control b-division">
                        <option value="A">5° Año "A"</option>
                        <option value="B">5° Año "B"</option>
                    </select>
                </div>` : ''}
            </div>
        `;
    } else if (entidad === 'PROYECTO') {
        fieldsHTML = `
            <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap:0.65rem;">
                <div class="form-group">
                    <label>Código Proyecto *</label>
                    <input type="text" class="form-control b-codigo" required value="PRJ-2026-${110 + idx}">
                </div>
                <div class="form-group">
                    <label>Título del Proyecto *</label>
                    <input type="text" class="form-control b-titulo" required placeholder="Nombre del sistema o prototipo">
                </div>
                <div class="form-group">
                    <label>Categoría *</label>
                    <select class="form-control b-categoria">
                        <option value="Sistema Web">Sistema Web</option>
                        <option value="Software de Gestión">Software de Gestión</option>
                        <option value="IoT y Hardware">IoT y Hardware</option>
                        <option value="App Móvil">App Móvil</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>División</label>
                    <input type="text" class="form-control b-division" value="5° Año A - T.I.P.P.">
                </div>
                <div class="form-group">
                    <label>Estado Inicial</label>
                    <select class="form-control b-estado">
                        <option value="En Revisión">En Revisión</option>
                        <option value="Aprobado">Aprobado</option>
                        <option value="En Desarrollo">En Desarrollo</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Stack Tecnológico (separado por comas)</label>
                    <input type="text" class="form-control b-tecnologias" value="HTML5, CSS3, JavaScript">
                </div>
                <div class="form-group full-width">
                    <label>Resumen Técnico y Articulación *</label>
                    <input type="text" class="form-control b-descripcion" required placeholder="Describe el desarrollo técnico y su impacto en gestión...">
                </div>
            </div>
        `;
    } else if (entidad === 'ASIGNATURA') {
        fieldsHTML = `
            <div class="form-grid" style="grid-template-columns: repeat(auto-fit, minmax(185px, 1fr)); gap:0.65rem;">
                <div class="form-group">
                    <label>Código Curricular *</label>
                    <input type="text" class="form-control b-codigo" required value="CEN-5TO-M${idx}">
                </div>
                <div class="form-group">
                    <label>Nombre de la Asignatura *</label>
                    <input type="text" class="form-control b-nombre" required placeholder="Ej: Redes y Comunicaciones">
                </div>
                <div class="form-group">
                    <label>Campo Formativo</label>
                    <select class="form-control b-campo">
                        <option value="Formación Técnica Específica">Formación Técnica Específica</option>
                        <option value="Prácticas Profesionalizantes">Prácticas Profesionalizantes</option>
                        <option value="Formación Científico-Tecnológica">Formación Científico-Tecnológica</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>División</label>
                    <select class="form-control b-division">
                        <option value="Todas">Todas (A y B)</option>
                        <option value="A">5° Año A</option>
                        <option value="B">5° Año B</option>
                    </select>
                </div>
                <div class="form-group">
                    <label>Horas Semanales</label>
                    <input type="number" class="form-control b-horas" value="4" min="1" max="24">
                </div>
                <div class="form-group">
                    <label>Descripción Breve</label>
                    <input type="text" class="form-control b-descripcion" placeholder="Contenidos mínimos...">
                </div>
            </div>
        `;
    }

    card.innerHTML = `
        <div class="multi-row-header">
            <strong><i class="fa-solid fa-hashtag"></i> Registro en Lote #${idx} (${entidad})</strong>
            <button type="button" class="btn-action-sm btn-action-delete" onclick="removeBatchRow(this)">
                <i class="fa-solid fa-xmark"></i> Quitar Fila
            </button>
        </div>
        ${fieldsHTML}
    `;

    container.appendChild(card);
}

function removeBatchRow(btnEl) {
    const container = document.getElementById('batchAddRowsContainer');
    const card = btnEl.closest('.multi-row-entry-card');
    if (!container || !card) return;

    if (container.querySelectorAll('.multi-row-entry-card').length <= 1) {
        showToast('Debe quedar al menos 1 fila en el formulario de carga.');
        return;
    }
    card.remove();
}

async function submitBatchAddForm(event) {
    event.preventDefault();
    if (!window.ProjectHubAuth) return;

    const entidad = document.getElementById('batchAddEntityType')?.value || 'USUARIO';
    const cards = Array.from(document.querySelectorAll('#batchAddRowsContainer .multi-row-entry-card'));
    if (cards.length === 0) return;

    const registros = cards.map(card => {
        if (entidad === 'USUARIO' || entidad === 'DOCENTE' || entidad === 'ALUMNO') {
            const rol = card.querySelector('.b-rol')?.value || (entidad === 'USUARIO' ? 'ALUMNO' : entidad);
            return {
                nombres: card.querySelector('.b-nombres')?.value.trim(),
                apellidos: card.querySelector('.b-apellidos')?.value.trim(),
                dni: card.querySelector('.b-dni')?.value.trim(),
                username: card.querySelector('.b-username')?.value.trim(),
                email: card.querySelector('.b-email')?.value.trim(),
                password: card.querySelector('.b-password')?.value.trim() || 'cen2026seguro',
                rol_principal: rol,
                roles: [rol],
                legajo_docente: card.querySelector('.b-legajo')?.value.trim() || '',
                especialidad: card.querySelector('.b-especialidad')?.value.trim() || 'Informática',
                titulo_profesional: card.querySelector('.b-especialidad')?.value.trim() || 'Docente Técnico',
                matricula_legajo: card.querySelector('.b-matricula')?.value.trim() || '',
                division: card.querySelector('.b-division')?.value || 'A',
                activo: true
            };
        }
        if (entidad === 'PROYECTO') {
            return {
                codigo_proyecto: card.querySelector('.b-codigo')?.value.trim(),
                titulo: card.querySelector('.b-titulo')?.value.trim(),
                categoria: card.querySelector('.b-categoria')?.value || 'Sistema Web',
                division: card.querySelector('.b-division')?.value.trim() || '5° Año A - T.I.P.P.',
                estado: card.querySelector('.b-estado')?.value || 'En Revisión',
                tecnologias: card.querySelector('.b-tecnologias')?.value.trim() || 'HTML5, CSS3, JavaScript',
                descripcion_tecnica: card.querySelector('.b-descripcion')?.value.trim() || '',
                articulacion_gestion: 'Proyecto registrado mediante Carga Múltiple del Administrador.',
                activo: true
            };
        }
        if (entidad === 'ASIGNATURA') {
            return {
                codigo: card.querySelector('.b-codigo')?.value.trim(),
                nombre: card.querySelector('.b-nombre')?.value.trim(),
                campo_formativo: card.querySelector('.b-campo')?.value || 'Formación Técnica Específica',
                division: card.querySelector('.b-division')?.value || 'Todas',
                carga_horaria_semanal: parseInt(card.querySelector('.b-horas')?.value || '4', 10),
                descripcion: card.querySelector('.b-descripcion')?.value.trim() || '',
                activo: true
            };
        }
        return {};
    });

    const submitBtn = document.getElementById('batchAddSubmitBtn');
    const origHTML = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Guardando ${registros.length} registros...`;
    }

    try {
        const res = await window.ProjectHubAuth.importBatchEntities(entidad, registros);
        await refreshSystemDataFromSupabase(false);
        closeModal('adminBatchAddModal');
        showToast(`¡Carga Múltiple exitosa! Se insertaron/actualizaron ${res?.insertados || registros.length} registros en ${entidad}.`);
    } catch (err) {
        showToast(err.message || 'Error durante la carga múltiple en Supabase.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = origHTML;
        }
    }
}

/* ==========================================================================
   MODAL 12: IMPORTACIÓN .CSV Y ESTRUCTURA DE COLUMNAS PARA LOS 5 MÓDULOS
   ========================================================================== */
const CSV_SCHEMAS = {
    USUARIO: {
        title: 'Importar Usuarios (.CSV) y Estructura de Columnas',
        explanation: 'Incluye los datos personales, credenciales y rol principal (ADMINISTRADOR, DOCENTE o ALUMNO). Puedes separar columnas con coma (,) o punto y coma (;).',
        columns: ['nombres', 'apellidos', 'dni', 'cuil', 'username', 'email', 'password', 'telefono', 'localidad', 'rol_principal'],
        sampleRows: [
            ['Lucía Belén', 'Soria', '47500911', '27-47500911-4', 'lucia.soria', 'lucia.soria@cennonogasta.edu.ar', 'cen2026alumno', '3825-410011', 'Nonogasta', 'ALUMNO'],
            ['Marcos Daniel', 'Páez', '33900455', '20-33900455-9', 'marcos.paez', 'marcos.paez@cennonogasta.edu.ar', 'cen2026docente', '3825-420022', 'Chilecito', 'DOCENTE']
        ]
    },
    DOCENTE: {
        title: 'Importar Docentes (.CSV) y Estructura de Columnas',
        explanation: 'Crea o actualiza el usuario y su ficha en public.docentes con legajo, título profesional, especialidad y situación de revista.',
        columns: ['nombres', 'apellidos', 'dni', 'username', 'email', 'password', 'legajo_docente', 'titulo_profesional', 'especialidad', 'situacion_revista', 'telefono'],
        sampleRows: [
            ['Roberto Carlos', 'Gaitán', '31200888', 'roberto.gaitan', 'roberto.gaitan@cennonogasta.edu.ar', 'cen2026docente', 'DOC-CEN-025', 'Ing. en Sistemas de Información', 'Desarrollo de Software y Redes', 'Titular', '3825-551122']
        ]
    },
    ALUMNO: {
        title: 'Importar Alumnos (.CSV) y Estructura de Columnas',
        explanation: 'Crea o actualiza el usuario y su ficha en public.alumnos con matrícula, división (A o B), rol técnico, promedio y tutor legal.',
        columns: ['nombres', 'apellidos', 'dni', 'username', 'email', 'password', 'matricula_legajo', 'division', 'rol_en_equipo', 'promedio_general', 'tutor_legal_nombre', 'tutor_legal_telefono'],
        sampleRows: [
            ['Agustina', 'Chumbita', '48100222', 'agustina.chumbita', 'agustina.chumbita@cennonogasta.edu.ar', 'cen2026alumno', 'ALU-2026-045', 'A', 'Desarrolladora Frontend UI', '9.25', 'María Chumbita', '3825-667788'],
            ['Tomás Ezequiel', 'Vega', '48100333', 'tomas.vega', 'tomas.vega@cennonogasta.edu.ar', 'cen2026alumno', 'ALU-2026-046', 'B', 'Analista de Base de Datos', '8.90', 'Jorge Vega', '3825-667799']
        ]
    },
    PROYECTO: {
        title: 'Importar Proyectos Integradores (.CSV) y Estructura de Columnas',
        explanation: 'Registra proyectos en public.proyectos indicando código único, título, categoría, división, tecnologías, repositorio GitHub, dominio público (ej. Vercel), motor de base de datos (ej. Supabase) o código local.',
        columns: ['codigo_proyecto', 'titulo', 'categoria', 'division', 'autores_resumen', 'descripcion_tecnica', 'articulacion_gestion', 'tecnologias', 'estado', 'calificacion', 'repositorio_url', 'demo_produccion_url', 'plataforma_despliegue', 'motor_base_datos'],
        sampleRows: [
            ['PRJ-2026-109', 'EcoOlivo Smart: Control de Almazara Digital', 'IoT y Hardware', '5° Año A - T.I.P.P.', 'Chumbita Agustina, Vega Tomás', 'Monitoreo térmico de molienda y trazabilidad de lotes de aceite de oliva con ESP32.', 'Estudio de costos industriales y optimización energética en Tecnología de Gestión.', 'HTML5, CSS3, JavaScript, ESP32, Supabase PostgreSQL', 'Aprobado', '9.5', 'https://github.com/cen-nonogasta/ecoolivo-smart', 'https://ecoolivo-smart-cen.vercel.app', 'Vercel', 'Supabase (PostgreSQL)']
        ]
    },
    ASIGNATURA: {
        title: 'Importar Asignaturas (.CSV) y Estructura de Columnas',
        explanation: 'Registra espacios curriculares en public.asignaturas indicando su código curricular, nombre, campo formativo, división y carga horaria.',
        columns: ['codigo', 'nombre', 'campo_formativo', 'division', 'carga_horaria_semanal', 'regimen', 'descripcion'],
        sampleRows: [
            ['CEN-5TO-BDD', 'Bases de Datos Relacionales y SQL', 'Formación Técnica Específica', 'Todas', '5', 'Anual', 'Modelado entidad-relación, normalización 3FN y seguridad en motores PostgreSQL.'],
            ['CEN-5TO-SEG', 'Ciberseguridad y Redes Informáticas', 'Formación Científico-Tecnológica', 'Todas', '4', 'Anual', 'Protección de infraestructuras escolares, criptografía y auditoría de accesos.']
        ]
    }
};

let parsedCsvRecordsBuffer = [];

function openCsvImportModal(entidad = 'USUARIO') {
    const cleanEntidad = (entidad === 'PROYECTOS') ? 'PROYECTO'
        : (entidad === 'ALUMNOS' || entidad === 'ESTUDIANTES') ? 'ALUMNO'
        : (entidad === 'DOCENTES') ? 'DOCENTE'
        : (entidad === 'ASIGNATURAS') ? 'ASIGNATURA'
        : (entidad === 'USUARIOS') ? 'USUARIO'
        : entidad;

    const schema = CSV_SCHEMAS[cleanEntidad] || CSV_SCHEMAS.USUARIO;
    document.getElementById('csvImportEntityType').value = cleanEntidad;
    parsedCsvRecordsBuffer = [];

    const badgeEl = document.getElementById('csvModalBadge');
    const titleEl = document.getElementById('csvModalTitle');
    const expEl = document.getElementById('csvStructureExplanation');
    const headerCodeEl = document.getElementById('csvColumnsHeaderPreview');
    const exampleEl = document.getElementById('csvExampleRowPreview');
    const previewContainer = document.getElementById('csvPreviewContainer');
    const confirmBtn = document.getElementById('csvConfirmImportBtn');
    const fileInput = document.getElementById('csvFileInput');
    const dropLabel = document.getElementById('csvFileDropLabel');

    if (badgeEl) badgeEl.textContent = `Módulo: Gestión de ${cleanEntidad} • Estructura .CSV`;
    if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-file-csv"></i> ${Security.escapeHTML(schema.title)}`;
    if (expEl) expEl.textContent = schema.explanation;
    if (headerCodeEl) headerCodeEl.textContent = schema.columns.join(',');
    if (exampleEl && schema.sampleRows.length > 0) {
        exampleEl.innerHTML = `<strong style="color:var(--gold-primary);">Ejemplo de fila válida:</strong> <code>${Security.escapeHTML(schema.sampleRows[0].join(','))}</code>`;
    }

    if (previewContainer) previewContainer.style.display = 'none';
    if (confirmBtn) confirmBtn.disabled = true;
    if (fileInput) fileInput.value = '';
    if (dropLabel) dropLabel.innerHTML = `Haz clic aquí para seleccionar tu archivo <strong>.csv</strong> de ${Security.escapeHTML(cleanEntidad)}`;

    openModal('adminCsvImportModal');
}

function downloadCsvTemplateForCurrentEntity() {
    const entidad = document.getElementById('csvImportEntityType')?.value || 'USUARIO';
    const schema = CSV_SCHEMAS[entidad] || CSV_SCHEMAS.USUARIO;

    const escapeCsvVal = (val) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    };

    const lines = [
        schema.columns.join(','),
        ...schema.sampleRows.map(row => row.map(escapeCsvVal).join(','))
    ];

    const csvContent = '\uFEFF' + lines.join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Plantilla_ProjectHub_${entidad}_CEN.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    showToast(`Plantilla oficial .CSV descargada para el módulo ${entidad}.`);
}

function parseCsvLine(line, delimiter = ',') {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === delimiter && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current.trim());
    return result;
}

function handleCsvFileSelected(inputEl) {
    const file = inputEl.files && inputEl.files[0];
    if (!file) return;

    const entidad = document.getElementById('csvImportEntityType')?.value || 'USUARIO';
    const schema = CSV_SCHEMAS[entidad] || CSV_SCHEMAS.USUARIO;
    const dropLabel = document.getElementById('csvFileDropLabel');
    const previewContainer = document.getElementById('csvPreviewContainer');
    const previewSummary = document.getElementById('csvPreviewSummary');
    const previewTable = document.getElementById('csvPreviewTable');
    const confirmBtn = document.getElementById('csvConfirmImportBtn');

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = String(e.target?.result || '').replace(/^\uFEFF/, '');
        const rawLines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

        if (rawLines.length < 2) {
            showToast('El archivo .CSV debe incluir la fila de encabezados y al menos 1 fila de datos.');
            return;
        }

        // Detectar automáticamente si el separador es ';' (Excel en español) o ','
        const firstLine = rawLines[0];
        const delimiter = (firstLine.split(';').length > firstLine.split(',').length) ? ';' : ',';

        const headers = parseCsvLine(firstLine, delimiter).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
        const records = [];

        for (let i = 1; i < rawLines.length; i++) {
            const values = parseCsvLine(rawLines[i], delimiter);
            if (values.length === 0 || values.every(v => !v)) continue;

            const obj = {};
            headers.forEach((h, idx) => {
                if (h) obj[h] = values[idx] ?? '';
            });
            records.push(obj);
        }

        parsedCsvRecordsBuffer = records;

        if (dropLabel) {
            dropLabel.innerHTML = `<strong style="color:var(--gold-primary);"><i class="fa-solid fa-circle-check"></i> Archivo leído:</strong> ${Security.escapeHTML(file.name)} (${records.length} registros detectados)`;
        }

        if (previewContainer && previewTable && previewSummary) {
            previewContainer.style.display = 'block';
            previewSummary.innerHTML = `<i class="fa-solid fa-table-list"></i> Vista previa antes de importar (${records.length} filas listas para enviarse a Supabase):`;

            const displayCols = schema.columns.slice(0, 6);
            const theadHTML = `<thead><tr>${displayCols.map(c => `<th>${Security.escapeHTML(c)}</th>`).join('')}</tr></thead>`;
            const tbodyHTML = `<tbody>${records.slice(0, 8).map(r => `
                <tr>${displayCols.map(c => `<td>${Security.escapeHTML(r[c] || '-')}</td>`).join('')}</tr>
            `).join('')}</tbody>`;

            previewTable.innerHTML = theadHTML + tbodyHTML;
        }

        if (confirmBtn) {
            confirmBtn.disabled = records.length === 0;
        }
    };

    reader.readAsText(file, 'UTF-8');
}

async function executeCsvDatabaseImport() {
    if (!window.ProjectHubAuth || parsedCsvRecordsBuffer.length === 0) return;

    const entidad = document.getElementById('csvImportEntityType')?.value || 'USUARIO';
    const confirmBtn = document.getElementById('csvConfirmImportBtn');
    const origHTML = confirmBtn ? confirmBtn.innerHTML : '';

    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Importando ${parsedCsvRecordsBuffer.length} registros a Supabase...`;
    }

    try {
        const res = await window.ProjectHubAuth.importBatchEntities(entidad, parsedCsvRecordsBuffer);
        await refreshSystemDataFromSupabase(false);
        closeModal('adminCsvImportModal');
        showToast(`¡Importación .CSV completada! ${res?.insertados || parsedCsvRecordsBuffer.length} registros procesados en ${entidad}.`);
        parsedCsvRecordsBuffer = [];
    } catch (err) {
        showToast(err.message || 'Error al importar el archivo .CSV en la base de datos.');
        if (confirmBtn) confirmBtn.disabled = false;
    } finally {
        if (confirmBtn) confirmBtn.innerHTML = origHTML;
    }
}

/* ==========================================================================
   GENERADOR DE REPORTES OFICIALES .PDF DE PROJECTHUB (DISEÑO PERSONALIZADO,
   ARGUMENTADO, EXPLICADO Y RELACIONAL PARA EL ADMINISTRADOR Y DOCENTES)
   ========================================================================== */
function exportProjectsSummary() {
    exportAdminReportPDF('PROYECTO');
}

function exportAdminReportPDF(scope = 'INTEGRAL') {
    const cleanScope = String(scope || 'INTEGRAL').trim().toUpperCase();
    const nowStr = new Date().toLocaleString('es-AR');
    const adminAuthor = currentSession ? `${currentSession.displayName} (${currentSession.role})` : 'Administración General C.E.N.';

    const totalUsers = systemDB.usuarios.length;
    const activeUsers = systemDB.usuarios.filter(u => u.activo !== false).length;
    const totalDocs = systemDB.docentes.length;
    const totalAlus = systemDB.alumnos.length;
    const totalProys = systemDB.proyectos.length;
    const approvedProys = systemDB.proyectos.filter(p => p.estado === 'Aprobado').length;
    const totalAsigs = systemDB.asignaturas.length;

    const scopeTitles = {
        INTEGRAL: 'INFORME EJECUTIVO INTEGRAL DE SUPERVISIÓN Y BASE DE DATOS RELACIONAL (3FN)',
        USUARIO: 'REPORTE OFICIAL DE AUDITORÍA: MÓDULO DE GESTIÓN DE USUARIOS Y ROLES',
        DOCENTE: 'REPORTE OFICIAL DE AUDITORÍA: PLANTEL DOCENTE, CÁTEDRAS Y PROYECTOS SUPERVISADOS',
        ALUMNO: 'REPORTE OFICIAL DE AUDITORÍA: MATRÍCULA DE ALUMNOS DE 5° AÑO, PROYECTOS Y TUTORÍAS',
        PROYECTO: 'REPORTE OFICIAL DE AUDITORÍA: CATÁLOGO DE PROYECTOS INTEGRADORES Y CALIFICACIONES',
        ASIGNATURA: 'REPORTE OFICIAL DE AUDITORÍA: ESTRUCTURA CURRICULAR DE ASIGNATURAS Y ARTICULACIÓN'
    };

    const reportMainTitle = scopeTitles[cleanScope] || scopeTitles.INTEGRAL;

    // Bloques de tablas detalladas según el alcance elegido
    let sectionsHTML = '';

    if (cleanScope === 'INTEGRAL' || cleanScope === 'USUARIO') {
        const rows = systemDB.usuarios.map((u, idx) => {
            const roles = (u.roles || []).map(r => `${r.codigo}${r.es_rol_principal ? ' (Principal)' : ''}`).join(', ');
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${Security.escapeHTML(u.nombre_completo)}</strong><br><small>@${Security.escapeHTML(u.username)}</small></td>
                    <td>DNI: ${Security.escapeHTML(u.dni)}<br><small>CUIL: ${Security.escapeHTML(u.cuil || 'N/A')}</small></td>
                    <td>${Security.escapeHTML(u.email)}<br><small>${Security.escapeHTML(u.telefono || '-')} (${Security.escapeHTML(u.localidad || 'Nonogasta')})</small></td>
                    <td>${Security.escapeHTML(roles || 'Sin rol')}</td>
                    <td><span class="status-pill ${u.activo !== false ? 'act' : 'inact'}">${u.activo !== false ? 'ACTIVO' : 'INACTIVO'}</span></td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>1. Entidad Principal de Usuarios y Asignación Multirrol (public.usuarios + public.usuarios_roles)</h3>
                <p class="section-argument">
                    <strong>Argumentación Técnica y de Ciberseguridad:</strong> La entidad <code>public.usuarios</code> centraliza la identidad unificada de cada actor institucional vinculada a <code>auth.users</code> de Supabase, evitando duplicidad de datos personales (Tercera Forma Normal - 3FN). La tabla intermedia <code>public.usuarios_roles</code> permite que un mismo profesional cumpla simultáneamente funciones de <em>ADMINISTRADOR</em> y <em>DOCENTE</em> con trazabilidad completa y baja lógica booleana.
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Nombre Completo / Usuario</th>
                            <th>Identificación (DNI / CUIL)</th>
                            <th>Contacto Institucional</th>
                            <th>Roles Asignados</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="6">Sin registros</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    if (cleanScope === 'INTEGRAL' || cleanScope === 'DOCENTE') {
        const rows = systemDB.docentes.map((d, idx) => {
            const asigs = (d.asignaturas_rel || []).map(a => `${a.nombre} (${a.rol_catedra})`).join(' | ');
            const proys = (d.proyectos_rel || []).map(p => `${p.codigo_proyecto}: ${p.titulo}`).join(' | ');
            const alus = (d.alumnos_rel || []).map(al => al.nombre_completo).join(', ');
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>Prof. ${Security.escapeHTML(d.nombre_completo)}</strong><br><small>Legajo: ${Security.escapeHTML(d.legajo_docente)} (${Security.escapeHTML(d.situacion_revista)})</small></td>
                    <td>${Security.escapeHTML(d.titulo_profesional)}<br><small>${Security.escapeHTML(d.especialidad)}</small></td>
                    <td>${Security.escapeHTML(asigs || 'Sin cátedras vinculadas')}</td>
                    <td>${Security.escapeHTML(proys || 'Sin proyectos asignados')}</td>
                    <td>${Security.escapeHTML(alus || 'Sin tutorías')}</td>
                    <td><span class="status-pill ${d.activo !== false ? 'act' : 'inact'}">${d.activo !== false ? 'ACTIVO' : 'INACTIVO'}</span></td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>2. Supervisión del Plantel Docente y Articulación Pedagógica (public.docentes)</h3>
                <p class="section-argument">
                    <strong>Argumentación Pedagógica:</strong> Cada docente se vincula relacionalmente mediante tablas puente con las asignaturas que dicta (<code>docentes_asignaturas</code>), los proyectos que evalúa colegiadamente (<code>proyectos_docentes</code>) y los estudiantes de 5° Año que acompaña bajo tutoría metodológica o técnica (<code>docentes_alumnos</code>).
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Docente / Legajo</th>
                            <th>Título y Especialidad</th>
                            <th>Asignaturas que Dicta</th>
                            <th>Proyectos que Supervisa</th>
                            <th>Alumnos Asignados</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="7">Sin registros</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    if (cleanScope === 'INTEGRAL' || cleanScope === 'ALUMNO') {
        const rows = systemDB.alumnos.map((al, idx) => {
            const proys = (al.proyectos_rel || []).map(p => `${p.codigo_proyecto}: ${p.titulo} [${p.estado}]`).join(' | ');
            const docs = (al.docentes_rel || []).map(d => `Prof. ${d.nombre_completo}`).join(', ');
            const asigs = (al.asignaturas_rel || []).map(a => a.nombre).join(', ');
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${Security.escapeHTML(al.nombre_completo)}</strong><br><small>Matrícula: ${Security.escapeHTML(al.matricula_legajo)} • DNI: ${Security.escapeHTML(al.dni)}</small></td>
                    <td>${al.anio_cursado}° "${Security.escapeHTML(al.division)}" (${Security.escapeHTML(al.turno)})<br><small>Prom: ${al.promedio_general || 'S/C'}</small></td>
                    <td>${Security.escapeHTML(proys || 'Sin proyecto')}</td>
                    <td>${Security.escapeHTML(docs || 'Sin docente tutor')}</td>
                    <td>${Security.escapeHTML(asigs || 'Sin asignaturas')}</td>
                    <td><span class="status-pill ${al.activo !== false ? 'act' : 'inact'}">${al.activo !== false ? 'ACTIVO' : 'INACTIVO'}</span></td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>3. Nómina de Alumnos Desarrolladores de 5° Año T.I.P.P. (public.alumnos)</h3>
                <p class="section-argument">
                    <strong>Argumentación Académica:</strong> Registra la trayectoria real de cada estudiante del Ciclo Superior Técnico en Informática Profesional y Personal, vinculando su equipo de desarrollo, promedio académico, docentes tutores y espacios curriculares cursados.
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Alumno / Matrícula & DNI</th>
                            <th>Curso & Promedio</th>
                            <th>Proyectos Integradores</th>
                            <th>Docentes Asignados</th>
                            <th>Asignaturas Cursadas</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="7">Sin registros</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    if (cleanScope === 'INTEGRAL' || cleanScope === 'PROYECTO') {
        const rows = systemDB.proyectos.map((p, idx) => {
            const alus = (p.alumnos_rel || []).map(a => a.nombre_completo).join(', ') || p.autores_resumen || 'Sin autores';
            const docs = (p.docentes_rel || []).map(d => `Prof. ${d.nombre_completo}`).join(', ') || 'Sin asignar';
            const asigs = (p.asignaturas_rel || []).map(a => a.nombre).join(', ') || 'Sin vincular';
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${Security.escapeHTML(p.codigo_proyecto)}</strong><br>${Security.escapeHTML(p.titulo)}<br><small>${Security.escapeHTML(p.categoria)} • ${Security.escapeHTML(p.division)}</small></td>
                    <td>${Security.escapeHTML(p.descripcion_tecnica)}<br><em style="color:#78350f;">Gestión: ${Security.escapeHTML(p.articulacion_gestion)}</em></td>
                    <td><strong>Alumnos:</strong> ${Security.escapeHTML(alus)}<br><strong>Docentes:</strong> ${Security.escapeHTML(docs)}<br><strong>Asignaturas:</strong> ${Security.escapeHTML(asigs)}</td>
                    <td><strong>${Security.escapeHTML(p.estado)}</strong><br>${p.calificacion ? `Calificación: <strong>${p.calificacion}/10</strong>` : 'Sin calificar'}</td>
                    <td><span class="status-pill ${p.activo !== false ? 'act' : 'inact'}">${p.activo !== false ? 'ACTIVO' : 'INACTIVO'}</span></td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>4. Catálogo de Proyectos Integradores Articulados (public.proyectos)</h3>
                <p class="section-argument">
                    <strong>Argumentación Interdisciplinaria:</strong> Cada proyecto sintetiza la convergencia entre el desarrollo de software/hardware en <em>Prácticas Profesionalizantes</em> y el estudio de factibilidad organizacional y económica en <em>Tecnología de Gestión</em>.
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Código / Proyecto & Categoría</th>
                            <th>Fundamentación Técnica y Articulación de Gestión</th>
                            <th>Relaciones Académicas (Alumnos / Docentes / Asignaturas)</th>
                            <th>Dictamen & Nota</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="6">Sin registros</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    if (cleanScope === 'INTEGRAL' || cleanScope === 'ASIGNATURA') {
        const rows = systemDB.asignaturas.map((a, idx) => {
            const docs = (a.docentes_rel || []).map(d => `Prof. ${d.nombre_completo} (${d.rol_catedra})`).join(', ') || 'Sin docente';
            const alusCount = (a.alumnos_rel || []).length;
            const proys = (a.proyectos_rel || []).map(p => p.codigo_proyecto).join(', ') || 'Ninguno';
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${Security.escapeHTML(a.codigo)}</strong><br>${Security.escapeHTML(a.nombre)}</td>
                    <td>${Security.escapeHTML(a.campo_formativo)}<br><small>${a.anio_cursado}° Año (Div: ${Security.escapeHTML(a.division)}) • ${a.carga_horaria_semanal} hs/sem</small></td>
                    <td>${Security.escapeHTML(a.descripcion || '-')}</td>
                    <td>${Security.escapeHTML(docs)}</td>
                    <td>${alusCount} alumnos inscriptos<br><small>Proyectos: ${Security.escapeHTML(proys)}</small></td>
                    <td><span class="status-pill ${a.activo !== false ? 'act' : 'inact'}">${a.activo !== false ? 'ACTIVA' : 'INACTIVA'}</span></td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>5. Estructura Curricular de Asignaturas Relacionales (public.asignaturas)</h3>
                <p class="section-argument">
                    <strong>Argumentación Curricular:</strong> Define el mapa de espacios formativos de 5° Año, garantizando que cada proyecto tecnológico esté respaldado por los contenidos curriculares oficiales y supervisado por sus respectivos responsables de cátedra.
                </p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Código & Asignatura</th>
                            <th>Campo Formativo & Carga Horaria</th>
                            <th>Descripción y Ejes Mínimos</th>
                            <th>Docentes a Cargo</th>
                            <th>Matrícula & Proyectos</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="7">Sin registros</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    const reportHTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Reporte Oficial ProjectHub C.E.N. - ${cleanScope}</title>
    <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #1c1305;
            background: #ffffff;
            line-height: 1.45;
            padding: 20px;
        }
        .no-print-bar {
            background: #140f06;
            color: #fff8eb;
            padding: 12px 20px;
            border-radius: 10px;
            border: 2px solid #f59e0b;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .btn-print {
            background: linear-gradient(135deg, #fbbf24, #d97706);
            color: #120d04;
            border: none;
            padding: 9px 18px;
            border-radius: 6px;
            font-weight: 800;
            cursor: pointer;
            font-size: 13px;
        }
        .header-banner {
            border: 2px solid #d97706;
            border-radius: 12px;
            padding: 18px 22px;
            background: linear-gradient(135deg, #1c1408 0%, #2b1f0c 100%);
            color: #fff8eb;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 16px;
        }
        .header-left h1 {
            font-size: 20px;
            color: #fbbf24;
            letter-spacing: 0.5px;
            text-transform: uppercase;
        }
        .header-left h2 {
            font-size: 13px;
            color: #fde68a;
            margin-top: 3px;
            font-weight: 600;
        }
        .header-left p {
            font-size: 11.5px;
            color: #d6c5a3;
            margin-top: 4px;
        }
        .header-meta {
            text-align: right;
            font-size: 11px;
            color: #fde68a;
            border-left: 1px solid rgba(251, 191, 36, 0.35);
            padding-left: 15px;
        }
        .executive-box {
            background: #fffbeb;
            border: 1px solid #f59e0b;
            border-left: 5px solid #d97706;
            border-radius: 8px;
            padding: 12px 16px;
            margin-bottom: 16px;
            font-size: 12px;
        }
        .executive-box h4 {
            color: #92400e;
            font-size: 13px;
            margin-bottom: 4px;
            text-transform: uppercase;
        }
        .kpi-row {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 10px;
            margin-bottom: 18px;
        }
        .kpi-card {
            border: 1px solid #fcd34d;
            background: #fef3c7;
            border-radius: 8px;
            padding: 9px 12px;
            text-align: center;
        }
        .kpi-card strong {
            display: block;
            font-size: 17px;
            color: #92400e;
        }
        .kpi-card span {
            font-size: 10.5px;
            color: #5c4928;
            font-weight: 600;
            text-transform: uppercase;
        }
        .report-section {
            margin-bottom: 22px;
            page-break-inside: avoid;
        }
        .report-section h3 {
            font-size: 14px;
            color: #140f06;
            background: #fde68a;
            border-left: 5px solid #d97706;
            padding: 7px 12px;
            border-radius: 4px;
            margin-bottom: 6px;
        }
        .section-argument {
            font-size: 11.5px;
            color: #453214;
            margin-bottom: 8px;
            padding: 0 4px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            font-size: 11px;
        }
        th {
            background: #1c1408;
            color: #fbbf24;
            text-align: left;
            padding: 7px 8px;
            border: 1px solid #453214;
            text-transform: uppercase;
            font-size: 10px;
        }
        td {
            padding: 6px 8px;
            border: 1px solid #e5d5b5;
            vertical-align: top;
        }
        tr:nth-child(even) td {
            background: #fffdf7;
        }
        .status-pill {
            display: inline-block;
            padding: 2px 7px;
            border-radius: 99px;
            font-size: 9.5px;
            font-weight: 700;
        }
        .status-pill.act { background: #d1fae5; color: #065f46; border: 1px solid #10b981; }
        .status-pill.inact { background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; }
        .footer-signatures {
            margin-top: 28px;
            padding-top: 14px;
            border-top: 2px solid #d97706;
            display: flex;
            justify-content: space-around;
            text-align: center;
            font-size: 11px;
            color: #453214;
        }
        .sig-line {
            width: 220px;
            border-top: 1px solid #1c1408;
            padding-top: 5px;
            margin-top: 30px;
        }
        @media print {
            .no-print-bar { display: none !important; }
            body { padding: 0; }
        }
    </style>
</head>
<body>
    <div class="no-print-bar">
        <div>
            <strong style="color:#fbbf24;">VISTA OFICIAL DE EXPORTACIÓN .PDF — PROJECTHUB C.E.N. NONOGASTA</strong>
            <div style="font-size:12px; color:#d6c5a3;">En el cuadro de diálogo de tu navegador selecciona <strong>"Guardar como PDF"</strong> como destino.</div>
        </div>
        <button class="btn-print" onclick="window.print()">Guardar / Imprimir .PDF Ahora</button>
    </div>

    <div class="header-banner">
        <div class="header-left">
            <h1>PROJECTHUB • CENTRO EDUCATIVO NONOGASTA (LA RIOJA)</h1>
            <h2>${reportMainTitle}</h2>
            <p>Ciclo Superior Secundario Técnico en Informática Profesional y Personal (5° Año) • Prácticas Profesionalizantes & Tecnología de Gestión</p>
        </div>
        <div class="header-meta">
            <div><strong>Fecha de Emisión:</strong> ${Security.escapeHTML(nowStr)}</div>
            <div><strong>Emitido por:</strong> ${Security.escapeHTML(adminAuthor)}</div>
            <div><strong>Motor BD:</strong> Supabase PostgreSQL (3FN + RLS)</div>
            <div><strong>Alcance:</strong> Módulo ${Security.escapeHTML(cleanScope)}</div>
        </div>
    </div>

    <div class="executive-box">
        <h4>Fundamentación Institucional y Metodológica del Reporte</h4>
        <p>
            El presente documento constituye el respaldo documental oficial emitido por la plataforma <strong>PROJECTHUB</strong> del <strong>Centro Educativo Nonogasta</strong>.
            Toda la información aquí expuesta proviene en tiempo real del esquema relacional normalizado en <strong>Tercera Forma Normal (3FN)</strong> alojado en Supabase PostgreSQL,
            integrando políticas de ciberseguridad <em>Row Level Security (RLS)</em>, preservación histórica mediante estados booleanos (<code>activo = true/false</code>) y control de integridad referencial entre Usuarios, Roles, Docentes, Alumnos, Proyectos y Asignaturas.
        </p>
    </div>

    <div class="kpi-row">
        <div class="kpi-card">
            <strong>${activeUsers} / ${totalUsers}</strong>
            <span>Usuarios Activos / Total</span>
        </div>
        <div class="kpi-card">
            <strong>${totalDocs}</strong>
            <span>Docentes Supervisores</span>
        </div>
        <div class="kpi-card">
            <strong>${totalAlus}</strong>
            <span>Alumnos de 5° Año</span>
        </div>
        <div class="kpi-card">
            <strong>${approvedProys} / ${totalProys}</strong>
            <span>Proyectos Aprobados / Total</span>
        </div>
        <div class="kpi-card">
            <strong>${totalAsigs}</strong>
            <span>Asignaturas Articuladas</span>
        </div>
    </div>

    ${sectionsHTML}

    <div class="footer-signatures">
        <div class="sig-line">
            <strong>Firma y Sello — Administración ProjectHub</strong><br>
            Coordinación Técnica C.E.N. Nonogasta
        </div>
        <div class="sig-line">
            <strong>Firma — Equipo Docente Evaluador</strong><br>
            Prácticas Profesionalizantes & Tec. de Gestión
        </div>
        <div class="sig-line">
            <strong>Dirección Institucional</strong><br>
            Centro Educativo Nonogasta - La Rioja
        </div>
    </div>

    <script>
        window.addEventListener('load', () => {
            setTimeout(() => { window.print(); }, 450);
        });
    </script>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (!printWin) {
        showToast('Permite las ventanas emergentes en tu navegador para generar el documento .PDF.');
        return;
    }
    printWin.document.open();
    printWin.document.write(reportHTML);
    printWin.document.close();
    showToast(`Reporte oficial .PDF (${cleanScope}) generado con el diseño institucional de ProjectHub.`);
}

/* ==========================================================================
   PANEL INTEGRAL DEL ROL DOCENTE (3 MÓDULOS PERSONALIZADOS):
   1) ESTUDIANTES: Ver sus estudiantes asignados + Agregar, Editar, Ver Detalle,
      Desactivar, Reactivar, Eliminar Definitivo, Selección Múltiple, Lote, CSV y PDF.
   2) PROYECTOS: Ver sus proyectos supervisados/cargados + Agregar, Editar, Evaluar,
      Ver Detalle, Desactivar, Reactivar, Eliminar Definitivo, Lote, CSV y PDF.
   3) ASIGNATURAS: Solo lectura de las asignaturas donde fue asignado por el
      Administrador + Ver Detalle y Exportar PDF.
   ========================================================================== */
let activeDocenteTab = 'estudiantes';

const selectedDocenteIds = {
    ESTUDIANTES: new Set(),
    PROYECTOS: new Set(),
    ASIGNATURAS: new Set()
};

function getDocenteEntityFromTab(tabName) {
    const map = {
        estudiantes: 'ESTUDIANTES',
        proyectos: 'PROYECTOS',
        asignaturas: 'ASIGNATURAS'
    };
    return map[tabName] || 'ESTUDIANTES';
}

function getDocenteSupabaseEntity(docenteModuleKey) {
    if (docenteModuleKey === 'ESTUDIANTES') return 'ALUMNO';
    if (docenteModuleKey === 'PROYECTOS') return 'PROYECTO';
    return 'ASIGNATURA';
}

function switchDocenteTab(tabName) {
    activeDocenteTab = tabName;

    document.querySelectorAll('[data-docentetab]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.docentetab === tabName);
    });

    ['estudiantes', 'proyectos', 'asignaturas'].forEach(key => {
        const sub = document.getElementById(`docente-subview-${key}`);
        if (sub) sub.classList.toggle('active', key === tabName);
    });

    updateDocenteBulkActionBar();
}

/**
 * Obtiene las colecciones filtradas exclusivamente para el Docente logueado:
 * - Sus asignaturas asignadas por el Administrador (docentes_asignaturas)
 * - Sus proyectos supervisados/cargados o articulados con sus cátedras
 * - Sus estudiantes asignados bajo tutoría o que cursan sus asignaturas
 */
function getDocenteScopedData() {
    if (!currentSession || !currentSession.userId) {
        return {
            misAsignaturas: [],
            misProyectos: [],
            misEstudiantes: []
        };
    }

    const docUserId = String(currentSession.userId);
    const docenteRecord = systemDB.docentes.find(d => String(d.usuario_id) === docUserId);

    // 1. Asignaturas donde el Administrador asignó a este docente
    const assignedAsigIds = new Set(
        (docenteRecord?.asignaturas_rel || []).map(a => String(a.id))
    );

    const misAsignaturas = systemDB.asignaturas.filter(asg => {
        if (assignedAsigIds.has(String(asg.id))) return true;
        return (asg.docentes_rel || []).some(d => String(d.usuario_id) === docUserId);
    });

    misAsignaturas.forEach(a => assignedAsigIds.add(String(a.id)));

    // 2. Proyectos donde este docente está asignado como supervisor/evaluador
    const assignedProjIds = new Set(
        (docenteRecord?.proyectos_rel || []).map(p => String(p.id))
    );

    const misProyectos = systemDB.proyectos.filter(p => {
        if (assignedProjIds.has(String(p.id))) return true;
        if ((p.docentes_rel || []).some(d => String(d.usuario_id) === docUserId)) return true;
        if ((p.asignaturas_rel || []).some(a => assignedAsigIds.has(String(a.id)))) return true;
        return false;
    });

    misProyectos.forEach(p => assignedProjIds.add(String(p.id)));

    // 3. Estudiantes asignados directamente al docente, integrantes de sus proyectos o inscriptos en sus asignaturas
    const assignedAluIds = new Set(
        (docenteRecord?.alumnos_rel || []).map(al => String(al.usuario_id))
    );

    const misEstudiantes = systemDB.alumnos.filter(al => {
        const aluId = String(al.usuario_id);
        if (assignedAluIds.has(aluId)) return true;
        if ((al.docentes_rel || []).some(d => String(d.usuario_id) === docUserId)) return true;
        if ((al.asignaturas_rel || []).some(a => assignedAsigIds.has(String(a.id)))) return true;
        if ((al.proyectos_rel || []).some(p => assignedProjIds.has(String(p.id)))) return true;
        return false;
    });

    return {
        misAsignaturas,
        misProyectos,
        misEstudiantes
    };
}

function renderDocenteDashboard() {
    const kpiEst = document.getElementById('docenteKpiEstudiantes');
    const kpiProy = document.getElementById('docenteKpiProyectos');
    const kpiAsig = document.getElementById('docenteKpiAsignaturas');
    const subTitle = document.getElementById('docenteHeaderSubtitle');

    const { misAsignaturas, misProyectos, misEstudiantes } = getDocenteScopedData();

    const actEst = misEstudiantes.filter(e => e.activo !== false).length;
    const actProy = misProyectos.filter(p => p.activo !== false).length;
    const actAsig = misAsignaturas.filter(a => a.activo !== false).length;

    if (kpiEst) kpiEst.textContent = `${actEst} / ${misEstudiantes.length}`;
    if (kpiProy) kpiProy.textContent = `${actProy} / ${misProyectos.length}`;
    if (kpiAsig) kpiAsig.textContent = `${actAsig}`;

    if (subTitle && currentSession) {
        const asigNames = misAsignaturas.map(a => a.nombre).join(' • ') || 'Sin cátedras asignadas aún';
        subTitle.innerHTML = `Docente Activo: <strong>${Security.escapeHTML(currentSession.displayName)}</strong> • Cátedras asignadas por Administración: <strong>${Security.escapeHTML(asigNames)}</strong>`;
    }

    renderDocenteEstudiantesTable();
    renderDocenteProyectosTable();
    renderDocenteAsignaturasTable();
    updateDocenteBulkActionBar();
}

function toggleDocenteRowSelection(moduleKey, id, isChecked) {
    const set = selectedDocenteIds[moduleKey];
    if (!set) return;

    if (isChecked) set.add(String(id));
    else set.delete(String(id));

    if (moduleKey === 'ESTUDIANTES') renderDocenteEstudiantesTable();
    else if (moduleKey === 'PROYECTOS') renderDocenteProyectosTable();
    else if (moduleKey === 'ASIGNATURAS') renderDocenteAsignaturasTable();

    updateDocenteBulkActionBar();
}

function toggleDocenteSelectAll(moduleKey, isChecked) {
    const set = selectedDocenteIds[moduleKey];
    if (!set) return;
    set.clear();

    const { misAsignaturas, misProyectos, misEstudiantes } = getDocenteScopedData();

    if (isChecked) {
        if (moduleKey === 'ESTUDIANTES') {
            misEstudiantes.forEach(e => set.add(String(e.usuario_id)));
        } else if (moduleKey === 'PROYECTOS') {
            misProyectos.forEach(p => set.add(String(p.id)));
        } else if (moduleKey === 'ASIGNATURAS') {
            misAsignaturas.forEach(a => set.add(String(a.id)));
        }
    }

    if (moduleKey === 'ESTUDIANTES') renderDocenteEstudiantesTable();
    else if (moduleKey === 'PROYECTOS') renderDocenteProyectosTable();
    else if (moduleKey === 'ASIGNATURAS') renderDocenteAsignaturasTable();

    updateDocenteBulkActionBar();
}

function clearDocenteModuleSelection() {
    const moduleKey = getDocenteEntityFromTab(activeDocenteTab);
    if (selectedDocenteIds[moduleKey]) selectedDocenteIds[moduleKey].clear();

    const chk = document.getElementById(`docenteSelectAll_${moduleKey}`);
    if (chk) chk.checked = false;

    if (moduleKey === 'ESTUDIANTES') renderDocenteEstudiantesTable();
    else if (moduleKey === 'PROYECTOS') renderDocenteProyectosTable();
    else if (moduleKey === 'ASIGNATURAS') renderDocenteAsignaturasTable();

    updateDocenteBulkActionBar();
}

function updateDocenteBulkActionBar() {
    const moduleKey = getDocenteEntityFromTab(activeDocenteTab);
    const set = selectedDocenteIds[moduleKey] || new Set();
    const count = set.size;

    const bar = document.getElementById('docenteBulkActionBar');
    const countPill = document.getElementById('docenteBulkCountPill');
    const labelText = document.getElementById('docenteBulkLabelText');
    const editBtn = document.getElementById('docenteBulkEditBtn');
    const deactBtn = document.getElementById('docenteBulkDeactivateBtn');
    const restBtn = document.getElementById('docenteBulkRestoreBtn');
    const hardDelBtn = document.getElementById('docenteBulkHardDeleteBtn');

    if (!bar) return;

    if (count > 0) {
        bar.classList.add('visible');
        if (countPill) countPill.textContent = count;
        if (labelText) {
            labelText.textContent = count === 1
                ? `registro seleccionado en módulo ${moduleKey}`
                : `registros seleccionados en módulo ${moduleKey}`;
        }

        // En el módulo ASIGNATURAS el Docente solo tiene permiso de Ver Detalle (Asignadas por Administrador)
        const isReadOnlyAsignaturas = (moduleKey === 'ASIGNATURAS');
        if (editBtn) editBtn.style.display = isReadOnlyAsignaturas ? 'none' : 'inline-flex';
        if (deactBtn) deactBtn.style.display = isReadOnlyAsignaturas ? 'none' : 'inline-flex';
        if (restBtn) restBtn.style.display = isReadOnlyAsignaturas ? 'none' : 'inline-flex';
        if (hardDelBtn) hardDelBtn.style.display = isReadOnlyAsignaturas ? 'none' : 'inline-flex';
    } else {
        bar.classList.remove('visible');
    }
}

async function handleDocenteBulkAction(accion) {
    const moduleKey = getDocenteEntityFromTab(activeDocenteTab);
    const supabaseEntity = getDocenteSupabaseEntity(moduleKey);
    const idsArray = Array.from(selectedDocenteIds[moduleKey] || []);

    if (idsArray.length === 0) {
        showToast('Selecciona al menos un registro marcando su casilla.');
        return;
    }

    if (accion === 'VER_DETALLE') {
        openAdminVerInfoMultiple(supabaseEntity, idsArray);
        return;
    }

    if (moduleKey === 'ASIGNATURAS') {
        showToast('Las Asignaturas son asignadas por el Administrador (Modo Consulta para Docente).');
        return;
    }

    if (accion === 'EDITAR') {
        const firstId = idsArray[0];
        if (moduleKey === 'ESTUDIANTES') openDocenteStudentModal(firstId);
        else if (moduleKey === 'PROYECTOS') openAdminProjectModal(firstId);
        return;
    }

    if (accion === 'ELIMINAR_DEFINITIVO') {
        const confirmMsg = `⚠️ CONFIRMACIÓN DOCENTE:\n\nSe eliminarán DEFINITIVAMENTE de la base de datos los registros seleccionados (${idsArray.length}) que YA estén en estado INACTIVO.\n\n¿Confirmas la eliminación definitiva?`;
        if (!window.confirm(confirmMsg)) return;
    }

    try {
        const res = await window.ProjectHubAuth.executeBatchOperation(supabaseEntity, idsArray, accion);
        clearDocenteModuleSelection();
        await refreshSystemDataFromSupabase(false);

        if (accion === 'ELIMINAR_DEFINITIVO') {
            if (res?.omitidos_por_activos > 0) {
                showToast(`Eliminados definitivos: ${res.procesados}. Omitidos por seguir Activos: ${res.omitidos_por_activos} (Desactívalos primero).`);
            } else {
                showToast(`Se eliminaron definitivamente ${res?.procesados || idsArray.length} registros inactivos.`);
            }
        } else if (accion === 'DESACTIVAR') {
            showToast(`${res?.procesados || idsArray.length} registros pasaron a estado INACTIVO.`);
        } else if (accion === 'REACTIVAR') {
            showToast(`${res?.procesados || idsArray.length} registros fueron REACTIVADOS.`);
        }
    } catch (err) {
        showToast(err.message || 'No se pudo completar la operación en lote.');
    }
}

/* --------------------------------------------------------------------------
   MÓDULO DOCENTE 1: TABLA DE ESTUDIANTES ASIGNADOS AL DOCENTE
   -------------------------------------------------------------------------- */
function renderDocenteEstudiantesTable() {
    const tbody = document.getElementById('docenteEstudiantesTableBody');
    if (!tbody) return;

    const { misEstudiantes } = getDocenteScopedData();
    const query = (document.getElementById('docenteSearchEstudiantes')?.value || '').toLowerCase().trim();
    const filterEstado = document.getElementById('docenteFilterEstadoEstudiantes')?.value || 'TODOS';

    const filtered = misEstudiantes.filter(al => {
        const isAct = al.activo !== false;
        if (filterEstado === 'ACTIVOS' && !isAct) return false;
        if (filterEstado === 'INACTIVOS' && isAct) return false;
        if (!query) return true;
        return (
            (al.nombre_completo || '').toLowerCase().includes(query) ||
            (al.matricula_legajo || '').toLowerCase().includes(query) ||
            (al.dni || '').toLowerCase().includes(query) ||
            (al.division || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron estudiantes asignados con ese criterio.</td></tr>`;
        return;
    }

    const selectedSet = selectedDocenteIds.ESTUDIANTES;
    const docUserId = String(currentSession?.userId || '');

    tbody.innerHTML = filtered.map(al => {
        const isAct = al.activo !== false;
        const isSelected = selectedSet.has(String(al.usuario_id));

        const proysHTML = (al.proyectos_rel || []).map(p => `
            <span class="rel-pill"><i class="fa-solid fa-laptop-code"></i> ${Security.escapeHTML(p.titulo.substring(0, 28))}... (${Security.escapeHTML(p.estado)})</span>
        `).join('');

        const asigsHTML = (al.asignaturas_rel || []).map(a => `
            <span class="rel-pill"><i class="fa-solid fa-book-bookmark"></i> ${Security.escapeHTML(a.nombre)}</span>
        `).join('');

        const tutoriaObj = (al.docentes_rel || []).find(d => String(d.usuario_id) === docUserId);
        const vinculoTexto = tutoriaObj ? tutoriaObj.tipo_tutoria : 'Estudiante de Cátedra / Proyecto';

        return `
            <tr class="${isAct ? '' : 'row-inactivo'} ${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleDocenteRowSelection('ESTUDIANTES', '${al.usuario_id}', this.checked)">
                </td>
                <td>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(al.nombre_completo)}</strong>
                    <span style="font-size:0.75rem; color:var(--gold-primary);">Matrícula: ${Security.escapeHTML(al.matricula_legajo)} • ${al.anio_cursado}° "${Security.escapeHTML(al.division)}"</span>
                    <div style="font-size:0.74rem; color:var(--text-muted);">DNI: ${Security.escapeHTML(al.dni)} ${al.promedio_general ? `• Promedio: ${al.promedio_general}` : ''}</div>
                </td>
                <td><div class="rel-pill-list">${proysHTML || '<span style="color:var(--text-muted);">Sin proyecto aún</span>'}</div></td>
                <td><div class="rel-pill-list">${asigsHTML || '<span style="color:var(--text-muted);">Sin asignaturas</span>'}</div></td>
                <td><span class="badge-category">${Security.escapeHTML(vinculoTexto)}</span></td>
                <td>${renderBooleanBadge(isAct)}</td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('ALUMNO', '${al.usuario_id}')">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openDocenteStudentModal('${al.usuario_id}')">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('ALUMNO', '${al.usuario_id}', false, '${Security.escapeHTML(al.nombre_completo)}')">
                                <i class="fa-solid fa-power-off"></i> Desactivar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('ALUMNO', '${al.usuario_id}', true, '${Security.escapeHTML(al.nombre_completo)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
                            </button>
                            <button class="btn-action-sm btn-action-hard-delete" onclick="handleAdminHardDelete('ALUMNO', '${al.usuario_id}', '${Security.escapeHTML(al.nombre_completo)}')">
                                <i class="fa-solid fa-trash-can"></i> Eliminar Definitivo
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   MÓDULO DOCENTE 2: TABLA DE PROYECTOS SUPERVISADOS / CARGADOS POR EL DOCENTE
   -------------------------------------------------------------------------- */
function renderDocenteProyectosTable() {
    const tbody = document.getElementById('docenteProyectosTableBody');
    if (!tbody) return;

    const { misProyectos } = getDocenteScopedData();
    const query = (document.getElementById('docenteSearchProyectos')?.value || '').toLowerCase().trim();
    const filterEstado = document.getElementById('docenteFilterEstadoProyectos')?.value || 'TODOS';

    const filtered = misProyectos.filter(p => {
        const isAct = p.activo !== false;
        if (filterEstado === 'ACTIVOS' && !isAct) return false;
        if (filterEstado === 'INACTIVOS' && isAct) return false;
        if (!query) return true;
        return (
            (p.titulo || '').toLowerCase().includes(query) ||
            (p.codigo_proyecto || '').toLowerCase().includes(query) ||
            (p.categoria || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron proyectos asignados con ese filtro.</td></tr>`;
        return;
    }

    const selectedSet = selectedDocenteIds.PROYECTOS;

    tbody.innerHTML = filtered.map(p => {
        const isAct = p.activo !== false;
        const isSelected = selectedSet.has(String(p.id));

        const alusHTML = (p.alumnos_rel || []).map(a => `
            <span class="rel-pill"><i class="fa-solid fa-user-graduate"></i> ${Security.escapeHTML(a.nombre_completo)}</span>
        `).join('');

        const asigsHTML = (p.asignaturas_rel || []).map(asg => `
            <span class="rel-pill"><i class="fa-solid fa-book"></i> ${Security.escapeHTML(asg.nombre)}</span>
        `).join('');

        return `
            <tr class="${isAct ? '' : 'row-inactivo'} ${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleDocenteRowSelection('PROYECTOS', '${p.id}', this.checked)">
                </td>
                <td>
                    <span class="badge-category" style="margin-bottom:0.25rem; display:inline-block;">${Security.escapeHTML(p.codigo_proyecto)} • ${Security.escapeHTML(p.categoria)}</span>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(p.titulo)}</strong>
                    <small style="color:var(--text-muted);">${Security.escapeHTML(p.division)}</small>
                </td>
                <td><div class="rel-pill-list">${alusHTML || Security.escapeHTML(p.autores_resumen || 'Sin estudiantes')}</div></td>
                <td><div class="rel-pill-list">${asigsHTML || '<span style="color:var(--text-muted);">Sin vincular</span>'}</div></td>
                <td>
                    <span class="badge-status ${getStatusBadgeClass(p.estado)}">${Security.escapeHTML(p.estado)}</span>
                    ${p.calificacion ? `<div style="margin-top:0.3rem;"><span class="grade-pill">${p.calificacion}/10</span></div>` : '<div style="font-size:0.74rem; color:var(--text-muted); margin-top:0.25rem;">Sin calificar</div>'}
                </td>
                <td>${renderBooleanBadge(isAct)}</td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('PROYECTO', '${p.id}')" title="Ver Detalle Relacional">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminProjectModal('${p.id}')" title="Editar Proyecto y Vínculos">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        <button class="btn-action-sm" style="background:rgba(245,158,11,0.16); color:var(--gold-primary); border:1px solid var(--gold-border);" onclick="openEvaluationModal('${p.id}')" title="Calificar y dar Devolución Docente">
                            <i class="fa-solid fa-star"></i> Evaluar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('PROYECTO', '${p.id}', false, '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-power-off"></i> Desactivar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('PROYECTO', '${p.id}', true, '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
                            </button>
                            <button class="btn-action-sm btn-action-hard-delete" onclick="handleAdminHardDelete('PROYECTO', '${p.id}', '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-trash-can"></i> Eliminar Definitivo
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   MÓDULO DOCENTE 3: TABLA DE ASIGNATURAS ASIGNADAS POR EL ADMINISTRADOR (SOLO VER)
   -------------------------------------------------------------------------- */
function renderDocenteAsignaturasTable() {
    const tbody = document.getElementById('docenteAsignaturasTableBody');
    if (!tbody) return;

    const { misAsignaturas } = getDocenteScopedData();
    const query = (document.getElementById('docenteSearchAsignaturas')?.value || '').toLowerCase().trim();

    const filtered = misAsignaturas.filter(a => {
        if (!query) return true;
        return (
            (a.nombre || '').toLowerCase().includes(query) ||
            (a.codigo || '').toLowerCase().includes(query) ||
            (a.campo_formativo || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No tienes asignaturas asignadas por el Administrador con ese criterio.</td></tr>`;
        return;
    }

    const selectedSet = selectedDocenteIds.ASIGNATURAS;
    const docUserId = String(currentSession?.userId || '');

    tbody.innerHTML = filtered.map(a => {
        const isAct = a.activo !== false;
        const isSelected = selectedSet.has(String(a.id));

        const miDesignacion = (a.docentes_rel || []).find(d => String(d.usuario_id) === docUserId);
        const rolCatedra = miDesignacion?.rol_catedra || 'Docente Asignado';

        const alusHTML = (a.alumnos_rel || []).map(al => `
            <span class="rel-pill"><i class="fa-solid fa-user-graduate"></i> ${Security.escapeHTML(al.nombre_completo)}</span>
        `).join('');

        const proysHTML = (a.proyectos_rel || []).map(p => `
            <span class="rel-pill"><i class="fa-solid fa-diagram-project"></i> ${Security.escapeHTML(p.codigo_proyecto)}: ${Security.escapeHTML(p.titulo.substring(0, 24))}...</span>
        `).join('');

        return `
            <tr class="${isAct ? '' : 'row-inactivo'} ${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleDocenteRowSelection('ASIGNATURAS', '${a.id}', this.checked)">
                </td>
                <td>
                    <span class="badge-category" style="margin-bottom:0.25rem; display:inline-block;">${Security.escapeHTML(a.codigo)}</span>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(a.nombre)}</strong>
                    <small style="color:var(--gold-primary);">${Security.escapeHTML(a.campo_formativo)}</small>
                </td>
                <td>
                    <strong>${a.anio_cursado}° Año (Div: ${Security.escapeHTML(a.division)})</strong>
                    <div style="font-size:0.76rem; color:var(--text-muted);">${a.carga_horaria_semanal} hs/sem • Rol: <strong>${Security.escapeHTML(rolCatedra)}</strong></div>
                </td>
                <td><div class="rel-pill-list">${alusHTML || '<span style="color:var(--text-muted);">Sin estudiantes</span>'}</div></td>
                <td><div class="rel-pill-list">${proysHTML || '<span style="color:var(--text-muted);">Sin proyectos</span>'}</div></td>
                <td>${renderBooleanBadge(isAct)}</td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('ASIGNATURA', '${a.id}')">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle de Cátedra
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   EXPORTACIÓN .PDF PERSONALIZADA EXCLUSIVA PARA EL DOCENTE Y SUS MÓDULOS
   -------------------------------------------------------------------------- */
function exportDocenteReportPDF(scope = 'INTEGRAL_DOCENTE') {
    const cleanScope = String(scope || 'INTEGRAL_DOCENTE').trim().toUpperCase();
    const { misAsignaturas, misProyectos, misEstudiantes } = getDocenteScopedData();
    const nowStr = new Date().toLocaleString('es-AR');
    const docenteName = currentSession ? `${currentSession.displayName}` : 'Docente C.E.N.';

    let sectionsHTML = '';

    if (cleanScope === 'INTEGRAL_DOCENTE' || cleanScope === 'ESTUDIANTES') {
        const rows = misEstudiantes.map((al, idx) => {
            const proys = (al.proyectos_rel || []).map(p => `${p.codigo_proyecto}: ${p.titulo} [${p.estado}]`).join(' | ');
            const asigs = (al.asignaturas_rel || []).map(a => a.nombre).join(', ');
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${Security.escapeHTML(al.nombre_completo)}</strong><br><small>Matrícula: ${Security.escapeHTML(al.matricula_legajo)} • DNI: ${Security.escapeHTML(al.dni)}</small></td>
                    <td>${al.anio_cursado}° "${Security.escapeHTML(al.division)}"<br><small>Prom: ${al.promedio_general || 'S/C'}</small></td>
                    <td>${Security.escapeHTML(proys || 'Sin proyecto')}</td>
                    <td>${Security.escapeHTML(asigs || 'Sin asignaturas')}</td>
                    <td><span class="status-pill ${al.activo !== false ? 'act' : 'inact'}">${al.activo !== false ? 'ACTIVO' : 'INACTIVO'}</span></td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>Módulo 1: Mis Estudiantes Asignados y Supervisados (${misEstudiantes.length})</h3>
                <p class="section-argument">Nómina oficial de estudiantes de 5° Año vinculados a la cátedra y tutoría técnica del docente ${Security.escapeHTML(docenteName)}.</p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Estudiante / Matrícula & DNI</th>
                            <th>Curso & Promedio</th>
                            <th>Proyectos donde Participa</th>
                            <th>Asignaturas que Cursa</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="6">Sin estudiantes asignados</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    if (cleanScope === 'INTEGRAL_DOCENTE' || cleanScope === 'PROYECTOS') {
        const rows = misProyectos.map((p, idx) => {
            const alus = (p.alumnos_rel || []).map(a => a.nombre_completo).join(', ') || p.autores_resumen || 'Sin autores';
            const asigs = (p.asignaturas_rel || []).map(a => a.nombre).join(', ') || 'Sin vincular';
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${Security.escapeHTML(p.codigo_proyecto)}</strong><br>${Security.escapeHTML(p.titulo)}<br><small>${Security.escapeHTML(p.categoria)} • ${Security.escapeHTML(p.division)}</small></td>
                    <td>${Security.escapeHTML(p.descripcion_tecnica)}</td>
                    <td><strong>Estudiantes:</strong> ${Security.escapeHTML(alus)}<br><strong>Asignaturas:</strong> ${Security.escapeHTML(asigs)}</td>
                    <td><strong>${Security.escapeHTML(p.estado)}</strong><br>${p.calificacion ? `Calificación: <strong>${p.calificacion}/10</strong>` : 'Sin calificar'}</td>
                    <td><span class="status-pill ${p.activo !== false ? 'act' : 'inact'}">${p.activo !== false ? 'ACTIVO' : 'INACTIVO'}</span></td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>Módulo 2: Mis Proyectos Supervisados y Evaluados (${misProyectos.length})</h3>
                <p class="section-argument">Seguimiento académico, dictamen evaluativo y calificación de los proyectos integradores asignados al docente.</p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Código / Proyecto & Categoría</th>
                            <th>Resumen Técnico</th>
                            <th>Estudiantes y Asignaturas</th>
                            <th>Dictamen & Calificación</th>
                            <th>Estado</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="6">Sin proyectos supervisados</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    if (cleanScope === 'INTEGRAL_DOCENTE' || cleanScope === 'ASIGNATURAS') {
        const rows = misAsignaturas.map((a, idx) => `
            <tr>
                <td>${idx + 1}</td>
                <td><strong>${Security.escapeHTML(a.codigo)}</strong><br>${Security.escapeHTML(a.nombre)}</td>
                <td>${Security.escapeHTML(a.campo_formativo)}</td>
                <td>${a.anio_cursado}° Año (Div: ${Security.escapeHTML(a.division)}) • ${a.carga_horaria_semanal} hs/sem</td>
                <td>${(a.alumnos_rel || []).length} estudiantes inscriptos</td>
                <td>${(a.proyectos_rel || []).length} proyectos articulados</td>
            </tr>
        `).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>Módulo 3: Mis Asignaturas Asignadas por Administración (${misAsignaturas.length})</h3>
                <p class="section-argument">Espacios curriculares asignados oficialmente al docente en la base de datos relacional del C.E.N. Nonogasta.</p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Código & Asignatura</th>
                            <th>Campo Formativo</th>
                            <th>Curso y Carga Horaria</th>
                            <th>Matrícula</th>
                            <th>Proyectos Articulados</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="6">Sin asignaturas asignadas</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    const reportHTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Reporte Docente ProjectHub C.E.N. - ${Security.escapeHTML(docenteName)}</title>
    <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #1c1305; background: #fff; padding: 20px; line-height: 1.45; }
        .no-print-bar { background: #140f06; color: #fff8eb; padding: 12px 20px; border-radius: 10px; border: 2px solid #f59e0b; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .btn-print { background: linear-gradient(135deg, #fbbf24, #d97706); color: #120d04; border: none; padding: 9px 18px; border-radius: 6px; font-weight: 800; cursor: pointer; }
        .header-banner { border: 2px solid #d97706; border-radius: 12px; padding: 18px 22px; background: linear-gradient(135deg, #1c1408 0%, #2b1f0c 100%); color: #fff8eb; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .header-left h1 { font-size: 19px; color: #fbbf24; text-transform: uppercase; }
        .header-left h2 { font-size: 13px; color: #fde68a; margin-top: 3px; }
        .header-meta { text-align: right; font-size: 11px; color: #fde68a; border-left: 1px solid rgba(251,191,36,0.35); padding-left: 15px; }
        .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
        .kpi-card { border: 1px solid #fcd34d; background: #fef3c7; border-radius: 8px; padding: 9px 12px; text-align: center; }
        .kpi-card strong { display: block; font-size: 17px; color: #92400e; }
        .kpi-card span { font-size: 10.5px; color: #5c4928; font-weight: 600; text-transform: uppercase; }
        .report-section { margin-bottom: 22px; page-break-inside: avoid; }
        .report-section h3 { font-size: 14px; color: #140f06; background: #fde68a; border-left: 5px solid #d97706; padding: 7px 12px; border-radius: 4px; margin-bottom: 6px; }
        .section-argument { font-size: 11.5px; color: #453214; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #1c1408; color: #fbbf24; text-align: left; padding: 7px 8px; border: 1px solid #453214; text-transform: uppercase; font-size: 10px; }
        td { padding: 6px 8px; border: 1px solid #e5d5b5; vertical-align: top; }
        .status-pill { display: inline-block; padding: 2px 7px; border-radius: 99px; font-size: 9.5px; font-weight: 700; }
        .status-pill.act { background: #d1fae5; color: #065f46; border: 1px solid #10b981; }
        .status-pill.inact { background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; }
        @media print { .no-print-bar { display: none !important; } body { padding: 0; } }
    </style>
</head>
<body>
    <div class="no-print-bar">
        <div>
            <strong style="color:#fbbf24;">REPORTE OFICIAL DOCENTE (.PDF) — PROJECTHUB C.E.N. NONOGASTA</strong>
            <div style="font-size:12px; color:#d6c5a3;">Selecciona "Guardar como PDF" en el cuadro de impresión.</div>
        </div>
        <button class="btn-print" onclick="window.print()">Guardar / Imprimir .PDF</button>
    </div>
    <div class="header-banner">
        <div class="header-left">
            <h1>PROJECTHUB • CENTRO EDUCATIVO NONOGASTA</h1>
            <h2>INFORME DE CÁTEDRA Y SUPERVISIÓN DOCENTE: ${Security.escapeHTML(docenteName)}</h2>
        </div>
        <div class="header-meta">
            <div><strong>Fecha:</strong> ${Security.escapeHTML(nowStr)}</div>
            <div><strong>Rol Activo:</strong> DOCENTE</div>
            <div><strong>Alcance:</strong> ${Security.escapeHTML(cleanScope)}</div>
        </div>
    </div>
    <div class="kpi-row">
        <div class="kpi-card"><strong>${misEstudiantes.length}</strong><span>Mis Estudiantes Asignados</span></div>
        <div class="kpi-card"><strong>${misProyectos.length}</strong><span>Mis Proyectos Supervisados</span></div>
        <div class="kpi-card"><strong>${misAsignaturas.length}</strong><span>Mis Asignaturas Asignadas</span></div>
    </div>
    ${sectionsHTML}
    <script>window.addEventListener('load', () => { setTimeout(() => { window.print(); }, 450); });</script>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (!printWin) {
        showToast('Permite las ventanas emergentes para generar el PDF docente.');
        return;
    }
    printWin.document.open();
    printWin.document.write(reportHTML);
    printWin.document.close();
}

/* ==========================================================================
   PANEL INTEGRAL DEL ALUMNO (3 MÓDULOS PERSONALIZADOS Y RELACIONALES)
   1. PROYECTOS: Mis Proyectos (Agregar, Editar, Ver Detalle, Desactivar/Eliminar, Lote, CSV, PDF + GitHub / Supabase / Vercel / Local)
   2. CALIFICACIONES: Mis Calificaciones Sumativas y Devoluciones Pedagógicas Docentes + Boletín PDF
   3. ASIGNATURAS: Mis Asignaturas Asignadas por Administración (Solo lectura + Ver Detalle y PDF)
   ========================================================================== */
let activeAlumnoTab = 'proyectos';
const selectedAlumnoIds = {
    proyectos: new Set(),
    calificaciones: new Set(),
    asignaturas: new Set()
};

function jumpToAlumnoModule(tabName) {
    handleProtectedNavigation('cargar');
    const targetBtn = document.querySelector(`#alumnoModuleTabs .pill-btn[data-alumnotab="${tabName}"]`);
    switchAlumnoTab(tabName, targetBtn);
}

function switchAlumnoTab(tabName, btnEl) {
    activeAlumnoTab = tabName;
    document.querySelectorAll('#alumnoModuleTabs .pill-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) {
        btnEl.classList.add('active');
    } else {
        const fallbackBtn = document.querySelector(`#alumnoModuleTabs .pill-btn[data-alumnotab="${tabName}"]`);
        if (fallbackBtn) fallbackBtn.classList.add('active');
    }

    document.querySelectorAll('.alumno-subview').forEach(v => {
        v.style.display = 'none';
    });
    const targetView = document.getElementById(`alumno-subview-${tabName}`);
    if (targetView) targetView.style.display = 'block';

    updateAlumnoBulkActionBar();
}

function getAlumnoScopedData() {
    if (!currentSession) {
        return { misProyectos: [], misAsignaturas: [], miFichaAlumno: null, promedioGeneral: 'S/C' };
    }

    const userId = String(currentSession.userId || '');
    const isAdmin = currentSession.role === 'ADMINISTRADOR';

    const miFichaAlumno = systemDB.alumnos.find(al => String(al.usuario_id) === userId) || null;

    // 1. Mis Proyectos (donde el alumno es integrante en proyectos_alumnos, o todos si el admin previsualiza el panel)
    const misProyectos = isAdmin
        ? systemDB.proyectos
        : systemDB.proyectos.filter(p => (p.alumnos_rel || []).some(a => String(a.usuario_id) === userId));

    // Si por algún motivo un alumno de demostración no tuviera proyectos en proyectos_rel, mostrar los de su división o equipo
    const proyectosFinales = (misProyectos.length > 0 || isAdmin)
        ? misProyectos
        : systemDB.proyectos.filter(p => (p.autores_resumen || '').toLowerCase().includes((currentSession.apellidos || '').toLowerCase()));

    // 2. Mis Asignaturas asignadas por el Administrador en alumnos_asignaturas
    const misAsignaturas = isAdmin
        ? systemDB.asignaturas
        : systemDB.asignaturas.filter(a => (a.alumnos_rel || []).some(al => String(al.usuario_id) === userId));

    // 3. Calcular promedio sumativo de proyectos calificados + promedio general
    const notasProyectos = proyectosFinales
        .map(p => parseFloat(p.calificacion))
        .filter(n => !isNaN(n) && n > 0);

    let promedioGeneral = miFichaAlumno?.promedio_general ? String(miFichaAlumno.promedio_general) : 'S/C';
    if (notasProyectos.length > 0) {
        const avg = notasProyectos.reduce((acc, v) => acc + v, 0) / notasProyectos.length;
        promedioGeneral = `${avg.toFixed(2)} / 10`;
    }

    return {
        misProyectos: proyectosFinales,
        misAsignaturas,
        miFichaAlumno,
        promedioGeneral
    };
}

function renderAlumnoDashboard() {
    const { misProyectos, misAsignaturas, promedioGeneral } = getAlumnoScopedData();

    const kpiProy = document.getElementById('alumnoKpiProyectos');
    const kpiProm = document.getElementById('alumnoKpiPromedio');
    const kpiAsig = document.getElementById('alumnoKpiAsignaturas');

    if (kpiProy) kpiProy.textContent = misProyectos.length;
    if (kpiProm) kpiProm.textContent = promedioGeneral;
    if (kpiAsig) kpiAsig.textContent = misAsignaturas.length;

    renderAlumnoProyectosTable();
    renderAlumnoCalificacionesTable();
    renderAlumnoAsignaturasTable();
    updateAlumnoBulkActionBar();
}

function toggleAlumnoRowSelection(tabKey, id, isChecked) {
    const set = selectedAlumnoIds[tabKey];
    if (!set) return;
    if (isChecked) {
        set.add(String(id));
    } else {
        set.delete(String(id));
    }
    updateAlumnoBulkActionBar();
}

function toggleSelectAllAlumno(tabKey, isChecked) {
    const set = selectedAlumnoIds[tabKey];
    if (!set) return;
    set.clear();

    const { misProyectos, misAsignaturas } = getAlumnoScopedData();
    if (tabKey === 'proyectos' || tabKey === 'calificaciones') {
        if (isChecked) misProyectos.forEach(p => set.add(String(p.id)));
        if (tabKey === 'proyectos') renderAlumnoProyectosTable();
        if (tabKey === 'calificaciones') renderAlumnoCalificacionesTable();
    } else if (tabKey === 'asignaturas') {
        if (isChecked) misAsignaturas.forEach(a => set.add(String(a.id)));
        renderAlumnoAsignaturasTable();
    }
    updateAlumnoBulkActionBar();
}

function clearAlumnoSelection() {
    Object.values(selectedAlumnoIds).forEach(s => s.clear());
    ['selectAllAlumnoProyectos', 'selectAllAlumnoCalificaciones', 'selectAllAlumnoAsignaturas'].forEach(chkId => {
        const el = document.getElementById(chkId);
        if (el) el.checked = false;
    });
    renderAlumnoDashboard();
}

function updateAlumnoBulkActionBar() {
    const bar = document.getElementById('alumnoBulkActionBar');
    const badge = document.getElementById('alumnoBulkCountBadge');
    if (!bar || !badge) return;

    const currentSet = selectedAlumnoIds[activeAlumnoTab] || new Set();
    const count = currentSet.size;

    if (count === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    badge.textContent = `${count} seleccionado${count > 1 ? 's' : ''} en ${activeAlumnoTab.toUpperCase()}`;

    // En CALIFICACIONES y ASIGNATURAS el alumno solo puede Ver Detalle (lectura académica)
    const isReadOnlyTab = (activeAlumnoTab === 'calificaciones' || activeAlumnoTab === 'asignaturas');
    ['alumnoBulkEditBtn', 'alumnoBulkDeactivateBtn', 'alumnoBulkActivateBtn', 'alumnoBulkDeletePermBtn'].forEach(btnId => {
        const btn = document.getElementById(btnId);
        if (btn) btn.style.display = isReadOnlyTab ? 'none' : 'inline-flex';
    });
}

async function handleAlumnoBulkAction(accion) {
    const currentSet = selectedAlumnoIds[activeAlumnoTab] || new Set();
    const idsArray = Array.from(currentSet);
    if (idsArray.length === 0) return;

    const entidad = (activeAlumnoTab === 'asignaturas') ? 'ASIGNATURA' : 'PROYECTO';

    if (accion === 'VER_INFO') {
        if (idsArray.length === 1) {
            openAdminVerInfo(entidad, idsArray[0]);
        } else {
            openAdminMultiVerInfo(entidad, idsArray);
        }
        return;
    }

    if (activeAlumnoTab !== 'proyectos') {
        showToast('Este módulo es de consulta académica. Solo puedes editar o gestionar tus registros en Mis Proyectos.');
        return;
    }

    if (accion === 'MODIFICAR') {
        if (idsArray.length > 1) {
            showToast('Se abrirá el editor para el primer proyecto seleccionado.');
        }
        openAlumnoProjectModal(idsArray[0]);
        return;
    }

    if (accion === 'DESACTIVAR' || accion === 'ACTIVAR') {
        const label = accion === 'DESACTIVAR' ? 'pasar a INACTIVO' : 'REACTIVAR';
        if (!confirm(`¿Confirmas ${label} ${idsArray.length} proyecto(s) seleccionado(s)?`)) return;
        try {
            await window.ProjectHubAuth.bulkAdminOperation('PROYECTO', idsArray, accion);
            clearAlumnoSelection();
            await refreshSystemDataFromSupabase(false);
            showToast(`Operación aplicada sobre ${idsArray.length} proyecto(s).`);
        } catch (err) {
            showToast(err.message || 'Error al cambiar estado del proyecto.');
        }
        return;
    }

    if (accion === 'ELIMINAR_DEFINITIVO') {
        if (!confirm(`⚠️ ELIMINACIÓN DEFINITIVA: Se borrarán de la base de datos los proyectos seleccionados que ya estén INACTIVOS. ¿Continuar?`)) return;
        try {
            const res = await window.ProjectHubAuth.bulkAdminOperation('PROYECTO', idsArray, 'ELIMINAR_DEFINITIVO');
            clearAlumnoSelection();
            await refreshSystemDataFromSupabase(false);
            if (res && res.omitidos_por_estar_activos > 0) {
                showToast(`Eliminados: ${res.afectados}. Omitidos por seguir ACTIVOS: ${res.omitidos_por_estar_activos} (desactívalos primero).`);
            } else {
                showToast(`Se eliminaron definitivamente ${res?.afectados || 0} proyecto(s) inactivo(s).`);
            }
        } catch (err) {
            showToast(err.message || 'Error al eliminar definitivamente.');
        }
    }
}

/* --------------------------------------------------------------------------
   MÓDULO ALUMNO 1: MIS PROYECTOS (GITHUB / SUPABASE / VERCEL / CÓDIGO LOCAL)
   -------------------------------------------------------------------------- */
function renderAlumnoProyectosTable() {
    const tbody = document.getElementById('alumnoProyectosTableBody');
    if (!tbody) return;

    const { misProyectos } = getAlumnoScopedData();
    const query = (document.getElementById('alumnoSearchProyectos')?.value || '').toLowerCase().trim();
    const filterEstado = document.getElementById('alumnoFilterEstadoProyectos')?.value || 'TODOS';

    const filtered = misProyectos.filter(p => {
        const isAct = p.activo !== false;
        if (filterEstado === 'ACTIVOS' && !isAct) return false;
        if (filterEstado === 'INACTIVOS' && isAct) return false;
        if (!query) return true;
        return (
            (p.titulo || '').toLowerCase().includes(query) ||
            (p.codigo_proyecto || '').toLowerCase().includes(query) ||
            (p.plataforma_despliegue || '').toLowerCase().includes(query) ||
            (p.motor_base_datos || '').toLowerCase().includes(query) ||
            (p.repositorio_url || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">No tienes proyectos cargados con ese criterio. Usa el botón <strong>"Subir / Registrar Proyecto"</strong> para compartir tu trabajo desde GitHub, Vercel, Supabase o entorno local.</td></tr>`;
        return;
    }

    const selectedSet = selectedAlumnoIds.proyectos;

    tbody.innerHTML = filtered.map(p => {
        const isAct = p.activo !== false;
        const isSelected = selectedSet.has(String(p.id));
        const cleanRepo = Security.sanitizeURL(p.repositorio_url || '');
        const cleanDemo = Security.sanitizeURL(p.demo_produccion_url || '');
        const isOnline = p.en_produccion_publica !== false && Boolean(cleanDemo);

        const deployHTML = isOnline
            ? `
                <span class="deploy-badge-online"><i class="fa-solid fa-globe"></i> En Red (${Security.escapeHTML(p.plataforma_despliegue || 'Vercel')})</span>
                <div style="margin-top:0.3rem;">
                    <button type="button" class="btn-action-sm" style="background:rgba(16,185,129,0.14); color:#10B981; border:1px solid rgba(16,185,129,0.35);" onclick="inspectExternalLink('${cleanDemo}')">
                        <i class="fa-solid fa-arrow-up-right-from-square"></i> Abrir Web en Vivo
                    </button>
                </div>
            `
            : `
                <span class="deploy-badge-local"><i class="fa-solid fa-laptop-code"></i> Local / Offline (${Security.escapeHTML(p.plataforma_despliegue || 'Código Local')})</span>
                <div style="font-size:0.73rem; color:var(--text-muted); margin-top:0.25rem;">
                    ${p.snippet_codigo_fuente ? '<i class="fa-solid fa-code" style="color:var(--gold-primary);"></i> Incluye Código Fuente en Sistema' : 'Ejecución en Laboratorio'}
                </div>
            `;

        const repoAndDbHTML = `
            <div style="display:flex; flex-direction:column; gap:0.28rem;">
                ${cleanRepo ? `
                    <button type="button" class="btn-action-sm" style="width:fit-content; background:rgba(255,255,255,0.06); color:var(--text-primary); border:1px solid var(--gold-border);" onclick="inspectExternalLink('${cleanRepo}')">
                        <i class="fa-brands fa-github"></i> Repositorio GitHub
                    </button>
                ` : `<span style="font-size:0.75rem; color:var(--text-muted);"><i class="fa-solid fa-folder-tree"></i> Código Interno / Sin URL Git</span>`}
                <span style="font-size:0.76rem; color:var(--gold-primary);">
                    <i class="fa-solid fa-database"></i> <strong>${Security.escapeHTML(p.motor_base_datos || 'Supabase PostgreSQL')}</strong>
                </span>
                ${p.database_proyecto_url ? `<small style="font-size:0.71rem; color:var(--text-muted); word-break:break-all;">${Security.escapeHTML(p.database_proyecto_url.substring(0, 42))}</small>` : ''}
            </div>
        `;

        const asigsHTML = (p.asignaturas_rel || []).map(a => `<span class="rel-pill"><i class="fa-solid fa-book"></i> ${Security.escapeHTML(a.nombre)}</span>`).join('');
        const docsHTML = (p.docentes_rel || []).map(d => `<span class="rel-pill"><i class="fa-solid fa-chalkboard-user"></i> Prof. ${Security.escapeHTML(d.nombre_completo)}</span>`).join('');

        return `
            <tr class="${isAct ? '' : 'row-inactivo'} ${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleAlumnoRowSelection('proyectos', '${p.id}', this.checked)">
                </td>
                <td>
                    <span class="badge-category" style="margin-bottom:0.25rem; display:inline-block;">${Security.escapeHTML(p.codigo_proyecto)} • ${Security.escapeHTML(p.categoria)}</span>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(p.titulo)}</strong>
                    <small style="color:var(--text-muted);">${Security.escapeHTML(p.modalidad_entrega || 'Entrega Integradora 5° Año')}</small>
                </td>
                <td>${deployHTML}</td>
                <td>${repoAndDbHTML}</td>
                <td>
                    <div class="rel-pill-list">${asigsHTML || '<span style="color:var(--text-muted);">Sin materia</span>'}</div>
                    <div class="rel-pill-list" style="margin-top:0.25rem;">${docsHTML || ''}</div>
                </td>
                <td>
                    <span class="badge-status ${getStatusBadgeClass(p.estado)}">${Security.escapeHTML(p.estado)}</span>
                    ${p.calificacion ? `<div style="margin-top:0.3rem;"><span class="grade-pill">${p.calificacion}/10</span></div>` : '<div style="font-size:0.74rem; color:var(--text-muted); margin-top:0.25rem;">En evaluación</div>'}
                </td>
                <td>${renderBooleanBadge(isAct)}</td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('PROYECTO', '${p.id}')" title="Ver Ficha Completa, Código y Despliegue">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAlumnoProjectModal('${p.id}')" title="Modificar Repositorio, Dominio Vercel, Supabase o Código">
                            <i class="fa-solid fa-pen-to-square"></i> Editar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('PROYECTO', '${p.id}', false, '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-power-off"></i> Desactivar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('PROYECTO', '${p.id}', true, '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
                            </button>
                            <button class="btn-action-sm btn-action-hard-delete" onclick="handleAdminHardDelete('PROYECTO', '${p.id}', '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-trash-can"></i> Eliminar Definitivo
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   MÓDULO ALUMNO 2: MIS CALIFICACIONES Y DEVOLUCIONES DOCENTES
   -------------------------------------------------------------------------- */
function renderAlumnoCalificacionesTable() {
    const tbody = document.getElementById('alumnoCalificacionesTableBody');
    if (!tbody) return;

    const { misProyectos } = getAlumnoScopedData();
    const query = (document.getElementById('alumnoSearchCalificaciones')?.value || '').toLowerCase().trim();
    const filterDictamen = document.getElementById('alumnoFilterEstadoCalificaciones')?.value || 'TODOS';

    const filtered = misProyectos.filter(p => {
        if (filterDictamen !== 'TODOS' && p.estado !== filterDictamen) return false;
        if (!query) return true;
        return (
            (p.titulo || '').toLowerCase().includes(query) ||
            (p.codigo_proyecto || '').toLowerCase().includes(query) ||
            (p.devolucion_docente || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron evaluaciones o devoluciones con ese filtro.</td></tr>`;
        return;
    }

    const selectedSet = selectedAlumnoIds.calificaciones;

    tbody.innerHTML = filtered.map(p => {
        const isSelected = selectedSet.has(String(p.id));
        const asigsHTML = (p.asignaturas_rel || []).map(a => `<span class="rel-pill"><i class="fa-solid fa-book"></i> ${Security.escapeHTML(a.nombre)}</span>`).join('');
        const docsHTML = (p.docentes_rel || []).map(d => `<span class="rel-pill"><i class="fa-solid fa-chalkboard-user"></i> Prof. ${Security.escapeHTML(d.nombre_completo)}</span>`).join('');

        return `
            <tr class="${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleAlumnoRowSelection('calificaciones', '${p.id}', this.checked)">
                </td>
                <td>
                    <span class="badge-category" style="margin-bottom:0.25rem; display:inline-block;">${Security.escapeHTML(p.codigo_proyecto)}</span>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(p.titulo)}</strong>
                    <small style="color:var(--text-muted);">Presentado: ${Security.escapeHTML(p.fecha_formateada || 'Ciclo 2026')}</small>
                </td>
                <td><div class="rel-pill-list">${asigsHTML || '<span style="color:var(--text-muted);">Prácticas Prof.</span>'}</div></td>
                <td><div class="rel-pill-list">${docsHTML || '<span style="color:var(--text-muted);">Comisión Evaluadora</span>'}</div></td>
                <td><span class="badge-status ${getStatusBadgeClass(p.estado)}">${Security.escapeHTML(p.estado)}</span></td>
                <td>
                    ${p.calificacion
                        ? `<span class="grade-pill" style="font-size:0.92rem; padding:0.35rem 0.75rem;">${p.calificacion} / 10</span>`
                        : `<span style="color:var(--text-muted); font-size:0.8rem;">En proceso de calificación</span>`
                    }
                </td>
                <td style="max-width:340px;">
                    <div style="background:rgba(245,158,11,0.07); border-left:3px solid var(--gold-primary); padding:0.55rem 0.75rem; border-radius:4px; font-size:0.81rem; color:var(--text-secondary);">
                        ${Security.escapeHTML(p.devolucion_docente || 'Aguardando devolución pedagógica del equipo docente evaluador.')}
                    </div>
                </td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('PROYECTO', '${p.id}')">
                            <i class="fa-solid fa-eye"></i> Ver Dictamen
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   MÓDULO ALUMNO 3: MIS ASIGNATURAS ASIGNADAS POR EL ADMINISTRADOR (SOLO VER)
   -------------------------------------------------------------------------- */
function renderAlumnoAsignaturasTable() {
    const tbody = document.getElementById('alumnoAsignaturasTableBody');
    if (!tbody) return;

    const { misAsignaturas, misProyectos } = getAlumnoScopedData();
    const query = (document.getElementById('alumnoSearchAsignaturas')?.value || '').toLowerCase().trim();

    const filtered = misAsignaturas.filter(a => {
        if (!query) return true;
        return (
            (a.nombre || '').toLowerCase().includes(query) ||
            (a.codigo || '').toLowerCase().includes(query) ||
            (a.campo_formativo || '').toLowerCase().includes(query)
        );
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">No tienes asignaturas asignadas con ese criterio.</td></tr>`;
        return;
    }

    const selectedSet = selectedAlumnoIds.asignaturas;
    const aluUserId = String(currentSession?.userId || '');

    tbody.innerHTML = filtered.map(a => {
        const isSelected = selectedSet.has(String(a.id));
        const miCursada = (a.alumnos_rel || []).find(al => String(al.usuario_id) === aluUserId);
        const condicion = miCursada?.condicion_cursada || 'Regular';
        const notaCursada = miCursada?.calificacion_cursada;

        const docsHTML = (a.docentes_rel || []).map(d => `
            <span class="rel-pill"><i class="fa-solid fa-chalkboard-user"></i> Prof. ${Security.escapeHTML(d.nombre_completo)} (${Security.escapeHTML(d.rol_catedra || 'Titular')})</span>
        `).join('');

        // Proyectos del propio alumno vinculados a esta asignatura
        const misProysEnMateria = misProyectos.filter(p => (p.asignaturas_rel || []).some(asg => String(asg.id) === String(a.id)));
        const proysHTML = misProysEnMateria.map(p => `
            <span class="rel-pill"><i class="fa-solid fa-diagram-project"></i> ${Security.escapeHTML(p.codigo_proyecto)}: ${Security.escapeHTML(p.titulo.substring(0, 24))}...</span>
        `).join('');

        return `
            <tr class="${isSelected ? 'row-selected' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox" class="table-select-checkbox" ${isSelected ? 'checked' : ''} onchange="toggleAlumnoRowSelection('asignaturas', '${a.id}', this.checked)">
                </td>
                <td><span class="badge-category">${Security.escapeHTML(a.codigo)}</span></td>
                <td>
                    <strong style="color:var(--text-primary); display:block;">${Security.escapeHTML(a.nombre)}</strong>
                    <small style="color:var(--gold-primary);">${Security.escapeHTML(a.campo_formativo)}</small>
                </td>
                <td>
                    <strong>${a.anio_cursado}° Año (Div: ${Security.escapeHTML(a.division)})</strong>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${a.carga_horaria_semanal} hs cátedra/sem</div>
                </td>
                <td>
                    <span class="badge-status status-aprobado">${Security.escapeHTML(condicion)}</span>
                    ${notaCursada ? `<div style="margin-top:0.25rem;"><span class="grade-pill">Nota Cursada: ${notaCursada}/10</span></div>` : ''}
                </td>
                <td><div class="rel-pill-list">${docsHTML || '<span style="color:var(--text-muted);">Sin docente asignado</span>'}</div></td>
                <td><div class="rel-pill-list">${proysHTML || '<span style="color:var(--text-muted);">Sin proyectos vinculados</span>'}</div></td>
                <td>
                    <div class="action-btns-group">
                        <button class="btn-action-sm btn-action-info" onclick="openAdminVerInfo('ASIGNATURA', '${a.id}')">
                            <i class="fa-solid fa-circle-info"></i> Ver Detalle
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* --------------------------------------------------------------------------
   EXPORTACIÓN .PDF PERSONALIZADA EXCLUSIVA PARA EL ALUMNO (PORTFOLIO Y BOLETÍN)
   -------------------------------------------------------------------------- */
function exportAlumnoReportPDF(scope = 'INTEGRAL_ALUMNO') {
    const cleanScope = String(scope || 'INTEGRAL_ALUMNO').trim().toUpperCase();
    const { misProyectos, misAsignaturas, miFichaAlumno, promedioGeneral } = getAlumnoScopedData();
    const nowStr = new Date().toLocaleString('es-AR');
    const alumnoName = currentSession ? `${currentSession.displayName}` : 'Alumno 5° Año C.E.N.';
    const matriculaStr = miFichaAlumno?.matricula_legajo || currentSession?.dni || 'ALU-2026';

    let sectionsHTML = '';

    if (cleanScope === 'INTEGRAL_ALUMNO' || cleanScope === 'PROYECTOS') {
        const rows = misProyectos.map((p, idx) => {
            const isOnline = p.en_produccion_publica !== false && Boolean(p.demo_produccion_url);
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${Security.escapeHTML(p.codigo_proyecto)}</strong><br>${Security.escapeHTML(p.titulo)}<br><small>${Security.escapeHTML(p.categoria)}</small></td>
                    <td><strong>${isOnline ? 'EN RED PÚBLICA' : 'LOCAL / OFFLINE'}</strong><br>Hosting: ${Security.escapeHTML(p.plataforma_despliegue || 'Vercel')}<br><small>${Security.escapeHTML(p.demo_produccion_url || 'Ejecución Local')}</small></td>
                    <td><strong>Motor BD:</strong> ${Security.escapeHTML(p.motor_base_datos || 'Supabase PostgreSQL')}<br><strong>GitHub:</strong> <small>${Security.escapeHTML(p.repositorio_url || 'Código en sistema')}</small></td>
                    <td>${Security.escapeHTML(p.descripcion_tecnica)}</td>
                    <td><strong>${Security.escapeHTML(p.estado)}</strong><br>${p.calificacion ? `Nota: <strong>${p.calificacion}/10</strong>` : 'En evaluación'}</td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>Módulo 1: Portfolio Técnico de Mis Proyectos Integradores (${misProyectos.length})</h3>
                <p class="section-argument">Detalle de proyectos desarrollados por el estudiante, incluyendo arquitectura de base de datos (Supabase/SQL), repositorio GitHub y estado de despliegue en red (Vercel) o ejecución local.</p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Código / Proyecto</th>
                            <th>Despliegue (Red / Local)</th>
                            <th>Base de Datos y Repositorio</th>
                            <th>Resumen Técnico</th>
                            <th>Estado y Nota</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="6">Sin proyectos registrados</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    if (cleanScope === 'INTEGRAL_ALUMNO' || cleanScope === 'CALIFICACIONES') {
        const rows = misProyectos.map((p, idx) => {
            const docs = (p.docentes_rel || []).map(d => `Prof. ${d.nombre_completo}`).join(', ') || 'Comisión Evaluadora C.E.N.';
            const asigs = (p.asignaturas_rel || []).map(a => a.nombre).join(', ') || 'Prácticas Profesionalizantes';
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${Security.escapeHTML(p.codigo_proyecto)}</strong> - ${Security.escapeHTML(p.titulo)}</td>
                    <td>${Security.escapeHTML(asigs)}</td>
                    <td>${Security.escapeHTML(docs)}</td>
                    <td><strong>${Security.escapeHTML(p.estado)}</strong></td>
                    <td><strong style="font-size:13px; color:#92400e;">${p.calificacion ? `${p.calificacion} / 10` : 'S/C'}</strong></td>
                    <td>${Security.escapeHTML(p.devolucion_docente || 'Sin devolución registrada aún.')}</td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>Módulo 2: Boletín de Calificaciones Sumativas y Devoluciones Docentes</h3>
                <p class="section-argument">Registro oficial de notas numéricas, dictámenes de aprobación y devoluciones pedagógicas emitidas por los docentes evaluadores de 5° Año.</p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Proyecto Evaluado</th>
                            <th>Asignaturas Articuladas</th>
                            <th>Docentes Evaluadores</th>
                            <th>Estado</th>
                            <th>Nota Sumativa</th>
                            <th>Devolución Pedagógica del Docente</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="7">Sin calificaciones registradas</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    if (cleanScope === 'INTEGRAL_ALUMNO' || cleanScope === 'ASIGNATURAS') {
        const rows = misAsignaturas.map((a, idx) => {
            const docs = (a.docentes_rel || []).map(d => `Prof. ${d.nombre_completo}`).join(', ') || 'Por asignar';
            return `
                <tr>
                    <td>${idx + 1}</td>
                    <td><strong>${Security.escapeHTML(a.codigo)}</strong></td>
                    <td><strong>${Security.escapeHTML(a.nombre)}</strong><br><small>${Security.escapeHTML(a.campo_formativo)}</small></td>
                    <td>${a.anio_cursado}° Año (Div: ${Security.escapeHTML(a.division)}) • ${a.carga_horaria_semanal} hs/sem</td>
                    <td>${Security.escapeHTML(docs)}</td>
                </tr>
            `;
        }).join('');

        sectionsHTML += `
            <div class="report-section">
                <h3>Módulo 3: Mis Asignaturas Asignadas por Administración (${misAsignaturas.length})</h3>
                <p class="section-argument">Espacios curriculares en los que el alumno se encuentra matriculado en el ciclo lectivo actual.</p>
                <table>
                    <thead>
                        <tr>
                            <th>#</th>
                            <th>Código</th>
                            <th>Asignatura y Campo Formativo</th>
                            <th>Curso y Carga Horaria</th>
                            <th>Docentes a Cargo</th>
                        </tr>
                    </thead>
                    <tbody>${rows || '<tr><td colspan="5">Sin asignaturas asignadas</td></tr>'}</tbody>
                </table>
            </div>
        `;
    }

    const reportHTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <title>Portfolio y Calificaciones Alumno ProjectHub C.E.N. - ${Security.escapeHTML(alumnoName)}</title>
    <style>
        @page { size: A4 landscape; margin: 12mm; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', Roboto, Arial, sans-serif; color: #1c1305; background: #fff; padding: 20px; line-height: 1.45; }
        .no-print-bar { background: #140f06; color: #fff8eb; padding: 12px 20px; border-radius: 10px; border: 2px solid #f59e0b; display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .btn-print { background: linear-gradient(135deg, #fbbf24, #d97706); color: #120d04; border: none; padding: 9px 18px; border-radius: 6px; font-weight: 800; cursor: pointer; }
        .header-banner { border: 2px solid #d97706; border-radius: 12px; padding: 18px 22px; background: linear-gradient(135deg, #1c1408 0%, #2b1f0c 100%); color: #fff8eb; display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .header-left h1 { font-size: 19px; color: #fbbf24; text-transform: uppercase; }
        .header-left h2 { font-size: 13px; color: #fde68a; margin-top: 3px; }
        .header-meta { text-align: right; font-size: 11px; color: #fde68a; border-left: 1px solid rgba(251,191,36,0.35); padding-left: 15px; }
        .kpi-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 18px; }
        .kpi-card { border: 1px solid #fcd34d; background: #fef3c7; border-radius: 8px; padding: 9px 12px; text-align: center; }
        .kpi-card strong { display: block; font-size: 17px; color: #92400e; }
        .kpi-card span { font-size: 10.5px; color: #5c4928; font-weight: 600; text-transform: uppercase; }
        .report-section { margin-bottom: 22px; page-break-inside: avoid; }
        .report-section h3 { font-size: 14px; color: #140f06; background: #fde68a; border-left: 5px solid #d97706; padding: 7px 12px; border-radius: 4px; margin-bottom: 6px; }
        .section-argument { font-size: 11.5px; color: #453214; margin-bottom: 8px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th { background: #1c1408; color: #fbbf24; text-align: left; padding: 7px 8px; border: 1px solid #453214; text-transform: uppercase; font-size: 10px; }
        td { padding: 6px 8px; border: 1px solid #e5d5b5; vertical-align: top; }
        @media print { .no-print-bar { display: none !important; } body { padding: 0; } }
    </style>
</head>
<body>
    <div class="no-print-bar">
        <div>
            <strong style="color:#fbbf24;">PORTFOLIO Y BOLETÍN DEL ALUMNO (.PDF) — PROJECTHUB C.E.N. NONOGASTA</strong>
            <div style="font-size:12px; color:#d6c5a3;">Selecciona "Guardar como PDF" en el cuadro de impresión.</div>
        </div>
        <button class="btn-print" onclick="window.print()">Guardar / Imprimir .PDF</button>
    </div>
    <div class="header-banner">
        <div class="header-left">
            <h1>PROJECTHUB • CENTRO EDUCATIVO NONOGASTA</h1>
            <h2>PORTFOLIO TÉCNICO Y CALIFICACIONES DEL ALUMNO: ${Security.escapeHTML(alumnoName)}</h2>
        </div>
        <div class="header-meta">
            <div><strong>Fecha:</strong> ${Security.escapeHTML(nowStr)}</div>
            <div><strong>Matrícula / DNI:</strong> ${Security.escapeHTML(matriculaStr)}</div>
            <div><strong>Rol Activo:</strong> ALUMNO (5° Año T.I.P.P.)</div>
        </div>
    </div>
    <div class="kpi-row">
        <div class="kpi-card"><strong>${misProyectos.length}</strong><span>Mis Proyectos Registrados</span></div>
        <div class="kpi-card"><strong>${Security.escapeHTML(promedioGeneral)}</strong><span>Promedio Sumativo</span></div>
        <div class="kpi-card"><strong>${misAsignaturas.length}</strong><span>Mis Asignaturas Asignadas</span></div>
    </div>
    ${sectionsHTML}
    <script>window.addEventListener('load', () => { setTimeout(() => { window.print(); }, 450); });</script>
</body>
</html>`;

    const printWin = window.open('', '_blank');
    if (!printWin) {
        showToast('Permite las ventanas emergentes para exportar tu Portfolio / Boletín en PDF.');
        return;
    }
    printWin.document.open();
    printWin.document.write(reportHTML);
    printWin.document.close();
}




