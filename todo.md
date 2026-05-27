# Financeiro DANADO - TODO

## Dashboard
- [x] Comparação de mês anterior em porcentagem
- [x] Gráfico de comparação de dias com seleção personalizável

## Lançamentos
- [x] Opção de "+ Lançar" contínuo (não fechar aba ao salvar)
- [x] Opção de ativar/desativar fechamento automático
- [x] Categorias com opção "nulo" (não soma nem subtrai)
- [x] Opção para reordenar/mudar ordem das categorias (drag & drop)

## Dívidas
- [x] Opção de editar dívida

## Totais
- [x] Gráfico comparativo diário das duas lojas

## Melhorias Solicitadas
- [x] Corrigir categoria "nulo" para não somar/subtrair
- [x] Melhorar responsividade mobile da tabela de lançamentos
- [x] Adicionar filtro por período (múltiplos meses)
- [x] Melhorar visibilidade da tabela horizontal no mobile (Opção C)

## Concluído
- [x] Upgrade para web-db-user com banco de dados
- [x] API tRPC para sincronização
- [x] Autenticação integrada
- [x] Estrutura básica das telas

## Persistência no Banco de Dados
- [ ] Criar procedures tRPC para CRUD de dados
- [ ] Atualizar AppContext para sincronizar com tRPC
- [ ] Implementar sincronização bidirecional
- [ ] Testar persistência e sincronização


## Novas Funcionalidades Solicitadas
- [x] Seletor de loja na parte superior do header
- [x] Reordenação de categorias com drag & drop na aba de Lançamentos
- [x] Opções de tipos de gráficos (barras, linhas, pizza, área) em todas as abas

## Ajustes Solicitados
- [x] Mover reordenação de categorias para a aba de Lançamentos (na seção de Categorias)00e7\u00e3o de Categorias)


## Bugs Reportados
- [x] Corrigir erro "An unexpected error occurred" ao trocar de abas
- [x] Remover mensagem "Reordenação de categorias em desenvolvimento" e habilitar drag & drop
- [x] Corrigir categoria "Nulo" aparecendo como "Subtrai" no Dashboard


## Novos Ajustes Solicitados
- [x] Corrigir função de reordenação de categorias (setas não estão movendo)
- [x] Corrigir exibição visual de "Nulo" no Dashboard (remover "- Subtrai")
- [x] Aumentar seletor de loja e mover para lado esquerdo
- [x] Remover tela de senha

## Bugs Críticos a Corrigir
- [x] Troca de loja não funciona - clique em Loja 2 não muda a loja
- [x] Mover categoria com setas não funciona - reordenação não está sendo aplicada
- [x] Remover modo escuro - deixar apenas modo claro

- [x] Corrigir aba Totais - categoria "sangria" (nulo) está subtraindo do total

- [x] Remover seção "Visualizar" (Mês, 3M, 6M, 12M) de todas as abas
- [x] Adicionar comparação em porcentagem com mês anterior no Dashboard

- [x] Criar funcionalidade de exportação de relatório em PDF

- [x] Corrigir download do PDF - botão não está baixando o arquivo


## Implementação de Backend com Sincronização
- [x] Criar schema do banco de dados (stores, categories, entries, debts)
- [x] Criar APIs tRPC para CRUD de dados
- [x] Criar instruções de deploy no Railway
- [ ] Atualizar frontend para usar APIs (próximo passo)
- [ ] Testar sincronização entre múltiplos dispositivos (após deploy)


## Categorias Personalizadas
- [x] Adicionar/excluir categorias personalizadas em CAIXA1/2 via Opções
- [x] Adicionar/excluir categorias personalizadas em FECHAMENTO1/2 via Opções

