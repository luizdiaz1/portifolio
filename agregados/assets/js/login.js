import { supabase } from './supabase.js';

export function renderizarLogin() {
    const container = document.getElementById('login-container');
    if (!container) return;

    container.innerHTML = `
        <div class="login-page">
            <div class="login-card">
                <div class="login-header">
                    <div class="login-label">ACESSO RESTRITO</div>
                    <h1>SISTEMA DE AGREGADOS</h1>
                    <p>Entre com seu usuário e senha.</p>
                    <p class="text-muted" style="font-size:12px;margin-top:6px;">Demonstração: use qualquer e-mail e senha.</p>
                </div>

                <form id="form-login">
                    <div class="form-group">
                        <label for="login-email">E-mail</label>
                        <input type="email" id="login-email" autocomplete="username" required>
                    </div>

                    <div class="form-group">
                        <label for="login-password">Senha</label>
                        <input type="password" id="login-password" autocomplete="current-password" required>
                    </div>

                    <div id="login-erro" class="login-error" role="alert"></div>

                    <button type="submit" class="btn-primary login-button">Entrar</button>
                </form>
            </div>
        </div>
    `;

    document.getElementById('form-login').addEventListener('submit', async (event) => {
        event.preventDefault();

        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value;
        const erro = document.getElementById('login-erro');
        const botao = event.currentTarget.querySelector('button');

        erro.textContent = '';
        botao.disabled = true;
        botao.textContent = 'Entrando...';

        const { error } = await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            erro.textContent = 'E-mail ou senha inválidos.';
            botao.disabled = false;
            botao.textContent = 'Entrar';
            return;
        }

        window.location.reload();
    });
}
