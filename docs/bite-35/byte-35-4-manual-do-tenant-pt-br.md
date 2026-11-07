# ERS — Manual de operação funcional do Tenant (Brasil)

**Byte 35.4 — Mineração Carará | Material de treinamento do cliente | Idioma: português do Brasil**

Este manual explica como utilizar o ERS pela interface do navegador. Não é um procedimento de instalação, recuperação de banco de dados nem autorização para operar com dados reais. O treinamento deve acontecer no ambiente de testes autorizado, com **dados fictícios**, depois da confirmação do instrutor. A entrada da Mineração Carará em Produção depende das etapas 35.5, 35.6 e 35.7 e de aprovação formal. O responsável técnico utiliza um documento separado: [Procedimentos operacionais da equipe técnica](byte-35-4-operational-readiness.md).

## Antes de começar

- Abra o endereço **HTTPS** do ambiente de treinamento informado pelo responsável. Confirme o nome do ambiente e do Tenant antes de registrar algo. Não use o endereço de Produção no treinamento.
- Entre com **sua própria conta**; nunca compartilhe senha. Se não tiver acesso ou se o nome do Tenant estiver incorreto, interrompa o exercício e chame o instrutor.
- No seletor de idioma, escolha **Português (Brasil)**. Somente `pt-BR` e `en-US` são idiomas previstos; mudar o idioma não altera dados financeiros.
- Cada ação disponível depende das permissões da sua conta e do Tenant selecionado. A ausência de um botão pode indicar falta de autorização; não peça que alguém use a conta de Administrador Global para contornar isso.
- Antes de salvar algo, confirme: **Tenant**, **Pessoa/Colaborador**, **Jornada** e, quando aplicável, **Período de trabalho**. Trabalhe somente com os registros fictícios indicados pelo instrutor.

## Termos importantes

| Termo no ERS | Significado operacional |
|---|---|
| Pessoa | Cadastro global do ser humano, que pode participar de diferentes Tenants sem virar duas Pessoas |
| Tenant | Organização que determina o contexto e as permissões; seus dados não devem aparecer em outro Tenant |
| Associação (Membership) | Vínculo da Pessoa com um Tenant específico |
| Conta de autenticação | Identificação usada para entrar no sistema; uma Pessoa possui uma conta |
| Ator (Actor) | Identidade de autorização resolvida no contexto de um Tenant, distinta da Pessoa |
| Colaborador | Participação operacional de uma Pessoa no Tenant, vinculada à sua Jornada |
| Jornada | Período de vínculo financeiro e operacional de um Colaborador com um Tenant |
| Período de trabalho | Período com planejamento, informação de escala, resultados efetivos e Acúmulo |
| Setor/Local/Tarefa informado(a) | Atribuição comunicada no planejamento; continua sendo a base da remuneração existente |
| Setor/Local/Tarefa efetivo(a) | Onde/o que o trabalho realmente ocorreu; campo de evidência e proposta para o próximo período |
| Acúmulo | Cálculo dos lançamentos relativos ao período; exige conferência antes da execução |
| Conta Corrente | Histórico financeiro de uma Jornada, separando valores em BRL e gramas de ouro |
| Recibo | Evidência de recebimento/aceite, cuja assinatura depende da direção da liquidação |

## F01 — Entrar, escolher Tenant e idioma

**Quem:** qualquer conta de treinamento habilitada. **Ponto de partida:** página de entrada, sem sessão anterior.

1. Entre com suas credenciais individuais e confirme seu nome no aplicativo.
2. Se houver seletor de Tenant, escolha o Tenant **fictício** definido pelo instrutor. Confira o contexto exibido no topo.
3. Escolha **Português (Brasil)**. Abra o menu de navegação e identifique apenas as opções permitidas para seu perfil.
4. Atualize a página e confirme que o idioma e o contexto autorizado continuam coerentes.
5. Ao terminar, saia da conta; outro participante deve entrar com a própria conta.

