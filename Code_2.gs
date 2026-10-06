/**
 * ============================================================
 *  VTT Store — API de cadastro (Google Apps Script + Sheets)
 * ============================================================
 *
 *  Colunas da aba "Leads":  Data cadastro | E-mail | WhatsApp | Cupom usado?
 *
 *  ENDPOINTS (mesma URL /exec, publicada como App da Web):
 *
 *  GET  ?acao=status
 *       → { ok, versao, planilha, aba, cadastros }   (teste rápido no navegador)
 *
 *  GET  ?acao=verificar&email=...&whatsapp=...
 *       → { ok: true, email: { cadastrado }, whatsapp: { cadastrado } }
 *         Pode mandar só um dos dois.
 *
 *  POST (form-urlencoded) email, whatsapp, website
 *       → sucesso:   { ok: true, cupom: "VTT10-AB3K9" }
 *       → já existe: { ok: false, codigo: "ja_cadastrado",
 *                      erros: { email: "E-mail já cadastrado.", whatsapp: "Telefone já cadastrado." } }
 *       → inválido:  { ok: false, codigo: "dados_invalidos", erros: { ... } }
 *
 *  COMO PUBLICAR: veja o LEIA-ME.md (seção "Planilha e API").
 *  Depois de editar este código: Implantar > Gerenciar implantações >
 *  lápis (editar) > Versão: "Nova versão" > Implantar. A URL continua a mesma.
 */

const CONFIG = {
  // ID da planilha: o trecho entre /d/ e /edit no link dela.
  // https://docs.google.com/spreadsheets/d/  1AbC...xYz  /edit
  // Preencha SEMPRE que o script tiver sido criado fora da planilha (script.google.com).
  // Se o script foi aberto pela planilha (Extensões > Apps Script), pode deixar vazio.
  PLANILHA_ID: '',

  ABA: 'Leads',
  PREFIXO_CUPOM: 'VTT10',
  VERSAO: 4,
};

// Ordem das colunas na planilha (1 = coluna A)
const COL = {
  DATA: 1,
  EMAIL: 2,
  WHATSAPP: 3,
  CUPOM_USADO: 4,
};

const CABECALHO = ['Data cadastro', 'E-mail', 'WhatsApp', 'Cupom usado?'];

const MSG = {
  EMAIL_INVALIDO: 'Digite um e-mail válido.',
  WHATS_INVALIDO: 'Digite o celular com DDD, ex.: (21) 99999-9999.',
  EMAIL_DUPLICADO: 'E-mail já cadastrado.',
  WHATS_DUPLICADO: 'Telefone já cadastrado.',
};

/* ======================= ENDPOINTS ======================= */

function doGet(e) {
  try {
    return doGetInterno_(e);
  } catch (err) {
    return erroServidor_(err);
  }
}

function doPost(e) {
  try {
    return doPostInterno_(e);
  } catch (err) {
    return erroServidor_(err);
  }
}

function doGetInterno_(e) {
  const p = (e && e.parameter) || {};
  const acao = p.acao || 'status';

  if (acao === 'verificar') {
    const email = normalizarEmail_(p.email);
    const whatsapp = normalizarWhats_(p.whatsapp);
    const achados = buscarDuplicados_(obterAba_(), email, whatsapp);
    return json_({
      ok: true,
      email: { cadastrado: achados.email, mensagem: achados.email ? MSG.EMAIL_DUPLICADO : '' },
      whatsapp: { cadastrado: achados.whatsapp, mensagem: achados.whatsapp ? MSG.WHATS_DUPLICADO : '' },
    });
  }

  // Status / diagnóstico: mostra em qual planilha e aba o script está gravando
  const aba = obterAba_();
  return json_({
    ok: true,
    servico: 'VTT Leads API',
    versao: CONFIG.VERSAO,
    planilha: aba.getParent().getName(),
    aba: aba.getName(),
    cadastros: Math.max(aba.getLastRow() - 1, 0),
  });
}

function doPostInterno_(e) {
  const p = (e && e.parameter) || {};

  // Honeypot preenchido = robô. Finge sucesso e não grava nada.
  if (p.website) return json_({ ok: true, cupom: CONFIG.PREFIXO_CUPOM + '-OK' });

  const email = normalizarEmail_(p.email);
  const whatsapp = normalizarWhats_(p.whatsapp);

  // 1) Validação
  const erros = {};
  if (!emailValido_(email)) erros.email = MSG.EMAIL_INVALIDO;
  if (!whatsValido_(whatsapp)) erros.whatsapp = MSG.WHATS_INVALIDO;
  if (Object.keys(erros).length) return json_({ ok: false, codigo: 'dados_invalidos', erros: erros });

  // 2) Trava para dois cadastros simultâneos não passarem juntos
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return json_({ ok: false, codigo: 'ocupado', erros: {} });

  try {
    const aba = obterAba_();

    // 3) Duplicados
    const achados = buscarDuplicados_(aba, email, whatsapp);
    if (achados.email || achados.whatsapp) {
      const errosDup = {};
      if (achados.email) errosDup.email = MSG.EMAIL_DUPLICADO;
      if (achados.whatsapp) errosDup.whatsapp = MSG.WHATS_DUPLICADO;
      return json_({ ok: false, codigo: 'ja_cadastrado', erros: errosDup });
    }

    // 4) Grava: Data | E-mail | WhatsApp | Cupom usado? (caixa desmarcada)
    aba.appendRow([new Date(), seguro_(email), formatarWhats_(whatsapp), false]);
    aba.getRange(aba.getLastRow(), COL.CUPOM_USADO).insertCheckboxes();

    // O cupom vai só para a tela e para a mensagem do WhatsApp (não é gravado).
    // A loja confere o cliente pelo e-mail/WhatsApp que vêm na mensagem.
    return json_({ ok: true, cupom: gerarCupom_() });
  } finally {
    lock.releaseLock();
  }
}

