# Apresentação de Demonstração para Potencial Cliente Brasileiro — Mineração Serra Dourada

> Fonte canônica da apresentação comercial do Bite 31.5. A aplicação ao vivo é o recurso visual principal; estes diapositivos organizam a narrativa, os pontos de destaque e as transições.

### Recursos visuais PlantUML

Quatro diagramas simples acompanham esta apresentação. Eles foram desenhados para apoiar a conversa comercial, não para substituir a demonstração ao vivo:

- [`Limite do Locatário`](../uml/demo/01-limite-do-tenant.puml) — use com o Diapositivo 2.
- [`Pessoa, Vínculo e Jornada`](../uml/demo/02-pessoa-vinculo-jornada.puml) — use com os Diapositivos 3 e 4.
- [`História operacional conectada`](../uml/demo/03-cadeia-operacional.puml) — use com o Diapositivo 10.
- [`Três histórias financeiras`](../uml/demo/04-tres-historias-financeiras.puml) — use entre os Diapositivos 8 e 11, conforme a conversa.

## Diapositivo 1 — Enterprise Remote Systems

**Título principal:** Operação remota com identidade, trabalho e finanças conectados.

**Pontos exibidos**

- Pessoas e Jornadas separadas, com histórico preservado.
- Planejamento e produção conectados à remuneração.
- Despesas, Conta Corrente e Recibos com proveniência.
- Dados isolados por Locatário.

**Objetivo do apresentador**

Apresente o problema de negócio: operações remotas geram muitos fatos relacionados a pessoas, trabalho, remuneração, descontos e confirmações. O ERS mantém esses fatos conectados, em vez de espalhá-los por planilhas e mensagens desconectadas.

**Transição**

“Antes de entrar na operação, vou mostrar primeiro o limite de dados que estamos usando nesta demonstração.”

---

## Diapositivo 2 — O limite do Locatário vem primeiro

**Visual sugerido:** [`Limite do Locatário`](../uml/demo/01-limite-do-tenant.puml)

**Título principal:** Cada operação é vista dentro de um Locatário explícito.

**Referência da demonstração**

```text
Mineração Serra Dourada — DEMO
DEMO_BR_SERRA_DOURADA
```

**Pontos exibidos**

- O Locatário selecionado fica visível na estrutura principal da aplicação.
- Pessoas e registros operacionais são carregados nesse contexto de Locatário.
- O contexto do Locatário e a autorização são independentes do idioma de apresentação.
- A demonstração usa somente dados sintéticos.

**Objetivo do apresentador**

Estabeleça a história de segurança e isolamento de dados antes de mostrar Pessoas. Não sugira que o nome do Locatário seja apenas um filtro visual; ele representa o limite operacional dos registros demonstrados.

**Transição**

“Com o limite do Locatário claro, começamos pela identidade permanente das pessoas.”

---

## Diapositivo 3 — A Pessoa é a identidade durável

**Visual sugerido:** [`Pessoa, Vínculo e Jornada`](../uml/demo/02-pessoa-vinculo-jornada.puml)

**Título principal:** A Pessoa permanece mesmo quando a relação operacional muda.

**Referências da demonstração**

- Mariana Alves — Administradora do Locatário e Pessoa.
- João Ferreira — Colaborador ativo.
- Camila Souza — Colaboradora ativa remunerada por comissão.
- Rafael Lima — Jornada histórica e Jornada atual.
- Beatriz Nascimento — Pessoa sem Jornada de Colaborador.

**Objetivo do apresentador**

Explique que Pessoa, Vínculo e Jornada de Colaborador são conceitos diferentes. Use Beatriz para mostrar que uma Pessoa completa não precisa ser Colaboradora. Use Rafael para mostrar que uma Pessoa pode preservar várias Jornadas ao longo do tempo.

**Transição**

“Agora vamos sair do cadastro da Pessoa e olhar a relação operacional: a Jornada.”

---

## Diapositivo 4 — A Jornada preserva o histórico da relação operacional

**Título principal:** Uma nova Jornada não apaga a anterior.

**Referência da demonstração**

Rafael Lima possui:

- uma Jornada histórica encerrada;
- uma Jornada ativa mais recente;
- remuneração diária atual de `R$ 350,00` por dia trabalhado.

**Objetivo do apresentador**

Mostre por que o histórico do ciclo de vida importa. O potencial cliente deve perceber que as configurações atuais de trabalho podem mudar sem reescrever a Pessoa nem apagar a Jornada histórica.

**Transição**

“Com os Colaboradores ativos definidos, o próximo passo é planejar quem trabalha, onde e em quê.”

---

## Diapositivo 5 — O planejamento conecta pessoas ao trabalho

**Título principal:** O Período de Trabalho organiza o plano e o realizado.

**Referências da demonstração**

- período concluído: dois dias antes da data-base do cenário, `06:00-18:00`, estado **Totalmente Lançado**;
- período futuro: um dia depois da data-base do cenário, `06:00-18:00`, estado **Planejamento**;
- João, Camila e Rafael participam dos dois períodos;
- no período concluído, os três estão registrados como **Trabalhou**.

**Objetivo do apresentador**

Use o período futuro para explicar o planejamento e o período concluído para mostrar a passagem do trabalho realizado para a apropriação.

**Transição**

“Quando o trabalho realizado está registrado, a produção e as regras de remuneração podem gerar valor com proveniência.”