**Resultado esperado:** navegação e registros do Tenant correto, menus coerentes com as permissões, sem acesso a dados de outra organização. Se não existir uma Jornada ativa, o acesso pessoal pode ser somente de leitura; isso não autoriza entrar em um Tenant alheio.

## F02 — Consultar Pessoas e seus vínculos

**Quem:** Administrador do Tenant com permissão de Pessoas. **Caminho:** **Pessoas**.

1. Entre no Tenant fictício e abra **Pessoas** pela navegação.
2. Utilize busca/filtros para localizar a Pessoa fictícia indicada no exercício.
3. Abra o cadastro e confira os dados pessoais e seu vínculo com o Tenant selecionado.
4. Para demonstrar uma alteração, abra o formulário autorizado, revise os campos e **cancele sem salvar**. Alterações reais só com caso aprovado e trilha de auditoria.
5. Volte à lista e confirme que não apareceram vínculos exclusivos de outro Tenant.

**Resultado esperado:** uma Pessoa global, vínculos separados por Tenant, acesso limitado ao contexto atual. Não crie cadastros duplicados para representar a mesma Pessoa em duas organizações.

## F03 — Localizar Colaborador e Jornada

**Quem:** Administrador do Tenant ou operador com permissão de consulta. **Caminho:** **Colaboradores** → selecionar Colaborador → Jornada.

1. Abra **Colaboradores** e selecione o Colaborador fictício indicado pelo instrutor.
2. Confira Jornada ativa/encerrada, datas, situação e informações disponíveis.
3. Abra o histórico da Jornada e observe os limites de edição (não altere registros encerrados).
4. Verifique que **uma nova Jornada começa com saldo zero**; registros históricos não devem ser inseridos como bônus.

**Resultado esperado:** dados de Jornada correspondentes ao Tenant e à Pessoa corretos. Encerramento com saldo diferente de zero deve ser bloqueado; a liquidação exige o fluxo apropriado e recibo.

## F04 — Planejar o Período de trabalho

**Quem:** Administrador do Tenant ou Operador de Ganhos com permissão. **Caminho:** **Períodos de trabalho** → período → **Plano**.

1. Escolha um período fictício ainda editável, identificado por **data e código**.
2. Na aba **Plano**, confira os Colaboradores incluídos, Setor, Local e Tarefa previstos.
3. Use os filtros; ao abrir um seletor, a lista inteira deve aparecer; digitar reduz as opções; Escape fecha sem mudar a seleção anterior.
4. Quando houver um novo período com **o mesmo código** e sem atribuições salvas, observe se a proposta usa o trabalho efetivo do período anterior com resultado **WORKED**; em campo sem efetivo registrado, usa o informado anterior.
5. Não salve a proposta no treinamento de leitura. Se houver exercício de escrita, use somente um período descartável previamente autorizado.

**Resultado esperado:** nenhuma atribuição já salva é substituída automaticamente; não se alteram os padrões gerais da Jornada.

## F05 — Revisar e informar a escala

**Quem:** quem administra o planejamento. **Caminho:** **Períodos de trabalho** → período → **Informar**.

1. Confira a escala, o horário e Setor/Local/Tarefa **informados** na aba **Informar**.
2. Use **Imprimir plano** se necessário; examine o documento sem encaminhar a pessoas reais.
3. Caso o ambiente de treinamento possua um período descartável aprovado, o instrutor pode demonstrar **Marcar como informado**.
4. Se o período não estiver no estado adequado, interrompa e peça orientação; não force a transição.

**Resultado esperado:** planejamento informado permanece rastreável. **Atenção:** o envio automático de notificações e o aceite do Colaborador pertencem ao item **34.4, adiado**. Marcar a escala como informada **não equivale** a obter aceite eletrônico do Colaborador.

## F06 — Registrar resultado e trabalho efetivo

**Quem:** Administrador do Tenant ou Operador de Ganhos autorizado. **Caminho:** **Períodos de trabalho** → período → **Resultados**.

