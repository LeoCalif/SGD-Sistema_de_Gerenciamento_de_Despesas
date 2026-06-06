# 🗄️ Guia de Migração e Configuração de Banco de Dados — Klif Despesas

Este guia contém as instruções completas para migrar, configurar ou hospedar o banco de dados do **Klif Despesas**. Como a aplicação é baseada na biblioteca `@supabase/supabase-js`, ela depende de uma infraestrutura que forneça um banco PostgreSQL, uma API REST (PostgREST) e um serviço de autenticação (GoTrue).

Você pode hospedar essa estrutura de três maneiras:
1. **Supabase Cloud** (Nuvem oficial gratuita/paga)
2. **Ambiente Local** (Supabase CLI executando em Docker na sua própria máquina)
3. **VPS Online Autohospedada** (Hospedagem própria em VPS via Docker Compose)

---

## ☁️ Opção 1: Supabase Cloud (Nuvem Oficial)

Esta é a opção padrão e mais simples. Se deseja migrar para um novo projeto no Supabase Cloud:

### Passo 1: Atualizar as Credenciais no Código
No frontend, edite o arquivo [config.js](file:///g:/MEUS%20ARQUIVOS/CURSOS%20e%20PROJETOS/2%20-%20Projetos/001%20-%20Meu%20Sistema%20de%20Despesas/Klif_Despesas-Controle_de_Gastos/js/config.js) com os dados do novo projeto (encontrados em **Settings > API** no painel do Supabase):

```javascript
// js/config.js
const SUPABASE_URL = 'https://SEU_NOVO_PROJETO.supabase.co';
const SUPABASE_KEY = 'SUA_NOVA_ANON_PUBLIC_KEY';
```

### Passo 2: Executar a Estrutura de Tabelas (Schema)
No painel do novo projeto, acesse o **SQL Editor**, clique em **New Query** e execute o seguinte script para criar as 10 tabelas do sistema:

```sql
-- 1. TABELA PROFILES (Perfis de usuário)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username VARCHAR NOT NULL UNIQUE,
  role VARCHAR NOT NULL DEFAULT 'user', -- 'user', 'visualizador', 'admin'
  ativo BOOLEAN NOT NULL DEFAULT true,
  whatsapp VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. TABELA PESSOAS (Amigos ou pessoas do controle do usuário)
CREATE TABLE IF NOT EXISTS public.pessoas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vinculo_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. TABELA CARTOES
CREATE TABLE IF NOT EXISTS public.cartoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. TABELA MESES
CREATE TABLE IF NOT EXISTS public.meses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. TABELA GASTOS (Transações dos cartões)
CREATE TABLE IF NOT EXISTS public.gastos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes_id UUID NOT NULL REFERENCES public.meses(id) ON DELETE CASCADE,
  cartao VARCHAR NOT NULL,
  pessoa VARCHAR NOT NULL,
  descricao TEXT,
  valor NUMERIC NOT NULL,
  parcelas INTEGER NOT NULL DEFAULT 1,
  parcela_atual INTEGER NOT NULL DEFAULT 1,
  parcela_origem UUID REFERENCES public.gastos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. TABELA ANOTAÇÕES (Comentários mensais por pessoa)
CREATE TABLE IF NOT EXISTS public.anotacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes_id UUID NOT NULL REFERENCES public.meses(id) ON DELETE CASCADE,
  pessoa VARCHAR NOT NULL,
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_user_mes_pessoa UNIQUE (user_id, mes_id, pessoa)
);

-- 7. TABELA CAIXINHAS (Metas de poupança)
CREATE TABLE IF NOT EXISTS public.caixinhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome VARCHAR NOT NULL,
  descricao TEXT,
  meta NUMERIC,
  criado_por UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. TABELA CAIXINHA MEMBROS (Participantes das caixinhas)
CREATE TABLE IF NOT EXISTS public.caixinha_membros (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caixinha_id UUID NOT NULL REFERENCES public.caixinhas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_caixinha_membro UNIQUE (caixinha_id, user_id)
);

-- 9. TABELA CAIXINHA DEPOSITOS
CREATE TABLE IF NOT EXISTS public.caixinha_depositos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  caixinha_id UUID NOT NULL REFERENCES public.caixinhas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  valor NUMERIC NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. TABELA HISTÓRICO WHATSAPP (Histórico da Secretária Virtual)
CREATE TABLE IF NOT EXISTS public.whatsapp_chat_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role VARCHAR NOT NULL, -- 'user' ou 'model'
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### Passo 3: Ativar RLS (Row Level Security) e Políticas de Segurança
No mesmo SQL Editor, execute o script abaixo para habilitar o isolamento de dados do sistema (garantindo segurança entre múltiplos usuários logados):

```sql
-- Ativar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cartoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anotacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixinhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixinha_membros ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caixinha_depositos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_chat_history ENABLE ROW LEVEL SECURITY;

-- 1. Políticas para PROFILES
CREATE POLICY "Permitir leitura de profiles autenticados" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Permitir atualização do próprio perfil" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Administradores gerenciam todos os perfis" ON public.profiles FOR ALL TO authenticated 
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- 2. Políticas para MESES
CREATE POLICY "Usuários gerenciam seus meses" ON public.meses FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Usuários leem meses compartilhados por amigos" ON public.meses FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM public.pessoas p WHERE p.user_id = meses.user_id AND p.vinculo_user_id = auth.uid()));

-- 3. Políticas para CARTOES
CREATE POLICY "Usuários gerenciam seus cartões" ON public.cartoes FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 4. Políticas para PESSOAS
CREATE POLICY "Usuários gerenciam suas pessoas" ON public.pessoas FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Leitura de pessoas onde o usuário está vinculado" ON public.pessoas FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR vinculo_user_id = auth.uid());

-- 5. Políticas para GASTOS
CREATE POLICY "Usuários gerenciam seus gastos" ON public.gastos FOR ALL TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Usuários leem gastos lançados em seu nome em outros cartões" ON public.gastos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pessoas p WHERE p.user_id = gastos.user_id AND p.nome = gastos.pessoa AND p.vinculo_user_id = auth.uid()));

-- 6. Políticas para ANOTACOES
CREATE POLICY "Usuários gerenciam suas anotações" ON public.anotacoes FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 7. Políticas para CAIXINHAS
CREATE POLICY "Usuários criadores gerenciam suas caixinhas" ON public.caixinhas FOR ALL TO authenticated USING (criado_por = auth.uid());
CREATE POLICY "Membros visualizam as caixinhas que participam" ON public.caixinhas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caixinha_membros m WHERE m.caixinha_id = caixinhas.id AND m.user_id = auth.uid()));

