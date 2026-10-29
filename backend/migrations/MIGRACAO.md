# Migração 001 — multi-tenant, categorias, QR Code e cliente opcional

## Quando roda

A migração é aplicada automaticamente na primeira abertura do banco por
`backend/src/db.js`, tanto em `npm start` quanto em `npm run seed`/testes.

Ela só executa em banco **legado**, identificado por `users` existir sem a coluna
`tenant_id`. Depois da migração, `users.tenant_id`, `schema_migrations` e
`PRAGMA user_version = 3` marcam o banco como atualizado.

## Idempotência

- A detecção do schema legado evita reaplicar a migração.
- `schema_migrations` registra a versão 3.
- `tenants.slug`, `categories(tenant_id, slug)`, usuários/e-mails, carrinhos por
  tenant e QR tokens têm restrições únicas.
- Os seeds usam `INSERT OR IGNORE`/checagem por minuto, então rodar `npm start`
  várias vezes não duplica categorias, planos, tenant ou superadmin.
- A cópia dos dados ocorre dentro de uma transação; em caso de erro, o SQLite
  faz rollback e o servidor não sobe com schema parcial.

## Backup automático

Antes de alterar o schema, o migrador executa `VACUUM INTO` e grava:

```text
backend/backups/pre-migration-AAAAMMDD-HHMMSS.db
```

Esse arquivo é uma cópia consistente do banco **antes** da migração.

## Dados migrados

| Origem | Destino |
|---|---|
| Todos os registros existentes | Tenant `Meu Negócio` (`slug = default`) |
| `users` antigos | `users.tenant_id = default`; admin continua admin |
| `carts` antigos | categoria **Drift** + `qr_token` UUID v4 |
| `pricing_plans` antigos | `tenant_id = default`, `category_id = NULL` (globais) |
| `sessions` e `session_events` | `tenant_id = default`; `cliente_nome` passa a aceitar NULL |
| `settings` | chave composta `(tenant_id, chave)` |
| `cash_closures` | único por `(tenant_id, data)` |
| — | Categorias Drift, Kart, Patinete e Quadriciclo |
| — | Planos padrão de 5/10/15 min (sem duplicar minutos existentes) |
| — | Superadmin criado pelo seed (`SUPERADMIN_*`) |

## Verificação pós-migração

```bash
cd /home/lucas/Documents/DriftApp
npm run seed
```

Saída esperada: `[seed] Nada a fazer: Banco já possui usuários.`

Opcionalmente, confira o banco:

```bash
sqlite3 backend/data/drift.db "PRAGMA foreign_key_check; SELECT * FROM tenants;"
```

## Rollback

O rollback recomendado é restaurar a cópia automática. Ele desfaz **todas** as
mudanças de schema e volta os dados ao estado anterior.

```bash
cd /home/lucas/Documents/DriftApp
# 1. pare o servidor (Ctrl+C)
# 2. guarde o estado atual, inclusive WAL
cp backend/data/drift.db backend/backups/antes-rollback-$(date +%Y%m%d-%H%M%S).db
# 3. escolha o backup pre-migration mais recente
ls -lt backend/backups/pre-migration-*.db | head
# 4. restaure (substitua o nome abaixo pelo escolhido)
cp backend/backups/pre-migration-20261029-030446.db backend/data/drift.db
rm -f backend/data/drift.db-wal backend/data/drift.db-shm
# 5. suba o código anterior e o servidor
npm start
```

O arquivo SQL de referência do schema final é
[`001_multi_tenant.sql`](./001_multi_tenant.sql). Ele é idempotente para criação
de schema novo (`CREATE TABLE/INDEX IF NOT EXISTS`); a cópia de dados legados e
o controle de versão são feitos pelo runner em `backend/src/db.js`.