1. Selecione uma atribuição fictícia de um período aberto. Confira, primeiro, os campos **informados**.
2. Escolha a situação efetiva apropriada (por exemplo, **WORKED** quando a pessoa trabalhou).
3. Examine os campos **Setor efetivo**, **Local efetivo** e **Tarefa efetiva**; o exercício de gravação exige autorização expressa para usar um registro descartável.
4. Se permitido, grave uma mudança de trabalho efetivo **diferente** da atribuição informada. Reabra e confira os dois conjuntos de valores.
5. Confira que a mudança **não reescreveu** os dados informados e **não alterou** a base de remuneração já definida.

**Resultado esperado:** trabalho realizado vira evidência e pode orientar a proposta de um próximo período com o mesmo código. Não edite um período **CLOSED**; ele é somente de leitura.

## F07 — Conferir produção e Acúmulo

**Quem:** Operador de Ganhos ou Administrador do Tenant autorizado. **Caminho:** **Produção de ouro** e/ou **Períodos de trabalho** → **Acúmulo**.

1. Selecione o mesmo Período de trabalho e confira produção registrada e seus dados de origem.
2. Abra **Acúmulo**. Leia observações, período, participantes e valores antes de qualquer execução.
3. Para treinamento sem dados descartáveis aprovados, **não clique em executar Acúmulo**. Faça a conferência em tela.
4. Se o instrutor autorizou uma execução de teste, registre o resultado, verifique a atribuição de trabalho na Conta Corrente e evite calcular novamente o mesmo período sem orientação.

**Resultado esperado:** remuneração permanece baseada na atribuição **informada**, enquanto a evidência do trabalho **efetivo** pode aparecer no histórico. Não presuma que o local efetivo altera valores já calculados.

## F08 — Conferir Despesas e correções

**Quem:** Operador de Despesas ou Administrador do Tenant autorizado. **Caminho:** **Despesas**.

1. Abra a lista; filtre pelo Colaborador fictício e confira data, categoria e estado.
2. Abra uma despesa existente. Inspecione recibo, detalhes e opções permitidas.
3. Abra a criação de despesa apenas para observar os campos; **cancele sem salvar**.
4. Uma despesa incorreta não deve ser editada silenciosamente: use o procedimento autorizado de **cancelar e recriar** quando disponível ao Administrador do Tenant, com justificativa e evidência.

**Resultado esperado:** a trilha da despesa original não se perde. Nunca produza lançamentos em dados reais só para demonstrar a tela.

## F09 — Interpretar a Conta Corrente

**Quem:** Administrador/operador autorizado ou Colaborador em sua consulta pessoal. **Caminho:** **Colaboradores** → Jornada → **Conta Corrente**.

1. Selecione explicitamente uma **Jornada**; não confunda seus movimentos com a soma histórica da Pessoa.
2. Leia os saldos de **BRL** e **gramas de ouro** separadamente.
3. Aplique os filtros de créditos, débitos, ganhos, despesas e recibos pendentes.
4. Abra um lançamento do período de trabalho para conferir a evidência de Setor/Local/Tarefa informado(a) e efetivo(a), quando disponível.
5. Se houver opção de **Ganhos atuais e futuros**, confira que a projeção se refere à Jornada selecionada.

**Resultado esperado:** lançamentos imutáveis e rastreáveis; saldos e evidências pertencem à Jornada/Tenant selecionados. Não altere saldos diretamente.

## F10 — Recibos e liquidação de Jornada

**Quem:** Colaborador ou Administrador do Tenant conforme a direção do pagamento. **Caminho:** **Recibos pendentes** e/ou Jornada → liquidação.

1. Em conta fictícia, localize os recibos ainda pendentes e sua origem.
2. Confira **quem paga**, **quem recebe**, moeda/unidade, valor e data antes de qualquer aceite.
3. Quando o **Tenant paga ao Colaborador**, o **Colaborador** precisa confirmar/assinar o recebimento no aplicativo.
4. Quando o **Colaborador paga ao Tenant**, o **Administrador do Tenant** confirma/assina o recebimento no aplicativo.
5. **Não assine** em nome do outro participante. No treinamento de leitura, pare antes da confirmação final.
6. Verifique que a Jornada não pode ser encerrada com saldo diferente de zero nem com obrigações pendentes relevantes.

