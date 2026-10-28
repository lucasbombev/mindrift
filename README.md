# 🏁 Drift Rent

Sistema completo para alugar carrinhos de drift por tempo em uma praça. Um notebook
na pista roda o **servidor + banco**; operadores e o dono usam **celulares pelo navegador
ou PWA**, na mesma rede Wi-Fi. Não precisa de internet, CDN, conta em nuvem ou chave de API.

- **Backend:** Node.js + Express + SQLite (`better-sqlite3`) + Socket.IO
- **Frontend:** React + Vite, mobile-first, PWA via `vite-plugin-pwa`, instalável por HTTPS
- **Acesso externo:** HTTPS confiável do Tailscale (`tailscale serve`)
- **Tempo real:** timer autoritativo no servidor, sincronizado por WebSocket
- **Autenticação:** JWT + refresh cookie + **bcrypt** (`bcryptjs`) + rate-limit
- **Fotos:** upload no disco em `backend/uploads`, servidas por `/uploads`
- **Pagamento:** no início (adiantado) ou no encerramento, com controle de restante após renovação
- **Backup:** cópia automática diária em `backend/backups`
- **Português do Brasil** em toda a interface

> Valores monetários são armazenados em **centavos** (inteiros) para não haver erro de
> arredondamento. Datas são gravadas em UTC e exibidas no fuso configurado.

---

## 1. Início rápido (notebook servidor)

Pré-requisitos: **Node.js 22.12+** (recomendado Node 24 LTS) e npm.

```bash
cd DriftApp
npm install       # só na primeira vez; precisa de internet apenas aqui
npm start
```

Também é possível rodar somente `npm start` na primeira vez: ele instala dependências
ausentes, cria o `backend/.env` com segredos aleatórios, compila o frontend se necessário,
cria o banco e sobe tudo. O comando mantém um supervisor: se o processo do servidor cair
por algum motivo inesperado, ele é reiniciado em 1,5 s e os timers continuam no SQLite.

No terminal aparecerá algo assim:

```
🏁 Drift Rent — servidor no ar
Local:   http://localhost:3000
Rede:    http://192.168.1.50:3000
Fuso:    America/Fortaleza
Banco:   .../backend/data/drift.db
Backup:  .../backend/backups

Primeiro acesso: admin / admin123 / Lucas$99
A troca de senha será exigida no login.
```

1. No notebook, abra `http://localhost:3000`.
2. Entre com **admin / admin123**. / Lucas$99
3. O sistema exige a criação de uma nova senha no primeiro acesso. Anote-a.
4. Nos celulares, abra `http://IP-DO-NOTEBOOK:3000` na mesma Wi-Fi.
5. Crie os operadores em **Mais → Usuários** (cada um também troca a senha no 1º login).

O servidor escuta em `0.0.0.0:3000`, portanto aceita conexões de outros aparelhos da LAN.

> **Deixando o notebook como servidor:** desative a suspensão automática, mantenha-o na
> tomada e não feche o terminal. Para uso em quiosque, abra o Chrome em modo kiosk:
> `google-chrome --kiosk http://localhost:3000`. Se quiser iniciar junto com o sistema,
> crie um serviço systemd/Tarefa Agendada chamando `npm start` na pasta do projeto.

### Descobrir o IP do notebook

- **Windows:** `ipconfig` → “Endereço IPv4” do adaptador Wi-Fi (ex.: `192.168.1.50`).
- **Linux:** `ip addr` ou `hostname -I`.
- **macOS:** `ipconfig getifaddr en0`.
- O próprio painel mostra os endereços em **Ajustes → Rede local**.

Se o celular não abrir, verifique:

- notebook e celular na **mesma rede** (não use “rede de visitantes”);
- firewall do notebook liberando a porta **3000** (e **3443** se usar HTTPS);
- se o roteador tem “isolamento de clientes/AP”, desative;
- o app precisa do notebook ligado: o celular é só a interface.

Firewall:

```bash
# Ubuntu (ufw)
sudo ufw allow 3000/tcp
sudo ufw allow 3443/tcp
```

