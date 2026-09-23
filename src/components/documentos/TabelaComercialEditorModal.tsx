import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Save,
  CopyPlus,
  RotateCcw,
  RotateCw,
  RefreshCw,
  Eye,
  History,
  Download,
  Plus,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown,
  Layers,
  FileText,
  Palette,
  Settings,
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  AlertCircle,
  Tag,
  DollarSign,
  Package,
  Calendar,
  Sparkles,
  Upload,
} from 'lucide-react';
import { DocumentoItem, DocumentoPagina, DocumentoCategoria } from '../../types';
import {
  TabelaLinhaProduto,
  TabelaComercialConfig,
  INITIAL_TABELA_CONFIG,
  INITIAL_TABELA_PRODUTOS,
  buildTabelaDocumentoPaginas,
  atualizarPrecosVinculados,
} from '../../data/tabelaRevendaModel';
import { saveDocumentoAsync, duplicateDocumentoAsync } from '../../utils/documentosService';
import { FENIX_OFFICIAL_LOGO_BASE64 } from '../../assets/fenixLogoBase64';
import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';

interface TabelaComercialEditorModalProps {
  isOpen: boolean;
  documento: DocumentoItem | null;
  categorias: DocumentoCategoria[];
  currentUserName: string;
  onClose: () => void;
  onSaved: (savedDoc: DocumentoItem) => void;
}

type EditorTab = 'conteudo' | 'paginas' | 'elementos' | 'configuracoes';

interface HistorySnapshot {
  config: TabelaComercialConfig;
  produtos: TabelaLinhaProduto[];
  currentPage: number;
}

