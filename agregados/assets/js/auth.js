import { supabase } from './supabase.js';

export let usuarioAtual = null;

export async function carregarUsuario() {
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) throw error;
    if (!session) return null;

    const { data: perfil, error: perfilError } = await supabase
        .from('profiles')
        .select('id, nome, role')
        .eq('id', session.user.id)
        .maybeSingle();

    if (perfilError) throw perfilError;

    usuarioAtual = {
        id: session.user.id,
        email: session.user.email,
        nome: perfil?.nome || session.user.email,
        role: perfil?.role || 'visualizador'
    };

    return usuarioAtual;
}

export function ehAdmin() {
    return usuarioAtual?.role === 'gestor';
}

export function ehGestor() {
    return usuarioAtual?.role === 'gestor';
}

export function ehVisualizador() {
    return usuarioAtual?.role === 'visualizador';
}

export async function fazerLogout() {
    await supabase.auth.signOut();
    window.location.reload();
}
