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
  valorTotal: number;
  desconto: number;
  itens: ItemNFCe[];
}

function parseNumberBr(valStr: string | undefined): number {
  if (!valStr) return 0.0;
  const cleaned = valStr.replace(/[^\d.,]/g, '').trim();

  if (!cleaned) return 0.0;

  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.');
    return parseFloat(normalized) || 0.0;
  }
  return parseFloat(cleaned) || 0.0;
}

export async function extrairDadosNFCe(urlOuHtml: string): Promise<DadosNFCe> {
  let html = urlOuHtml;

  if (urlOuHtml.startsWith('http://') || urlOuHtml.startsWith('https://')) {
    const response = await fetch(urlOuHtml, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      throw new Error(`Falha ao acessar a URL da SEFAZ: HTTP ${response.status}`);
    }

    html = await response.text();
  }

  const $ = cheerio.load(html);

  const estabelecimento =
    $('#txtBoxSubTitulo').text().trim() ||
    $('.txtTopo').first().text().trim() ||
    $('.txtCenter .txtBoxSubTitulo').text().trim() ||
    $('#lblRazaoSocial').text().trim() ||
    'Estabelecimento Não Identificado';

  const cnpjText = $('.text').text() || $('body').text();
  const cnpjMatch = cnpjText.match(/CNPJ:\s*([0-9.\/-]+)/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^0-9]/g, '') : undefined;

  const chaveMatch =
    $.html().match(/\b(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})\b/) ||
    $.html().match(/chave=(\d{44})/i);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : `NFCe_${Date.now()}`;

  const valorTotalRaw =
    $('#totalNota .totalNff .txtMax').text() ||
    $('.totalNff .txtMax').text() ||
    $('#lblValorTotal').text() ||
    '0';
  const valorTotal = parseNumberBr(valorTotalRaw);

  const descontoRaw =
    $('#totalNota .totalNff:contains("Desconto") .txtMax').text() ||
    $('.totalNff:contains("Desconto") .txtMax').text() ||
    '0';
  const desconto = parseNumberBr(descontoRaw);

  const itens: ItemNFCe[] = [];

  const trs = $('#tabResult tr, table[id*="Result"] tr, .tabResult tr');

  trs.each((_, element) => {
    const row = $(element);
    const nomeProduto = row.find('.txtTit').text().trim();

    if (nomeProduto) {
      const codigoText = row.find('.RCod').text().trim();
      const codigoMatch = codigoText.match(/\(Código:\s*(\d+)\)/i) || codigoText.match(/(\d+)/);
      const codigo = codigoMatch ? codigoMatch[1] : undefined;

      const qtdText = row.find('.RQt').text().trim();
      const unText = row.find('.RUN').text().replace(/UN:/i, '').trim();
      const vlUnText = row.find('.RvlUnit').text().trim();
      const vlTotText = row.find('.valor').text().trim();

      const quantidade = parseNumberBr(qtdText) || 1.0;
      const valorUnitario = parseNumberBr(vlUnText);
      const valorTotal = parseNumberBr(vlTotText) || (quantidade * valorUnitario);

      itens.push({
        nomeProduto,
        codigo,
        quantidade,
        unidade: unText || 'UN',
        valorUnitario,
        valorTotal,
      });
    }
  });

  return {
    chaveAcesso,
    estabelecimento,
    cnpj,
    dataEmissao: new Date().toISOString(),
    valorTotal,
    desconto,
    itens,
  };
}