```powershell
# Windows (PowerShell como administrador)
New-NetFirewallRule -DisplayName "Drift Rent" -Direction Inbound -Protocol TCP -LocalPort 3000,3443 -Action Allow
```

---

## 2. PWA no celular via HTTPS do Tailscale

O PWA precisa de **HTTPS confiável** para registrar o service worker e permitir
“Instalar aplicativo” no Chrome ou “Adicionar à Tela de Início” no Safari. A forma
recomendada neste projeto é o **HTTPS do Tailscale**, que já usa um certificado público
válido e não exige instalar CA no celular.

Pré-requisitos: Tailscale instalado e conectado no **notebook** e no **celular**, ambos na
mesma tailnet. O notebook pode continuar servindo a LAN em HTTP normalmente.

No notebook, com o sistema rodando (`npm start`):

```bash
# se der "Access denied", habilite seu usuário como operador do Tailscale (uma vez):
sudo tailscale set --operator=$USER

tailscale serve --bg 3000
tailscale serve status
```

> Alternativa: `sudo tailscale serve --bg 3000`. O serviço do Tailscale roda como root;
> por isso a publicação exige essa permissão. Depois de `set --operator`, os próximos
> comandos não precisam mais de `sudo`.

O comando publica o app em algo como:

```
https://lucas-pc.tailf257d9.ts.net
```

Abra essa URL no celular (com o Tailscale conectado). O certificado é válido e o PWA
funciona em tela cheia. Para desfazer a publicação:

```bash
tailscale serve reset
```

> Se o `tailscale serve` informar que HTTPS está desabilitado, ative
> **HTTPS Certificates** no painel de administração do Tailscale (DNS) e tente novamente.
> O Tailscale precisa de internet; o modo LAN puro continua funcionando sem ele.

### Instalar o PWA

**Android (Chrome):** abra a URL HTTPS, toque no menu **⋮** e escolha
**Instalar aplicativo** (ou “Adicionar à tela inicial”).

**iPhone/iPad (Safari):** abra a URL HTTPS, toque em **Compartilhar** e escolha
**Adicionar à Tela de Início**.

O ícone instalado abre em modo standalone, com o nome **Drift** / **Carrinhos de Drift**.
O service worker gerado pelo `vite-plugin-pwa` mantém o shell do app em cache; as chamadas
`/api/*` são **NetworkOnly** e nunca vêm do cache, garantindo timer e status sempre do
servidor local. O Socket.IO/WebSocket não é cacheado.

O build de produção (`npm run build`) gera em `frontend/dist/`:

- `manifest.webmanifest` (nome, ícones e modo standalone);
- `sw.js` (Workbox com precache, navegação SPA e runtime caching);
- `registerSW.js` (registro gerado pelo plugin).

Quando há uma nova versão, o app mostra o banner **“Nova versão disponível — atualizar”** e
recarrega somente quando você toca em **Atualizar**.

### Alternativa: LAN com HTTPS local (sem Tailscale)

Também é possível gerar um certificado local. Se o IP do notebook mudar, use
`npm run cert -- --force` (reaproveita a CA já confiável) e reinicie:

```bash
npm run cert
npm start
```

O app atende em **`https://IP-DO-NOTEBOOK:3443`**. Para o navegador confiar:

1. Baixe `backend/certs/local-ca.crt` pelo painel em **Ajustes → Rede local → baixar
   certificado local**.
2. **Android:** Ajustes → Segurança → Criptografia e credenciais → Instalar certificado →
   Certificado de CA → selecione o arquivo.
3. **iPhone/iPad:** instale o perfil em Ajustes → Geral → VPN e Gerenciamento de
   Dispositivos e ative a confiança em Ajustes → Geral → Sobre → Ajustes de Confiança de
   Certificado.
4. Abra `https://IP:3443`, faça login e instale o PWA.

> Em `http://IP:3000` (sem HTTPS), o celular cria apenas um atalho; o service worker e a
> instalação completa ficam bloqueados pela política do navegador. Para uso na LAN sem
> Tailscale, prefira a opção HTTPS local acima.

