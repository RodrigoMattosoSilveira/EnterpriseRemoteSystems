# ERS — Manual completo de treinamento e operação da Entidade

**Mineração Carará · Byte 35.4A · Edição de treinamento, português do Brasil (`pt-BR`)**

**Público:** Administrador da Entidade, Operador de Ganhos, Operador de Despesas e Colaborador, cada qual dentro de suas próprias permissões. **Finalidade:** aprender a operar o ERS com segurança, compreender consequências e verificar os resultados. **Limite:** este não é um procedimento de implantação, recuperação de banco de dados ou autorização de entrada em Produção.

> **Regra do treinamento:** use somente ambiente não produtivo e registros fictícios aprovados. Nunca mude saldos, autorizações, pagamentos, produção ou Jornadas reais para completar um exercício. Se faltar um registro de exemplo, marque o exercício como **BLOQUEADO** e continue com os demais; não improvise lançamentos financeiros.

Esta edição foi preparada a partir do fluxo implementado no ERS e de suas verificações automatizadas. Os exemplos com **Ana, Bruno, Carla, Davi, Elisa e Fábio** são *histórias didáticas*, não afirmações de que essas Pessoas já estejam cadastradas. A criação de uma base fictícia completa é um trabalho separado de preparação do ambiente de treinamento. No produto, use o nome e o código do registro aprovado pelo responsável; não suponha que os personagens estejam disponíveis.

**Documentos relacionados:** [aceitação funcional e operacional](byte-35-4-manual-acceptance.md), [procedimentos da equipe técnica](byte-35-4-operational-readiness.md), [atribuição informada versus trabalho realizado](byte-35-3-actual-work-location-override.md). Os procedimentos técnicos são destinados à equipe autorizada, **não** aos participantes do treinamento.

## Como estudar este manual

1. Leia os capítulos 01–03 para entender quem você é no sistema e o que é uma Jornada.
2. Estude os capítulos 04 e **05 (Substituições)** antes de tentar planejar uma escala. Eles foram elaborados para responder à pergunta “quem trabalha por quem e em qual linha faço cada ação?”.
3. Percorra os capítulos 06–14 conforme suas permissões; nunca execute um comando apenas porque ele aparece neste manual.
4. Use o capítulo 15 para reconhecer situações de bloqueio, e o 16 como glossário.
5. Execute os exercícios **F01–F12** com identidade e Entidade definidas. Em particular, repita o conjunto **F04-S01 a F04-S08** até conseguir explicar as substituições sem consultar as respostas.
6. Registre, para cada exercício, contexto, registro fictício, resultado observado, **PASSOU / FALHOU / BLOQUEADO**, e eventual evidência sem dados sensíveis. Uma leitura do manual não constitui aceite de treinamento.

**Como ler os passos:** “abrir” e “conferir” são ações de consulta; “salvar”, “informar”, “executar”, “lançar”, “aceitar” e “encerrar” **alteram dados**. Só pratique ações de escrita em cenário expressamente autorizado para isso. Se um botão não estiver visível, confira a identidade e as permissões; nunca conceda a si próprio privilégios para fazer o exercício passar.

---

## Capítulo 01 — A operação da Mineração Carará de ponta a ponta

O ERS acompanha o relacionamento de uma Pessoa com uma Entidade, sua participação como Colaborador, o planejamento do trabalho, o que foi efetivamente executado e as consequências financeiras. As telas representam **etapas distintas**, não várias formas de editar o mesmo registro.

| Momento | Pergunta principal | Onde consultar | O que **não** significa |
|---|---|---|---|
| Identificação | Quem é a Pessoa e em qual Entidade tem acesso? | Pessoas / Autenticação, conforme permissão | Que a mesma Pessoa tenha uma conta nova por Entidade |
| Participação | Em qual Jornada o Colaborador atua? | Colaboradores / Jornada | Que uma Jornada antiga possa receber lançamentos de uma nova |
| Planejamento | Quem está previsto para o Período de Trabalho? | Períodos de Trabalho → Plano | Que o trabalho realmente aconteceu |
| Comunicação | Qual escala foi informada para o turno? | Informar / Imprimir | Que o Colaborador tenha dado aceite eletrônico |
| Apuração | Quem trabalhou, esteve ausente ou foi substituído? | Resultados Reais | Que a atribuição originalmente informada tenha sido reescrita |
| Cálculo | Quais ganhos estão prontos ou pendentes? | Acúmulo | Que uma prévia equivalha a crédito na Conta Corrente |
| Registro financeiro | Qual crédito/débito pertence a qual Jornada? | Conta Corrente | Que os valores em reais e gramas sejam intercambiáveis |
| Liquidação | Quem pagou a quem e quem deve aceitar o Recibo? | Recibos / acerto de Jornada | Que a assinatura seja dispensável quando obrigatória |

Uma rotina típica começa com a Entidade e o Período de Trabalho corretos; somente depois o operador escolhe os Colaboradores e suas atribuições. Para cada ação, faça mentalmente a sequência **contexto → plano → comunicação → realizado → cálculo → histórico**. Se pular uma etapa, a informação que aparecer em outra tela pode estar correta para um estado anterior, e não para o que você imaginou.

### Papéis e limites práticos

- **Administrador da Entidade:** gere operações da própria Entidade dentro das permissões concedidas; pode conferir Pessoas, Colaboradores, Jornada, produção, autorização e lançamentos financeiros quando autorizado.
- **Operador de Ganhos:** trabalha com planejamento, resultados e Acúmulo segundo seus privilégios. A ausência do link administrativo **Produção de Ouro** é esperada quando sua identidade não possui essa permissão; a produção registrada permanece consultável dentro de **Acúmulo**.
- **Operador de Despesas:** acompanha e registra despesas conforme sua autorização. Não recebe por esse motivo privilégios para gerir ganhos ou conceder papéis.
- **Colaborador:** consulta dados próprios e operações pessoais disponíveis; não deve ver Pessoas e Contas Correntes de outros Colaboradores.
- **Administrador da Aplicação:** identidade global para funções centrais. Não é um Colaborador nem substitui a identidade de Administrador de uma Entidade.

As permissões efetivas da sessão determinam os controles apresentados. Um mesmo nome pode aparecer em várias Entidades sem que os dados operacionais e financeiros sejam compartilhados entre elas.

---

## Capítulo 02 — Entrar, verificar a Entidade e navegar

1. Receba do responsável o **endereço de treinamento**, a sua identidade de treinamento e a Entidade autorizada. Confirme que não se trata de Produção.
2. Abra o ERS pelo navegador e entre com sua própria Conta de autenticação. Credenciais são individuais; não faça exercícios como outra Pessoa.
3. Selecione **Português (Brasil)** no controle de idioma. A mudança de idioma altera a apresentação, não os valores do banco de dados.
4. Examine o contexto de Entidade no topo ou no seletor. Se houver mais de uma Entidade autorizada, escolha explicitamente a indicada para o exercício.
5. Antes de abrir uma Pessoa, um Colaborador ou um Período, volte a conferir a Entidade. Os números e nomes podem se repetir entre contextos de teste; o contexto é parte do identificador operacional.
6. Para alternar de identidade, faça **Sair** e entre novamente. Não use duas identidades na mesma sessão.

**Quando o menu não mostra uma opção:** primeiro verifique se você está na Entidade e identidade corretas. Por exemplo, o Operador de Ganhos pode conferir produção no Acúmulo sem visualizar o cadastro administrativo de Produção de Ouro. Falta de menu não é justificativa para obter permissões extras.

**Quando a Pessoa não tem Jornada ativa:** a interface pessoal pode apresentar o aviso de inexistência de espaço de trabalho e permitir apenas informações pessoais e histórico de Conta Corrente em leitura. Isso não cria acesso a outra Entidade.

**Boas práticas de leitura:** títulos de página e código do Período de Trabalho importam mais do que uma posição fixa na navegação. Alguns botões só aparecem quando a sessão possui a permissão e o registro está em um estado editável.

---

## Capítulo 03 — Pessoa, vínculo, Colaborador e Jornada: quatro ideias diferentes

Imagine que **Ana** tenha vínculo com duas Entidades fictícias. Ana continua sendo uma só Pessoa global e utiliza uma única Conta de autenticação. Seus vínculos, sua identidade de autorização e suas Jornadas, entretanto, são específicos de cada Entidade.

| Conceito | Explicação que o operador deve dominar | Erro comum |
|---|---|---|
| Pessoa | Cadastro global da pessoa humana | Duplicar Pessoa ao entrar em outra Entidade |
| Vínculo com a Entidade | Participação da Pessoa naquela organização | Confundir vínculo com permissão para administrar |
| Conta de autenticação | Credencial única de acesso | Criar outra conta para a mesma Pessoa |
| Ator | Identidade/escopo pelo qual permissões são avaliadas | Supor que o papel numa Entidade vale em outra |
| Colaborador | Participante operacional da Entidade | Confundir Colaborador com operador administrativo |
| Jornada | Episódio de relacionamento operacional e financeiro | Misturar saldos de Jornadas diferentes |

