# 🌾 Ventos da Várzea — Sistema de Gestão Pecuária

Sistema completo de gestão para a Cabanha Ventos da Várzea.
Desenvolvido com **React + Vite + Supabase + Vercel**.

---

## ✅ Módulos incluídos

| Módulo | Descrição |
|---|---|
| Dashboard | Visão geral, KPIs e navegação |
| Propriedade | Fazenda, piquetes e lotes |
| Cadastro de Animais | Registro individual com histórico |
| Painel Reprodutivo | IATF, diagnósticos e partos |
| Controle de Rebanho | Estatísticas e índices zootécnicos |
| Gestão Financeira | Receitas, despesas, compra/venda |
| Sanidade | Vacinas, vermifugações e alertas |
| Pesagens | Pesos individuais e GMD |
| Estoque | Medicamentos, vacinas e sêmen |
| Relatórios | Resumos e exportação |

---

## 🚀 Passo a passo — deploy do zero

### PARTE 1 — Configurar o banco de dados (Supabase)

**1. Criar conta e projeto no Supabase**
- Acesse https://supabase.com e crie uma conta gratuita
- Clique em **"New project"**
- Informe:
  - Nome do projeto: `ventos-da-varzea`
  - Senha do banco: anote em local seguro
  - Região: `South America (São Paulo)` — mais rápido para o Brasil
- Aguarde 1-2 minutos para o projeto inicializar

**2. Executar o schema do banco de dados**
- No painel do Supabase, clique em **SQL Editor** (menu lateral)
- Clique em **"New query"**
- Abra o arquivo `docs/01_supabase_schema.sql` deste projeto
- Copie todo o conteúdo e cole no editor
- Clique em **"Run"** (ou Ctrl+Enter)
- Aguarde a mensagem de sucesso

**3. Criar os 4 usuários do sistema**
- No painel do Supabase, clique em **Authentication** → **Users**
- Clique em **"Invite user"** ou **"Add user"** para cada um:

| Nome | E-mail sugerido | Senha inicial |
|---|---|---|
| Vitorugo Avila Gonçalves | vitorugo@ventosda varzea.com.br | Troque no primeiro acesso |
| Veridiana Avila Gonçalves | veridiana@ventosdavarzea.com.br | Troque no primeiro acesso |
| Usuário 3 | usuario3@ventosdavarzea.com.br | Troque no primeiro acesso |
| Usuário 4 | usuario4@ventosdavarzea.com.br | Troque no primeiro acesso |

- Após criar cada usuário, execute no SQL Editor:
```sql
-- Substitua os valores pelos dados reais de cada usuário
-- Copie o UUID do usuário na tela de Authentication > Users
INSERT INTO public.usuarios (id, nome, email, avatar_cor)
VALUES
  ('UUID-DO-USUARIO-1', 'Vitorugo Avila Gonçalves', 'vitorugo@email.com', '#1E4D35'),
  ('UUID-DO-USUARIO-2', 'Veridiana Avila Gonçalves', 'veridiana@email.com', '#0C447C');
```

**4. Copiar as credenciais do Supabase**
- No painel do Supabase, clique em **Settings** → **API**
- Copie:
  - **Project URL** → ex: `https://abcdefghij.supabase.co`
  - **anon public** key → chave longa começando com `eyJ...`
- Guarde essas informações para o próximo passo

---

### PARTE 2 — Configurar e testar localmente

**Pré-requisitos no seu computador:**
- Node.js instalado — baixe em https://nodejs.org (versão LTS)
- Git instalado — baixe em https://git-scm.com

**1. Descompactar o projeto**
- Descompacte o arquivo `ventos-da-varzea.zip` em uma pasta de sua escolha
- Ex: `C:\Projetos\ventos-da-varzea`

**2. Instalar dependências**
- Abra o terminal (no Windows: pressione Win+R, digite `cmd`, Enter)
- Navegue até a pasta do projeto:
```bash
cd C:\Projetos\ventos-da-varzea
```
- Instale as dependências:
```bash
npm install
```
- Aguarde o download (pode levar 1-2 minutos)

**3. Configurar variáveis de ambiente**
- Na pasta do projeto, copie o arquivo `.env.example`:
```bash
copy .env.example .env
```
- Abra o arquivo `.env` com o Bloco de Notas
- Substitua os valores pelas suas credenciais do Supabase:
```
VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```
- Salve o arquivo

**4. Testar localmente**
```bash
npm run dev
```
- Abra o navegador em http://localhost:3000
- Faça login com um dos e-mails cadastrados no Supabase
- O sistema deve carregar normalmente

---

### PARTE 3 — Deploy no Vercel (acesso online)

**1. Criar conta no GitHub**
- Acesse https://github.com e crie uma conta gratuita (se não tiver)

**2. Criar repositório no GitHub**
- Clique em **"New repository"**
- Nome: `ventos-da-varzea`
- Deixe como **Private** (privado)
- Clique em **"Create repository"**

