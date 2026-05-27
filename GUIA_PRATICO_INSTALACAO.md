# Guia Prático: Instalação e Configuração Local do Financeiro DANADO

## ✅ Pré-requisitos (Você já tem!)

- ✅ Node.js instalado

- ✅ MariaDB/MySQL instalado

---

## PASSO 1: Baixar o Projeto

### Opção A: Se você recebeu um arquivo ZIP

1. **Extraia o arquivo:**

   ```
   C:\Users\[SeuUsuário]\financeiro-danado\
   ```

### Opção B: Se você tem acesso ao Git

```bash
git clone [URL_DO_REPOSITORIO]
cd financeiro-danado
```

---

## PASSO 2: Criar Banco de Dados no MariaDB

### 1. Abra o Prompt de Comando (CMD)

### 2. Conecte ao MariaDB:

```bash
mysql -u root -p
```

**Digite a senha que configurou na instalação do MariaDB**

### 3. Crie o banco de dados:

```sql
CREATE DATABASE financeiro_danado;
EXIT;
```

**Saída esperada:**

```
Query OK, 1 row affected (0.001 sec)
```

---

## PASSO 3: Configurar o Projeto

### 1. Abra o Prompt de Comando na pasta do projeto:

```bash
cd C:\Users\[SeuUsuário]\financeiro-danado
```

### 2. Crie o arquivo `.env` (se não existir):

**Abra um editor de texto (Notepad) e crie o arquivo ****`.env`**** com:**

```
DATABASE_URL=mysql://root:SENHA_MARIADB@localhost:3306/financeiro_danado
JWT_SECRET=seu_jwt_secret_aleatorio_aqui_123456
VITE_APP_ID=app_financeiro_danado
OAUTH_SERVER_URL=http://localhost:3000
VITE_OAUTH_PORTAL_URL=http://localhost:3000
PORT=3000
```

**Substitua:**

- `SENHA_MARIADB` pela senha que você configurou no MariaDB

- `seu_jwt_secret_aleatorio_aqui_123456` por qualquer texto aleatório (ex: `abc123xyz789` )

**Salve como:** `C:\Users\[SeuUsuário]\financeiro-danado\.env`

### 3. Instale as dependências:

```bash
pnpm install
```

**Aguarde ~2-3 minutos**

**Saída esperada:**

```
✓ Installed 500+ packages
```

---

## PASSO 4: Criar Tabelas no Banco de Dados

```bash
pnpm db:push
```

**Saída esperada:**

```
✓ Migrations applied successfully
✓ Database schema updated
```

---

## PASSO 5: Iniciar o Servidor

```bash
pnpm dev
```

**Saída esperada:**

```
[Server] Running on port 3000
[WebSocket] Listening on ws://localhost:3000
```

---

## PASSO 6: Acessar o Aplicativo

### No mesmo PC (Servidor):

Abra o navegador e acesse:

```
http://localhost:3000
```

### Em outro PC (Cliente ) na mesma rede:

1. **Encontre o IP do servidor:**

   ```bash
   ipconfig
   ```
  - No servidor, abra CMD e execute:
  - Procure por "IPv4 Address" (ex: 192.168.1.100)

1. **No PC cliente, abra o navegador e acesse:**

   ```
   http://192.168.1.100:3000
   ```

---

## PASSO 7: Testar Sincronização WebSocket

### 1. Abra 2 navegadores (ou 2 PCs diferentes ):

- **Navegador 1:** [http://localhost:3000](http://localhost:3000) (ou [http://192.168.1.100:3000](http://192.168.1.100:3000) )

- **Navegador 2:** [http://localhost:3000](http://localhost:3000) (ou [http://192.168.1.100:3000](http://192.168.1.100:3000) )

### 2. Faça uma alteração no Navegador 1:

- Vá para "CAIXA"

- Clique em "LOJA 1"

- Clique em "CAIXA 1"

- Adicione um valor em "Dinheiro"

- Clique em "Salvar"

### 3. Verifique no Navegador 2:

- O valor deve aparecer **instantaneamente** (~50ms)

- Se não aparecer, atualize a página (F5)

---

## 🔧 Troubleshooting

### Erro: "Can't connect to MariaDB"

**Solução:**

1. Verifique se MariaDB está rodando:
  - Abra "Serviços" (Services.msc)
  - Procure por "MariaDB"
  - Se não estiver rodando, clique com botão direito → "Iniciar"

1. Verifique a senha no `.env`

### Erro: "Port 3000 already in use"

**Solução:**

1. Encontre o processo usando a porta:

   ```bash
   netstat -ano | findstr :3000
   ```

1. Mate o processo:

   ```bash
   taskkill /PID [PID_NUMBER] /F
   ```

1. Inicie novamente:

   ```bash
   pnpm dev
   ```

### Erro: "Cannot find module 'socket.io'"

**Solução:**

```bash
pnpm install
```

### WebSocket não conecta

**Solução:**

1. Verifique se o servidor está rodando

1. Verifique o console do navegador (F12 → Console)

1. Procure por mensagens de erro

---

## 📋 Checklist de Configuração

- [ ] Node.js instalado

- [ ] MariaDB instalado e rodando

- [ ] Banco de dados `financeiro_danado` criado

- [ ] Arquivo `.env` configurado

- [ ] Dependências instaladas (`pnpm install`)

- [ ] Tabelas criadas (`pnpm db:push`)

- [ ] Servidor rodando (`pnpm dev`)

- [ ] Acesso via [http://localhost:3000](http://localhost:3000)

- [ ] Sincronização WebSocket testada com 2 navegadores

---

## 🚀 Próximos Passos

1. **Testar com 5 PCs simultâneos** - Validar sincronização em tempo real

1. **Criar Programa Windows** - Interface desktop para Caixa/Fechamento

1. **Criar Acesso Online** - Dashboard para celular/tablet

---

## ⚠️ Importante

### Fazer Backup Regularmente

```bash
# Backup do banco de dados
mysqldump -u root -p financeiro_danado > backup_financeiro.sql

# Backup da pasta do projeto
# Copie C:\Users\[SeuUsuário]\financeiro-danado\ para um pendrive ou nuvem
```

### Iniciar Automaticamente ao Ligar o PC

**Crie um arquivo ****`iniciar-servidor.bat`****:**

```
@echo off
cd C:\Users\[SeuUsuário]\financeiro-danado
pnpm dev
pause
```

**Coloque na pasta "Inicialização":**

```
C:\Users\[SeuUsuário]\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\
```

---

## 📞 Suporte

Se encontrar problemas:

1. Verifique o console do servidor (onde está rodando `pnpm dev` )

1. Verifique o console do navegador (F12 → Console)

1. Verifique se MariaDB está rodando

1. Reinicie o servidor