### Consultar uma Pessoa com segurança

1. Na Entidade correta, entre em **Pessoas** com uma identidade autorizada.
2. Pesquise a Pessoa fictícia, abra seu cadastro e confira nome, atributos e vínculo visível.
3. Identifique se o exercício é apenas de leitura ou foi autorizado a alterar algum campo.
4. Se precisar explorar o formulário sem alteração aprovada, use **Cancelar** em vez de salvar.
5. Não utilize o cadastro de uma Entidade para inferir vínculos que essa Entidade não tem direito de conhecer.

### Consultar Colaborador e Jornada

1. Abra **Colaboradores**, localize a Pessoa correspondente e selecione o Colaborador da Entidade.
2. Confira estado, datas e Jornada. Se houver várias Jornadas, identifique **qual delas** está aberta.
3. Compare uma Jornada ativa e uma já encerrada **somente se houver um registro encerrado disponível**. Não encerre uma Jornada para fabricar uma amostra.
4. Uma Jornada nova começa com saldo zero. Dívidas e créditos históricos exigem classificação contábil e processo de inicialização próprios; não são “bônus” lançados manualmente.
5. O fechamento exige saldo zero e cumprimento de obrigações, inclusive Recibos, conforme o fluxo específico. Um saldo pendente é uma proteção, não um problema a ser contornado.

### Exemplo de consequência

Ana teve a Jornada J1 encerrada e iniciou J2. A Conta Corrente de J1 continua histórica, mas os ganhos, despesas, acertos e projeções de J2 não devem ser apresentados como se fossem o saldo combinado da vida inteira de Ana.

---

## Capítulo 04 — Período de Trabalho e construção de um plano compreensível

**Objetivo:** montar uma escala coerente **antes de informar o turno**, distinguindo seleção, disponibilidade, candidatura a substituição e atribuições de Setor/Local/Tarefa.

### 04.1 O que identificar antes de editar

Na lista **Períodos de Trabalho**, localize um período autorizado por **data, nome, código de período e horário**. O código distingue tipos de turno e é usado para propor o plano seguinte do mesmo tipo. Não basta encontrar “o turno de hoje”.

Ao abrir o período, você verá as abas **Plano**, **Informar / Imprimir**, **Resultados Reais** e **Acúmulo**. O estado pode ser Planejamento, Informado, Acúmulo aberto, Parcialmente lançado, Totalmente lançado ou Encerrado.

- **Plano:** seleciona participantes, ajusta disponibilidade e atribuições informadas e vincula substituições temporárias.
- **Informar / Imprimir:** revisa e publica/imprime a escala comunicada.
- **Resultados Reais:** registra o que aconteceu, inclusive Setor, Local e Tarefa efetivamente executados.
- **Acúmulo:** calcula e acompanha itens prontos, pendentes e lançados.

No estado **Encerrado**, a edição é bloqueada. Não use período encerrado para um exercício de gravação. A autorização do operador e o estado também controlam a disponibilidade de cada botão.

### 04.2 Entenda a tabela antes de tocar nos campos

| Coluna | Pergunta | Ação / interpretação correta |
|---|---|---|
| **✓** | Esta linha participa do plano? | Marcar/desmarcar inclusão. Não significa presença efetiva. |
| **Cand.** | Esta Pessoa está sendo preparada como substituta? | Marcar **na linha de quem vai trabalhar no lugar de alguém**. Sozinho, não cria vínculo salvo. |
| **Subst.** | Quem será substituído por esta Pessoa? | Escolher, na **linha do substituto**, o afastado em Folga/Licença. É o destino da relação. |
| **Apelido** | De quem é a linha? | Confirme pela Pessoa correta; o botão **Atribuição do Plano** ajusta Setor/Local/Tarefa. |
| **Dias** | Quanto resta até o fim projetado da Jornada? | Indicador, não botão de inclusão. |
| **Disp.** | Qual disponibilidade o planejamento considera? | **A** ativo, **F** folga, **L** licença na interface `pt-BR`. |
| **Setor** | Em que setor está previsto atuar? | Atribuição **informada** para este período. |
| **Local** | Onde está previsto atuar? | Atribuição **informada** para este período. |
| **Tarefa** | O que está previsto executar? | Atribuição **informada** para este período. |

**Atenção às abreviações:** em `pt-BR`, o cabeçalho da terceira coluna é **`Subst.`** (substituição); em `en-US`, é **`Repl.`** (replacement). As opções de disponibilidade exibem **A/F/L** em `pt-BR`; o código interno da Folga é `DAY_OFF` (representado como **D** em inglês). Não procure a letra “D” na interface portuguesa para indicar Folga.

### 04.3 Três decisões independentes na mesma linha

Considere Bruno, com ✓ marcado, disponibilidade A e sem substituição: **Bruno foi incluído no plano e está disponível**, mas ainda não sabemos se trabalhará de fato; isso virá em Resultados Reais. Se a coluna Cand. também estiver marcada, ele **pode ser indicado como substituto**. Se Subst. estiver em “Sem substituição temporária”, **nenhuma substituição foi ligada**, independentemente de Cand.

A seleção ✓ não equivale a Cand. Nem Cand. equivale a Subst. A disponibilidade F/L também não conclui, por si só, que alguém o substitui.

### 04.4 Construção normal do plano, sem substituição

1. Confirme Entidade, data, nome, código e estado do período.
2. Abra **Plano**, limpe filtros que possam esconder linhas, e observe o total exibido de colaboradores, selecionados, candidatos e substituições.
3. Para cada colaborador previsto, marque **✓**, confirme disponibilidade A e examine Setor/Local/Tarefa.
4. Quando necessário, utilize **Atribuição do Plano**, escolha Setor/Local/Tarefa e clique em **Aplicar refinamento**.
5. Mantenha **desmarcada** a opção “Usar estes valores como padrões futuros...” quando o ajuste serve apenas ao turno. Marcá-la modifica também padrões de planejamento da Jornada.
6. Releia as linhas antes de **Salvar plano**. Só esse salvamento envia a atribuição corrente; aplicar refinamento sem salvar o plano não encerra o fluxo.
7. Reabra **Plano** após salvar e compare os dados persistidos com a intenção original.

**Filtros e ordenação:** a busca, os filtros e a ordenação alteram **apenas o que está visível**. Uma linha escondida por filtro ainda pode estar selecionada ou conter alteração pendente; o salvamento usa o estado das linhas, não só as visíveis. Use **Limpar filtros** e **Redefinir ordenação** antes da revisão final. Se o botão estiver desabilitado, verifique estado, permissão e existência de alterações aptas a salvar.

### 04.5 De onde vêm as sugestões do próximo período

Quando ainda não existem atribuições salvas no novo Período de Trabalho, o sistema procura o período anterior mais recente com **o mesmo código**, propondo atribuições para colaboradores aplicáveis. Em uma linha anteriormente incluída cujo resultado foi **Trabalhou**, os valores efetivos de Setor, Local e Tarefa, **quando registrados e ainda válidos**, podem ser propostos individualmente; caso contrário, o valor informado anterior serve de alternativa. Se o novo período já possui atribuições próprias, elas prevalecem: a proposta não reescreve silenciosamente o plano salvo.

Uma substituição pode aparecer como ponto de partida num novo planejamento por herança da proposta; **o vínculo salvo é sempre da atribuição de cada Período**, e deve ser revisado, mantido ou removido pelo planejador. Não interprete uma proposta herdada como obrigação de repetir a substituição nem como alteração permanente do Colaborador.

---

## Capítulo 05 — Substituição de Colaboradores: modelo mental, procedimento e verificação

**Este é o capítulo central para planejar sem confusão.** Leia primeiro o modelo de duas Pessoas. Depois execute o procedimento em um período fictício autorizado. Por fim, resolva os exemplos sem consultar a resposta. Para consulta rápida durante a operação, use também o [Cartão de substituições](byte-35-4a-cartao-substituicoes-pt-br.md).

### 05.1 Uma única frase resolve a direção da relação

**Na linha de quem VAI TRABALHAR, marque `✓`, marque `Cand.` e, em `Subst.`, escolha quem NÃO PODERÁ trabalhar.**

Dito de outra forma: **Bruno substitui Ana** significa que o campo **Subst. da linha de Bruno aponta para Ana**. **Não** se deve abrir Subst. da linha de Ana para escolher Bruno. A linha de Ana registra seu afastamento; a linha de Bruno registra o vínculo de substituição.

O sistema guarda uma relação entre **duas atribuições do mesmo Período de Trabalho**, não uma troca de nomes nos cadastros de Pessoas/Jornadas, e não a transferência automática de salários ou de saldo.

### 05.2 Desenhe na cabeça duas linhas, não uma troca de assentos

