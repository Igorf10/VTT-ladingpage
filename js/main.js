/* VTT Store — lógica da landing page (JavaScript puro, sem dependências) */
(function () {
  'use strict';

  var CONFIG = window.VTT_CONFIG;
  var PRODUTOS = window.VTT_PRODUTOS;
  var CATEGORIAS = window.VTT_CATEGORIAS;
  var STORAGE_TESTE = 'vtt_leads_teste';   // "planilha" falsa do modo teste
  var STORAGE_CARRINHO = 'vtt_carrinho';    // carrinho salvo no navegador
  var QTD_MAX = 99;
  var DESCONTO = (CONFIG.descontoPercentual || 10) / 100;
  // Mesmo formato do Code.gs: VTT10- + 5 caracteres (sem O, 0, I, 1)
  var FORMATO_CUPOM = /^VTT10-[A-HJ-NP-Z2-9]{5}$/;

  /* ---------------- Utilitários ---------------- */

  function formatarPreco(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function linkWhatsApp(mensagem) {
    return 'https://wa.me/' + CONFIG.whatsappNumero + '?text=' + encodeURIComponent(mensagem);
  }

  function soDigitos(valor) {
    return valor.replace(/\D/g, '');
  }

  // (21) 99577-9923 enquanto a pessoa digita
  function mascaraCelular(valor) {
    var d = soDigitos(valor).slice(0, 11);
    if (d.length <= 2) return d ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }

  function emailValido(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
  }

  function celularValido(celular) {
    var d = soDigitos(celular);
    return d.length === 11 && d[2] === '9'; // DDD + celular com 9 dígitos
  }

  function escapar(texto) {
    var div = document.createElement('div');
    div.textContent = texto;
    return div.innerHTML;
  }

  function lerJSON(chave, padrao) {
    try { return JSON.parse(localStorage.getItem(chave)) || padrao; } catch (e) { return padrao; }
  }

  function gravarJSON(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (e) { /* navegação anônima */ }
  }

  // Cada produto ganha um id a partir do nome (ex.: "corta-vento-vtt")
  PRODUTOS.forEach(function (p) {
    p.id = p.id || p.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  });

  function produtoPorId(id) {
    return PRODUTOS.find(function (p) { return p.id === id; });
  }

  /* ---------------- Links de WhatsApp fixos ---------------- */

  var MENSAGENS = {
    duvida: 'Olá! Vim pelo site da VTT Store e quero tirar uma dúvida.',
    pedido: 'Olá! Vim pelo site da VTT Store e quero fazer um pedido.',
  };

  document.querySelectorAll('[data-whats]').forEach(function (el) {
    el.href = linkWhatsApp(MENSAGENS[el.getAttribute('data-whats')]);
  });

  document.querySelectorAll('[data-whats-display]').forEach(function (el) {
    el.textContent = CONFIG.whatsappExibicao;
  });

  document.getElementById('ano').textContent = new Date().getFullYear();

  var menorPreco = Math.min.apply(null, PRODUTOS.map(function (p) { return p.preco; }));
  document.getElementById('preco-minimo').textContent = formatarPreco(menorPreco);

  /* ---------------- Produtos + categorias ---------------- */

  var barraCategorias = document.getElementById('categorias');
  var listaProdutos = document.getElementById('lista-produtos');
  var categoriaAtiva = 'Todos';

  function cardProduto(p) {
    return (
      '<article class="lp-card" data-id="' + escapar(p.id) + '">' +
        '<div class="lp-card__media">' +
          '<img src="' + escapar(p.imagem) + '" alt="' + escapar(p.nome) + '" loading="lazy" />' +
          '<span class="lp-card__tag">' + escapar(p.categoria) + '</span>' +
        '</div>' +
        '<div class="lp-card__body">' +
          '<h3 class="lp-card__name">' + escapar(p.nome) + '</h3>' +
          '<p class="lp-card__desc">' + escapar(p.descricao) + '</p>' +
          '<div class="lp-card__price">' + formatarPreco(p.preco) + '</div>' +
          '<div class="lp-card__buy">' +
            seletorQtd(1, 'Quantidade de ' + p.nome) +
            '<button type="button" class="btn btn-primary lp-card__add" data-add="' + escapar(p.id) + '">' +
              '<svg width="18" height="18" aria-hidden="true"><use href="#i-cart" /></svg> Adicionar' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</article>'
    );
  }

  // Seletor de quantidade (− 1 +) usado no card e no carrinho
  function seletorQtd(valor, rotulo) {
    return (
      '<div class="qty" role="group" aria-label="' + escapar(rotulo) + '">' +
        '<button type="button" class="qty__btn" data-qtd="-1" aria-label="Diminuir">−</button>' +
        '<input class="qty__input" type="number" inputmode="numeric" min="1" max="' + QTD_MAX + '" value="' + valor + '" aria-label="Quantidade" />' +
        '<button type="button" class="qty__btn" data-qtd="1" aria-label="Aumentar">+</button>' +
      '</div>'
    );
  }

  function limitarQtd(n) {
    n = parseInt(n, 10);
    if (isNaN(n) || n < 1) return 1;
    return Math.min(n, QTD_MAX);
  }

  function renderizarProdutos() {
    var visiveis = categoriaAtiva === 'Todos'
      ? PRODUTOS
      : PRODUTOS.filter(function (p) { return p.categoria === categoriaAtiva; });
    listaProdutos.innerHTML = visiveis.map(cardProduto).join('');
    if (typeof Carrinho !== 'undefined') sincronizarCards(Carrinho.qtdDe);
  }

  function renderizarCategorias() {
    barraCategorias.innerHTML = ['Todos'].concat(CATEGORIAS).map(function (cat) {
      var ativa = cat === categoriaAtiva;
      return '<button type="button" role="tab" class="category-chip' + (ativa ? ' active' : '') +
        '" aria-selected="' + ativa + '" data-categoria="' + escapar(cat) + '">' + escapar(cat) + '</button>';
    }).join('');
  }

  barraCategorias.addEventListener('click', function (e) {
    var botao = e.target.closest('[data-categoria]');
    if (!botao) return;
    categoriaAtiva = botao.getAttribute('data-categoria');
    renderizarCategorias();
    renderizarProdutos();
  });

  renderizarCategorias();
  renderizarProdutos();

  // − / + nos cards e botão "Adicionar"
  /* O seletor do card fica sempre igual à quantidade no carrinho:
     - produto fora do carrinho: escolha a quantidade e toque em "Adicionar"
     - produto já no carrinho: − / + e o número digitado mudam o carrinho na hora */

  function sincronizarCards(qtdNoCarrinho) {
    listaProdutos.querySelectorAll('.lp-card').forEach(function (card) {
      var id = card.getAttribute('data-id');
      var qtd = qtdNoCarrinho(id);
      var campo = card.querySelector('.qty__input');
      var botao = card.querySelector('[data-add]');
      var noCarrinho = qtd > 0;
      card.classList.toggle('is-in-cart', noCarrinho);
      if (noCarrinho && document.activeElement !== campo) campo.value = qtd;
      if (!noCarrinho && card.getAttribute('data-estava') === '1') campo.value = 1;
      card.setAttribute('data-estava', noCarrinho ? '1' : '0');
      botao.lastChild.textContent = noCarrinho ? ' No carrinho' : ' Adicionar';
      botao.setAttribute('aria-label', noCarrinho ? 'Ver carrinho' : 'Adicionar ao carrinho');
    });
  }

  listaProdutos.addEventListener('click', function (e) {
    var card = e.target.closest('.lp-card');
    if (!card) return;
    var id = card.getAttribute('data-id');
    var campo = card.querySelector('.qty__input');
    var noCarrinho = Carrinho.qtdDe(id) > 0;

    var passo = e.target.closest('[data-qtd]');
    if (passo) {
      var nova = limitarQtd(Number(campo.value) + Number(passo.getAttribute('data-qtd')));
      campo.value = nova;
      if (noCarrinho) Carrinho.definir(id, nova);
      return;
    }

    if (e.target.closest('[data-add]')) {
      if (noCarrinho) Carrinho.abrir();
      else Carrinho.adicionar(id, limitarQtd(campo.value));
    }
  });

  // Número digitado no card
  listaProdutos.addEventListener('change', function (e) {
    if (!e.target.classList.contains('qty__input')) return;
    var campo = e.target;
    campo.value = limitarQtd(campo.value);
    var id = campo.closest('.lp-card').getAttribute('data-id');
    if (Carrinho.qtdDe(id) > 0) Carrinho.definir(id, campo.value);
  });


  /* ================= Carrinho ================= */

  var Carrinho = (function () {
    var salvo = lerJSON(STORAGE_CARRINHO, {});
    var itens = (salvo.itens || []).filter(function (i) { return produtoPorId(i.id); });
    var cupom = FORMATO_CUPOM.test(salvo.cupom || '') ? salvo.cupom : '';

    var painel = document.getElementById('cart');
    var fundo = document.getElementById('cart-overlay');
    var lista = document.getElementById('cart-itens');
    var vazio = document.getElementById('cart-vazio');
    var rodape = document.getElementById('cart-rodape');
    var contadores = document.querySelectorAll('[data-cart-count]');
    var campoCupom = document.getElementById('cart-cupom');
    var msgCupom = document.getElementById('cart-cupom-msg');
    var blocoAplicado = document.getElementById('cart-cupom-ok');
    var blocoCampo = document.getElementById('cart-cupom-form');
    var finalizar = document.getElementById('cart-finalizar');
    var ultimoFoco = null;

    function salvar() { gravarJSON(STORAGE_CARRINHO, { itens: itens, cupom: cupom }); }

    // Contas em centavos para não errar arredondamento
    function totais() {
      var subtotal = itens.reduce(function (soma, i) {
        return soma + Math.round(produtoPorId(i.id).preco * 100) * i.qtd;
      }, 0);
      var desconto = cupom ? Math.round(subtotal * DESCONTO) : 0;
      return { subtotal: subtotal / 100, desconto: desconto / 100, total: (subtotal - desconto) / 100 };
    }

    function quantidadeTotal() {
      return itens.reduce(function (s, i) { return s + i.qtd; }, 0);
    }

    function linhaItem(i) {
      var p = produtoPorId(i.id);
      return (
        '<li class="cart-item" data-id="' + escapar(p.id) + '">' +
          '<img class="cart-item__img" src="' + escapar(p.imagem) + '" alt="" />' +
          '<div class="cart-item__info">' +
            '<div class="cart-item__name">' + escapar(p.nome) + '</div>' +
            '<div class="cart-item__unit">' + formatarPreco(p.preco) + ' cada</div>' +
            '<div class="cart-item__row">' +
              seletorQtd(i.qtd, 'Quantidade de ' + p.nome) +
              '<strong class="cart-item__sub">' + formatarPreco(p.preco * i.qtd) + '</strong>' +
            '</div>' +
          '</div>' +
          '<button type="button" class="cart-item__remove" data-remover aria-label="Remover ' + escapar(p.nome) + '">' +
            '<svg width="18" height="18" aria-hidden="true"><use href="#i-trash" /></svg>' +
          '</button>' +
        '</li>'
      );
    }

    function qtdDe(id) {
      var item = itens.find(function (i) { return i.id === id; });
      return item ? item.qtd : 0;
    }

    function renderizar() {
      sincronizarCards(qtdDe);
      var qtd = quantidadeTotal();
      contadores.forEach(function (el) { el.textContent = qtd; el.hidden = qtd === 0; });

      lista.innerHTML = itens.map(linhaItem).join('');
      vazio.hidden = itens.length > 0;
      rodape.hidden = itens.length === 0;

      var t = totais();
      document.getElementById('cart-subtotal').textContent = formatarPreco(t.subtotal);
      document.getElementById('cart-desconto-linha').hidden = !cupom;
      document.getElementById('cart-desconto').textContent = '− ' + formatarPreco(t.desconto);
      document.getElementById('cart-desconto-rotulo').textContent =
        'Desconto ' + Math.round(DESCONTO * 100) + '% (' + cupom + ')';
      document.getElementById('cart-total').textContent = formatarPreco(t.total);

      blocoAplicado.hidden = !cupom;
      blocoCampo.hidden = !!cupom;
      document.getElementById('cart-cupom-aplicado').textContent = cupom;
      document.getElementById('cart-cupom-dica').hidden = !!cupom;

      finalizar.href = itens.length ? linkWhatsApp(mensagemPedido()) : '#';
    }

    function mensagemPedido() {
      var t = totais();
      var linhas = itens.map(function (i) {
        var p = produtoPorId(i.id);
        return '• ' + i.qtd + 'x ' + p.nome + ' — ' + formatarPreco(p.preco * i.qtd);
      });
      return 'Olá, VTT Store! Quero fazer este pedido pelo site:\n\n' +
        linhas.join('\n') + '\n\n' +
        'Subtotal: ' + formatarPreco(t.subtotal) + '\n' +
        (cupom ? 'Cupom ' + cupom + ' (' + Math.round(DESCONTO * 100) + '% OFF): − ' + formatarPreco(t.desconto) + '\n' : '') +
        '*Total: ' + formatarPreco(t.total) + '*\n\n' +
        'Pode me passar os tamanhos e cores disponíveis?';
    }

    function mensagemCupom(texto, tipo) {
      msgCupom.textContent = texto || '';
      msgCupom.hidden = !texto;
      msgCupom.className = 'cart__cupom-msg' + (tipo ? ' is-' + tipo : '');
      campoCupom.setAttribute('aria-invalid', tipo === 'erro' ? 'true' : 'false');
    }

    function aplicarCupom() {
      var codigo = campoCupom.value.trim().toUpperCase().replace(/\s+/g, '');
      if (!codigo) return mensagemCupom('Cole o código que você recebeu no cadastro.', 'erro');
      if (!FORMATO_CUPOM.test(codigo)) {
        return mensagemCupom('Código inválido. Confira se colou o código completo, ex.: VTT10-AB3K9.', 'erro');
      }
      cupom = codigo;
      campoCupom.value = '';
      mensagemCupom('');
      salvar();
      renderizar();
    }

    function abrir() {
      ultimoFoco = document.activeElement;
      fundo.hidden = false;
      painel.hidden = false;
      document.body.classList.add('cart-aberto');
      document.getElementById('toast').hidden = true;
      document.getElementById('cart-fechar').focus();
    }

    function fechar() {
      fundo.hidden = true;
      painel.hidden = true;
      document.body.classList.remove('cart-aberto');
      if (ultimoFoco && ultimoFoco.focus) ultimoFoco.focus({ preventScroll: true });
    }

    function mudarQtd(id, qtd) {
      var item = itens.find(function (i) { return i.id === id; });
      if (item) item.qtd = limitarQtd(qtd);
      salvar();
      renderizar();
    }

    /* Eventos */
    document.querySelectorAll('[data-cart-open]').forEach(function (b) {
      b.addEventListener('click', function (e) { e.preventDefault(); abrir(); });
    });
    document.querySelectorAll('[data-cart-close]').forEach(function (b) {
      b.addEventListener('click', fechar);
    });
    fundo.addEventListener('click', fechar);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !painel.hidden) fechar();
    });

    lista.addEventListener('click', function (e) {
      var linha = e.target.closest('.cart-item');
      if (!linha) return;
      var id = linha.getAttribute('data-id');
      var passo = e.target.closest('[data-qtd]');
      if (passo) {
        var item = itens.find(function (i) { return i.id === id; });
        var nova = item.qtd + Number(passo.getAttribute('data-qtd'));
        if (nova < 1) return;
        mudarQtd(id, nova);
        var botao = lista.querySelector('.cart-item[data-id="' + id + '"] [data-qtd="' + passo.getAttribute('data-qtd') + '"]');
        if (botao) botao.focus();
        return;
      }
      if (e.target.closest('[data-remover]')) {
        itens = itens.filter(function (i) { return i.id !== id; });
        salvar();
        renderizar();
        document.getElementById('cart-fechar').focus();
      }
    });

    lista.addEventListener('change', function (e) {
      if (!e.target.classList.contains('qty__input')) return;
      mudarQtd(e.target.closest('.cart-item').getAttribute('data-id'), e.target.value);
    });

    document.getElementById('cart-cupom-aplicar').addEventListener('click', aplicarCupom);
    campoCupom.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); aplicarCupom(); }
    });
    campoCupom.addEventListener('input', function () { mensagemCupom(''); });

    document.getElementById('cart-cupom-remover').addEventListener('click', function () {
      cupom = '';
      mensagemCupom('');
      salvar();
      renderizar();
      campoCupom.focus();
    });

    finalizar.addEventListener('click', function (e) {
      if (!itens.length) e.preventDefault();
    });

    renderizar();

    return {
      qtdDe: qtdDe,
      abrir: abrir,
      definir: mudarQtd,
      adicionar: function (id, qtd) {
        var item = itens.find(function (i) { return i.id === id; });
        if (item) item.qtd = limitarQtd(item.qtd + qtd);
        else itens.push({ id: id, qtd: qtd });
        salvar();
        renderizar();
        avisar(produtoPorId(id).nome + ' no carrinho');
      },
    };
  })();

  // Aviso rápido no rodapé da tela
  var toast = document.getElementById('toast');
  var toastTimer;
  function avisar(texto) {
    toast.querySelector('span').textContent = texto;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toast.hidden = true; }, 2600);
  }


  /* ================= API de cadastro ================= */
  /* Fala com o Google Apps Script (apps-script/Code.gs).
     Sem leadsUrl em config.js, usa uma "planilha" falsa no navegador (modo teste). */

  var API = {
    // Consulta se e-mail e/ou telefone já existem. Retorna { email: {cadastrado}, whatsapp: {cadastrado} }
    verificar: function (email, whatsapp) {
      if (!CONFIG.leadsUrl) return Promise.resolve(verificarTeste(email, whatsapp));
      var params = new URLSearchParams({ acao: 'verificar', email: email || '', whatsapp: whatsapp || '' });
      return fetch(CONFIG.leadsUrl + '?' + params.toString())
        .then(lerResposta);
    },

    // Envia o cadastro. Retorna { ok: true, cupom } ou { ok: false, codigo, erros }
    cadastrar: function (dados) {
      if (!CONFIG.leadsUrl) return Promise.resolve(cadastrarTeste(dados));
      // POST "simples" (form-urlencoded, sem headers extras): o Google responde com CORS liberado
      return fetch(CONFIG.leadsUrl, { method: 'POST', body: new URLSearchParams(dados) })
        .then(lerResposta);
    },
  };

  // Lê a resposta da API e, se não vier JSON, explica o motivo no console (F12)
  function lerResposta(r) {
    return r.text().then(function (texto) {
      try {
        return JSON.parse(texto);
      } catch (e) {
        var erro = new Error('NAO_JSON');
        erro.detalhe = texto.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 300);
        throw erro;
      }
    });
  }

  function diagnosticar(err) {
    if (err && err.message === 'NAO_JSON') {
      console.error('[VTT] A URL respondeu, mas com uma página em vez de JSON. Normalmente é:\n' +
        ' • implantação sem autorização ou com código antigo → Implantar > Gerenciar implantações > Nova versão\n' +
        ' • URL errada em js/config.js (precisa terminar em /exec)\n' +
        'Trecho da resposta:', err.detalhe);
    } else {
      console.error('[VTT] O navegador bloqueou a chamada à API (' + (err && err.message) + '). Normalmente é:\n' +
        ' 1. Implantação com acesso diferente de "Qualquer pessoa" → o Google pede login e o navegador bloqueia (CORS)\n' +
        ' 2. URL errada em js/config.js (use a /exec da implantação, não a do editor nem a /dev)\n' +
        ' 3. Bloqueador do navegador (ex.: Brave Shields, AdBlock) barrando script.google.com\n' +
        'Teste: abra ' + CONFIG.leadsUrl + ' direto numa aba. Precisa aparecer {"ok":true,...}.');
    }
  }

  /* ---------- Modo teste (sem planilha) ---------- */

  function verificarTeste(email, whatsapp) {
    var base = lerJSON(STORAGE_TESTE, []);
    var achouEmail = !!email && base.some(function (l) { return l.email === email; });
    var achouWhats = !!whatsapp && base.some(function (l) { return l.whatsapp === whatsapp; });
    return {
      ok: true,
      email: { cadastrado: achouEmail, mensagem: achouEmail ? 'E-mail já cadastrado.' : '' },
      whatsapp: { cadastrado: achouWhats, mensagem: achouWhats ? 'Telefone já cadastrado.' : '' },
    };
  }

  function cadastrarTeste(dados) {
    var v = verificarTeste(dados.email, dados.whatsapp);
    if (v.email.cadastrado || v.whatsapp.cadastrado) {
      var erros = {};
      if (v.email.cadastrado) erros.email = v.email.mensagem;
      if (v.whatsapp.cadastrado) erros.whatsapp = v.whatsapp.mensagem;
      return { ok: false, codigo: 'ja_cadastrado', erros: erros };
    }
    var cupom = 'VTT10-' + Math.random().toString(36).slice(2, 7).toUpperCase();
    var base = lerJSON(STORAGE_TESTE, []);
    base.push({ email: dados.email, whatsapp: dados.whatsapp, cupom: cupom });
    gravarJSON(STORAGE_TESTE, base);
    console.warn('[VTT] MODO TESTE — leadsUrl vazia em js/config.js. Cadastro salvo só neste navegador:', dados, cupom);
    return { ok: true, cupom: cupom };
  }

  /* ================= Formulário ================= */

  var form = document.getElementById('lead-form');
  var telaSucesso = document.getElementById('lead-done');
  var campoEmail = document.getElementById('lp-email');
  var campoCelular = document.getElementById('lp-phone');
  var campoConsentimento = document.getElementById('lp-consent');
  var botaoEnviar = form.querySelector('.lp-form__submit');
  var alerta = document.getElementById('lp-send-err');
  var TEXTO_BOTAO = botaoEnviar.textContent;

  // Erros vindos da API (duplicado) ficam guardados para bloquear o envio
  var duplicado = { email: false, whatsapp: false };

  function definirErro(campo, idErro, mensagem) {
    var el = document.getElementById(idErro);
    el.textContent = mensagem || '';
    el.hidden = !mensagem;
    if (campo) campo.setAttribute('aria-invalid', mensagem ? 'true' : 'false');
    return !mensagem;
  }

  function mostrarAlerta(html) {
    alerta.innerHTML = html || '';
    alerta.hidden = !html;
  }

  function aplicarDuplicados(erros) {
    duplicado.email = !!(erros && erros.email);
    duplicado.whatsapp = !!(erros && erros.whatsapp);
    if (duplicado.email) definirErro(campoEmail, 'lp-email-err', erros.email);
    if (duplicado.whatsapp) definirErro(campoCelular, 'lp-phone-err', erros.whatsapp);
    if (duplicado.email || duplicado.whatsapp) {
      mostrarAlerta('<strong>Cadastro não realizado.</strong> ' +
        (duplicado.email && duplicado.whatsapp ? 'E-mail e telefone já cadastrados.'
          : duplicado.email ? 'E-mail já cadastrado.' : 'Telefone já cadastrado.') +
        ' O desconto de boas-vindas vale uma vez por cliente.');
    }
  }

  function mostrarSucesso(lead) {
    document.getElementById('lead-cupom').textContent = lead.cupom;
    botaoCopiar.querySelector('span').textContent = 'Copiar código';
    botaoCopiar.classList.remove('is-copied');
    form.hidden = true;
    telaSucesso.hidden = false;
  }

  /* ---------- Botão "Copiar código" ---------- */

  var botaoCopiar = document.getElementById('btn-copiar-cupom');

  function copiarTexto(texto) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(texto);
    }
    // Plano B para navegadores antigos / páginas sem https
    return new Promise(function (ok, falha) {
      var area = document.createElement('textarea');
      area.value = texto;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy') ? ok() : falha(); } catch (e) { falha(e); }
      document.body.removeChild(area);
    });
  }

  botaoCopiar.addEventListener('click', function () {
    var codigo = document.getElementById('lead-cupom').textContent;
    var rotulo = botaoCopiar.querySelector('span');
    copiarTexto(codigo).then(function () {
      rotulo.textContent = 'Código copiado!';
      botaoCopiar.classList.add('is-copied');
    }).catch(function () {
      rotulo.textContent = 'Selecione o código acima e copie';
    });
  });

  function mostrarFormulario() {
    form.reset();
    campoConsentimento.checked = true;
    duplicado = { email: false, whatsapp: false };
    ['lp-email-err', 'lp-phone-err', 'lp-consent-err'].forEach(function (id) { definirErro(null, id, ''); });
    mostrarAlerta('');
    telaSucesso.hidden = true;
    form.hidden = false;
  }

  // Toda vez que a página é carregada/recarregada, o cadastro começa do zero
  // (campos de e-mail e celular limpos). O navegador às vezes restaura o que
  // foi digitado antes; o reset abaixo evita isso, inclusive ao voltar pelo histórico.
  mostrarFormulario();
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) mostrarFormulario(); });

  document.getElementById('lead-reset').addEventListener('click', function () {
    mostrarFormulario();
    campoEmail.focus();
  });

  /* ---------- Verificação ao sair do campo (consulta a API) ---------- */

  function verificarCampo(tipo) {
    var email = tipo === 'email' ? campoEmail.value.trim().toLowerCase() : '';
    var whatsapp = tipo === 'whatsapp' ? soDigitos(campoCelular.value) : '';
    if (tipo === 'email' && !emailValido(email)) return;
    if (tipo === 'whatsapp' && !celularValido(whatsapp)) return;

    var valorConsultado = tipo === 'email' ? email : whatsapp;
    API.verificar(email, whatsapp).then(function (r) {
      // ignora resposta se a pessoa já mudou o campo
      var atual = tipo === 'email' ? campoEmail.value.trim().toLowerCase() : soDigitos(campoCelular.value);
      if (!r || !r.ok || atual !== valorConsultado) return;
      var info = r[tipo];
      if (info && info.cadastrado) {
        var erros = {}; erros[tipo] = info.mensagem;
        if (tipo === 'email' && duplicado.whatsapp) erros.whatsapp = 'Telefone já cadastrado.';
        if (tipo === 'whatsapp' && duplicado.email) erros.email = 'E-mail já cadastrado.';
        aplicarDuplicados(erros);
      }
    }).catch(diagnosticar); // a checagem final acontece no envio
  }

  campoEmail.addEventListener('blur', function () { verificarCampo('email'); });
  campoCelular.addEventListener('blur', function () { verificarCampo('whatsapp'); });

  campoEmail.addEventListener('input', function () {
    if (duplicado.email) { duplicado.email = false; definirErro(campoEmail, 'lp-email-err', ''); }
    if (!duplicado.whatsapp) mostrarAlerta('');
  });

  campoCelular.addEventListener('input', function () {
    campoCelular.value = mascaraCelular(campoCelular.value);
    if (duplicado.whatsapp) { duplicado.whatsapp = false; definirErro(campoCelular, 'lp-phone-err', ''); }
    if (!duplicado.email) mostrarAlerta('');
  });

  /* ---------- Envio ---------- */

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    mostrarAlerta('');

    var ok = [
      definirErro(campoEmail, 'lp-email-err', emailValido(campoEmail.value) ? '' : 'Digite um e-mail válido.'),
      definirErro(campoCelular, 'lp-phone-err', celularValido(campoCelular.value) ? '' : 'Digite o celular com DDD, ex.: (21) 99999-9999.'),
      definirErro(null, 'lp-consent-err', campoConsentimento.checked ? '' : 'Marque a autorização para receber as ofertas.'),
    ].every(Boolean);
    if (!ok) return;

    var dados = {
      email: campoEmail.value.trim().toLowerCase(),
      whatsapp: soDigitos(campoCelular.value),
      website: form.website.value, // honeypot anti-robô
    };

    botaoEnviar.disabled = true;
    botaoEnviar.textContent = 'Verificando cadastro...';

    API.cadastrar(dados)
      .then(function (r) {
        if (r && r.ok && r.cupom) {
          var lead = { cupom: r.cupom, email: dados.email, whatsapp: dados.whatsapp };
          mostrarSucesso(lead);
          return;
        }
        if (r && r.codigo === 'ja_cadastrado') {
          aplicarDuplicados(r.erros);
          return;
        }
        if (r && r.codigo === 'dados_invalidos' && r.erros) {
          if (r.erros.email) definirErro(campoEmail, 'lp-email-err', r.erros.email);
          if (r.erros.whatsapp) definirErro(campoCelular, 'lp-phone-err', r.erros.whatsapp);
          return;
        }
        if (r && r.codigo === 'erro_servidor') {
          // Erro no Apps Script (ex.: planilha não conectada). Detalhe técnico vai pro console.
          console.error('[VTT] Erro na API da planilha:', r.mensagem);
        }
        mostrarAlerta('Não conseguimos concluir seu cadastro agora. Tente de novo em instantes.');
      })
      .catch(function (err) {
        diagnosticar(err);
        mostrarAlerta('Não conseguimos falar com o servidor de cadastro. Tente de novo em instantes.');
      })
      .finally(function () {
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = TEXTO_BOTAO;
      });
  });
})();