## Documentação Criada
- [x] Guia completo do zero (GUIA_COMPLETO_RAILWAY.md)
- [x] Guia de atualização contínua (GUIA_ATUALIZACOES.md)
- [x] Guia de deploy passo a passo (DEPLOY_PASSO_A_PASSO.md)
- [x] Adicionar PIX nas categorias padrão de CAIXA
- [x] Adicionar PIX nas categorias padrão de FECHAMENTO
- [x] Adicionar PIX na sincronização FECHAMENTO → LANÇAMENTOS (LAN1/LAN2)
- [x] Corrigir sincronização FECHAMENTO → LANÇAMENTOS (usar AppContext saveEntry com mapeamento de Opções)
- [x] DEBUG: Investigar por que FECHAMENTO1 não está sincronizando com LAN1 (problema: chaves snake_case vs camelCase)
- [x] Adicionar inputMode="numeric" em campos de valor de CAIXA e FECHAMENTO
- [x] Corrigir: Categorias dinâmicas de LANÇAMENTOS não aparecem em Opções (sincronização)
- [x] Restaurar totais (sangria, dinheiro, etc) em FECHAMENTO1/2
- [x] Modificar Sangrias (apenas valor) e adicionar Estorno/Despesas (com descrição) em FECHAMENTO
- [x] Mover Total de Vendas para cima de Sangrias em FECHAMENTO
- [x] Corrigir bug de adição de Estorno/Despesas
- [x] Implementar navegação por Enter em Sangrias e Estorno/Despesas
- [ ] Adicionar hora (hh:mm) embaixo do ícone excluir em CAIXA1/2
- [ ] Remover calendário com semana da data
- [ ] Trocar 'RESUMO' para 'FECHAMENTO'
- [ ] Corrigir modo escuro em Opções

## Novas Solicitações
- [x] Adicionar ícone de calendário em CAIXA1/2 para visualizar relatórios de outro dia
- [x] Melhorar navegação com Enter em campos Dinheiro/PIX/Cartão (passar para próximo, voltar para descrição ao adicionar)
- [x] Corrigir formatação de casas decimais em FECHAMENTO1/2 (remover zeros desnecessários)

## Problemas Identificados (Sessão Atual)
- [x] Sincronização incorreta de datas: mudar data em CAIXA1/2 apenas para visualizar está sincronizando com LAN1/2
- [x] Sincronização não deveria ocorrer ao apenas navegar entre datas (sem fazer alterações)
- [x] Casas decimais ainda com problema - valores aparecem com muitos zeros (ex: 1099.10000000000001)

## Novas Alterações (Sessão Atual)
- [x] Proteger navegação de datas em CAIXA1/2 com senha (2513089)
- [x] Criar diálogo de senha ao clicar em próxim## Novas Alteracoes (Sessao Atual - Protecao de Datas)
- [x] Adicionar opcao em OPCOES para controlar protecao de datas (sem protecao / protecao por dia / protecao por mes)
- [x] Integrar configuracao de protecao com a navegacao de datas em CAIXA
- [x] Adicionar opcao para alterar cor dos labels de valores individuais dentro dos graficos (ex: 5.080,80)
- [x] Corrigir cor do tooltip em graficos - aplicar labelStyle corretamente ao texto do valor flutuante
- [x] Aplicar CustomTooltip com cores configuráveis à aba TOTAIS
- [x] Criar aba compacta de fechamento entre Lançamentos e Dívidas (sincronizada com dados de fechamento)
- [x] Adicionar Total de Vendas e Total de Sangria na aba Fechamento Compacto
- [x] Remover validação de senha na navegação de datas em Fechamento Compacto
- [x] Compactar e centralizar layout do Fechamento Admin (reduzir expansão lateral)
- [x] Criar sistema de usuários com senhas específicas no AppContext
- [x] Adicionar interface de gerenciamento de usuários em OPÇÕES
- [x] Integrar validateActionPassword nas ações críticas (excluir, editar, trocar datas)
- [x] Testar validação de senha com usuários criados em OPÇÕES
- [x] Integrar validateActionPassword com permissão 'changeDate' na navegação de datas em Caixa1/2
- [x] Criar relatório de acessos em OPÇÕES (tentativas bem-sucedidas e com falha)
- [x] Corrigir validação de senha para trocar datas em CaixaTab com usuários de ação
- [x] Corrigir registro de nome do usuário em Editar e Deletar no log de acessos
- [x] Adicionar relatório simples de acessos do dia ao lado do Fechamento Admin (edit/delete apenas)
- [x] Corrigir layout do Fechamento Admin no celular - relatório de acessos está tomando prioridade
- [x] Adicionar inputMode="numeric" em campos de senha e valores para mostrar apenas números no teclado
- [x] Fixar cabeçalho da tabela de Lançamentos ao fazer scroll
- [x] Remover opções de "Alterar Senha - VENDAS" e "Alterar Senha - CAIXA" de OPÇÕES
- [x] Remover palavra "Fechamento" do header
- [x] Remover CNPJ, ícone de loja e "Loja 1" duplicado do header - deixar apenas "Loja 1" azul
- [x] Aumentar altura das linhas da tabela de Lançamentos para ocupar mais espaço vertical
- [x] Adicionar opção de mudar senha de usuários de ação em OPÇÕES
- [x] Restaurar botão de atalho para CAIXA no header
- [x] Adicionar opção para alterar cor do card "Total do Mês" no Dashboard em OPÇÕES
- [x] Remover sistema de rolagem/scroll da aba de Lançamentos 1/2 - deixar cabeçalho em azul
- [x] Adicionar sistema de backup e restauração de configurações em OPÇÕES
- [x] Criar sistema bidirecional entre Fechamento 1/2 e Lançamentos 1/2
- [x] Alterar resumo por categoria no Dashboard - remover "+ soma", "- subtrai", "nulo" e mostrar apenas porcentagem vs mês anterior
- [x] Remover sincronização automática bidirecional que está causando conflitos
- [x] Adicionar botão de confirmação em Lançamentos 1/2 para enviar valores para Fechamento 1/2 por dia
- [x] Implementar sincronização automática de Fechamento 1/2 para Lançamentos 1/2
- [x] CRíTICO: Corrigir persistência de Dinheiro, PIX, Cartão e Boleto em Fechamento 1/2 - valores não salvam no localStorage
- [x] CRÍTICO: Sincronização não está enviando total de despesas para Lançamentos 1/2
- [x] CRÍTICO: Fechamento Admin não está subtraindo Sangria e Despesas do Saldo em Dinheiro
- [x] CRÍTICO: Restaurar sincronização de CAIXA 1/2 para FECHAMENTO 1/2 - totais de Dinheiro, PIX, Cartão, Boleto

