# 💳 Controle de Cartões

App web para controle de gastos de cartão de crédito por pessoa e por mês. Desenvolvido como HTML/CSS/JS puro com backend no Supabase.

---

## ✨ Funcionalidades

- **Lançamentos** — Adicione gastos por cartão, pessoa, valor e número de parcelas
- **Por Pessoa** — Veja o total de cada pessoa com breakdown por cartão e detalhamento de cada gasto
- **Por Cartão** — Resumo geral e detalhado por cartão do mês
- **Múltiplos meses** — Crie e navegue entre meses; exclua meses individualmente
- **Editar gastos** — Edite descrição, valor, pessoa e parcelas de qualquer lançamento
- **Importar CSV** — Importe histórico de planilhas com preview antes de confirmar
- **Exportar CSV** — Exporte os gastos do mês atual para Excel/Sheets
- **Login por username** — Entre com usuário e senha, sem expor email
- **Dados isolados por usuário** — RLS garante que cada usuário só acessa seus próprios dados
- **Sincronização em nuvem** — Dados salvos no banco em tempo real, acessíveis de qualquer dispositivo

---

## 🗂 Estrutura do projeto

```
cartoes/
├── index.html          # HTML principal + estrutura dos modais
├── css/
│   └── style.css       # Todos os estilos
├── js/
│   ├── config.js       # Credenciais Supabase, constantes e currentUser
│   ├── state.js        # Estado global da aplicação
│   ├── utils.js        # Funções auxiliares (toast, formatação, modal)
│   ├── auth.js         # Login por username, logout e verificação de sessão
│   ├── db.js           # Todas as operações no banco de dados
│   ├── render.js       # Funções de renderização da UI
│   └── importexport.js # Importação e exportação de CSV
├── assets/             # Ícones e imagens (futuro)
├── .gitignore
└── README.md
```

---

## 🗄 Banco de dados (Supabase)

### Tabelas

| Tabela     | Colunas principais                                                              |
|------------|---------------------------------------------------------------------------------|
| `pessoas`  | `id`, `nome`, `cor`, `user_id`, `created_at`                                   |
| `cartoes`  | `id`, `nome`, `cor`, `user_id`, `created_at`                                   |
| `meses`    | `id`, `nome`, `user_id`, `created_at`                                          |
| `gastos`   | `id`, `mes_id`, `cartao`, `pessoa`, `descricao`, `valor`, `parcelas`, `user_id`, `created_at` |
| `profiles` | `id` (= auth.users.id), `username`, `created_at`                               |


### Cadastrar um novo usuário

```sql
-- 1. Crie o usuário no Supabase: Authentication → Users → Add user
-- 2. Depois cadastre o username:
insert into profiles (id, username)
select id, 'seu_usuario' from auth.users where email = 'seu@email.com';
```

---

### 2. Vercel

1. Acesse [vercel.com](https://vercel.com) e faça login com GitHub
2. Clique em **"Add New Project"**
3. Selecione o repositório `controle-cartoes`
4. Clique em **"Deploy"** — sem configuração adicional necessária
5. Sua URL pública estará disponível em segundos

---

## 📥 Formato do CSV para importação

O arquivo deve ter cabeçalho. Colunas **obrigatórias**: `Cartao`, `Pessoa`, `Valor`.
Colunas **opcionais**: `Mes`, `Descricao`, `Parcelas`.

```
Mes;Cartao;Descricao;Pessoa;Parcelas;Valor
Maio/2025;Nubank;Academia;Calif;1;89,90
Maio/2025;Inter;Mercado;Mãe;1;347,50
Maio/2025;Credicard;Celular;Léo;12;150,00
```

Separador pode ser `;` ou `,`. O app detecta automaticamente.

---

## 🔒 Segurança

- **Row Level Security (RLS)** ativa em todas as tabelas — cada usuário só lê e escreve os próprios dados
- **Login por username** — o email real nunca é exposto na interface
- **Sessão JWT** gerenciada pelo Supabase Auth com expiração automática
- **Função `get_user_email`** com `security definer` — único ponto de acesso ao email, via RPC seguro

---

## 🛠 Tecnologias

- **Frontend**: HTML5, CSS3, JavaScript (vanilla)
- **Backend / Banco**: [Supabase](https://supabase.com) (PostgreSQL)
- **Autenticação**: Supabase Auth (email + senha, login via username)
- **Hospedagem**: [Vercel](https://vercel.com)
- **Fontes**: Google Fonts (Syne + DM Sans)
