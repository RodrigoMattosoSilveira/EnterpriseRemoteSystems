# ERS — Cartão de consulta: substituições no Plano

**Material de apoio à operação da Entidade · Português (Brasil) · Byte 35.4A**

Este cartão complementa o [Manual completo — Capítulo 05](byte-35-4-manual-da-entidade-pt-br.md). Use no treinamento e na preparação de um Período de Trabalho; não substitui aprovação de escala, registro real de resultados ou regras de Acúmulo.

## A regra que evita inverter a substituição

**Se Bruno substitui Ana, é Bruno quem tem Ana escolhida no seu campo Subst.**

| Pessoa que NÃO vai trabalhar | Direção do vínculo | Pessoa que VAI trabalhar |
|---|---|---|
| **Ana** — disponibilidade **F** (Folga) ou **L** (Licença) | **Ana ← Subst. da linha de Bruno** | **Bruno** — disponibilidade **A** (Ativo), **✓** incluído e **Cand.** marcado |

O **Subst. da Ana fica sem destino**. Ana não marca Cand. para ser substituída. Cand. e Subst. são usados na **linha de Bruno**, o substituto. Não há troca de Pessoa, de Jornada nem transferência automática de saldo.

## A legenda compacta da tabela

| Coluna | O que significa |
|---|---|
| **✓** | Incluído no plano — **não** comprova trabalho realizado |
| **Cand.** | Candidato a substituir outra Pessoa; sozinho **não** cria vínculo persistido |
| **Subst.** | Nome do afastado substituído **por quem está na linha** |
| **Disp. A / F / L** | Ativo / Folga / Licença no idioma português |
| **Setor, Local, Tarefa** | Atribuições **informadas**, não trabalho efetivo |

**Diferença de idioma:** em inglês a Folga aparece como **D (Day Off)**. Em português do Brasil, a letra exibida é **F**.

## Receita de 10 passos — Bruno por Ana

1. Escolha Entidade e Período corretos, ainda em **Planejamento** e autorizado para edição.
2. Abra **Plano** e clique **Limpar filtros**.
3. Na linha de **Ana**, marque disponibilidade **F** ou **L** conforme o fato e confirme que sua atribuição será registrada no período.
4. Na linha de **Bruno**, marque **✓** e disponibilidade **A**.
5. Ainda em **Bruno**, marque **Cand.**.
6. Abra **Subst. na linha de Bruno**, não na de Ana.
7. Selecione **Ana**. A lista oferece destinos F/L elegíveis; um alvo já designado para outra Pessoa não está disponível para duplicação.
8. Revise a atribuição Setor/Local/Tarefa de Bruno. Não marque “padrões futuros” por engano.
9. Revise **as duas linhas** e clique **Salvar plano** somente em cenário aprovado.
10. Reabra o Plano para verificar **Bruno → Ana**; confira também **Informar / Imprimir** e seu aviso de afastados não substituídos.

## Antes de informar a escala

- Confirme **quem vai trabalhar** (Bruno: ✓ e A).
- Confirme **quem estará afastado** (Ana: F/L).
- Confirme **quem substitui quem** (Subst. **em Bruno** = Ana).
- Confirme a persistência **depois de salvar e recarregar**, não apenas pelo contador local.
- Confirme que o aviso em **Informar / Imprimir** não trata Ana como sem substituto.
- Não confunda a escala com **Resultados Reais**, **Acúmulo** ou aceite eletrônico: são etapas diferentes.

## Se algo não aparece

1. Só **Sem substituição temporária** em Subst.? Verifique Cand. em Bruno e F/L em Ana.
2. Ana já é alvo de outro substituto? Retire ou corrija o vínculo concorrente.
3. Bruno foi marcado F/L? Substituto precisa estar ativo e incluído.
4. O contador de candidatos mudou, mas nenhum vínculo aparece após recarga? **Cand. isolado não grava uma substituição.**
5. Você escolheu Subst. na linha de Ana? A direção está invertida; corrija na linha do substituto.
6. O período não permite editar? Verifique estado e permissão. **Não** altere registros reais para treinar.

**Para retirar:** no Período editável, use **Sem substituição temporária** no **Subst. do substituto**, salve e reabra. Deixar o alvo F/L sem cobertura pode voltar a gerar aviso em Informar / Imprimir.

**Resultado de treino:** registre PASSOU/FALHOU/BLOQUEADO por exercício; nenhuma ação de treinamento autoriza Produção ou lançamento financeiro.
