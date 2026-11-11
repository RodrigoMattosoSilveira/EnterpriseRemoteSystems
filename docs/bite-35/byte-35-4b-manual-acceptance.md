# Byte 35.4B — Aceitação manual LOCAL: Terminologia Entidade (T01–T08)

**Branch:** `1052-byte-354b-entidade-terminology-alignment`
**SHA inicial:** `0cca59f94c3f939c729229ad2eb0a68aae18e409`
**Ambiente:** LOCAL, pelo navegador, com base de dados existente. **Não zerar nem recriar o banco**, não emitir movimentos financeiros, não modificar concessões de Função ou assinaturas para testar terminologia.

**Identidades preexistentes necessárias:** `APP` — Administrador da Aplicação, contexto Global; `ADMIN-A` — Administrador da Entidade A, contexto Entidade A; coordenador de treinamento para inspeção dos manuais. Essas identidades devem existir antes do teste e suas credenciais devem ser obtidas pelo procedimento normal. Se estiverem ausentes, registrar **BLOQUEADO**, nunca criar permissões ad hoc.

**Preparação comum:** confirmar que LOCAL está acessível na interface normal e que todos os testes automatizados exigidos passaram. Em cada teste, anotar data/hora, identidade, Entidade/contexto, navegador, texto exibido, resultado **PASSOU/FALHOU/BLOQUEADO**; sair da sessão antes de trocar de identidade. Trocar o idioma pelo seletor da própria aplicação, sem alterar DevTools ou armazenamento. Use **somente leitura** e cancele ações que gravariam mudanças.

### T01 — Idioma e seletor de Entidade

**Identidade:** ADMIN-A, autenticação normal. **Contexto:** Entidade A. **Pré-requisito:** Entidade A já disponível no seletor.

1. Entrar como ADMIN-A. Abrir o seletor de idioma na interface e selecionar **Português (Brasil)**.
2. Abrir o seletor de Entidade no cabeçalho. Observar o título, as opções, o filtro e a Entidade selecionada. Não alterar o contexto.
3. Fechar e reabrir o seletor. Digitar parte do nome de A; limpar o filtro; pressionar Escape.

**Esperado:** rótulos dizem Entidade/Entidades; a seleção prévia é preservada ao filtrar, limpar e fechar; nenhuma referência a Tenant/Tenants aparece em português. **PASSOU** somente se todos os critérios forem observados; **FALHOU** se texto incorreto ou seleção mudar; **BLOQUEADO** se não houver acesso.

### T02 — Administração → Entidades

**Identidade:** APP. **Contexto:** Global/Administration. **Pré-requisito:** APP tem acesso ao catálogo de Entidades.

1. Sair de ADMIN-A, entrar como APP, selecionar Português (Brasil) e manter o contexto Global.
2. Pelo menu **Administração**, entrar em **Entidades**. Inspecionar títulos, colunas e ajuda na listagem.
3. Abrir uma Entidade existente por **Gerenciar registro**, sem salvar nenhuma alteração. Inspecionar os rótulos de administradores e o significado do limite de duas Pessoas.

**Esperado:** Entidades, Administradores da Entidade e conceitos correlatos em português; nenhum identificador técnico foi alterado. **PASSOU** se todas as telas forem coerentes; **FALHOU** em caso contrário; **BLOQUEADO** sem catálogo.

### T03 — Administração de funções delegadas

**Identidade:** ADMIN-A. **Contexto:** Entidade A. **Pré-requisito:** há um Ator existente em lista, sem criar ou modificar Funções.

1. Sair de APP, entrar como ADMIN-A; selecionar Português (Brasil) e Entidade A.
2. Pelo menu **Administração**, abrir **Autorização da Entidade** (funções delegadas).
3. Revisar a lista de Atores, o badge de Membro da Entidade, o Vínculo e as explicações do ciclo de vida.
4. Observar a opção de Função e seus motivos de desabilitação, sem clicar **Conceder**, **Remover**, **Ativar** ou **Desativar**.

**Esperado:** Ator da Entidade, Membro da Entidade, Vínculo e restrições traduzidos; regras de elegibilidade inalteradas. **PASSOU** somente sem terminologia inglesa visível; **FALHOU** se incorreta; **BLOQUEADO** se não houver Ator.

### T04 — Elegibilidade global de autorização

**Identidade:** APP. **Contexto:** Global/Administration. **Pré-requisito:** existem Atores com diferentes vínculos para observar motivos, sem alterá-los.