No modo LAN puro, o Wi-Fi não precisa ter internet; ele só precisa conectar os celulares
ao notebook. Para o HTTPS via Tailscale, o notebook precisa de internet para o túnel.
Não há requisições a CDNs: fontes são do sistema e ícones são SVG locais.

---

## 3. Como usar no dia a dia

### Painel (tela principal)

- Grade de carrinhos com foto/código/status.
- **Verde** disponível, **azul** em uso, **amarelo** carregando, **cinza** manutenção.
- Timer regressivo atualizado a cada segundo (o relógio é o do servidor).
- Resumo: total de carrinhos, em uso, faturamento recebido hoje e pendências do dia.
- Alertas: aviso **60 s antes** (configurável em Ajustes) e alarme visual/sonoro/vibração
  no fim do tempo. O título da aba pisca e, com permissão, uma notificação é exibida.
- **Ative o som** no primeiro toque (botão “Ativar som”). Por política dos navegadores,
  áudio só toca após uma interação do usuário. Deixe o painel aberto no notebook/celular.

### Iniciar aluguel

1. Toque em **Iniciar aluguel** no carrinho disponível.
2. Informe o cliente, escolha um plano ou use **Outro valor** (minutos/valor livres).
3. Escolha **[No final]** ou **[Pago adiantado]**. No adiantado, selecione a forma de
   pagamento (dinheiro/Pix/cartão); o valor entra imediatamente no caixa do dia.
4. Confirme. O servidor grava `iniciado_em`/`fim_previsto_em` e marca o carrinho como
   **em uso**. O timer começa no servidor, não no celular.

Se o cliente renovar um aluguel já pago adiantado, apenas o **valor adicional** fica
pendente para o encerramento; o valor já recebido não é cobrado de novo. Ao encerrar, o
sistema mostra o total, o adiantado e o restante a receber.

### Durante a sessão

- **Renovar:** adiciona tempo/valor sem encerrar. Se o tempo já estourou, a renovação conta
  a partir de agora.
- **Encerrar:** registra o horário real, a duração e o valor; permite receber agora
  (dinheiro/Pix/cartão) ou deixar **pendente** para acertar depois no histórico.

### Histórico

Filtros por período (atalhos Hoje/7 dias/30 dias), carrinho, cliente, pago/pendente e status.
Ações por sessão:

- **Ver detalhes** e a auditoria completa (`SessionEvent`);
- **Registrar/alterar pagamento** (operador também pode marcar como pago);
- **Editar valor** (somente admin, com registro na auditoria);
- **Cancelar** (somente admin, motivo obrigatório, mantém no histórico);
- **Excluir do histórico** (somente admin, soft delete; auditoria fica preservada).

### Relatórios (admin)

- Recebido por dia, com atalhos para 7 dias, semana atual, mês, 30 dias e período livre.
- Ticket médio, sessões, cancelamentos, faturamento por forma de pagamento.
- Carrinhos mais usados, horário de pico e **pendências por cliente** (devedores).

### Caixa (admin)

- Totais do dia por forma de pagamento e por operador.
- Lista de pagamentos e de sessões pendentes.
- **Fechar caixa** arquiva um resumo imutável (com observação, quem fechou e os totais).
- O comprovante pode ser reimpresso pelo navegador.

### Cadastros (admin)

- **Carrinhos:** código único, foto (câmera/galeria), status, observação. Exclusão é soft
  delete; o histórico permanece.
- **Planos:** nome, minutos, valor, ativo/inativo. Planos já usados são desativados em vez
  de apagados.
- **Usuários:** admin/operador, ativar/desativar, redefinir senha. O sistema impede ficar
  sem administrador ativo e impede desativar a própria conta.
- **Ajustes:** nome do estabelecimento, antecedência do aviso, backups, informações de rede.

---

## 4. Perfis e permissões

