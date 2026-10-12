import { renderizarServicos, renderizarDetalheServico } from './servicos.module.js';
import { renderizarListagem } from './listagem.module.js';
import { renderizarPerfilAgregado, renderizarListaAgregados, renderizarCadastroAgregado } from './agregados.module.js';
import { renderizarDashboard } from './dashboard.module.js';
import { renderizarRelatorios } from './relatorios.module.js';
import { renderizarCiots, renderizarCadastroCiot } from './ciot.module.js';
import { renderizarOcorrencias } from './ocorrencias.module.js';
import { renderizarAlterarSenha } from './senha.module.js';
import { renderizarAuditoria } from './auditoria.module.js';
import { renderizarCalculadoraSalario } from './calculadora-salario.module.js';
import { carregarUsuario, ehGestor, fazerLogout, usuarioAtual } from './auth.js';
import { renderizarLogin } from './login.js';

const APP_CONTAINER = 'app-container';

window.mostrarToast = function(mensagem, tipo = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    const icones = { success: '✓', error: '✕', warning: '⚠' };
    toast.innerHTML = `<span class="toast-icon">${icones[tipo] || '•'}</span> <span>${mensagem}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

function aplicarPermissoes() {
    document.querySelectorAll('.acao-gestor').forEach(el => {
        el.style.display = ehGestor() ? '' : 'none';
    });

    document.querySelectorAll('[data-role="gestor"]').forEach(el => {
        el.style.display = ehGestor() ? '' : 'none';
    });

    const usuarioLogado = document.getElementById('usuario-logado');
    if (usuarioLogado && usuarioAtual) {
        const nome = usuarioAtual.nome || usuarioAtual.email;
        const tipo = usuarioAtual.role === 'gestor' ? 'Gestor' : 'Visualizador';
        usuarioLogado.innerHTML = `<strong>${nome}</strong><span>${tipo}</span>`;
    }
}

window.aplicarPermissoes = aplicarPermissoes;

window.navegarPara = function(modulo, param = null) {
    if (!ehGestor() && ['servicos', 'cadastrar_agregado', 'editar_agregado', 'cadastrar_ciot', 'editar_ciot'].includes(modulo)) {
        window.mostrarToast('Seu usuário possui apenas permissão de visualização.', 'warning');
        return;
    }

    const container = document.getElementById(APP_CONTAINER);
    container.innerHTML = '<div style="padding: 24px; color: var(--text-muted);">Carregando dados...</div>';

    document.querySelectorAll('.menu a').forEach(l => l.classList.remove('active'));
    const menuRef = modulo === 'editar_agregado' ? 'cadastrar_agregado' : modulo;
    const linkAtivo = document.querySelector(`.menu a[data-module="${menuRef}"]`);
    if (linkAtivo) linkAtivo.classList.add('active');

    switch (modulo) {
        case 'dashboard': renderizarDashboard(APP_CONTAINER); break;
        case 'servicos': renderizarServicos(APP_CONTAINER); break;
        case 'listagem': renderizarListagem(APP_CONTAINER); break;
        case 'detalhe_servico': renderizarDetalheServico(APP_CONTAINER, param); break;
        case 'cadastrar_agregado': renderizarCadastroAgregado(APP_CONTAINER); break;
        case 'editar_agregado': renderizarCadastroAgregado(APP_CONTAINER, param); break;
        case 'agregados_lista': renderizarListaAgregados(APP_CONTAINER); break;
        case 'perfil_agregado': renderizarPerfilAgregado(APP_CONTAINER, param); break;
        case 'relatorios': renderizarRelatorios(APP_CONTAINER); break;
        case 'ciots': renderizarCiots(APP_CONTAINER); break;
        case 'ocorrencias': renderizarOcorrencias(APP_CONTAINER); break;
        case 'alterar_senha': renderizarAlterarSenha(APP_CONTAINER); break;
        case 'auditoria': renderizarAuditoria(APP_CONTAINER); break;
        case 'calculadora_salario': renderizarCalculadoraSalario(APP_CONTAINER); break;
        case 'cadastrar_ciot': renderizarCadastroCiot(APP_CONTAINER); break;
        case 'editar_ciot': renderizarCadastroCiot(APP_CONTAINER, param); break;
        default: container.innerHTML = `<div class="content-panel">Módulo não encontrado</div>`;
    }

    aplicarPermissoes();
};

async function iniciarAplicacao() {
    try {
        const usuario = await carregarUsuario();

        if (!usuario) {
            document.getElementById('app-container-wrapper').style.display = 'none';
            renderizarLogin();
            return;
        }

        document.getElementById('login-container').style.display = 'none';
        document.getElementById('app-container-wrapper').style.display = 'block';

        const themeBtn = document.getElementById('btn-theme-toggle');
        const savedTheme = localStorage.getItem('app-theme') || 'light';
        document.documentElement.setAttribute('data-theme', savedTheme);
        atualizarBotaoTema(themeBtn, savedTheme);

        if (themeBtn) {
            themeBtn.addEventListener('click', () => {
                const currentTheme = document.documentElement.getAttribute('data-theme');
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                document.documentElement.setAttribute('data-theme', newTheme);
                localStorage.setItem('app-theme', newTheme);
                atualizarBotaoTema(themeBtn, newTheme);
            });
        }

        document.getElementById('btn-logout')?.addEventListener('click', fazerLogout);

        document.getElementById('main-menu').addEventListener('click', (e) => {
            const link = e.target.closest('a[data-module]');
            if (!link) return;
            e.preventDefault();
            window.navegarPara(link.getAttribute('data-module'));
        });

        aplicarPermissoes();
        window.navegarPara('dashboard');
    } catch (error) {
        console.error('Erro ao iniciar aplicação:', error);
        document.getElementById('app-container-wrapper').style.display = 'none';
        const login = document.getElementById('login-container');
        login.innerHTML = `<div class="login-page"><div class="login-card"><h2>Erro ao carregar o acesso</h2><p class="login-error">${error.message}</p><p class="text-muted">Verifique se a tabela profiles foi criada no Supabase.</p></div></div>`;
    }
}

function atualizarBotaoTema(themeBtn, theme) {
    if (!themeBtn) return;
    themeBtn.innerText = theme === 'dark' ? '☀️ Modo Claro' : '🌙 Modo Escuro';
}

document.addEventListener('DOMContentLoaded', iniciarAplicacao);