Situação didática: Ana estava prevista para o turno, mas entrou em **Folga**. Bruno poderá trabalhar no seu lugar. A escala deve mostrar que **Ana continua sendo Ana**, com afastamento; **Bruno continua sendo Bruno**, trabalhando como substituto.

| Antes de decidir | ✓ | Cand. | Subst. | Disp. | Interpretação |
|---|---|---|---|---|---|
| **Ana** | conforme a escala existente | não | — | A | Prevista, ainda sem folga registrada |
| **Bruno** | conforme a escala existente | não | — | A | Pode estar disponível para ser escalado |

| Depois de preparar a substituição | ✓ | Cand. | Subst. | Disp. | Interpretação |
|---|---|---|---|---|---|
| **Ana (afastada)** | conservar ou ajustar conforme plano autorizado | não | — | **F** | Ana é a **substituída**; precisa de uma atribuição registrada nesse período para ser alvo válido |
| **Bruno (trabalha)** | **sim** | **sim** | **Ana** | **A** | Bruno é o **substituto**; o elo Bruno → Ana está no campo Subst. **de Bruno** |

**Não confunda as colunas:** marcar Cand. na linha de Ana diria que *Ana é candidata a substituir alguém*, o contrário do caso pretendido. Marcar somente ✓ em Bruno o incluiria no plano, mas **não** associaria Bruno ao afastamento de Ana.

### 05.3 O que significam A, F e L no português do ERS

| Letra mostrada em `pt-BR` | Situação | Consequência para a escolha em `Subst.` |
|---|---|---|
| **A — Ativo** | Colaborador disponível para trabalhar | Pode ser substituto se selecionado; **não** aparece como alvo afastado |
| **F — Folga** | Colaborador em folga durante o planejamento | Pode aparecer como **alvo** para ser substituído |
| **L — Licença** | Colaborador em licença durante o planejamento | Pode aparecer como **alvo** para ser substituído |

O idioma inglês usa **D — Day Off**. A tradução brasileira usa **F — Folga**. Essa diferença é somente de apresentação; as regras do sistema continuam as mesmas.

A disponibilidade do Plano não substitui o **Resultado Real**, que é apurado posteriormente. É perfeitamente possível que o planejador preveja Folga e depois precise registrar o resultado real adequado. Não pressuponha que a disponibilidade F determina sozinha uma regra de remuneração; a apuração exige o estado real e as demais condições.

### 05.4 Procedimento completo — Bruno substitui Ana

**Identidade:** Administrador da Entidade ou Operador de Ganhos com permissão de planejamento, na **Entidade A fictícia**. **Contexto:** Período de Trabalho de treinamento em **Planejamento**. **Pré-condição:** ambos são Colaboradores elegíveis e suas atribuições podem ser incluídas/salvas para o mesmo período. Não use um período com lançamentos reais.

1. Abra **Períodos de Trabalho** e confirme data, código, nome e horário do turno. Verifique se o estado permite editar o Plano.
2. Selecione a aba **Plano** e clique em **Limpar filtros** para enxergar todas as linhas. Deixe a ordenação original, se possível.
3. Localize **Ana** pelo Apelido/nome e confirme a linha. Na coluna **Disp.**, escolha **F — Folga** (ou **L — Licença** se esse for o caso real do exercício).
4. Confira se a linha de Ana já integra o plano ou se a alteração de disponibilidade será salva como um registro do período. O **alvo deve existir no plano salvo**; não basta mencioná-lo visualmente como uma linha que nunca foi persistida.
5. Localize **Bruno**. Confirme **Disp. = A** e marque a coluna **✓** de Bruno para incluí-lo.
6. **Na linha de Bruno**, marque a caixa **Cand.**. Observe a indicação de candidato e o seletor **Subst.** habilitado nessa linha.
7. Abra **Subst. de Bruno**. A lista começa com **Sem substituição temporária** e deve oferecer colaboradores com disponibilidade **F** ou **L**, ainda sem outro substituto designado. Encontre **Ana**; o texto da opção inclui apelido, letra de disponibilidade e situação de seleção.
8. Selecione **Ana** no Subst. **de Bruno**. Leia em voz alta: “Bruno está substituindo Ana neste Período de Trabalho”.
9. Confira o contador **substituições temporárias**. Ele deve refletir o novo vínculo em edição. Isso **ainda não confirma gravação**.
10. Confira o Setor, Local e Tarefa de **Bruno**, pois ele executará o trabalho. Se precisar ajustá-los, use **Atribuição do Plano** **na linha de Bruno**, sem marcar padrões futuros salvo autorização expressa.
11. Clique **Limpar filtros** outra vez, revise **ambas as linhas** e só então use **Salvar plano**. Aguarde a conclusão sem clicar novamente.
12. Reabra o Plano ou atualize a página. Confirme que a disponibilidade de Ana e o elo **Bruno → Ana** foram restaurados. Confira que não apareceu um substituto adicional para Ana.
13. Abra **Informar / Imprimir**. Confira o aviso de afastados sem substituto. Se Ana ainda aparecer como não substituída, **não conclua que o exercício passou**: revise persistência, identidades e vínculo antes de informar ou imprimir.
14. Não clique em **Marcar como Informado** e não altere **Resultados Reais** no exercício básico, a menos que a ficha autorizada inclua essas etapas.

**PASSOU:** Bruno está incluído e ativo, Ana está F/L, Subst. de Bruno aponta para Ana e a relação reaparece depois da recarga. O aviso de não substituída não lista Ana para esse período. **FALHOU:** o elo não foi salvo ou é reverso. **BLOQUEADO:** falta período editável, Colaborador elegível ou permissão.

### 05.5 Por que o seletor Subst. pode estar vazio

A opção **Sem substituição temporária** isolada não significa necessariamente erro de sistema. Revise, **nesta ordem**:

1. **Você está na linha do substituto?** O Subst. correto é o do Colaborador que irá trabalhar, não o do afastado.
2. **Marcou Cand. nessa linha?** Sem Cand., Subst. fica indisponível.
3. **O afastado está F/L?** A pessoa ainda marcada A não é alvo válido.
4. **O alvo é outra Pessoa?** A própria Pessoa não pode substituir a si mesma.
5. **O alvo já foi escolhido em Subst. de outra linha?** Uma pessoa afastada não pode receber dois substitutos pelo mesmo mecanismo.
6. **O alvo é também substituto de outro?** Encadeamentos de substituição são rejeitados.
7. **Você está no mesmo Período?** Substituições não vinculam atribuições de períodos diferentes.
8. **A alteração existe apenas na tela?** O servidor exige um registro de atribuição do afastado no período. Salve uma configuração válida de acordo com o exercício aprovado; se ocorrer validação, não tente contornar as regras.
9. **O período está editável e sua sessão autorizada?** Sem isso, os controles podem ficar desabilitados.
10. **Algum filtro esconde a linha?** Limpar filtros mostra todas as linhas; não modifica o plano salvo.

**Detalhe importante:** o seletor Subst. é uma lista de escolha. Não é o seletor genérico de busca que abre uma lista completa para digitação. Se seu navegador não oferecer filtragem digitada nesse controle, isso não é um defeito de substituição. Use a lista apresentada.

### 05.6 Quatro coisas que parecem iguais, mas não são

| Situação | O que acontece | Ainda falta |
|---|---|---|
| ✓ em Bruno | Bruno será incluído quando salvar | Nenhum vínculo com Ana foi criado |
| Cand. em Bruno | A linha permite preparar substituição; há marca visual **em memória** | Escolher o alvo em Subst. e salvar; Cand. isolado não cria relação persistida |
| Subst. de Bruno = Ana | O plano **em edição** tem a relação Bruno → Ana | Clicar em **Salvar plano** e confirmar depois de recarregar |
| Disponibilidade de Ana = F | Ana está assinalada em Folga no plano | Definir substituto, quando aplicável, e registrar resultado real depois |

**Ao recarregar:** o estado de Cand. é reconstruído a partir de vínculos de substituição salvos. Uma caixa Cand. marcada sem Subst. associado não constitui uma reserva persistente de candidato; não use o contador de candidatos como prova de gravação.

### 05.7 Como retirar ou corrigir uma substituição antes de informar

1. Em um período editável, encontre a **linha do substituto** que possui Subst. preenchido.
2. Abra **Subst.** e selecione **Sem substituição temporária** se a substituição foi cancelada; para trocar o alvo, selecione outro afastado elegível.
3. Se a Pessoa não será mais substituta, desmarque **Cand.**; isso também limpa o destino de substituição na edição local.
4. Confira **✓** e **Disp.** das duas Pessoas. Caso o trabalhador deixe o plano, ajuste a inclusão explicitamente; não suponha que retirar Subst. desmarca ✓.
5. Use **Salvar plano**. Reabra e confira. Se o alvo continuar listado no aviso de afastados sem substituto, é porque o elo não existe mais; decida operacionalmente se precisa de outra cobertura.

