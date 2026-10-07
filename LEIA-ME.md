# Landing page VTT Store (HTML + CSS + JavaScript puro)

Não precisa de Node, npm nem build.

```
vtt-landing-html/
├── index.html          → a página
├── css/style.css       → todo o visual
├── js/config.js        → WhatsApp, % de desconto e URL da planilha  ← edite aqui
├── js/produtos.js      → produtos, preços e categorias        ← edite aqui
├── js/main.js          → filtros, cards, carrinho, cupom e envio do cadastro
├── img/                → logo, fundo e fotos dos produtos
└── apps-script/Code.gs → código da planilha (vai no Google, não no site)
```

## Rodar no VS Code com o Live Server

1. No VS Code, abra a pasta `vtt-landing-html` em **Arquivo > Abrir Pasta**.
2. Instale a extensão **Live Server** (Ritwick Dey), se ainda não tiver.
3. Clique com o botão direito em `index.html` e escolha **Open with Live Server**. Outra opção é clicar em **Go Live** no canto inferior direito.
4. A página abre em `http://127.0.0.1:5500` e recarrega sozinha quando você salva um arquivo.

Enquanto `leadsUrl` estiver vazio em `js/config.js`, a página roda em **modo teste** (veja abaixo).

> Ao recarregar a página, o cadastro sempre volta para os campos de e-mail e celular, vazios.

## Planilha e API (Google Sheets + Apps Script)

### O que a API faz

| Situação | Resposta | O que a página mostra |
|---|---|---|
| Cadastro novo | `{ ok: true, cupom: "VTT10-AB3K9" }` | Tela de sucesso com o cupom e o botão **Copiar código** |
| E-mail já existe | `{ ok: false, codigo: "ja_cadastrado", erros: { email: "E-mail já cadastrado." } }` | Erro no campo, cadastro bloqueado e **nenhum botão de desconto** |
| Telefone já existe | `{ ok: false, codigo: "ja_cadastrado", erros: { whatsapp: "Telefone já cadastrado." } }` | Igual ao caso acima |
| Os dois já existem | os dois erros juntos | Igual ao caso acima |

A página também consulta a API quando a pessoa sai do campo de e-mail ou de celular (`?acao=verificar`), então o aviso de "já cadastrado" aparece antes mesmo de clicar em enviar. A decisão final é sempre do servidor, no envio. Por isso, burlar a página não libera o cupom.

O telefone é comparado só pelos dígitos: `(21) 99577-9923`, `21995779923` e `+55 21 99577-9923` contam como o mesmo número. O e-mail é comparado sem diferenciar maiúsculas e minúsculas.

### Passo a passo (uma vez só)

1. Acesse **sheets.new** para criar uma planilha nova e dê um nome, por exemplo "VTT — Leads".
2. Abra **Extensões > Apps Script**. Apague o código de exemplo, cole todo o conteúdo de `apps-script/Code.gs` e salve com Ctrl+S.
3. No topo do editor, escolha a função **configurarPlanilha** e clique em **▶ Executar**. O Google vai pedir autorização: clique em *Revisar permissões*, escolha sua conta, depois *Avançado* e *Acessar (não seguro)*. Esse aviso aparece porque o script é seu e não passou por verificação do Google. A aba **Leads** é criada com o cabeçalho.
4. Clique em **Implantar > Nova implantação**. Na engrenagem, escolha **App da Web** e preencha:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
5. Clique em **Implantar** e copie a **URL do app da Web**, a que termina em `/exec`.
6. Para testar, cole a URL no navegador. Deve aparecer algo como `{"ok":true,"servico":"VTT Leads API","versao":4,"planilha":"VTT — Leads","aba":"Leads","cadastros":0}`. Os campos `planilha` e `aba` mostram onde os cadastros estão sendo gravados.
7. Cole a URL em `js/config.js`, no campo `leadsUrl: 'https://script.google.com/macros/s/.../exec'`, e salve. O Live Server recarrega sozinho.

> **Alterou o Code.gs depois?** Vá em *Implantar > Gerenciar implantações*, clique no lápis, escolha **Versão: Nova versão** e clique em *Implantar*. Sem isso, a URL continua rodando o código antigo.

### A planilha não gerou os campos? (solução de problemas)

