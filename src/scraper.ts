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

export function limparNomeProduto(nome: string): string {
  if (!nome) return '';
  return nome
    .replace(/\(?Vl\.?\s*Total:?\s*R?\$?s*[\d.,]+\)?/gi, '')
    .replace(/Vl\s*Total\s*R?\$?s*[\d.,]+/gi, '')
    .replace(/Valor\s*Total:?\s*R?\$?s*[\d.,]+/gi, '')
    .replace(/\(?Vl\.?\s*Unit:?\s*R?\$?s*[\d.,]+\)?/gi, '')
    .replace(/\s*\(?\s*(?:Vl\.?|Valor)\s*Total:?\s*(?:R\$\s*)?[\d.,]+\s*\)?/gi, '')
    .replace(/\s*(?:Vl\.?|Valor)\s*Total.*$/gi, '')
    .replace(/\s*\(?\s*(?:Vl\.?|Valor)\s*Unit:?\s*(?:R\$\s*)?[\d.,]+\s*\)?/gi, '')
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extrairMetadadosUrl(urlQrCode: string) {
  let chaveAcesso: string | null = null;
  let valorTotal: number = 0.0;
  let dataEmissao: string | null = null;
  let cnpj: string | null = null;

  if (!urlQrCode) {
    return { chaveAcesso: null, cnpj: null, valorTotal: 0.0, dataEmissao: null };
  }

  const chaveMatch = urlQrCode.match(/\b(\d{44})\b/);
  if (chaveMatch) {
    chaveAcesso = chaveMatch[1];
  }

  try {
    const urlClean = urlQrCode.replace(/&amp;/g, '&');
    const matchP = urlClean.match(/[?&]p=([^&]+)/i);
    if (matchP) {
      const pParam = decodeURIComponent(matchP[1]);
      const parts = pParam.split(/\||%7C/i);
      
      if (parts.length >= 1 && parts[0].length === 44) {
        chaveAcesso = parts[0];
      }

      // SAT SP (Atacadão, Assaí, Carrefour)
      const satDateMatch = pParam.match(/\b(20\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])([01]\d|2[0-3])([0-5]\d)([0-5]\d)\b/);
      if (satDateMatch) {
        const YYYY = satDateMatch[1];
        const MM = satDateMatch[2];
        const DD = satDateMatch[3];
        dataEmissao = `${YYYY}-${MM}-${DD}T12:00:00.000Z`;

        for (let i = 1; i < parts.length; i++) {
          const pt = parts[i].trim();
          if (/^\d+([.,]\d{2})$/.test(pt)) {
            const v = parseFloat(pt.replace(',', '.'));
            if (!isNaN(v) && v > 0) {
              valorTotal = v;
              break;
            }
          }
        }
      } else {
        // NFC-e SP e Geral
        if (parts.length >= 5) {
          const strVal = parts[4].trim();
          if (/^\d+([.,]\d+)?$/.test(strVal)) {
            const valP = parseFloat(strVal.replace(',', '.'));
            if (!isNaN(valP) && valP > 0) {
              valorTotal = valP;
            }
          }
        }
        if (valorTotal === 0) {
          for (let i = 1; i < parts.length; i++) {
            const pt = parts[i].trim();
            if (pt !== '1' && pt !== '2' && /^\d+([.,]\d{2})$/.test(pt)) {
              const valP = parseFloat(pt.replace(',', '.'));
              if (!isNaN(valP) && valP > 0) {
                valorTotal = valP;
                break;
              }
            }
          }
        }
      }
    }
  } catch (e) {}

  if (chaveAcesso && chaveAcesso.length === 44) {
    const aamm = chaveAcesso.substring(2, 6);
    const cnpjRaw = chaveAcesso.substring(6, 20);
    cnpj = `${cnpjRaw.substring(0, 2)}.${cnpjRaw.substring(2, 5)}.${cnpjRaw.substring(5, 8)}/${cnpjRaw.substring(8, 12)}-${cnpjRaw.substring(12)}`;
    
    if (!dataEmissao) {
      const ano = "20" + aamm.substring(0, 2);
      const mes = aamm.substring(2, 4);
      dataEmissao = `${ano}-${mes}-01T12:00:00.000Z`;
    }
  }

  return {
    chaveAcesso,
    cnpj,
    valorTotal,
    dataEmissao
  };
}

export function extrairDadosNFCeFromHtml(html: string, urlQrCode: string = ''): DadosNFCe {
  const metaUrl = extrairMetadadosUrl(urlQrCode);
  const $ = cheerio.load(html || '<html></html>');

  let estabelecimento =
    $('#txtBoxSubTitulo').text().trim() ||
    $('.txtTopo').first().text().trim() ||
    $('#lblRazaoSocial').text().trim() ||
    $('.txtCenter .txtBoxSubTitulo').text().trim() ||
    $('.txtBoxSubTitulo').text().trim() ||
    '';

  const cnpjText = $('.text').text() || $('body').text();
  const cnpjMatch = cnpjText.match(/CNPJ:\s*([0-9.\/-]+)/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^0-9]/g, '') : (metaUrl.cnpj ? metaUrl.cnpj.replace(/[^0-9]/g, '') : undefined);

  const chaveMatch =
    $.html().match(/\b(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})\b/) ||
    $.html().match(/chave=(\d{44})/i);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : (metaUrl.chaveAcesso || `NFCe_${Date.now()}`);

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
  const desconto = parseNumberBr(descontoText);

  let dataEmissao = metaUrl.dataEmissao || new Date().toISOString();
  const fullHtmlText = $.html();
  const dataMatch =
    fullHtmlText.match(/Emissão:?\s*(?:<\/?\w+[^>]*>\s*)*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/i) ||
    fullHtmlText.match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4})/);

  if (dataMatch && !metaUrl.dataEmissao?.includes('T12:00:00')) {
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
      estabelecimento = metaUrl.cnpj ? `Mercado / CNPJ ${metaUrl.cnpj}` : 'Mercado / SEFAZ SP';
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

  if (!estabelecimento) {
    estabelecimento = 'Estabelecimento Não Identificado';
  }

  return {
    chaveAcesso,
    estabelecimento,
    cnpj,
    dataEmissao,
    valorTotal,
    desconto,
    itens,
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
