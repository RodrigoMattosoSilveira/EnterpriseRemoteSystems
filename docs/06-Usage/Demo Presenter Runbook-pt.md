# Roteiro do Apresentador — Demonstração Brasileira

## Objetivo

Este roteiro é o script executável do apresentador para a demonstração brasileira determinística da Bite 31.5. Ele pode ser usado com o banco LOCAL dedicado da Bite 31.4 e com os ambientes Development/Test usando o mesmo Locatário sintético.

A demonstração de dados de negócio é intencionalmente somente leitura. Os registros já vêm preparados para que o apresentador possa avançar rapidamente, evitar alterações acidentais e retornar a um cenário conhecido quando necessário. A demonstração opcional de autenticação altera somente a senha sintética de João Ferreira; a próxima reinicialização do banco da demonstração restaura o estado determinístico.

## Preparação do apresentador

### Identidade e dados da demonstração

Use exatamente esta identidade:

```text
Nome:       Mariana Alves
Login:      demo.tenant-admin@example.test
Senha:      Demo-31.4-Brasil!
Papel:      TENANT_ADMIN
Locatário:  Mineração Serra Dourada — DEMO
ID:         demo-br-serra-dourada
Código:     DEMO_BR_SERRA_DOURADA
```

A data de referência padrão do cenário é `2026-09-18`.

O conjunto de dados também provisiona contas de autenticação de autoatendimento para os três Colaboradores ativos:

```text
João Ferreira
Login: demo31.4.joao@example.test
Senha inicial: Demo-31.4-Person!

Camila Souza
Login: demo31.4.camila@example.test
Senha inicial: Demo-31.4-Person!

Rafael Lima
Login: demo31.4.rafael@example.test
Senha inicial: Demo-31.4-Person!
```

Beatriz Nascimento permanece intencionalmente como Pessoa com Vínculo com o Locatário, mas sem Conta de Autenticação.

Para a demonstração opcional de redefinição de senha de João, use:

```text
Demo-31.5-Joao!
```

Essa alteração existe apenas no banco selecionado para a demonstração. A próxima execução de `brazilian-demo-local-reset` ou `brazilian-demo-server-reset` restaura a senha inicial.

### 1. Escolher o ambiente e resetar a demonstração brasileira

Use somente um ambiente em cada apresentação. Nunca execute a reinicialização da demonstração brasileira em Production.

#### LOCAL

