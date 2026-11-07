# Byte 35.4C — Aceite LOCAL da base fictícia de treinamento (T01–T10)

**Versão:** primeira versão de Byte 35.4C, a partir do SHA `86d36e5873c59e2e3f86aa280b001f76116ac743`.

**Pré-requisito comum:** o técnico autorizado concluiu o [guia de construção e verificação da base isolada](byte-35-4c-training-database.md), incluindo `make byte354c-training-check`, `make byte354c-training-build`, `make byte354c-training-verify`. Backend LOCAL usa **esse arquivo**; frontend LOCAL aponta para esse backend. Nenhum teste altera `backend/data/app.db`. Idioma da sessão: **Português (Brasil)**. As senhas são fornecidas pelo técnico em LOCAL e não incluídas nas capturas de evidência.

**Registro por teste:** identidade, contexto da Entidade, data/Período/Jornada, passo realizado, resultado observado, evidência sem segredos, e `PASSOU`, `FALHOU` ou `BLOQUEADO`. Só execute escritas explicitamente aprovadas em arquivo **descartável exclusivo**. A assinatura de recibos e a postagem financeira **não fazem parte** destes testes.

## T01 — Criação independente, integridade e repetibilidade (técnico)

**Identidade/contexto:** técnico LOCAL, Terminal, sem login ERS; banco novo. No repositório faça `make byte354c-training-check` e dois builds em nomes distintos, escolhidos no guia. Confira os dois checksums lógicos e use `--verify-only` em cada um. **PASSOU:** hashes iguais, zero violações FK, nenhuma substituição de arquivo, nenhum efeito em `app.db`. **FALHOU:** erro de integridade/duplicação ou hashes diferentes. **BLOQUEADO:** pasta ou ambiente não autorizado. Não peça SQL ou Terminal ao cliente.

## T02 — Recusas de segurança e não destruição (técnico)

**Identidade/contexto:** técnico LOCAL, `make byte354c-training-check`. Confirme que a suíte automatizada verificou recusas de `APP_ENV=production`, `ENV=production`, `app.db`, caminho simbólico, arquivo já existente e alteração posterior da carga; confirme que não há reset e que a verificação é somente leitura. **PASSOU:** todas recusas foram registradas como esperadas, sem mudar o arquivo-sentinela. **FALHOU:** um caminho inseguro aceito. **BLOQUEADO:** suíte não executada. Não reproduza recusas em arquivos reais.

## T03 — Login, Entidade e idioma

**Identidade/contexto:** `ADMIN-A` (`training354c.admin-a@example.test`), Entidade A. Entre pela tela LOCAL, selecione Português (Brasil), confira nome de Helena Costa e Entidade A, abra Pessoas, depois faça logout. Entre em **nova sessão** como `ADMIN-B` (`training354c.admin-b@example.test`), Entidade B; confira Marina Torres e Entidade B. **PASSOU:** ambos entram, contextos separados, termos em português; **FALHOU:** contexto/identidade trocado; **BLOQUEADO:** senha ou frontend ausente.

## T04 — Pessoas, vínculo e privacidade

**Identidade/contexto 1:** `ADMIN-A`, Entidade A; **contexto 2:** `ADMIN-B`, Entidade B, em sessão nova. Em Pessoas, procure Ana Pereira e depois Gisele Nogueira. Em A, Ana aparece e Gisele (exclusiva de B) não aparece; em B, Ana e Gisele aparecem. **Não edite nem crie Pessoa.** **PASSOU:** a mesma Ana está disponível por vínculos legítimos e a Pessoa exclusiva de B não aparece em A; **FALHOU:** exposição de B em A; **BLOQUEADO:** tela indisponível.

## T05 — Jornadas ativas e histórica encerrada

**Identidade/contexto:** `ADMIN-A`, Entidade A, Colaboradores. Localize Carla Lima e a Jornada histórica; leia estado encerrado e saldo de R$0; identifique também a Jornada atual. Depois localize Bruno Almeida, observe o saldo de +R$230. **Não feche, estenda nem liquide.** **PASSOU:** histórico associado à Jornada correta, encerrada com saldo zero e Jornada atual separada; **FALHOU:** saldo herdado de outra Jornada; **BLOQUEADO:** a tela não permite localizar o registro.

## T06 — Plano, direção da substituição e cancelamento