-- 8. Políticas para CAIXINHA MEMBROS
CREATE POLICY "Criador da caixinha gerencia membros" ON public.caixinha_membros FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caixinhas c WHERE c.id = caixinha_membros.caixinha_id AND c.criado_por = auth.uid()));
CREATE POLICY "Membros leem membros da mesma caixinha" ON public.caixinha_membros FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caixinha_membros m WHERE m.caixinha_id = caixinha_membros.caixinha_id AND m.user_id = auth.uid()));

-- 9. Políticas para CAIXINHA DEPOSITOS
CREATE POLICY "Membros veem depósitos da caixinha" ON public.caixinha_depositos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.caixinha_membros m WHERE m.caixinha_id = caixinha_depositos.caixinha_id AND m.user_id = auth.uid()));
CREATE POLICY "Membros inserem depósitos em seu nome" ON public.caixinha_depositos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND EXISTS (SELECT 1 FROM public.caixinha_membros m WHERE m.caixinha_id = caixinha_depositos.caixinha_id AND m.user_id = auth.uid()));
CREATE POLICY "Usuários removem seus próprios depósitos" ON public.caixinha_depositos FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 10. Políticas para HISTÓRICO WHATSAPP
CREATE POLICY "Usuários gerenciam seu histórico do whatsapp" ON public.whatsapp_chat_history FOR ALL TO authenticated USING (auth.uid() = user_id);
```

### Passo 4: Criar as Funções de Banco (RPC)
As funções com privilégios administrativos (`SECURITY DEFINER`) são fundamentais para o login por username, controle de status ativo e exclusão de contas. Execute no SQL Editor:

```sql
-- RPC 1: Buscar e-mail do usuário no schema auth de forma segura
CREATE OR REPLACE FUNCTION public.get_user_email(user_id UUID)
RETURNS VARCHAR
SECURITY DEFINER
AS $$
BEGIN
  RETURN (SELECT email FROM auth.users WHERE id = user_id);
END;
$$ LANGUAGE plpgsql;

