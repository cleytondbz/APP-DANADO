# Guia de Instalação: MySQL/MariaDB no Windows 10 para Rede Local

## Visão Geral

Este guia configura o Financeiro DANADO para rodar **localmente com 5 máquinas Windows 10 simultâneas** sincronizadas via MySQL/MariaDB.

**Arquitetura:**
- **1 Máquina Servidor:** Roda MySQL/MariaDB + Aplicação Node.js
- **4 Máquinas Clientes:** Acessam via navegador (http://IP_SERVIDOR:3000)
- **Sincronização:** Automática a cada 5 segundos via API tRPC
- **Armazenamento:** 100% no banco de dados (zero localStorage)

---

## PASSO 1: Instalar MySQL/MariaDB no Windows 10

### Opção A: MariaDB (Recomendado - mais leve)

1. **Baixar MariaDB:**
   - Acesse: https://mariadb.org/download/
   - Clique em "Windows (MSI installer)"
   - Baixe a versão **10.6 LTS** ou superior

2. **Instalar:**
   - Execute o arquivo `.msi`
   - Clique em "Next" até chegar em "Service"
   - Marque: ✅ "Install as service"
   - Nome do serviço: `MariaDB`
   - Clique em "Next"

3. **Configurar Senha:**
   - Marque: ✅ "Modify password for database root user"
   - Digite uma senha forte (ex: `Admin@2024`)
   - Clique em "Next" → "Install"

4. **Verificar Instalação:**
   - Abra "Serviços" (Services.msc)
   - Procure por "MariaDB"
   - Status deve ser "Executando"

### Opção B: MySQL (Alternativa)

1. **Baixar MySQL:**
   - Acesse: https://dev.mysql.com/downloads/mysql/
   - Baixe "MySQL Community Server" versão 8.0

2. **Instalar:**
   - Execute o instalador
   - Escolha "Server only"
   - Configure porta: `3306`
   - Configure senha root

---

## PASSO 2: Criar Banco de Dados

### Conectar ao MySQL/MariaDB:

**No Windows 10, abra o Prompt de Comando (CMD) e execute:**

```bash
mysql -u root -p
```

**Digite a senha que configurou na instalação**

### Criar banco de dados:

```sql
CREATE DATABASE financeiro_danado;
USE financeiro_danado;
```

### Verificar criação:

```sql
SHOW DATABASES;
```

Você deve ver `financeiro_danado` na lista.

---

## PASSO 3: Configurar a Aplicação

### 1. Abra o arquivo `.env` do projeto:

**Caminho:** `C:\Users\[SeuUsuário]\financeiro-danado\.env`

### 2. Altere a variável `DATABASE_URL`:

**De:**
```
DATABASE_URL=file:./dev.db
```

**Para:**
```
DATABASE_URL=mysql://root:SENHA@localhost:3306/financeiro_danado
```

**Substitua `SENHA` pela senha que configurou**

### 3. Exemplo completo:

```env
DATABASE_URL=mysql://root:Admin@2024@localhost:3306/financeiro_danado
JWT_SECRET=seu_jwt_secret_aqui
VITE_APP_ID=seu_app_id
OAUTH_SERVER_URL=http://localhost:3000
```

---

## PASSO 4: Migrar Dados do SQLite para MySQL

### 1. Abra o terminal na pasta do projeto:

```bash
cd C:\Users\[SeuUsuário]\financeiro-danado
```

### 2. Instale as dependências (se não tiver):

```bash
pnpm install
```

### 3. Execute as migrações:

```bash
pnpm db:push
```

**Saída esperada:**
```
✓ Migrations applied successfully
✓ Database schema updated
```

---

## PASSO 5: Iniciar a Aplicação

### 1. No terminal, execute:

```bash
pnpm dev
```

**Saída esperada:**
```
Server running on http://localhost:3000
```

### 2. Teste no navegador:

- Abra: `http://localhost:3000`
- Você deve ver a tela de login do Financeiro DANADO

---

## PASSO 6: Configurar Acesso de Rede Local

### 1. Encontre o IP da máquina servidor:

**No CMD, execute:**
```bash
ipconfig
```

**Procure por:**
```
Ethernet adapter Ethernet:
   IPv4 Address. . . . . . . . . . : 192.168.X.X
```

**Anote este IP (ex: 192.168.1.100)**

### 2. Nas máquinas clientes, acesse:

```
http://192.168.1.100:3000
```

**Substitua `192.168.1.100` pelo IP real da máquina servidor**

---

## PASSO 7: Testar Sincronização

### 1. Abra em 2 navegadores diferentes:

- **Navegador 1:** http://192.168.1.100:3000
- **Navegador 2:** http://192.168.1.100:3000

### 2. Faça uma alteração no Navegador 1:

- Vá para "Caixa 1"
- Adicione um valor em "Dinheiro"
- Clique em "Salvar"

### 3. Verifique no Navegador 2:

- O valor deve aparecer em ~5 segundos automaticamente
- **Se não aparecer:** Atualize a página (F5)

---

## Troubleshooting

### Erro: "Can't connect to MySQL server"

**Solução:**
1. Verifique se MariaDB/MySQL está rodando:
   - Abra "Serviços" (Services.msc)
   - Procure por "MariaDB" ou "MySQL"
   - Status deve ser "Executando"

2. Se não estiver rodando:
   - Clique com botão direito
   - Clique em "Iniciar"

### Erro: "Access denied for user 'root'"

**Solução:**
1. Verifique a senha no arquivo `.env`
2. Teste a conexão manualmente:
   ```bash
   mysql -u root -p -h localhost
   ```
3. Se não funcionar, resete a senha:
   - Pare o serviço MariaDB
   - Reinicie com `--skip-grant-tables`
   - Resete a senha

### Erro: "Port 3000 already in use"

**Solução:**
1. Encontre o processo usando a porta 3000:
   ```bash
   netstat -ano | findstr :3000
   ```

2. Mate o processo:
   ```bash
   taskkill /PID [PID_NUMBER] /F
   ```

### Dados não sincronizam entre máquinas

**Solução:**
1. Verifique se todas as máquinas estão na mesma rede
2. Teste ping entre máquinas:
   ```bash
   ping 192.168.1.100
   ```
3. Verifique firewall do Windows:
   - Adicione exceção para porta 3000

---

## Próximos Passos

1. ✅ Instalar MySQL/MariaDB
2. ✅ Configurar banco de dados
3. ✅ Configurar aplicação
4. ⏳ Remover localStorage (Fase 2)
5. ⏳ Implementar polling automático (Fase 3)
6. ⏳ Testar com 5 máquinas (Fase 4)

---

## Suporte

Se encontrar problemas:
1. Verifique o arquivo de log: `server.log`
2. Verifique o console do navegador (F12)
3. Verifique se o banco de dados está rodando