| Recurso | Admin | Operador |
|---|---|---|
| Painel / timer / alertas | ✅ | ✅ |
| Iniciar, renovar e encerrar sessões | ✅ | ✅ |
| Marcar pagamento/restante | ✅ | ✅ |
| Desmarcar parcela final | ✅ | ❌ 403 |
| Histórico e detalhes/auditoria | ✅ | ✅ |
| Cancelar sessão / editar valor / excluir histórico | ✅ | ❌ 403 |
| Relatórios, caixa e fechamento | ✅ | ❌ 403 |
| Carrinhos, planos, usuários e ajustes | ✅ | ❌ 403 |

O backend aplica o RBAC em todas as rotas; a interface também esconde/redireciona as telas
administrativas para operadores.

---

## 5. Banco de dados e schema

Arquivos em tempo de execução:

```
backend/data/drift.db          # SQLite (WAL)
backend/uploads/               # fotos
backend/backups/               # .db com timestamp
```

Tabelas principais:

```sql
users (
  id, nome, username UNIQUE NOCASE, email, senha_hash, role CHECK(admin|operador),
  ativo, must_change_password, token_version, ultimo_login_em, criado_em, atualizado_em
)

carts (
  id, codigo UNIQUE NOCASE (entre ativos), foto_url, status
  CHECK(disponivel|em_uso|carregando|manutencao), observacao,
  criado_em, atualizado_em, excluido_em
)

pricing_plans (
  id, nome, minutos, valor_centavos, ativo, criado_em, atualizado_em
)

sessions (
  id, cart_id, cliente_nome, plano_id, plano_nome (snapshot),
  minutos_contratados, valor_centavos, iniciado_em, fim_previsto_em,
  encerrado_em, duracao_segundos, status CHECK(em_andamento|encerrada|cancelada),
  pago, forma_pagamento CHECK(dinheiro|pix|cartao), operador_id, observacao,
  pagamento_adiantado, valor_adiantado_centavos, forma_adiantado, adiantado_em,
  motivo_cancelamento, pago_em, criado_em, atualizado_em, excluida_em, excluida_por
)

session_events (
  id, session_id, tipo CHECK(inicio|renovacao|encerramento|cancelamento|pagamento|
  edicao_valor|exclusao), payload_json, usuario_id, criado_em
)

settings (chave PRIMARY KEY, valor, atualizado_em)
cash_closures (id, data UNIQUE, total_centavos, total_pendente_centavos,
               qtd_sessoes, payload_json, usuario_id, criado_em)
```

Garantias importantes:

- índice parcial **único** garante **no máximo uma sessão em andamento por carrinho**;
- `plano_nome` e valores são copiados para a sessão (mudanças futuras no plano não alteram
  o histórico);
- toda operação relevante grava `session_events` (quem, quando, payload);
- exclusões de histórico são **soft delete** (`excluida_em`) para preservar auditoria;
- dinheiro em centavos; horários em ISO UTC;
- o **adiantado** é registrado em `adiantado_em`/`forma_adiantado` e entra no caixa no dia
  do início; o restante (após eventual renovação) entra no dia do encerramento. O campo
  `pago` só fica verdadeiro quando o total foi quitado.

---

## 6. Timer, tempo real e resiliência

- Ao iniciar/renovar, o **servidor** define `fim_previsto_em` no SQLite. O celular nunca
  calcula o fim “por conta própria”.
- Todo cliente autenticado recebe via Socket.IO:
  - snapshot do painel a cada mutação;
  - `tick` com `{ now }` a cada 1 segundo (sincroniza o relógio);
  - `session:expiring` / `session:expired` no cruzamento dos limites.
- O cliente calcula o restante com o **offset do relógio do servidor**, então celulares com
  hora errada mostram o tempo correto.
- **Fechar/reabrir o navegador** não muda nada: o estado vem do banco.
- **Reiniciar o backend** não zera timers: as sessões `em_andamento` são recarregadas do
  SQLite e o cálculo é refeito a partir de `fim_previsto_em`.
- O sistema **não encerra** a sessão automaticamente no fim; ele alerta e libera o operador
  para decidir entre renovar ou encerrar.