**3. Subir o código para o GitHub**
No terminal, dentro da pasta do projeto:
```bash
git init
git add .
git commit -m "Sistema Ventos da Várzea v1.0"
git remote add origin https://github.com/SEU-USUARIO/ventos-da-varzea.git
git push -u origin main
```

**4. Criar conta no Vercel**
- Acesse https://vercel.com e crie uma conta gratuita
- Faça login **com a conta do GitHub** (mais fácil)

**5. Fazer o deploy**
- No Vercel, clique em **"Add New Project"**
- Selecione o repositório `ventos-da-varzea`
- Na tela de configuração:
  - **Framework Preset**: Vite (detectado automaticamente)
  - **Build Command**: `npm run build` (padrão)
  - **Output Directory**: `dist` (padrão)
- Clique em **"Environment Variables"** e adicione:
  - `VITE_SUPABASE_URL` → sua URL do Supabase
  - `VITE_SUPABASE_ANON_KEY` → sua chave anon do Supabase
- Clique em **"Deploy"**
- Aguarde 1-2 minutos

**6. Acessar o sistema online**
- Após o deploy, o Vercel fornece um endereço como:
  `https://ventos-da-varzea.vercel.app`
- Compartilhe este endereço com os 4 usuários
- Funciona em qualquer navegador — computador, celular ou tablet

---

### PARTE 4 — Acesso pelo celular Android

O sistema funciona perfeitamente no navegador Android:

1. Abra o **Chrome** no celular
2. Acesse o endereço do Vercel
3. Faça login normalmente
4. Para salvar na tela inicial (igual a um app):
   - Toque nos **3 pontinhos** do Chrome (canto superior direito)
   - Selecione **"Adicionar à tela inicial"**
   - O sistema aparecerá como um ícone na tela do celular

> ⚠️ **Lançamento por voz** funciona apenas no Chrome ou Edge.

---

## 🔄 Como atualizar o sistema no futuro

Quando receber uma versão atualizada do sistema:
1. Substitua os arquivos na pasta do projeto
2. Execute `git add . && git commit -m "Atualização" && git push`
3. O Vercel detecta a mudança e faz o deploy automático em ~1 minuto

---

## 📁 Estrutura do projeto

```
ventos-da-varzea/
├── docs/
│   └── 01_supabase_schema.sql    ← Execute no Supabase
├── src/
│   ├── lib/
│   │   ├── supabase.js            ← Conexão com banco de dados
│   │   └── helpers.js             ← Funções utilitárias
│   ├── styles/
│   │   └── global.css             ← Design system
│   ├── components/
│   │   ├── auth/Login.jsx         ← Tela de login
│   │   ├── layout/Layout.jsx      ← Layout principal
│   │   ├── layout/Sidebar.jsx     ← Menu lateral
│   │   └── UI.jsx                 ← Componentes reutilizáveis
│   ├── pages/
│   │   ├── Dashboard.jsx
│   │   ├── Animais.jsx
│   │   ├── Reprodutivo.jsx
│   │   ├── Rebanho.jsx
│   │   ├── Financeiro.jsx
│   │   ├── Sanidade.jsx
│   │   ├── Pesagens.jsx
│   │   ├── Estoque.jsx
│   │   ├── Propriedade.jsx
│   │   └── Relatorios.jsx
│   ├── App.jsx                    ← Roteamento e autenticação
│   └── main.jsx                   ← Entrada da aplicação
├── .env.example                   ← Template de variáveis
├── package.json                   ← Dependências
├── vite.config.js                 ← Configuração de build
├── vercel.json                    ← Configuração Vercel
└── README.md                      ← Este arquivo
```

---

## 🔒 Segurança

- Autenticação gerenciada pelo Supabase Auth (padrão bancário)
- Todas as senhas são criptografadas
- Row Level Security (RLS) ativo: usuários só acessam dados autorizados
- HTTPS obrigatório no Vercel
- Chaves de API nunca ficam expostas no código

---

## 🆘 Suporte e dúvidas

Em caso de dúvidas ou problemas:
1. Verifique se o arquivo `.env` tem as credenciais corretas
2. Confirme que o SQL foi executado com sucesso no Supabase
3. Verifique os logs no painel do Vercel em caso de erro de deploy

---

## 📋 Tecnologias utilizadas

| Tecnologia | Versão | Função |
|---|---|---|
| React | 18 | Interface do usuário |
| Vite | 5 | Build e desenvolvimento |
| Supabase | 2 | Banco de dados e autenticação |
| React Router | 6 | Navegação entre páginas |
| Recharts | 2 | Gráficos e visualizações |
| date-fns | 3 | Manipulação de datas |
| Tabler Icons | 2 | Ícones via CDN |

**Custo mensal: R$ 0,00** (tudo no plano gratuito)

---

*Cabanha Ventos da Várzea · Viamão/RS · Sistema v1.0*

Atualizado em 16/06/2026