Pare qualquer processo do servidor da aplicação que esteja usando `backend/data/brazilian-demo.db` e, a partir da raiz do repositório, execute:

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
make brazilian-demo-presentation-check
```

Se usar uma data de referência diferente da padrão, passe o mesmo `BRAZILIAN_DEMO_AS_OF` na reinicialização e na verificação. Registre a data escolhida. O Período de Trabalho concluído é `data de referência - 2 dias`; o período futuro em planejamento é `data de referência + 1 dia`.

#### Development

No servidor ERS:

```bash
cd /opt/EnterpriseRemoteSystems/development
make brazilian-demo-server-reset ENV=development
```

Esse é o comando determinístico único de preparação para Development. Ele cria backup, substitui o banco do ambiente por uma cópia limpa e migrada da demonstração brasileira, semeia e verifica `Mineração Serra Dourada — DEMO`, reinicia a pilha já implantada e executa verificações de saúde. Não pare os containers Docker manualmente antes desse comando.

#### Test

No servidor ERS:

```bash
cd /opt/EnterpriseRemoteSystems/test
make brazilian-demo-server-reset ENV=test
```

Para uma data de referência diferente:

```bash
make brazilian-demo-server-reset ENV=test BRAZILIAN_DEMO_AS_OF=2026-10-15
```

A reinicialização substitui o banco do ambiente selecionado, mas cria um backup verificado antes e sempre recusa Production.

### 2. Executar a demonstração em LOCAL

Depois da reinicialização e da verificação:

**Terminal 1 — servidor da aplicação**

```bash
ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend
```

**Terminal 2 — interface web**

```bash
make local-frontend
```

Confirme que a revisão exibida pela interface web é a revisão destinada à apresentação. Abra a URL LOCAL exibida pela interface web e continue em **Preparar o navegador**.

Depois da apresentação, encerre a interface web e o servidor da aplicação com `Ctrl+C`. O banco LOCAL normal é separado de `backend/data/brazilian-demo.db`; para voltar ao desenvolvimento normal, inicie novamente o servidor LOCAL sem `ERS_DATABASE_PATH=data/brazilian-demo.db`.

### 3. Executar a demonstração em Development

1. Execute a reinicialização de Development descrito acima.
2. Aguarde o comando terminar com sucesso.
3. Abra a URL normal de Development.
4. Continue em **Preparar o navegador**.
5. Depois da apresentação, restaure o conjunto normal de dados conforme **Retornar Development/Test ao aplicativo normal**.

Não execute um `server-up` adicional imediatamente após `brazilian-demo-server-reset`; a própria reinicialização já reinicia a pilha.

### 4. Executar a demonstração em Test

1. Execute a reinicialização de Test descrito acima.
2. Aguarde o comando terminar com sucesso.
3. Abra a URL normal de Test.
4. Continue em **Preparar o navegador**.
5. Depois da apresentação, restaure o conjunto normal de dados conforme **Retornar Development/Test ao aplicativo normal**.

### 5. Preparar o navegador

1. Abra a URL ERS do ambiente escolhido.
2. Entre com `demo.tenant-admin@example.test` / `Demo-31.4-Brasil!`.
3. Em **Idioma**, selecione **Português (Brasil)**.
4. Confirme que o seletor de Locatário mostra **Mineração Serra Dourada — DEMO** e o código `DEMO_BR_SERRA_DOURADA`.
5. Durante o caminho principal, não crie, edite, informe, lance, cancele, imprima, devolva ou altere registros de negócio.
6. Se for demonstrar o autoatendimento de João, use o fluxo controlado de redefinição de senha abaixo.

### 6. Atualizar a senha de João pela interface do Administrador do Locatário

Use este fluxo somente quando quiser demonstrar administração de autenticação e a experiência de autoatendimento de João.

**Identidade inicial:** Mariana Alves — Administrador do Locatário.

**Contexto obrigatório:** `Mineração Serra Dourada — DEMO`, com **Português (Brasil)** selecionado.

1. Abra **Pessoas**.
2. Localize e abra **João Ferreira**.
3. Na página da Pessoa, vá até **Autenticação**.
4. Confirme status **Habilitada** e login `demo31.4.joao@example.test`.
5. Selecione **Emitir token de redefinição de senha**.
6. Confirme **Token de redefinição de uso único para demo31.4.joao@example.test**.
7. Registre que o token bruto aparece apenas uma vez e possui validade.
8. Selecione **Abrir página de redefinição**.
9. Em **Nova senha**, informe:

```text
Demo-31.5-Joao!
```

10. Repita o valor em **Confirmar nova senha**.
11. Selecione **Redefinir senha**.
12. Confirme a mensagem de sucesso e o retorno ao fluxo de entrada.
13. Entre como João usando `demo31.4.joao@example.test` / `Demo-31.5-Joao!`.
14. Confirme que João chega à experiência de autoatendimento com escopo do Locatário, e não ao espaço administrativo de Mariana.

A redefinição revoga sessões existentes dessa conta. Se Mariana precisar permanecer conectada, use outro perfil ou janela de navegador para João. A próxima reinicialização determinística restaura `Demo-31.4-Person!`.

### 7. Memorizar os números principais

```text
João:   R$ 230,00
Camila: 4 g
Rafael: R$ 0,00
```

Também memorize:

```text
Produção de ouro: 80 g
Comissão de Camila: 5% × 80 g = 4 g
Despesa de cantina de João: R$ 70,00
Passagem aérea de Rafael: R$ 350,00
```

### 8. Retornar Development/Test ao aplicativo normal

Um simples `server-up` não é suficiente depois da demonstração, pois reiniciaria o mesmo banco brasileiro. Restaure o conjunto normal com `testdata-server-reset`.

#### Development — reinicialização pós-demonstração

```bash
cd /opt/EnterpriseRemoteSystems/development
make testdata-server-reset ENV=development
make server-backend-health ENV=development
make server-smoke ENV=development
```

#### Test — reinicialização pós-demonstração

```bash
cd /opt/EnterpriseRemoteSystems/test
make testdata-server-reset ENV=test
make server-backend-health ENV=test
make server-smoke ENV=test
```

Isso retorna Test ao **conjunto padrão resetável de Test**. Não restaura automaticamente um estado ad hoc anterior do banco.

#### Preservação futura do estado de Test

Se no futuro for necessário preservar exatamente um estado ad hoc de Test ao redor de uma demonstração, deve existir primeiro um fluxo suportado de restauração. A sequência pretendida é:

```text
Estado de Test antes da demonstração
    ↓
