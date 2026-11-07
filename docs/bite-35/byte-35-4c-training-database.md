# Byte 35.4C — Banco de treinamento fictício e determinístico (guia técnico)

**Branch baseline:** `1055-byte-354c-deterministic-fictitious-training-database`, SHA `86d36e5873c59e2e3f86aa280b001f76116ac743`.

**Responsável:** técnico LOCAL autorizado. **Objetivo:** fornecer um arquivo SQLite **novo, independente, descartável, só com dados inventados**, que torne concretos os personagens e percursos F01–F12 do [Manual completo da Entidade](byte-35-4-manual-da-entidade-pt-br.md). **Não é** inicialização de Produção (35.5), nem preparação de ambiente implantado, nem evidência dos seis controles de lançamento (35.7).

## 1. Contrato de segurança — obrigatório

- **Somente LOCAL.** `APP_ENV=development` explícito. `APP_ENV=production`, `ENV=production` e ambiente não informado falham. Nunca copie este banco, contas ou senhas para Development/Test implantados ou Produção.
- O construtor **não recebe banco de origem**; aplica as migrações existentes **em um novo arquivo temporário privado** e gera os dados sintéticos em memória nesse arquivo. Nenhum dado real é copiado.
- O caminho de saída deve terminar com `byte354c-training.db` ou `byte354c-training-<identificador>.db`. O script rejeita `app.db`, arquivo já existente, link simbólico e caminho de backup/Produção. A conclusão publica o novo arquivo de forma atômica sem substituição.
- **Proibidos** `make testdata-local-reset`, `ERS_RESET_DATABASE=true`, `rm backend/data/app.db`, restore em banco existente, migração manual no banco atual e qualquer comando `server-...` neste procedimento.
- Credenciais impressas pelo construtor são **fictícias e públicas para uso LOCAL**, não são segredos de Produção. Não deixe o banco em host exposto e não use seus dados para operação real. A equipe técnica informa identidades aos participantes por procedimento autorizado.
- Para recomeçar um exercício, crie **outro arquivo com nome novo**. Não substitua ou limpe uma base em uso. Não há comando de reset nesta entrega.

## 2. Pré-verificação e construção LOCAL

**Terminal 1 — raiz do repositório; backend e frontend de treinamento ainda parados:**

```bash
pwd
git branch --show-current
git rev-parse HEAD
git status --short
make byte354c-training-check
make byte354c-training-build
make byte354c-training-verify
```

**Antes do patch:** o SHA deve ser `86d36e5873c59e2e3f86aa280b001f76116ac743`. **Depois do patch:** registrar o novo SHA quando o patch for commitado. `git status --short` deve ser conhecido e sem alterações inesperadas. O build cria apenas `backend/data/byte354c-training.db` (arquivo ignorado pelo Git). Se já existe, **STOP**: escolha um nome novo, por exemplo:

```bash
make byte354c-training-build BYTE354C_DB=backend/data/byte354c-training-sessao02.db
make byte354c-training-verify BYTE354C_DB=backend/data/byte354c-training-sessao02.db
```

**PASSOU:** cada comando conclui com código zero, `PASS` de integridade, ausência de violações de chave estrangeira e um SHA-256 **lógico** da carga fictícia. O checksum cobre os dados de treinamento, não promete identidade byte a byte do arquivo SQLite: os defaults de timestamps das migrações são variáveis. Duas gerações independentes devem produzir o **mesmo checksum lógico**. **FALHOU:** checksums diferentes, ausência de identidades, saldos ou referências inválidos. **BLOQUEADO:** banco já existe, não há controle do ambiente ou path não aprovado.

**Importante:** `--verify-only` detecta alterações no estado original da carga (incluindo login, aceitação de recibo e edição de plano); faça a verificação **antes** do uso no navegador. Após exercícios autorizados, divergência do checksum não prova corrupção; compare o resultado do exercício com o estado inicial registrado, e use um **novo arquivo** para recomeçar.

## 3. Executar a interface com o banco isolado

**Verificação prévia:** se já existe backend escutando na porta 8080, **não** inicie outro nem encerre o serviço alheio. Confirme quem é o responsável por esse processo e conclua a sessão anterior usando seu procedimento normal.

