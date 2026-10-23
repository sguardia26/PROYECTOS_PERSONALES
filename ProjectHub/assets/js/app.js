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

    if (sectionName === 'administracion') {
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

    const sidebarAdminBtn = document.getElementById('sidebarAdminBtn');
    if (sidebarAdminBtn) {
        const isAdmin = currentSession.role === 'ADMINISTRADOR' ||
                        (Array.isArray(currentSession.roles) && currentSession.roles.some(r => r.codigo === 'ADMINISTRADOR'));
        sidebarAdminBtn.style.opacity = isAdmin ? '1' : '0.65';
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

/* ==========================================================================
   MÓDULO DE SUPERVISIÓN INTEGRAL DEL ADMINISTRADOR (5 SUB-MÓDULOS + CRUD BOOLEANO)
   1) Usuarios | 2) Docentes | 3) Alumnos | 4) Proyectos | 5) Asignaturas
   ========================================================================== */

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
}

function renderBooleanBadge(isActive) {
    if (isActive !== false) {
        return `<span class="bool-badge-true"><i class="fa-solid fa-circle-check"></i> ACTIVO (true)</span>`;
    }
    return `<span class="bool-badge-false"><i class="fa-solid fa-ban"></i> BAJA LÓGICA (false)</span>`;
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
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron usuarios con ese filtro.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(u => {
        const isAct = u.activo !== false;
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
            <tr class="${isAct ? '' : 'row-inactivo'}">
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
                            <i class="fa-solid fa-circle-info"></i> VerInfo
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminUserModal('${u.id}')" title="Modificar Usuario y Roles">
                            <i class="fa-solid fa-pen-to-square"></i> Modificar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('USUARIO', '${u.id}', false, '${Security.escapeHTML(u.nombre_completo)}')" title="Eliminar (Baja Lógica: activo = false)">
                                <i class="fa-solid fa-power-off"></i> Eliminar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('USUARIO', '${u.id}', true, '${Security.escapeHTML(u.nombre_completo)}')" title="Reactivar (Alta Lógica: activo = true)">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
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
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron docentes registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(d => {
        const isAct = d.activo !== false;
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
            <tr class="${isAct ? '' : 'row-inactivo'}">
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
                            <i class="fa-solid fa-circle-info"></i> VerInfo
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminUserModal('${d.usuario_id}', 'DOCENTE')">
                            <i class="fa-solid fa-pen-to-square"></i> Modificar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('DOCENTE', '${d.usuario_id}', false, '${Security.escapeHTML(d.nombre_completo)}')">
                                <i class="fa-solid fa-power-off"></i> Eliminar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('DOCENTE', '${d.usuario_id}', true, '${Security.escapeHTML(d.nombre_completo)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
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
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron alumnos registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(al => {
        const isAct = al.activo !== false;
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
            <tr class="${isAct ? '' : 'row-inactivo'}">
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
                            <i class="fa-solid fa-circle-info"></i> VerInfo
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminUserModal('${al.usuario_id}', 'ALUMNO')">
                            <i class="fa-solid fa-pen-to-square"></i> Modificar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('ALUMNO', '${al.usuario_id}', false, '${Security.escapeHTML(al.nombre_completo)}')">
                                <i class="fa-solid fa-power-off"></i> Eliminar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('ALUMNO', '${al.usuario_id}', true, '${Security.escapeHTML(al.nombre_completo)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron proyectos registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(p => {
        const isAct = p.activo !== false;
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
            <tr class="${isAct ? '' : 'row-inactivo'}">
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
                            <i class="fa-solid fa-circle-info"></i> VerInfo
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminProjectModal('${p.id}')">
                            <i class="fa-solid fa-pen-to-square"></i> Modificar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('PROYECTO', '${p.id}', false, '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-power-off"></i> Eliminar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('PROYECTO', '${p.id}', true, '${Security.escapeHTML(p.titulo)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
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
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">No se encontraron asignaturas registradas.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(a => {
        const isAct = a.activo !== false;
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
            <tr class="${isAct ? '' : 'row-inactivo'}">
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
                            <i class="fa-solid fa-circle-info"></i> VerInfo
                        </button>
                        <button class="btn-action-sm btn-action-edit" onclick="openAdminAsignaturaModal('${a.id}')">
                            <i class="fa-solid fa-pen-to-square"></i> Modificar
                        </button>
                        ${isAct ? `
                            <button class="btn-action-sm btn-action-delete" onclick="handleAdminToggleBoolean('ASIGNATURA', '${a.id}', false, '${Security.escapeHTML(a.nombre)}')">
                                <i class="fa-solid fa-power-off"></i> Eliminar
                            </button>
                        ` : `
                            <button class="btn-action-sm btn-action-restore" onclick="handleAdminToggleBoolean('ASIGNATURA', '${a.id}', true, '${Security.escapeHTML(a.nombre)}')">
                                <i class="fa-solid fa-rotate-left"></i> Reactivar
                            </button>
                        `}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

/* ==========================================================================
   ACCIÓN BOOLEANA: ELIMINAR (BAJA LÓGICA activo=false) / REACTIVAR (activo=true)
   ========================================================================== */
async function handleAdminToggleBoolean(entidad, id, nuevoEstado, nombreEtiqueta) {
    if (!window.ProjectHubAuth) return;

    try {
        await window.ProjectHubAuth.toggleEntityBooleanState(entidad, id, nuevoEstado);
        await refreshSystemDataFromSupabase(false);
        const accionTexto = nuevoEstado
            ? `Reactivado (activo = true): ${nombreEtiqueta}`
            : `Baja lógica aplicada (activo = false, sin borrar datos): ${nombreEtiqueta}`;
        showToast(accionTexto);
    } catch (err) {
        showToast(err.message || 'No se pudo cambiar el estado booleano en la base de datos.');
    }
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

        html = `
            <div class="login-header" style="text-align:left; border-bottom:1px solid var(--gold-border); padding-bottom:0.9rem; margin-bottom:1.1rem;">
                <span class="badge-category">${Security.escapeHTML(p.codigo_proyecto)} • ${Security.escapeHTML(p.categoria)}</span>
                <h3 style="color:var(--gold-primary); font-size:1.3rem; margin-top:0.3rem;">${Security.escapeHTML(p.titulo)}</h3>
                <p style="color:var(--text-secondary);">Dictamen: <strong>${Security.escapeHTML(p.estado)}</strong> ${p.calificacion ? `• Calificación: <strong>${p.calificacion}/10</strong>` : ''} • ${renderBooleanBadge(p.activo)}</p>
            </div>
            <div style="display:grid; gap:0.9rem; font-size:0.86rem;">
                <div style="background:var(--bg-surface); padding:1rem; border-radius:var(--radius-sm); border:1px solid var(--gold-border);">
                    <strong style="color:var(--gold-primary);">Desarrollo Técnico (Prácticas Profesionalizantes):</strong>
                    <p style="color:var(--text-secondary); margin-top:0.25rem;">${Security.escapeHTML(p.descripcion_tecnica)}</p>
                    <strong style="color:var(--gold-primary); display:block; margin-top:0.65rem;">Articulación Organizacional (Tecnología de Gestión):</strong>
                    <p style="color:var(--text-secondary); margin-top:0.25rem;">${Security.escapeHTML(p.articulacion_gestion)}</p>
                </div>
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

    toggleAdminUserRoleSections();
    openModal('adminUserFormModal');
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
   MODAL DE ALTA Y MODIFICACIÓN RELACIONAL DE PROYECTOS (ADMIN)
   ========================================================================== */
function openAdminProjectModal(projectId = null) {
    const form = document.getElementById('adminProjectRelationalForm');
    if (form) form.reset();

    document.getElementById('admProjId').value = projectId || '';
    const pObj = projectId ? systemDB.proyectos.find(p => String(p.id) === String(projectId)) : null;

    if (pObj) {
        document.getElementById('admProjCodigo').value = pObj.codigo_proyecto || '';
        document.getElementById('admProjCategoria').value = pObj.categoria || 'Sistema Web';
        document.getElementById('admProjTitulo').value = pObj.titulo || '';
        document.getElementById('admProjDivision').value = pObj.division || '5° Año A - T.I.P.P.';
        document.getElementById('admProjTecnologias').value = Array.isArray(pObj.tecnologias) ? pObj.tecnologias.join(', ') : '';
        document.getElementById('admProjDescripcion').value = pObj.descripcion_tecnica || '';
        document.getElementById('admProjGestion').value = pObj.articulacion_gestion || '';
        document.getElementById('admProjEstado').value = pObj.estado || 'En Revisión';
        document.getElementById('admProjCalificacion').value = pObj.calificacion || '';
        document.getElementById('admProjRepo').value = pObj.repositorio_url || '';
        document.getElementById('admProjActivo').value = pObj.activo !== false ? 'true' : 'false';
        document.getElementById('admProjDevolucion').value = pObj.devolucion_docente || '';
    } else {
        document.getElementById('admProjCodigo').value = `PRJ-2026-${100 + systemDB.proyectos.length + 1}`;
        document.getElementById('admProjActivo').value = 'true';
    }

    const aluSet = new Set((pObj?.alumnos_rel || []).map(x => String(x.usuario_id)));
    const docSet = new Set((pObj?.docentes_rel || []).map(x => String(x.usuario_id)));
    const asigSet = new Set((pObj?.asignaturas_rel || []).map(x => String(x.id)));

    renderCheckboxGroup('admProjAlumnosCheckboxes', systemDB.alumnos, 'usuario_id', al => `${al.nombre_completo} (${al.anio_cursado}° ${al.division})`, aluSet);
    renderCheckboxGroup('admProjDocentesCheckboxes', systemDB.docentes, 'usuario_id', d => `Prof. ${d.nombre_completo} (${d.legajo_docente})`, docSet);
    renderCheckboxGroup('admProjAsignaturasCheckboxes', systemDB.asignaturas, 'id', a => `${a.codigo} - ${a.nombre}`, asigSet);

    openModal('adminProjectFormModal');
}

async function submitAdminProjectRelationalForm(event) {
    event.preventDefault();
    if (!window.ProjectHubAuth) return;

    const techsArr = document.getElementById('admProjTecnologias').value
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

    const payload = {
        id: document.getElementById('admProjId').value || null,
        codigo_proyecto: document.getElementById('admProjCodigo').value.trim(),
        categoria: document.getElementById('admProjCategoria').value,
        titulo: document.getElementById('admProjTitulo').value.trim(),
        division: document.getElementById('admProjDivision').value.trim(),
        tecnologias: techsArr,
        descripcion_tecnica: document.getElementById('admProjDescripcion').value.trim(),
        articulacion_gestion: document.getElementById('admProjGestion').value.trim(),
        estado: document.getElementById('admProjEstado').value,
        calificacion: document.getElementById('admProjCalificacion').value || null,
        repositorio_url: document.getElementById('admProjRepo').value.trim(),
        activo: document.getElementById('admProjActivo').value === 'true',
        devolucion_docente: document.getElementById('admProjDevolucion').value.trim(),
        alumnos_ids: getCheckedValuesFromContainer('admProjAlumnosCheckboxes'),
        docentes_ids: getCheckedValuesFromContainer('admProjDocentesCheckboxes'),
        asignaturas_ids: getCheckedValuesFromContainer('admProjAsignaturasCheckboxes')
    };

    try {
        await window.ProjectHubAuth.saveProjectRelational(payload);
        await refreshSystemDataFromSupabase(false);
        closeModal('adminProjectFormModal');
        showToast('Proyecto integrador y sus vínculos guardados en Supabase.');
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

