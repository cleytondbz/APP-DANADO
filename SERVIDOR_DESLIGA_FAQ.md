# FAQ: O que Acontece se o Servidor Desligar?

## 1️⃣ SE O SERVIDOR DESLIGAR, PERCO TUDO OU APENAS LIGO NOVAMENTE?

### Resposta: **NÃO PERDE NADA! Apenas liga novamente.**

**Por quê?**

Todos os dados estão salvos no **banco de dados MySQL** que está armazenado no **disco rígido do servidor**. Quando você desliga e liga novamente:

```
ANTES (Servidor ligado):
┌──────────────────┐
│ Servidor Ligado  │
│ - Node.js        │
│ - MySQL          │
│ - WebSocket      │
└──────────────────┘
     ↓ (Dados salvos no disco)
┌──────────────────┐
│ Disco Rígido     │
│ - Banco de Dados │
│ - Arquivos       │
└──────────────────┘

DEPOIS (Servidor desligado):
┌──────────────────┐
│ Servidor Desligado│ ← Tudo apagado da RAM
└──────────────────┘
     ↓ (Dados AINDA estão no disco)
┌──────────────────┐
│ Disco Rígido     │
│ - Banco de Dados │ ← DADOS INTACTOS!
│ - Arquivos       │
└──────────────────┘

DEPOIS (Servidor ligado novamente):
┌──────────────────┐
│ Servidor Ligado  │
│ - Node.js        │
│ - MySQL          │
│ - WebSocket      │
└──────────────────┘
     ↓ (Carrega dados do disco)
┌──────────────────┐
│ Disco Rígido     │
│ - Banco de Dados │
│ - Arquivos       │
└──────────────────┘
     ↓ (Tudo restaurado!)
Todos os dados aparecem normalmente
```

### Cenários:

**Cenário 1: Desligar normalmente**
```
1. Você desliga o servidor
2. MySQL salva tudo no disco
3. Servidor desliga
4. Você liga novamente
5. MySQL carrega dados do disco
6. Tudo funciona normalmente ✅
```

**Cenário 2: Queda de energia**
```
1. Queda de energia (sem aviso)
2. Servidor desliga abruptamente
3. MySQL pode estar salvando dados
4. Você liga novamente
5. MySQL verifica integridade do banco
6. Se houver problema, recupera automaticamente ✅
```

**Cenário 3: Erro no programa**
```
1. Programa Node.js trava
2. Servidor fica offline
3. Dados já estão salvos no MySQL ✅
4. Você reinicia o programa
5. Tudo continua lá ✅
```

---

## 2️⃣ TEREI ACESSO AOS ARQUIVOS DO SITE NO SERVIDOR?

### Resposta: **SIM! Você terá acesso total.**

**Onde estão os arquivos:**

```
C:\Users\[SeuUsuário]\financeiro-danado\
├── client/                    ← Frontend (React)
├── server/                    ← Backend (Node.js)
├── drizzle/                   ← Migrações do banco
├── .env                       ← Configurações
├── package.json               ← Dependências
└── ... outros arquivos
```

**O que você pode fazer:**

✅ **Editar arquivos:**
- Abrir em editor de texto (VS Code, Notepad++)
- Modificar configurações
- Adicionar novas funcionalidades

✅ **Fazer backup:**
- Copiar pasta inteira para pendrive/nuvem
- Fazer backup automático

✅ **Restaurar:**
- Se algo der errado, restaurar do backup

✅ **Compartilhar:**
- Enviar para outro PC
- Clonar em outro servidor

---

## 3️⃣ SERÁ SALVO ALGUMA COISA NA PASTA DO SERVIDOR?

### Resposta: **SIM! Vários arquivos importantes.**

**O que será salvo:**

```
C:\Users\[SeuUsuário]\financeiro-danado\
│
├── .env                       ← Configurações (IMPORTANTE!)
│   └── DATABASE_URL, senhas, etc
│
├── drizzle/                   ← Migrações do banco
│   └── migrations/
│       └── 0001_init.sql      ← Estrutura do banco
│
├── node_modules/              ← Dependências (grande!)
│   └── ~500MB de código
│
├── dist/                       ← Código compilado
│   └── Versão pronta para rodar
│
├── .manus-logs/               ← Logs do servidor
│   ├── devserver.log
│   ├── browserConsole.log
│   └── networkRequests.log
│
└── dev.db (se usar SQLite)    ← Banco de dados local
    └── Todos os dados
```

**Banco de Dados MySQL (MAIS IMPORTANTE):**

```
C:\Program Files\MariaDB\data\
└── financeiro_danado/
    ├── caixa_entries.ibd      ← Dados do Caixa
    ├── fechamento_entries.ibd ← Dados do Fechamento
    ├── lancamentos.ibd        ← Dados de Lançamentos
    ├── settings.ibd           ← Configurações
    └── ... outras tabelas
```

**Resumo do que é salvo:**

| Arquivo | Tamanho | Importância | Backup? |
|---------|---------|-------------|---------|
| `.env` | <1KB | ⭐⭐⭐ CRÍTICO | Sim |
| `node_modules/` | ~500MB | ⭐ Pode reinstalar | Não |
| `dist/` | ~50MB | ⭐ Pode recompilar | Não |
| `drizzle/migrations/` | <1MB | ⭐⭐⭐ CRÍTICO | Sim |
| MySQL `data/` | ~100MB | ⭐⭐⭐ CRÍTICO | Sim |
| `.manus-logs/` | ~10MB | ⭐ Opcional | Não |