**Terminal 2 — raiz do repositório (somente se 8080 estiver livre):**

```bash
make byte354c-training-backend
```

Esse alvo verifica o arquivo escolhido e inicia **somente** o backend LOCAL com `ERS_DATABASE_PATH` apontando para o arquivo fictício. Não inicia Docker nem substitui `backend/data/app.db`; o inicializador LOCAL apenas confere/aplica as migrações canônicas no **próprio arquivo fictício**, com `ERS_RESET_DATABASE=false`, sem bootstrap ou provisão de E2E Admin. Se usou outro caminho:

```bash
make byte354c-training-backend BYTE354C_DB=backend/data/byte354c-training-sessao02.db
```

**Terminal 3:**

```bash
make local-frontend
```

**Navegador:** abra o endereço LOCAL exibido pelo frontend (normalmente `http://localhost:5173`); escolha Português (Brasil). A URL e a porta efetivas devem ser as da execução LOCAL, **nunca** as de Produção. Todas as sessões/contas mencionadas abaixo existem **somente neste banco recém-gerado**.

## 4. Identidades: conta → Pessoa → Ator → Entidade

| Identidade | Login LOCAL fictício | Contexto e finalidade |
|---|---|---|
| APP | `training354c.app@example.test` | Administração global; nunca Ator comum de Entidade |
| ADMIN-A | `training354c.admin-a@example.test` | Helena Costa, Administradora da Entidade A |
| ADMIN-B | `training354c.admin-b@example.test` | Marina Torres, Administradora da Entidade B |
| EARN-A | `training354c.rafael@example.test` | Carla Lima, Operadora de Ganhos da Entidade A |
| EXP-A | `training354c.beatriz@example.test` | Davi Souza, Operador de Despesas da Entidade A |
| COLLAB-A | `training354c.joao@example.test` | Bruno Almeida, autogestão de Pessoa / Jornada da Entidade A |
| SHARED | `training354c.camila@example.test` | Ana Pereira, **uma Pessoa e uma conta**, mas A e B têm vínculos e Atores distintos |
| EXTRA | `training354c.elisa@example.test`, `training354c.fabio@example.test` | Elisa Rocha e Fábio Santos; exercícios de recibos e consulta |

Os logins utilizam as chaves técnicas históricas `joao/camila/rafael/beatriz` do gerador reaproveitado, **não são o nome de outra Pessoa**: na interface serão Bruno, Ana, Carla, Davi. As senhas fictícias são **mostradas no Terminal 1**, e não devem ser reproduzidas em relatórios. Os papéis de EARN-A e EXP-A são intencionalmente distintos; SHARED não recebe concessão delegada. A pessoa sem login na Entidade B, Gisele Nogueira, serve como caso de isolamento.

## 5. Mapa de dados e estados determinísticos

**Data âncora fixa:** `2026-11-07`, UTC, independente da data real do treinamento. Os nomes, IDs de negócio e valores estão descritos como **fictícios**. O construtor aproveita o cenário sintético de 31.4; valores exibidos em tela nunca representam saldo, ouro ou pagamento real.

| Registro de treino | Data | Estado | Uso dos exercícios |
|---|---|---|---|
| `training-354c-entidade-a` | — | Ativa | Principal Entidade A, seis Colaboradores com Jornadas ativas |
| `training-354c-entidade-b` | — | Ativa | Entidade B, Gisele e Ana com vínculos específicos; sem histórico financeiro B |
| `train354c-a-work-period-planning-basic` | 10/11/2026 | PLANNING | Plano limpo, seis linhas, **sem substituição**; F04-S01/S02/S06 |
| `train354c-a-work-period-planning` | 08/11/2026 | PLANNING | Bruno → Ana (F) e Davi → Carla (L); F04-S03/S04/S05/S07 |
| `train354c-a-work-period-completed` | 05/11/2026 | FULLY_POSTED | Ouro, Acúmulo, Conta Corrente; Bruno trabalhou em local real diferente do informado |
| `train354c-a-work-period-next-unplanned` | 06/11/2026 | PLANNING | Mesmo código DAY, **sem plano salvo**; F04-S08 compara proposta com trabalho real de 05/11 |
| `train354c-a-work-period-informed-results` | 04/11/2026 | INFORMED | Resultado editável de Bruno, **somente com autorização de escrita**; F06 |
| Período histórico de Carla | 10/06/2026* | FULLY_POSTED | Jornada antiga encerrada com saldo BRL zero; F03/F09 |
| Recibo de Elisa | 07/11/2026 | PENDING_ISSUE | Entidade → Colaboradora, **Elisa deve aceitar**; F10 leitura |
| Recibo de Fábio | 07/11/2026 | PENDING_ISSUE | Colaborador → Entidade, **Administrador da Entidade deve aceitar**; F10 leitura |

