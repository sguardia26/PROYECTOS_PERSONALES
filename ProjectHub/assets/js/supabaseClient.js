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

const ProjectHubAuthService = {
    client: supabase,

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

    async fetchCurrentUserProfile() {
        const { data, error } = await supabase.rpc('obtener_perfil_completo_actual');
        if (error) {
            console.error('[Seguridad C.E.N.] Error al obtener perfil relacional:', error.message);
            throw error;
        }
        return data;
    },

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

    async signOut() {
        await supabase.auth.signOut();
    },

    async fetchSystemSupervisionData() {
        const { data, error } = await supabase.rpc('obtener_datos_supervision_sistema');
        if (error) {
            console.error('[Supabase Supervision] Error al cargar datos del sistema:', error.message);
            throw error;
        }
        return data;
    },

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

    async saveAsignaturaRelational(payload) {
        const { data, error } = await supabase.rpc('admin_guardar_asignatura_relacional', {
            p_datos: payload
        });
        if (error) {
            console.error('[Supabase Asignaturas] Error al guardar asignatura relacional:', error.message);
            throw error;
        }
        return data;
    },

    async hardDeleteInactiveEntity(entidad, id) {
        const { data, error } = await supabase.rpc('admin_eliminar_definitivo', {
            p_entidad: entidad,
            p_id: id
        });
        if (error) {
            console.error('[Supabase Hard Delete] Error al eliminar definitivamente:', error.message);
            throw error;
        }
        return data;
    },

    async executeBatchOperation(entidad, idsArray, accion) {
        const { data, error } = await supabase.rpc('admin_operacion_lote', {
            p_entidad: entidad,
            p_ids: idsArray,
            p_accion: accion
        });
        if (error) {
            console.error('[Supabase Batch Operation] Error en lote:', error.message);
            throw error;
        }
        return data;
    },

    async importBatchEntities(entidad, registrosArray) {
        const { data, error } = await supabase.rpc('admin_importar_lote_entidad', {
            p_entidad: entidad,
            p_registros: registrosArray
        });
        if (error) {
            console.error('[Supabase Batch Import] Error en importación masiva:', error.message);
            throw error;
        }
        return data;
    },

    async gradeProjectAndStudentsDocente(payload) {
        const { data, error } = await supabase.rpc('docente_calificar_proyecto_e_individual', {
            p_datos: payload
        });
        if (error) {
            console.error('[Supabase Docente Grading] Error al calificar proyecto y alumnos:', error.message);
            throw error;
        }
        return data;
    },

    async saveSecurityEventAdmin(payload) {
        const { data, error } = await supabase.rpc('admin_guardar_evento_seguridad', {
            p_datos: payload
        });
        if (error) {
            console.error('[Supabase Security SOC] Error al guardar evento de ciberseguridad:', error.message);
            throw error;
        }
        return data;
    },

    async bulkAdminOperation(entidad, idsArray, accion) {
        return await this.executeBatchOperation(entidad, idsArray, accion);
    }
};

window.supabaseClient = supabase;
window.ProjectHubAuth = ProjectHubAuthService;
window.dispatchEvent(new CustomEvent('supabase-ready'));
console.info('✔ [C.E.N. Shield] Supabase conectado: Autenticación y Supervisión Relacional activas.');