Backup verificado
    ↓
Reinicialização da demonstração brasileira
    ↓
Apresentação
    ↓
Restauração exata do backup anterior
    ↓
Verificação de saúde do servidor e verificação pública básica
```

Até que esse fluxo exista, use `make testdata-server-reset ENV=test` somente quando for aceitável voltar ao conjunto padrão resetável. Não copie arquivos SQLite manualmente para volumes Docker como restauração improvisada.

---

## Demonstração executiva — aproximadamente 14 minutos

### Etapa 1 — Os dados do Locatário são completamente isolados

**Identidade:** Mariana Alves — Administrador do Locatário.

**Contexto obrigatório:** `Mineração Serra Dourada — DEMO`.

**Navegação:** permaneça no espaço inicial autenticado. Use o seletor de Locatário na barra superior; não digite URLs manualmente.

**Ações**

1. Aponte para o seletor de Locatário.
2. Leia **Mineração Serra Dourada — DEMO**.
3. Mostre o código `DEMO_BR_SERRA_DOURADA`.
4. Confirme **Idioma → Português (Brasil)**.

**Fala sugerida**

“Antes de olhar pessoas ou finanças, este é o limite operacional da demonstração. Tudo o que eu abrir agora está sendo carregado no contexto deste Locatário. O idioma muda a apresentação; ele não muda o Locatário nem a autorização.”

**Transição:** “Com o limite claro, começamos pela Pessoa.”

### Etapa 2 — Pessoa como identidade durável

**Navegação:** abra **Pessoas**.

**Ações**

1. Confirme o título **Pessoas**.
2. Mostre João Ferreira, Camila Souza, Rafael Lima, Beatriz Nascimento e Mariana Alves.
3. Abra **Rafael Lima**.

**Fala sugerida**

“A Pessoa é a identidade durável. Ela não é a mesma coisa que uma Jornada. Assim o histórico operacional permanece preservado sem criar uma nova identidade toda vez que a relação de trabalho muda.”

**Transição:** “Rafael mostra isso muito bem porque possui histórico e uma Jornada atual.”

### Etapa 3 — Histórico de Jornada de Rafael

**Navegação:** na Pessoa de Rafael, use **Abrir Jornada atual** em **Status do Perfil**.

**Ações**

1. Explique que existe uma Jornada histórica encerrada e uma Jornada atual ativa.
2. Na Jornada atual, mostre a remuneração diária de `R$ 350,00` quando visível.
3. Não edite a Jornada.

**Fala sugerida**

“Uma Jornada pode terminar e outra começar sem apagar a Pessoa nem reescrever o histórico. Isso permite entender qual regra operacional estava vigente em cada período.”

**Transição:** “Agora veremos como essa Jornada participa de um Período de Trabalho real.”

### Etapa 4 — Período de Trabalho concluído e trabalho lançado

**Navegação:** abra **Períodos de trabalho**.

**Ações**

1. Abra o período em `data de referência - 2 dias`, código `DAY`, `06:00-18:00`.
2. Confirme o status concluído/lançado, e não o período futuro em planejamento.
3. Mostre João, Camila e Rafael como participantes.
4. Mostre que os três foram registrados como trabalhados.
5. Abra **Acúmulo** apenas para inspecionar o resultado já lançado; não execute nova apropriação.

**Fala sugerida**

“O Período de Trabalho reúne o plano, o realizado e a base da apropriação. A remuneração consegue voltar ao trabalho que a originou.”

**Transição:** “Esse período também possui produção de ouro registrada.”

### Etapa 5 — Produção de ouro e apropriação explicável

**Navegação:** abra **Produção de ouro** pelo menu principal ou pelo vínculo visível do Período de Trabalho.

**Ações**

1. Localize a produção do período concluído.
2. Mostre `80 g`.
3. Retorne ao Período de Trabalho pelo controle visível da interface.
4. Abra **Acúmulo** e mostre os itens já lançados.
5. Destaque o resultado de Camila: `4 g`.

**Fala sugerida**

“A regra da Camila é simples e verificável: cinco por cento de 80 gramas são 4 gramas. O valor não aparece solto; ele vem da produção, do Período de Trabalho, da atribuição e da regra de remuneração.”

**Transição:** “Remuneração é só metade da história. Agora veremos as Despesas.”

### Etapa 6 — Despesas rastreáveis

**Navegação:** abra **Despesas** no menu principal.

**Ações**

1. Localize a Despesa de cantina de **João Ferreira**.
2. Abra a Despesa.
3. Mostre quantidade `2`, preço unitário `R$ 35,00` quando renderizado e total `R$ 70,00`.
4. Mostre a Pessoa/Jornada relacionada e os controles de origem financeira/recibo quando visíveis.
5. Volte para a lista de **Despesas**.
6. Localize a passagem aérea de **Rafael Lima** e mostre o total `R$ 350,00`.
7. Não cancele, substitua ou avance qualquer recibo.

**Fala sugerida**

“A Despesa não é apenas um número negativo. João tem duas refeições que totalizam R$ 70,00; Rafael tem uma passagem aérea de R$ 350,00. Cada Despesa mantém o contexto do cálculo e a ligação com o efeito financeiro.”

**Transição:** “Agora veremos como crédito e débito aparecem juntos na Conta Corrente.”

### Etapa 7 — Conta Corrente de João

**Navegação:** abra **Colaboradores** → **João Ferreira** → **Conta Corrente**.

**Ações**

1. Confirme que a conta identifica João.
2. Mostre o crédito de ganho de `R$ 300,00`.
3. Mostre o débito de Despesa de `R$ 70,00`.
4. Mostre o saldo resultante de `R$ 230,00`.
5. Use controles de origem/proveniência para mostrar a ligação com os registros operacionais quando útil.

**Fala sugerida**

“O saldo não é um total sem explicação. João recebeu R$ 300,00 pelo trabalho e teve R$ 70,00 de Despesa de cantina. O resultado é R$ 230,00 e cada lançamento mantém a sua origem.”

**Transição:** “O débito também gera uma obrigação de recibo.”

### Etapa 8 — Controle de recibos pendentes e concluídos

**Navegação:** abra **Recibos pendentes**.

**Ações**

1. Localize o recibo de João `RCP-DEMO-BR-0001`.
2. Confirme **Pendente de emissão**.
3. Explique que ele representa trabalho de controle ainda pendente; não imprima nem avance o recibo.
4. Para contrastar, abra **Colaboradores** → **Rafael Lima** → **Conta Corrente**.
5. Identifique o débito da passagem de `R$ 350,00` e o recibo devolvido quando visível.
6. Se necessário, abra a Despesa da passagem pelo vínculo de origem e mostre **Devolvido**.

**Fala sugerida**

“João ainda tem uma ação operacional pendente. Rafael, por outro lado, tem o débito da passagem compensando exatamente o ganho do dia e o recibo já devolvido. O sistema separa claramente o que ainda exige ação do que já virou evidência concluída.”

### Etapa 9 — Fechamento executivo

Retorne ao fechamento do deck ou permaneça na evidência financeira se o público estiver engajado.

**Fala sugerida**

“Em uma única história vimos o limite do Locatário, a identidade da Pessoa, o histórico de Jornada, trabalho planejado e realizado, produção, remuneração, Despesas, Conta Corrente e recibos. O objetivo é reduzir reconciliação manual sem perder a origem de cada decisão e valor.”

Pergunte:

“Qual dessas etapas hoje exige mais reconciliação manual ou mais confiança em planilhas na sua operação?”

---

## Demonstração detalhada — estender a sessão para aproximadamente 25–35 minutos

Execute primeiro o caminho executivo e selecione apenas os aprofundamentos relevantes ao interesse do público.

### Aprofundamento A — Beatriz: Pessoa sem Jornada de Colaborador

**Navegação:** **Pessoas** → **Beatriz Nascimento**.

1. Mostre o cadastro completo da Pessoa.
2. Mostre o Vínculo com o Locatário.
3. Confirme que não há Jornada ativa para abrir.
4. Não crie uma Jornada.

**Fala sugerida:** “Ter uma Pessoa no Locatário não significa automaticamente ter uma Jornada de Colaborador. Essa separação permite governar identidade sem inventar uma relação operacional que ainda não existe.”

### Aprofundamento B — Planejamento futuro sem alteração

**Navegação:** **Períodos de trabalho** → período de `data de referência + 1 dia`, status `PLANNING`.

1. Mostre João, Camila e Rafael planejados.
2. Mostre setor/local/tarefa quando visíveis.
3. Explique a diferença entre planejado e realizado.
4. Não informe o período nem altere atribuições.

**Fala sugerida:** “Este é o amanhã planejado. A equipe já está incluída, mas ainda não estamos transformando plano em realizado.”

### Aprofundamento C — Proveniência da comissão de Camila

**Navegação:** **Colaboradores** → **Camila Souza** → **Conta Corrente**.

1. Mostre o saldo de `4 g`.
2. Abra a origem do ganho quando disponível.
3. Rastreie até o Período de Trabalho/apropriação.
4. Relacione novamente com os `80 g` de produção.

**Fala sugerida:** “A Conta Corrente preserva a unidade de valor e a origem. Quatro gramas são o resultado da regra de 5% sobre 80 gramas produzidos.”

### Aprofundamento D — Proveniência da Despesa de João

**Navegação:** **Despesas** → Despesa de cantina de **João Ferreira**.

1. Mostre quantidade `2`.
2. Mostre preço unitário `R$ 35,00` quando renderizado.
3. Mostre total `R$ 70,00`.
4. Mostre os vínculos com Pessoa/Jornada, débito e recibo sem avançar o ciclo do recibo.

**Fala sugerida:** “A Despesa guarda o contexto do cálculo. Não é apenas menos setenta: são duas refeições com preço unitário, total e lançamentos relacionados.”

### Aprofundamento E — Rafael: saldo zero com controle concluído

**Navegação:** **Colaboradores** → **Rafael Lima** → **Conta Corrente**.

1. Mostre `+R$ 350,00` de ganho.
2. Mostre `-R$ 350,00` da passagem aérea.
3. Confirme saldo `R$ 0,00`.
4. Siga o vínculo da Despesa/recibo e mostre **Devolvido**.

**Fala sugerida:** “Saldo zero não significa ausência de história. Há crédito, débito e evidência concluída; a proveniência continua disponível.”

---

## Recuperação

### Recuperação 1 — Perdeu o ponto da interface

1. Use o menu principal visível; não digite URL.
2. Volte para **Pessoas**.
3. Confirme **Mineração Serra Dourada — DEMO** na barra superior.
4. Retome a próxima etapa do roteiro.

### Recuperação 2 — Locatário ou contexto incorreto

1. Interrompa a narrativa.
2. Abra o seletor de Locatário.
3. Selecione **Mineração Serra Dourada — DEMO**.
4. Aguarde o carregamento.
5. Abra **Pessoas** e confirme os nomes semeados.

Se o Locatário da demonstração não estiver disponível, não continue com outro Locatário. Saia, verifique o banco e o servidor da aplicação e entre novamente.

### Recuperação 3 — Idioma incorreto

1. Abra **Idioma**.
2. Escolha **Português (Brasil)**.
3. Confirme **Pessoas**, **Colaboradores**, **Períodos de trabalho**, **Produção de ouro**, **Despesas** e **Recibos pendentes**.
4. Continue sem alterar o contexto do Locatário.

### Recuperação 4 — Registro ou credencial alterado

Encerre a sessão e resete o mesmo ambiente.

**LOCAL**

```bash
make brazilian-demo-local-reset
make brazilian-demo-local-verify
```

Depois reinicie o servidor da aplicação com `ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend` e a interface web com `make local-frontend`.

**Development**

```bash
cd /opt/EnterpriseRemoteSystems/development
make brazilian-demo-server-reset ENV=development
```

**Test**

```bash
cd /opt/EnterpriseRemoteSystems/test
make brazilian-demo-server-reset ENV=test
```

Entre novamente como Mariana, selecione **Português (Brasil)** e confirme:

```text
João:   R$ 230,00
Camila: 4 g
Rafael: R$ 0,00
```

### Recuperação 5 — Um número não corresponde ao roteiro

1. Confirme `Mineração Serra Dourada — DEMO`.
2. Confirme a data de referência.
3. Em LOCAL, execute `make brazilian-demo-local-verify` com o mesmo `BRAZILIAN_DEMO_AS_OF` usado no reset.
4. Em Development/Test, execute novamente a reinicialização do ambiente correspondente.
5. Se a verificação falhar, não apresente nesse ambiente.
6. Se a verificação passar e a interface continuar diferente, registre um defeito; não adapte a narrativa para esconder a divergência.

### Recuperação 6 — Servidor/interface iniciados com banco ou revisão incorretos

1. Pare os dois processos.
2. Inicie o servidor da aplicação:

```bash
ERS_DATABASE_PATH=data/brazilian-demo.db make local-backend
```

3. Inicie a interface web:

```bash
make local-frontend
```

4. Confirme a revisão exibida pela interface web.
5. Entre novamente e confira Locatário, idioma e saldos.

---

## Encerramento

### Encerramento padrão

“ERS mantém identidade, histórico operacional, planejamento, produção e finanças conectados dentro de um limite explícito de Locatário. Nesta demonstração, cada saldo e cada pendência consegue voltar ao evento que o originou.”

Pergunte qual tema merece aprofundamento:

- identidade e ciclo de Jornada;
- planejamento e operações;
- remuneração e produção;
- Despesas e Conta Corrente;
- recibos e controles documentais;
- limite de Locatário e segurança.

### Regras do apresentador

- Nunca use dados de Production ou de clientes nesta demonstração.
- Nunca mude para outro Locatário apenas para contornar uma falha.
- Nunca invente credenciais para uma Pessoa sem Conta de Autenticação.
- Nunca esconda divergência entre o conjunto de dados e a interface com narrativa; recupere ou registre o defeito.
- Prefira estados semeados e somente leitura no caminho principal.
- Depois de qualquer alteração intencional ou acidental, resete antes da próxima apresentação.