**Cuidado:** mudar a disponibilidade de um alvo de F/L para A limpa a indicação local de substituição dos colegas que apontavam para ele. Examine o efeito sobre todos os envolvidos antes de salvar. Para períodos já informados, lançados ou encerrados, siga a governança da Entidade; nunca reescreva uma escala histórica sem autorização.

### 05.8 Substituições múltiplas no mesmo turno

É possível que **Bruno → Ana** e **Davi → Carla** coexistam, desde que ambos os substitutos sejam elegíveis, ambas as Pessoas substituídas estejam F/L e não haja destino duplicado. Para operar com quatro linhas:

| Pessoa | Participação | Disponibilidade | Cand. / Subst. |
|---|---|---|---|
| Ana | afastada | F | sem destino na própria linha |
| Bruno | substitui | A | Cand. = sim; Subst. = Ana |
| Carla | afastada | L | sem destino na própria linha |
| Davi | substitui | A | Cand. = sim; Subst. = Carla |

O contador de substituições deve representar **duas** relações. Se Davi tentar apontar para Ana, que já é alvo de Bruno, a escolha não deve estar disponível para uma segunda relação; o servidor também protege contra duplicidade.

### 05.9 Casos que o sistema deve impedir

| Tentativa incorreta | Motivo | Correção do planejador |
|---|---|---|
| Bruno → Bruno | Autossubstituição | Escolher outra Pessoa afastada |
| Bruno (F/L) → Ana | Substituto não disponível | Designar alguém A, selecionado para trabalhar |
| Bruno → Ana (A) | Alvo não afastado | Confirmar se Ana realmente está F/L; não alterar disponibilidade sem motivo real |
| Bruno → Ana e Davi → Ana | Dois substitutos para o mesmo afastado | Manter somente o vínculo aprovado |
| Bruno → Ana e Ana → Carla | Encadeamento / papéis incompatíveis | Organizar relações diretas, sem cadeia |
| Bruno no Período 1 → Ana no Período 2 | Períodos diferentes | Reorganizar dentro do mesmo Período |
| Bruno em uma Entidade → Ana em outra | Contexto de segurança distinto | Usar somente Colaboradores da Entidade atual |
| Subst. marcado e ✓ do substituto ausente | Substituto não participa do plano | Incluir o substituto |
| Destino F/L sem atribuição salva | O servidor não conhece o alvo no período | Salvar as linhas exigidas pelo fluxo aprovado; não usar atribuição de outro período |

As validações do servidor são salvaguardas. Se algum erro aparecer, leia-o e **pare**: não experimente combinações financeiras ou referências de outra Entidade até “passar”.

### 05.10 Efeito em Informar, Resultados Reais e Acúmulo

**Planejamento:** o vínculo de substituição é **do período**. Ele não altera a Pessoa, a Jornada, nem muda automaticamente Setor/Local/Tarefa permanente de nenhum Colaborador. Um ajuste de atribuição neste período é outra decisão, separada do vínculo de substituição.

**Informar / Imprimir:** a escala informada apresenta os Colaboradores incluídos e seus Setor/Local/Tarefa informados. A tela lista como **aviso** os afastados F/L sem elo de substituição. Não trate a ausência de aviso como prova de que houve aceite eletrônico do Colaborador — a funcionalidade de notificação/aceite permanece adiada.

**Resultados Reais:** o operador registra o estado real apropriado de cada **atribuição incluída**. Exemplos do modelo: Trabalhou, Ausente, Folga por doença, Folga, Substituído e Cancelado (a apresentação exata vem da tela). A disponibilidade planejada A/F/L **não lança remuneração**. A escolha do resultado, do método de pagamento, da produção e da configuração de cada Jornada afeta o cálculo posterior.

**Acúmulo:** só após informar resultados e dispor dos insumos necessários o cálculo pode produzir itens prontos. As regras específicas de substituição para comissão de ouro podem gerar créditos, débitos ou itens pendentes; por exemplo, Folga pode dividir comissão conforme configuração, e Folga por doença pode gerar a transferência de gramas entre titular e substituto. Esses comportamentos **não são um efeito automático de marcar Cand.**. Sem produção ou atribuição requerida, itens podem permanecer **pendentes**. Não antecipe valores financeiros a partir apenas da tabela do Plano.

**Conta Corrente:** depois de lançados os itens prontos, confira as evidências na Jornada correta. Os registros de trabalho **informado** e **realizado** são distintos; trabalho realizado é evidência, não uma alteração silenciosa da base já informada de remuneração.

### 05.11 Exemplo numérico explicado sem virar instrução de pagamento

Suponha, **apenas para entender as regras**, uma base fictícia de comissão de **10 g de ouro** calculada para a atribuição original, com divisão de Folga configurada em **50%** e substituição corretamente vinculada.

- Se o **resultado real** da titular de comissão for **Folga** e todas as condições de cálculo forem atendidas, a distribuição conceitual é **5 g para a titular** e **5 g para a substituta**. O percentual efetivo depende da configuração da Jornada; **50% é somente o padrão previsto pela regra quando não há outro valor configurado**.
- Para **Folga por doença** na atribuição de comissão de ouro, a regra de substituição usa a quantidade configurada, com padrão **1 g**: pode haver débito da titular e crédito do substituto, além dos itens de remuneração aplicáveis. Isso não significa que todo resultado “Folga” transfere automaticamente 1 g.
- Em qualquer cenário, a ausência de produção ou dados obrigatórios pode deixar itens pendentes. **Nunca use estes números de exemplo para criar ou aprovar lançamentos**; só os itens calculados/validados pelo ERS, com a autorização cabível, entram na Conta Corrente.

### 05.12 Proposta herdada não é substituição permanente

No próximo período com o mesmo código, se não houver plano já salvo, a proposta pode trazer uma relação que existia no período anterior, porque o mecanismo reutiliza informações do último período compatível. O planejador deve **conferir novamente**: Ana continua em Folga? Bruno ainda estará disponível? A cobertura precisa continuar? Se a resposta for não, corrija a proposta **antes de salvar**. O vínculo de atribuições que será persistido pertence ao novo período, não à Jornada inteira.

A propagação de Setor/Local/Tarefa **efetivos** de quem realmente trabalhou segue outro mecanismo: cria uma sugestão para o novo plano, sem reescrever a atribuição informada do período anterior. Não confunda **herança de sugestão de trabalho** com **substituição de pessoa**.

### 05.13 Regras de ouro para revisão do planejamento

- **Sei dizer quem trabalhará?** Olhe ✓ e Disp. na linha do substituto.
- **Sei dizer quem ficará ausente?** Olhe Disp. F/L na linha da Pessoa substituída.
- **Sei dizer quem substitui quem?** Leia **Subst. na linha de quem trabalhará**.
- **Sei dizer se foi gravado?** Reabra após Salvar plano e confira o elo.
- **Sei dizer o que será informado?** Abra Informar / Imprimir e confira a escala e os avisos.
- **Sei dizer o que aconteceu?** Só depois confira Resultados Reais; não deduza presença real do Plano.
- **Sei dizer quanto será ganho?** Só depois de resultados, produção, regras e Acúmulo; não deduza do campo Cand.

**Teste mental rápido:** “Elisa substitui Fábio”. **Resposta:** Elisa deve estar ✓ e A; marque Cand. **em Elisa**; Fábio deve estar F ou L; escolha Fábio no **Subst. de Elisa**; salve e confira. Se você marcou Cand. em Fábio ou escolheu Elisa no Subst. de Fábio, a relação está invertida.

---

## Capítulo 06 — Informar e imprimir o Plano de Trabalho

A aba **Informar / Imprimir** é a passagem do plano editável para a escala comunicada. Ela apresenta um documento com data/turno, nomes e **Setor/Local/Tarefa informados**. A tabela impressa não é um extrato financeiro nem uma prova do trabalho realizado.

1. Confirme que o Plano foi salvo e que todas as substituições aprovadas reaparecem após a recarga.
2. Abra **Informar / Imprimir** e examine a lista de Colaboradores incluídos, atribuição e período.
3. Observe o painel de **aviso de afastados sem substitutos**, se houver. É um alerta para revisão operacional; o botão de informar é determinado por estado e permissão, não por um aceite automático.
4. Compare a escala com a decisão do responsável pela operação. Se faltar cobertura, volte ao Plano **antes** de marcar como informado.
5. Use **Imprimir Plano de Trabalho** em treinamento de leitura, se autorizado. Confira o destino físico ou digital para não distribuir dados de teste como escala verdadeira.
6. **Marcar como Informado** muda o estado. Somente o responsável com período descartável aprovado pode realizar essa etapa no exercício.
7. Reabra o período e confirme o novo estado; o registro não é uma notificação de aplicativo aceita eletronicamente pelo Colaborador.

