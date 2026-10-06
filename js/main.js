/* VTT Store — lógica da landing page (JavaScript puro, sem dependências) */
(function () {
  'use strict';

  var CONFIG = window.VTT_CONFIG;
  var PRODUTOS = window.VTT_PRODUTOS;
  var CATEGORIAS = window.VTT_CATEGORIAS;
  var STORAGE_TESTE = 'vtt_leads_teste';   // "planilha" falsa do modo teste

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

  function mensagemCompra(p) {
    return 'Olá! Vim pelo site da VTT Store e quero comprar:\n\n' +
      '*' + p.nome + '* — ' + formatarPreco(p.preco) + '\n\n' +
      'Pode me passar os tamanhos e cores disponíveis?';
  }

  function cardProduto(p) {
    return (
      '<article class="lp-card">' +
        '<div class="lp-card__media">' +
          '<img src="' + escapar(p.imagem) + '" alt="' + escapar(p.nome) + '" loading="lazy" />' +
          '<span class="lp-card__tag">' + escapar(p.categoria) + '</span>' +
        '</div>' +
        '<div class="lp-card__body">' +
          '<h3 class="lp-card__name">' + escapar(p.nome) + '</h3>' +
          '<p class="lp-card__desc">' + escapar(p.descricao) + '</p>' +
          '<div class="lp-card__price">' + formatarPreco(p.preco) + '</div>' +
          '<a href="' + linkWhatsApp(mensagemCompra(p)) + '" target="_blank" rel="noopener noreferrer" ' +
            'class="btn lp-btn-whats" aria-label="Comprar ' + escapar(p.nome) + ' pelo WhatsApp">' +
            '<svg width="18" height="18" aria-hidden="true"><use href="#i-whats" /></svg> Comprar no WhatsApp' +
          '</a>' +
        '</div>' +
      '</article>'
    );
  }

  function renderizarProdutos() {
    var visiveis = categoriaAtiva === 'Todos'
      ? PRODUTOS
      : PRODUTOS.filter(function (p) { return p.categoria === categoriaAtiva; });
    listaProdutos.innerHTML = visiveis.map(cardProduto).join('');
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

  function mensagemDesconto(lead) {
    return 'Olá, VTT Store! Acabei de me cadastrar no site e quero usar meu desconto de 10% na primeira compra.\n\n' +
      '*Cupom:* ' + lead.cupom + '\n' +
      '*E-mail:* ' + lead.email + '\n' +
      '*WhatsApp:* ' + mascaraCelular(lead.whatsapp) + '\n\n' +
      'Pode me ajudar a escolher os produtos?';
  }

  function mostrarSucesso(lead) {
    document.getElementById('lead-cupom').textContent = lead.cupom;
    document.getElementById('btn-usar-desconto').href = linkWhatsApp(mensagemDesconto(lead));
    form.hidden = true;
    telaSucesso.hidden = false;
  }

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