-- RPC 2: Confirmar o e-mail de usuários criados pelo administrador
CREATE OR REPLACE FUNCTION public.confirm_user_email(user_email TEXT)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  UPDATE auth.users
  SET email_confirmed_at = NOW(),
      confirmed_at = NOW()
  WHERE email = user_email;
END;
$$ LANGUAGE plpgsql;

-- RPC 3: Deletar usuário e seus dados (apenas para Admin logado)
CREATE OR REPLACE FUNCTION public.delete_user_by_admin(target_user_id UUID)
RETURNS VOID
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    DELETE FROM auth.users WHERE id = target_user_id;
  ELSE
    RAISE EXCEPTION 'Acesso negado. Apenas administradores podem deletar usuários.';
  END IF;
END;
$$ LANGUAGE plpgsql;
```

### Passo 5: Criar o Primeiro Usuário Administrador
1. Vá em **Authentication > Users > Add user > Create user** no painel da nuvem, registre um e-mail e uma senha e anote o **User ID** (UUID) gerado.
2. Execute o comando a seguir no SQL Editor para habilitar esse usuário como Administrador:
```sql
INSERT INTO public.profiles (id, username, role, ativo)
VALUES ('UUID_GERADO_NO_PASSO_ANTERIOR', 'SeuNomeUsuario', 'admin', true);
```

---

## 💻 Opção 2: Banco de Dados Local (Supabase CLI + Docker)

Executar o Supabase localmente é ideal para desenvolvimento offline e testes sem limites de uso. Toda a pilha do Supabase roda na sua máquina via containers Docker.

### Pré-requisitos
- Ter o **Docker Desktop** instalado e em execução na máquina.
- Ter o gerenciador de pacotes **Node.js** (NPM) ou similar para instalar a CLI.

### Passo 1: Instalar o Supabase CLI
Abra o terminal do seu sistema operacional (PowerShell ou Bash) e instale a ferramenta globalmente:
```bash
npm install -g supabase
```

### Passo 2: Inicializar o Supabase no Projeto
Navegue até a pasta raiz do projeto *Klif Despesas* e inicialize as configurações:
```bash
supabase init
```
Isso criará uma pasta chamada `supabase/` na raiz do seu diretório com arquivos de configuração de ambiente.

### Passo 3: Iniciar os Serviços Locais
Certifique-se de que o Docker está rodando e execute o comando:
```bash
supabase start
```
A CLI irá baixar as imagens do Docker (PostgreSQL, GoTrue, PostgREST, Kong Gateway) e iniciar os serviços. Ao concluir, o terminal exibirá uma saída semelhante a esta:
```text
Started supabase local development setup.

         API URL: http://localhost:54321
          DB URL: postgresql://postgres:postgres@localhost:54322/postgres
      Studio URL: http://localhost:54323
    Inbucket URL: http://localhost:54324
        anon key: eyJhbGciOiJIUzI1NiIsInR5cCI...
  service_role: eyJhbGciOiJIUzI1NiIsInR5cCI...
```

### Passo 4: Atualizar as Credenciais Locais
Copie os valores de `API URL` e `anon key` mostrados no seu terminal e atualize o seu arquivo [config.js](file:///g:/MEUS%20ARQUIVOS%20e%20PROJETOS/2%20-%20Projetos/001%20-%20Meu%20Sistema%20de%20Despesas/Klif_Despesas-Controle_de_Gastos/js/config.js):

```javascript
// js/config.js
const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_KEY = 'SUA_ANON_KEY_LOCAL_MOSTRADA_NO_TERMINAL';
```

### Passo 5: Configurar o Banco Local
1. Abra o navegador no link do **Studio URL** local (geralmente `http://localhost:54323`). Este é o painel de controle local do seu projeto.
2. Vá em **SQL Editor > New Query**.
3. Copie e execute as estruturas das tabelas, as políticas de segurança RLS e as funções RPC listadas na **Opção 1 (Passos 2, 3 e 4)**.
4. Para criar o seu usuário de testes, vá na aba **Authentication > Users** (no painel local), crie um usuário de e-mail e senha, copie o UUID e insira-o no `profiles` como administrador utilizando o SQL Editor local (Passo 5 da Opção 1).

### Comandos Úteis do CLI Local:
*   `supabase stop` — Para pausar todos os serviços locais e liberar memória do computador.
*   `supabase status` — Exibe as URLs e chaves secretas do ambiente novamente.
*   `supabase db reset` — Recria o banco de dados do zero limpando todos os dados.

---