## Novas Funcionalidades Implementadas (Sessão Atual)
- [x] Adicionar clique na linha de dia para editar lançamentos em LAN1
- [x] Testar edição de lançamentos - UI atualiza imediatamente
- [x] Testar persistência de dados após F5 (atualizar página)
- [x] Testar clique em qualquer lugar da linha para abrir modal de edição
- [x] Testar carregamento de valores anteriores no modal de edição


## PENDÊNCIA 1: Categorias Dinâmicas em Anotações (Caixa 1/2)
- [ ] Refatorar CaixaTab para suportar categorias dinâmicas adicionadas em Opções
- [ ] Novas categorias devem aparecer como colunas ao lado das 4 padrões (Dinheiro, PIX, Cartão, Boleto)
- [ ] Permitir editar nomes das categorias (inclusive as padrões)
- [ ] Adicionar scroll horizontal se necessário
- Estimativa: 30-45 minutos

## PENDÊNCIA 2: Adicionar Setas de Navegação em Fechamento 1/2
- [ ] Adicionar botões de seta (ChevronLeft e ChevronRight) para navegar entre datas em Fechamento 1/2
- [ ] Adicionar proteção por senha para navegação de datas (igual em Caixa 1/2)
- Nota: Tentativas anteriores de adicionar as setas não funcionaram - o código estava presente mas não era renderizado no DOM


## FASE 3: Sincronização Local com MySQL/MariaDB (5 Máquinas Windows 10)

### Fase 1: Configuração do Banco de Dados
- [ ] Criar guia de instalação MySQL/MariaDB no Windows 10
- [ ] Configurar string de conexão para banco local
- [ ] Migrar dados do SQLite para MySQL
- [ ] Testar conexão com banco de dados local

### Fase 2: Remover localStorage e Migrar para API
- [ ] Remover todos os useState que usam localStorage
- [ ] Criar procedures tRPC para CRUD de todos os dados
- [ ] Atualizar AppContext para usar tRPC em vez de localStorage
- [ ] Remover sincronização localStorage entre abas

### Fase 3: Implementar Polling Automático (5 segundos)
- [ ] Criar hook useAutoSync para polling automático
- [ ] Implementar atualização a cada 5 segundos
- [ ] Sincronizar: Caixa 1/2, Fechamento 1/2, Lançamentos, Dashboard, Opções, Totais
- [ ] Adicionar indicador visual de sincronização

### Fase 4: Testar Sincronização Multi-Máquina
- [ ] Testar com 2 máquinas simultâneas
- [ ] Testar com 5 máquinas simultâneas
- [ ] Validar que mudanças aparecem em ~5 segundos
- [ ] Validar que dados não se perdem

### Fase 5: Documentação
- [ ] Criar guia de instalação local (MySQL + Windows 10)
- [ ] Criar guia de configuração de rede local
- [ ] Criar guia de troubleshooting
