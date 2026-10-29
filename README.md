# 🏁 Drift Rent

SaaS local (LAN/Tailscale) para alugar carrinhos de drift, kart, patinete, quadriciclo e outras
categorias por tempo. O notebook da pista roda **servidor + SQLite**; operadores e administradores
usam **celular pelo navegador ou PWA**. Não há CDN, serviço pago ou dependência de nuvem.

A versão atual é **multi-tenant**: cada negócio tem sua própria frota, usuários, categorias, planos,
sessões, caixa e configurações. Um administrador **nunca** acessa dados de outro negócio.

## O que há de novo

- **Multi-tenant** com signup público, isolamento por `tenant_id` e superadmin separado.
- **Categorias** por negócio (Drift, Kart, Patinete, Quadriciclo + novas categorias).
- **QR Code** por carrinho com impressão de etiquetas 5 × 5 cm, PDF A4 e leitura pela câmera.
- **Check-in/check-out visual**: encerrar escolhendo o destino do equipamento em 1 toque.
- **Cliente opcional**, editável depois, com relatórios agrupando “Sem identificação”.

---

## 1. Início rápido (notebook servidor)

Requisitos: **Node.js >= 22.12** (recomendado Node 24), npm e um notebook na mesma rede dos
celulares (ou na tailnet do Tailscale).

```bash
cd /home/lucas/Documents/DriftApp
npm install
npm start
```

O `npm start`:

1. confere/gera `backend/.env` e segredos;
2. aplica a migração pendente com backup automático;
3. cria o superadmin na primeira execução;
4. builda o frontend quando necessário;
5. sobe o Express + Socket.IO na porta **3000** e, se houver certificado local, HTTPS em **3443**.

Saída esperada:

```text
Local:   http://localhost:3000
Rede:    http://192.168.x.x:3000
Banco:   backend/data/drift.db
```

### Credenciais

| Conta | Quando existe | Senha inicial |
|---|---|---|
| `admin` | banco novo | `admin123` (troca obrigatória) |
| admin existente | banco já em uso | sua senha atual, preservada na migração |
| `superadmin` | criado no primeiro seed | `superadmin123` (troca obrigatória) |

> **Troque a senha do superadmin imediatamente.** Em produção, defina
> `SUPERADMIN_USERNAME`, `SUPERADMIN_PASSWORD`, `SUPERADMIN_NAME` e `SUPERADMIN_EMAIL` no
> `backend/.env` **antes** do primeiro start. Depois de criado, alterar o `.env` não muda a senha;
> use a tela de troca de senha.

### Descobrir o IP do notebook

```bash
hostname -I
# ou
ip -4 addr show | grep inet
```

No celular, abra `http://IP-DO-NOTEBOOK:3000` (para testar) ou o HTTPS do Tailscale (para instalar
o PWA).

---

## 2. PWA no celular via HTTPS do Tailscale

O PWA precisa de contexto seguro. O caminho recomendado é o HTTPS da tailnet:

```bash
# uma única vez, se o comando abaixo der "Access denied":
sudo tailscale set --operator=$USER

# publica a porta 3000 em https://<hostname>.<tailnet>.ts.net
tailscale serve --bg 3000
tailscale serve status
```

Alternativa, executando como root:

```bash
sudo tailscale serve --bg 3000
```

O Tailscale usa certificado confiável; **não é necessário instalar CA local**.

### Instalar

- **Chrome Android:** abra a URL HTTPS → menu **⋮** → **Instalar aplicativo**.
- **Safari iOS:** abra a URL HTTPS → **Compartilhar** → **Adicionar à Tela de Início**.
- No notebook, `localhost` também é contexto seguro.

O app tem manifest **Carrinhos de Drift** / **Drift**, modo standalone, orientação retrato,
service worker com precache do shell, `/api/*` em **NetworkOnly** e banner
**“Nova versão disponível — atualizar”**. O timer nunca é recarregado automaticamente.