**Regra de comunicação:** imprimir, publicar na Cantina e informar são etapas operacionais; o aceite eletrônico de atribuições é funcionalidade **adiada (34.4)**. Não declare esse aceite cumprido.

---

## Capítulo 07 — Resultados Reais e trabalho efetivamente executado

O planejamento descreve **o que deveria acontecer**. Os Resultados Reais registram **o que aconteceu**. Essa separação é indispensável em substituições, alterações de Local e auditorias.

1. Abra a aba **Resultados Reais** do Período de Trabalho aprovado.
2. Localize um Colaborador **incluído**. O editor mostra a **Atribuição informada** com Setor, Local e Tarefa.
3. Escolha o **Resultado** aplicável de acordo com a evidência operacional. Não selecione “Trabalhou” apenas para obter remuneração; é uma declaração do que ocorreu.
4. Revise os campos **Setor real**, **Local real** e **Tarefa real**. Uma Pessoa pode executar o trabalho em lugar diferente do comunicado; cada campo é independente.
5. Quando a ficha do exercício autorizar gravação, clique **Salvar trabalho realizado** e reabra a atribuição para confirmar a diferença entre informado e real.
6. Para resultado que não represente trabalho efetivamente executado, não use campos reais para inventar evidência. Registre o estado apropriado e peça orientação se faltarem informações.
7. No período seguinte de **mesmo código** sem atribuição salva, observe a sugestão herdada do trabalho real para quem teve resultado **Trabalhou**; campos sem valor real válido recorrem ao informado.

| Situação didática | Setor/Local/Tarefa informado | Trabalho realizado | O que o sistema preserva |
|---|---|---|---|
| Bruno trabalhou como previsto | Mineração / Poço A / Extração | Mesmo conjunto | Evidência consistente |
| Bruno foi redirecionado | Mineração / Poço A / Extração | Mineração / Poço B / Apoio | Informado e real continuam distintos |
| Ana estava afastada | Atribuição planejada de Ana | Resultado de afastamento | Atribuição informada continua no histórico; não se inventa trabalho |

**Consequência financeira:** a remuneração continua usando a **atribuição informada** conforme a regra de Byte 35.3. O trabalho efetivo é evidência histórica e pode orientar uma próxima proposta; não muda retroativamente o preço ou a base de cálculo do turno.

---

## Capítulo 08 — Produção de Ouro e Acúmulo sem confundir consulta com lançamento

### Produção de ouro na interface

A gestão da produção é controlada por permissões específicas. Se o seu papel é **Operador de Ganhos** e o link **Produção de Ouro** não aparece, isso pode ser o comportamento correto. Para **consultar** o que já foi registrado, abra **Períodos de Trabalho → período → Acúmulo → Ouro Produzido**. Essa seção apresenta total, local, data, quantidade em gramas e observações, quando existirem.

O **Administrador da Entidade** com permissão correspondente pode acessar a página separada **Produção de Ouro**; não utilize outra conta nem solicite aumento de privilégio só para concluir um exercício de consulta.

### Diferença entre três atos

| Ato | Significado | Efeito financeiro imediato? |
|---|---|---|
| Conferir produção | Ler dados dos poços e totais | Não |
| Executar / recalcular Acúmulo | Produzir itens e identificar quais estão prontos/pendentes | Não equivale, sozinho, a lançar na Conta Corrente |
| Lançar itens prontos | Registrar os itens elegíveis conforme a operação autorizada | Sim, pode alterar histórico financeiro |

### Roteiro seguro para conferir

1. Abra a Entidade e o Período corretos; selecione **Acúmulo**.
2. Leia **Ouro Produzido** e confirme data, Local, gramas e eventuais observações.
3. Examine **Execuções de Acúmulo** e selecione uma execução existente, se houver.
4. Verifique totais de itens, **Prontos**, **Pendentes**, **Lançados** e **Ignorados**; os nomes refletem estados distintos.
5. Inspecione uma pendência. Pode faltar resultado real, produção no Local correspondente, configuração de pagamento ou vínculo de substituição necessário.
6. Confira, em execução já lançada, a origem na Jornada correta e o histórico de Conta Corrente. **Não** crie nova execução em treinamento de leitura.
7. Somente com autorização e cenário descartável, explore criação, recálculo e lançamento; antes de lançar, confirme quem autoriza, qual é o efeito e como será verificada a idempotência.

**Observações de Acúmulo:** o formulário exige observação preenchida para criar execução; isso não autoriza uma execução sobre dados que precisam ser preservados. Se houver item pendente, não “cure” a pendência com dados fictícios em Jornada real.

---

## Capítulo 09 — Conta Corrente: histórico por Jornada, unidade e origem

A Conta Corrente registra créditos e débitos **da Jornada selecionada**. A mesma Pessoa pode ter várias Jornadas e participar de mais de uma Entidade; uma consulta não deve somar automaticamente todos os contextos.

1. Abra o Colaborador fictício, selecione a Jornada correta e navegue à **Conta Corrente**.
2. Examine os créditos, débitos, ganhos, despesas e Recibos pendentes de acordo com as opções disponíveis.
3. Identifique a unidade: **reais (BRL)** e **gramas de ouro (GOLD_GRAM)** são saldos distintos. Não some números de unidades diferentes.
4. Abra uma entrada com origem em Período de Trabalho. Verifique data, período, tipo de Acúmulo, pessoa beneficiária e, quando houver, a evidência de atribuição informada e trabalho realizado.
5. Use **Ganhos atuais e futuros** quando disponível; os valores se referem à Jornada selecionada, e não à Pessoa inteira.
6. Diferencie **saldo** (posição contábil), **obrigação de Recibo** (aceite exigido) e **estado de encerramento** (restrições adicionais).

**Exemplo:** Bruno ganhou R$ 100 e recebeu débito de R$ 20 na mesma Jornada: o efeito líquido desse par de itens é R$ 80, **desde que ambos tenham sido de fato lançados**. Um item apenas pronto no Acúmulo não é crédito confirmado.

**Regra de segurança:** saldos históricos de abertura não são bonificações. Sua importação possui fluxo separado de inicialização protegida (Byte 35.5); não ajuste o saldo manualmente para fazer um exercício chegar a zero.

---

## Capítulo 10 — Despesas, Lista de Preços e correção auditável

A tela **Despesas** permite consultar registros associados à Entidade, ao Colaborador/Jornada e à classificação apropriada, segundo permissões. **Lista de Preços** é cadastro administrativo com acesso distinto; escolher um item de uma lista não significa que uma despesa já foi registrada.

1. Com uma identidade autorizada, abra **Despesas** e localize a despesa fictícia indicada pelo exercício.
2. Confira Colaborador, Jornada, data, descrição, classificação, unidade e valor. Se o formulário exigir mais dados, não invente o que não consta do cenário.
3. Para aprender os campos de criação sem produzir movimento, abra **Nova despesa** e escolha **Cancelar** antes de salvar.
4. Despesa incorreta, quando o fluxo permitir, é corrigida por **cancelar e recriar** com justificativa, preservando trilha histórica — não por alterar silenciosamente o registro original.
5. A autorização para corrigir pode pertencer ao Administrador da Entidade, não necessariamente ao Operador de Despesas. Verifique o botão e o papel.
6. Após correção aprovada em cenário descartável, compare o registro cancelado e o novo, além da Conta Corrente; não confunda despesa cancelada com despesa efetiva.

**Pergunta para avaliação:** se o valor de uma despesa lançada está errado, deve-se mudar a planilha externa ou usar o procedimento de correção? **Resposta:** o fluxo auditável do ERS, autorizado e documentado; nunca reescrever a evidência original sem trilha.

---

## Capítulo 11 — Recibos, liquidação e fechamento de Jornada

A direção da liquidação determina **quem confirma o recebimento no aplicativo**:

| Movimento de liquidação | Quem deve confirmar o Recibo | Erro a evitar |
|---|---|---|
| Entidade paga ao Colaborador | **Colaborador** | O Administrador aceitar no lugar do recebedor |
| Colaborador paga à Entidade | **Administrador da Entidade** | O Colaborador aceitar no lugar da Entidade |

1. Na Jornada fictícia correta, identifique saldo, direção do acerto e Recibos pendentes.
2. Confirme o **pagador**, o **recebedor**, a unidade e o valor. Um Recibo não é autorização para criar dinheiro ou ouro.
3. Entre com a identidade do **recebedor apropriado** quando o exercício permitir testar aceite. Em treinamento somente de leitura, não assine.
4. Depois de aceite autorizado, confira o estado final e a trilha de auditoria. Recibo aceito é evidência imutável; não deve voltar para “revisar” e ser aceito novamente.
5. Para encerrar Jornada, verifique **saldo zero** e inexistência de bloqueios. Não tente encerrar duas Jornadas com saldo pendente para “produzir exemplo” de encerramento.
6. Se não houver Jornada já encerrada para conferir leitura histórica, marque essa subverificação **BLOQUEADA por falta de registro**, mantendo os saldos existentes intactos.

