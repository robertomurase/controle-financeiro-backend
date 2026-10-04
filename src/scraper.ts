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

function parseNumberBr(texto: string): number {
  if (!texto) return 0;
  const match = texto.match(/([0-9]{1,3}(?:\.[0-9]{3})*|\d+)(?:,(\d+))?/);
  if (!match) return 0;
  const inteiro = match[1].replace(/\./g, '');
  const decimal = match[2] ?  : '';
  const val = parseFloat();
  return isNaN(val) ? 0 : val;
}

/**
 * Realiza o parse da URL ou HTML do QR Code da NFC-e SEFAZ utilizando Cheerio.
 */
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
      throw new Error();
    }

    html = await response.text();
  }

  const $ = cheerio.load(html);

  // Extração do Estabelecimento / Razão Social
  const estabelecimento =
    .text().trim() ||
    .first().text().trim() ||
    .text().trim() ||
    .text().trim() ||
    'Estabelecimento Não Identificado';

  // Extração de CNPJ
  const cnpjText = .text() || .text();
  const cnpjMatch = cnpjText.match(/CNPJ:\s*([0-9.\/-]+)/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^0-9]/g, '') : undefined;

  // Extração da Chave de Acesso (44 dígitos)
  const chaveMatch = $.html().match(/(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/) ||
                     $.html().match(/chave=(\d{44})/i);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : ;

  // Extração de Valores e Desconto
  const valorTotalText = .text() || .text() || .text() || '0';
  const valorTotal = parseNumberBr(valorTotalText);

  const descontoText = .text() || .text() || '0';
  const desconto = parseNumberBr(descontoText);

  // Extração dos Itens/Produtos
  const itens: ItemNFCe[] = [];

  .each((_, element) => {
    const row = ;
    const nomeProduto = row.find('.txtTit').text().trim();

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
        quantidade: parseNumberBr(qtdText) || 1,
        unidade: unText || 'UN',
        valorUnitario: parseNumberBr(vlUnText) || 0.0,
        valorTotal: parseNumberBr(vlTotText) || 0.0,
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
