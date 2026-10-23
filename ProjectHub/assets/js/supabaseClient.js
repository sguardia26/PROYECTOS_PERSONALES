/* ==========================================================================
   PROJECTHUB - Cliente Oficial Supabase & Servicio Seguro de Identidad/Roles
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
 * Servicio relacional de Autenticación, Autorización Multirrol y Auditoría
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
     * 3. Obtiene la ficha relacional completa del usuario autenticado:
     *    - Entidad `public.usuarios`
     *    - Lista de todos sus roles en `public.usuarios_roles` + `public.roles`
     *    - Fichas específicas: `public.administradores`, `public.docentes`, `public.alumnos`
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
        // Paso A: Resolver identificador (Email, Username o DNI) y revisar estado de bloqueo en BD
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

        // Paso B: Autenticar con el motor criptográfico oficial de Supabase Auth (bcrypt + JWT)
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

        // Paso C: Registrar acceso exitoso y recuperar todas las entidades relacionales del usuario
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
    }
};

// Exponer de forma controlada para la interfaz App-Shell
window.supabaseClient = supabase;
window.ProjectHubAuth = ProjectHubAuthService;
console.info('✔ [C.E.N. Shield] Supabase conectado y esquema relacional listo.');
