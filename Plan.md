## Plan: Popup Minimalista + Sidepanel Central

Transformar o popup em um launcher enxuto com foco em ação imediata (ligar/desligar + abrir painel lateral + status breve de legendas) e consolidar todo gerenciamento de aprendizagem no sidepanel (vocabulário, estatísticas, configurações e exportações). A abordagem reduz duplicidade de UI/lógica, evita estados divergentes e simplifica o modelo mental do usuário durante o consumo de vídeo.

**Steps**
1. Fase 1 — Definição de escopo e contratos de UI
1.1. Congelar o escopo do popup para 3 elementos: toggle de ativação, botão de abrir sidepanel, bloco de status de legendas.
1.2. Confirmar exclusões explícitas do popup: estatísticas, lista de vocabulário, exportação CSV, transferência de dados, demais configurações (idioma, fonte de definições, pinyin, tradução, autopause).
1.3. Preservar o sidepanel como fonte única para gestão (sem mover lógica para background).
2. Fase 2 — Simplificação estrutural do popup (depende da Fase 1)
2.1. Reduzir marcação de popup para header compacto + seção de toggle + seção de status + CTA abrir sidepanel em [src/popup.html](src/popup.html).
2.2. Remover IDs/containers órfãos hoje usados por stats, export e vocab, para prevenir listeners quebrados em runtime.
2.3. Enxugar estilos para a nova estrutura minimalista em [src/popup.css](src/popup.css), mantendo consistência visual com o sidepanel.
3. Fase 3 — Simplificação de lógica do popup (depende da Fase 2)
3.1. Refatorar [src/popup.js](src/popup.js) para manter apenas: carregamento/salvamento de enabled, abertura do sidepanel e carregamento/poll do status de legendas.
3.2. Remover handlers e polling de funcionalidades migradas: GET_STATS, GET_ALL_WORDS, GET_LOOKUP_STATUS no popup, EXPORT_CSV, EXPORT_DATA, IMPORT_DATA e seus listeners/UI feedback.
3.3. Manter listener de SETTINGS_CHANGED somente para refletir enabled no toggle (e remover sincronizações de campos excluídos).
3.4. Garantir que nenhum acesso DOM seja feito para elementos removidos (evitar null dereference ao abrir popup).
4. Fase 4 — Centralização e validação funcional do sidepanel (paralelo com Fase 3.2, converge antes da verificação final)
4.1. Validar que sidepanel já cobre completamente gestão: stats, filtros, busca, settings, export CSV e import/export dados em [src/sidepanel.html](src/sidepanel.html) e [src/sidepanel.js](src/sidepanel.js).
4.2. Opcional de UX: ajustar tab inicial para settings quando abertura vier do popup (somente se a equipe desejar fluxo direto de configuração).
4.3. Garantir continuidade dos fluxos de salvar configurações via SAVE_SETTINGS e sincronização por SETTINGS_CHANGED.
5. Fase 5 — Limpeza de consistência textual/documental (depende da Fase 3)
5.1. Atualizar título/descrição do popup e possíveis textos de ajuda para refletir papel de launcher.
5.2. Revisar README se mencionar popup como centro de configurações, apontando sidepanel como hub único.
6. Fase 6 — Verificação e regressão (depende das fases 3 e 4)
6.1. Rodar testes automatizados existentes.
6.2. Executar checklist manual em cenário YouTube ativo para validar UX e ausência de regressões.

**Relevant files**
- [src/popup.html](src/popup.html) — reduzir estrutura para launcher minimalista e manter apenas blocos acordados.
- [src/popup.js](src/popup.js) — remover lógica duplicada de stats/export/vocab/settings detalhadas e manter fluxo mínimo.
- [src/popup.css](src/popup.css) — simplificar estilos para novo layout compacto.
- [src/sidepanel.html](src/sidepanel.html) — confirmar hub único de gestão (stats/config/export/import).
- [src/sidepanel.js](src/sidepanel.js) — confirmar handlers de gestão e sincronização continuam sendo o caminho principal.
- [src/background.js](src/background.js) — apenas referência para contratos de mensagens (sem necessidade de mudança inicial).
- [README.md](README.md) — alinhar documentação de uso, se necessário.

**Verification**
1. Testes automatizados: executar suite do projeto (ex.: npm test) e confirmar sem falhas novas.
2. Popup: abrir ação da extensão e verificar que só existem toggle, status de legendas e botão de abrir sidepanel.
3. Toggle: alternar enabled no popup e validar efeito imediato no comportamento do content script em vídeo YouTube.
4. Sidepanel: abrir via botão do popup e validar presença/funcionamento de stats, vocabulário, filtros, settings e exportações.
5. Persistência: alterar configurações no sidepanel, fechar/reabrir popup e sidepanel, confirmar estado sincronizado via storage.
6. Export/Import: validar exportar CSV, exportar JSON e importar JSON exclusivamente no sidepanel.
7. Regressão de mensagens: monitorar console de popup/sidepanel para garantir ausência de erros por elementos removidos.

**Decisions**
- Incluído no popup: toggle enabled + abrir sidepanel + status de legendas (decisão do usuário).
- Excluído do popup: estatísticas, vocabulário salvo, configurações avançadas e qualquer export/import.
- Hub de gestão único: sidepanel.
- Fora de escopo inicial: mudança de arquitetura de mensagens no background e redesign completo do sidepanel.

**Further Considerations**
1. Recomendação: adicionar microcopy no popup orientando “Gerencie vocabulário e ajustes no Painel Lateral” para reforçar o novo modelo mental.
2. Recomendação: considerar deep-link para abrir sidepanel já na aba Settings quando acionado pelo popup (incremental, não bloqueante).