---

## 4️⃣ QUAIS PROGRAMAS PRECISO INSTALAR NO SERVIDOR?

### Resposta: **Apenas 2 programas! Muito simples.**

**Programas necessários:**

| Programa | Versão | Tamanho | Tempo Instalação | Custo |
|----------|--------|--------|------------------|-------|
| **Node.js** | 20+ LTS | ~200MB | 5 min | Gratuito |
| **MariaDB** | 10.6+ | ~500MB | 10 min | Gratuito |

**Total:** ~700MB + 15 minutos

### Instalação Passo a Passo:

#### PASSO 1: Instalar Node.js

1. Acesse: https://nodejs.org/
2. Baixe "LTS" (versão estável)
3. Execute o instalador
4. Clique "Next" → "Next" → "Install"
5. Reinicie o PC

**Verificar instalação:**
```bash
node --version
npm --version
```

#### PASSO 2: Instalar MariaDB

1. Acesse: https://mariadb.org/download/
2. Baixe "Windows (MSI installer)"
3. Execute o instalador
4. Configure senha root
5. Clique "Install"

**Verificar instalação:**
```bash
mysql -u root -p
```

#### PASSO 3: Instalar Dependências do Projeto

```bash
cd C:\Users\[SeuUsuário]\financeiro-danado
pnpm install
```

**Pronto! Tudo instalado.**

---

## 5️⃣ VAI SER TRABALHOSO INSTALAR TUDO?

### Resposta: **NÃO! Muito simples. ~30 minutos total.**

**Processo completo:**

```
1. Instalar Node.js         → 5 minutos
2. Instalar MariaDB         → 10 minutos
3. Configurar banco dados   → 5 minutos
4. Instalar dependências    → 10 minutos
5. Iniciar servidor         → 1 minuto
─────────────────────────────────────
TOTAL                       → 31 minutos
```

**Depois disso, você NUNCA precisa instalar novamente.**

Você apenas:
- Liga o servidor (1 clique)
- Acessa via navegador
- Tudo funciona automaticamente

---

## 6️⃣ COMO INICIAR O SERVIDOR DEPOIS DE DESLIGAR?

### Muito simples! Apenas 2 passos:

**Passo 1: Abra o Prompt de Comando**
```bash
cd C:\Users\[SeuUsuário]\financeiro-danado
```

**Passo 2: Execute o comando**
```bash
pnpm dev
```

**Pronto! Servidor está rodando.**

Saída esperada:
```
Server running on http://localhost:3000
WebSocket listening on ws://localhost:3001
Database connected ✓
```

---

## 7️⃣ POSSO AUTOMATIZAR PARA INICIAR SOZINHO?

### Resposta: **SIM! Existem 3 formas:**

#### Opção A: Criar Atalho no Inicialização (Mais fácil)

1. Crie um arquivo `iniciar-servidor.bat`:
```batch
@echo off
cd C:\Users\[SeuUsuário]\financeiro-danado
pnpm dev
pause
```

2. Coloque na pasta "Inicialização":
```
C:\Users\[SeuUsuário]\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\
```

3. Pronto! Servidor inicia automaticamente ao ligar o PC

#### Opção B: Usar PM2 (Profissional)

```bash
npm install -g pm2
pm2 start "pnpm dev" --name "financeiro-danado"
pm2 startup
pm2 save
```

Agora servidor inicia automaticamente e reinicia se travar.

#### Opção C: Usar Windows Task Scheduler

Agendar para iniciar em horário específico.

---

## 8️⃣ RESUMO FINAL

| Pergunta | Resposta |
|----------|----------|
| **Se desligar, perco tudo?** | ❌ Não, tudo está no disco |
| **Terei acesso aos arquivos?** | ✅ Sim, pasta completa |
| **Será salvo na pasta do servidor?** | ✅ Sim, banco de dados + arquivos |
| **Quais programas preciso?** | ✅ Node.js + MariaDB (2 programas) |
| **Vai ser trabalhoso?** | ❌ Não, ~30 minutos total |
| **Como reiniciar?** | ✅ 1 comando: `pnpm dev` |
| **Posso automatizar?** | ✅ Sim, 3 formas diferentes |

---

## 9️⃣ CHECKLIST DE SEGURANÇA

✅ **Fazer backup regularmente:**
```bash
# Backup automático todo domingo
# Copiar pasta para pendrive/nuvem
```

✅ **Monitorar logs:**
```bash
# Verificar se há erros
cat .manus-logs/devserver.log
```

✅ **Testar recuperação:**
```bash
# 1x por mês, simule uma falha
# Desligue o servidor
# Ligue novamente
# Verifique se tudo funciona
```

✅ **Manter backups em 2 locais:**
- 1 pendrive na empresa
- 1 na nuvem (Google Drive, OneDrive)

---

## 🔟 PRÓXIMOS PASSOS

1. ✅ Você entendeu tudo?
2. ⏳ Começamos a implementar WebSocket?
3. ⏳ Depois criamos Programa Windows?
4. ⏳ Depois criamos Site Online?

