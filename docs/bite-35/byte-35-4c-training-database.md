# Byte 35.4C — Provisionamento aditivo de dados fictícios de treinamento

**Base de implementação:** worktree `~/projects/EnterpriseRemoteSystems-35.4C`, branch `1055-byte-354c-deterministic-fictitious-training-database`, SHA inicial `b448e4e98c3c5f4bd7ffd1d7d2f029e60ec2b059`.

**Princípio (Navalha de Occam):** reutilizar o esquema, as migrações já aplicadas, os geradores sintéticos do Bite 31.4, a base SQLite existente de cada ambiente e o backend normal. **Não** criar um segundo banco, serviço, mecanismo de reset, tabela de controle ou processo automático de implantação.

## 1. Contrato de operação e segurança

- **LOCAL:** acrescentar registros fictícios ao `backend/data/app.db` do **worktree 35.4C**. O backend normal continua usando este banco; nenhum backend especial.
- **DEV e TST:** acrescentar os mesmos registros ao `/app/data/app.db` já utilizado pelo backend **daquele ambiente**, acessando o volume Docker já montado. Não copiar, importar, restaurar ou substituir o banco.
- **PRD:** absolutamente proibido. Rejeitar `APP_ENV=production`, nomes de caminho de Produção/backup, confirmação conflitante e ambiente ausente. Nunca executar em `/opt/EnterpriseRemoteSystems/production`.
- **Explicitamente manual:** o provisionamento não faz parte de startup, migração nem deploy; executar apenas após autorização da pessoa responsável pelo ambiente e identificação exata do banco.
- **Aditivo e transacional:** novos IDs usam o prefixo estável `train354c-`; duas Entidades usam `training-354c-entidade-a` e `training-354c-entidade-b`. `BEGIN IMMEDIATE` e `PRAGMA foreign_keys=ON` protegem contra inserção parcial. Nenhuma linha alheia à carga é atualizada.
- **Idempotência conservadora:** se as duas Entidades já existem com o cenário original, **PASS: already present; no writes**. Se há apenas uma, conflito de IDs, ou registros modificados por treinamento, **STOP**: não corrigir nem desfazer automaticamente. Não existe reset de carga neste Byte.
- **Esquema já migrado:** o comando verifica integridade, FK e o conjunto completo `schema_migrations`; não aplica migrações nem modifica o banco antes da transação de provisão.
- **Identidades:** oito contas fictícias de Entidade; o Administrador da Aplicação é a **conta global já existente** no ambiente. Não criar uma segunda conta global privilegiada. Para DEV/TST usar somente hashes bcrypt próprios, oriundos de credenciais controladas no 1Password; os hashes públicos do demo 31.4 são permitidos apenas em LOCAL.
- **Determinismo:** data âncora `2026-11-07`; IDs, valores, referências e checksum lógico da carga são iguais em LOCAL, DEV e TST (o checksum normaliza campos de senha e última autenticação, e ignora registros alheios). A verificação inicial após operações de treinamento pode indicar alterações; isso é esperado, mas **nunca** autoriza reescrever a carga.
- **SOP de preservação:** não executar reset, `rm app.db`, migração ad hoc, restauração ou cópia de produção. Seguir o procedimento de backup já aprovado para o ambiente, sem inventar novas etapas de manutenção da base.

## 2. LOCAL — worktree explícito, banco existente

**Identidade:** operador técnico LOCAL; sem login ERS para este passo. **Contexto:** diretório `~/projects/EnterpriseRemoteSystems-35.4C`, não o worktree principal. Antes, confirme que `backend/data/app.db` **já existe**, está migrado e pertence ao backend LOCAL utilizado. Não substitua o arquivo.

```bash
cd ~/projects/EnterpriseRemoteSystems-35.4C
git branch --show-current
git rev-parse HEAD
git status --short
make byte354c-training-check
make byte354c-training-provision-local
make byte354c-training-verify-local
```

**PASSOU:** os três targets finalizam com código 0; o último relata checksum lógico fixo da carga; o banco original foi preservado. Na segunda execução de `make byte354c-training-provision-local`, a resposta deve informar `already present; no writes`. **FALHOU:** duplicação, integridade/FK inválidas, conflito não resolvido, dados de outras Entidades modificados. **BLOQUEADO:** banco não existe, schema antigo, ambiente não confirmado, identidade da base desconhecida ou carga de treinamento já modificada.

Para usar a interface, **não** execute `make byte354c-training-backend` (target retirado). Use os processos LOCAL habituais, em terminais dedicados **somente quando não houver sessão já ativa**:

```bash
# Terminal do backend, se necessário
cd ~/projects/EnterpriseRemoteSystems-35.4C
make local-backend
```

```bash
# Terminal do frontend, se necessário
cd ~/projects/EnterpriseRemoteSystems-35.4C
make local-frontend
```

A URL normalmente é `http://localhost:5173` em LOCAL; DEV/TST implantados permanecem HTTPS. A autenticação LOCAL das contas fictícias usa as senhas públicas do demo 31.4 **exclusivamente neste worktree LOCAL**; a senha de administrador fictício difere da senha de Pessoa fictícia. Nunca reutilize essas senhas em DEV/TST.

## 3. DEV/TST — mesmo banco implantado, sem modificar a imagem da aplicação

**Identidade:** operador técnico com acesso aprovado ao servidor e autorização para o ambiente de destino. **Contexto:** um ambiente de cada vez: primeiro `development` e, depois de aprovar a execução, `test`. O repositório implantado deve conter o script revisado e coincidir com a revisão aprovada; confira isso antes da operação. A imagem do backend não precisa ganhar Python: um contêiner **temporário, sem rede**, com Python padrão executa o script utilizando o mesmo volume SQLite persistente e os arquivos de scripts/migrações do checkout implantado. Nenhum contêiner da aplicação é parado ou alterado.

**Etapa A — Senhas (na máquina de desenvolvimento autorizada, fora do servidor):** crie duas senhas fortes e distintas **para cada ambiente** usando o procedimento aprovado de 1Password. Para obter bcrypt com custo 12 (o utilitário lê stdin e não aceita senha por argumento), execute este bloco duas vezes, uma para ADMIN e outra para Pessoa:

```bash
cd ~/projects/EnterpriseRemoteSystems-35.4C
python3 -c 'import getpass; print(getpass.getpass("Senha de treinamento (sem eco): "))' \
  | (cd backend && go run ../scripts/ers-byte354c-password-hash.go)
```

Armazene os hashes e senhas na coleção correspondente (`ers-development` ou `ers-test`) em 1Password. **Não** inclua senhas nem hashes em Git, capturas, relatórios, `.env` versionados ou histórico do shell. Não reutilize os hashes conhecidos do demo LOCAL. O utilitário requer o Go/toolchain e as dependências já usadas pelo backend; se indisponíveis, **BLOQUEADO**, sem instalar componentes aleatórios no servidor.

**Etapa B — Verificação da configuração implantada (no host Linux autorizado):** escolha apenas um dos ambientes abaixo:

```bash
# Para DEV:
TARGET=development
ENV_FILE=.env.development
BACKEND=ers-dev-backend
VOLUME_OWNER=ers-dev

# OU, para TST (substitua as quatro linhas acima):
# TARGET=test
# ENV_FILE=.env.test
# BACKEND=ers-tst-backend
# VOLUME_OWNER=ers-tst

cd "/opt/EnterpriseRemoteSystems/$TARGET"
pwd
git rev-parse HEAD

test -f "$ENV_FILE" && test -f scripts/ers-byte354c-training-db.py || exit 1
COMPOSE_PROJECT="$(docker inspect "$BACKEND" --format '{{ index .Config.Labels "com.docker.compose.project" }}')"
test "$COMPOSE_PROJECT" = "$VOLUME_OWNER" || { echo 'STOP: wrong Compose project'; exit 1; }
APP_ENV="$(docker exec "$BACKEND" printenv APP_ENV)"
case "$TARGET:$APP_ENV" in
  development:development|test:test) echo 'PASS: backend APP_ENV matches target' ;;
  *) echo 'STOP: backend APP_ENV does not match selected target'; exit 1 ;;
esac
printf 'Backend APP_ENV=%s, target=%s\n' "$APP_ENV" "$TARGET"
VOLUME="$(docker inspect "$BACKEND" --format '{{range .Mounts}}{{if eq .Destination "/app/data"}}{{.Name}}{{end}}{{end}}')"
test -n "$VOLUME" || { echo 'STOP: no named backend data volume'; exit 1; }
docker volume inspect "$VOLUME" --format '{{.Name}}'
# Confirmação humana obrigatória: o valor exibido deve pertencer ao backend do ambiente acima.
```