**Exemplo:** um Colaborador tem saldo positivo a receber. Registrar o pagamento não substitui a confirmação de recebimento quando exigida. O saldo não pode ser apagado apenas para permitir encerramento.

---

## Capítulo 12 — Administração da Entidade, permissões e auditoria

Na Entidade correta, o Administrador autorizado pode encontrar **Autorização**, **Dados de referência**, **Preços do Ouro**, **Lista de Preços** e configurações de Conta Corrente, conforme seu papel. Nem todo Administrador precisa de todas as permissões; o ERS verifica o Ator efetivo e a Entidade selecionada.

**Autorização:** inspecione papéis antes de concedê-los. Um Operador de Ganhos não herda automaticamente gestão de Despesas; um Operador de Despesas não herda Acúmulo. Alterações de papéis exigem decisão administrativa, não são etapa de treinamento básico.

**Dados de referência:** Setores, Locais e Tarefas ativos aparecem nas escolhas aplicáveis. Uma opção inativa pode permanecer visível apenas para explicar um registro histórico; não se deve selecioná-la para novo trabalho quando desabilitada.

**Preços do Ouro e Lista de Preços:** valores e vigências afetam processos próprios. Revisão sem gravação é apropriada para treinamento; alterações podem ter consequências reais no cálculo ou lançamento.

**Auditoria:** ações administrativas, incluindo alterações de Pessoa e substituições registradas, devem ser rastreáveis. A evidência precisa identificar **quem**, **quando**, **em qual Entidade** e **qual objeto** sem divulgar senha, token, CPF real ou outros dados desnecessários.

### Separação de escopos

O Administrador da Aplicação opera no contexto global próprio. Acesso de suporte a uma Entidade, quando autorizado, depende de uma **Permissão Temporária de Suporte à Entidade**; não cria Pessoa, vínculo, Ator da Entidade, Colaborador ou concessão permanente de papel. Esse tema é destinado ao responsável administrativo, não a improvisação em treinamento.

---

## Capítulo 13 — Autoatendimento do Colaborador

O Colaborador trabalha dentro de sua própria identidade. A interface pode apresentar seus dados pessoais, sua Jornada, Conta Corrente histórica e Recibos pendentes, conforme o vínculo.

1. Entre como Colaborador fictício com sessão própria e selecione seu contexto permitido.
2. Localize informações pessoais, a Jornada apropriada e o histórico correspondente. Não há permissão implícita para editar a própria Pessoa ou os dados de outro Colaborador.
3. Abra uma Conta Corrente permitida; compare unidades e origem dos movimentos.
4. Em Recibos pendentes, identifique a direção do recebimento. Não aceite documentos de exercício sem autorização expressa.
5. Se houver mais de uma Entidade autorizada, alterne pelo seletor e confirme que dados financeiros da primeira não aparecem na segunda.
6. Ao final, encerre a sessão antes de outro aluno assumir o navegador.

**Sem espaço de trabalho:** a inexistência de Jornada ativa não permite consultar dados alheios. A pessoa pode permanecer apenas com acesso pessoal e histórico de leitura, conforme o contrato de autenticação.

---

## Capítulo 14 — Rotinas operacionais de cada função

### Antes de iniciar o turno — planejamento

1. Confirmar Entidade, identidade, data, código de período e horário.
2. Conferir disponibilidade de cada Colaborador e o responsável pela escala.
3. Ajustar ✓, Setor/Local/Tarefa; para ausência, revisar **Cand. e Subst. no substituto**.
4. Limpar filtros, revisar todas as linhas, salvar e reabrir o Plano.
5. Verificar aviso de afastados sem substituição em Informar / Imprimir.
6. Informar/imprimir apenas com a autorização operacional correspondente.

### Depois do turno — resultado e apuração

1. Verificar evidência de trabalho real, ausência e substituições executadas.
2. Salvar os Resultados Reais autorizados e conferir o conjunto informado/real.
3. Conferir produção de ouro já registrada e pendências.
4. Revisar Acúmulo, nunca tratar item pronto como lançado.
5. Lançar somente itens aprovados; conferir Conta Corrente da Jornada.

### Periodicamente — reconciliação e administração

1. Rever despesas, correções, Recibos e saldos por Jornada.
2. Conferir papéis, vinculações e dados de referência sem expandir privilégios desnecessariamente.
3. Separar ações de treinamento das rotinas efetivas da Entidade.
4. Encaminhar incidentes técnicos, backup, recuperação e continuidade à equipe responsável pelo procedimento operacional específico.

---

## Capítulo 15 — Diagnóstico de problemas frequentes

| O que vejo | Interpretação provável | Como proceder sem criar novos problemas |
|---|---|---|
| **Subst. vazio** | Nenhum alvo F/L elegível, Cand. desmarcado ou alvo já utilizado | Volte ao capítulo 05.5; confira disponibilidade, linha e duplicidade |
| **Cand. desapareceu após recarregar** | Era candidato local sem vínculo de substituição persistido | Escolha destino em Subst. e salve; candidato sozinho não vira cadastro |
| **Aparece aviso de afastado sem substituto** | Não existe vínculo salvo para aquela atribuição afastada | Revise Plano salvo, não apenas contadores antes de salvar |
| **F não aparece; só D** | Interface está em inglês | Escolha Português (Brasil): Folga é F; D aparece em inglês |
| **O Período não permite editar** | Estado Encerrado, sessão sem permissão ou operação indisponível | Troque para um cenário didático editável aprovado |
| **Produção de Ouro não aparece no menu** | Papel sem permissão de administração de produção | Confira leitura em Acúmulo; não conceda papel extra |
| **Acúmulo pendente** | Falta dado real, produção, pagamento ou relação necessária | Leia o motivo pendente e comunique o responsável |
| **Conta Corrente não mudou após calcular** | Itens ainda não foram lançados ou não estavam prontos | Revise estado; não execute novamente sem aprovação |
| **Jornada não fecha** | Saldo não zero, Recibo ou outro impedimento | Não altere saldos por conta própria; siga liquidação autorizada |
| **Filtro esconde alguém** | A visualização está reduzida | Limpe os filtros; confira total, selecionados e relações |
| **Novo Plano tem atribuição inesperada** | Proposta herdada do mesmo código, inclusive trabalho real anterior | Confirme a fonte e revise **antes de salvar** |
| **Pessoa de outra Entidade não aparece** | Isolamento de dados | Nunca tente contornar; confirme o contexto autorizado |

### Antes de declarar erro de software

Registre Entidade fictícia, identidade/papel, período/código/estado, passos reproduzidos, texto exibido, resultado esperado e observado. Se o exercício exigir um registro que não existe, a situação é **BLOQUEADA**, não defeito. Quando o resultado contrariar uma regra expressa deste manual, registre **FALHOU** com evidência e **pare**, sem tentar corrigir diretamente o banco de dados.

---

## Capítulo 16 — Glossário português de uso operacional

| Termo do cliente | Conceito usado neste manual |
|---|---|
| **Entidade** | Organização na qual Pessoas, Jornadas, registros e permissões estão contextualizados; o termo interno do software permanece técnico |
| **Pessoa** | Ser humano identificado globalmente |
| **Vínculo** | Relação de uma Pessoa com uma Entidade |
| **Conta de autenticação** | Conta única usada para entrar no sistema |
| **Ator** | Identidade de autorização efetiva numa Entidade ou no contexto global apropriado |
| **Colaborador** | Participante operacional de uma Entidade |
| **Jornada** | Episódio financeiro e operacional de um Colaborador na Entidade |
| **Período de Trabalho** | Turno/data/código usado para plano, comunicação, resultado e Acúmulo |
| **✓ Selecionado** | Incluído no planejamento do Período, não comprova trabalho realizado |
| **Disponibilidade A/F/L** | Ativo / Folga / Licença na interface brasileira |
| **Cand.** | Indica que a **linha do substituto** está preparada para escolher alguém a substituir |
| **Subst.** | Seletor **na linha do substituto** que aponta para a Pessoa afastada |
| **Substituição temporária** | Vínculo de atribuições dentro de um único Período de Trabalho; não troca Pessoa ou Jornada |
| **Atribuição informada** | Setor/Local/Tarefa do Plano comunicado, preservados como base de remuneração |
| **Trabalho realizado** | Setor/Local/Tarefa efetivamente registrados no Resultado Real, como evidência |
| **Acúmulo** | Cálculo de ganhos e geração de itens prontos, pendentes, lançados ou ignorados |
| **Conta Corrente** | Histórico de créditos/débitos por Jornada e unidade de valor |
| **Recibo** | Aceite da parte que recebeu o pagamento conforme a direção da liquidação |
| **BLOQUEADO** | Exigência de exercício indisponível; não equivale a PASSOU ou FALHOU |