/* ======================= PLANILHA ======================= */

function abrirPlanilha_() {
  if (CONFIG.PLANILHA_ID) return SpreadsheetApp.openById(CONFIG.PLANILHA_ID);
  const ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (!ativa) {
    throw new Error('Script não está ligado a nenhuma planilha. Preencha CONFIG.PLANILHA_ID no topo do Code.gs.');
  }
  return ativa;
}

function obterAba_() {
  const planilha = abrirPlanilha_();
  let aba = planilha.getSheetByName(CONFIG.ABA);

  if (!aba) {
    // Planilha nova (só a "Página1" vazia)? Renomeia ela para "Leads" em vez de criar outra aba.
    const abas = planilha.getSheets();
    if (abas.length === 1 && abas[0].getLastRow() === 0) {
      aba = abas[0].setName(CONFIG.ABA);
    } else {
      aba = planilha.insertSheet(CONFIG.ABA);
    }
  }

  // Aba criada com um cabeçalho antigo (versão anterior do script)?
  if (aba.getLastRow() > 0 && !cabecalhoAtual_(aba)) {
    if (aba.getLastRow() === 1) {
      aba.clear(); // só tinha o cabeçalho antigo: recria
    } else {
      // tem cadastros no formato antigo: guarda numa aba separada e começa uma nova
      aba.setName(CONFIG.ABA + ' (antigo)');
      aba = planilha.insertSheet(CONFIG.ABA);
    }
  }

  if (aba.getLastRow() === 0) montarCabecalho_(aba);
  return aba;
}

function cabecalhoAtual_(aba) {
  const largura = Math.max(aba.getLastColumn(), CABECALHO.length);
  const atual = aba.getRange(1, 1, 1, largura).getValues()[0];
  return CABECALHO.every(function (titulo, i) { return atual[i] === titulo; }) &&
    atual.slice(CABECALHO.length).every(function (v) { return v === ''; });
}

function montarCabecalho_(aba) {
  aba.appendRow(CABECALHO);
  aba.setFrozenRows(1);
  aba.getRange(1, 1, 1, CABECALHO.length)
    .setFontWeight('bold')
    .setBackground('#101214')
    .setFontColor('#b6ff3c');
  aba.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm'); // data e hora
  aba.getRange('C:C').setNumberFormat('@');                // telefone como texto
  aba.setColumnWidth(COL.DATA, 140);
  aba.setColumnWidth(COL.EMAIL, 260);
  aba.setColumnWidth(COL.WHATSAPP, 150);
  aba.setColumnWidth(COL.CUPOM_USADO, 110);
}

/** Procura e-mail e telefone já cadastrados. Retorna { email: bool, whatsapp: bool }. */
function buscarDuplicados_(aba, email, whatsapp) {
  const resultado = { email: false, whatsapp: false };
  const ultima = aba.getLastRow();
  if (ultima < 2 || (!email && !whatsapp)) return resultado;

  const valores = aba.getRange(2, COL.EMAIL, ultima - 1, 2).getValues(); // colunas E-mail e WhatsApp
  for (let i = 0; i < valores.length; i++) {
    if (email && normalizarEmail_(valores[i][0]) === email) resultado.email = true;
    if (whatsapp && normalizarWhats_(valores[i][1]) === whatsapp) resultado.whatsapp = true;
    if (resultado.email && resultado.whatsapp) break;
  }
  return resultado;
}

/** Cupom no formato VTT10-XXXXX (sem letras ambíguas como O/0 e I/1). */
function gerarCupom_() {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let sufixo = '';
  for (let i = 0; i < 5; i++) sufixo += letras.charAt(Math.floor(Math.random() * letras.length));
  return CONFIG.PREFIXO_CUPOM + '-' + sufixo;
}

/* ======================= AUXILIARES ======================= */

function normalizarEmail_(v) {
  return String(v || '').trim().toLowerCase();
}

/** Só dígitos, sem o 55 do país: "+55 (21) 99577-9923" → "21995779923" */
function normalizarWhats_(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 13 && d.indexOf('55') === 0) d = d.slice(2);
  return d;
}

function emailValido_(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function whatsValido_(d) {
  return /^\d{2}9\d{8}$/.test(d);
}

function formatarWhats_(d) {
  return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
}

/** Impede que um texto começando com = + - @ vire fórmula na planilha. */
function seguro_(valor) {
  const v = String(valor || '').slice(0, 500);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function erroServidor_(err) {
  console.error(err);
  return json_({ ok: false, codigo: 'erro_servidor', mensagem: String(err && err.message || err) });
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ======================= CONFIGURAÇÃO ======================= */

/**
 * Rode esta função UMA VEZ pelo editor (selecione "configurarPlanilha" e clique ▶ Executar).
 * Ela autoriza o script e cria a aba "Leads" com o cabeçalho.
 * Veja o resultado em "Registro de execução", na parte de baixo do editor.
 */
function configurarPlanilha() {
  const aba = obterAba_();
  Logger.log('OK! Planilha: "' + aba.getParent().getName() + '" | Aba: "' + aba.getName() +
    '" | Colunas: ' + CABECALHO.join(' | '));
  Logger.log('Próximo passo: Implantar > Nova implantação > App da Web.');
}

/** Cria o menu "VTT" na planilha (só funciona quando o script foi aberto pela planilha). */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('VTT')
    .addItem('Criar/verificar cabeçalho', 'configurarPlanilha')
    .addToUi();
}
