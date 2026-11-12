# Byte 35.4C — Aceite dos dados fictícios nos bancos existentes (T01–T10)

**Worktree do desenvolvimento LOCAL:** `~/projects/EnterpriseRemoteSystems-35.4C`. **Branch:** `1055-byte-354c-deterministic-fictitious-training-database`. **SHA de origem:** `b448e4e98c3c5f4bd7ffd1d7d2f029e60ec2b059` (registrar SHA do commit depois de aplicar a correção). **Referência técnica:** [provisionamento aditivo 35.4C](byte-35-4c-training-database.md).

**Contextos:** LOCAL executa o código no worktree 35.4C e utiliza **o mesmo** `backend/data/app.db` do worktree principal `~/projects/EnterpriseRemoteSystems`; DEV e TST usam o **banco persistente já existente** de seu respectivo backend. Não existe banco nem backend paralelo de treinamento. Produção é **proibida**. O responsável técnico escolhe e registra qual ambiente recebeu autorização antes de executar T01–T10. Para cada teste, anote ambiente, identidade, Entidade, passos executados, observado versus esperado, evidência sem segredos e **PASSOU / FALHOU / BLOQUEADO**. Não substitua identidade de um teste por APP.

## T01 — Preservação, determinismo e repetição (técnico)

**Identidade:** operador técnico autorizado; **contexto:** ambiente selecionado, sem login ERS. **Passos:** (1) registrar ambiente, revisão, identidade do banco/volume e autorização; (2) executar `make byte354c-training-check` no worktree; (3) realizar provisionamento conforme o guia técnico, no banco **já existente**; (4) executar `--verify-only` ou `make byte354c-training-verify-local` **antes de login**; (5) repetir somente o comando de provisionamento; (6) conferir que informa `already present; no writes`. **PASSOU:** checksum da carga inicial igual entre instâncias isoladas de teste, nenhuma duplicata, nenhuma alteração nos dados que não pertencem à carga, FK e integridade corretos. **FALHOU:** outro banco criado/substituído, dados operacionais modificados, hash divergente ou erro silencioso. **BLOQUEADO:** autorização, migrações ou credenciais ausentes. Não execute comandos de reset, restauração ou exclusão.

## T02 — Recusas e rollback (técnico)

**Identidade:** operador técnico; **contexto:** somente regressão isolada, nunca base real de produção. **Passos:** (1) confirmar o resultado de `make byte354c-training-check`; (2) revisar no log as recusas automáticas de APP_ENV=production, confirmação divergente, caminho ausente/simbólico, colisão de ID e carga já alterada; (3) confirmar que a suíte inspecionou o estado pós-rollback e deixou intacta a Entidade preexistente. **PASSOU:** todos os testes negativos bloqueiam a operação indevida e nenhum banco de trabalho é usado pela suíte. **FALHOU:** qualquer gravação parcial ou aceitação de Produção. **BLOQUEADO:** suíte não executada. Não reproduza casos negativos em ambientes implantados.

## T03 — Login, contexto e idioma

**Identidade/contexto inicial:** ADMIN-A (`training354c.admin-a@example.test`), Entidade A, no ambiente autorizado. **Passos:** (1) abrir a aplicação normal desse ambiente (HTTP LOCAL ou HTTPS DEV/TST); (2) escolher Português (Brasil); (3) entrar com a senha aprovada daquela identidade; (4) confirmar **Helena Costa** e **Entidade A**, abrir Pessoas; (5) sair e abrir **nova sessão** como ADMIN-B (`training354c.admin-b@example.test`); (6) confirmar **Marina Torres** e **Entidade B**. **PASSOU:** contas operam no contexto correto, sem Entidades misturadas, rótulos em pt-BR. **FALHOU:** identidade ou contexto incorreto. **BLOQUEADO:** credenciais indisponíveis ou frontend indisponível.

## T04 — Pessoa global, vínculos e privacidade

**Identidades:** ADMIN-A na Entidade A e ADMIN-B na Entidade B, cada qual em sessão separada. **Passos:** (1) como ADMIN-A, abrir Pessoas, pesquisar **Ana Pereira** e depois **Gisele Nogueira**; (2) confirmar que Ana aparece, Gisele não; (3) sair; (4) entrar como ADMIN-B, abrir Pessoas e repetir as duas pesquisas; (5) confirmar Ana e Gisele em B. **Não editar Pessoa.** **PASSOU:** a mesma Pessoa global Ana tem vínculos separados; Gisele não é visível em A. **FALHOU:** vazamento de informação entre Entidades. **BLOQUEADO:** lista indisponível ou filtro sem funcionamento.

## T05 — Jornadas e saldo histórico

**Identidade/contexto:** ADMIN-A, Entidade A; menu Colaboradores. **Passos:** (1) localizar **Carla Lima**; (2) abrir o histórico de Jornadas; (3) confirmar Jornada anterior encerrada com saldo BRL zero e Jornada atual separada; (4) localizar **Bruno Almeida** e ler o saldo ilustrativo de **+R$230**; (5) voltar à lista, sem alterar qualquer registro. **PASSOU:** nenhuma herança de saldo entre Jornadas; histórico e situação atual visíveis. **FALHOU:** saldo transferido ou histórica incorreta. **BLOQUEADO:** dados ou controles de histórico ausentes.

## T06 — Planejamento, substituições e cancelamento