**Padrão de idioma:** nesta documentação dirigida ao cliente em português, o termo é sempre **Entidade / Entidades**. Identificadores internos, caminhos de arquivos e contratos técnicos não são alterados por essa convenção editorial.

---

## Capítulo 17 — Critérios para demonstrar domínio da operação

Uma Pessoa treinada deve ser capaz de:

1. Distinguir Pessoa, Vínculo, Ator, Colaborador e Jornada sem consultar a tela de outra Entidade.
2. Explicar a diferença entre **incluir** e **trabalhar**; selecionar não é apurar.
3. Dizer, olhando as duas linhas, **quem substitui quem** e por que Subst. está no substituto.
4. Explicar por que os alvos Subst. exigem F/L e por que um alvo não deve ter dois substitutos.
5. Salvar um plano de teste e comprovar, após recarregar, que a substituição existe.
6. Separar **atribuição informada** de **trabalho realizado** e de **padrão futuro da Jornada**.
7. Distinguir execução de Acúmulo de lançamento financeiro.
8. Identificar Recibo e confirmador corretos conforme quem recebeu dinheiro/ouro.
9. Recusar alterações de saldos ou de permissões apenas para fazer testes passarem.
10. Documentar caso **BLOQUEADO** sem confundir ausência de dados fictícios com defeito de sistema.

O conjunto de exercícios F01–F12 abaixo reúne essas competências. Cada aluno executa somente as partes autorizadas. O responsável pelo treinamento deve marcar as não executadas como **NÃO EXECUTADO** ou **BLOQUEADO**, não como aprovação presumida.

---

## Capítulo 18 — Como registrar a avaliação sem fabricar evidência

Para cada exercício, anote: **identidade efetiva**, **Entidade**, **Período/Jornada**, **registro fictício utilizado**, **tipo de ação (leitura ou escrita aprovada)**, **passos concluídos**, **evidência de tela sem dados sensíveis**, **resultado observado** e **situação**.

- **PASSOU:** foi possível observar exatamente o comportamento proposto no registro apropriado.
- **FALHOU:** comportamento reproduzido contraria regra, proteção ou resultado esperado.
- **BLOQUEADO:** não havia credencial, permissão, registro fictício ou ambiente autorizado para executar a verificação.
- **NÃO EXECUTADO:** exercício ainda não tentado.

Resultados de treinamento não autorizam entrada em Produção; a aceitação da implantação depende das etapas 35.5, 35.6 e 35.7 e de evidência real dos seis controles mínimos de lançamento.

---

## F01 — Laboratório: entrada, Entidade, idioma e troca de sessão

**Identidade:** uma conta fictícia autorizada. **Contexto:** ambiente de treinamento, Entidade A. **Ação:** somente leitura.

1. Abra a tela de entrada, autentique-se e identifique sua Pessoa e o contexto.
2. Selecione Português (Brasil); observe pelo menos três nomes de menus.
3. Confira a Entidade selecionada; se a conta possuir outra, faça a troca, sem editar registros.
4. Retorne à Entidade A e atualize a página.
5. Encerre a sessão normalmente.

**PASSOU:** idioma coerente e nenhuma informação de Entidade não autorizada. **BLOQUEADO:** credencial ou Entidade de treino indisponível. **FALHOU:** vazamento de dados ou acesso de outra Pessoa.

## F02 — Laboratório: consultar uma Pessoa e seu vínculo

**Identidade:** Administrador da Entidade A, com consulta a Pessoas. **Contexto:** Pessoa fictícia indicada. **Ação:** leitura.

1. Abra Pessoas e localize o registro de treinamento.
2. Anote apenas identificador e atributos não sensíveis necessários ao exercício.
3. Confira vínculo da Pessoa com a Entidade atual.
4. Abra edição para conhecer campos, mas use Cancelar.
5. Retorne à lista e confirme que nenhum vínculo privado de outra Entidade foi exposto.

**PASSOU:** consulta correta, nenhuma alteração persistida. **BLOQUEADO:** falta Pessoa ou privilégio. **FALHOU:** duplicação/confusão de escopo ou edição sem autorização.

## F03 — Laboratório: Colaborador, Jornada e proteção do encerramento

**Identidade:** Administrador da Entidade A. **Contexto:** Colaborador fictício com Jornada ativa e, **se existir**, outra já encerrada. **Ação:** somente leitura.

1. Abra Colaboradores, selecione a Pessoa do cenário e identifique sua Jornada ativa.
2. Confira saldo e estado. Se não for zero, reconheça que fechamento não é permitido; **não tente liquidar**.
3. Se houver Jornada já encerrada, confira que ela é histórica e não aceita edição.
4. Se não houver, registre essa **subverificação como BLOQUEADA**; não feche uma Jornada apenas para produzir o exemplo.
5. Verifique início a zero de uma nova Jornada somente se houver evidência já disponível; não crie Jornada de teste sem aprovação.

**PASSOU:** proteção de saldo/estado verificada nos registros acessíveis. **BLOQUEADO:** ausência de Jornada encerrada ou nova, especificando subcaso. **FALHOU:** saldo não zero aceito para encerramento.

## F04 — Laboratório: planejamento normal e substituições, com oito cenários

**Identidade:** Administrador da Entidade A ou Operador de Ganhos com `planning.update`. **Contexto:** Período de Trabalho fictício em Planejamento, com dois ou mais Colaboradores elegíveis. **Ações de escrita:** somente quando o dono do cenário tiver autorizado **um período descartável específico**. Leia integralmente o capítulo 05 antes de iniciar.

**Preparação para todos os cenários:** informe data, código, nome e estado; limpe filtros; anote ✓, Cand., Subst., A/F/L e atribuições das linhas envolvidas. Use casos independentes ou restaure **por procedimento aprovado** os registros descartáveis; não faça cenários contraditórios sequencialmente sobre o mesmo período sem conferir o estado.

### F04-S01 — Plano sem substituição

1. Na linha de Bruno, confirme ✓ e A, sem Cand. nem Subst.
2. Confirme Setor/Local/Tarefa; revise o contador de selecionados.
3. Se houver escrita autorizada, salve, atualize e confira a linha.

**PASSOU:** Bruno incluído; nenhum elo de substituição criado. **BLOQUEADO:** sem registro editável para salvar.

### F04-S02 — Candidato não significa substituto registrado

1. Na linha de Bruno, marque Cand. **sem** escolher alvo em Subst.
2. Observe a indicação visual de candidato.
3. Confira que o contador de substituições continua sem esse vínculo.
4. Não use o desaparecimento da marca após recarregar como evidência de falha: Cand. sozinho não persiste relação.

**PASSOU:** candidato visual não criou elo financeiro ou atribuição de substituição.

### F04-S03 — Substituição principal: Bruno → Ana em Folga

1. Em **Ana**, escolha Disp. **F**; confirme que sua atribuição será registrada no período.
2. Em **Bruno**, mantenha Disp. **A**, marque ✓ e Cand.
3. **Em Subst. de Bruno**, escolha **Ana**.
4. Limpe filtros e confirme as **duas** linhas e o contador.
5. Em período autorizado para escrita, clique **Salvar plano**, reabra e confira **Bruno → Ana**.
6. Consulte o aviso em Informar / Imprimir, sem marcar o período informado.

**PASSOU:** sentido correto, persistência após recarga e Ana não aparece como afastada sem cobertura. **FALHOU:** vínculo invertido ou perdido. **BLOQUEADO:** sem atribuição válida de Ana no período.

### F04-S04 — Licença também pode ser alvo

1. Prepare Carla com Disp. **L** e atribuição do período conhecida.
2. Prepare Davi ✓, **A**, Cand. e escolha Carla em **Subst. de Davi**.
3. Com gravação autorizada, salve e reabra.

**PASSOU:** Davi → Carla foi persistido no mesmo período. **BLOQUEADO:** faltam Colaboradores ou período.

### F04-S05 — Uma Pessoa afastada não tem dois substitutos

1. Com Bruno → Ana em edição, abra Subst. de Davi, com Cand. marcado.
2. Procure Ana entre destinos possíveis.
3. Confirme que Ana já atribuída não aparece como escolha livre de Davi.
4. **Não** tente construir requisição externa nem contornar validação do servidor.

**PASSOU:** escolha duplicada indisponível; não há mutação financeira. **FALHOU:** duas relações persistidas para o mesmo alvo.

### F04-S06 — Afastado A não é destino de Subst.

1. Com Ana em **A**, abra Subst. de Bruno, com Cand. marcado.
2. Confirme que Ana **não** é oferecida como alvo.
3. Mude Ana para **F** **apenas num caso descartável aprovado** e confirme que então aparece como opção.

**PASSOU:** apenas F/L elegíveis aparecem. **BLOQUEADO:** não pode alterar disponibilidade na ficha de treino.

### F04-S07 — Cancelar uma substituição antes de informar