### HTTPS local alternativo (sem Tailscale)

```bash
npm run cert
npm start
```

O certificado local fica em `backend/certs/` e a CA pode ser baixada em
`http://IP:3000/local-ca.crt`. Instale a CA no celular para liberar o PWA em
`https://IP:3443`.

---

## 3. Multi-tenant

### Cadastro público

Acesse `https://SEU-ENDERECO/cadastro` (ou **Criar meu negócio** na tela de login).

Ao concluir, o sistema:

1. cria o tenant com slug único;
2. cria o primeiro usuário como **admin** daquele tenant;
3. cria as categorias **Drift 🏎️, Kart 🏁, Patinete 🛴 e Quadriciclo 🏍️**;
4. cria os planos globais de **5, 10 e 15 minutos**;
5. cria as configurações iniciais;
6. autentica o admin e abre o painel.

Cada negócio começa vazio de carrinhos. O admin cadastra a frota, operadores e planos.

### Login

- O campo **Usuário ou e-mail** aceita o username ou o e-mail.
- Operador e admin herdam o tenant do próprio usuário; não existe seletor de tenant.
- Admin cria operadores em **Mais → Usuários**; o `tenant_id` é sempre o do admin logado.
- Negócio desativado bloqueia login e invalida tokens/sockets existentes.

### Superadmin

O superadmin não é um admin de negócio. Ele só acessa a tela **Negócios**:

- lista tenants com contagem de usuários e o e-mail do admin;
- cria novos negócios (tenant + admin inicial + categorias/planos padrão);
- ativa/desativa negócios;
- não baixa backups nem dados operacionais.

Ele **não** acessa `/api/dashboard`, sessões, caixa, relatórios ou qualquer dado operacional
desses tenants (a API responde 403).

### Isolamento

- O middleware de autenticação injeta `req.tenantId` a partir do usuário.
- Toda consulta operacional inclui `tenant_id`.
- Rotas por ID validam o tenant antes de qualquer operação e retornam **404** quando o recurso é de
  outro negócio (não 403, para não revelar existência).
- Socket.IO usa salas `tenant:<id>`; dashboard e avisos de timer são emitidos só para a sala do
  tenant.
- Configurações, fechamentos de caixa e eventos também são por tenant.
- Backups do banco são arquivos do servidor. Não há download de banco inteiro pelo app; use
  `npm run backup`/acesso ao filesystem no notebook.

---

## 4. Categorias e planos

- **Mais → Categorias**: criar, editar, ativar/desativar. Categorias com carrinhos não são apagadas;
  são desativadas para preservar o histórico.
- Todo carrinho exige uma categoria; o card mostra **cor + ícone + nome**.
- O dashboard tem filtros por **categoria** e por **status**.
- **Mais → Planos**: um plano pode ser:
  - **global** (`category_id = NULL`): vale para todas as categorias;
  - **específico**: aparece e é aceito somente para carrinhos daquela categoria.
- O seletor de plano no início/renovação mostra globais + específicos da categoria do carrinho.
- O backend também valida: mandar um plano de outra categoria retorna 400.

Categorias iniciais:

| Categoria | Ícone | Cor |
|---|---|---|
| Drift | 🏎️ | `#f97316` |
| Kart | 🏁 | `#2563eb` |
| Patinete | 🛴 | `#16a34a` |
| Quadriciclo | 🏍️ | `#7c3aed` |

---

## 5. Operação: alugar, encerrar e check-in/out

### Iniciar aluguel

- Pelo dashboard: **Novo aluguel** ou **Iniciar aluguel** no card.
- Pelo QR: **Escanear** → câmera → tela do carrinho → **Iniciar aluguel agora**.
- O nome do cliente é **opcional**; se vazio, a UI mostra **“Cliente não informado”**.
- Escolha plano (filtrado pela categoria) ou valor avulso.
- O timer começa no servidor; fechar o app não interrompe.