**Identidade/contexto:** `EARN-A` (`training354c.rafael@example.test`), Entidade A, Períodos de Trabalho. Abra **10/11/2026 — Planejamento**: seis linhas sem substituição; use a UI para identificar ✓, Cand., Repl. e Disp. sem gravar. Abra **08/11/2026 — Planejamento**: observe **Bruno → Ana (F)** e **Davi → Carla (L)**, ambos com substituto à esquerda e alvo na linha Repl. **Não altere** a atribuição sem autorização específica. **PASSOU:** dois vínculos diretos corretos, e o outro plano começa sem vínculo; **FALHOU:** relações invertidas, duplicadas, sem persistência; **BLOQUEADO:** papel não tem `planning.update` ou registros ausentes.

## T07 — Trabalho informado e trabalho realizado

**Identidade/contexto:** `EARN-A`, Entidade A. Abra Períodos de Trabalho → **05/11/2026 — Concluído/lançado**. Localize Bruno; compare Setor/Local/Tarefa **informados** com os **reais** (o local real é diferente). Abra **06/11/2026 — Planejamento** e examine a proposta de mesmo código DAY, sem salvá-la nem atualizar padrões futuros. **PASSOU:** histórico mantém os dois conjuntos de atribuição, e a proposta considera o trabalho real com fallback quando apropriado; **FALHOU:** história financeira baseada indevidamente no local real, perda dos valores informados; **BLOQUEADO:** não existe UI para a proposta no estado esperado.

## T08 — Resultado autorizável e segregação de papéis

**Identidade/contexto:** `EARN-A`, Entidade A, período **04/11/2026 — Informado**; entre em Resultados, leia a linha de Bruno, abra formulário e use **Cancelar** sem salvar. Faça logout; entre como `EXP-A` (`training354c.beatriz@example.test`), Entidade A, abra Despesas e uma despesa fictícia já lançada; tente somente navegar, sem corrigir/gravar. **PASSOU:** ganhos e despesas seguem privilégios próprios; **FALHOU:** operador consegue executar ação administrativa de outro papel; **BLOQUEADO:** tela ou permissão de leitura ausente. Escrita real só em arquivo descartável aprovado, fora do teste básico.

## T09 — Recibos nas duas direções, sem aceitação

**Identidades/contextos:** primeiro `COLLAB-A` (`training354c.joao@example.test`) em A para autogestão e leitura; depois `ADMIN-A` em A para consulta de recibos; use também `training354c.elisa@example.test` em A quando a consulta exigir identidade da beneficiária Elisa. Procure a liquidação fictícia de **Elisa** (Entidade paga → Elisa aceita) e de **Fábio** (Fábio paga → Administrador da Entidade aceita); compare as orientações mostradas. **Não clique em Aceitar/Assinar.** **PASSOU:** direções, destinatários e situação pendente corretos; **FALHOU:** aceite atribuído à pessoa errada; **BLOQUEADO:** falta visualização autorizada do recibo, registrar o lado indisponível.

## T10 — Mesma conta, dois Atores e isolamento

**Identidade/contexto:** `SHARED` (`training354c.camila@example.test`), Pessoa Ana, **mesma sessão e mesma conta**; selecione Entidade A, abra sua Jornada e Conta Corrente conforme permissões. Selecione Entidade B no seletor; confira Jornada distinta e **nenhum** histórico financeiro de A. Volte a A e confira que os dados de B não ficaram indevidamente em cache. Faça logout. **PASSOU:** uma conta, dois Atores, dois vínculos; nenhum dado financeiro de A aparece em B; **FALHOU:** vazamento entre Entidades ou confusão de Ator; **BLOQUEADO:** a UI não mostra o contexto B ou faltam permissões para comparar, indicar ponto exato.

## Encerramento

Interrompa apenas os processos de frontend/backend iniciados para estes testes e confirme a liberação da porta 8080; não encerre servidores ou containers alheios. Não apague automaticamente o banco; use um novo nome para outra sessão de treinamento. Registre a disposição do arquivo e a evidência sem dados/senhas de usuário. **Promotion gate:** `make local-check`, CI do SHA final, T01–T10, e os exercícios F01–F12 necessários devem passar; ausências são **BLOQUEADO**, nunca aprovação implícita.

## Glossary impact

Nenhuma redefinição: Entidade, Pessoa, Vínculo com a Entidade, Ator da Entidade, Jornada, Recibo e dados fictícios conservam significados existentes. Acrescentar somente o termo operacional **Banco de Treinamento Fictício** ao glossário de treinamento, não ao esquema/API.
