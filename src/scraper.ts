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
 * Converte strings numéricas em formato BR (ex: 1.234,56, 12,99, 2,0000) para Float JS
 */
function parseNumberBr(str: string): number {
  if (!str) return 0.0;
  // Remove R$, espaços e letras mantendo números, vírgulas e pontos
  const limpo = str.replace(/[^0-9.,]/g, '').trim();
  if (!limpo) return 0.0;

  // Se tem vírgula, substitui ponto de milhar e troca vírgula por ponto decimal
  if (limpo.includes(',')) {
    const semPontoMilhar = limpo.replace(/\./g, '');
    const comPontoDecimal = semPontoMilhar.replace(',', '.');
    return parseFloat(comPontoDecimal) || 0.0;
  }
  return parseFloat(limpo) || 0.0;
}

/**
 * Realiza a extração dos dados do QR Code NFC-e da SEFAZ
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
      throw new Error(`Falha ao acessar a URL da SEFAZ: HTTP ${response.status}`);
    }

    html = await response.text();
  }

  const $ = cheerio.load(html);

  // Estabelecimento / Razão Social
  const estabelecimento =
    .text().trim() ||
    .first().text().trim() ||
    .text().trim() ||
    .text().trim() ||
    'Estabelecimento Não Identificado';

  // CNPJ
  const cnpjText = .text() || .text();
  const cnpjMatch = cnpjText.match(/CNPJ:\s*([0-9.\/-]+)/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^0-9]/g, '') : undefined;

  // Chave de Acesso (44 dígitos)
  const chaveMatch =
    $.html().match(/(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})/) ||
    $.html().match(/chave=(\d{44})/i);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : `NFCe_${Date.now()}`;

  // Valor Total e Desconto
  const valorTotalText =
    .text() ||
    .text() ||
    .text() ||
    '0';
  const valorTotal = parseNumberBr(valorTotalText);

  const descontoText =
    .text() ||
    .text() ||
    '0';
  const desconto = parseNumberBr(descontoText);

  // Itens da Nota
  const itens: ItemNFCe[] = [];

  .each((_, element) => {
    const row = ;
    const nomeProduto = row.find('.txtTit').text().trim();

    if (nomeProduto) {
      const codigoText = row.find('.RCod').text().trim();
      const codigoMatch = codigoText.match(/\(Código:\s*(\d+)\)/i);
      const codigo = codigoMatch ? codigoMatch[1] : undefined;

      const qtdText = row.find('.RQt').text().trim();
      const unText = row.find('.RUN').text().replace('UN:', '').trim();
      const vlUnText = row.find('.RvlUnit').text().trim();
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