### Encerrar (check-in)

Ao encerrar, o operador escolhe em **1 toque** o destino:

1. **Voltar para Disponível**
2. **Enviar para Carregamento**
3. **Enviar para Manutenção**

O pagamento pode ser recebido no encerramento ou ficar pendente no histórico. O carrinho vai para o
status escolhido independentemente do pagamento.

### Outros status

- **Carregando:** o operador pode fazer check-in pelo scan com **Marcar como Disponível**.
- **Manutenção:** somente admin libera pelo scan, com campo de observação.
- **Disponível:** oferece **Iniciar aluguel agora**.
- **Em uso:** oferece **Renovar**, **Encerrar**, **Registrar pagamento** e **Editar cliente**.

### QR sem câmera

A tela **Escanear** sempre mostra o campo **“Sem câmera? Digite o código”**. Digitar `D01`, por
exemplo, abre o mesmo fluxo do QR.

---

## 6. QR Codes e etiquetas

A tela **Mais → QR Codes** (admin) mostra todos os carrinhos, agrupados por categoria.

Cada carrinho tem um `qr_token` opaco (UUID v4), independente do ID numérico. O QR aponta para:

```text
https://SEU-ENDERECO/scan/<qr_token>
```

Ações:

- **Imprimir QR:** abre a impressão do navegador com uma etiqueta de **5 × 5 cm**
  (QR + código + categoria + nome do negócio).
- **Baixar PNG:** gera um PNG da etiqueta no próprio navegador.
- **Imprimir todos (PDF):** o backend gera um **PDF A4** com uma etiqueta por carrinho, em grade
  (3 colunas × 4 linhas, 12 por página), usando `pdfkit` + `qrcode`.

O QR gerado usa o **origin atual** do navegador. Se você abrir o admin pelo Tailscale, a etiqueta
já aponta para o Tailscale. Se abrir por `localhost`, a etiqueta apontará para localhost e não
funcionará no celular; gere novamente pelo endereço HTTPS correto.

### Scan

1. **Mais → Escanear** (ou o item **Escanear** no menu).
2. Toque em **Abrir câmera e escanear** e permita a câmera.
3. O app lê a URL, chama `GET /api/scan/:qr_token` autenticado e abre a tela pelo status.
4. Se o token for de outro negócio: **“QR não reconhecido neste negócio.”**
5. Se a câmera falhar, use o código manual.

A câmera exige HTTPS (Tailscale) ou `localhost`. `html5-qrcode` funciona em Chrome Android e Safari
iOS sem app nativo.

---

## 7. Cliente opcional

- Campo **“Nome do cliente (opcional)”** no início.
- Iniciar com o campo vazio funciona normalmente.
- Histórico e cards mostram **Cliente não informado** (nunca “null”).
- **Editar nome do cliente** disponível para admin e operador no menu de ações do histórico e na
  tela do scan. A alteração gera um `SessionEvent` do tipo `edicao_cliente`.
- Relatórios agrupam sessões sem nome como **Sem identificação**.

---

## 8. Perfis e permissões

| Ação | Superadmin | Admin do tenant | Operador |
|---|---|---|---|
| Criar/desativar tenant | ✅ | ❌ | ❌ |
| Ver/gerenciar dados operacionais | ❌ | ✅ (próprio tenant) | ✅ (próprio tenant) |
| Criar/editar carrinhos, planos, categorias | ❌ | ✅ | ❌ |
| Gerenciar usuários | ❌ | ✅ | ❌ |
| Iniciar/renovar/encerrar sessão | ❌ | ✅ | ✅ |
| Registrar pagamento | ❌ | ✅ | ✅ |
| Desmarcar pagamento / editar valor | ❌ | ✅ | ❌ |
| Cancelar/excluir sessão | ❌ | ✅ | ❌ |
| Caixa, relatórios, configurações | ❌ | ✅ | ❌ |
| QR Codes / imprimir etiquetas | ❌ | ✅ | ❌ |

