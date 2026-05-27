# Android App (Dashboard + Fechamento Compacto)

Este wrapper Android abre a URL online do sistema em modo restrito (`?app=android`), mostrando somente:

- Dashboard
- Fechamento Compacto

## 1) Instalar dependências

```bash
cd android-dashboard-app
npm install
```

## 2) Gerar projeto Android

```bash
npm run cap:add:android
npm run cap:sync
```

## 3) Abrir no Android Studio

```bash
npm run cap:open
```

Depois, no Android Studio, faça build do APK.

## URL online atual

Configurada em `capacitor.config.ts`:

`https://cuddly-islands-smell.loca.lt/?app=android`

Quando trocar para domínio fixo de produção, altere essa URL e rode:

```bash
npm run cap:sync
```