---

## Diapositivo 6 — A produção gera apropriação explicável

**Título principal:** Produção registrada → apropriação explicável.

**Referências da demonstração**

- Produção de ouro: `80 g`.
- João: ganho diário de `R$ 300,00`.
- Camila: comissão em ouro de `5% × 80 g = 4 g`.
- Rafael: ganho diário de `R$ 350,00`.

**Objetivo do apresentador**

Use Camila como prova aritmética: o potencial cliente consegue verificar mentalmente que `5% × 80 g = 4 g`. Reforce que o ganho lançado preserva a origem no Período de Trabalho e na atribuição, em vez de se transformar em um saldo sem explicação.

**Transição**

“Remuneração é só metade da história. A operação também precisa registrar despesas e mostrar o efeito líquido para cada Pessoa.”

---

## Diapositivo 7 — As Despesas permanecem rastreáveis

**Título principal:** A Despesa não é apenas um número negativo.

**Referências da demonstração**

- João: duas refeições na cantina, `2 × R$ 35,00 = R$ 70,00`.
- Rafael: passagem aérea sintética, `R$ 350,00`.
- Cada Despesa cria um débito rastreável na Conta Corrente.

**Objetivo do apresentador**

Mostre a proveniência da Despesa até o débito no livro da Conta Corrente. Explique que uma correção ou o ciclo de vida de um Recibo não deve destruir o contexto original do negócio.

**Transição**

“O resultado aparece na Conta Corrente, onde crédito e débito ficam reunidos sem perder a origem.”

---

## Diapositivo 8 — A Conta Corrente explica o saldo

**Visual sugerido:** [`Três histórias financeiras`](../uml/demo/04-tres-historias-financeiras.puml)

**Título principal:** O saldo é consequência de lançamentos auditáveis.

**Referências da demonstração**

```text
João   +R$ 300,00 - R$ 70,00 = R$ 230,00
Camila +4 g                    = 4 g
Rafael +R$ 350,00 - R$ 350,00 = R$ 0,00
```

**Objetivo do apresentador**

Não apresente os saldos como totais opacos. Abra a Conta Corrente de João e aponte o crédito do ganho e o débito da cantina. Se houver tempo, contraste a unidade em ouro de Camila com o saldo zero em BRL de Rafael.

**Transição**

“Alguns débitos também exigem controle documental. É aí que entra o ciclo de Recibos.”

---

## Diapositivo 9 — O estado do Recibo é um controle operacional

**Título principal:** Pendência e conclusão são visíveis, não implícitas.

**Referências da demonstração**

- Recibo de João: **Pendente de emissão**.
- Recibo de Rafael: **Devolvido**.

**Objetivo do apresentador**

Contraste o trabalho pendente com a evidência concluída. O ponto importante não é o código interno do estado; é permitir que o escritório veja o que ainda exige ação e o que já concluiu o ciclo do Recibo.

**Transição**

“Com isso, fechamos o ciclo: identidade, trabalho, produção, valor, despesa e evidência permanecem conectados.”

---

## Diapositivo 10 — Um registro operacional conectado

**Visual sugerido:** [`História operacional conectada`](../uml/demo/03-cadeia-operacional.puml)

**Título principal:** Do cadastro à evidência financeira, a história permanece ligada.

**Cadeia exibida**

```text
Locatário
→ Pessoa
→ Jornada
→ Período de Trabalho
→ Produção / Apropriação
→ Despesa
→ Conta Corrente
→ Recibo
```

**Objetivo do apresentador**

Resuma a proposta de valor em linguagem de negócio: menos reconciliação, responsabilidades mais claras, histórico preservado e um limite operacional visível.

**Transição**

Use o Diapositivo 11 para o encerramento executivo ou continue para o aprofundamento da demonstração.

---

## Diapositivo 11 — Encerramento executivo

**Título principal:** O que o potencial cliente acabou de ver

**Pontos exibidos**

- O limite do Locatário é explícito.
- A identidade da Pessoa sobrevive às mudanças do ciclo de vida da Jornada.
- Planejamento e trabalho realizado se conectam à remuneração.
- Os saldos financeiros podem ser explicados a partir dos eventos de origem.
- O trabalho com Recibos apresenta estados visíveis de pendência e conclusão.
- A apresentação em português não altera a semântica canônica dos dados.

**Pergunta de encerramento**

“Qual dessas etapas hoje exige mais reconciliação manual ou mais confiança em planilhas na sua operação?”

---

## Diapositivo 12 — Mapa para aprofundar a demonstração

**Título principal:** Aprofundamento opcional

**Escolha conforme o interesse do potencial cliente**

- **Identidade e ciclo de vida:** Beatriz em contraste com Colaboradores ativos; Jornadas histórica e atual de Rafael.
- **Operações:** planejamento do Período de Trabalho futuro e suas atribuições.
- **Remuneração:** proveniência da comissão de Camila, `5% × 80 g = 4 g`.
- **Finanças:** saldo de João de `R$ 230,00` e vínculos com as origens.
- **Controles:** Recibo pendente de João em contraste com o Recibo devolvido de Rafael.

**Objetivo do apresentador**

Não percorra mecanicamente todas as telas. Use as perguntas do potencial cliente para escolher uma ou duas ramificações de aprofundamento, preservando o mesmo conjunto determinístico de dados da demonstração.