---

## 9. Banco, migração e rollback

O schema atual inclui:

- `tenants`, `categories`, `users` (com `superadmin`), `carts`, `pricing_plans`, `sessions`,
  `session_events`, `settings`, `cash_closures`, `schema_migrations`;
- `tenant_id` indexado e com FK em todas as tabelas operacionais;
- `carts.category_id` obrigatório, `carts.qr_token` único, `pricing_plans.category_id` opcional;
- `sessions.cliente_nome` nullable;
- `settings` com PK `(tenant_id, chave)` e caixa único por `(tenant_id, data)`.

A migração é automática, transacional e idempotente. Ela detecta banco legado, cria um backup
`backend/backups/pre-migration-*.db` e associa todos os dados existentes ao tenant **Meu Negócio**
(`default`). O admin atual continua no tenant default; o superadmin é criado pelo seed.

Detalhes e rollback: **[backend/migrations/MIGRACAO.md](backend/migrations/MIGRACAO.md)**.
Schema final de referência: **[backend/migrations/001_multi_tenant.sql](backend/migrations/001_multi_tenant.sql)**.

### Restauração manual

```bash
# pare o servidor
cp backend/data/drift.db backend/backups/antes-restauracao.db
cp backend/backups/pre-migration-AAAAMMDD-HHMMSS.db backend/data/drift.db
rm -f backend/data/drift.db-wal backend/data/drift.db-shm
npm start
```

Backups automáticos continuam rodando diariamente (horário/retenção em `backend/.env`). O download
do banco inteiro não é exposto pelo app; use `npm run backup` e o filesystem do notebook.

---

## 10. Testes

### Automatizados

```bash
npm test
```

Cobre autenticação/refresh, rate limit, adiantado, renovação, encerramento, caixa, isolamento entre
tenants, signup público, desativação por superadmin, categorias, planos por categoria, QR/PDF,
check-in, destino do carrinho e cliente opcional.

### Manual no celular (via Tailscale)

Antes de começar: `npm start`, `tailscale serve --bg 3000`, abra o HTTPS no celular.

**Multi-tenant**
- [ ] Abrir `/cadastro`, criar “Praça Teste” com um admin novo; o painel abre com 4 categorias e
      3 planos e **0 carrinhos**.
- [ ] Sair e entrar com o admin do tenant default; a frota dele não aparece para a Praça Teste.
- [ ] Entrar como `superadmin`; criar um negócio pelo botão **Novo negócio**; ver os negócios; desativar a Praça Teste; tentar usar o token
      antigo (deve cair no login); reativar.
- [ ] Logar como operador de um tenant e confirmar que ele só vê a frota/histórico daquele tenant.

**Categorias**
- [ ] Admin cria “Bicicleta”; ela aparece no cadastro de carrinho.
- [ ] Cadastrar carrinho com Bicicleta; o card mostra ícone/cor.
- [ ] No dashboard, filtrar por Bicicleta e por status; combinar os dois.
- [ ] Criar plano específico de Bicicleta e um global; iniciar aluguel de Bicicleta e conferir que
      só aparecem os dois.
- [ ] Tentar iniciar Bicicleta com plano de Drift (API/console) deve falhar.

**QR / check-in**
- [ ] Admin abre **QR Codes**; imprime uma etiqueta (5 × 5 cm) e baixa o PDF A4.
- [ ] Escanear o QR de carrinho disponível; iniciar aluguel.
- [ ] Escanear carrinho em manutenção: não deve permitir aluguel; admin libera com observação.
- [ ] Escanear carrinho em uso; encerrar e escolher **Carregamento**; escanear de novo e tocar em
      **Marcar como Disponível**.
- [ ] Escanear o QR de outro tenant: deve mostrar “QR não reconhecido neste negócio”.
- [ ] Negar a permissão da câmera e usar o código manual; o fluxo deve continuar.

