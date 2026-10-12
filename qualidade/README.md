# Qualidade 10S — demo

Sistema de vistorias e auditorias do programa 10S da área de qualidade.

## Contexto
A área de qualidade faz vistorias periódicas e auditorias 10S nos setores da empresa.

## Problema
O relatório de vistoria era um documento estático: fotos, não conformidades, prazos e verificação de eficácia não ficavam ligados entre si nem eram acompanhados de forma centralizada.

## Solução
Fluxo digital completo: **vistoria → não conformidades → evidências fotográficas (pelo celular) → ações corretivas → verificação de eficácia → relatório gerado automaticamente**.
- Auditorias 10S com checklist dos 10 sensos, plano de ação e cálculo da nota do prefeito, baseados nas planilhas oficiais;
- Central de alertas (prazos vencidos, NC crítica, eficácia pendente);
- Relatórios A4 para imprimir ou salvar em PDF/Word;
- Perfis Administrador/Visitante e log de atividades.

## Impacto
- Registros padronizados e evidências ligadas a cada não conformidade.
- Acompanhamento de prazos e da eficácia das correções.
- Relatório pronto direto do sistema, sem montagem manual.

## Tecnologias
HTML, CSS e JavaScript · Supabase (PostgreSQL, Storage, Realtime, Auth) · jsPDF, docx

## Sobre esta demonstração

- Empresa, pessoas, placas e valores são **fictícios** ("Distribuidora Exemplo").
- O banco de dados (Supabase) foi substituído por um **banco simulado no navegador** (`demo/supabase-mock.js`): dá para cadastrar, editar e excluir à vontade; as alterações ficam salvas só no seu navegador.
- O botão **Restaurar dados**, no selo "DEMO" da tela, volta tudo ao estado inicial.
- O login aceita **qualquer usuário e senha**.
- Fotos, vídeos e PDFs da demo são ilustrações geradas para a apresentação.

## Como executar

É um site estático, sem build. Basta servir a pasta:

```bash
python3 -m http.server 8080
# abra http://localhost:8080
```

Também funciona publicado no Vercel ou no GitHub Pages.
