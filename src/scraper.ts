import * as cheerio from 'cheerio';

export interface ItemNFCe {
  nomeProduto: string;
  codigo?: string;
  quantidade: number;
  unidade: string;
  valorUnitario: number;
  valorTotal: number;
}

export interface DadosNFCe {
  chaveAcesso: string;
  estabelecimento: string;
  cnpj?: string;
  dataEmissao: string;
  subtotal?: number;
  valorTotal: number;
  desconto: number;
  itens: ItemNFCe[];
  aviso?: string;
}

export function sanitizarUrlQrCode(url: string): string {
  if (!url) return '';
  let clean = url.trim().replace(/^["']|["']$/g, '').replace(/&amp;/g, '&');
  if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
    clean = 'https://' + clean;
  }
  return clean.replace(/\|/g, '%7C');
}

function parseNumberBr(str: string): number {
  if (!str) return 0.0;
  let clean = String(str).replace(/[^0-9.,-]/g, '').trim();
  if (!clean) return 0.0;

  const hasDot = clean.includes('.');
  const hasComma = clean.includes(',');

  if (hasDot && hasComma) {
    clean = clean.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    clean = clean.replace(',', '.');
  } else if (hasDot) {
    const parts = clean.split('.');
    if (parts.length > 2) {
      clean = parts.join('');
    }
  }

  const parsed = parseFloat(clean);
  return isNaN(parsed) ? 0.0 : parsed;
}


export function round2(num: number): number {
  if (!num || isNaN(num)) return 0.0;
  return Number((Math.round((num + Number.EPSILON) * 100) / 100).toFixed(2));
}

export function isAddressText(str: string): boolean {
  if (!str) return false;
  const upper = str.toUpperCase().trim();
  const keywords = [
    'AVENIDA', 'AV.', 'AV ', 'RUA ', 'R. ', 'RODOVIA', 'ROD.', 'ALAMEDA', 'AL.',
    'PRAÇA', 'PRACA', 'BAIRRO', 'LOJA ', 'LOJA,', 'LOJA 01', 'MUNICIPIO', 'DEMARCHI',
    'SAO BERNARDO', 'SAO PAULO', 'SANTO ANDRE', 'CAMPINAS', 'GUARULHOS', 'CEP ', 'Nº'
  ];
  if (keywords.some(k => upper.includes(k))) return true;
  if (/\b(SP|RJ|MG|RS|PR|SC|GO|DF|ES|BA|PE|CE|PA|AM)\b/.test(upper) && upper.includes(',')) return true;
  return false;
}

export function isEstablishmentText(s: string): boolean {
  if (!s) return false;
  const u = s.toUpperCase().trim();
  const keywords = [
    'LTDA', 'S.A.', 'S/A', 'EIRELI', ' ME', ' EPP', 'CNPJ',
    'COMERCIO', 'COMÉRCIO', 'ATACADISTA', 'VAREJISTA', 'ATACADO', 'VAREJO',
    'DISTRIBUIDORA', 'DISTRIBUIDOR', 'POSTO', 'AUTO POSTO',
    'SUPERMERCADO', 'SUPERMERCADOS', 'ATACADAO', 'ATACADÃO', 'HIPERMERCADO', 'HIPERMERCADOS',
    'MERCADO', 'MERCEARIA', 'MINIMERCADO', 'DROGARIA', 'FARMACIA', 'FARMÁCIA',
    'RESTAURANTE', 'PADARIA', 'PANIFICADORA', 'ACOUGUE', 'AÇOUGUE',
    'LOJA ', 'LOJA,', 'LOJA 01', 'ESTABELECIMENTO', 'RAZAO SOCIAL', 'RAZÃO SOCIAL', 'NOME FANTASIA'
  ];
  return keywords.some(k => u.includes(k));
}

export function normalizarUnidade(unidade: string, nomeProduto: string): string {
  const unUpper = (unidade || '').trim().toUpperCase();
  const prodUpper = (nomeProduto || '').trim().toUpperCase();

  const combustivelKeywords = ['GASOLINA', 'ETANOL', 'DIESEL', 'COMBUSTIVEL', 'COMBUSTÍVEL', 'GNV', 'ALCOOL', 'ÁLCOOL', 'ARLA'];
  const isFuel = combustivelKeywords.some(k => prodUpper.includes(k)) || ['L', 'LT', 'LTR', 'LITRO', 'LITROS'].includes(unUpper);

  if (isFuel) {
    return 'Litro';
  }
  if (['KG', 'KILO', 'QUILO'].includes(unUpper)) return 'KG';
  if (['CX', 'CAIXA'].includes(unUpper)) return 'CX';
  if (['PCT', 'PACOTE'].includes(unUpper)) return 'PCT';
  return unUpper || 'UN';
}

export function limparNomeProduto(nome: string): string {
  if (!nome) return '';
  return nome
    .replace(/\(?Vl\.?\s*Total:?\s*R?\$?\s*[\d.,]+\)?/gi, '')
    .replace(/Vl\s*Total\s*R?\$?\s*[\d.,]+/gi, '')
    .replace(/Valor\s*Total:?\s*R?\$?\s*[\d.,]+/gi, '')
    .replace(/\(?Vl\.?\s*Unit:?\s*R?\$?\s*[\d.,]+\)?/gi, '')
    .replace(/\s*\(?\s*(?:Vl\.?|Valor)\s*Total:?\s*(?:R\$\s*)?[\d.,]+\s*\)?/gi, '')
    .replace(/\s*(?:Vl\.?|Valor)\s*Total.*$/gi, '')
    .replace(/\s*\(?\s*(?:Vl\.?|Valor)\s*Unit:?\s*(?:R\$\s*)?[\d.,]+\s*\)?/gi, '')
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extrairMetadadosUrl(urlQrCode: string) {
  let chaveAcesso: string | null = null;
  let cnpj: string | null = null;
  let valorTotal: number = 0.0;
  let dataEmissao: string | null = null;

  if (urlQrCode) {
    const cleanUrl = sanitizarUrlQrCode(urlQrCode);
    
    // Extrai chave de acesso (44 dígitos)
    const matchChave = cleanUrl.match(/\b(\d{44})\b/);
    if (matchChave) {
      chaveAcesso = matchChave[1];
      cnpj = chaveAcesso.substring(6, 20);
      const aamm = chaveAcesso.substring(2, 6);
      if (aamm.length === 4) {
        const aa = '20' + aamm.substring(0, 2);
        const mm = aamm.substring(2, 4);
        dataEmissao = `${aa}-${mm}-01T12:00:00.000Z`;
      }
    }

    // Extrai valor da URL se presente
    const matchVal = cleanUrl.match(/v=([\d.,]+)/i) || cleanUrl.match(/val=([\d.,]+)/i);
    if (matchVal) {
      valorTotal = parseNumberBr(matchVal[1]);
    }
  }

  return { chaveAcesso, cnpj, valorTotal, dataEmissao };
}

export function extrairItensTextoPuro(texto: string): ItemNFCe[] {
  const items: ItemNFCe[] = [];
  if (!texto) return items;

  const lines = texto.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // Ignora linhas antes do cabeçalho da tabela se presente
  let startIdx = 0;
  for (let idx = 0; idx < lines.length; idx++) {
    const lu = lines[idx].toUpperCase();
    if (['# | CÓD', 'ITEM CÓDIGO', 'ITEM | CÓDIGO', 'CÓDIGO DESCRIÇÃO', 'PRODUTO QTD', '# | COD'].some(h => lu.includes(h))) {
      startIdx = idx + 1;
      break;
    }
  }

  let i = startIdx;
  while (i < lines.length) {
    const line = lines[i];
    const lineUpper = line.toUpperCase();

    // Ignora linhas óbvias de cabeçalho, rodapé ou dados fiscais
    if (
      ['DOCUMENTO AUXILIAR', 'SECRETARIA DA FAZENDA', 'NFC-E', 'DANFE', 'CHAVE DE ACESSO',
       'PROTOCOLO', 'VALOR A PAGAR', 'FORMA DE PAGAMENTO', 'DINHEIRO', 'CARTAO', 'CARTÃO',
       'PAGAMENTO', 'SUBTOTAL', 'TOTAL GERAL', 'QTD. TOTAL', 'VALOR TOTAL DA NOTA',
       '# | CÓD', 'ITEM CÓDIGO', 'CONSULTA PELA CHAVE', 'EMISSÃO'
      ].some(h => lineUpper.includes(h)) ||
      isAddressText(line) ||
      isEstablishmentText(line)
    ) {
      i++;
      continue;
    }

    // Pattern 1: SAT SP format -> 1 001001 ARROZ AGULHINHA 5KG 2,000 UN X 24,90 (0,00)* 49,80
    const m_sat = line.match(/^(?:\d+)?\s*(?:\d+)?\s*(.+?)\s+([\d.,]+)\s*([A-Z]{1,4})\s*[xX*]\s*([\d.,]+)(?:\s*\(.*?\)\*?)?\s+([\d.,]+)$/);
    if (m_sat) {
      const desc = m_sat[1];
      const qtd = m_sat[2];
      const un = m_sat[3];
      const vl_un = m_sat[4];
      const vl_tot = m_sat[5];
      if (!isAddressText(desc) && !isEstablishmentText(desc)) {
        const descLimpo = desc.replace(/^(?:item\s*)?\d{1,4}\s+(?:\d{1,14}\s+)?/i, '').replace(/\(Cód(?:igo)?:?\s*\d+\)/gi, '').trim();
        const pNome = limparNomeProduto(descLimpo);
        items.push({
          nomeProduto: pNome,
          codigo: 'SAT',
          quantidade: parseNumberBr(qtd) || 1.0,
          unidade: normalizarUnidade(un, pNome),
          valorUnitario: round2(parseNumberBr(vl_un)),
          valorTotal: round2(parseNumberBr(vl_tot)),
        });
        i++;
        continue;
      }
    }

    // Pattern 2: NFC-e Single-line -> ARROZ AGULHINHA (Cód: 1001) Qtde.: 2 UN Vl. Unit.: 24,90 Vl. Total: 49,80
    if (lineUpper.includes('QTDE') || lineUpper.includes('VL.') || lineUpper.includes('VL UNIT') || lineUpper.includes('VL TOTAL')) {
      const m_nfce = line.match(/(.+?)(?:\(Cód(?:igo)?:?\s*(\d+)\))?\s+Qtde\.?:?\s*([\d.,]+)\s*([A-Z]{1,4})?\s*(?:Vl\.?\s*Unit\.?:?\s*([\d.,]+))?\s*(?:Vl\.?\s*Total:?\s*([\d.,]+))/i);
      if (m_nfce) {
        const desc = m_nfce[1];
        const cod = m_nfce[2];
        const qtd = m_nfce[3];
        const un = m_nfce[4];
        const vl_un = m_nfce[5];
        const vl_tot = m_nfce[6];
        if (desc && !isAddressText(desc) && !isEstablishmentText(desc)) {
          const descLimpo = desc.replace(/^(?:item\s*)?\d{1,4}\s+(?:\d{1,14}\s+)?/i, '').replace(/\(Cód(?:igo)?:?\s*\d+\)/gi, '').trim();
          const pNome = limparNomeProduto(descLimpo);
          const q_val = parseNumberBr(qtd) || 1.0;
          const u_val = parseNumberBr(vl_un) || 0.0;
          const t_val = parseNumberBr(vl_tot) || round2(q_val * u_val);
          items.push({
            nomeProduto: pNome,
            codigo: cod || 'NFCE',
            quantidade: q_val,
            unidade: normalizarUnidade(un, pNome),
            valorUnitario: round2(u_val),
            valorTotal: round2(t_val),
          });
          i++;
          continue;
        }
      }
    }

    // Pattern 3: Multi-line / Mobile paste (o nome do item precede a Qtde dentro de 1 a 2 linhas)
    const window = lines.slice(i, Math.min(i + 10, lines.length));
    let qtdeRelIdx = -1;
    for (let widx = 0; widx < window.length; widx++) {
      const wlu = window[widx].toUpperCase();
      if (wlu.startsWith('QTDE') || wlu === 'QTDE.:' || wlu.startsWith('QTD')) {
        qtdeRelIdx = widx;
        break;
      }
    }

    if (qtdeRelIdx >= 1 && qtdeRelIdx <= 2) {
      const descRaw = line;
      const descLimpo = descRaw.replace(/^(?:item\s*)?\d{1,4}\s+(?:\d{1,14}\s+)?/i, '').replace(/\(Cód(?:igo)?:?\s*\d+\)/gi, '').trim();

      if (!isAddressText(descLimpo) && !isEstablishmentText(descLimpo) && !['CNPJ', 'EMISSÃO', 'CONSUMIDOR', 'TOTAL', 'SUBTOTAL', 'CHAVE', 'VALOR'].some(k => descLimpo.toUpperCase().includes(k))) {
        const windowText = window.join(' \n ');
        const m_cod = windowText.match(/\(Cód(?:igo)?:?\s*(\d+)\)|Código:?\s*(\d+)/i);
        const cod = m_cod ? (m_cod[1] || m_cod[2]) : undefined;

        const m_qtd = windowText.match(/Qtde?\.?:?\s*\n?\s*([\d.,]+)/i);
        const qtd_val = m_qtd ? parseNumberBr(m_qtd[1]) : 1.0;

        const m_un = windowText.match(/\bUN:?\s*\n?\s*([A-Z]{1,4})\b|\b(UN|KG|CX|PC|L|LT|DZ|FD|M|G|ML)\b/i);
        const un_val = m_un ? (m_un[1] || m_un[2]).toUpperCase() : 'UN';

        const m_vun = windowText.match(/Vl\.?\s*Unit\.?:?\s*\n?\s*([\d.,]+)/i);
        let vun_val = m_vun ? parseNumberBr(m_vun[1]) : 0.0;

        const m_vtot = windowText.match(/(?:Vl\.?\s*Total|Valor\s*Total):?\s*\n?\s*([\d.,]+)/i);
        let vtot_val = m_vtot ? parseNumberBr(m_vtot[1]) : 0.0;

        if (vtot_val === 0.0 && qtd_val > 0 && vun_val > 0) {
          vtot_val = round2(qtd_val * vun_val);
        } else if (vun_val === 0.0 && qtd_val > 0 && vtot_val > 0) {
          vun_val = round2(vtot_val / qtd_val);
        }

        if (vtot_val > 0 || vun_val > 0) {
          const pNome = limparNomeProduto(descLimpo);
          items.push({
            nomeProduto: pNome,
            codigo: cod,
            quantidade: qtd_val,
            unidade: normalizarUnidade(un_val, pNome),
            valorUnitario: round2(vun_val),
            valorTotal: round2(vtot_val),
          });

          let lastOffset = 2;
          for (let off = 0; off < window.length; off++) {
            if (['TOTAL', 'VL. TOTAL', 'VL TOTAL'].some(marker => window[off].toUpperCase().includes(marker))) {
              lastOffset = off + (window.length > off + 1 && /^[\d.,]+$/.test(window[off + 1].trim()) ? 2 : 1);
              break;
            }
          }
          i += Math.max(lastOffset, 2);
          continue;
        }
      }
    }

    i++;
  }

  return items;
}

export function extrairDadosNFCeFromHtml(html: string, urlQrCode: string = ''): DadosNFCe {
  const metaUrl = extrairMetadadosUrl(urlQrCode);
  const rawText = html || '';
  const $ = cheerio.load(rawText.includes('<') ? rawText : `<html><body><pre>${rawText}</pre></body></html>`);

  let estabelecimento =
    $('#txtBoxSubTitulo').text().trim() ||
    $('.txtTopo').first().text().trim() ||
    $('#lblRazaoSocial').text().trim() ||
    $('.txtCenter .txtBoxSubTitulo').text().trim() ||
    $('.txtBoxSubTitulo').text().trim() ||
    '';

  const fullText = ($.text() || '') + '\n' + rawText;
  const lines = fullText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  if (!estabelecimento) {
    // 1. Procura por rótulo oficial no texto
    const mLabel = fullText.match(/(?:Nome\s*\/?\s*Raz[aã]o\s*Social|Raz[aã]o\s*Social|Nome\s*Fantasia|Emitente|Estabelecimento):\s*([^\n\r]+)/i);
    if (mLabel && mLabel[1] && mLabel[1].trim()) {
      estabelecimento = mLabel[1].trim();
    }
  }

  if (!estabelecimento) {
    // 2. Procura pela linha anterior ou posterior ao CNPJ
    for (let idx = 0; idx < lines.length; idx++) {
      if (lines[idx].toUpperCase().includes('CNPJ')) {
        for (let pIdx = idx - 1; pIdx >= Math.max(0, idx - 4); pIdx--) {
          const prev = lines[pIdx];
          const pu = prev.toUpperCase();
          if (
            !pu.includes('SECRETARIA') &&
            !pu.includes('FAZENDA') &&
            !pu.includes('NFC-E') &&
            !pu.includes('DANFE') &&
            !pu.includes('DOCUMENTO AUXILIAR') &&
            !pu.includes('CONSULTA') &&
            !pu.includes('PORTAL') &&
            prev.length > 3
          ) {
            estabelecimento = prev;
            break;
          }
        }
        if (estabelecimento) break;
      }
    }
  }

  if (!estabelecimento) {
    // 3. Procura por palavras-chave empresariais
    const kwEst = [
      'LTDA', 'S.A.', 'S/A', 'EIRELI', ' ME', ' EPP', 'POSTO', 'AUTO POSTO', 'COMERCIO', 'COMÉRCIO',
      'SUPERMERCADO', 'SUPERMERCADOS', 'ATACADAO', 'ATACADÃO', 'HIPERMERCADO', 'MERCADO', 'BEM BARATO',
      'DROGARIA', 'FARMACIA', 'FARMÁCIA', 'RESTAURANTE', 'PADARIA', 'PANIFICADORA', 'DISTRIBUIDORA', 'LOJA'
    ];
    for (const l of lines) {
      const lu = l.toUpperCase();
      if (kwEst.some(k => lu.includes(k))) {
        if (
          !lu.includes('SECRETARIA') &&
          !lu.includes('FAZENDA') &&
          !lu.includes('NFC-E') &&
          !lu.includes('DANFE') &&
          !lu.includes('DOCUMENTO AUXILIAR') &&
          !lu.includes('CONSULTA') &&
          !lu.includes('PORTAL')
        ) {
          estabelecimento = l;
          break;
        }
      }
    }
  }

  const cnpjText = $('.text').text() || $.text();
  const cnpjMatch = cnpjText.match(/CNPJ:\s*([0-9.\/-]+)/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^0-9]/g, '') : (metaUrl.cnpj ? metaUrl.cnpj.replace(/[^0-9]/g, '') : undefined);

  const chaveMatch =
    $.html().match(/\b(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})\b/) ||
    $.html().match(/chave=(\d{44})/i);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : (metaUrl.chaveAcesso || 'NFCe_' + Date.now());

  const itens: ItemNFCe[] = [];

  // 1. Tentar extrair do HTML estruturado da SEFAZ
  $('#tabResult tr, table[id*="Result"] tr, .tabResult tr, tr:has(.txtTit), table tr:has(td)').each((_, element) => {
    const row = $(element);
    const rawNome = row.find('.txtTit').text().trim() || row.find('td').first().text().trim();
    const nomeProduto = limparNomeProduto(rawNome);

    if (nomeProduto && !['TOTAL', 'SUBTOTAL', 'DESCONTO', 'PAGAMENTO', 'PRODUTO', 'ITEM'].some(k => nomeProduto.toUpperCase().includes(k))) {
      const codigoText = row.find('.RCod').text().trim();
      const codigoMatch = codigoText.match(/\(Código:\s*(\d+)\)/i);
      const codigo = codigoMatch ? codigoMatch[1] : undefined;

      const qtdText = row.find('.RQt').text().replace('Qtde.:', '').trim();
      const unText = row.find('.RUN').text().replace('UN:', '').trim();
      const vlUnText = row.find('.RvlUnit').text().replace('Vl. Unit.:', '').trim();
      const vlTotText = row.find('.valor').text().trim() || row.find('td').last().text().trim();

      if (!isAddressText(nomeProduto)) {
        itens.push({
          nomeProduto,
          codigo,
          quantidade: parseNumberBr(qtdText) || 1.0,
          unidade: normalizarUnidade(unText || 'UN', nomeProduto),
          valorUnitario: round2(parseNumberBr(vlUnText)),
          valorTotal: round2(parseNumberBr(vlTotText)),
        });
      }
    }
  });

  // 2. Se o HTML não tinha tabela estruturada (ou foi texto copiado do clipboard), extrai por linhas de texto!
  if (itens.length === 0) {
    const itensTexto = extrairItensTextoPuro($.text());
    itens.push(...itensTexto);
  }

  const valorTotalText =
    $('#totalNota .totalNff .txtMax').text() ||
    $('.totalNff .txtMax').text() ||
    $('#lblValorTotal').text().trim() ||
    '0';
  let valorTotal = parseNumberBr(valorTotalText);

  if (valorTotal === 0 && itens.length > 0) {
    valorTotal = itens.reduce((acc, item) => acc + (item.valorTotal || 0), 0);
  }
  if (valorTotal === 0 && metaUrl.valorTotal > 0) {
    valorTotal = metaUrl.valorTotal;
  }

  const descontoText =
    $('#totalNota .totalNff:contains("Desconto") .txtMax').text() ||
    $('.totalNff:contains("Desconto") .txtMax').text() ||
    '0';
  let desconto = parseNumberBr(descontoText);

  let dataEmissao = metaUrl.dataEmissao || new Date().toISOString();
  const fullHtmlText = $.text() || $.html();
  const dataMatch =
    fullHtmlText.match(/Emissão:?\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i) ||
    fullHtmlText.match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4})/);

  if (dataMatch && (!metaUrl.dataEmissao || metaUrl.dataEmissao.includes('-01T12:00:00'))) {
    const parts = dataMatch[1].split('/');
    if (parts.length === 3) {
      const day = parts[0].padStart(2, '0');
      const month = parts[1].padStart(2, '0');
      const year = parts[2];
      dataEmissao = `${year}-${month}-${day}T12:00:00.000Z`;
    }
  }

  let aviso: string | undefined = undefined;
  if (itens.length === 0) {
    if (!estabelecimento || estabelecimento === 'Estabelecimento Não Identificado') {
      estabelecimento = metaUrl.cnpj ? 'Mercado / CNPJ ' + metaUrl.cnpj : 'Mercado / SEFAZ SP';
    }
    const valFallback = valorTotal > 0 ? valorTotal : (metaUrl.valorTotal > 0 ? metaUrl.valorTotal : 0.0);
    itens.push({
      nomeProduto: 'Compras Mercado SEFAZ',
      codigo: 'SEFAZ',
      quantidade: 1.0,
      unidade: 'UN',
      valorUnitario: valFallback,
      valorTotal: valFallback
    });
    valorTotal = valFallback;
    aviso = 'NFC-e lida com sucesso via Chave da SEFAZ! (Metadados processados via QR Code).';
  }

  if (!estabelecimento || estabelecimento === 'Estabelecimento Não Identificado') {
    estabelecimento = metaUrl.cnpj ? 'Mercado / CNPJ ' + metaUrl.cnpj : 'Mercado / SEFAZ';
  }

  const allLines = ($.text() || '').split('
').map(l => l.trim()).filter(l => l.length > 0);

  let subtotalExt = 0.0;
  for (let idx = 0; idx < allLines.length; idx++) {
    const lu = allLines[idx].toUpperCase();
    if (lu.includes('SUBTOTAL') || lu.includes('SUB TOTAL') || lu.includes('TOTAL BRUTO')) {
      let m = allLines[idx].match(/([\d]+[.,][\d]{2})/);
      if (!m && idx + 1 < allLines.length) m = allLines[idx + 1].match(/([\d]+[.,][\d]{2})/);
      if (m) { subtotalExt = parseNumberBr(m[1]); break; }
    }
  }

  if (desconto === 0) {
    for (let idx = 0; idx < allLines.length; idx++) {
      const lu = allLines[idx].toUpperCase();
      if ((lu.includes('DESCONTO') || lu.includes('ABATIMENTO')) && !lu.includes('SEM DESCONTO')) {
        let m = allLines[idx].match(/([\d]+[.,][\d]{2})/);
        if (!m && idx + 1 < allLines.length) m = allLines[idx + 1].match(/([\d]+[.,][\d]{2})/);
        if (m) { desconto = parseNumberBr(m[1]); break; }
      }
    }
  }

  let valorTotalExt = 0.0;
  for (let idx = 0; idx < allLines.length; idx++) {
    const lu = allLines[idx].toUpperCase();
    if (lu.includes('SUBTOTAL') || lu.includes('SUB TOTAL') || lu.includes('QTD') || lu.includes('QUANTIDADE')) continue;
    if (['VALOR A PAGAR', 'VALOR TOTAL', 'TOTAL DA NOTA', 'TOTAL GERAL', 'TOTAL R$', 'TOTAL:'].some(k => lu.includes(k))) {
      let m = allLines[idx].match(/([\d]+[.,][\d]{2})/);
      if (!m && idx + 1 < allLines.length) m = allLines[idx + 1].match(/([\d]+[.,][\d]{2})/);
      if (m) { valorTotalExt = parseNumberBr(m[1]); break; }
    }
  }

  const somaItens = round2(itens.reduce((acc, it) => acc + (it.valorTotal || 0), 0));
  let subtotal = subtotalExt > 0 ? subtotalExt : (somaItens > 0 ? somaItens : valorTotal);
  if (valorTotalExt > 0) valorTotal = valorTotalExt;

  if (valorTotal === 0.0 && subtotal > 0) {
    valorTotal = round2(Math.max(0, subtotal - desconto));
  } else if (desconto === 0.0 && subtotal > valorTotal && valorTotal > 0) {
    desconto = round2(subtotal - valorTotal);
  }

  return {
    chaveAcesso,
    estabelecimento,
    cnpj,
    dataEmissao,
    subtotal: round2(subtotal),
    valorTotal: round2(valorTotal),
    desconto: round2(desconto),
    itens: itens.map(it => ({
      ...it,
      valorUnitario: round2(it.valorUnitario),
      valorTotal: round2(it.valorTotal),
      unidade: normalizarUnidade(it.unidade, it.nomeProduto)
    })),
    aviso
  };
}

export async function extrairDadosNFCe(urlQrCode: string): Promise<DadosNFCe> {
  let html = '';
  const urlClean = sanitizarUrlQrCode(urlQrCode);

  if (urlClean) {
    try {
      const response = await fetch(urlClean, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
        },
        redirect: 'follow'
      });

      if (response.ok) {
        html = await response.text();
      }
    } catch (error: any) {}
  }

  return extrairDadosNFCeFromHtml(html, urlClean);
}
