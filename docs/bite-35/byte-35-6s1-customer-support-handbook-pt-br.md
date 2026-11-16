# ERS — Manual da Especialista de Suporte ao Cliente

**Byte 35.6S.1 — treinamento funcional e técnico.** Versão de treinamento anterior à entrada do cliente em Produção.

**Escopo:** atuar como primeiro ponto de contato, explicar o ERS, reconhecer erros de operação, reproduzir problemas de forma segura e encaminhar incidentes. Este manual **não** concede acesso a Produção, à infraestrutura, aos segredos, ao banco de dados ou aos dados de outras Entidades.

## 1. Como começar

1. Receba do Coordenador de Treinamento o endereço **HTTPS** do ambiente DEV, a Entidade de Treinamento autorizada e o acesso de leitura aos manuais. O endereço atualmente documentado é `https://dev.enterpriseremotesystems.com`; confirme o ambiente na tela antes de usar.
2. Entre com **sua própria Conta de Autenticação**, não com credenciais de administradores ou contas E2E. Troque a senha temporária no primeiro acesso e guarde a senha somente na solução aprovada de 1Password.
3. Confira o nome da Entidade selecionada. Todas as operações deste treinamento são realizadas com dados **fictícios**. Não copie nomes reais de clientes, CPFs, fotografias, saldos ou extratos do cliente para exercícios.
4. A autorização inicial é `TENANT_VIEWER` (consulta). **Não** é uma função de suporte global. Se uma ação de gravação estiver bloqueada, isso é o comportamento esperado: acompanhe a demonstração da pessoa instrutora em uma sessão separada.

## 2. Conceitos básicos (o que não confundir)

| Conceito | Explicação operacional | Erro comum a evitar |
|---|---|---|
| **Entidade** | Organização que mantém dados e regras próprios | Supor que selecionar uma Entidade dá acesso a outra |
| **Pessoa** | Identidade global de uma pessoa no ERS | Criar duas Pessoas para a mesma pessoa |
| **Vínculo** | Associação da Pessoa a uma Entidade | Confundir o Vínculo com uma Conta de Autenticação |
| **Conta de Autenticação** | Credencial individual para iniciar a sessão | Reutilizar conta de outra pessoa ou fixture |
| **Ator** | Identidade/autorização efetiva para o contexto selecionado | Supor que o mesmo Ator opera em todas as Entidades |
| **Colaborador** | Pessoa que possui Jornada de colaboração com uma Entidade | Confundir Pessoa com uma Jornada específica |
| **Jornada** | Período de relacionamento com situação, trabalho e saldo próprios | Misturar dados de Jornadas antigas com a atual |
| **Planejamento** | Trabalho planejado: setor, local, tarefa, substituições | Tratar atribuição planejada como trabalho executado |
| **Informado / Efetivo** | Dados originalmente informados versus trabalho realmente executado | Substituir a evidência original por edição silenciosa |
| **Acúmulo** | Apuração de valores do período conforme regras vigentes | Tratar crédito de apuração como pagamento realizado |
| **Conta Corrente** | Histórico de créditos/débitos da Jornada em BRL e ouro | Somar valores de Pessoas/Entidades/Jornadas diferentes |
| **Recibo** | Evidência assinada/aceita pela parte exigida | Declarar recebido sem o aceite autorizado |
| **Suporte de Acesso** | Fluxo temporário e controlado para suporte autorizado | Supor que um treinamento fornece acesso a clientes |

Para detalhes funcionais e imagens existentes, consulte `byte-35-4-manual-da-entidade-pt-br.md`. Para substituições, consulte `byte-35-4a-cartao-substituicoes-pt-br.md`.

## 3. Roteiro de aprendizagem funcional

Faça as atividades **em leitura** com sua Conta de treinamento. Caso a página não apareça, confirme a Entidade e o papel autorizado; não peça elevação indiscriminada de privilégios.

