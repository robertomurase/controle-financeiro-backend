import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FinanceService, Transacao, EstabelecimentoMapeado, ProdutoMapeado } from './services/finance.service';

declare var Html5Qrcode: any;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit, OnDestroy {
  sanitizarUrlQrCode(url: string): string {
    if (!url) return '';
    let clean = url.trim().replace(/^["']|["']$/g, '').replace(/&amp;/g, '&');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = 'https://' + clean;
    }
    return clean.replace(/\|/g, '%7C');
  }

  // --- PWA INSTALLATION ---
  deferredPrompt: any = null;
  exibirBannerPwa: boolean = false;
  modalAjudaPwaAberto: boolean = false;

  instalarPwa(): void {
    if (this.deferredPrompt) {
      this.deferredPrompt.prompt();
      this.deferredPrompt.userChoice.then((choiceResult: any) => {
        if (choiceResult && choiceResult.outcome === 'accepted') {
          console.log('Usuário aceitou a instalação do PWA');
        }
        this.deferredPrompt = null;
        this.exibirBannerPwa = false;
      });
    } else {
      this.modalAjudaPwaAberto = true;
    }
  }

  fecharBannerPwa(): void {
    this.exibirBannerPwa = false;
  }

  fecharModalAjudaPwa(): void {
    this.modalAjudaPwaAberto = false;
  }

  
  // Modal de Detalhes da NFC-e / Saída
  modalDetalhesNfceAberto: boolean = false;
  carregandoDetalhesNfce: boolean = false;
  detalhesNfceSelecionada: any = null;
activeTab: 'dashboard' | 'transacoes' | 'nfce' | 'carrinho' | 'entradas' | 'saidas' | 'produtos' | 'estabelecimentos' = 'dashboard';
  menuAberto: boolean = false;
  settingsMenuAberto: boolean = false;
  modoClaro: boolean = false;
  tamanhoFonte: number = 16;

  transacoes: Transacao[] = [];
  produtos: any[] = [];
  estabelecimentosMapeados: EstabelecimentoMapeado[] = [];
  dadosUltimaNota: any = null;

  // Tela Mapeamento de Produtos (De-Para)
  produtosMapeados: ProdutoMapeado[] = [];
  novoProdOriginal: string = '';
  novoProdSimplificado: string = '';
  modalEdicaoProdMapeadoAberto: boolean = false;
  editProdId: number | null = null;
  editProdOriginal: string = '';
  editProdSimplificado: string = '';

  // Tela Estabelecimentos (De-Para)
  novaRazaoSocial: string = '';
  novoNomeSimplificado: string = '';
  modalEdicaoEstAberto: boolean = false;
  editEstId: number | null = null;
  editRazaoSocial: string = '';
  editNomeSimplificado: string = '';

  // Filtros Tela Entradas
  buscaEntrada: string = '';
  filtroAnoEntrada: string = String(new Date().getFullYear());
  filtroMesEntrada: string = String(new Date().getMonth() + 1).padStart(2, '0');

  // Filtros Tela Saídas
  buscaSaida: string = '';
  filtroAnoSaida: string = String(new Date().getFullYear());
  filtroMesSaida: string = String(new Date().getMonth() + 1).padStart(2, '0');
  filtroEstabelecimentoSaida: string = '';

  // Busca e Filtro por Estabelecimento na Lista de Produtos
  buscaProduto: string = '';
  filtroEstabelecimento: string = '';

  // Modal de Edição de Transação
  modalEdicaoAberto: boolean = false;
  transacaoEditando: Transacao | null = null;
  editDescricao: string = '';
  editValor: number | null = null;
  editTipo: 'receita' | 'despesa' = 'despesa';
  editCategoria: string = 'Mercado';
  editData: string = new Date().toISOString().split('T')[0];
  editEstabelecimento: string = '';

  // Modal de Evolução de Preços
  modalPrecoAberto: boolean = false;
  produtoSelecionado: any = null;
  historicoPrecosProduto: any[] = [];
  precoMenor: number = 0;
  precoMaior: number = 0;
  precoAtual: number = 0;
  variacaoPercentual: number = 0;
  pontosGrafico: any[] = [];
  svgLinePoints: string = '';
  svgAreaPoints: string = '';

  // Form Transação Manual + Pré-visualização
  novaDescricao: string = '';
  novoValor: number | null = null;
  novaQuantidade: number = 1;
  novoEstabelecimento: string = '';
  novaCategoria: string = 'Mercado';
  novaConta: string = 'Conta Corrente';
  novoTipo: 'receita' | 'despesa' = 'despesa';
  novaData: string = new Date().toISOString().split('T')[0];

  // Leitor QR Code
  urlNfce: string = '';
  htmlNfceManual: string = '';
  carregandoNfce: boolean = false;
  mensagemNfce: string = '';
  statusNfceSucesso: boolean = true;
  scannerModo: 'camera' | 'arquivo' | 'manual' | 'html' = 'camera';
  scannerAtivo: boolean = false;
  html5QrCode: any = null;
  dadosNotaPreview: any = null;

  // Dashboard Controls
  anoGrafico: string = String(new Date().getFullYear());

  constructor(private financeService: FinanceService) {}

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeinstallprompt', (e: any) => {
        e.preventDefault();
        this.deferredPrompt = e;
        this.exibirBannerPwa = true;
      });
    }

    this.carregarEstabelecimentos();
    this.carregarMapeamentosProdutos();
    this.carregarTransacoes();
    this.carregarProdutos();

    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('THEME_MODE');
      if (savedTheme === 'light') {
        this.modoClaro = true;
        document.body.classList.add('light-theme');
      }

      const savedFontSize = localStorage.getItem('FONT_SIZE');
      if (savedFontSize) {
        this.tamanhoFonte = Number(savedFontSize);
        document.documentElement.style.fontSize = `${this.tamanhoFonte}px`;
      }
    }
  }

  ngOnDestroy(): void {
    this.pararScanner();
    this.pararScannerBarcode();
  }

  limparNomeProduto(nome: string): string {
    if (!nome) return '';
    return nome
      .replace(/\(?Vl\.?\s*Total:?\s*R?\$?s*[\d.,]+\)?/gi, '')
      .replace(/Vl\s*Total\s*R?\$?s*[\d.,]+/gi, '')
      .replace(/Valor\s*Total:?\s*R?\$?s*[\d.,]+/gi, '')
      .trim();
  }

  formatarDataBr(dataStr: string | null | undefined): string {
    if (!dataStr) return '-';
    const limpa = String(dataStr).split('T')[0].trim();
    const partes = limpa.split('-');
    if (partes.length === 3) {
      return partes[2] + '/' + partes[1] + '/' + partes[0];
    }
    return limpa || '-';
  }

  formatarMoeda(val: number | null | undefined): string {
    const num = Number(val) || 0;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  obterNomeEstabelecimentoSimplificado(nomeOriginal: string): string {
    if (!nomeOriginal) return 'Cadastro Manual';
    const orig = nomeOriginal.trim().toLowerCase();
    if (!orig) return 'Cadastro Manual';

    const exact = (this.estabelecimentosMapeados || []).find(e =>
      e.razao_social && e.razao_social.trim().toLowerCase() === orig
    );
    if (exact && exact.nome_simplificado) return exact.nome_simplificado;

    const partial = (this.estabelecimentosMapeados || []).find(e =>
      e.razao_social && orig.includes(e.razao_social.trim().toLowerCase())
    );
    if (partial && partial.nome_simplificado) return partial.nome_simplificado;

    return nomeOriginal.trim();
  }

  toggleMenu(): void {
    this.menuAberto = !this.menuAberto;
  }

  fecharMenu(): void {
    this.menuAberto = false;
  }

  toggleSettingsMenu(): void {
    this.settingsMenuAberto = !this.settingsMenuAberto;
  }

  fecharSettingsMenu(): void {
    this.settingsMenuAberto = false;
  }

  alternarTemaModal(): void {
    this.modoClaro = !this.modoClaro;
    if (this.modoClaro) {
      document.body.classList.add('light-theme');
      localStorage.setItem('THEME_MODE', 'light');
    } else {
      document.body.classList.remove('light-theme');
      localStorage.setItem('THEME_MODE', 'dark');
    }
  }

  aumentarFonte(): void {
    if (this.tamanhoFonte < 22) {
      this.tamanhoFonte += 1;
      document.documentElement.style.fontSize = `${this.tamanhoFonte}px`;
      localStorage.setItem('FONT_SIZE', String(this.tamanhoFonte));
    }
  }

  diminuirFonte(): void {
    if (this.tamanhoFonte > 12) {
      this.tamanhoFonte -= 1;
      document.documentElement.style.fontSize = `${this.tamanhoFonte}px`;
      localStorage.setItem('FONT_SIZE', String(this.tamanhoFonte));
    }
  }

  setTab(tab: 'dashboard' | 'transacoes' | 'nfce' | 'carrinho' | 'entradas' | 'saidas' | 'produtos' | 'estabelecimentos'): void {
    this.pararScanner();
    this.pararScannerBarcode();
    this.activeTab = tab;
    this.fecharMenu();
    this.fecharSettingsMenu();
    if (tab === 'nfce' && this.scannerModo === 'camera') {
      setTimeout(() => this.iniciarScanner(), 200);
    }
    if (tab === 'carrinho' && this.modoAddCarrinho === 'barcode') {
      setTimeout(() => this.iniciarScannerBarcode(), 200);
    }
  }

  // --- CRUD ESTABELECIMENTOS (DE-PARA) ---
  
  carregarMapeamentosProdutos(): void {
    this.financeService.getMapeamentosProdutos().subscribe({
      next: (dados) => {
        this.produtosMapeados = dados || [];
      },
      error: () => {
        this.produtosMapeados = [];
      }
    });
  }

  obterNomeProdutoMapeado(nomeOriginal: string): string {
    if (!nomeOriginal) return '';
    const limpo = this.limparNomeProduto(nomeOriginal).trim();
    if (!limpo) return '';

    const origLower = limpo.toLowerCase();
    const exact = (this.produtosMapeados || []).find(p =>
      p.nome_original && p.nome_original.trim().toLowerCase() === origLower
    );
    if (exact && exact.nome_simplificado) return exact.nome_simplificado.trim();

    const partial = (this.produtosMapeados || []).find(p =>
      p.nome_original && origLower.includes(p.nome_original.trim().toLowerCase())
    );
    if (partial && partial.nome_simplificado) return partial.nome_simplificado.trim();

    return limpo;
  }

  salvarMapeamentoProduto(): void {
    if (!this.novoProdOriginal || !this.novoProdSimplificado) {
      alert('Preencha o Nome do Produto na SEFAZ e o Nome Simplificado!');
      return;
    }

    this.financeService.addMapeamentoProduto({
      nomeOriginal: this.novoProdOriginal.trim(),
      nomeSimplificado: this.novoProdSimplificado.trim()
    }).subscribe({
      next: () => {
        this.novoProdOriginal = '';
        this.novoProdSimplificado = '';
        this.carregarMapeamentosProdutos();
        this.carregarProdutos();
        alert('✅ Mapeamento de produto salvo com sucesso!');
      },
      error: (err) => console.error('Erro ao salvar mapeamento de produto:', err)
    });
  }

  abrirModalEdicaoProdMapeado(p: ProdutoMapeado): void {
    if (!p) return;
    this.editProdId = p.id || null;
    this.editProdOriginal = p.nome_original || '';
    this.editProdSimplificado = p.nome_simplificado || '';
    this.modalEdicaoProdMapeadoAberto = true;
  }

  fecharModalEdicaoProdMapeado(): void {
    this.modalEdicaoProdMapeadoAberto = false;
    this.editProdId = null;
    this.editProdOriginal = '';
    this.editProdSimplificado = '';
  }

  salvarEdicaoProdMapeado(): void {
    if (!this.editProdId || !this.editProdOriginal || !this.editProdSimplificado) {
      alert('Preencha todos os campos!');
      return;
    }

    this.financeService.updateMapeamentoProduto(this.editProdId, {
      nomeOriginal: this.editProdOriginal.trim(),
      nomeSimplificado: this.editProdSimplificado.trim()
    }).subscribe({
      next: () => {
        this.fecharModalEdicaoProdMapeado();
        this.carregarMapeamentosProdutos();
        this.carregarProdutos();
        alert('✅ Mapeamento de produto atualizado!');
      },
      error: (err) => console.error('Erro ao editar mapeamento de produto:', err)
    });
  }

  excluirMapeamentoProduto(p: ProdutoMapeado): void {
    if (!p || !p.id) return;
    if (confirm(`Excluir o mapeamento de "${p.nome_simplificado}"?`)) {
      this.financeService.deleteMapeamentoProduto(p.id).subscribe({
        next: () => {
          this.carregarMapeamentosProdutos();
          this.carregarProdutos();
        },
        error: (err) => console.error('Erro ao excluir mapeamento de produto:', err)
      });
    }
  }

carregarEstabelecimentos(): void {
    this.financeService.getEstabelecimentos().subscribe({
      next: (dados) => {
        this.estabelecimentosMapeados = dados || [];
      },
      error: () => {
        this.estabelecimentosMapeados = [];
      }
    });
  }

  salvarEstabelecimento(): void {
    if (!this.novaRazaoSocial || !this.novoNomeSimplificado) {
      alert('Preencha a Razão Social/SEFAZ e o Nome Simplificado!');
      return;
    }

    this.financeService.addEstabelecimento({
      razaoSocial: this.novaRazaoSocial.trim(),
      nomeSimplificado: this.novoNomeSimplificado.trim()
    }).subscribe({
      next: () => {
        this.novaRazaoSocial = '';
        this.novoNomeSimplificado = '';
        this.carregarEstabelecimentos();
    this.carregarMapeamentosProdutos();
        this.carregarTransacoes();
        this.carregarProdutos();
        alert('✅ Mapeamento de estabelecimento salvo!');
      },
      error: (err) => console.error('Erro ao salvar estabelecimento:', err)
    });
  }

  abrirModalEdicaoEst(e: EstabelecimentoMapeado): void {
    if (!e) return;
    this.editEstId = e.id || null;
    this.editRazaoSocial = e.razao_social || '';
    this.editNomeSimplificado = e.nome_simplificado || '';
    this.modalEdicaoEstAberto = true;
  }

  fecharModalEst(): void {
    this.modalEdicaoEstAberto = false;
    this.editEstId = null;
    this.editRazaoSocial = '';
    this.editNomeSimplificado = '';
  }

  salvarEdicaoEst(): void {
    if (!this.editEstId || !this.editRazaoSocial || !this.editNomeSimplificado) {
      alert('Preencha todos os campos!');
      return;
    }

    this.financeService.updateEstabelecimento(this.editEstId, {
      razaoSocial: this.editRazaoSocial.trim(),
      nomeSimplificado: this.editNomeSimplificado.trim()
    }).subscribe({
      next: () => {
        this.fecharModalEst();
        this.carregarEstabelecimentos();
    this.carregarMapeamentosProdutos();
        this.carregarTransacoes();
        this.carregarProdutos();
        alert('✅ Mapeamento atualizado com sucesso!');
      },
      error: (err) => console.error('Erro ao editar estabelecimento:', err)
    });
  }

  excluirEstabelecimento(e: EstabelecimentoMapeado): void {
    if (!e || !e.id) return;
    if (confirm(`Excluir o mapeamento de "${e.nome_simplificado}"?`)) {
      this.financeService.deleteEstabelecimento(e.id).subscribe({
        next: () => {
          this.carregarEstabelecimentos();
    this.carregarMapeamentosProdutos();
          this.carregarTransacoes();
          this.carregarProdutos();
        },
        error: (err) => console.error('Erro ao excluir:', err)
      });
    }
  }

  // --- GETTERS E FILTROS ---
  get anosDisponiveis(): string[] {
    const setAnos = new Set<string>();
    setAnos.add(String(new Date().getFullYear()));
    (this.transacoes || []).forEach(t => {
      if (t.data) {
        const ano = t.data.split('-')[0];
        if (ano && ano.length === 4) setAnos.add(ano);
      }
    });
    return Array.from(setAnos).sort().reverse();
  }

  get mesesOpcoes(): { valor: string, nome: string }[] {
    return [
      { valor: '01', nome: '01 - Janeiro' },
      { valor: '02', nome: '02 - Fevereiro' },
      { valor: '03', nome: '03 - Março' },
      { valor: '04', nome: '04 - Abril' },
      { valor: '05', nome: '05 - Maio' },
      { valor: '06', nome: '06 - Junho' },
      { valor: '07', nome: '07 - Julho' },
      { valor: '08', nome: '08 - Agosto' },
      { valor: '09', nome: '09 - Setembro' },
      { valor: '10', nome: '10 - Outubro' },
      { valor: '11', nome: '11 - Novembro' },
      { valor: '12', nome: '12 - Dezembro' }
    ];
  }

  get entradasFiltradas(): Transacao[] {
    let lista = (this.transacoes || []).filter(t => t.tipo === 'receita');

    if (this.filtroAnoEntrada) {
      lista = lista.filter(t => t.data && t.data.startsWith(this.filtroAnoEntrada));
    }

    if (this.filtroMesEntrada) {
      const prefixo = `${this.filtroAnoEntrada || new Date().getFullYear()}-${this.filtroMesEntrada}`;
      lista = lista.filter(t => t.data && t.data.startsWith(prefixo));
    }

    if (this.buscaEntrada && this.buscaEntrada.trim()) {
      const termo = this.buscaEntrada.toLowerCase().trim();
      lista = lista.filter(t =>
        (t.descricao && t.descricao.toLowerCase().includes(termo)) ||
        (t.categoria && t.categoria.toLowerCase().includes(termo)) ||
        (t.conta && t.conta.toLowerCase().includes(termo))
      );
    }
    return lista;
  }

  get totalEntradas(): number {
    return this.entradasFiltradas.reduce((acc, t) => acc + (Number(t.valor) || 0), 0);
  }

  get saidasFiltradas(): Transacao[] {
    let lista = (this.transacoes || []).filter(t => t.tipo === 'despesa');

    if (this.filtroAnoSaida) {
      lista = lista.filter(t => t.data && t.data.startsWith(this.filtroAnoSaida));
    }

    if (this.filtroMesSaida) {
      const prefixo = `${this.filtroAnoSaida || new Date().getFullYear()}-${this.filtroMesSaida}`;
      lista = lista.filter(t => t.data && t.data.startsWith(prefixo));
    }

    if (this.filtroEstabelecimentoSaida && this.filtroEstabelecimentoSaida.trim()) {
      const estAlvo = this.filtroEstabelecimentoSaida.trim();
      lista = lista.filter(t =>
        (this.obterNomeEstabelecimentoSimplificado(t.estabelecimento || t.descricao) || 'Cadastro Manual').trim() === estAlvo
      );
    }

    if (this.buscaSaida && this.buscaSaida.trim()) {
      const termo = this.buscaSaida.toLowerCase().trim();
      lista = lista.filter(t =>
        (t.descricao && t.descricao.toLowerCase().includes(termo)) ||
        (t.estabelecimento && t.estabelecimento.toLowerCase().includes(termo)) ||
        (t.categoria && t.categoria.toLowerCase().includes(termo))
      );
    }
    return lista;
  }

  get totalSaidas(): number {
    return this.saidasFiltradas.reduce((acc, t) => acc + (Number(t.valor) || 0), 0);
  }

  get estabelecimentosSaidasUnicos(): string[] {
    const setEst = new Set<string>();
    (this.transacoes || []).filter(t => t.tipo === 'despesa').forEach(t => {
      const est = (this.obterNomeEstabelecimentoSimplificado(t.estabelecimento || t.descricao) || 'Cadastro Manual').trim();
      if (est) setEst.add(est);
    });
    return Array.from(setEst).sort();
  }

  get produtosFiltrados(): any[] {
    if (!this.produtos) return [];

    let lista = [...this.produtos];

    if (this.filtroEstabelecimento && this.filtroEstabelecimento.trim()) {
      const estAlvo = this.filtroEstabelecimento.trim();
      lista = lista.filter(p =>
        (this.obterNomeEstabelecimentoSimplificado(p.estabelecimento) || 'Cadastro Manual').trim() === estAlvo
      );
    }

    if (this.buscaProduto && this.buscaProduto.trim()) {
      const termo = this.buscaProduto.toLowerCase().trim();
      lista = lista.filter(p => {
        const nomeLimpo = this.limparNomeProduto(p.nome_produto || '').toLowerCase();
        const estSimplificado = this.obterNomeEstabelecimentoSimplificado(p.estabelecimento || '').toLowerCase();
        return nomeLimpo.includes(termo) || estSimplificado.includes(termo);
      });
    }

    const mapaConsolidado = new Map<string, any>();
    lista.forEach(p => {
      const nomeChave = this.limparNomeProduto(p.nome_produto || '').trim().toLowerCase();
      if (!nomeChave) return;

      const existente = mapaConsolidado.get(nomeChave);
      const estNome = this.obterNomeEstabelecimentoSimplificado(p.estabelecimento);

      if (!existente) {
        mapaConsolidado.set(nomeChave, {
          ...p,
          nome_produto: this.limparNomeProduto(p.nome_produto),
          estabelecimento: estNome
        });
      } else {
        const dataEx = existente.data_emissao || existente.data_cadastro || existente.data || '';
        const dataAtual = p.data_emissao || p.data_cadastro || p.data || '';
        if (dataAtual >= dataEx) {
          mapaConsolidado.set(nomeChave, {
            ...p,
            nome_produto: this.limparNomeProduto(p.nome_produto),
            estabelecimento: estNome
          });
        }
      }
    });

    const listaUnica = Array.from(mapaConsolidado.values());

    return listaUnica.sort((a, b) => {
      const nomeA = (a.nome_produto || '').toLowerCase();
      const nomeB = (b.nome_produto || '').toLowerCase();
      return nomeA.localeCompare(nomeB);
    });
  }

  get estabelecimentosUnicos(): string[] {
    if (!this.produtos) return [];
    const setEst = new Set<string>();
    this.produtos.forEach(p => {
      const est = (this.obterNomeEstabelecimentoSimplificado(p.estabelecimento) || 'Cadastro Manual').trim();
      if (est) setEst.add(est);
    });
    return Array.from(setEst).sort();
  }

  // --- CARREGAMENTO DE DADOS ---
  carregarTransacoes(): void {
    this.financeService.getTransacoes().subscribe({
      next: (dados) => {
        this.transacoes = (dados || []).map(t => ({
          ...t,
          isNfce: !!(t.isNfce || (t as any).hash_transacao?.startsWith('nfce_') || (t as any).hash_transacao?.startsWith('carrinho_')),
          descricao: this.limparNomeProduto(t.descricao),
          estabelecimento: this.obterNomeEstabelecimentoSimplificado(t.estabelecimento || t.descricao)
        }));
      },
      error: () => {
        this.transacoes = [];
      }
    });
  }

  carregarProdutos(): void {
    this.financeService.getProdutos().subscribe({
      next: (dados) => {
        this.produtos = (dados || []).map(p => ({
          ...p,
          nome_produto: this.obterNomeProdutoMapeado(p.nome_produto),
          estabelecimento: this.obterNomeEstabelecimentoSimplificado(p.estabelecimento)
        }));
      },
      error: () => {
        this.produtos = [];
      }
    });
  }

  
  // --- MODAL DE DETALHES DA SAÍDA / NFC-E ---
  abrirModalDetalhesNfce(t: Transacao): void {
    if (!t || !t.id) return;
    this.modalDetalhesNfceAberto = true;
    this.carregandoDetalhesNfce = true;
    this.detalhesNfceSelecionada = null;

    this.financeService.getDetalhesTransacao(t.id).subscribe({
      next: (dados) => {
        this.carregandoDetalhesNfce = false;
        if (dados) {
          dados.estabelecimento = this.obterNomeEstabelecimentoSimplificado(dados.estabelecimento || t.estabelecimento || t.descricao);
        }
        this.detalhesNfceSelecionada = dados;
      },
      error: (err) => {
        this.carregandoDetalhesNfce = false;
        console.error('Erro ao carregar detalhes:', err);
        this.detalhesNfceSelecionada = {
          transacaoId: t.id,
          isNfce: !!t.isNfce,
          estabelecimento: this.obterNomeEstabelecimentoSimplificado(t.estabelecimento || t.descricao),
          dataEmissao: t.data,
          subtotal: Number(t.valor) || 0,
          desconto: 0,
          valorTotal: Number(t.valor) || 0,
          itens: [
            {
              nomeProduto: this.limparNomeProduto(t.descricao),
              quantidade: 1,
              unidade: 'UN',
              valorUnitario: Number(t.valor) || 0,
              valorTotal: Number(t.valor) || 0
            }
          ]
        };
      }
    });
  }

  fecharModalDetalhesNfce(): void {
    this.modalDetalhesNfceAberto = false;
    this.detalhesNfceSelecionada = null;
  }

  // --- MODAL DE EDIÇÃO DE TRANSAÇÃO ---
  abrirModalEdicao(t: Transacao): void {
    if (!t) return;
    this.transacaoEditando = t;
    this.editDescricao = t.descricao || '';
    this.editValor = t.valor || 0;
    this.editTipo = t.tipo || 'despesa';
    this.editCategoria = t.categoria || 'Mercado';
    this.editData = t.data || new Date().toISOString().split('T')[0];
    this.editEstabelecimento = t.estabelecimento || '';
    this.modalEdicaoAberto = true;
  }

  fecharModalEdicao(): void {
    this.modalEdicaoAberto = false;
    this.transacaoEditando = null;
  }

  salvarEdicaoTransacao(): void {
    if (!this.transacaoEditando || !this.transacaoEditando.id) return;

    const payload = {
      descricao: this.editDescricao,
      valor: Number(this.editValor) || 0,
      tipo: this.editTipo,
      categoria: this.editCategoria,
      data: this.editData,
      estabelecimento: this.editEstabelecimento ? this.obterNomeEstabelecimentoSimplificado(this.editEstabelecimento) : 'Cadastro Manual'
    };

    this.financeService.updateTransacao(this.transacaoEditando.id, payload).subscribe({
      next: () => {
        this.fecharModalEdicao();
        this.carregarTransacoes();
        this.carregarProdutos();
        alert('✅ Transação atualizada com sucesso!');
      },
      error: (err) => console.error('Erro ao atualizar transação:', err)
    });
  }

  excluirTransacao(t: Transacao): void {
    if (!t || !t.id) return;
    if (confirm(`Tem certeza que deseja excluir "${t.descricao}"?`)) {
      this.financeService.deleteTransacao(t.id).subscribe({
        next: () => {
          this.carregarTransacoes();
          this.carregarProdutos();
        },
        error: (err) => console.error('Erro ao excluir transação:', err)
      });
    }
  }

  excluirItemProduto(p: any): void {
    if (!p) return;
    const nomeItem = this.limparNomeProduto(p.nome_produto) || 'este produto';
    if (confirm(`Tem certeza que deseja excluir "${nomeItem}" da lista?`)) {
      this.financeService.deleteProdutoItem(p.id, p.origem, nomeItem).subscribe({
        next: () => {
          this.carregarProdutos();
          this.carregarTransacoes();
        },
        error: () => {
          if (nomeItem) {
            this.financeService.deleteProdutoPorNome(nomeItem).subscribe({
              next: () => {
                this.carregarProdutos();
                this.carregarTransacoes();
              }
            });
          }
        }
      });
    }
  }

  // --- MODAL DE EVOLUÇÃO DE PREÇO ---
  abrirModalEvolucaoPreco(p: any): void {
    if (!p || !p.nome_produto) return;
    this.produtoSelecionado = p;

    const nomeAlvo = this.limparNomeProduto(p.nome_produto).toLowerCase().trim();
    const historico = (this.produtos || []).filter(item => {
      const itemNome = this.limparNomeProduto(item.nome_produto || '').toLowerCase().trim();
      return itemNome === nomeAlvo;
    }).map(h => ({
      ...h,
      nome_produto: this.limparNomeProduto(h.nome_produto),
      estabelecimento: this.obterNomeEstabelecimentoSimplificado(h.estabelecimento)
    }));

    historico.sort((a, b) => {
      const dataA = a.data_emissao || a.data_cadastro || a.data || '';
      const dataB = b.data_emissao || b.data_cadastro || b.data || '';
      return dataA.localeCompare(dataB);
    });

    this.historicoPrecosProduto = historico;

    const valores = historico.map(h => Number(h.valor_unitario || h.preco_medio || 0)).filter(v => v > 0);
    if (valores.length > 0) {
      this.precoMenor = Math.min(...valores);
      this.precoMaior = Math.max(...valores);
      this.precoAtual = valores[valores.length - 1];

      if (valores.length > 1) {
        const primeiro = valores[0];
        this.variacaoPercentual = ((this.precoAtual - primeiro) / primeiro) * 100;
      } else {
        this.variacaoPercentual = 0;
      }
    } else {
      this.precoMenor = Number(p.valor_unitario || p.preco_medio || 0);
      this.precoMaior = this.precoMenor;
      this.precoAtual = this.precoMenor;
      this.variacaoPercentual = 0;
    }

    this.gerarPontosGraficoSVG(historico);
    this.modalPrecoAberto = true;
  }

  fecharModalPreco(): void {
    this.modalPrecoAberto = false;
    this.produtoSelecionado = null;
  }

  gerarPontosGraficoSVG(historico: any[]): void {
    if (!historico || historico.length === 0) {
      this.pontosGrafico = [];
      this.svgLinePoints = '';
      this.svgAreaPoints = '';
      return;
    }

    const svgWidth = 500;
    const svgHeight = 200;
    const marginX = 50;
    const marginYTop = 30;
    const marginYBottom = 150;
    const availableWidth = svgWidth - 2 * marginX;
    const availableHeight = marginYBottom - marginYTop;

    const valores = historico.map(h => Number(h.valor_unitario || h.preco_medio || 0));
    const minVal = Math.min(...valores);
    const maxVal = Math.max(...valores);
    const valRange = maxVal - minVal === 0 ? 1 : maxVal - minVal;

    const n = historico.length;

    this.pontosGrafico = historico.map((item, index) => {
      const val = Number(item.valor_unitario || item.preco_medio || 0);
      const x = n === 1 ? svgWidth / 2 : marginX + (index / (n - 1)) * availableWidth;

      let y = marginYBottom - ((val - minVal) / valRange) * availableHeight;
      if (maxVal === minVal) {
        y = 90;
      }

      const rawData = item.data_emissao || item.data_cadastro || item.data || '';
      const dataFormatted = rawData ? rawData.split('-').slice(1).join('/') : `P${index + 1}`;

      return {
        x,
        y,
        valor: val,
        dataFormatted
      };
    });

    const ptsStr = this.pontosGrafico.map(pt => `${pt.x},${pt.y}`).join(' ');
    this.svgLinePoints = ptsStr;

    if (this.pontosGrafico.length > 0) {
      const firstX = this.pontosGrafico[0].x;
      const lastX = this.pontosGrafico[this.pontosGrafico.length - 1].x;
      this.svgAreaPoints = `${firstX},150 ${ptsStr} ${lastX},150`;
    } else {
      this.svgAreaPoints = '';
    }
  }

  // --- TRANSAÇÕES MANUAIS ---
  salvarTransacao(): void {
    if (!this.novaDescricao || !this.novoValor) {
      alert('Preencha a descrição e o valor!');
      return;
    }

    const isSalario = this.novaCategoria === 'Salário';
    const isMercado = this.novaCategoria === 'Mercado';
    const qtd = isMercado ? (this.novaQuantidade && this.novaQuantidade > 0 ? Number(this.novaQuantidade) : 1) : 1;
    const valUnit = Number(this.novoValor) || 0;
    const valTotal = isMercado ? valUnit * qtd : valUnit;

    const nova: any = {
      descricao: this.limparNomeProduto(this.novaDescricao),
      estabelecimento: isSalario ? 'Cadastro Manual' : (this.novoEstabelecimento && this.novoEstabelecimento.trim() ? this.obterNomeEstabelecimentoSimplificado(this.novoEstabelecimento) : 'Cadastro Manual'),
      quantidade: qtd,
      valorUnitario: valUnit,
      valor: valTotal,
      categoria: this.novaCategoria,
      conta: this.novaConta || 'Conta Corrente',
      tipo: isSalario ? 'receita' : this.novoTipo,
      data: this.novaData
    };

    this.financeService.addTransacao(nova).subscribe({
      next: () => {
        this.carregarTransacoes();
        this.carregarProdutos();
        this.novaDescricao = '';
        this.novoValor = null;
        this.novaQuantidade = 1;
        this.novoEstabelecimento = '';
        this.activeTab = 'dashboard';
        alert('✅ Transação salva com sucesso!');
      },
      error: (err) => {
        console.error('Erro ao salvar:', err);
        alert('⚠️ Ocorreu um erro ao salvar a transação.');
      }
    });
  }

  onCategoriaChange(): void {
    if (this.novaCategoria === 'Salário') {
      this.novoTipo = 'receita';
    } else if (this.novoTipo === 'receita') {
      this.novoTipo = 'despesa';
    }
    if (this.novaCategoria !== 'Mercado') {
      this.novaQuantidade = 1;
    }
  }

  // --- NFC-E LEITOR E PRÉ-VISUALIZAÇÃO ---
  setModoScanner(modo: 'camera' | 'arquivo' | 'manual' | 'html'): void {
    this.pararScanner();
    this.scannerModo = modo;
    this.mensagemNfce = '';
    if (modo === 'camera') {
      setTimeout(() => this.iniciarScanner(), 200);
    } else if (modo === 'arquivo') {
      setTimeout(() => this.triggerFileInput(), 150);
    }
  }

  triggerFileInput(): void {
    const fileInput = document.getElementById('qr-file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.click();
    }
  }

  iniciarScanner(): void {
    this.pararScanner();
    this.scannerAtivo = true;
    this.mensagemNfce = '📷 Solicitando acesso à câmera traseira... Aguarde.';
    this.statusNfceSucesso = true;

    setTimeout(() => {
      if (typeof Html5Qrcode !== 'undefined') {
        try {
          this.html5QrCode = new Html5Qrcode('qr-reader');
          const config = { fps: 10, qrbox: { width: 220, height: 220 }, aspectRatio: 1.0 };

          this.html5QrCode.start(
            { facingMode: 'environment' },
            config,
            (decodedText: string) => {
              this.urlNfce = decodedText;
              this.mensagemNfce = '✅ QR Code lido com sucesso! Extraindo produtos...';
              this.statusNfceSucesso = true;
              this.pararScanner();
              this.extrairNfce();
            },
            () => {}
          ).then(() => {
            this.mensagemNfce = '📷 Câmera traseira ativa! Aponte para o QR Code da nota fiscal.';
            this.statusNfceSucesso = true;
          }).catch(() => {
            this.html5QrCode.start(
              { facingMode: 'user' },
              config,
              (decodedText: string) => {
                this.urlNfce = decodedText;
                this.mensagemNfce = '✅ QR Code lido com sucesso! Extraindo produtos...';
                this.statusNfceSucesso = true;
                this.pararScanner();
                this.extrairNfce();
              },
              () => {}
            ).then(() => {
              this.mensagemNfce = '📷 Câmera ativa! Aponte para o QR Code da nota fiscal.';
              this.statusNfceSucesso = true;
            }).catch(() => {
              this.mensagemNfce = '❌ Não foi possível acessar a câmera. Tente enviar foto ou colar o link.';
              this.statusNfceSucesso = false;
              this.scannerAtivo = false;
            });
          });
        } catch (e) {
          this.mensagemNfce = '❌ Erro ao inicializar o leitor de QR Code.';
          this.statusNfceSucesso = false;
        }
      } else {
        this.mensagemNfce = '⚠️ Leitor de QR Code carregando... Clique em Ligar Câmera se necessário.';
        this.statusNfceSucesso = false;
      }
    }, 200);
  }

  pararScanner(): void {
    if (this.html5QrCode) {
      try {
        if (this.html5QrCode.isScanning) {
          this.html5QrCode.stop().then(() => {
            try { this.html5QrCode.clear(); } catch (e) {}
            this.html5QrCode = null;
          }).catch(() => { this.html5QrCode = null; });
        } else {
          try { this.html5QrCode.clear(); } catch (e) {}
          this.html5QrCode = null;
        }
      } catch (e) {
        this.html5QrCode = null;
      }
    }
    this.scannerAtivo = false;
  }

  processarFotoQrCode(event: any): void {
    const file = event?.target?.files?.[0];
    if (!file) return;

    this.mensagemNfce = '📸 Analisando imagem em busca do QR Code...';
    this.statusNfceSucesso = true;

    if (typeof Html5Qrcode !== 'undefined') {
      const html5QrCodeTemp = new Html5Qrcode('qr-reader');
      html5QrCodeTemp.scanFile(file, true)
        .then((decodedText: string) => {
          this.urlNfce = decodedText;
          this.mensagemNfce = '✅ QR Code identificado! Extraindo produtos...';
          this.statusNfceSucesso = true;
          this.extrairNfce();
        })
        .catch(() => {
          this.mensagemNfce = '❌ Não foi possível encontrar um QR Code válido na imagem. Tente uma imagem mais nítida.';
          this.statusNfceSucesso = false;
        });
    } else {
      this.mensagemNfce = '⚠️ Biblioteca do leitor indisponível no momento.';
      this.statusNfceSucesso = false;
    }
  }

  
  tratarResultadoNfce(res: any): void {
    this.carregandoNfce = false;
    const isJaCadastrada = !!(res?.jaCadastrada || res?.dadosNota?.jaCadastrada);
    if (res?.dadosNota) {
      res.dadosNota.jaCadastrada = isJaCadastrada;
      res.dadosNota.estabelecimento = this.obterNomeEstabelecimentoSimplificado(res.dadosNota.estabelecimento);
      if (res.dadosNota.itens) {
        res.dadosNota.itens = res.dadosNota.itens.map((i: any) => ({
          ...i,
          nomeProduto: this.limparNomeProduto(i.nomeProduto)
        }));
      }
    }
    this.dadosNotaPreview = res?.dadosNota || null;
    const totalItens = res?.dadosNota?.itens?.length || 0;

    if (isJaCadastrada) {
      this.mensagemNfce = '⚠️ AVISO: Esta nota fiscal já foi salva anteriormente no sistema!';
      this.statusNfceSucesso = false;
    } else {
      this.mensagemNfce = `✅ Dados da nota extraídos (${totalItens} itens). Confira abaixo e confirme para salvar.`;
      this.statusNfceSucesso = true;
    }
  }


  aoAlterarValorTotalPreview(): void {
    if (this.dadosNotaPreview) {
      const val = Number(this.dadosNotaPreview.valorTotal) || 0;
      if (this.dadosNotaPreview.itens && this.dadosNotaPreview.itens.length === 1 && this.dadosNotaPreview.itens[0].codigo === 'SEFAZ') {
        this.dadosNotaPreview.itens[0].valorUnitario = val;
        this.dadosNotaPreview.itens[0].valorTotal = val;
      }
    }
  }

  descartarPreviewNfce(): void {
    this.dadosNotaPreview = null;
    this.mensagemNfce = '';
    this.htmlNfceManual = '';
  }

  confirmarEGravarNfce(): void {
    if (!this.dadosNotaPreview) return;
    this.carregandoNfce = true;
    this.mensagemNfce = 'Salvando nota fiscal no banco...';

    this.financeService.salvarNfce(this.dadosNotaPreview).subscribe({
      next: () => {
        this.carregandoNfce = false;
        alert('🎉 Nota Fiscal salva com sucesso em Saídas e na Lista de Produtos!');
        this.dadosNotaPreview = null;
        this.mensagemNfce = '';
        this.urlNfce = '';
        this.htmlNfceManual = '';
        this.carregarTransacoes();
        this.carregarProdutos();
        this.setTab('saidas');
      },
      error: (err: any) => {
        this.carregandoNfce = false;
        alert(err?.error?.error || 'Erro ao salvar a Nota Fiscal.');
      }
    });
  }

  extrairNfce(): void {
    if (this.scannerModo === 'html') {
      if (!this.htmlNfceManual || !this.htmlNfceManual.trim()) {
        alert('Cole o conteúdo HTML do cupom fiscal!');
        return;
      }
      this.carregandoNfce = true;
      this.mensagemNfce = 'Processando HTML da nota fiscal...';
      this.statusNfceSucesso = true;

      this.financeService.extrairNfceHtml(this.htmlNfceManual, this.urlNfce).subscribe({
        next: (res: any) => this.tratarResultadoNfce(res),
        error: (err: any) => {
          this.carregandoNfce = false;
          this.mensagemNfce = `❌ ${err?.error?.error || 'Erro ao processar o HTML da nota'}`;
          this.statusNfceSucesso = false;
        }
      });
      return;
    }

    if (!this.urlNfce) {
      alert('Cole ou escaneie o QR Code da NFC-e!');
      return;
    }

    this.urlNfce = this.sanitizarUrlQrCode(this.urlNfce);

    this.carregandoNfce = true;
    this.mensagemNfce = 'Consultando nota fiscal junto à SEFAZ...';
    this.statusNfceSucesso = true;

    this.financeService.extrairNfce(this.urlNfce).subscribe({
      next: (res: any) => this.tratarResultadoNfce(res),
      error: () => {
        this.financeService.consultarNfce(this.urlNfce).subscribe({
          next: (res: any) => this.tratarResultadoNfce(res),
          error: (err2: any) => {
            this.carregandoNfce = false;
            const msgErro = err2?.error?.error || 'Erro ao consultar a nota fiscal junto à SEFAZ. Verifique o link e tente novamente.';
            this.mensagemNfce = `❌ ${msgErro}`;
            this.statusNfceSucesso = false;
          }
        });
      }
    });
  }

    extrairNfceBackendFallback(): void {
    this.financeService.extrairNfce(this.urlNfce).subscribe({
      next: (res) => this.tratarResultadoNfce(res),
      error: () => {
        this.financeService.consultarNfce(this.urlNfce).subscribe({
          next: (res) => this.tratarResultadoNfce(res),
          error: (err2) => {
            this.carregandoNfce = false;
            const msgErro = err2?.error?.error || 'Erro ao consultar a nota fiscal junto à SEFAZ. Verifique o link e tente novamente.';
            this.mensagemNfce = `❌ ${msgErro}`;
            this.statusNfceSucesso = false;
          }
        });
      }
    });
  }

    limparBusca(): void {
    this.buscaProduto = '';
  }

  limparBuscaEntrada(): void {
    this.buscaEntrada = '';
  }

  limparBuscaSaida(): void {
    this.buscaSaida = '';
  }

  // --- DASHBOARD CHARTS AND METRICS ---
  get anosDisponiveisGrafico(): string[] {
    return this.anosDisponiveis;
  }

  get dadosGraficoBarras(): any[] {
    const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const ano = this.anoGrafico || String(new Date().getFullYear());

    const transAno = (this.transacoes || []).filter(t => t.data && t.data.startsWith(ano));

    const totaisPorMes = meses.map((mesLabel, index) => {
      const mesNum = String(index + 1).padStart(2, '0');
      const prefixo = `${ano}-${mesNum}`;

      const transMes = transAno.filter(t => t.data && t.data.startsWith(prefixo));
      const receitaVal = transMes.filter(t => t.tipo === 'receita').reduce((acc, t) => acc + (Number(t.valor) || 0), 0);
      const despesaVal = transMes.filter(t => t.tipo === 'despesa').reduce((acc, t) => acc + (Number(t.valor) || 0), 0);

      return {
        mesLabel,
        receitaVal,
        despesaVal
      };
    });

    const maxVal = Math.max(...totaisPorMes.map(m => Math.max(m.receitaVal, m.despesaVal)), 100);

    return totaisPorMes.map(m => ({
      ...m,
      receitaHeight: Math.min((m.receitaVal / maxVal) * 100, 100),
      despesaHeight: Math.min((m.despesaVal / maxVal) * 100, 100)
    }));
  }

  get ultimos10Transacoes(): Transacao[] {
    return (this.transacoes || []).slice(0, 10);
  }

  get despesasPorCategoria(): { categoria: string, valor: number, percentual: number, cor: string }[] {
    const despesas = (this.transacoes || []).filter(t => t.tipo === 'despesa');
    const totalGeral = despesas.reduce((acc, t) => acc + (Number(t.valor) || 0), 0);
    if (totalGeral === 0) return [];

    const mapaCategorias: { [key: string]: number } = {};
    despesas.forEach(t => {
      const cat = (t.categoria && t.categoria.trim()) ? t.categoria.trim() : 'Outros';
      mapaCategorias[cat] = (mapaCategorias[cat] || 0) + (Number(t.valor) || 0);
    });

    const coresMap: { [key: string]: string } = {
      'Mercado': '#2563eb',       // Azul
      'Alimentação': '#3b82f6',    // Azul claro
      'Moradia': '#10b981',       // Verde
      'Transporte': '#f97316',    // Laranja
      'Lazer': '#ec4899',         // Rosa
      'Saúde': '#8b5cf6',         // Roxo
      'Educação': '#06b6d4',      // Ciano
      'Pessoal': '#f59e0b',       // Âmbar
      'Salário': '#84cc16',       // Verde lima
      'Outros': '#64748b'         // Cinza
    };

    const listaCoresFallback = ['#2563eb', '#10b981', '#f97316', '#8b5cf6', '#ec4899', '#06b6d4', '#f59e0b', '#84cc16', '#6366f1', '#64748b'];

    const resultado = Object.keys(mapaCategorias).map((cat, index) => {
      const val = mapaCategorias[cat];
      const pct = (val / totalGeral) * 100;
      const cor = coresMap[cat] || listaCoresFallback[index % listaCoresFallback.length];
      return {
        categoria: cat,
        valor: val,
        percentual: Math.round(pct * 10) / 10,
        cor
      };
    });

    return resultado.sort((a, b) => b.valor - a.valor);
  }

  get donutGradient(): string {
    const cats = this.despesasPorCategoria;
    if (!cats || cats.length === 0) {
      return 'conic-gradient(#334155 0% 100%)';
    }

    let acum = 0;
    const partes: string[] = [];
    cats.forEach(item => {
      const inicio = acum;
      acum += item.percentual;
      const fim = acum;
      partes.push(item.cor + ' ' + inicio.toFixed(1) + '% ' + fim.toFixed(1) + '%');
    });

    if (acum < 100 && partes.length > 0) {
      const ultima = cats[cats.length - 1];
      const penultimoAcum = acum - ultima.percentual;
      partes[partes.length - 1] = ultima.cor + ' ' + penultimoAcum.toFixed(1) + '% 100%';
    }

    return 'conic-gradient(' + partes.join(', ') + ')';
  }

  get saldoTotal(): number {
    return (this.transacoes || []).reduce((acc, t) => {
      const val = Number(t.valor) || 0;
      return t.tipo === 'receita' ? acc + val : acc - val;
    }, 0);
  }

  get receitasMes(): number {
    return (this.transacoes || []).filter(t => t.tipo === 'receita').reduce((a, b) => a + (Number(b.valor) || 0), 0);
  }

  get despesasMes(): number {
    return (this.transacoes || []).filter(t => t.tipo === 'despesa').reduce((a, b) => a + (Number(b.valor) || 0), 0);
  }

  // --- CARRINHO EM TEMPO REAL ---
  limiteOrcamentoCarrinho: number = 0;
  estabelecimentoCarrinho: string = 'Supermercado';
  modoAddCarrinho: 'barcode' | 'manual' = 'barcode';
  scannerBarcodeAtivo: boolean = false;
  html5BarcodeScanner: any = null;
  statusBarcodeMsg: string = '';
  statusBarcodeOk: boolean = true;
  itensCarrinho: any[] = [];
  novoItemCarrinho: any = {
    nomeProduto: '',
    quantidade: 1,
    unidade: 'UN',
    valorUnitario: 0,
    codigo: ''
  };
  historicoItemCarrinho: any = null;
  carregandoCarrinho: boolean = false;

  get subtotalCarrinho(): number {
    if (!this.itensCarrinho) return 0;
    return this.itensCarrinho.reduce((acc, item) => acc + (Number(item.valorTotal) || 0), 0);
  }

  get saldoOrcamentoCarrinho(): number {
    const limite = Number(this.limiteOrcamentoCarrinho) || 0;
    return limite - this.subtotalCarrinho;
  }

  get percentualOrcamentoCarrinho(): number {
    const limite = Number(this.limiteOrcamentoCarrinho) || 0;
    if (limite <= 0) return 0;
    return (this.subtotalCarrinho / limite) * 100;
  }

  setModoAddCarrinho(modo: 'barcode' | 'manual'): void {
    this.modoAddCarrinho = modo;
    if (modo === 'barcode') {
      setTimeout(() => this.iniciarScannerBarcode(), 200);
    } else {
      this.pararScannerBarcode();
    }
  }

  iniciarScannerBarcode(): void {
    if (typeof window === 'undefined') return;

    if (this.scannerBarcodeAtivo) {
      this.pararScannerBarcode();
    }

    this.statusBarcodeMsg = '📷 Ativando leitor de código de barras...';
    this.statusBarcodeOk = true;

    setTimeout(() => {
      const el = document.getElementById('barcode-viewport');
      if (el && (window as any).Html5Qrcode) {
        try {
          this.html5BarcodeScanner = new (window as any).Html5Qrcode('barcode-viewport');
          this.scannerBarcodeAtivo = true;

          const config = {
            fps: 10,
            qrbox: { width: 280, height: 180 }
          };

          this.html5BarcodeScanner.start(
            { facingMode: 'environment' },
            config,
            (decodedText: string) => {
              this.statusBarcodeMsg = `✅ Código ${decodedText} lido com sucesso!`;
              this.statusBarcodeOk = true;
              this.consultarProdutoPorCodigo(decodedText);
            },
            () => {}
          ).catch(() => {
            this.statusBarcodeMsg = '❌ Não foi possível abrir a câmera para código de barras.';
            this.statusBarcodeOk = false;
            this.scannerBarcodeAtivo = false;
          });
        } catch (e) {
          this.statusBarcodeMsg = '❌ Erro ao inicializar o leitor de código de barras.';
          this.statusBarcodeOk = false;
        }
      }
    }, 200);
  }

  pararScannerBarcode(): void {
    if (this.html5BarcodeScanner) {
      try {
        if (this.html5BarcodeScanner.isScanning) {
          this.html5BarcodeScanner.stop().then(() => {
            try { this.html5BarcodeScanner.clear(); } catch (e) {}
            this.html5BarcodeScanner = null;
          }).catch(() => { this.html5BarcodeScanner = null; });
        } else {
          try { this.html5BarcodeScanner.clear(); } catch (e) {}
          this.html5BarcodeScanner = null;
        }
      } catch (e) {
        this.html5BarcodeScanner = null;
      }
    }
    this.scannerBarcodeAtivo = false;
  }

  consultarProdutoPorCodigo(codigo: string): void {
    if (!codigo) return;
    this.novoItemCarrinho.codigo = codigo;

    this.financeService.getProdutoPorCodigo(codigo).subscribe({
      next: (res) => {
        if (res && res.encontrado) {
          this.novoItemCarrinho.nomeProduto = res.nomeProduto;
          this.novoItemCarrinho.unidade = res.unidade || 'UN';
          this.novoItemCarrinho.valorUnitario = res.ultimoPreco || 0;
          this.historicoItemCarrinho = res;
          this.statusBarcodeMsg = `ὐe Produto encontrado: ${res.nomeProduto} (ÚLTIMO PREÇO: R$ ${(res.ultimoPreco || 0).toFixed(2)})`;
          this.statusBarcodeOk = true;
        } else {
          this.historicoItemCarrinho = null;
          this.statusBarcodeMsg = `ℹ️ Código ${codigo} registrado. Preencha o nome e valor do produto.`;
          this.statusBarcodeOk = true;
        }
      },
      error: () => {
        this.historicoItemCarrinho = null;
        this.statusBarcodeMsg = `ℹ️ Código ${codigo} lido. Digite o nome e valor do item.`;
        this.statusBarcodeOk = true;
      }
    });
  }

  adicionarItemAoCarrinho(): void {
    if (!this.novoItemCarrinho.nomeProduto || !this.novoItemCarrinho.nomeProduto.trim()) {
      alert('Informe o nome ou descrição do produto!');
      return;
    }

    const valUnit = Number(this.novoItemCarrinho.valorUnitario) || 0;
    if (valUnit <= 0) {
      alert('Informe um preço unitário válido maior que zero!');
      return;
    }

    const qtd = Number(this.novoItemCarrinho.quantidade) || 1;
    const nomeLimpo = this.limparNomeProduto(this.novoItemCarrinho.nomeProduto);

    const item = {
      nomeProduto: nomeLimpo,
      codigo: this.novoItemCarrinho.codigo || 'EAN',
      quantidade: qtd,
      unidade: this.novoItemCarrinho.unidade || 'UN',
      valorUnitario: valUnit,
      valorTotal: Number((qtd * valUnit).toFixed(2))
    };

    this.itensCarrinho.push(item);

    // Reset formulário
    this.novoItemCarrinho = {
      nomeProduto: '',
      quantidade: 1,
      unidade: 'UN',
      valorUnitario: 0,
      codigo: ''
    };
    this.historicoItemCarrinho = null;
    this.statusBarcodeMsg = '✅ Item adicionado ao carrinho!';
    this.statusBarcodeOk = true;
  }

  alterarQtdCarrinho(index: number, delta: number): void {
    if (index >= 0 && index < this.itensCarrinho.length) {
      const item = this.itensCarrinho[index];
      const novaQtd = Math.max(0.1, Number((item.quantidade + delta).toFixed(2)));
      item.quantidade = novaQtd;
      item.valorTotal = Number((novaQtd * item.valorUnitario).toFixed(2));
    }
  }

  removerItemCarrinho(index: number): void {
    if (index >= 0 && index < this.itensCarrinho.length) {
      this.itensCarrinho.splice(index, 1);
    }
  }

  limparCarrinho(): void {
    if (confirm('Tem certeza que deseja esvaziar o carrinho?')) {
      this.itensCarrinho = [];
      this.historicoItemCarrinho = null;
    }
  }

  finalizarEGravarCarrinho(): void {
    if (!this.itensCarrinho || this.itensCarrinho.length === 0) {
      alert('Seu carrinho está vazio!');
      return;
    }

    this.carregandoCarrinho = true;

    const payload = {
      estabelecimento: this.estabelecimentoCarrinho || 'Supermercado',
      valorTotal: this.subtotalCarrinho,
      itens: this.itensCarrinho,
      conta: 'Conta Corrente'
    };

    this.financeService.finalizarCarrinho(payload).subscribe({
      next: () => {
        this.carregandoCarrinho = false;
        alert('🎉 Compra do carrinho finalizada e salva em Saídas com sucesso!');
        this.itensCarrinho = [];
        this.historicoItemCarrinho = null;
        this.carregarTransacoes();
        this.carregarProdutos();
        this.setTab('saidas');
      },
      error: (err) => {
        this.carregandoCarrinho = false;
        alert(err?.error?.error || 'Erro ao finalizar compra do carrinho.');
      }
    });
  }

}
