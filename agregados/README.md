# Controle de Agregados e CIOT — demo

Controle dos serviços feitos por motoristas agregados (terceiros), CIOTs e cálculo de comissões.

## Contexto
Parte das entregas é feita por motoristas agregados, remunerados por comissão e bonificação por desempenho.

## Problema
Serviços, CIOTs, ocorrências e o cálculo da remuneração de cada motorista precisavam ser organizados e conferidos manualmente.

## Solução
- Cadastro de motoristas agregados e veículos;
- Abertura e finalização de serviços (notas na saída e no retorno, entregas, reclamações, devoluções, sinistros);
- **Cálculo automático** da comissão e da bonificação por regras de desempenho;
- Calculadora de pagamento por quinzena, CIOTs, ocorrências, relatórios e auditoria.

## Impacto
- Regras de remuneração aplicadas de forma padronizada.
- Histórico de serviços e ocorrências por motorista.
- Relatórios por período prontos para conferência.

## Tecnologias
HTML, CSS e JavaScript (módulos ES) · Supabase

*Projeto em desenvolvimento.*

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