| Exercício | Onde navegar (Entidade de Treinamento) | O que explicar à pessoa cliente |
|---|---|---|
| F01 — Pessoas e Vínculos | **Pessoas** → lista → detalhe de Pessoa fictícia | Pessoa global, Vínculo por Entidade e estado ativo |
| F02 — Colaboradores/Jornadas | **Colaboradores** → Jornada fictícia | Início/fim, situação, trabalhos e informações da Jornada |
| F03 — Planejamento | **Planejamento** → período fictício | Setor, Local, Tarefa, substituições e diferenças entre planejado/informado/efetivo |
| F04 — Ganhos | **Ganhos / Acúmulo** → período fictício | Como identificar a apuração, sua origem e a evidência sem alterá-la |
| F05 — Despesas | **Despesas** → despesas fictícias | Código, valor, autorização e correção por fluxo permitido |
| F06 — Conta Corrente | **Conta Corrente** → Jornada fictícia | BRL e ouro, sinais de crédito/débito, histórico e saldo da Jornada selecionada |
| F07 — Recibos | **Recibos** → pendentes/concluídos fictícios | Quem deve aceitar/assinar conforme a direção da liquidação |
| F08 — Idioma e UI | Seletor **Português (Brasil)** / **English** | Mensagens de validação, terminologia e como registrar problemas de tradução |

**Regra:** Não assine recibos, não contabilize ganhos, não altere saldos e não finalize Jornadas em exercício de leitura. Para demonstrar escrita, a pessoa instrutora utiliza conta independente de teste com autorização correspondente, em registro estritamente sintético. Nunca use dados financeiros reais.

## 4. Roteiro de aprendizagem técnica

A especialista não precisa executar SQL, Docker, Git, backups ou comandos de Produção. Seu trabalho técnico inicial é **reproduzir, classificar, observar e escalar**.

### D01 — Não consigo entrar

1. Confirme URL HTTPS e ambiente (DEV), sem pedir a senha da pessoa.
2. Pergunte apenas se aparece mensagem de senha temporária, Conta inativa, Vínculo inativo ou permissão negada; registre **texto não sensível** e contexto de Entidade.
3. Se a própria conta de treinamento falhar, peça ao Administrador autorizado que confira no ERS a existência da Conta, do Vínculo e do Ator para a Entidade. A especialista não recebe tokens de redefinição em chamado.
4. Encaminhe suspensão de segurança ou dúvida sobre identidade ao responsável pela Autenticação. Não desative políticas, nem compartilhe credenciais.

### D02 — A tela não aparece / operação proibida

1. Confirme a Entidade selecionada e a página pretendida.
2. Confirme se a autorização `TENANT_VIEWER` é somente de leitura: botão oculto ou gravação negada pode ser correto.
3. Registre resultado observado, papel esperado, e se o comportamento coincide com uma restrição definida no manual. Não tente API direta, Console/DevTools, manipulação de sessão, alteração de Papel ou SQL para contornar a permissão.
4. Quando o acesso deveria existir, escale ao Administrador da Entidade com evidência de comportamento. Nenhum papel adicional deve ser concedido pela própria especialista.

### D03 — Valor, saldo ou período parece incorreto

1. Registre a Entidade fictícia, a Jornada fictícia, o período e a unidade (BRL ou grama de ouro); **não copie dados do cliente real**.
2. Compare trabalho planejado, informado e efetivo; identifique mudanças de Setor/Local/Tarefa.
3. Observe o histórico de Ganhos, Despesas, Conta Corrente e Recibos, sem alterar registros.
4. Se o problema não for resolvido pela explicação funcional, abra um chamado reprodutível para a equipe técnica. Não ajuste valores diretamente no banco.

### D04 — Lentidão, página indisponível ou erro do servidor