- O alarme final é repetido até ser confirmado. A confirmação fica no `localStorage` por
  sessão/versão de término, para não repetir ao recarregar a página.

---

## 7. Backup e restauração

- **Automático:** todos os dias às `03:00` (configurável por `BACKUP_HOUR`), usando a API
  de backup do SQLite (segura com WAL). Nome: `auto-AAAA-MM-DD_HH-mm-ss.db`.
- **Na subida:** se o último backup tiver mais de 24 h, cria um na hora.
- **Manual:** `npm run backup` ou **Ajustes → Backups → Criar agora**.
- **Retenção:** 30 dias por padrão (`BACKUP_RETENTION_DAYS`); backups antigos são removidos.
- **Download:** em Ajustes, botão “Baixar”, ou via API `/api/settings/backups`.

Restaurar:

```bash
# 1. pare o servidor (Ctrl+C)
# 2. guarde o banco atual, por segurança
cp backend/data/drift.db backend/data/drift.db.antes
# 3. copie o backup escolhido
cp backend/backups/auto-2026-10-27_03-00-00.db backend/data/drift.db
rm -f backend/data/drift.db-wal backend/data/drift.db-shm
# 4. suba novamente
npm start
```

Recomendação: copie também `backend/backups/` e `backend/uploads/` para um pendrive/HD
periodicamente. O backup do banco não inclui as fotos.

---

## 8. Testes

```bash
npm test
```

Cobrem, com banco temporário isolado:

- auth: login, senha obrigatória no 1º acesso, refresh, logout, token inválido, rate-limit;
- RBAC: operador recebe **403** em usuários, relatórios, caixa, ajustes, carrinhos, planos,
  cancelamento, edição de valor e exclusão de histórico;
- carrinhos: upload real de imagem (JPEG), validação do conteúdo, código único;
- sessões: início com tempo do servidor, bloqueio de carrinho em uso/manutenção, renovação
  somando tempo/valor, encerramento pago/pendente, pagamento pelo operador;
- pagamento adiantado: entrada imediata no caixa, renovação cobrando apenas o adicional,
  encerramento sem cobrança duplicada e baixa da parcela final;
- resiliência: nova conexão ao mesmo SQLite preserva a sessão ativa e o `fim_previsto_em`;
  sessão vencida continua ativa e pode ser encerrada;
- auditoria: eventos de início, renovação, encerramento, pagamento e edição de valor;
- cancelamento, soft delete e filtros do histórico;
- relatórios, caixa, fechamento (409 na segunda vez) e backup em disco.

O projeto também foi validado ponta a ponta em navegador (Chromium mobile) para:
dois celulares vendo o timer em tempo real, reload persistente, alarme no fim, upload de
foto, PWA/service worker e operador sem acesso às telas de admin.

---

## 9. Docker (opcional)

Há `Dockerfile` e `docker-compose.yml` prontos.

```bash
cp .env.docker.example .env
# edite .env e troque JWT_SECRET e JWT_REFRESH_SECRET
# sugestão: openssl rand -hex 32
npm run cert            # opcional, para HTTPS/PWA no celular
mkdir -p backend/data backend/uploads backend/backups
docker compose up -d --build
docker compose logs -f
```

- Acesse `http://IP:3000` e, com certificado, `https://IP:3443`.
- Os volumes mantêm banco, fotos, backups e certificados fora do container.
- O primeiro boot cria o banco e o admin `admin/admin123` (troca obrigatória).
- Não rode `npm start` e Docker ao mesmo tempo (conflito de porta).
- Atualizou o código? `docker compose up -d --build`.

---

## 10. Scripts

| Comando | O que faz |
|---|---|
| `npm start` | **Produção local:** garante `.env`, instala/builda se preciso, sobe o servidor |
| `npm run dev` | Backend com `--watch` na 3000 + Vite com HMR na 5173 |
| `npm run build` | Compila o frontend para `frontend/dist` |
| `npm run seed` | Cria dados iniciais se o banco estiver vazio |
| `npm test` | Testes das rotas críticas (Node test runner) |
| `npm run backup` | Cria um backup manual do SQLite |
| `npm run cert` | Gera CA + certificado HTTPS local (PWA no celular) |

