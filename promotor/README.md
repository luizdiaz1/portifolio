# Controle de Veículos de Passeio (frota comercial) — demo

Controle de retirada e devolução dos carros usados pela equipe comercial (promotores).

## Contexto
A equipe comercial usa carros da empresa para visitar clientes ao longo do dia.

## Problema
Era preciso saber quem estava com cada carro, por onde passou, em que estado devolveu e ter comprovação da retirada e da entrega.

## Solução
- Registro de saída e devolução com **assinatura digital** do condutor;
- Roteiro de clientes visitados, com mapa, links para Waze/Google Maps e fotos de antes/depois do atendimento;
- Área exclusiva do condutor (celular), separada do painel de controle;
- Manutenções, ocorrências, histórico por veículo, relatórios;
- Perfis de acesso (Administrador, Gestor, Visualizador, Condutor) e auditoria.

## Impacto
- Retiradas e devoluções registradas e assinadas digitalmente, sem papel.
- Visão em tempo real dos carros em uso e disponíveis.
- Histórico consultável por veículo e por condutor.

## Tecnologias
HTML, CSS e JavaScript · Supabase · Leaflet (mapas) · Vercel

**Acessos na demo:** `admin@exemplo.com`, `gestor@exemplo.com`, `consulta@exemplo.com` (controle) e `condutor@exemplo.com` (área do condutor, em `#/condutor`). Qualquer senha.

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
