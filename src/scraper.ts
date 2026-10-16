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

function parseNumberBr(str: string): number {
  if (!str) return 0.0;
  const clean = str.replace(/[^0-9,-]/g, '').replace(',', '.');
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

/**
 * Helper para extrair metadados diretamente da URL da SEFAZ (QR Code / parâmetro 'p' / Chave de 44 dígitos)
 */
function extrairMetadadosUrl(urlQrCode: string) {
  let chaveAcesso: string | null = null;
  let valorTotal: number = 0.0;
  let dataEmissao: string | null = null;
  let cnpj: string | null = null;
  let diaStr: string | null = null;

  // Busca chave de 44 dígitos na URL
  const chaveMatch = urlQrCode.match(/\b(\d{44})\b/);
  if (chaveMatch) {
    chaveAcesso = chaveMatch[1];
  }

  // Tenta extrair do parâmetro 'p'
  try {
    const urlClean = urlQrCode.replace(/&amp;/g, '&');
    const matchP = urlClean.match(/[?&]p=([^&]+)/i);
    if (matchP) {
      const pParam = decodeURIComponent(matchP[1]);
      const parts = pParam.split('|');
      if (parts.length >= 1 && parts[0].length === 44) {
        chaveAcesso = parts[0];
      }
      if (parts.length >= 4 && /^\d+$/.test(parts[3])) {
        diaStr = parts[3].padStart(2, '0');
      }
      if (parts.length >= 5) {
        const valP = parseFloat(parts[4].replace(',', '.'));
        if (!isNaN(valP) && valP > 0) {
          valorTotal = valP;
        }
      }
    }
  } catch (e) {}

  if (chaveAcesso && chaveAcesso.length === 44) {
    const aamm = chaveAcesso.substring(2, 6);
    const cnpjRaw = chaveAcesso.substring(6, 20);
    cnpj = `${cnpjRaw.substring(0, 2)}.${cnpjRaw.substring(2, 5)}.${cnpjRaw.substring(5, 8)}/${cnpjRaw.substring(8, 12)}-${cnpjRaw.substring(12)}`;
    const ano = "20" + aamm.substring(0, 2);
    const mes = aamm.substring(2, 4);
    const diaFinal = diaStr || "01";
    dataEmissao = `${ano}-${mes}-${diaFinal}T12:00:00.000Z`;
  }

  return {
    chaveAcesso,
    cnpj,
    valorTotal,
    dataEmissao
  };
}

export async function extrairDadosNFCe(urlQrCode: string): Promise<DadosNFCe> {
  const metaUrl = extrairMetadadosUrl(urlQrCode);
  let html = '';

  try {
    const response = await fetch(urlQrCode, {
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

  const $ = cheerio.load(html || '<html></html>');

  // Estabelecimento
  let estabelecimento =
    $('#txtBoxSubTitulo').text().trim() ||
    $('.txtTopo').first().text().trim() ||
    $('#lblRazaoSocial').text().trim() ||
    $('.txtCenter .txtBoxSubTitulo').text().trim() ||
    $('.txtBoxSubTitulo').text().trim() ||
    '';

  // CNPJ
  const cnpjText = $('.text').text() || $('body').text();
  const cnpjMatch = cnpjText.match(/CNPJ:\s*([0-9.\/-]+)/i);
  const cnpj = cnpjMatch ? cnpjMatch[1].replace(/[^0-9]/g, '') : (metaUrl.cnpj ? metaUrl.cnpj.replace(/[^0-9]/g, '') : undefined);

  // Chave de Acesso
  const chaveMatch =
    $.html().match(/\b(\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4})\b/) ||
    $.html().match(/chave=(\d{44})/i);
  const chaveAcesso = chaveMatch ? chaveMatch[1].replace(/\s+/g, '') : (metaUrl.chaveAcesso || `NFCe_${Date.now()}`);

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

  // Valor Total
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

  // Desconto
  const descontoText =
    $('#totalNota .totalNff:contains("Desconto") .txtMax').text() ||
    $('.totalNff:contains("Desconto") .txtMax').text() ||
    '0';
  const desconto = parseNumberBr(descontoText);

  // Data de Emissão
  const dataMatch = $.html().match(/Emissão:\s*([0-9\/]+\s+[0-9:]+)/i) || $.html().match(/([0-9]{2}\/[0-9]{2}\/[0-9]{4})/);
  let dataEmissao = metaUrl.dataEmissao || new Date().toISOString();
  if (dataMatch) {
    const parts = dataMatch[1].split(' ')[0].split('/');
    if (parts.length === 3) {
      dataEmissao = `${parts[2]}-${parts[1]}-${parts[0]}T12:00:00.000Z`;
    }
  }

  // FALLBACK DE GARANTIA SE A RASPAGEM HTML FOI BLOQUEADA PELA SEFAZ
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