**PASSOU:** diretório e backend pertencem exclusivamente ao ambiente selecionado; o projeto Compose **exibido** deve corresponder a `VOLUME_OWNER` (em caso contrário STOP), `APP_ENV=development` para DEV ou `APP_ENV=test` para TST, e o volume `/app/data` é um volume persistente nomeado. Se qualquer verificação não corresponder, **STOP**. Nunca tente adivinhar volume, usar o volume de Produção ou copiar o SQLite para corrigir falhas.

**Etapa C — Provisionar (mesmo host e diretório após Etapa B):** recupere **somente** os dois hashes bcrypt do cofre correspondente e cole-os nos prompts invisíveis abaixo. O bloco cria no máximo um contêiner temporário e o remove mesmo quando o comando falha; não encerra contêineres do ERS.

```bash
(
set -euo pipefail
read -r -s -p 'Hash bcrypt ADMIN do 1Password: ' BYTE354C_ADMIN_BCRYPT_HASH; echo
read -r -s -p 'Hash bcrypt Pessoa do 1Password: ' BYTE354C_PERSON_BCRYPT_HASH; echo
export BYTE354C_ADMIN_BCRYPT_HASH BYTE354C_PERSON_BCRYPT_HASH
TRAIN_CONTAINER="ers-byte354c-${TARGET}-$$"
cleanup_354c() {
  # Remove ONLY the container carrying the unique label created in this session.
  if [ "$(docker inspect "$TRAIN_CONTAINER" --format '{{ index .Config.Labels "ers.byte354c.session" }}' 2>/dev/null || true)" = "$TRAIN_CONTAINER" ]; then
    docker rm -f "$TRAIN_CONTAINER" >/dev/null 2>&1 || true
  fi
  unset BYTE354C_ADMIN_BCRYPT_HASH BYTE354C_PERSON_BCRYPT_HASH
}
trap cleanup_354c EXIT

docker run --rm --network none --name "$TRAIN_CONTAINER" \
  --label "ers.byte354c.session=$TRAIN_CONTAINER" \
  --mount "type=volume,source=$VOLUME,target=/work/backend/data" \
  --mount "type=bind,source=$PWD/scripts,target=/work/scripts,readonly" \
  --mount "type=bind,source=$PWD/backend/migrations,target=/work/backend/migrations,readonly" \
  -e APP_ENV="$APP_ENV" \
  -e BYTE354C_ADMIN_BCRYPT_HASH -e BYTE354C_PERSON_BCRYPT_HASH \
  python:3.12-slim-bookworm python3 -B /work/scripts/ers-byte354c-training-db.py \
  --database /work/backend/data/app.db --target "$TARGET" --confirm-target "$TARGET"

# Verificação somente leitura: não requer hashes.
docker run --rm --network none --name "$TRAIN_CONTAINER" \
  --label "ers.byte354c.session=$TRAIN_CONTAINER" \
  --mount "type=volume,source=$VOLUME,target=/work/backend/data" \
  --mount "type=bind,source=$PWD/scripts,target=/work/scripts,readonly" \
  --mount "type=bind,source=$PWD/backend/migrations,target=/work/backend/migrations,readonly" \
  -e APP_ENV="$APP_ENV" \
  python:3.12-slim-bookworm python3 -B /work/scripts/ers-byte354c-training-db.py \
  --database /work/backend/data/app.db --target "$TARGET" \
  --confirm-target "$TARGET" --verify-only

)
```

**Atenção ao ciclo de vida:** o script `backend/build-development-db.sh` já existente **reconstrói o banco DEV durante implantação**. Um novo deploy DEV pode remover esta carga; o ensaio de restauração TST também pode substituí-la. A solução deliberadamente **não** altera essas políticas: após cada substituição aprovada, revalide e provisione de novo, sem assumir permanência dos dados de treino.

**PASSOU:** `PASS: added` na primeira execução, checksum canônico no `--verify-only`, e nenhum novo banco ou serviço. Ao repetir, `PASS: ... already present; no writes`. **FALHOU:** divergência de checksum, mutação de dados não fictícios ou erro de FK. **BLOQUEADO:** imagem Python indisponível, volume não identificado, credenciais ausentes, versão de migrações divergente, ambiente não autorizado ou conflito de dados. Se o `docker run` for interrompido fora do shell padrão, inspecione exclusivamente `docker ps -a --filter label=ers.byte354c.session`; remova **somente** o contêiner registrado por este procedimento. Não execute `docker compose down` nem pare containers alheios. Se TST for restaurado posteriormente por seu processo normal de ensaio, a carga fictícia pode desaparecer; provisione novamente apenas após verificar o novo estado.

## 4. Identidades e contextos de treinamento