**Cliente opcional**
- [ ] Iniciar sem nome; card/histórico mostram “Cliente não informado”.
- [ ] Editar o nome no histórico; conferir a alteração e o evento de auditoria.
- [ ] Relatório de pendências mostra “Sem identificação” para o cliente nulo.

**Não regressões**
- [ ] Timer continua no servidor ao fechar/abrir o app.
- [ ] Renovação soma tempo e mantém o adiantado; adicional fica pendente.
- [ ] Caixa/fechamento e relatórios batem com os pagamentos.
- [ ] PWA continua instalável e o banner de atualização aparece após um novo build.

---

## 11. Variáveis de ambiente (`backend/.env`)

```env
PORT=3000
HOST=0.0.0.0
TZ=America/Fortaleza
JWT_SECRET=...
JWT_REFRESH_SECRET=...
DB_PATH=data/drift.db
UPLOAD_DIR=uploads
BACKUP_DIR=backups

SUPERADMIN_USERNAME=superadmin
SUPERADMIN_PASSWORD=superadmin123
SUPERADMIN_NAME=Superadministrador
SUPERADMIN_EMAIL=

BACKUP_HOUR=3
BACKUP_RETENTION_DAYS=30
ACCESS_TOKEN_TTL=12h
REFRESH_TOKEN_TTL=30d
BCRYPT_ROUNDS=10
MAX_UPLOAD_MB=6
TRUST_PROXY=0
```

Use `TRUST_PROXY=1` apenas atrás de proxy reverso. Para HTTPS local: `HTTPS_PORT=3443`,
`HTTPS_CERT` e `HTTPS_KEY`.

---

## 12. Scripts

```bash
npm start       # servidor com supervisor + build
npm run dev     # servidor em watch + Vite
npm run build   # build do PWA
npm test        # testes backend
npm run seed    # garante dados iniciais/superadmin e migra se preciso
npm run backup  # cria backup manual global
npm run cert    # gera CA/certificado local
```

---

## 13. Segurança e limitações

- JWT de acesso curto + refresh httpOnly; `token_version` invalida sessões em senha/tenant inativo.
- Senhas com bcrypt; troca obrigatória no primeiro acesso de contas semeadas.
- Rate limit global e no login/signup.
- Autorização por tenant no backend, não só na UI.
- Uploads usam nomes aleatórios; o diretório `/uploads` é público para exibir fotos.
- O painel de tenants é exclusivo do superadmin; backups são arquivos locais do notebook.
- O app foi feito para uma praça/rede local; não há billing, e-mail transacional ou recuperação de
  senha por e-mail.
- O QR lê a câmera via HTTPS; HTTP puro no celular mostra apenas o fallback manual.

---

## 14. Problemas comuns

| Problema | Causa/solução |
|---|---|
| “Access denied” no Tailscale | `sudo tailscale set --operator=$USER` ou `sudo tailscale serve --bg 3000`. |
| PWA não instala | Use HTTPS do Tailscale ou localhost; HTTP no celular não é contexto seguro. |
| Câmera não abre | Permita a câmera no navegador; em iOS/Android use HTTPS. O campo manual continua disponível. |
| QR abre “não reconhecido” | O QR é de outro negócio, foi excluído ou a etiqueta foi gerada em outro endereço. Gere novamente pelo HTTPS correto. |
| QR aponta para localhost | A etiqueta foi impressa pelo admin em `localhost`; abra o admin pelo Tailscale e baixe novamente. |
| Admin não vê backups | O app não expõe download do banco inteiro; use `npm run backup` no notebook. |
| Login de tenant inativo | O superadmin precisa reativar o negócio. |
| Porta 3000 em uso | Feche o outro processo ou altere `PORT`. |
| Migração falhou | O rollback automático manteve o schema; restaure o `pre-migration-*.db` conforme `MIGRACAO.md`. |