Para desenvolvimento, acesse `http://localhost:5173` (Vite faz proxy de `/api`,
`/socket.io` e `/uploads` para a 3000). O `npm start` serve o build de produção na 3000.

---

## 11. Variáveis de ambiente (`backend/.env`)

| Variável | Padrão | Descrição |
|---|---|---|
| `PORT` | `3000` | Porta HTTP |
| `HOST` | `0.0.0.0` | Interface (aceita LAN) |
| `NODE_ENV` | `production` | Ambiente |
| `TZ` | `America/Fortaleza` | Fuso das regras de dia/caixa |
| `JWT_SECRET` | gerado | Segredo do access token |
| `JWT_REFRESH_SECRET` | gerado | Segredo do refresh token |
| `ACCESS_TOKEN_TTL` | `12h` | Validade do access token |
| `REFRESH_TOKEN_TTL` | `30d` | Validade da sessão persistente |
| `BCRYPT_ROUNDS` | `10` | Custo do bcrypt |
| `DB_PATH` | `data/drift.db` | Banco SQLite |
| `UPLOAD_DIR` | `uploads` | Fotos |
| `BACKUP_DIR` | `backups` | Backups |
| `BACKUP_HOUR` | `3` | Hora local do backup diário |
| `BACKUP_RETENTION_DAYS` | `30` | Dias de retenção |
| `MAX_UPLOAD_MB` | `6` | Tamanho máximo de foto |
| `HTTPS_PORT` | `3443` | Porta HTTPS opcional |
| `TRUST_PROXY` | `0` | Use `1` só atrás de proxy reverso |

Ao rodar `npm start`, segredos vazios são preenchidos automaticamente. Se você apagar
`backend/.env`, as sessões existentes deixam de validar — mantenha o arquivo protegido e
fora do Git.

---

## 12. Estrutura de pastas

```
DriftApp/
├─ backend/
│  ├─ src/
│  │  ├─ app.js               Express, segurança, rotas, estáticos
│  │  ├─ server.js            HTTP/HTTPS + Socket.IO + jobs
│  │  ├─ db.js                schema SQLite/migração inicial
│  │  ├─ config.js            env e caminhos
│  │  ├─ seed.js              admin, planos, carrinhos
│  │  ├─ middleware/auth.js   JWT, RBAC, troca de senha
│  │  ├─ routes/              auth, users, carts, plans, sessions, ...
│  │  ├─ services/            sessões, dashboard, relatórios, caixa, backup
│  │  └─ scripts/             backup manual
│  ├─ tests/                  testes de rotas críticas
│  ├─ data/                   drift.db (runtime)
│  ├─ uploads/                fotos (runtime)
│  ├─ backups/                backups (runtime)
│  └─ certs/                  certificado local (runtime)
├─ frontend/
│  ├─ public/                 manifest, sw.js, ícones, favicon
│  ├─ src/
│  │  ├─ components/          UI, carrinho, modais, alertas, layout
│  │  ├─ pages/               login, painel, histórico, relatórios, etc.
│  │  ├─ context/             auth, socket, toasts
│  │  ├─ hooks/               relógio do servidor, alertas, PWA
│  │  └─ lib/                 api, formatação, áudio, fotos
│  └─ dist/                   build servido pelo backend
├─ scripts/                   start único, dev, certificado
├─ Dockerfile / docker-compose.yml
└─ README.md
```

---

## 13. Segurança e limitações

- Login obrigatório em **todas as rotas de API** (exceto `/api/health` e login/refresh).
  Arquivos estáticos (JS/CSS/manifest/ícones) e fotos em `/uploads` são públicos por
  necessidade do navegador; as fotos têm nomes aleatórios e o sistema deve rodar em uma
  rede confiável.
