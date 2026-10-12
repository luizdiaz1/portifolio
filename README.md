# Portfólio — demonstrações de sistemas

Site estático com a página de apresentação (`index.html`) e quatro demonstrações interativas:

| Pasta | Sistema |
|---|---|
| `frota/` | Gestão de Frota |
| `promotor/` | Controle de Veículos de Passeio (frota comercial) |
| `qualidade/` | Qualidade 10S |
| `agregados/` | Controle de Agregados e CIOT |

Todas usam empresa e dados **fictícios** e um banco simulado no navegador — não precisam de Supabase nem de servidor.

## Publicar no Vercel
1. Crie um repositório no GitHub (ex.: `portfolio-demos`) e envie o conteúdo desta pasta.
2. No Vercel: **Add New → Project**, escolha o repositório e clique em **Deploy** (sem build, framework "Other").
3. O endereço gerado abre a página do portfólio; cada demo fica em `/frota/`, `/promotor/`, `/qualidade/` e `/agregados/`.

## Publicar no GitHub Pages
No repositório: **Settings → Pages → Deploy from a branch → main / (root)**.

## Rodar localmente
```bash
python3 -m http.server 8080
# http://localhost:8080
```
