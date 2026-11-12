# Byte 35.4B — Contrato de terminologia: Entidade

## Objetivo e limite

Na interface voltada ao cliente em **Português (Brasil)**, **Tenant** é **Entidade**, e **Tenants** é **Entidades**. O ajuste é **somente de apresentação**. Os identificadores internos (`Tenant`, `tenantId`, `tenant_id`, `X-Tenant-ID`, `TENANT_ADMIN`), os códigos de operação, o modelo de autorização, o banco de dados e os contratos de API continuam intactos. `en-US` mantém **Tenant**.

| Conceito técnico | Texto na interface pt-BR |
| --- | --- |
| Tenant | Entidade |
| Tenants | Entidades |
| Tenant Administrator | Administrador da Entidade |
| Tenant Actor | Ator da Entidade |
| Tenant member | Membro da Entidade |
| Person–Tenant Membership | Vínculo da Pessoa com a Entidade |
| Tenant selector | Seletor de Entidade |
| Cross-Tenant isolation | Isolamento entre Entidades |
| Tenant Support Access Lease | Concessão de Acesso de Suporte à Entidade |

## Regras

1. O catálogo `en-US` e `pt-BR` possui exatamente o mesmo conjunto de chaves, inclusive parâmetros `{id}`, `{code}`, `{role}` e `{tenantId}`.
2. Os textos operacionais e de motivos de elegibilidade são traduzidos **ao exibir**, nunca na lógica de concessão, nas condições de bloqueio ou na persistência.
3. No visualizador de auditoria, o rótulo da operação é traduzido, **mas o código técnico original é preservado e permanece visível**, permitindo investigação.
4. O filtro de Entidades do histórico de suporte mantém a semântica combobox: fechado inicialmente; clique exibe todas as opções; digitação filtra; seleção fecha; Escape e perda de foco fecham; limpar a busca não altera a Entidade selecionada.
5. A entrega original de 35.4B renomeou o manual para `byte-35-4-manual-da-entidade-pt-br.md` sem alterar seu conteúdo. A correção posterior de i18n atualizou somente as referências do cabeçalho em português de `Repl.` para **`Subst.`**, no manual, no cartão de consulta e nas instruções de aceitação. **A direção Bruno → Ana e os procedimentos de treinamento permanecem os mesmos.** O verificador 35.4B mantém o SHA-256 do manual revisado como proteção contra alterações não analisadas.
6. O status de testes automatizados não equivale à aceitação humana. T01–T08 são necessários antes da promoção.

## Critérios de bloqueio

Bloquear a promoção se qualquer página pt-BR mostrar **Tenant/Tenants** como rótulo ao cliente, se códigos técnicos forem traduzidos, se a troca de idioma mudar Entidade/Actor, se a documentação quebrar links ou se as verificações LOCAL/CI e a aceitação T01–T08 não passarem.

## Glossário Impact

Registrar sob **Organização/Identidade e Autorização** a preferência pt-BR por **Entidade**, **Entidades**, **Administrador da Entidade**, **Ator da Entidade**, **Membro da Entidade**, **Vínculo da Pessoa com a Entidade** e **Isolamento entre Entidades**. Conservar os nomes canônicos internos em inglês e os significados vigentes de Pessoa, Ator, Vínculo, Função, Jornada e Conta Corrente.