1. Parta de um vínculo fictício e editável Bruno → Ana.
2. Na linha de Bruno, escolha **Sem substituição temporária** em Subst.
3. Se a ficha permitir, salve, reabra e confira ausência do elo.
4. Abra Informar / Imprimir e reconheça o aviso de Ana sem substituto, se ela continuar F/L.

**PASSOU:** retirada persistida e o aviso representa a situação real. **BLOQUEADO:** não há vínculo descartável para remover.

### F04-S08 — Diferenciar proposta herdada, substituição e padrão futuro

1. Abra um **novo período de mesmo código**, ainda sem atribuições próprias salvas, com fonte histórica fictícia disponível.
2. Identifique a **Fonte do modelo**; confira o plano proposto e eventuais relações herdadas, sem assumir continuidade automática.
3. Selecione um Colaborador com resultado anterior **Trabalhou**; compare campos propostos com a evidência anterior de Setor/Local/Tarefa real.
4. Abra **Atribuição do Plano** e confira a opção de atualizar **padrões futuros**; deixe-a **desmarcada** para a demonstração.
5. Não salve, a menos que este seja o período descartável autorizado.

**PASSOU:** operador distingue proposta, plano salvo, relação de substituição de período e padrão de Jornada. **BLOQUEADO:** não existe histórico do mesmo código.

**Aceite F04:** registre o resultado de cada S01–S08, inclusive subcasos bloqueados. **FALHOU** se o sistema permitir vínculo inválido ou perder uma substituição salva. Não considere a simples leitura deste capítulo equivalente à execução de oito cenários.

## F05 — Laboratório: conferir, imprimir e informar a escala

**Identidade:** operador com permissão de planejamento na Entidade A. **Contexto:** período fictício aprovado. **Ação:** leitura; mudança de estado somente com aprovação.

1. Abra Informar / Imprimir e compare a lista de participantes com o Plano salvo.
2. Revise aviso de F/L sem substituto e explique o que ele significa.
3. Use Imprimir Plano de Trabalho somente se autorizado; confira nomes e atribuições sem distribuir a escala fictícia como real.
4. Marcar como Informado é permitido apenas se o cenário de escrita estiver aprovado.
5. Explique por que “informado” não significa aceite eletrônico.

**PASSOU:** escala e avisos coerentes, sem declaração falsa de aceite. **BLOQUEADO:** sem período informado para consulta.

## F06 — Laboratório: resultado real separado do informado

**Identidade:** Operador de Ganhos autorizado ou Administrador da Entidade. **Contexto:** período fictício com atribuição incluída. **Ação:** leitura; escrita somente em caso descartável.

1. Abra Resultados Reais e anote Setor/Local/Tarefa informados.
2. Examine os resultados e os três campos reais, sem mudar o planejamento.
3. Se for autorizado, escolha Trabalhou e um Local real distinto, mantendo os demais campos coerentes; salve.
4. Reabra e comprove informado versus real; confirme ausência de alteração retroativa de remuneração.
5. Identifique como a proposta do próximo período **do mesmo código** usaria a evidência.

**PASSOU:** ambos os conjuntos persistem separadamente. **BLOQUEADO:** sem registro descartável.

## F07 — Laboratório: produção de ouro e Acúmulo conforme a autorização

**Identidade/contexto 1:** Operador de Ganhos da Entidade A, sem permissão administrativa de produção. **Identidade/contexto 2:** Administrador da Entidade A autorizado à gestão de produção e leitura de Conta Corrente. **Ação:** leitura.

1. Como **Operador de Ganhos**, abra **Períodos de Trabalho → período → Acúmulo → Ouro Produzido**. Confira data, Local, gramas e notas; não exija o link administrativo Produção de Ouro.
2. Confira o estado da execução de Acúmulo e diferencie itens prontos, pendentes e lançados. Não execute novo cálculo.
3. Saia completamente; como **Administrador da Entidade**, abra a página separada **Produção de Ouro** se a permissão permitir, compare com o mesmo período e não grave nada.
4. Como Administrador autorizado, localize uma Conta Corrente fictícia com item de Acúmulo **já lançado** e compare evidência de atribuição informada/trabalho realizado.
5. Se não houver produção ou item lançado, marque a subverificação **BLOQUEADA**, sem criar registro para completar o quadro.

**PASSOU:** acesso adequado por papel e rastreabilidade preservada. **FALHOU:** acesso indevido ou alteração de valor pela simples troca do Local real.

## F08 — Laboratório: despesas e correção sem apagar história

**Identidade:** Operador de Despesas da Entidade A; Administrador autorizado apenas para revisão do fluxo de correção. **Contexto:** despesa fictícia já registrada. **Ação:** leitura.

1. Localize a despesa fictícia em Despesas; confira Colaborador/Jornada, valor, unidade e classificação.
2. Abra criação, identifique campos e **cancele** sem salvar.
3. Explique a diferença entre editar silenciosamente e **cancelar e recriar**.
4. Confirme que a correção exige identidade autorizada e motivo; não execute sem caso descartável.

**PASSOU:** o aluno compreende trilha e limites de papel. **BLOQUEADO:** sem despesa fictícia.

## F09 — Laboratório: Conta Corrente de uma Jornada

**Identidade:** Administrador da Entidade A autorizado a consultar Conta Corrente. **Contexto:** Jornada fictícia com histórico. **Ação:** leitura.

1. Abra Colaboradores → Pessoa → Jornada aprovada → Conta Corrente.
2. Compare créditos e débitos em BRL e GOLD_GRAM separadamente.
3. Inspecione lançamentos de Acúmulo, Despesa e Recibo presentes.
4. Quando disponível, confira Ganhos atuais e futuros **da Jornada escolhida**.
5. Identifique um lançamento de Período de Trabalho e seus detalhes de atribuição.

**PASSOU:** unidade, origem e Jornada são coerentes. **BLOQUEADO:** sem histórico.

## F10 — Laboratório: Recibo certo, recebedor certo

**Identidades:** Colaborador e Administrador da Entidade A, em sessões separadas. **Contexto:** Recibos fictícios pendentes em cada direção, quando disponíveis. **Ação:** leitura; **não aceitar** no treinamento básico.

1. Como Colaborador, abra Recibos pendentes e identifique recebimento **da Entidade para o Colaborador**.
2. Confira valor e confirme verbalmente por que o **Colaborador** é o signatário apropriado. Saia.
3. Como Administrador da Entidade, examine recibo na direção **Colaborador para Entidade** e reconheça o aceite do Administrador.
4. Consulte obstáculos de encerramento da Jornada sem liquidar ou assinar nada.

**PASSOU:** direção e signatário corretos. **BLOQUEADO:** falta uma das direções no conjunto fictício.

## F11 — Laboratório: administração e menor privilégio

**Identidades:** Administrador da Entidade, Operador de Ganhos, Operador de Despesas, cada um com sessão própria. **Contexto:** mesma Entidade fictícia. **Ação:** leitura.

1. Como Administrador, consulte Autorizações, Dados de referência, Lista de Preços e Preços de Ouro disponíveis.
2. Como Operador de Ganhos, confirme as opções pertinentes a ganhos; não tente manipular cadastros de despesa/autorizações.
3. Como Operador de Despesas, confira as opções de despesa; não tente conceder papéis ou lançar Acúmulo.
4. Registre diferenças de visibilidade e reporte privilégios inesperados sem ampliá-los.

**PASSOU:** segregação coerente. **FALHOU:** operação de outro papel sem autorização. **BLOQUEADO:** identidade ausente.

## F12 — Laboratório: autoatendimento e isolamento entre Entidades

**Identidades:** Colaborador fictício da Entidade A e Pessoa compartilhada entre Entidades A/B, quando existente. **Contexto:** sessões próprias e vínculos válidos. **Ação:** leitura.

1. Como Colaborador, confira informações pessoais, Jornada, Conta Corrente e Recibos permitidos; não edite dados de terceiros.
2. Saia e entre como Pessoa compartilhada. Na Entidade A, confira Ator, Jornada e histórico autorizado.
3. Troque pelo seletor para Entidade B e comprove que Pessoa/Conta são a mesma, mas Ator, vínculo, Jornada e histórico são os de B.
4. Volte à Entidade A e verifique que o histórico de B não permanece em tela por engano.
5. Encerre a sessão; se a conta compartilhada não existir no treino, registre o subcaso BLOQUEADO.

**PASSOU:** mesma Pessoa global e rigoroso isolamento de contexto. **FALHOU:** vazamento de dados ou atuação cruzada. **BLOQUEADO:** falta cenário multi-Entidade.

---

**Encerramento do manual:** conclua os exercícios que sua identidade permite, registre os bloqueados, esclareça dúvidas de substituição usando o capítulo 05 e não conclua o treinamento com alterações financeiras não aprovadas. A equipe técnica usa seu próprio guia; a ativação de Produção continua sujeita aos controles de lançamento aplicáveis.
