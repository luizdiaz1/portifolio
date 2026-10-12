# Gestão de Frota — demo

Sistema interno de gestão de frota de caminhões de uma distribuidora, criado a partir da rotina real do setor de frota.

## Contexto
O setor de frota acompanha veículos, motoristas, multas, manutenções, trocas de óleo, tacógrafos, ocorrências e a produção diária da oficina.

## Problema
Esses controles ficavam em planilhas e registros separados. Consolidar informações dava trabalho manual, prazos (multas, tacógrafos, trocas de óleo) dependiam de conferência e o histórico de cada veículo ficava espalhado.

## Solução
Uma plataforma única com módulos para cada controle:
- Veículos, motoristas, multas e pontuação, manutenções, troca de óleo, tacógrafos, produção do dia;
- Chamados abertos pelo motorista via QR Code do veículo;
- Checklists em vídeo da chegada do caminhão;
- Sinistros e avarias e ocorrências (BRAT) com fotos, vídeos e PDFs anexados;
- Central 360°: histórico completo de cada veículo em uma tela;
- Eficiência operacional: consumo médio (km/L) por veículo e motorista a partir do relatório mensal de abastecimento;
- Relatórios em PDF/Excel, financeiro, lixeira com restauração, auditoria de alterações e gestão de usuários.

## Impacto
- Informações da frota centralizadas em um só lugar.
- Alertas automáticos de vencimento (óleo, tacógrafo, prazos de multas).
- Rastreabilidade: quem criou, alterou ou excluiu cada registro.
- Relatórios mensais gerados pelo próprio sistema.

## Tecnologias
HTML, CSS e JavaScript · Supabase (PostgreSQL, Storage, Auth) · Vercel · jsPDF, Chart.js, SheetJS, Three.js

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