export const TabelaComercialEditorModal: React.FC<TabelaComercialEditorModalProps> = ({
  isOpen,
  documento,
  categorias,
  currentUserName,
  onClose,
  onSaved,
}) => {
  // Configurações gerais da tabela
  const [config, setConfig] = useState<TabelaComercialConfig>(() => {
    if (documento?.tabelaProdutosData?.config) {
      return documento.tabelaProdutosData.config;
    }
    return {
      ...INITIAL_TABELA_CONFIG,
      nome: documento?.titulo || INITIAL_TABELA_CONFIG.nome,
      mes: documento?.mes || INITIAL_TABELA_CONFIG.mes,
      ano: documento?.ano || INITIAL_TABELA_CONFIG.ano,
    };
  });

  // Lista de produtos da tabela
  const [produtos, setProdutos] = useState<TabelaLinhaProduto[]>(() => {
    if (documento?.tabelaProdutosData?.produtos) {
      return documento.tabelaProdutosData.produtos;
    }
    return INITIAL_TABELA_PRODUTOS;
  });

  // Página ativa (1 a 5)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<EditorTab>('conteudo');
  const [zoom, setZoom] = useState<number>(0.75);

  // Histórico para Desfazer / Refazer
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  // Estados de Salvamento
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  // Modal de Salvar como Cópia
  const [isCopiaModalOpen, setIsCopiaModalOpen] = useState(false);
  const [copiaNome, setCopiaNome] = useState('');
  const [isCopying, setIsCopying] = useState(false);

  // Modal de Adicionar / Editar Produto
  const [editingProduto, setEditingProduto] = useState<TabelaLinhaProduto | null>(null);
  const [isProdutoModalOpen, setIsProdutoModalOpen] = useState(false);

  // Referência da página para geração do PDF
  const pageContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Carrega documento ao abrir
  useEffect(() => {
    if (isOpen && documento) {
      const cfg = documento.tabelaProdutosData?.config || {
        ...INITIAL_TABELA_CONFIG,
        nome: documento.titulo || 'Tabela de Revenda',
        mes: documento.mes || 'Setembro',
        ano: documento.ano || '2026',
      };
      const prods = documento.tabelaProdutosData?.produtos || INITIAL_TABELA_PRODUTOS;
      setConfig(cfg);
      setProdutos(prods);
      setCurrentPage(1);
      setUndoStack([]);
      setRedoStack([]);
      setSaveStatus('saved');
    }
  }, [isOpen, documento]);

  // Registro de histórico para Desfazer
  const recordHistory = () => {
    setUndoStack((prev) => [
      ...prev.slice(-25),
      {
        config: JSON.parse(JSON.stringify(config)),
        produtos: JSON.parse(JSON.stringify(produtos)),
        currentPage,
      },
    ]);
    setRedoStack([]);
    setSaveStatus('dirty');
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1];
    setRedoStack((prev) => [
      ...prev,
      {
        config: JSON.parse(JSON.stringify(config)),
        produtos: JSON.parse(JSON.stringify(produtos)),
        currentPage,
      },
    ]);
    setConfig(last.config);
    setProdutos(last.produtos);
    setCurrentPage(last.currentPage);
    setUndoStack((prev) => prev.slice(0, -1));
    showToast('Ação desfeita', 'info');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setUndoStack((prev) => [
      ...prev,
      {
        config: JSON.parse(JSON.stringify(config)),
        produtos: JSON.parse(JSON.stringify(produtos)),
        currentPage,
      },
    ]);
    setConfig(next.config);
    setProdutos(next.produtos);
    setCurrentPage(next.currentPage);
    setRedoStack((prev) => prev.slice(0, -1));
    showToast('Ação refeita', 'info');
  };

  // REGRA OFICIAL: "Atualizar preços vinculados"
  const handleAtualizarPrecosVinculados = () => {
    recordHistory();
    const res = atualizarPrecosVinculados(produtos, config.tipoTabela);
    setProdutos(res.produtosAtualizados);
    if (res.totalAtualizados > 0) {
      showToast(
        `${res.totalAtualizados} preço(s) atualizado(s) com base no cadastro do CRM!`,
        'success'
      );
    } else {
      showToast('Todos os preços vinculados já estão sincronizados com o CRM.', 'info');
    }
  };

  // Salvar Alterações no Supabase
  const handleSaveDocumento = async (showNotification = true) => {
    setIsSaving(true);
    setSaveStatus('saving');

    try {
      const paginas = buildTabelaDocumentoPaginas(config, produtos);

      const targetDoc: Partial<DocumentoItem> = {
        id: documento?.id || 'tabela_revenda_setembro_2026',
        titulo: config.nome,
        categoriaId: documento?.categoriaId || 'cat_tabelas_comerciais',
        categoriaNome: config.categoria,
        mes: config.mes,
        ano: config.ano,
        isModelo: true,
        isTabelaComercial: true,
        tipoTabela: config.tipoTabela,
        nomeArquivoOriginal: documento?.nomeArquivoOriginal || 'TABELA REVENDA SETEMBRO.pdf',
        totalPaginas: 5,
        paginas,
        tabelaProdutosData: {
          config,
          produtos,
        },
      };

      const result = await saveDocumentoAsync(targetDoc, undefined, currentUserName, {
        createVersion: true,
        versionDesc: `Tabela salva em ${new Date().toLocaleTimeString('pt-BR')}`,
      });

      if (result.success && result.item) {
        setSaveStatus('saved');
        onSaved(result.item);
        if (showNotification) {
          showToast('Tabela de Revenda salva com sucesso no Supabase!', 'success');
        }
      } else {
        setSaveStatus('dirty');
        showToast(result.error || 'Erro ao salvar no Supabase. Tente novamente.', 'error');
      }
    } catch (err: any) {
      setSaveStatus('dirty');
      showToast('Falha na comunicação com o servidor. Tente novamente.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Salvar como Cópia Independente (ex: Tabela de Revenda -> Tabela Construtora)
  const handleSalvarComoCopia = async () => {
    if (!copiaNome.trim()) {
      showToast('Informe o nome para a nova tabela.', 'error');
      return;
    }

    setIsCopying(true);
    try {
      const novaConfig: TabelaComercialConfig = {
        ...config,
        nome: copiaNome.trim(),
        tipoTabela: copiaNome.toLowerCase().includes('construtora')
          ? 'Construtora'
          : copiaNome.toLowerCase().includes('distribuidor')
          ? 'Distribuidor'
          : 'Revenda',
      };

      const paginas = buildTabelaDocumentoPaginas(novaConfig, produtos);
      const newId = `tabela_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

      const novaTabelaDoc: Partial<DocumentoItem> = {
        id: newId,
        titulo: novaConfig.nome,
        categoriaId: documento?.categoriaId || 'cat_tabelas_comerciais',
        categoriaNome: novaConfig.categoria,
        mes: novaConfig.mes,
        ano: novaConfig.ano,
        isModelo: true,
        isTabelaComercial: true,
        tipoTabela: novaConfig.tipoTabela,
        nomeArquivoOriginal: `${novaConfig.nome}.pdf`,
        totalPaginas: 5,
        paginas,
        tabelaProdutosData: {
          config: novaConfig,
          produtos,
        },
      };

      const res = await saveDocumentoAsync(novaTabelaDoc, undefined, currentUserName);
      if (res.success && res.item) {
        showToast(`Cópia "${novaConfig.nome}" criada com sucesso!`, 'success');
        setIsCopiaModalOpen(false);
        setCopiaNome('');
        onSaved(res.item);
      } else {
        showToast(res.error || 'Falha ao salvar cópia.', 'error');
      }
    } catch (err: any) {
      showToast('Erro ao criar cópia da tabela.', 'error');
    } finally {
      setIsCopying(false);
    }
  };

  // Restaurar Original de Fábrica
  const handleRestaurarOriginal = () => {
    if (
      !window.confirm(
        'Deseja restaurar a tabela para as informações originais do PDF? Todas as modificações locais não salvas serão substituídas.'
      )
    ) {
      return;
    }
    recordHistory();
    setConfig({ ...INITIAL_TABELA_CONFIG });
    setProdutos([...INITIAL_TABELA_PRODUTOS]);
    setCurrentPage(1);
    showToast('Tabela restaurada para o modelo original.', 'info');
  };

  // Ações de Produtos
  const handleAddOrEditProduto = (prodData: Partial<TabelaLinhaProduto>) => {
    recordHistory();
    if (editingProduto) {
      // Edição
      setProdutos((prev) =>
        prev.map((p) => (p.id === editingProduto.id ? ({ ...p, ...prodData } as TabelaLinhaProduto) : p))
      );
      showToast('Produto atualizado.');
    } else {
      // Criação
      const novoProduto: TabelaLinhaProduto = {
        id: `prod_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        paginaNumero: currentPage,
        marcaLinha: prodData.marcaLinha || 'NOVA LINHA',
        marcaCor: prodData.marcaCor || '#0284c7',
        marcaTextColor: prodData.marcaTextColor || '#ffffff',
        descricao: prodData.descricao || 'Novo Produto',
        preco: Number(prodData.preco) || 0,
        unidade: prodData.unidade || 'm²',
        promocao: Boolean(prodData.promocao),
        promocaoTexto: prodData.promocaoTexto || 'PROMOÇÃO',
        isPrecoManual: Boolean(prodData.isPrecoManual),
        ...prodData,
      };
      setProdutos((prev) => [...prev, novoProduto]);
      showToast('Novo produto adicionado.');
    }
    setIsProdutoModalOpen(false);
    setEditingProduto(null);
  };

  const handleDeleteProduto = (id: string) => {
    recordHistory();
    setProdutos((prev) => prev.filter((p) => p.id !== id));
    showToast('Produto excluído.');
  };

  const handleDuplicateProduto = (p: TabelaLinhaProduto) => {
    recordHistory();
    const dup: TabelaLinhaProduto = {
      ...p,
      id: `prod_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
      descricao: `${p.descricao} (Cópia)`,
    };
    const idx = produtos.findIndex((x) => x.id === p.id);
    const newArr = [...produtos];
    newArr.splice(idx + 1, 0, dup);
    setProdutos(newArr);
    showToast('Produto duplicado.');
  };

  const handleMoveProduto = (id: string, direction: 'up' | 'down') => {
    const pageProds = produtos.filter((p) => p.paginaNumero === currentPage);
    const idx = pageProds.findIndex((p) => p.id === id);
    if (idx === -1) return;
    if (direction === 'up' && idx === 0) return;
    if (direction === 'down' && idx === pageProds.length - 1) return;

    recordHistory();
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const globalIdx1 = produtos.findIndex((p) => p.id === pageProds[idx].id);
    const globalIdx2 = produtos.findIndex((p) => p.id === pageProds[targetIdx].id);

    const newArr = [...produtos];
    const temp = newArr[globalIdx1];
    newArr[globalIdx1] = newArr[globalIdx2];
    newArr[globalIdx2] = temp;
    setProdutos(newArr);
  };

  // Exportar / Baixar PDF em formato Paisagem Landscape
  const handleExportPdf = async () => {
    if (!pageContainerRef.current) return;
    try {
      showToast('Gerando PDF de alta resolução...', 'info');
      const dataUrl = await toPng(pageContainerRef.current, { quality: 0.95, pixelRatio: 2 });
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'pt',
        format: [1200, 850],
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, 1200, 850);
      pdf.save(`${config.nome} - ${config.mes} ${config.ano} - Página ${currentPage}.pdf`);
      showToast('PDF baixado com sucesso!');
    } catch (err) {
      showToast('Erro ao exportar PDF.', 'error');
    }
  };

  if (!isOpen) return null;

  // Produtos da página atualmente selecionada
  const currentPaginaProdutos = produtos.filter((p) => p.paginaNumero === currentPage);

  // Título da página atual
  const pageTitles: Record<number, string> = {
    1: 'Capa Oficial',
    2: 'Pisos, Manta Hospitalar e Teto Vinílico',
    3: 'Rodapés e Ripados',
    4: 'Materiais para Instalação de Piso Vinílico',
    5: 'Outros Produtos',
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080d1a]/95 backdrop-blur-md flex flex-col overflow-hidden text-slate-100 animate-in fade-in duration-200">
      {/* Toast Notification */}
      {toastMessage && (
        <div
          className={`fixed top-4 right-6 z-50 px-4 py-2.5 rounded-xl shadow-2xl text-xs font-bold flex items-center gap-2 border animate-in slide-in-from-top-4 ${
            toastMessage.type === 'error'
              ? 'bg-red-500/20 border-red-500/40 text-red-300'
              : toastMessage.type === 'info'
              ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
              : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
          }`}
        >
          {toastMessage.type === 'error' ? (
            <AlertCircle className="w-4 h-4" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* ====================================================
          1. HEADER PRINCIPAL / BARRA DE CONTROLES SUPERIOR
         ==================================================== */}
      <div className="h-16 px-4 bg-[#0a1222] border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        {/* Lado Esquerdo: Identificação da Tabela */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-linear-to-br from-blue-600 to-indigo-700 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={config.nome}
                onChange={(e) => {
                  recordHistory();
                  setConfig({ ...config, nome: e.target.value });
                }}
                className="text-sm font-bold text-white bg-transparent border-b border-transparent hover:border-slate-700 focus:border-[#0055ff] focus:outline-none transition-colors px-1"
                placeholder="Nome da Tabela"
              />
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                5 Páginas Landscape
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                {config.mes} {config.ano}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Preservação de alta resolução sem corte ou conversão vertical para A4
            </p>
          </div>
        </div>

        {/* Centro: Controles de Histórico e Ações */}
        <div className="flex items-center gap-1.5 bg-[#0e172a] p-1 rounded-xl border border-slate-800">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800 transition-colors"
            title="Desfazer (Ctrl+Z)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-1.5 text-slate-400 hover:text-white disabled:opacity-30 rounded-lg hover:bg-slate-800 transition-colors"
            title="Refazer (Ctrl+Y)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-1" />

          {/* Botão de destaque: "Atualizar preços vinculados" */}
          <button
            onClick={handleAtualizarPrecosVinculados}
            className="px-2.5 py-1 text-xs font-bold text-sky-400 hover:text-white hover:bg-sky-600/20 rounded-lg flex items-center gap-1.5 transition-colors border border-sky-500/30"
            title="Buscar novamente os preços atuais dos produtos vinculados no CRM"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Atualizar preços vinculados</span>
          </button>

          <div className="w-[1px] h-4 bg-slate-700 mx-1" />

          {/* Zoom */}
          <button
            onClick={() => setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))}
            className="p-1 text-slate-400 hover:text-white"
            title="Reduzir Zoom"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-slate-300 w-11 text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(1.3, Number((z + 0.1).toFixed(2))))}
            className="p-1 text-slate-400 hover:text-white"
            title="Aumentar Zoom"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        {/* Lado Direito: Ações de Salvamento e Cópia */}
        <div className="flex items-center gap-2">
          {/* Status */}
          <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-slate-400 mr-1">
            {saveStatus === 'saving' ? (
              <span className="text-blue-400 flex items-center gap-1 animate-pulse">
                <RefreshCw className="w-3 h-3 animate-spin" /> Salvando...
              </span>
            ) : saveStatus === 'dirty' ? (
              <span className="text-amber-400 flex items-center gap-1">● Alterações pendentes</span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Salvo no Supabase
              </span>
            )}
          </div>

          {/* Salvar como Cópia */}
          <button
            onClick={() => {
              setCopiaNome(`${config.nome} (Cópia)`);
              setIsCopiaModalOpen(true);
            }}
            className="px-3 py-1.5 bg-[#121c2e] hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Criar uma cópia independente (ex: Tabela de Revenda → Tabela Construtora)"
          >
            <CopyPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Salvar como Cópia</span>
          </button>

          {/* Salvar Alterações */}
          <button
            onClick={() => handleSaveDocumento(true)}
            disabled={isSaving}
            className="px-4 py-1.5 bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-md shadow-blue-500/20 transition-all cursor-pointer disabled:opacity-50"
            title="Salvar alterações no Supabase"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Salvando...' : 'Salvar Alterações'}</span>
          </button>

          {/* Baixar PDF */}
          <button
            onClick={handleExportPdf}
            className="p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white rounded-xl text-xs transition-colors"
            title="Baixar esta página em PDF"
          >
            <Download className="w-4 h-4" />
          </button>

          {/* Fechar */}
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer ml-1"
            title="Fechar Editor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* ====================================================
          2. SEGUNDA BARRA: NAVEGAÇÃO DE PÁGINAS E ABAS ESTRUTURAIS
         ==================================================== */}
      <div className="h-11 px-4 bg-[#0d1629] border-b border-slate-800/80 flex items-center justify-between text-xs shrink-0">
        {/* Abas Estruturais definidas no Prompt 2 */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('conteudo')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'conteudo'
                ? 'bg-[#0055ff] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Editar Conteúdo</span>
          </button>

          <button
            onClick={() => setActiveTab('paginas')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'paginas'
                ? 'bg-[#0055ff] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Páginas (5)</span>
          </button>

          <button
            onClick={() => setActiveTab('elementos')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'elementos'
                ? 'bg-[#0055ff] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Palette className="w-3.5 h-3.5" />
            <span>Elementos Visuais</span>
          </button>

          <button
            onClick={() => setActiveTab('configuracoes')}
            className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'configuracoes'
                ? 'bg-[#0055ff] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Configurações</span>
          </button>
        </div>

        {/* Navegação Rápida entre as 5 Páginas */}
        <div className="flex items-center gap-1.5">
          <span className="text-slate-400 text-[11px] hidden sm:inline">Página atual:</span>
          {[1, 2, 3, 4, 5].map((num) => (
            <button
              key={num}
              onClick={() => setCurrentPage(num)}
              className={`w-7 h-7 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                currentPage === num
                  ? 'bg-blue-600 text-white ring-2 ring-blue-400/40'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {num}
            </button>
          ))}
          <span className="text-xs font-medium text-slate-400 ml-2 truncate max-w-[200px]">
            {pageTitles[currentPage]}
          </span>
        </div>
      </div>

      {/* ====================================================
          3. CORPO DO EDITOR (LAYOUT 3 COLUNAS)
          - Esquerda: Miniaturas das páginas (Landscape fiel ao PDF)
          - Centro: Visualização grande da página
          - Direita: Painel de propriedades (Conteúdo | Páginas | Elementos | Config)
         ==================================================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* ----------------------------------------------------
            COLUNA ESQUERDA: MINIATURAS DAS 5 PÁGINAS
           ---------------------------------------------------- */}
        <div className="w-56 md:w-60 bg-[#0a1222] border-r border-slate-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#0055ff]" />
              Páginas (5)
            </h4>
            <span className="text-[10px] text-slate-400">1200 x 850</span>
          </div>

          <div className="p-3 overflow-y-auto flex-1 space-y-3">
            {[1, 2, 3, 4, 5].map((num) => {
              const isSelected = currentPage === num;
              return (
                <div
                  key={num}
                  onClick={() => setCurrentPage(num)}
                  className={`p-2 rounded-xl border transition-all cursor-pointer group ${
                    isSelected
                      ? 'border-[#0055ff] bg-[#0055ff]/10 shadow-lg shadow-blue-500/10'
                      : 'border-slate-800/80 bg-[#0e172a] hover:border-slate-700 hover:bg-slate-850'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="font-bold text-white">Página {num}</span>
                    <span className="text-[10px] text-slate-400 truncate max-w-[110px]">
                      {pageTitles[num]}
                    </span>
                  </div>

                  {/* Thumbnail com aspecto paisagem 1200/850 */}
                  <div className="w-full aspect-[1200/850] bg-white rounded-md overflow-hidden relative shadow-xs p-1 text-[7px] text-slate-800 flex flex-col justify-between border border-slate-200">
                    {num === 1 ? (
                      // Capa
                      <div className="h-full flex flex-col justify-between p-1 bg-gradient-to-r from-slate-50 to-blue-50">
                        <div className="font-bold text-[#002b66] text-[8px]">FÊNIX WORLD</div>
                        <div className="text-center">
                          <p className="font-extrabold text-[#002b66] text-[9px] leading-tight">
                            TABELA REVENDA
                          </p>
                          <p className="text-[6px] text-sky-600 font-bold">
                            {config.mes} {config.ano}
                          </p>
                        </div>
                        <div className="text-[5px] text-slate-500 text-center">
                          flexfloor • Fortaleza • Tarkett
                        </div>
                      </div>
                    ) : (
                      // Páginas 2 a 5
                      <div className="h-full flex flex-col justify-between">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-0.5">
                          <span className="font-bold text-[6px]">FÊNIX</span>
                          <span className="font-bold text-[6px] truncate max-w-[90px]">
                            {pageTitles[num].toUpperCase()}
                          </span>
                          <span className="text-[5px] bg-blue-100 px-0.5 rounded">
                            {config.mes}
                          </span>
                        </div>
                        <div className="flex-1 py-1 space-y-0.5">
                          <div className="h-1 bg-slate-200 rounded w-full" />
                          <div className="h-1 bg-slate-100 rounded w-3/4" />
                          <div className="h-1 bg-slate-200 rounded w-5/6" />
                        </div>
                        <div className="flex items-center justify-between text-[5px] text-slate-400 border-t border-slate-200 pt-0.5">
                          <span>Fênix World</span>
                          <span>Pág {num - 1}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ----------------------------------------------------
            COLUNA CENTRAL: VISUALIZAÇÃO GRANDE DO DOCUMENTO
           ---------------------------------------------------- */}
        <div className="flex-1 bg-[#070d18] overflow-auto flex items-center justify-center p-6 relative">
          <div
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
              transition: 'transform 0.15s ease-out',
            }}
          >
            {/* CONTAINER DA PÁGINA (1200 x 850 px - PROPORÇÃO FIEL DO PDF ORIGINAL) */}
            <div
              ref={pageContainerRef}
              id="tabela-comercial-page-canvas"
              className="w-[1200px] h-[850px] bg-white text-slate-900 rounded-lg shadow-2xl overflow-hidden relative select-none flex flex-col font-sans"
              style={{ width: '1200px', height: '850px' }}
            >
              {/* ====================================================
                  RENDERIZAÇÃO DA PÁGINA 1: CAPA
                 ==================================================== */}
              {currentPage === 1 && (
                <div className="w-full h-full relative flex overflow-hidden bg-[#ffffff]">
                  {/* Lado Esquerdo da Capa: Conteúdo Institucional */}
                  <div className="w-[620px] h-full p-14 flex flex-col justify-between z-10 bg-linear-to-br from-white via-slate-50 to-blue-50/40">
                    <div>
                      {/* Logo Fênix World Oficial */}
                      <img
                        src={config.logoUrl || FENIX_OFFICIAL_LOGO_BASE64}
                        alt="Fênix World"
                        className="h-16 object-contain mb-14"
                      />

                      {/* Título Principal */}
                      <h1 className="text-6xl font-black text-[#002b66] tracking-tight leading-none mb-4">
                        TABELA
                        <br />
                        REVENDA
                      </h1>

                      {/* Vigência Mês / Ano */}
                      <div className="flex items-center gap-3 my-6">
                        <div className="w-12 h-[2px] bg-[#0284c7]" />
                        <span className="text-2xl font-extrabold tracking-widest text-[#002b66] uppercase">
                          {config.mes} {config.ano}
                        </span>
                        <div className="w-12 h-[2px] bg-[#0284c7]" />
                      </div>

                      {/* Subtítulos */}
                      <div className="space-y-1 text-slate-700 text-lg font-medium mt-6">
                        <p>{config.subtituloCapa1}</p>
                        <p>{config.subtituloCapa2}</p>
                      </div>
                    </div>

                    {/* Faixa inferior de marcas parceiras */}
                    <div className="pt-6 border-t border-slate-200">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                        Marcas e Parceiros Oficiais
                      </p>
                      <div className="flex items-center gap-6 text-xs font-bold text-slate-600 opacity-90">
                        <span className="text-[#b91c1c] font-black text-sm">flexfloor</span>
                        <span className="font-extrabold tracking-wider">FORTALEZA</span>
                        <span className="text-[#0284c7] font-bold">HD FLEX</span>
                        <span className="tracking-widest">NEXA</span>
                        <span className="text-[#4d7c0f] font-bold">VinilForte</span>
                        <span className="font-black">Pix</span>
                        <span className="font-bold text-slate-800">Tarkett</span>
                      </div>
                    </div>
                  </div>

                  {/* Lado Direito da Capa: Imagem Decorativa de Piso Vinílico & Sala */}
                  <div className="flex-1 h-full relative overflow-hidden bg-[#0c1628]">
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{
                        backgroundImage: `url('${config.capaFotoUrl || "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=1200&auto=format&fit=crop"}')`,
                      }}
                    />
                    {/* Filtro suave */}
                    <div className="absolute inset-0 bg-gradient-to-r from-white/20 via-transparent to-black/30" />
                  </div>
                </div>
              )}

              {/* ====================================================
                  RENDERIZAÇÃO DAS PÁGINAS 2 A 5: TABELAS COMERCIAIS
                 ==================================================== */}
              {currentPage >= 2 && (
                <div className="w-full h-full p-8 flex flex-col justify-between bg-white text-slate-900">
                  {/* Cabeçalho da Página */}
                  <div className="flex items-center justify-between pb-3 border-b-2 border-slate-900">
                    {/* Logo */}
                    <div className="flex items-center gap-2">
                      <img
                        src={config.logoUrl || FENIX_OFFICIAL_LOGO_BASE64}
                        alt="Fênix World"
                        className="h-9 object-contain"
                      />
                    </div>

                    {/* Título Central */}
                    <h2 className="text-xl font-black text-[#0f172a] uppercase tracking-wide text-center">
                      {pageTitles[currentPage]}
                    </h2>

                    {/* Badge Mês/Ano */}
                    <div className="bg-[#e0f2fe] text-[#0369a1] px-4 py-1.5 rounded-lg text-sm font-extrabold tracking-wider uppercase border border-sky-200">
                      {config.mes} {config.ano}
                    </div>
                  </div>

                  {/* Tabela de Produtos */}
                  <div className="flex-1 my-3 overflow-hidden border border-slate-300 rounded-lg">
                    <table className="w-full h-full text-left border-collapse">
                      {/* Cabeçalho das Colunas */}
                      <thead>
                        <tr className="bg-[#0b192e] text-white text-xs font-bold uppercase">
                          <th className="py-2 px-3 w-[220px] text-center border-r border-slate-700">
                            MARCA / LINHA
                          </th>
                          <th className="py-2 px-4 border-r border-slate-700">DESCRIÇÃO</th>
                          <th className="py-2 px-3 w-[120px] text-right border-r border-slate-700">
                            PREÇO
                          </th>
                          <th className="py-2 px-3 w-[60px] text-center">UN.</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-xs">
                        {currentPaginaProdutos.map((p, idx) => (
                          <tr
                            key={p.id}
                            className={`hover:bg-blue-50/50 transition-colors ${
                              idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'
                            }`}
                          >
                            {/* MARCA / LINHA */}
                            <td
                              className="py-1.5 px-2 font-bold text-center border-r border-slate-200 text-[11px] leading-tight"
                              style={{
                                backgroundColor: p.marcaCor,
                                color: p.marcaTextColor || '#ffffff',
                              }}
                            >
                              {p.marcaLinha}
                            </td>

                            {/* DESCRIÇÃO */}
                            <td className="py-1.5 px-3 border-r border-slate-200">
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                <span>{p.descricao}</span>
                                {p.promocao && (
                                  <span className="px-1.5 py-0.2 bg-red-600 text-white font-extrabold text-[9px] rounded uppercase">
                                    {p.promocaoTexto || 'PROMOÇÃO'}
                                  </span>
                                )}
                              </div>
                              {p.subDescricao && (
                                <p className="text-[10px] text-slate-500 italic mt-0.5">
                                  {p.subDescricao}
                                </p>
                              )}
                            </td>

                            {/* PREÇO */}
                            <td className="py-1.5 px-3 text-right font-extrabold text-slate-900 border-r border-slate-200 whitespace-nowrap">
                              R${' '}
                              {p.preco.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </td>

                            {/* UNIDADE */}
                            <td className="py-1.5 px-2 text-center font-bold text-slate-600">
                              {p.unidade}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Faixa Oficial de Observações (Especialmente Página 5) */}
                  {currentPage === 5 && config.observacaoRodape && (
                    <div className="p-2 border border-slate-800 rounded bg-slate-50 text-center mb-2">
                      <p className="text-[11px] font-extrabold text-slate-800 uppercase tracking-tight">
                        {config.observacaoRodape}
                      </p>
                    </div>
                  )}

                  {/* Rodapé da Página */}
                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 text-[11px] font-semibold text-slate-500">
                    <div>FÊNIX WORLD • {config.nome}</div>
                    <div>Página {currentPage - 1}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            COLUNA DIREITA: PAINEL DE PROPRIEDADES / ESTRUTURA
           ---------------------------------------------------- */}
        <div className="w-80 md:w-96 bg-[#0a1222] border-l border-slate-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              {activeTab === 'conteudo' && 'Editar Conteúdo'}
              {activeTab === 'paginas' && 'Gerenciar Páginas'}
              {activeTab === 'elementos' && 'Elementos Visuais'}
              {activeTab === 'configuracoes' && 'Configurações'}
            </h4>
            <span className="text-[10px] text-blue-400 font-bold bg-blue-500/10 px-2 py-0.5 rounded uppercase">
              Página {currentPage}
            </span>
          </div>

          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {/* ====================================================
                ABA 1: EDITAR CONTEÚDO (Mês/Ano, Produtos, Preços)
               ==================================================== */}
            {activeTab === 'conteudo' && (
              <div className="space-y-4 text-xs">
                {/* Vigência Mês e Ano */}
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-3">
                  <p className="font-bold text-white flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-400" />
                    Vigência Comercial da Tabela
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Mês</label>
                      <input
                        type="text"
                        value={config.mes}
                        onChange={(e) => {
                          recordHistory();
                          setConfig({ ...config, mes: e.target.value });
                        }}
                        className="w-full bg-[#0a1222] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        placeholder="Ex: Setembro"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Ano</label>
                      <input
                        type="text"
                        value={config.ano}
                        onChange={(e) => {
                          recordHistory();
                          setConfig({ ...config, ano: e.target.value });
                        }}
                        className="w-full bg-[#0a1222] border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                        placeholder="Ex: 2026"
                      />
                    </div>
                  </div>
                </div>

                {/* Sincronização de Preços do CRM */}
                <div className="p-3 bg-linear-to-br from-blue-950/40 to-indigo-950/40 border border-blue-500/30 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sky-300 flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      Preços & Vínculo CRM
                    </span>
                    <button
                      onClick={handleAtualizarPrecosVinculados}
                      className="px-2 py-1 bg-sky-500 hover:bg-sky-400 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RefreshCw className="w-3 h-3" />
                      <span>Atualizar Preços</span>
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-300 leading-relaxed">
                    Você pode alterar os preços manualmente nesta tabela sem afetar os preços
                    principais no CRM. Clicar em "Atualizar Preços" busca os valores atualizados do CRM.
                  </p>
                </div>

                {/* Produtos da Página Atual */}
                {currentPage >= 2 ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="font-bold text-slate-200 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-emerald-400" />
                        Produtos da Página ({currentPaginaProdutos.length})
                      </label>
                      <button
                        onClick={() => {
                          setEditingProduto(null);
                          setIsProdutoModalOpen(true);
                        }}
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Novo Produto</span>
                      </button>
                    </div>

                    <div className="space-y-1.5 max-h-[380px] overflow-y-auto pr-1">
                      {currentPaginaProdutos.map((p) => (
                        <div
                          key={p.id}
                          className="p-2.5 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl flex items-center justify-between gap-2 transition-all"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span
                                className="px-1.5 py-0.5 rounded text-[9px] font-bold truncate max-w-[90px]"
                                style={{
                                  backgroundColor: p.marcaCor,
                                  color: p.marcaTextColor || '#ffffff',
                                }}
                              >
                                {p.marcaLinha}
                              </span>
                              <span className="font-bold text-white text-xs truncate">
                                {p.descricao}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-400">
                              <span className="font-mono text-emerald-400 font-bold">
                                R$ {p.preco.toFixed(2)}
                              </span>
                              <span>•</span>
                              <span>{p.unidade}</span>
                              {p.promocao && (
                                <>
                                  <span>•</span>
                                  <span className="text-red-400 font-bold">PROMOÇÃO</span>
                                </>
                              )}
                              {p.isPrecoManual && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-400 font-bold">Preço Manual</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Ações do Produto */}
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => handleMoveProduto(p.id, 'up')}
                              className="p-1 text-slate-400 hover:text-white rounded"
                              title="Subir"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveProduto(p.id, 'down')}
                              className="p-1 text-slate-400 hover:text-white rounded"
                              title="Descer"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDuplicateProduto(p)}
                              className="p-1 text-slate-400 hover:text-emerald-400 rounded"
                              title="Duplicar"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => {
                                setEditingProduto(p);
                                setIsProdutoModalOpen(true);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-400 rounded"
                              title="Editar"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteProduto(p.id)}
                              className="p-1 text-slate-400 hover:text-red-400 rounded"
                              title="Excluir"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  // Página 1 (Capa)
                  <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                    <p className="font-bold text-white">Textos da Capa</p>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Subtítulo 1</label>
                      <input
                        type="text"
                        value={config.subtituloCapa1}
                        onChange={(e) => {
                          recordHistory();
                          setConfig({ ...config, subtituloCapa1: e.target.value });
                        }}
                        className="w-full bg-[#0a1222] border border-slate-700 rounded-lg p-2 text-xs text-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-400 block mb-1">Subtítulo 2</label>
                      <input
                        type="text"
                        value={config.subtituloCapa2}
                        onChange={(e) => {
                          recordHistory();
                          setConfig({ ...config, subtituloCapa2: e.target.value });
                        }}
                        className="w-full bg-[#0a1222] border border-slate-700 rounded-lg p-2 text-xs text-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ====================================================
                ABA 2: PÁGINAS (Adicionar, Duplicar, Reordenar)
               ==================================================== */}
            {activeTab === 'paginas' && (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <p className="font-bold text-white">5 Páginas Oficiais do PDF</p>
                  <p className="text-[11px] text-slate-400">
                    O PDF original possui 5 páginas em formato Paisagem Widescreen. As proporções e
                    resolução são mantidas intactas.
                  </p>
                </div>

                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map((num) => (
                    <div
                      key={num}
                      onClick={() => setCurrentPage(num)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition-all cursor-pointer ${
                        currentPage === num
                          ? 'border-[#0055ff] bg-[#0055ff]/10 text-white'
                          : 'border-slate-800 bg-[#121c2e] text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-slate-700 flex items-center justify-center text-[10px] font-bold">
                          {num}
                        </span>
                        <div>
                          <p className="font-bold text-xs">{pageTitles[num]}</p>
                          <p className="text-[10px] text-slate-400">
                            {num === 1
                              ? 'Capa com logos de parceiros'
                              : `${produtos.filter((p) => p.paginaNumero === num).length} produtos`}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ====================================================
                ABA 3: ELEMENTOS VISUAIS (Logos, Imagens, Cores)
               ==================================================== */}
            {activeTab === 'elementos' && (
              <div className="space-y-3 text-xs">
                {/* LOGO OFICIAL */}
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <Palette className="w-3.5 h-3.5 text-blue-400" />
                      Logo Oficial da Tabela
                    </p>
                    {config.logoUrl && config.logoUrl !== FENIX_OFFICIAL_LOGO_BASE64 && (
                      <button
                        onClick={() => {
                          recordHistory();
                          setConfig({ ...config, logoUrl: FENIX_OFFICIAL_LOGO_BASE64 });
                          showToast('Logo oficial restaurado!');
                        }}
                        className="text-[10px] text-sky-400 hover:underline cursor-pointer"
                      >
                        Restaurar Padrão
                      </button>
                    )}
                  </div>
                  <div className="p-3 bg-white/5 rounded-lg flex items-center justify-center border border-slate-700/60">
                    <img
                      src={config.logoUrl || FENIX_OFFICIAL_LOGO_BASE64}
                      alt="Logo"
                      className="h-10 object-contain"
                    />
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        recordHistory();
                        setConfig({ ...config, logoUrl: reader.result as string });
                        showToast('Logo substituído com sucesso!');
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Substituir Logo</span>
                  </button>
                </div>

                {/* FOTO DE CAPA */}
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-bold text-white flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-400" />
                      Foto de Capa (Ambiente)
                    </p>
                    {config.capaFotoUrl && (
                      <button
                        onClick={() => {
                          recordHistory();
                          setConfig({ ...config, capaFotoUrl: undefined });
                          showToast('Foto de capa padrão restaurada!');
                        }}
                        className="text-[10px] text-sky-400 hover:underline cursor-pointer"
                      >
                        Restaurar Padrão
                      </button>
                    )}
                  </div>
                  <div className="w-full h-24 rounded-lg overflow-hidden border border-slate-700/60 relative bg-slate-900">
                    <img
                      src={config.capaFotoUrl || 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=600&auto=format&fit=crop'}
                      alt="Capa"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <input
                    type="file"
                    ref={coverInputRef}
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        recordHistory();
                        setConfig({ ...config, capaFotoUrl: reader.result as string });
                        showToast('Foto de capa atualizada!');
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <button
                    onClick={() => coverInputRef.current?.click()}
                    className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Substituir Foto da Capa</span>
                  </button>
                </div>

                {/* MARCAS PARCEIRAS */}
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <p className="font-bold text-white">Marcas Parceiras da Capa</p>
                  <p className="text-[11px] text-slate-400">
                    flexfloor, FORTALEZA, HD FLEX, NEXA, VinilForte, Pix e Tarkett.
                  </p>
                </div>
              </div>
            )}

            {/* ====================================================
                ABA 4: CONFIGURAÇÕES (Autosave, Cópia, Restaurar)
               ==================================================== */}
            {activeTab === 'configuracoes' && (
              <div className="space-y-3 text-xs">
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <p className="font-bold text-white">Tipo de Tabela Comercial</p>
                  <select
                    value={config.tipoTabela}
                    onChange={(e) => {
                      recordHistory();
                      setConfig({
                        ...config,
                        tipoTabela: e.target.value as any,
                      });
                    }}
                    className="w-full bg-[#0a1222] border border-slate-700 rounded-lg p-2 text-xs text-white"
                  >
                    <option value="Revenda">Tabela de Revenda (Padrão)</option>
                    <option value="Construtora">Tabela Construtora</option>
                    <option value="Distribuidor">Tabela Distribuidor</option>
                    <option value="Geral">Tabela Geral</option>
                  </select>
                </div>

                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <p className="font-bold text-white">Observação Oficial de Rodapé</p>
                  <textarea
                    value={config.observacaoRodape}
                    onChange={(e) => {
                      recordHistory();
                      setConfig({ ...config, observacaoRodape: e.target.value });
                    }}
                    rows={3}
                    className="w-full bg-[#0a1222] border border-slate-700 rounded-lg p-2 text-xs text-white resize-none"
                  />
                </div>

                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl space-y-2">
                  <p className="font-bold text-red-300">Restaurar Modelo de Fábrica</p>
                  <p className="text-[11px] text-slate-400">
                    Retorna ao estado original com os 57 produtos fiéis ao PDF "TABELA REVENDA SETEMBRO.pdf".
                  </p>
                  <button
                    onClick={handleRestaurarOriginal}
                    className="w-full py-2 bg-red-600/30 hover:bg-red-600 text-red-200 hover:text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    Restaurar Original
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====================================================
          MODAL DE SALVAR COMO CÓPIA (Ex: Tabela Construtora)
         ==================================================== */}
      {isCopiaModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-[#0e172a] border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CopyPlus className="w-4 h-4 text-emerald-400" />
                Salvar como Cópia Independente
              </h3>
              <button
                onClick={() => setIsCopiaModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Cria uma nova tabela comercial independente (ex: <b>Tabela Construtora</b>). A cópia
              não altera a tabela original.
            </p>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Nome da Nova Tabela
              </label>
              <input
                type="text"
                value={copiaNome}
                onChange={(e) => setCopiaNome(e.target.value)}
                className="w-full bg-[#121c2e] border border-slate-700 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                placeholder="Ex: Tabela Construtora"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setIsCopiaModalOpen(false)}
                className="px-3 py-2 text-xs font-bold text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={handleSalvarComoCopia}
                disabled={isCopying}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                {isCopying ? 'Criando Cópia...' : 'Confirmar e Salvar Cópia'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================
          MODAL DE ADICIONAR / EDITAR PRODUTO NA TABELA
         ==================================================== */}
      {isProdutoModalOpen && (
        <ProdutoEditModal
          isOpen={isProdutoModalOpen}
          produto={editingProduto}
          paginaNumero={currentPage}
          onClose={() => {
            setIsProdutoModalOpen(false);
            setEditingProduto(null);
          }}
          onSave={handleAddOrEditProduto}
        />
      )}
    </div>
  );
};

interface ProdutoEditModalProps {
  isOpen: boolean;
  produto: TabelaLinhaProduto | null;
  paginaNumero: number;
  onClose: () => void;
  onSave: (data: Partial<TabelaLinhaProduto>) => void;
}

const ProdutoEditModal: React.FC<ProdutoEditModalProps> = ({
  isOpen,
  produto,
  paginaNumero,
  onClose,
  onSave,
}) => {
  const [marcaLinha, setMarcaLinha] = useState(produto?.marcaLinha || 'FLEXFLOOR');
  const [marcaCor, setMarcaCor] = useState(produto?.marcaCor || '#b91c1c');
  const [descricao, setDescricao] = useState(produto?.descricao || '');
  const [subDescricao, setSubDescricao] = useState(produto?.subDescricao || '');
  const [preco, setPreco] = useState(produto ? String(produto.preco) : '0.00');
  const [unidade, setUnidade] = useState(produto?.unidade || 'm²');
  const [promocao, setPromocao] = useState(Boolean(produto?.promocao));
  const [promocaoTexto, setPromocaoTexto] = useState(produto?.promocaoTexto || 'PROMOÇÃO');
  const [isPrecoManual, setIsPrecoManual] = useState(Boolean(produto?.isPrecoManual));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 text-slate-100">
      <div className="w-full max-w-lg bg-[#0e172a] border border-slate-700 rounded-2xl p-5 shadow-2xl space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-400" />
            {produto ? 'Editar Produto da Tabela' : 'Adicionar Novo Produto'}
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-400 font-semibold block mb-1">
              Marca / Linha
            </label>
            <input
              type="text"
              value={marcaLinha}
              onChange={(e) => setMarcaLinha(e.target.value)}
              className="w-full bg-[#121c2e] border border-slate-700 rounded-lg p-2 text-xs text-white"
              placeholder="Ex: VINILFORTE"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 font-semibold block mb-1">
              Cor da Marca
            </label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={marcaCor}
                onChange={(e) => setMarcaCor(e.target.value)}
                className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
              />
              <span className="font-mono text-slate-400">{marcaCor}</span>
            </div>
          </div>
        </div>

        <div>
          <label className="text-[11px] text-slate-400 font-semibold block mb-1">
            Descrição do Produto
          </label>
          <input
            type="text"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            className="w-full bg-[#121c2e] border border-slate-700 rounded-lg p-2 text-xs text-white"
            placeholder="Ex: Piso VINILFORTE 2mm (capa 0,20mm)"
          />
        </div>

        <div>
          <label className="text-[11px] text-slate-400 font-semibold block mb-1">
            Sub-descrição / Observações de Cores (Opcional)
          </label>
          <input
            type="text"
            value={subDescricao}
            onChange={(e) => setSubDescricao(e.target.value)}
            className="w-full bg-[#121c2e] border border-slate-700 rounded-lg p-2 text-xs text-white"
            placeholder="Ex: Cor em estoque: Vicens, Louvre..."
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] text-slate-400 font-semibold block mb-1">
              Preço (R$)
            </label>
            <input
              type="number"
              step="0.01"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              className="w-full bg-[#121c2e] border border-slate-700 rounded-lg p-2 text-xs text-white font-mono"
            />
          </div>

          <div>
            <label className="text-[11px] text-slate-400 font-semibold block mb-1">Unidade</label>
            <select
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className="w-full bg-[#121c2e] border border-slate-700 rounded-lg p-2 text-xs text-white"
            >
              <option value="m²">m²</option>
              <option value="BR">BR (Barra)</option>
              <option value="UN">UN (Unidade)</option>
              <option value="ml">ml (Metro Linear)</option>
              <option value="m">m (Metro)</option>
            </select>
          </div>
        </div>

        {/* Promoção Switch */}
        <div className="p-2.5 bg-[#121c2e] border border-slate-700 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-slate-200">Destacar como Promoção</label>
            <input
              type="checkbox"
              checked={promocao}
              onChange={(e) => setPromocao(e.target.checked)}
              className="w-4 h-4 rounded text-red-600 focus:ring-0 cursor-pointer"
            />
          </div>
          {promocao && (
            <input
              type="text"
              value={promocaoTexto}
              onChange={(e) => setPromocaoTexto(e.target.value)}
              className="w-full bg-[#0a1222] border border-slate-700 rounded-lg p-1.5 text-xs text-white"
              placeholder="Texto do badge (Ex: PROMOÇÃO)"
            />
          )}
        </div>

        {/* Preço Manual Switch */}
        <div className="p-2.5 bg-[#121c2e] border border-slate-700 rounded-xl flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-200">Preço Manual (Não sobrescrever via CRM)</p>
            <p className="text-[10px] text-slate-400">
              Não altera o CRM e preserva seu valor na sincronização.
            </p>
          </div>
          <input
            type="checkbox"
            checked={isPrecoManual}
            onChange={(e) => setIsPrecoManual(e.target.checked)}
            className="w-4 h-4 rounded text-blue-600 focus:ring-0 cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-slate-400 hover:text-white font-semibold"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              onSave({
                marcaLinha,
                marcaCor,
                descricao,
                subDescricao,
                preco: parseFloat(preco) || 0,
                unidade,
                promocao,
                promocaoTexto,
                isPrecoManual,
              });
            }}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold transition-colors"
          >
            Salvar Produto
          </button>
        </div>
      </div>
    </div>
  );
};