## 🌐 Opção 3: Hospedar em uma VPS Online Autohospedada (Self-Hosted)

Se você possui um servidor próprio (VPS) na nuvem (DigitalOcean, AWS, Hetzner, etc.) e quer autonomia total sobre o banco de dados sem custo adicional, você pode hospedar sua própria pilha Supabase.

### Pré-requisitos na VPS
- Servidor com Linux (Ubuntu 20.04 ou posterior recomendado).
- **Docker** e **Docker Compose** instalados na VPS.
- Portas `8000` (API Gateway) e `80` ou `443` abertas no Firewall do servidor.

### Passo 1: Clonar o Repositório do Supabase Docker
Conecte-se na sua VPS via SSH e clone a pasta oficial de autohospedagem do Supabase:
```bash
# Clonar o repositório
git clone --depth 1 https://github.com/supabase/supabase.git

# Acessar o diretório de Docker da ferramenta
cd supabase/docker
```

### Passo 2: Configurar o Arquivo de Ambiente (.env)
Copie o template de variáveis de ambiente:
```bash
cp .env.example .env
```
Agora, você precisa gerar chaves JWT seguras. O Supabase fornece um utilitário simples em seu repositório ou você pode gerar hashes HMAC-SHA256 aleatórios.
Edite o arquivo `.env` (`nano .env` ou `vim .env`):
1. Altere `POSTGRES_PASSWORD` para uma senha extremamente segura.
2. Atualize `JWT_SECRET` com uma string longa e aleatória.
3. Gere e atualize o `ANON_KEY` (chave de acesso público) e `SERVICE_ROLE_KEY` (chave com acesso total de bypass ao banco) de acordo com o padrão do JWT gerado com o seu segredo.
4. Altere a variável `SITE_URL` para o IP público da sua VPS ou o seu subdomínio (ex: `http://meuservidor.com`).

### Passo 3: Inicializar a Pilha via Docker Compose
Inicie os containers na VPS em segundo plano (background):
```bash
docker compose up -d
```
O Docker irá inicializar e configurar os serviços. O principal ponto de entrada de conexões será o gateway Kong na porta padrão `:8000`.

### Passo 4: Atualizar os dados de Acesso no Sistema
Substitua as credenciais no arquivo `js/config.js` apontando para o endereço IP público da sua VPS ou para o domínio que você apontou para o servidor:

```javascript
// js/config.js
const SUPABASE_URL = 'http://IP_PUBLICO_DA_VPS:8000';
const SUPABASE_KEY = 'SUA_ANON_KEY_GERADA_NO_ARQUIVO_ENV';
```

### Passo 5: Executar Estruturas e Configurar Usuário Inicial
Para executar o script de banco de dados na VPS, você pode:
- **Acessar o PostgreSQL nativo** via terminal na VPS:
  ```bash
  docker compose exec db psql -U postgres -d postgres
  ```
- **Ou usar um cliente gráfico** de banco de dados externo (DBeaver, pgAdmin) conectando na VPS pelo IP na porta `54322` (senha configurada no `POSTGRES_PASSWORD`).
- **Ou acessar o painel Studio** da VPS na porta padrão configurada no `.env` (variável `STUDIO_PORT`, padrão `:3000`), abrindo no navegador `http://IP_DA_VPS:3000` para colar os scripts no SQL Editor.

Execute as estruturas de tabelas, políticas RLS, RPCs e insira o primeiro administrador no banco exatamente como descrito nos passos da **Opção 1**.

---

## ℹ️ Observação sobre PostgreSQL Puro em VPS

Caso queira usar apenas um banco **PostgreSQL comum** (sem toda a pilha de serviços do Supabase como autenticação e APIs automáticas):
*   **Atenção:** Como o frontend da aplicação está acoplado ao SDK `@supabase/supabase-js`, ele depende diretamente do serviço de autenticação de usuários (GoTrue) e da API REST exposta (PostgREST) gerados pelo ecossistema Supabase.
*   Portanto, se você preferir não usar o Supabase em sua VPS, você teria que instalar manualmente o **PostgREST** (para expor tabelas como rotas HTTP) e configurar um servidor de autorização JWT compatível com as chamadas de banco do sistema. O caminho de autohospedar a pilha completa do Supabase via Docker Compose (**Opção 3**) poupa tempo e mantém a aplicação funcionando nativamente sem necessidade de reescrever as funções em `js/db.js` e `js/auth.js`.