**Identidade/contexto:** EARN-A (`training354c.rafael@example.test`), Entidade A; Períodos de Trabalho. **Passos:** (1) abrir **10/11/2026 — Planejamento**, conferir seis atribuições **sem substituição**; (2) observar ✓, Cand., Subst. e Disp.; (3) abrir **08/11/2026 — Planejamento**; (4) conferir substitutos **Bruno → Ana (Folga)** e **Davi → Carla (Licença)**, onde Bruno/Davi substituem Ana/Carla, respectivamente; (5) cancelar qualquer formulário aberto **sem salvar**. **PASSOU:** relações na direção correta, nenhum lançamento novo. **FALHOU:** direção invertida, linhas duplicadas ou escrita não autorizada. **BLOQUEADO:** papel sem navegação/permissão de leitura.

## T07 — Trabalho informado e efetivo

**Identidade/contexto:** EARN-A, Entidade A. **Passos:** (1) abrir **05/11/2026 — Período concluído**; (2) selecionar Bruno, comparar Setor/Local/Tarefa informados e os efetivamente trabalhados; (3) confirmar que o Local efetivo difere do informado, sem alterar remuneração histórica; (4) abrir **06/11/2026 — Planejamento**; (5) examinar a proposta de transporte do trabalho realizado anterior, sem aceitar ou salvar. **PASSOU:** informação original e dados reais mantidos e distinguíveis. **FALHOU:** perda do plano original ou alteração financeira indevida. **BLOQUEADO:** UI ou registros ausentes.

## T08 — Segregação de Ganhos e Despesas

**Identidades/contextos:** EARN-A e EXP-A (`training354c.beatriz@example.test`), Entidade A, em sessões separadas. **Passos:** (1) como EARN-A, abrir **04/11/2026 — Informado**, Resultados de Bruno, abrir formulário e **Cancelar**; (2) sair; (3) como EXP-A, abrir Despesas, localizar uma despesa fictícia existente e inspecionar somente leitura; (4) confirmar ausência de funções de Ganhos que o papel não permite. **PASSOU:** direitos de Ganhos/Despesas diferenciados e nenhum dado novo gravado. **FALHOU:** permissão alheia ou gravação indevida. **BLOQUEADO:** role grant ou página indisponível.

## T09 — Recibos em ambas direções (sem aceitação)

**Identidades/contextos:** ADMIN-A e, caso a UI exija, Elisa (`training354c.elisa@example.test`), cada qual na Entidade A e em sessão própria. **Passos:** (1) como ADMIN-A, abrir Recibos/Conta Corrente conforme menu permitido; (2) localizar recibo de **Elisa**, pagamento da Entidade à Colaboradora; (3) confirmar que **Elisa** é a pessoa que deve aceitar; (4) localizar recibo de **Fábio**, pagamento do Colaborador à Entidade; (5) confirmar que o **Administrador da Entidade** é quem deve aceitar; (6) quando necessário, entrar como Elisa apenas para consultar o seu recibo; (7) sair. **Não clicar Aceitar/Assinar.** **PASSOU:** direções e aceitantes corretos, status pendente. **FALHOU:** aceitante incorreto. **BLOQUEADO:** falta permissão de consulta, registrar a tela indisponível.

## T10 — Uma conta, dois Atores, duas Entidades

**Identidade/contexto:** SHARED (`training354c.camila@example.test`), Pessoa **Ana Pereira**, uma conta autenticada. **Passos:** (1) entrar, selecionar Entidade A, localizar sua Jornada e consultar Conta Corrente; (2) registrar saldo ilustrativo de **+4 g** de ouro; (3) sem sair, selecionar Entidade B; (4) confirmar Jornada distinta e inexistência do histórico financeiro de A em B; (5) selecionar novamente Entidade A, confirmar ausência de dados B indevidamente retidos; (6) sair. **PASSOU:** mesma Pessoa/conta, dois Atores/vínculos, dados isolados. **FALHOU:** ator herdado ou vazamento entre Entidades. **BLOQUEADO:** contexto B ou consulta indisponível à identidade.

## Encerramento e promoção

A aceitação funcional deve ocorrer **separadamente** nos ambientes aprovados. Não repita provisionamento de DEV/TST via reset ou novo banco. Treinos com escrita podem alterar a carga; o checksum inicial deixará de coincidir e isso não autoriza restaurar automaticamente os registros. Use o procedimento operacional aprovado para planejar eventual repetição, sem tocar dados de outras Entidades.

- **LOCAL:** faça logout e encerre **somente** backend/frontend que você iniciou; confira a porta 8080 se foi usada por esses processos. Não pare processos anteriores ou contêineres alheios.
- **DEV/TST:** preserve os backends existentes. O único contêiner criado neste procedimento é o auxiliar temporário `ers-byte354c-...` com `--rm`; confirme que não deixou resíduos e remova apenas o ID registrado se necessário.
- **Todas as etapas:** registe `PASSOU`, `FALHOU` ou `BLOQUEADO`, revisão final de Git, controle de ambiente, evidências sem senhas/hashes, `make local-check` e CI. O aceite T01–T10 **não** substitui os gates 35.5/35.7.

## Glossary impact

Adicionar *Provisionamento Aditivo de Dados Fictícios de Treinamento* ao glossário operacional e remover a exigência de banco SQLite dedicado. Os conceitos de Entidade, Pessoa, Vínculo, Ator, Jornada, Acúmulo, Conta Corrente e Recibo permanecem inalterados.