*O período histórico corresponde a `2026-11-07 − 150 dias`; confirme a data exibida na interface. Os exemplos de saldo incluem Bruno +R$230, Ana +4 g de ouro, e uma Jornada histórica de Carla com BRL zero. Elisa e Fábio têm entradas sintéticas compensadas por liquidações finais e **recibos ainda pendentes**, por isso não devem ser encerrados/aceitos sem autorização específica.

## 6. Critérios de aceite e delimitação

Execute [testes manuais 35.4C (T01–T10)](byte-35-4c-manual-acceptance.md) e o conjunto funcional [35.4 F01–F12](byte-35-4-manual-acceptance.md). Todos os testes de UI são feitos com a **identidade e Entidade declaradas**; não use APP para substituir ADMIN-A ou EARN-A.

- **PASSOU:** checks técnicos e UI correspondente à função, substituições na direção correta, saldo e histórico por Jornada, dois recibos com recebedor/aceitante correto, e nenhuma leitura transversal proibida.
- **FALHOU:** dados duplicados, herança financeira de outra Jornada, papel indevido, alteração real da base default, vazamento de outra Entidade, ou resultado salvo sem autorização.
- **BLOQUEADO:** credenciais ausentes, porta ocupada, confirmação de ambiente ausente, script não executado, ou cenário de escrita não aprovado.

Não trate um teste apenas de leitura como prova de que uma gravação ou assinatura foi executada. A base serve à preparação funcional, **não** à evidência de backup/restore, inicialização histórica de 35.5, nem à autorização de ativação de Produção 35.7.

## 7. Encerramento e limpeza segura

1. Faça logout de todas as identidades e feche as abas de treinamento. Não mantenha duas contas misturadas no mesmo perfil de navegação.
2. Interrompa **apenas** o backend iniciado pelo Terminal 2 e o frontend iniciado pelo Terminal 3 com `Ctrl+C`. Não encerre processos preexistentes.
3. Se disponível, verifique `lsof -nP -iTCP:8080 -sTCP:LISTEN`. **PASSOU:** nenhuma porta dessa sessão permanece ocupada; se outro serviço a ocupava antes, mantenha-o intocado e documente.
4. Este Byte não cria containers Docker: nenhum cleanup Docker é requerido. Se outro procedimento criou containers, remova **somente** os IDs que ele registrou, conforme procedimento aprovado; nunca rode `docker stop $(docker ps -q)`.
5. Não apague o banco fictício automaticamente. Se a política LOCAL permitir descarte, o operador identifica o **caminho exclusivo criado por esta sessão**, confirma backend parado e remove apenas esse arquivo específico, jamais `app.db` ou arquivos `.db` por glob. Registre as evidências antes do descarte.
6. Confirme `git status --short`: arquivos `backend/data/*.db` estão ignorados, e nenhum `.auth` / relatório Playwright deve ser commitado por engano.

## Glossary impact

**Termo novo (documentação de treinamento, não domínio):** *Banco de Treinamento Fictício* = arquivo SQLite não produtivo, de conteúdo controlado e checksum lógico reprodutível, cujo ciclo de vida é independente do banco operacional. **Nenhuma** alteração nos significados de Entidade/Tenant, Pessoa, Vínculo, Ator, Jornada, Acúmulo, Conta Corrente, ou recibo. Preserve as equivalências portuguesas aprovadas em 35.4B.
