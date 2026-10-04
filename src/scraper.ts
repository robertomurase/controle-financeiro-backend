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

function parseNumberBr(valStr: string): number {
  if (!valStr) return 0.0;
  const limpo = valStr.replace(/[^0-9,.-]/g, '').trim();
  if (limpo.includes(',')) {
    const comPonto = limpo.replace(/\./g, '').replace(',', '.');
    return parseFloat(comPonto) || 0.0;
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
      throw new Error();
    }

    html = await response.text();
  }

  const $ = cheerio.load(html);

  const estabelecimento =
    .text().trim() ||
    .first().text().trim() ||
    .text().trim() ||
    'Estabelecimento Não Identificado';

  const cnpjText = .text() || .text();
  const cnpjMatch = cnpjText.match(/CNPJ:\s*([0-9.\/-]+)/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^0-9]/g, '') : undefined;

  const chaveMatch = $.html().match(/(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/) ||
                     $.html().match(/chave=(\d{44})/i);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : ;

  const valorTotalText = .text() || .text() || .text() || '0';
  const valorTotal = parseNumberBr(valorTotalText);

  const descontoText = .text() || '0';
  const desconto = parseNumberBr(descontoText);

  const itens: ItemNFCe[] = [];

  .each((_, element) => {
    const row = ;
    const nomeProduto = row.find('.txtTit').text().trim();

    if (nomeProduto) {
      const codigoText = row.find('.RCod').text().trim();
      const codigoMatch = codigoText.match(/\(Código:\s*(\d+)\)/i);
      const codigo = codigoMatch ? codigoMatch[1] : undefined;

      const qtdRaw = row.find('.RQt').text();
      const unRaw = row.find('.RUN').text();
      const vlUnRaw = row.find('.RvlUnit').text();
      const vlTotRaw = row.find('.valor').text();

      const quantidade = parseNumberBr(qtdRaw) || 1.0;
      const unidade = unRaw.replace(/UN:/i, '').trim() || 'UN';
      const valorUnitario = parseNumberBr(vlUnRaw);
      const valorTotalItem = parseNumberBr(vlTotRaw) || (quantidade * valorUnitario);

      itens.push({
        nomeProduto,
        codigo,
        quantidade,
        unidade,
        valorUnitario,
        valorTotal: valorTotalItem,
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