1. Anote horário **com fuso**, ambiente DEV, página, ação e mensagem apresentada (sem informações pessoais).
2. Recarregue a página uma única vez se seguro, sem repetir uma operação de pagamento ou outra ação de efeito financeiro.
3. Verifique com o operador técnico se o endpoint de saúde do ambiente está acessível. O operador decide se é incidente de infraestrutura; a especialista não acessa servidor, logs de Produção, backups ou credenciais.
4. Escale ao canal técnico definido. Classifique o chamado como **INCIDENTE** se houver indisponibilidade, possível perda de dados ou possível exposição entre Entidades.

### D05 — Suspeita de exposição entre Entidades

**PARE.** Não navegue mais pelos dados, não tire prints de informação sensível, não exporte documentos. Registre somente ambiente, horário, caminho da tela, Entidade esperada, descrição não sensível do sintoma e imediatamente informe o responsável por segurança. Não reproduza usando contas alheias.

## 5. Como registrar um chamado sem expor dados

**Modelo mínimo de registro:**

| Campo | Exemplo exclusivamente fictício |
|---|---|
| Identificador | `TREINO-CS-001` |
| Ambiente / Entidade | `DEV / ERS_SUPPORT_TRAINING` |
| Categoria | Funcional / Acesso / Erro de UI / Financeiro / Incidente de segurança |
| Idioma | `pt-BR` |
| Data/hora e fuso | `2026-11-15 14:00 America/Sao_Paulo` |
| Página / ação | `Planejamento → selecionar período fictício` |
| Esperado | `Mostra Setor/Local/Tarefa do período selecionado` |
| Observado | `A página de treinamento mostra campo vazio` |
| Gravidade | Baixa / Média / Alta / Crítica |
| Dados protegidos | `Nenhum dado pessoal, senha, CPF, cookie ou token incluído` |
| Destino | Coordenador de Treinamento → Operador Técnico / Administração da Entidade |
| Resultado | Pendente / Encaminhado / Resolvido / Bloqueado |

**Não registre** senha, token, link de redefinição, CPF, RG, informação financeira real, chave privada, arquivo de banco de dados ou conteúdo de cofres 1Password no chamado. Capturas de tela devem usar somente dados fictícios ou ser autorizadas e redigidas.

## 6. Quando resolver, quando encaminhar

- **Responder diretamente:** dúvida sobre navegação, tradução, estados de Jornada, conceitos de Conta Corrente e interpretação de recibos *sem alterar dados*.
- **Encaminhar ao Administrador da Entidade:** concessão/revogação de permissão, alteração de dados da Entidade ou correção operacional permitida, sempre com aprovação.
- **Encaminhar à engenharia:** falha de software reproduzida, erro persistente, divergência de cálculo ou regressão de i18n.
- **Incidente urgente:** potencial vazamento de dados, problema de autenticação generalizado, perda de registros, indisponibilidade ou alteração financeira inesperada. Isolar, preservar evidência mínima e notificar o responsável, sem intervenção privilegiada.

## 7. Avaliação e manutenção do acesso

A aceitação formal segue os testes **T01–T12** em `byte-35-6s1-manual-acceptance.md`, observados pelo Coordenador de Treinamento. O resultado do verificador offline é apenas **REVIEW READY**: não prova que a pessoa entrou no ERS ou que possui acesso real.

Depois de cada publicação em DEV, confirme que o acesso individual, o Vínculo da Entidade de Treinamento e os dados sintéticos ainda existem. Se o banco DEV for reconstruído, informe **BLOQUEADO** até reprovisionar por processo aprovado; nunca faça reset de dados para recuperar uma conta de treinamento. Termine cada sessão saindo do ERS e mantendo documentos em canal de leitura aprovado.

## Glossary Impact

**Especialista de Suporte ao Cliente** e **Coordenador(a) de Treinamento** são responsabilidades operacionais, não Papéis globais no ERS. **Entidade de Treinamento** significa Entidade não produtiva com dados fictícios. Permanecem as definições canônicas de Pessoa, Vínculo, Ator, Colaborador, Jornada, Ganhos, Despesas, Recibo e Conta Corrente.
