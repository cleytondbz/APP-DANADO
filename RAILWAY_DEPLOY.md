# Deploy (Railway primeiro, Render também pronto)

Este projeto já está preparado para os dois:

- Railway: `railway.json`
- Render: `render.yaml`

## 1) Railway (recomendado para começar)

### 1.1 Subir no GitHub
```bash
git add .
git commit -m "deploy: railway + render ready"
git push
```

### 1.2 Criar projeto no Railway
1. Acesse [railway.app](https://railway.app)
2. `New Project` -> `Deploy from GitHub Repo`
3. Selecione este repositório

### 1.3 Configurar variáveis
No serviço web, em `Variables`, adicione:

```env
NODE_ENV=production
DATA_FILE=/data/data.json
```

### 1.4 Configurar volume persistente (obrigatório)
No Railway, adicione um **Volume** e monte em:

```text
/data
```

Sem volume persistente, seus dados podem resetar após restart/deploy.

### 1.5 Deploy
O Railway vai executar:
- build: `npm ci && npm run build`
- start: `npm run start`

Ao final, você recebe uma URL pública HTTPS.

---

## 2) Render (já configurado também)

`render.yaml` já está pronto.  
Se quiser usar Render depois:

1. Crie um `Web Service` apontando para este repo
2. O Render lerá `render.yaml`
3. Garanta persistência de dados (disco/volume conforme plano)

---

## 3) App Android (visualizador)

Depois do deploy, o app Android deve usar a URL pública do Railway.

Exemplo:
```text
https://seu-app.up.railway.app
```

Para visualizador, o ideal é usar rotas read-only mobile:
- `/mobile/dashboard`
- `/mobile/fechamento`
- `/mobile/compras`

---

## 4) Checklist rápido

- [ ] Projeto no Railway criado
- [ ] `NODE_ENV` configurado
- [ ] `DATA_FILE=/data/data.json` configurado
- [ ] Volume montado em `/data`
- [ ] Deploy verde
- [ ] URL abre `/health`
- [ ] URL abre app normal

