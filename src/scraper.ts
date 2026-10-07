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

export function limparNomeProduto(nome: string): string {
  if (!nome) return '';
  return nome
    .replace(/\(?Vl\.?\s*Total:?\s*R?\$?s*[\d.,]+\)?/gi, '')
    .replace(/Vl\.?\s*Total.*$/gi, '')
    .replace(/\(?Vl\.?\s*Unit:?\s*R?\$?s*[\d.,]+\)?/gi, '')
    .replace(/[-–—]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseNumberBr(str: string): number {
  if (!str) return 0.0;
  const limpo = str.replace(/[^0-9.,]/g, '').trim();
  if (!limpo) return 0.0;
  if (limpo.includes(',')) {
    const semPontoMilhar = limpo.replace(/\./g, '');
    const comPontoDecimal = semPontoMilhar.replace(',', '.');
    return parseFloat(comPontoDecimal) || 0.0;
  }
  return parseFloat(limpo) || 0.0;
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

  // Estabelecimento / Razão Social
  const estabelecimento =
    $('#txtBoxSubTitulo').text().trim() ||
    $('.txtTopo').first().text().trim() ||
    $('#lblRazaoSocial').text().trim() ||
    $('.txtCenter .txtBoxSubTitulo').text().trim() ||
    $('.txtBoxSubTitulo').text().trim() ||
    'Estabelecimento Não Identificado';

  // CNPJ
  const cnpjText = $('.text').text() || $('body').text();
  const cnpjMatch = cnpjText.match(/CNPJ:\s*([0-9.\/-]+)/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^0-9]/g, '') : undefined;

  // Chave de Acesso (44 dígitos)
  const chaveMatch =
    $.html().match(/\b(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})\b/) ||
    $.html().match(/chave=(\d{44})/i);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : `NFCe_${Date.now()}`;

  // Itens da Nota
  const itens: ItemNFCe[] = [];

  $('#tabResult tr, table[id*="Result"] tr, .tabResult tr, tr:has(.txtTit)').each((_, element) => {
    const row = $(element);
    const rawNome = row.find('.txtTit').text().trim();
    const nomeProduto = limparNomeProduto(rawNome);

    if (nomeProduto) {
      const codigoText = row.find('.RCod').text().trim();
      const codigoMatch = codigoText.match(/\(Código:\s*(\d+)\)/i);
      const codigo = codigoMatch ? codigoMatch[1] : undefined;

      const qtdText = row.find('.RQt').text().replace('Qtde.:', '').trim();
      const unText = row.find('.RUN').text().replace('UN:', '').trim();
      const vlUnText = row.find('.RvlUnit').text().replace('Vl. Unit.:', '').trim();
      const vlTotText = row.find('.valor').text().trim();

      itens.push({
        nomeProduto,
        codigo,
        quantidade: parseNumberBr(qtdText) || 1.0,
        unidade: unText || 'UN',
        valorUnitario: parseNumberBr(vlUnText) || 0.0,
        valorTotal: parseNumberBr(vlTotText) || 0.0,
      });
    }
  });

  // Valor Total e Desconto
  const valorTotalText =
    $('#totalNota .totalNff .txtMax').text() ||
    $('.totalNff .txtMax').text() ||
    $('#lblValorTotal').text().trim() ||
    '0';
  let valorTotal = parseNumberBr(valorTotalText);

  if (valorTotal === 0 && itens.length > 0) {
    valorTotal = itens.reduce((acc, item) => acc + (item.valorTotal || 0), 0);
  }

  const descontoText =
    $('#totalNota .totalNff:contains("Desconto") .txtMax').text() ||
    $('.totalNff:contains("Desconto") .txtMax').text() ||
    '0';
  const desconto = parseNumberBr(descontoText);

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
