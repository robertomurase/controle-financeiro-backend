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

/**
 * Realiza o parse da URL ou HTML do QR Code da NFC-e SEFAZ utilizando Cheerio.
 */
export async function extrairDadosNFCe(urlOuHtml: string): Promise<DadosNFCe> {
  let html = urlOuHtml;

  // Se for URL, faz o fetch do conteúdo HTML da SEFAZ
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

  // Extração do Estabelecimento / Razão Social
  const estabelecimento =
    $('#txtBoxSubTitulo').text().trim() ||
    $('.txtTopo').first().text().trim() ||
    'Estabelecimento Não Identificado';

  // Extração de CNPJ
  const cnpjText = $('.text').text() || $('body').text();
  const cnpjMatch = cnpjText.match(/CNPJ:\s*([0-9.\/-]+)/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^0-9]/g, '') : undefined;

  // Extração da Chave de Acesso (44 dígitos)
  const chaveMatch = $.html().match(/\b(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})\b/) ||
                     $.html().match(/chave=(\d{44})/i);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : `NFCe_${Date.now()}`;

  // Extração de Valores e Desconto
  const valorTotalText = $('#totalNota .totalNff .txtMax').text() || $('.totalNff .txtMax').text() || '0';
  const valorTotal = parseFloat(valorTotalText.replace('.', '').replace(',', '.')) || 0.0;

  const descontoText = $('#totalNota .totalNff:contains("Desconto") .txtMax').text() || '0';
  const desconto = parseFloat(descontoText.replace('.', '').replace(',', '.')) || 0.0;

  // Extração dos Itens/Produtos
  const itens: ItemNFCe[] = [];

  $('#tabResult tr').each((_, element) => {
    const row = $(element);
    const nomeProduto = row.find('.txtTit').text().trim();

    if (nomeProduto) {
      const codigoText = row.find('.RCod').text().trim();
      const codigoMatch = codigoText.match(/\(Código:\s*(\d+)\)/i);
      const codigo = codigoMatch ? codigoMatch[1] : undefined;

      const qtdText = row.find('.RQt').text().replace('Qtde.:', '').trim();
      const unText = row.find('.RUN').text().replace('UN:', '').trim();
      const vlUnText = row.find('.RvlUnit').text().replace('Vl. Unit.:', '').replace('.', '').replace(',', '.').trim();
      const vlTotText = row.find('.valor').text().replace('.', '').replace(',', '.').trim();

      itens.push({
        nomeProduto,
        codigo,
        quantidade: parseFloat(qtdText) || 1,
        unidade: unText || 'UN',
        valorUnitario: parseFloat(vlUnText) || 0.0,
        valorTotal: parseFloat(vlTotText) || 0.0,
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