| Identidade | Login fictício | Contexto |
|---|---|---|
| APP | **Conta global já existente** do ambiente | Administração global; não criamos outra conta APP |
| ADMIN-A | `training354c.admin-a@example.test` | Helena Costa, administradora da Entidade A |
| ADMIN-B | `training354c.admin-b@example.test` | Marina Torres, administradora da Entidade B |
| EARN-A | `training354c.rafael@example.test` | Carla Lima, operadora de Ganhos da Entidade A |
| EXP-A | `training354c.beatriz@example.test` | Davi Souza, operador de Despesas da Entidade A |
| COLLAB-A | `training354c.joao@example.test` | Bruno Almeida, Pessoa/Jornada da Entidade A |
| SHARED | `training354c.camila@example.test` | Ana Pereira, uma conta/Pessoa, vínculos e Atores distintos em A e B |
| EXTRA | `training354c.elisa@example.test`, `training354c.fabio@example.test` | Elisa Rocha e Fábio Santos |

Os sufixos técnicos históricos `joao`, `camila`, `rafael` e `beatriz` não alteram o nome fictício mostrado na UI. O usuário escolhe a Entidade autorizada antes de cada teste. Logins não conferem direitos fora da Entidade correspondente.

## 5. Cenários fixos

**Âncora de datas:** 07/11/2026, UTC. São registros **fictícios**; não representam clientes, pessoas, pagamento ou ouro reais.

| Registro | Estado | Exercício |
|---|---|---|
| Entidade A e Entidade B | Ativas | Escopo e isolamento; Gisele exclusiva da Entidade B |
| Plano básico em 10/11/2026 | PLANNING | Seis atribuições sem substituições |
| Plano em 08/11/2026 | PLANNING | Bruno → Ana (Folga); Davi → Carla (Licença) |
| Período em 05/11/2026 | FULLY_POSTED | Trabalho informado versus real; ouro, Acúmulo, Conta Corrente |
| Período seguinte em 06/11/2026 | PLANNING | Sem atribuições; proposta de transporte do trabalho real anterior |
| Período em 04/11/2026 | INFORMED | Resultados de Bruno, somente edição autorizada |
| Jornada histórica de Carla | Encerrada | Saldo BRL zero e evidência histórica separada |
| Recibo de Elisa | PENDING_ISSUE | Entidade → colaboradora; aceite pela colaboradora |
| Recibo de Fábio | PENDING_ISSUE | Colaborador → Entidade; aceite pelo administrador |

Bruno possui saldo ilustrativo de +R$230; Ana, +4 g de ouro. Os recibos não devem ser aceitos/assinados no teste de leitura. O checksum original detecta mudanças de negócio provocadas por exercícios; **nunca** aciona reset automático.

## 6. Aceitação e encerramento

1. Execute o teste automatizado `make byte354c-training-check` no worktree 35.4C. Os testes criam e descartam **somente** arquivos migrados temporários, com prova de isolamento e rollback.
2. Provisione explicitamente no ambiente aprovado e **verifique antes do primeiro login**.
3. Execute [aceitação 35.4C T01–T10](byte-35-4c-manual-acceptance.md) e [treinamento funcional F01–F12](byte-35-4-manual-acceptance.md) conforme o contexto e as autorizações do roteiro.
4. Faça logout, encerre **somente** frontend/backend LOCAL iniciados por este roteiro, confira a porta 8080 se aplicável; em DEV/TST mantenha os serviços rodando.
5. Registre revisão, ambiente, volume/arquivo de banco, checksum inicial, resultados e exceções sem segredos. Não apague a carga ou o banco; não faça reset. Confira `git status --short` e evite incluir `.auth`/resultados Playwright.

**PASSOU:** preservação dos dados existentes, idempotência, integridade/FK, escopo entre Entidades, identidades específicas e exercícios aceitos. **FALHOU:** duplicidade, escrita indevida, escalada de privilégio, vazamento transversal ou saldo incorreto. **BLOQUEADO:** precondição ausente. Nenhuma dessas verificações comprova gates de inicialização 35.5 ou ativação de Produção 35.7.

## Glossary impact

Substituir *Banco de Treinamento Fictício* como banco separado pelo termo operacional **Provisionamento Aditivo de Dados Fictícios de Treinamento**: inserção transacional, idempotente e explicitamente autorizada de registros sintéticos no banco não produtivo já existente, sem redefinir Entidade, Pessoa, Vínculo, Ator, Jornada, Acúmulo, Conta Corrente ou Recibo.
