/* ==========================================================================
   PROJECTHUB - Cliente Oficial Supabase & Servicio Seguro de Identidad,
   Roles y Supervisión Integral de Administrador
   Centro Educativo Nonogasta (C.E.N.) - 5° Año T.I.P.P.
   ========================================================================== */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://obtnmzjsbyeqttyzxasq.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_kTIPBfDO-bL8tG-Tz5I4eA_T7XfUTR8';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'projecthub_cen_supabase_auth_v1'
    }
});

/**
 * Servicio relacional de Autenticación, Autorización Multirrol, Auditoría
 * y Supervisión Integral de Entidades (3FN + Baja Lógica Booleana)
 */
const ProjectHubAuthService = {
    client: supabase,

    /**
     * 1. Resuelve si el usuario ingresó Correo Institucional, Nombre de Usuario o DNI
     *    y verifica en la BD si la cuenta está activa o bloqueada por fuerza bruta.
     */
    async resolveLoginIdentifier(identifier) {
        const cleanId = String(identifier || '').trim();
        const { data, error } = await supabase.rpc('resolver_identificador_login', {
            p_identificador: cleanId
        });

        if (error) {
            console.error('[Seguridad C.E.N.] Error al verificar identificador:', error.message);
            throw new Error('Error de comunicación segura con la base de datos.');
        }

        return data;
    },

    /**
     * 2. Registra en la tabla inmutable `public.auditoria_accesos` el intento de login
     *    y actualiza el contador de fuerza bruta en `public.usuarios`.
     */
    async recordLoginAttempt(identifier, isSuccess, detail = '') {
        try {
            const { data } = await supabase.rpc('registrar_intento_login', {
                p_identificador: String(identifier || '').trim(),
                p_exitoso: Boolean(isSuccess),
                p_detalle: detail,
                p_user_agent: navigator.userAgent || 'Browser'
            });
            return data;
        } catch (err) {
            console.warn('[Auditoría C.E.N.] No se pudo registrar evento:', err);
            return null;
        }
    },

    /**
     * 3. Obtiene la ficha relacional completa del usuario autenticado
     */
    async fetchCurrentUserProfile() {
        const { data, error } = await supabase.rpc('obtener_perfil_completo_actual');
        if (error) {
            console.error('[Seguridad C.E.N.] Error al obtener perfil relacional:', error.message);
            throw error;
        }
        return data;
    },

    /**
     * 4. Flujo completo de Login Unificado con Correo, Usuario o DNI + Contraseña
     */
    async signInUnified(identifier, password) {
        const resolution = await this.resolveLoginIdentifier(identifier);

        if (!resolution || !resolution.encontrado) {
            await this.recordLoginAttempt(identifier, false, 'Usuario, correo o DNI no registrado');
            return {
                ok: false,
                code: 'INVALID_CREDENTIALS',
                message: 'Credenciales inválidas. Verifica tu usuario, correo o DNI y tu contraseña.'
            };
        }

        if (resolution.bloqueado) {
            return {
                ok: false,
                code: 'ACCOUNT_LOCKED',
                remainingSeconds: resolution.segundos_restantes || 60,
                message: resolution.mensaje || 'Cuenta bloqueada temporalmente por seguridad.'
            };
        }

        const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
            email: resolution.email,
            password: password
        });

        if (authError || !authData?.user) {
            const attemptResult = await this.recordLoginAttempt(
                identifier,
                false,
                'Contraseña incorrecta en Supabase Auth'
            );

            return {
                ok: false,
                code: attemptResult?.bloqueado ? 'ACCOUNT_LOCKED' : 'INVALID_CREDENTIALS',
                attempts: attemptResult?.intentos_fallidos || 1,
                remainingSeconds: 60,
                message: 'Credenciales inválidas. Verifica tu usuario, correo o DNI y tu contraseña.'
            };
        }

        await this.recordLoginAttempt(
            identifier,
            true,
            'Inicio de sesión exitoso en PROJECTHUB'
        );

        const fullProfile = await this.fetchCurrentUserProfile();

        return {
            ok: true,
            session: authData.session,
            profile: fullProfile
        };
    },

    /**
     * 5. Cerrar sesión de forma segura en Supabase Auth
     */
    async signOut() {
        await supabase.auth.signOut();
    },

    /* ======================================================================
       MÉTODOS DE SUPERVISIÓN Y GESTIÓN RELACIONAL (ADMINISTRADOR / SISTEMA)
       ====================================================================== */

    /**
     * 6. Obtiene en una sola consulta relacional todas las entidades y vínculos:
     *    usuarios, docentes, alumnos, proyectos y asignaturas.
     */
    async fetchSystemSupervisionData() {
        const { data, error } = await supabase.rpc('obtener_datos_supervision_sistema');
        if (error) {
            console.error('[Supabase Supervision] Error al cargar datos del sistema:', error.message);
            throw error;
        }
        return data;
    },

    /**
     * 7. Baja / Alta Lógica (Booleano `activo`) sin borrar información física
     */
    async toggleEntityBooleanState(entidad, id, nuevoEstadoActivo) {
        const { data, error } = await supabase.rpc('admin_cambiar_estado_booleano', {
            p_entidad: entidad,
            p_id: id,
            p_activo: Boolean(nuevoEstadoActivo)
        });
        if (error) {
            console.error('[Supabase Admin] Error al cambiar estado booleano:', error.message);
            throw error;
        }
        return data;
    },

    /**
     * 8. Crear o Modificar Usuario + Roles + Ficha (Admin/Docente/Alumno) + Relaciones N:M
     */
    async saveUserIntegral(payload) {
        const { data, error } = await supabase.rpc('admin_guardar_usuario_integral', {
            p_datos: payload
        });
        if (error) {
            console.error('[Supabase Admin] Error al guardar usuario integral:', error.message);
            throw error;
        }
        return data;
    },

    /**
     * 9. Crear o Modificar Proyecto Relacional + Alumnos + Docentes + Asignaturas
     */
    async saveProjectRelational(payload) {
        const { data, error } = await supabase.rpc('guardar_proyecto_relacional', {
            p_datos: payload
        });
        if (error) {
            console.error('[Supabase Proyectos] Error al guardar proyecto relacional:', error.message);
            throw error;
        }
        return data;
    },

    /**
     * 10. Crear o Modificar Asignatura Relacional + Docentes + Alumnos + Proyectos
     */
    async saveAsignaturaRelational(payload) {
        const { data, error } = await supabase.rpc('admin_guardar_asignatura_relacional', {
            p_datos: payload
        });
        if (error) {
            console.error('[Supabase Asignaturas] Error al guardar asignatura relacional:', error.message);
            throw error;
        }
        return data;
    }
};

window.supabaseClient = supabase;
window.ProjectHubAuth = ProjectHubAuthService;
window.dispatchEvent(new CustomEvent('supabase-ready'));
console.info('✔ [C.E.N. Shield] Supabase conectado: Autenticación y Supervisión Relacional activas.');