- JWT assinado com segredo local; access token curto + refresh httpOnly de 30 dias.
- Senhas com bcrypt (custo 10), troca obrigatória no primeiro acesso, redefinição pelo admin.
- Rate-limit no login (10 falhas/15 min por IP) e limite geral por API.
- RBAC no backend; mensagens de erro não expõem detalhes internos.
- CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` em produção.
- Upload valida mimetype **e assinatura do arquivo** (JPEG/PNG/WebP), com limite de tamanho.
- SQLite com WAL e backup consistente; não edite o banco com o servidor ligado.
- HTTP na LAN não é criptografado. Para senhas/fotos em rede não confiável, use HTTPS
  (`npm run cert`) ou um proxy reverso com certificado válido e `TRUST_PROXY=1`.
- Não há sincronização entre notebooks/lojas diferentes: o banco é local por instalação.
- O alarme sonoro depende da política de autoplay: toque em “Ativar som” após abrir o app.
  O alarme visual e o título piscando funcionam de qualquer forma.

---

## 14. Checklist dos critérios de aceite

- [x] Dois celulares na mesma rede veem o timer atualizado em tempo real (tick 1 s;
      medido em teste: ~50 ms para o snapshot da sessão).
- [x] Fechar o navegador/celular e reabrir mantém o tempo (JWT persistente + estado no SQLite).
- [x] Reiniciar o backend mantém sessões ativas e o tempo correto (teste automatizado recria
      a conexão com o mesmo banco e compara `fim_previsto_em`).
- [x] Operador recebe 403 em usuários, relatórios, caixa, planos, carrinhos, cancelamento,
      edição de valor e exclusão; a UI esconde essas telas.
- [x] Alerta visual piscante, som, vibração, título piscando e notificação (com permissão)
      no fim do tempo; WebSocket entrega o evento mesmo com outra aba em foco.
- [x] Foto do carrinho aparece no painel após upload (comprimida no celular e validada no
      servidor).
- [x] Backup diário e manual gera `.db` em `/backups` (retenção configurável).
- [x] PWA com manifest, ícones locais, `display: standalone` e service worker (HTTPS/localhost).
- [x] Nenhuma dependência de CDN; fontes do sistema e ícones SVG locais.
- [x] `npm start` sobe backend + frontend + banco; README e Docker incluídos.

---

## 15. Problemas comuns

**“Sem conexão com o servidor” no celular**
Verifique IP, mesma rede, firewall e se o notebook está ligado. Teste `/api/health` no
navegador do notebook e do celular.

**Porta 3000 ocupada**
Feche outro processo ou altere `PORT` em `backend/.env` e reinicie. Lembre de ajustar a
porta no firewall.

**“Sessão expirada” após reiniciar**
O `backend/.env` foi apagado/recriado e os segredos mudaram. Restaure o `.env` antigo ou
faça login novamente.

**Foto não aparece**
O upload precisa de JPG/PNG/WebP válido. A imagem é reduzida para até 1280 px; confira se
`backend/uploads` existe e tem permissão de escrita.

**PWA não instala**
Use o HTTPS do Tailscale (recomendado), o HTTPS local da seção 2 ou `localhost` no notebook.
Em HTTP puro o navegador cria apenas um atalho. O botão **Instalar aplicativo** mostra instruções no aparelho.

**Alarme não toca**
Toque em “Ativar som” uma vez após abrir o painel; mantenha o app aberto. Verifique o volume
e a permissão de notificações. O alerta visual não depende de áudio.

**Som não toca em outra aba**
Ative o som, deixe o painel como uma aba do navegador (não feche) e mantenha o notebook
ligado. O evento chega via WebSocket e o som é disparado pelo áudio já liberado. Se o
navegador suspender o áudio, use a notificação do sistema, que também é enviada.

**Docker sem permissão nas pastas**
Crie `backend/data`, `backend/uploads` e `backend/backups` antes de subir e verifique as
permissões do usuário que roda o Docker.

---

Feito para funcionar na praça: simples, offline na LAN e sem depender de nuvem. 🏁
