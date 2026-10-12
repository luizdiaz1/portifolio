import { supabase } from './supabase.js';
import { usuarioAtual } from './auth.js';

const esc = (v) => String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export function renderizarAlterarSenha(containerId) {
    const container = document.getElementById(containerId);
    const email = usuarioAtual?.email || '';

    container.innerHTML = `
        <div class="modulo-header">
            <div>
                <span class="eyebrow">MINHA CONTA</span>
                <h2>Alterar senha</h2>
                <p class="header-description">Troque a senha inicial por uma senha que somente você conheça.</p>
            </div>
        </div>

        <div class="content-panel user-form-panel" style="max-width: 720px;">
            <div class="panel-header">Nova senha</div>
            <form id="form-alterar-senha">
                <div class="form-group">
                    <label>Usuário</label>
                    <input type="text" value="${esc(email)}" disabled>
                </div>

                <div class="form-group">
                    <label for="senha_nova">Nova senha</label>
                    <input type="password" id="senha_nova" minlength="6" required autocomplete="new-password" placeholder="Mínimo de 6 caracteres">
                </div>

                <div class="form-group">
                    <label for="senha_confirmacao">Confirmar nova senha</label>
                    <input type="password" id="senha_confirmacao" minlength="6" required autocomplete="new-password" placeholder="Digite a senha novamente">
                </div>

                <div class="user-form-note">
                    <strong>Importante</strong>
                    <span>Depois de alterar, use a nova senha nos próximos acessos.</span>
                </div>

                <div class="form-actions">
                    <button type="submit" class="btn-primary" id="btn-alterar-senha">Salvar nova senha</button>
                </div>
            </form>
        </div>`;

    document.getElementById('form-alterar-senha').addEventListener('submit', async (e) => {
        e.preventDefault();

        const novaSenha = document.getElementById('senha_nova').value;
        const confirmacao = document.getElementById('senha_confirmacao').value;
        const btn = document.getElementById('btn-alterar-senha');

        if (novaSenha.length < 6) {
            window.mostrarToast('A senha precisa ter pelo menos 6 caracteres.', 'warning');
            return;
        }

        if (novaSenha !== confirmacao) {
            window.mostrarToast('As senhas não coincidem.', 'warning');
            return;
        }

        btn.disabled = true;
        btn.textContent = 'Salvando...';

        try {
            const { error } = await supabase.auth.updateUser({ password: novaSenha });
            if (error) throw error;

            // Registra a troca de senha no histórico de auditoria.
            const { error: auditError } = await supabase.from('auditoria').insert([{
                usuario_id: usuarioAtual?.id,
                usuario_email: usuarioAtual?.email,
                operacao: 'ALTERAR_SENHA',
                tabela: 'profiles',
                registro_id: usuarioAtual?.id,
                descricao: 'Usuário alterou a própria senha.'
            }]);
            if (auditError) console.warn('Não foi possível registrar a auditoria da senha:', auditError);

            document.getElementById('senha_nova').value = '';
            document.getElementById('senha_confirmacao').value = '';
            window.mostrarToast('Senha alterada com sucesso.', 'success');
        } catch (error) {
            console.error('Erro ao alterar senha:', error);
            window.mostrarToast(error.message || 'Não foi possível alterar a senha.', 'error');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Salvar nova senha';
        }
    });
}