**1. O script foi criado fora da planilha.** É a causa mais comum. Se você criou o projeto em script.google.com, e não em *Extensões > Apps Script* dentro da planilha, o script não sabe em qual planilha gravar. Para conectar pelo código:
   1. Abra a planilha e copie o ID do link. É o trecho entre `/d/` e `/edit`:
      `https://docs.google.com/spreadsheets/d/`**`1AbCdEf...XyZ`**`/edit`
   2. No `Code.gs`, cole o ID no topo: `PLANILHA_ID: '1AbCdEf...XyZ',`
   3. Salve, rode **configurarPlanilha** de novo (▶ Executar) e publique uma **nova versão**.

**2. Você ainda não rodou `configurarPlanilha`.** A aba com o cabeçalho só aparece depois de rodar essa função, ou depois do primeiro cadastro.

**3. A aba "Leads" foi criada, mas você está olhando outra aba.** Confira as abas na parte de baixo da planilha.

**4. A implantação está com o código antigo.** Faça *Implantar > Gerenciar implantações > lápis > Nova versão*.

**Como descobrir o erro:**
- Abra a URL `/exec` no navegador. Se aparecer `"codigo":"erro_servidor"`, o campo `mensagem` diz o que está faltando.
- Na landing, o detalhe do erro aparece no console (F12) como `[VTT] Erro na API da planilha: ...`.
- No editor do Apps Script, em **Execuções** (ícone ☰▶ no menu da esquerda), ficam o histórico de cada chamada e os erros.

Quando o script é aberto pela planilha, também aparece um menu **VTT > Criar/verificar cabeçalho** na própria planilha. Ele surge depois de recarregar a página da planilha.

### Colunas da aba Leads

| Data cadastro | E-mail | WhatsApp | Cupom usado? |
|---|---|---|---|
| 06/10/2026 14:32 | cliente@email.com | (21) 99999-9999 | ☐ |

Quando o cliente mandar o pedido com cupom, peça o e-mail ou o número do cadastro, procure na planilha com Ctrl+F e marque **Cupom usado?** depois da venda.

O código do cupom (ex.: VTT10-AB3K9) aparece para o cliente e vai na mensagem do pedido, mas não é gravado na planilha. A conferência é feita pelo e-mail ou WhatsApp.

> **Já tinha rodado a versão anterior?** O script ajusta a aba sozinho. Se a aba "Leads" só tinha o cabeçalho antigo, ele é trocado pelo novo. Se já havia cadastros nela, a aba é renomeada para **"Leads (antigo)"** e uma "Leads" nova é criada com as 4 colunas. Os cadastros da aba antiga não entram na checagem de duplicados.

## Carrinho e código promocional

- Cada card tem o seletor de quantidade (− 1 +) e o botão **Adicionar**. O ícone do carrinho no topo mostra quantas peças foram adicionadas.
- A janela do carrinho lista os itens com quantidade editável, subtotal de cada produto, subtotal geral, desconto e total.
- Depois do cadastro, o cliente toca em **Copiar código** e cola o cupom no campo **Código promocional** do carrinho. O desconto (10%, configurável em `descontoPercentual` no `js/config.js`) entra no total.
- O carrinho fica salvo no navegador (`vtt_carrinho` no Local Storage), então não se perde ao recarregar a página.
- **Finalizar pedido no WhatsApp** abre a conversa com o pedido pronto:

```
Olá, VTT Store! Quero fazer este pedido pelo site:

• 3x Camisa e Regata Dry — R$ 179,70
• 1x Corta Vento VTT — R$ 129,90

Subtotal: R$ 309,60
Cupom VTT10-AB3K9 (10% OFF): − R$ 30,96
*Total: R$ 278,64*

Pode me passar os tamanhos e cores disponíveis?
```

> **Importante:** como o código do cupom não é gravado na planilha, a página só confere se ele está no formato certo (`VTT10-` + 5 caracteres). A conferência de que o cliente realmente se cadastrou continua sendo feita pela loja, procurando o e-mail ou o WhatsApp dele na planilha antes de dar o desconto e marcando **Cupom usado?**.

O texto da mensagem pode ser alterado na função `mensagemPedido` em `js/main.js`.

### Modo teste (sem planilha)

Com `leadsUrl` vazio, a página guarda os cadastros só no seu navegador e aplica as mesmas regras de duplicado. Serve para testar no Live Server antes de ligar o Google. Para zerar os testes, abra F12 > Application > Local Storage e apague `vtt_leads_teste`.

## Editar produtos

Tudo fica em `js/produtos.js`. Para adicionar um produto, copie um bloco `{ ... }` e mude os campos. Se for uma categoria nova, inclua o nome em `VTT_CATEGORIAS`. Fotos novas vão em `img/produtos/`.
