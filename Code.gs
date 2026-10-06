/**
 * ============================================================
 *  VTT Store — API de cadastro (Google Apps Script + Sheets)
 * ============================================================
 *
 *  ENDPOINTS (mesma URL /exec, publicada como App da Web):
 *
 *  GET  ?acao=status
 *       → { ok: true, servico, versao }               (teste rápido no navegador)
 *
 *  GET  ?acao=verificar&email=...&whatsapp=...
 *       → { ok: true, email: { cadastrado }, whatsapp: { cadastrado } }
 *         Pode mandar só um dos dois.
 *
 *  POST (form-urlencoded) email, whatsapp, origem, pagina, utm_*, website
 *       → sucesso: { ok: true, cupom: "VTT10-AB3K9" }
 *       → já existe: { ok: false, codigo: "ja_cadastrado",
 *                      erros: { email: "E-mail já cadastrado.", whatsapp: "Telefone já cadastrado." } }
 *       → inválido:  { ok: false, codigo: "dados_invalidos", erros: { ... } }
 *
 *  COMO PUBLICAR: veja o LEIA-ME.md (seção "Planilha e API").
 *  Depois de editar este código: Implantar > Gerenciar implantações >
 *  lápis (editar) > Versão: "Nova versão" > Implantar. A URL continua a mesma.
 */

const CONFIG = {
  ABA: 'Leads',
  PREFIXO_CUPOM: 'VTT10',
  VERSAO: 2,
};

// Ordem das colunas na planilha (1 = coluna A)
const COL = {
  DATA: 1,
  EMAIL: 2,
  WHATSAPP: 3,
  LINK_WHATS: 4,
  CUPOM: 5,
  CUPOM_USADO: 6,
  ORIGEM: 7,
  UTM_SOURCE: 8,
  UTM_MEDIUM: 9,
  UTM_CAMPAIGN: 10,
  PAGINA: 11,
};

const CABECALHO = [
  'Data cadastro', 'E-mail', 'WhatsApp', 'Abrir conversa', 'Cupom', 'Cupom usado?',
  'Origem', 'UTM source', 'UTM medium', 'UTM campaign', 'Página',
];

const MSG = {
  EMAIL_INVALIDO: 'Digite um e-mail válido.',
  WHATS_INVALIDO: 'Digite o celular com DDD, ex.: (21) 99999-9999.',
  EMAIL_DUPLICADO: 'E-mail já cadastrado.',
  WHATS_DUPLICADO: 'Telefone já cadastrado.',
};

/* ======================= ENDPOINTS ======================= */

function doGet(e) {
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

  return json_({ ok: true, servico: 'VTT Leads API', versao: CONFIG.VERSAO });
}

function doPost(e) {
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

    // 4) Grava
    const cupom = gerarCupom_(aba);
    const linha = [];
    linha[COL.DATA - 1] = new Date();
    linha[COL.EMAIL - 1] = seguro_(email);
    linha[COL.WHATSAPP - 1] = formatarWhats_(whatsapp);
    linha[COL.LINK_WHATS - 1] = 'https://wa.me/55' + whatsapp;
    linha[COL.CUPOM - 1] = cupom;
    linha[COL.CUPOM_USADO - 1] = false;
    linha[COL.ORIGEM - 1] = seguro_(p.origem);
    linha[COL.UTM_SOURCE - 1] = seguro_(p.utm_source);
    linha[COL.UTM_MEDIUM - 1] = seguro_(p.utm_medium);
    linha[COL.UTM_CAMPAIGN - 1] = seguro_(p.utm_campaign);
    linha[COL.PAGINA - 1] = seguro_(p.pagina);

    aba.appendRow(linha);
    aba.getRange(aba.getLastRow(), COL.CUPOM_USADO).insertCheckboxes();

    return json_({ ok: true, cupom: cupom });
  } finally {
    lock.releaseLock();
  }
}

/* ======================= PLANILHA ======================= */

function obterAba_() {
  const planilha = SpreadsheetApp.getActiveSpreadsheet();
  let aba = planilha.getSheetByName(CONFIG.ABA);
  if (!aba) aba = planilha.insertSheet(CONFIG.ABA);
  if (aba.getLastRow() === 0) {
    aba.appendRow(CABECALHO);
    aba.setFrozenRows(1);
    aba.getRange(1, 1, 1, CABECALHO.length)
      .setFontWeight('bold')
      .setBackground('#101214')
      .setFontColor('#b6ff3c');
    aba.getRange('C:C').setNumberFormat('@'); // telefone como texto
  }
  return aba;
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

/** Cupom único no formato VTT10-XXXXX (sem letras ambíguas como O/0 e I/1). */
function gerarCupom_(aba) {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const ultima = aba.getLastRow();
  const existentes = ultima > 1
    ? aba.getRange(2, COL.CUPOM, ultima - 1, 1).getValues().map(function (l) { return String(l[0]); })
    : [];
  let cupom;
  do {
    let sufixo = '';
    for (let i = 0; i < 5; i++) sufixo += letras.charAt(Math.floor(Math.random() * letras.length));
    cupom = CONFIG.PREFIXO_CUPOM + '-' + sufixo;
  } while (existentes.indexOf(cupom) !== -1);
  return cupom;
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

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ======================= TESTE MANUAL ======================= */

/** Rode esta função uma vez pelo editor (botão ▶ Executar) para criar a aba e autorizar o script. */
function configurarPlanilha() {
  obterAba_();
  Logger.log('Aba "' + CONFIG.ABA + '" pronta. Agora publique em Implantar > Nova implantação.');
}