**Resultado esperado:** recibo assinado preserva evidência auditável e não volta ao estado de pendente. Ausência de assinatura adequada bloqueia a conclusão quando exigida.

## F11 — Administração do Tenant e separação de funções

**Quem:** Administrador do Tenant. **Caminho:** **Autorização**, **Dados de referência**, **Preços do ouro**, **Lista de preços** e **Configurações da conta**, conforme os menus disponíveis.

1. Confirme o Tenant e consulte os papéis existentes. **Não conceda nem revogue** acessos durante a demonstração.
2. Revise dados de referência (Setor, Local, Tarefa), preços e configurações sem salvar.
3. Identifique os recursos do **Operador de Ganhos** e do **Operador de Despesas**; eles não possuem autoridade global implícita.
4. O **Administrador da Aplicação** opera no contexto global; eventual acesso de suporte ao Tenant depende de **Tenant Support Access Lease** aprovado, temporário e auditável.

**Resultado esperado:** privilégios separados, sem exposição de dados de outro Tenant. A concessão de acesso de suporte não cria Pessoa, vínculo, Ator ou Colaborador.

## F12 — Autoatendimento e Pessoa em dois Tenants

**Quem:** Colaborador fictício e, em exercício separado, uma Pessoa fictícia com vínculos em dois Tenants. **Caminho:** **Pessoas**, **Colaboradores** e **Conta Corrente** conforme as permissões.

1. Entre como Colaborador, consulte seu cadastro pessoal, Jornada, Conta Corrente e recibos disponíveis **sem editar informações que não estejam autorizadas**.
2. Saia. Entre com a conta fictícia autorizada que participa de dois Tenants.
3. Selecione Tenant A, confira sua Jornada e Conta Corrente; mude para Tenant B **pelo seletor da interface**.
4. Confira que a Pessoa e a conta de entrada permanecem as mesmas, mas Ator, vínculo, Jornada e movimentos financeiros mudam conforme o Tenant.
5. Saia sem aceitar recibos de terceiros.

**Resultado esperado:** nenhum Tenant revela a associação da Pessoa ao outro por meio de consultas sem autorização.

## Orientação rápida ao final de cada dia

1. Confirmar o Tenant e revisar Períodos de trabalho e resultados pendentes.
2. Conferir lançamentos de produção, despesas, Acúmulo e a Conta Corrente da Jornada correta.
3. Verificar recibos que exigem **a assinatura da pessoa certa**.
4. Escalar divergências antes de confirmar liquidação ou fechamento de Jornada.
5. Sair da sessão em dispositivos compartilhados.

**Não faça sozinho:** inicialização/importação de dados históricos, correção direta de saldos, restauração de banco, provisionamento de credenciais globais, destruição/reset, liberação para Produção, mudança de política de aprovação. Esses procedimentos são da equipe técnica e dependem de autorização formal.

## Quando procurar ajuda

- **Acesso negado / Tenant errado:** pare; informe ao Administrador do Tenant o nome da tela, data, papel e Tenant visível. Não envie senha ou cookies.
- **Valor ou evidência divergente:** anote Jornada/Período de trabalho e número de referência, sem compartilhar dados financeiros pessoais em canais públicos. Não tente compensar lançamentos com bônus.
- **Recibo errado:** não assine; peça validação da direção e do valor.
- **Sistema indisponível:** informe horário, ambiente e operação executada; não tente reiniciar servidores.
- **Mudança operacional de Produção:** somente após autorização dos seis portões de lançamento na Byte 35.7.

## Treinamento e aceite do cliente

Cada participante deve demonstrar com dados fictícios os fluxos compatíveis com seu papel. O instrutor registra **PASS**, **FAIL** ou **BLOCKED** separadamente; ausência de usuário, registro de teste ou autorização é **BLOCKED**, nunca um PASS presumido. O roteiro e o registro de evidência estão em [Aceitação da Byte 35.4](byte-35-4-manual-acceptance.md). O aceite do treinamento **não** aprova o lançamento em Produção.