1. Entrar como APP em Português (Brasil), Global.
2. Abrir **Administração → Autorização**.
3. Usar os filtros **Elegível** e **Inelegível** e revisar o resumo de vínculo de Atores e as razões apresentadas.
4. Verificar visualmente que códigos como `TENANT_ADMIN` e identificadores de Atores permanecem intactos. Não atribuir Funções.

**Esperado:** as razões usam Entidade/Vínculo; a filtragem mantém o resultado de elegibilidade. **PASSOU** com todos os critérios; **FALHOU** com motivos em inglês; **BLOQUEADO** sem dados adequados.

### T05 — Histórico de acesso de suporte

**Identidade:** APP. **Contexto:** Global/Administration. **Pré-requisito:** catálogo de Entidades e histórico de concessões acessíveis.

1. Na interface **Administração → Acesso de Suporte**, abrir **Histórico de concessões**.
2. Em Português (Brasil), abrir o filtro de Entidade sem digitar e observar a contagem de Entidades ativas.
3. Digitar parte do nome de uma Entidade; escolher uma opção; reabrir para observar a lista completa; depois limpar o texto e pressionar Escape.
4. Inspecionar um registro existente, incluindo descrição, validade fixa e dados técnicos; não aprovar nem encerrar concessões.

**Esperado:** **Todas as Entidades** e contagens localizadas; nenhum filtro muda a seleção sem escolha; detalhes e identificadores preservados. **PASSOU** se coerente; **FALHOU** se o comportamento ou o texto divergir; **BLOQUEADO** se o histórico não estiver disponível.

### T06 — Auditoria: descrição traduzida e código íntegro

**Identidade:** APP. **Contexto:** Global/Administration. **Pré-requisito:** há registros de eventos relevantes na auditoria.

1. Abrir **Administração → Logs de Auditoria**, com Português (Brasil) ativo.
2. Abrir o filtro de operações e comparar descrições como **Ator da Entidade ativado**, **Vínculo da Pessoa com a Entidade criado**.
3. Selecionar uma operação existente, aplicar filtro e verificar o texto da coluna Operação.
4. Conferir que a linha secundária conserva o **código técnico** original, por exemplo `authz.tenant_actors.activate`. Expandir evidência somente para leitura.

**Esperado:** descrição localizada e código original sem tradução. **PASSOU** somente se ambos forem verdadeiros; **FALHOU** se código alterado ou descrição incorreta; **BLOQUEADO** se não houver evento para validar a linha.

### T07 — Alternar pt-BR/en-US sem alterar contexto

**Identidade:** ADMIN-A. **Contexto:** Entidade A. **Pré-requisito:** sessão normal e seletor de idioma.

1. Entrar como ADMIN-A na Entidade A e registrar o contexto atual.
2. Selecionar Português (Brasil), observar **Entidade**, **Ator da Entidade** e **Administrador da Entidade** nas telas acessíveis.
3. Selecionar **English (United States)** e verificar **Tenant**, **Tenant Actor** e **Tenant Administrator** nas mesmas telas.
4. Retornar ao Português (Brasil) e conferir que o contexto permanece Entidade A e a identidade não mudou.

**Esperado:** somente os rótulos mudam, sem alteração de contexto, conta, permissões ou dados. **PASSOU** se correto; **FALHOU** se houver mudança funcional; **BLOQUEADO** se a conta não puder acessar as telas.

### T08 — Manual completo e cartão de substituições

**Identidade:** coordenador de treinamento. **Contexto:** documentos locais, sem login necessário. **Pré-requisito:** arquivos da versão sob teste.

1. Abrir `docs/bite-35/byte-35-4-manual-da-entidade-pt-br.md` em um visualizador Markdown.
2. Verificar os 18 capítulos, F01–F12 e exercícios F04-S01–F04-S08; localizar **Administrador da Entidade**.
3. Abrir `docs/bite-35/byte-35-4a-cartao-substituicoes-pt-br.md`; seguir o link para o capítulo 05.
4. Conferir que a explicação **Cand.** identifica o candidato e **Repl.** identifica quem o substituto está cobrindo, sem inverter a direção e sem salvar dados de planejamento.

**Esperado:** links funcionais, manual integral preservado e orientação Cand./Repl. inequívoca. **PASSOU** se completo; **FALHOU** se faltar conteúdo ou houver orientação invertida; **BLOQUEADO** se arquivos não estiverem acessíveis.

## Fechamento e promoção

Registrar T01–T08 individualmente. **Qualquer FALHOU ou BLOQUEADO impede promoção.** Os testes de UI não substituem `make local-check`, testes de frontend e o GitHub CI na mesma revisão. Não realizar operações destrutivas no banco LOCAL.
