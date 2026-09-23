import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Home,
  BookOpen,
  FileText,
  Layers,
  Star,
  Search,
  X,
  Filter,
  ChevronDown,
  Plus,
  Pencil,
  Trash2,
  Copy,
  Share2,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  MoreVertical,
  FolderCog,
  FilePlus,
  CopyPlus,
  FolderSymlink,
  Edit3,
  Calendar,
  User,
  ExternalLink,
  Play,
  Upload,
  Package,
} from 'lucide-react';
import {
  DocumentoCategoria,
  DocumentoItem,
  CatalogoItem,
  ClientRecord,
} from '../types';
import {
  getDocumentosCategorias,
  getCatalogoCategorias,
  getDocumentoCategoriasOnly,
  fetchCatalogosFromDatabase,
  fetchDocumentosFromDatabase,
  fetchDocumentosCategoriasFromDatabase,
  getCatalogos,
  saveCatalogoAsync,
  updateCatalogoAsync,
  deleteCatalogoAsync,
  duplicateCatalogoAsync,
  toggleCatalogoFavorite,
  renameCatalogo,
  changeCatalogoCategoria,
  getDocumentos,
  saveDocumentoAsync,
  updateDocumentoCategoriaAsync,
  deleteDocumentoAsync,
  duplicateDocumentoAsync,
  toggleDocumentoFavorite,
  renameDocumentoAsync,
  changeDocumentoCategoriaAsync,
  createBlankDocumento,
  getFileFormatLabel,
} from '../utils/documentosService';
import {
  downloadPdfFile,
  copyPdfToClipboard,
} from '../utils/pdfStorageService';
import { CatalogoModal } from './documentos/CatalogoModal';
import { NovoDocumentoModal } from './documentos/NovoDocumentoModal';
import { GerenciarCategoriasModal } from './documentos/GerenciarCategoriasModal';
import { DocumentoViewerModal } from './documentos/DocumentoViewerModal';
import { DocumentoEditorModal } from './documentos/DocumentoEditorModal';
import { DocumentoEnvioModal } from './documentos/DocumentoEnvioModal';
import { RenameModal } from './documentos/RenameModal';
import { AlterarCategoriaModal } from './documentos/AlterarCategoriaModal';
import { CopiarPdfFallbackModal } from './documentos/CopiarPdfFallbackModal';
import { ModeloCamposEditorModal } from './documentos/ModeloCamposEditorModal';
import { UsarModeloModal } from './documentos/UsarModeloModal';
import { ImportarPdfModeloModal } from './documentos/ImportarPdfModeloModal';
import { TabelaComercialEditorModal } from './documentos/TabelaComercialEditorModal';
import { getInitialTabelaRevendaDoc } from '../data/tabelaRevendaModel';

interface DocumentosScreenProps {
  currentUserName: string;
  onBackToCadastro?: () => void;
  onNavigateTab?: (tab: string) => void;
}

export type AreaInterna = 'catalogos' | 'documentos' | 'modelos' | 'favoritos';

export const DocumentosScreen: React.FC<DocumentosScreenProps> = ({
  currentUserName,
  onNavigateTab,
}) => {
  // 4 Áreas Internas
  const [activeArea, setActiveArea] = useState<AreaInterna>('catalogos');

  // Filtros e busca
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoriaId, setSelectedCategoriaId] = useState<string>('todas');
  const [isCategoriaDropdownOpen, setIsCategoriaDropdownOpen] = useState(false);
  const categoriaDropdownRef = useRef<HTMLDivElement>(null);

  // Coleções de dados
  const [categorias, setCategorias] = useState<DocumentoCategoria[]>([]);
  const [catalogos, setCatalogos] = useState<CatalogoItem[]>([]);
  const [documentos, setDocumentos] = useState<DocumentoItem[]>([]);
  const [clients, setClients] = useState<ClientRecord[]>([]);

  // Modais principais
  const [isCatalogoModalOpen, setIsCatalogoModalOpen] = useState(false);
  const [catalogoToEdit, setCatalogoToEdit] = useState<CatalogoItem | null>(null);

  const [isDocumentoModalOpen, setIsDocumentoModalOpen] = useState(false);
  const [documentoToEdit, setDocumentoToEdit] = useState<DocumentoItem | null>(null);

  const [isGerenciarCategoriasOpen, setIsGerenciarCategoriasOpen] = useState(false);

  // Modais de ações específicas
  const [viewerItem, setViewerItem] = useState<CatalogoItem | DocumentoItem | null>(null);
  const [isViewerOpen, setIsViewerOpen] = useState(false);

  const [editorDoc, setEditorDoc] = useState<DocumentoItem | null>(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  const [envioDoc, setEnvioDoc] = useState<DocumentoItem | null>(null);
  const [isEnvioOpen, setIsEnvioOpen] = useState(false);

  // Modais de Modelos Editáveis
  const [modeloParaEditar, setModeloParaEditar] = useState<DocumentoItem | null>(null);
  const [isModeloEditorOpen, setIsModeloEditorOpen] = useState(false);
  const [modeloParaUsar, setModeloParaUsar] = useState<DocumentoItem | null>(null);
  const [isUsarModeloOpen, setIsUsarModeloOpen] = useState(false);
  const [isImportarPdfModeloOpen, setIsImportarPdfModeloOpen] = useState(false);

  // Modal da Tabela Comercial Editável (Prompt 4 - Tabela de Revenda)
  const [tabelaParaEditar, setTabelaParaEditar] = useState<DocumentoItem | null>(null);
  const [isTabelaEditorOpen, setIsTabelaEditorOpen] = useState(false);

  // Modais auxiliares: Renomear, Alterar Categoria, Fallback de Cópia
  const [renameTarget, setRenameTarget] = useState<{
    item: CatalogoItem | DocumentoItem;
    tipo: 'catalogo' | 'documento';
  } | null>(null);

  const [alterarCatTarget, setAlterarCatTarget] = useState<{
    item: CatalogoItem | DocumentoItem;
    tipo: 'catalogo' | 'documento';
  } | null>(null);

  const [copyFallbackTarget, setCopyFallbackTarget] = useState<{
    item: CatalogoItem | DocumentoItem;
  } | null>(null);

  // Feedback e Toasts
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Carregar dados (Local imediato + Supabase persistente)
  const reloadData = async () => {
    // 1. Carga imediata local
    setCategorias(getDocumentosCategorias());
    setCatalogos(getCatalogos());
    setDocumentos(getDocumentos());

    // Carregar clientes do CRM para menções/autocompletar/envio
    try {
      const storedClients = localStorage.getItem('fenix_clients');
      if (storedClients) {
        setClients(JSON.parse(storedClients));
      }
    } catch (e) {
      console.error('Erro ao ler clientes:', e);
    }

    // 2. Consulta em segundo plano no Supabase para garantir sincronização entre dispositivos
    try {
      const [remoteCats, remoteDocs, remoteCatDefs] = await Promise.all([
        fetchCatalogosFromDatabase(),
        fetchDocumentosFromDatabase(),
        fetchDocumentosCategoriasFromDatabase(),
      ]);
      setCatalogos(remoteCats);
      setDocumentos(remoteDocs);
      setCategorias(remoteCatDefs);
    } catch (err) {
      console.warn('Sincronização remota Supabase:', err);
    }
  };

  useEffect(() => {
    reloadData();

    const handleSyncEvent = () => {
      reloadData();
    };

    window.addEventListener('fenix_catalogos_items_updated', handleSyncEvent);
    window.addEventListener('fenix_documentos_items_updated', handleSyncEvent);
    window.addEventListener('fenix_documentos_updated', handleSyncEvent);
    window.addEventListener('fenix_documentos_categorias_updated', handleSyncEvent);
    window.addEventListener('fenix_supabase_synced', handleSyncEvent);
    window.addEventListener('storage', handleSyncEvent);

    return () => {
      window.removeEventListener('fenix_catalogos_items_updated', handleSyncEvent);
      window.removeEventListener('fenix_documentos_items_updated', handleSyncEvent);
      window.removeEventListener('fenix_documentos_updated', handleSyncEvent);
      window.removeEventListener('fenix_documentos_categorias_updated', handleSyncEvent);
      window.removeEventListener('fenix_supabase_synced', handleSyncEvent);
      window.removeEventListener('storage', handleSyncEvent);
    };
  }, []);

  // Fechar dropdowns ao clicar fora
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        categoriaDropdownRef.current &&
        !categoriaDropdownRef.current.contains(e.target as Node)
      ) {
        setIsCategoriaDropdownOpen(false);
      }
      setActiveMenuId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Categorias válidas e estáveis por aba (Memoizadas para evitar re-render resets)
  const catalogoCategoriasMemo = useMemo(() => {
    return categorias.filter((c) => c.tipo === 'catalogo' || !c.tipo);
  }, [categorias]);

  const documentoCategoriasMemo = useMemo(() => {
    return categorias.filter((c) => c.tipo === 'documento' || !c.tipo);
  }, [categorias]);

  const currentTabCategories =
    activeArea === 'catalogos'
      ? catalogoCategoriasMemo
      : documentoCategoriasMemo;

  // Filtragem de Catálogos
  const filteredCatalogos = catalogos.filter((cat) => {
    const matchSearch =
      searchTerm === '' ||
      cat.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (cat.categoriaNome && cat.categoriaNome.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (cat.descricao && cat.descricao.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchCategory =
      selectedCategoriaId === 'todas' || cat.categoriaId === selectedCategoriaId;

    return matchSearch && matchCategory;
  });

  // Filtragem de Documentos Normais (não modelos)
  const filteredDocumentos = documentos
    .filter((doc) => !doc.isModelo)
    .filter((doc) => {
      const matchSearch =
        searchTerm === '' ||
        doc.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc.categoriaNome && doc.categoriaNome.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (doc.descricao && doc.descricao.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory =
        selectedCategoriaId === 'todas' || doc.categoriaId === selectedCategoriaId;

      return matchSearch && matchCategory;
    });

  // Filtragem de Modelos Editáveis (isModelo = true)
  const filteredModelos = documentos
    .filter((doc) => Boolean(doc.isModelo))
    .filter((doc) => {
      const matchSearch =
        searchTerm === '' ||
        doc.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (doc.categoriaNome && doc.categoriaNome.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (doc.descricao && doc.descricao.toLowerCase().includes(searchTerm.toLowerCase()));

      const matchCategory =
        selectedCategoriaId === 'todas' || doc.categoriaId === selectedCategoriaId;

      return matchSearch && matchCategory;
    });

  // Filtragem de Favoritos (Catálogos + Documentos favoritados)
  const favoritedCatalogos = catalogos.filter((c) => c.isFavorite);
  const favoritedDocumentos = documentos.filter((d) => d.isFavorite);
  const allFavoritos = [
    ...favoritedCatalogos.map((c) => ({ ...c, _origem: 'catalogo' as const })),
    ...favoritedDocumentos.map((d) => ({
      ...d,
      _origem: d.isModelo ? ('modelo' as const) : ('documento' as const),
    })),
  ].filter((item) => {
    if (!searchTerm) return true;
    return (
      item.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.categoriaNome && item.categoriaNome.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  });

  // Ações de itens
  const handleToggleFavorite = async (
    item: CatalogoItem | DocumentoItem,
    tipo: 'catalogo' | 'documento'
  ) => {
    if (tipo === 'catalogo') {
      await toggleCatalogoFavorite(item.id, currentUserName);
    } else {
      await toggleDocumentoFavorite(item.id, currentUserName);
    }
    reloadData();
    showToast(item.isFavorite ? 'Removido dos favoritos.' : 'Adicionado aos favoritos!');
  };

  const handleDuplicate = async (
    item: CatalogoItem | DocumentoItem,
    tipo: 'catalogo' | 'documento'
  ) => {
    if (tipo === 'catalogo') {
      await duplicateCatalogoAsync(item.id, currentUserName);
      showToast(`Cópia criada com sucesso!`);
    } else {
      await duplicateDocumentoAsync(item.id, currentUserName);
      showToast(`Cópia criada com sucesso!`);
    }
    reloadData();
  };

  const handleDelete = async (
    item: CatalogoItem | DocumentoItem,
    tipo: 'catalogo' | 'documento'
  ) => {
    const confirmMsg = `Tem certeza que deseja excluir "${item.titulo}" permanentemente?`;
    if (!window.confirm(confirmMsg)) return;

    if (tipo === 'catalogo') {
      await deleteCatalogoAsync(item.id, currentUserName);
    } else {
      await deleteDocumentoAsync(item.id, currentUserName);
    }
    reloadData();
    showToast(`"${item.titulo}" excluído.`);
  };

  const handleCopyPdf = async (item: CatalogoItem | DocumentoItem) => {
    const fileName =
      ('nomeArquivo' in item && item.nomeArquivo) ||
      ('nomeArquivoOriginal' in item && item.nomeArquivoOriginal) ||
      `${item.titulo}.pdf`;

    const success = await copyPdfToClipboard(item.id, fileName);
    if (success) {
      showToast(`PDF copiado para a área de transferência!`);
    } else {
      setCopyFallbackTarget({ item });
    }
  };

  const handleOpenViewer = (item: CatalogoItem | DocumentoItem) => {
    setViewerItem(item);
    setIsViewerOpen(true);
  };

  const handleRenameConfirm = async (newTitle: string) => {
    if (!renameTarget) return;
    if (renameTarget.tipo === 'catalogo') {
      await renameCatalogo(renameTarget.item.id, newTitle, currentUserName);
    } else {
      await renameDocumentoAsync(renameTarget.item.id, newTitle, currentUserName);
    }
    reloadData();
    showToast(`Renomeado para "${newTitle}".`);
    setRenameTarget(null);
  };

  const handleAlterarCategoriaConfirm = async (newCatId: string, newCatNome: string) => {
    if (!alterarCatTarget) return;
    if (alterarCatTarget.tipo === 'catalogo') {
      await changeCatalogoCategoria(alterarCatTarget.item.id, newCatId, newCatNome, currentUserName);
    } else {
      await changeDocumentoCategoriaAsync(alterarCatTarget.item.id, newCatId, newCatNome, currentUserName);
    }
    reloadData();
    showToast(`Categoria alterada para "${newCatNome}".`);
    setAlterarCatTarget(null);
  };

  return (
    <div className="w-full px-4 sm:px-6 lg:px-8 xl:px-12 2xl:px-14 py-6 sm:py-8 space-y-6 flex-1 flex flex-col font-sans">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0052cc] text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200">
          <CheckCircle2 className="w-5 h-5 shrink-0" />
          <span className="text-xs font-bold tracking-wide">{toastMessage}</span>
        </div>
      )}

      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-xs sm:text-sm text-slate-500 font-medium">
        <button
          onClick={() => onNavigateTab && onNavigateTab('Cadastro')}
          className="hover:text-[#0052cc] flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Home className="w-4 h-4 text-slate-400" />
          <span>Início</span>
        </button>
        <span className="text-slate-400">›</span>
        <span className="text-slate-900 font-semibold">Documentos</span>
      </nav>

      {/* Header Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-1">
        <div className="flex items-start gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-50 text-[#0052cc] flex items-center justify-center flex-shrink-0 border border-blue-100/80 shadow-2xs">
            <FileText className="w-6 h-6 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#091122] tracking-tight">
                Documentos
              </h1>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-[#0052cc] border border-blue-100 uppercase tracking-wider">
                Fênix World
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-normal">
              Catálogos oficiais, documentos, modelos editáveis e arquivos da Fênix World.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => setIsGerenciarCategoriasOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs sm:text-sm font-semibold border border-slate-200/90 shadow-2xs transition-all cursor-pointer"
          >
            <FolderCog className="w-4 h-4 text-[#0052cc]" />
            <span>Gerenciar Categorias</span>
          </button>

          {activeArea === 'catalogos' && (
            <button
              onClick={() => {
                setCatalogoToEdit(null);
                setIsCatalogoModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0052cc] hover:bg-[#0047b3] text-white text-xs sm:text-sm font-semibold shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.2]" />
              <span>Novo Catálogo</span>
            </button>
          )}

          {activeArea === 'documentos' && (
            <button
              onClick={() => {
                setDocumentoToEdit(null);
                setIsDocumentoModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0052cc] hover:bg-[#0047b3] text-white text-xs sm:text-sm font-semibold shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[2.2]" />
              <span>Novo Documento</span>
            </button>
          )}

          {activeArea === 'modelos' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  const tabela =
                    documentos.find(
                      (d) =>
                        d.id === 'tabela_revenda_setembro_2026' ||
                        (d.titulo === 'Tabela de Revenda' && d.isModelo)
                    ) || getInitialTabelaRevendaDoc();
                  setTabelaParaEditar(tabela);
                  setIsTabelaEditorOpen(true);
                }}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-sky-50 hover:bg-sky-100 text-sky-700 text-xs sm:text-sm font-bold border border-sky-200 shadow-2xs transition-all cursor-pointer"
                title="Abrir editor da Tabela de Revenda Setembro 2026 (5 Páginas)"
              >
                <Package className="w-4 h-4 text-sky-600" />
                <span>Tabela de Revenda</span>
              </button>

              <button
                onClick={() => setIsImportarPdfModeloOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs sm:text-sm font-semibold border border-emerald-200 shadow-2xs transition-all cursor-pointer"
                title="Importar um PDF para criar campos editáveis sobre o documento"
              >
                <Upload className="w-4 h-4 text-emerald-600" />
                <span>Importar PDF como Modelo</span>
              </button>

              <button
                onClick={() => {
                  const blank = createBlankDocumento(
                    currentTabCategories[0]?.id || '',
                    currentTabCategories[0]?.nome || 'Modelos',
                    currentUserName,
                    true
                  );
                  setModeloParaEditar(blank);
                  setIsModeloEditorOpen(true);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#0052cc] hover:bg-[#0047b3] text-white text-xs sm:text-sm font-semibold shadow-sm shadow-blue-600/25 transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.2]" />
                <span>Criar Modelo</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar select-none">
        {/* Tab 1: Catálogos */}
        <button
          onClick={() => {
            setActiveArea('catalogos');
            setSelectedCategoriaId('todas');
          }}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeArea === 'catalogos'
              ? 'bg-[#0052cc] text-white shadow-sm shadow-blue-600/20'
              : 'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs'
          }`}
        >
          <BookOpen className={`w-4 h-4 ${activeArea === 'catalogos' ? 'text-white' : 'text-blue-600'}`} />
          <span>1. Catálogos</span>
          <span
            className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
              activeArea === 'catalogos' ? 'bg-[#003d99] text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {catalogos.length}
          </span>
        </button>

        {/* Tab 2: Documentos */}
        <button
          onClick={() => {
            setActiveArea('documentos');
            setSelectedCategoriaId('todas');
          }}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeArea === 'documentos'
              ? 'bg-[#0052cc] text-white shadow-sm shadow-blue-600/20'
              : 'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs'
          }`}
        >
          <FileText className={`w-4 h-4 ${activeArea === 'documentos' ? 'text-white' : 'text-[#0052cc]'}`} />
          <span>2. Documentos</span>
          <span
            className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
              activeArea === 'documentos' ? 'bg-[#003d99] text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {documentos.filter((d) => !d.isModelo).length}
          </span>
        </button>

        {/* Tab 3: Modelos Editáveis */}
        <button
          onClick={() => {
            setActiveArea('modelos');
            setSelectedCategoriaId('todas');
          }}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeArea === 'modelos'
              ? 'bg-[#0052cc] text-white shadow-sm shadow-blue-600/20'
              : 'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs'
          }`}
        >
          <Layers className={`w-4 h-4 ${activeArea === 'modelos' ? 'text-white' : 'text-purple-600'}`} />
          <span>3. Modelos Editáveis</span>
          <span
            className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
              activeArea === 'modelos' ? 'bg-[#003d99] text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {documentos.filter((d) => Boolean(d.isModelo)).length}
          </span>
        </button>

        {/* Tab 4: Favoritos */}
        <button
          onClick={() => {
            setActiveArea('favoritos');
            setSelectedCategoriaId('todas');
          }}
          className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer ${
            activeArea === 'favoritos'
              ? 'bg-[#0052cc] text-white shadow-sm shadow-blue-600/20'
              : 'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs'
          }`}
        >
          <Star className={`w-4 h-4 ${activeArea === 'favoritos' ? 'fill-white text-white' : 'fill-amber-400 text-amber-500'}`} />
          <span>4. Favoritos</span>
          <span
            className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] font-bold ${
              activeArea === 'favoritos' ? 'bg-[#003d99] text-white' : 'bg-slate-100 text-slate-600'
            }`}
          >
            {favoritedCatalogos.length + favoritedDocumentos.length}
          </span>
        </button>
      </div>

      {/* Card de Busca e Filtros */}
      <div className="bg-white rounded-[24px] border border-slate-200/90 shadow-[0_4px_24px_-4px_rgba(0,0,0,0.04)] p-4 sm:p-5 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder={
              activeArea === 'catalogos'
                ? 'Buscar catálogos por título, categoria...'
                : activeArea === 'documentos'
                ? 'Buscar contratos, fichas técnicas...'
                : activeArea === 'modelos'
                ? 'Buscar modelos editáveis...'
                : 'Buscar em favoritos...'
            }
            className="w-full pl-9 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-xs sm:text-sm placeholder-slate-400 focus:outline-none focus:border-[#0052cc] focus:bg-white transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter Dropdown */}
        {activeArea !== 'favoritos' && (
          <div ref={categoriaDropdownRef} className="relative">
            <button
              type="button"
              onClick={() => setIsCategoriaDropdownOpen(!isCategoriaDropdownOpen)}
              className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 flex items-center justify-between gap-3 min-w-[200px] transition-colors cursor-pointer shadow-2xs"
            >
              <div className="flex items-center gap-2 truncate">
                <Filter className="w-4 h-4 text-[#0052cc]" />
                <span className="truncate">
                  {selectedCategoriaId === 'todas'
                    ? 'Todas as Categorias'
                    : currentTabCategories.find((c) => c.id === selectedCategoriaId)?.nome ||
                      'Categoria'}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>

            {isCategoriaDropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-40 space-y-1 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    setSelectedCategoriaId('todas');
                    setIsCategoriaDropdownOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                    selectedCategoriaId === 'todas'
                      ? 'bg-[#0052cc] text-white'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <span>Todas as Categorias</span>
                </button>
                {currentTabCategories.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedCategoriaId(c.id);
                      setIsCategoriaDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-between transition-colors ${
                      selectedCategoriaId === c.id
                        ? 'bg-[#0052cc] text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: c.cor || '#0052cc' }}
                      />
                      <span className="truncate">{c.nome}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Categories Filter Chips */}
      {activeArea !== 'favoritos' && currentTabCategories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          <button
            onClick={() => setSelectedCategoriaId('todas')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategoriaId === 'todas'
                ? 'bg-[#0052cc] text-white font-bold shadow-2xs'
                : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/90 shadow-2xs'
            }`}
          >
            Todas as Categorias
          </button>
          {currentTabCategories.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedCategoriaId(c.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-2 cursor-pointer ${
                selectedCategoriaId === c.id
                  ? 'bg-[#0052cc] text-white font-bold shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border border-slate-200/90 shadow-2xs'
              }`}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: c.cor || '#0052cc' }}
              />
              <span>{c.nome}</span>
            </button>
          ))}
        </div>
      )}

      {/* Content Area 1: CATÁLOGOS */}
      {activeArea === 'catalogos' && (
        <div>
          {filteredCatalogos.length === 0 ? (
            <div className="p-12 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0052cc] border border-blue-100 flex items-center justify-center">
                <BookOpen className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Nenhum catálogo encontrado</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                {searchTerm
                  ? 'Nenhum resultado corresponde à sua pesquisa.'
                  : 'Faça o upload do seu primeiro catálogo original (PDF, DOCX, XLSX, etc.) com persistência no Supabase.'}
              </p>
              <button
                onClick={() => {
                  setCatalogoToEdit(null);
                  setIsCatalogoModalOpen(true);
                }}
                className="mt-2 px-4 py-2 text-xs font-bold text-white bg-[#0052cc] hover:bg-[#0047b3] rounded-xl flex items-center gap-2 cursor-pointer shadow-sm shadow-blue-600/25"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Novo Catálogo</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredCatalogos.map((cat) => (
                <ItemCard
                  key={cat.id}
                  item={cat}
                  tipo="catalogo"
                  activeMenuId={activeMenuId}
                  setActiveMenuId={setActiveMenuId}
                  onOpen={() => handleOpenViewer(cat)}
                  onCopy={() => handleCopyPdf(cat)}
                  onShare={() => {
                    setViewerItem(cat);
                    setIsViewerOpen(true);
                  }}
                  onEdit={() => {
                    setCatalogoToEdit(cat);
                    setIsCatalogoModalOpen(true);
                  }}
                  onDuplicate={() => handleDuplicate(cat, 'catalogo')}
                  onRename={() => setRenameTarget({ item: cat, tipo: 'catalogo' })}
                  onChangeCategory={() =>
                    setAlterarCatTarget({ item: cat, tipo: 'catalogo' })
                  }
                  onToggleFavorite={() => handleToggleFavorite(cat, 'catalogo')}
                  onDelete={() => handleDelete(cat, 'catalogo')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content Area 2: DOCUMENTOS */}
      {activeArea === 'documentos' && (
        <div>
          {filteredDocumentos.length === 0 ? (
            <div className="p-12 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 text-[#0052cc] border border-blue-100 flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Nenhum documento encontrado</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                {searchTerm
                  ? 'Nenhum resultado corresponde à sua pesquisa.'
                  : 'Faça upload de contratos, termos, manuais e fichas técnicas nos formatos suportados para armazenamento seguro.'}
              </p>
              <button
                onClick={() => {
                  setDocumentoToEdit(null);
                  setIsDocumentoModalOpen(true);
                }}
                className="mt-2 px-4 py-2 text-xs font-bold text-white bg-[#0052cc] hover:bg-[#0047b3] rounded-xl flex items-center gap-2 cursor-pointer shadow-sm shadow-blue-600/25"
              >
                <Plus className="w-4 h-4" />
                <span>Cadastrar Novo Documento</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredDocumentos.map((doc) => (
                <ItemCard
                  key={doc.id}
                  item={doc}
                  tipo="documento"
                  activeMenuId={activeMenuId}
                  setActiveMenuId={setActiveMenuId}
                  onOpen={() => handleOpenViewer(doc)}
                  onCopy={() => handleCopyPdf(doc)}
                  onShare={() => {
                    setViewerItem(doc);
                    setIsViewerOpen(true);
                  }}
                  onEdit={() => {
                    if (doc.isTabelaComercial || doc.titulo.toLowerCase().includes('tabela')) {
                      setTabelaParaEditar(doc);
                      setIsTabelaEditorOpen(true);
                    } else {
                      setDocumentoToEdit(doc);
                      setIsDocumentoModalOpen(true);
                    }
                  }}
                  onDuplicate={() => handleDuplicate(doc, 'documento')}
                  onRename={() => setRenameTarget({ item: doc, tipo: 'documento' })}
                  onChangeCategory={() =>
                    setAlterarCatTarget({ item: doc, tipo: 'documento' })
                  }
                  onToggleFavorite={() => handleToggleFavorite(doc, 'documento')}
                  onDelete={() => handleDelete(doc, 'documento')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content Area 3: MODELOS EDITÁVEIS */}
      {activeArea === 'modelos' && (
        <div>
          {filteredModelos.length === 0 ? (
            <div className="p-12 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-600 border border-purple-100 flex items-center justify-center">
                <Layers className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Nenhum modelo editável cadastrado</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Importe um documento existente ou crie um modelo com campos editáveis sobre o documento, sem alterar o arquivo original.
              </p>
              <div className="flex items-center gap-2 mt-2">
                <button
                  onClick={() => setIsImportarPdfModeloOpen(true)}
                  className="px-4 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl flex items-center gap-2 cursor-pointer shadow-2xs"
                >
                  <Upload className="w-4 h-4 text-emerald-600" />
                  <span>Importar PDF como Modelo</span>
                </button>
                <button
                  onClick={() => {
                    const blank = createBlankDocumento(
                      currentTabCategories[0]?.id || '',
                      currentTabCategories[0]?.nome || 'Modelos',
                      currentUserName,
                      true
                    );
                    setModeloParaEditar(blank);
                    setIsModeloEditorOpen(true);
                  }}
                  className="px-4 py-2 text-xs font-bold text-white bg-[#0052cc] hover:bg-[#0047b3] rounded-xl flex items-center gap-2 cursor-pointer shadow-sm shadow-blue-600/25"
                >
                  <Plus className="w-4 h-4" />
                  <span>Criar Modelo em Branco</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredModelos.map((mod) => (
                <ItemCard
                  key={mod.id}
                  item={mod}
                  tipo="documento"
                  origemBadge="Modelo"
                  activeMenuId={activeMenuId}
                  setActiveMenuId={setActiveMenuId}
                  onOpen={() => handleOpenViewer(mod)}
                  onCopy={() => handleCopyPdf(mod)}
                  onShare={() => {
                    setEnvioDoc(mod);
                    setIsEnvioOpen(true);
                  }}
                  onUseModelo={() => {
                    setModeloParaUsar(mod);
                    setIsUsarModeloOpen(true);
                  }}
                  onEdit={() => {
                    if (mod.isTabelaComercial || mod.titulo.toLowerCase().includes('tabela')) {
                      setTabelaParaEditar(mod);
                      setIsTabelaEditorOpen(true);
                    } else {
                      setModeloParaEditar(mod);
                      setIsModeloEditorOpen(true);
                    }
                  }}
                  onDuplicate={() => handleDuplicate(mod, 'documento')}
                  onRename={() => setRenameTarget({ item: mod, tipo: 'documento' })}
                  onChangeCategory={() =>
                    setAlterarCatTarget({ item: mod, tipo: 'documento' })
                  }
                  onToggleFavorite={() => handleToggleFavorite(mod, 'documento')}
                  onDelete={() => handleDelete(mod, 'documento')}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Content Area 4: FAVORITOS */}
      {activeArea === 'favoritos' && (
        <div>
          {allFavoritos.length === 0 ? (
            <div className="p-12 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-500 border border-amber-100 flex items-center justify-center">
                <Star className="w-6 h-6 fill-amber-400" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">Nenhum arquivo favoritado</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                Marque arquivos como favoritos em Catálogos ou Documentos para acesso rápido aqui, sem duplicar nem mover arquivos.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {allFavoritos.map((fav) => (
                <ItemCard
                  key={fav.id}
                  item={fav}
                  tipo={fav._origem === 'catalogo' ? 'catalogo' : 'documento'}
                  origemBadge={
                    fav._origem === 'catalogo'
                      ? 'Catálogo'
                      : fav._origem === 'modelo'
                      ? 'Modelo'
                      : 'Documento'
                  }
                  activeMenuId={activeMenuId}
                  setActiveMenuId={setActiveMenuId}
                  onOpen={() => handleOpenViewer(fav)}
                  onCopy={() => handleCopyPdf(fav)}
                  onShare={() => {
                    setViewerItem(fav);
                    setIsViewerOpen(true);
                  }}
                  onUseModelo={
                    fav._origem === 'modelo'
                      ? () => {
                          setModeloParaUsar(fav as DocumentoItem);
                          setIsUsarModeloOpen(true);
                        }
                      : undefined
                  }
                  onEdit={() => {
                    if (fav._origem === 'catalogo') {
                      setCatalogoToEdit(fav as CatalogoItem);
                      setIsCatalogoModalOpen(true);
                    } else if (fav._origem === 'modelo') {
                      const m = fav as DocumentoItem;
                      if (m.isTabelaComercial || m.titulo.toLowerCase().includes('tabela')) {
                        setTabelaParaEditar(m);
                        setIsTabelaEditorOpen(true);
                      } else {
                        setModeloParaEditar(m);
                        setIsModeloEditorOpen(true);
                      }
                    } else {
                      const d = fav as DocumentoItem;
                      if (d.isTabelaComercial || d.titulo.toLowerCase().includes('tabela')) {
                        setTabelaParaEditar(d);
                        setIsTabelaEditorOpen(true);
                      } else {
                        setDocumentoToEdit(d);
                        setIsDocumentoModalOpen(true);
                      }
                    }
                  }}
                  onDuplicate={() =>
                    handleDuplicate(fav, fav._origem === 'catalogo' ? 'catalogo' : 'documento')
                  }
                  onRename={() =>
                    setRenameTarget({
                      item: fav,
                      tipo: fav._origem === 'catalogo' ? 'catalogo' : 'documento',
                    })
                  }
                  onChangeCategory={() =>
                    setAlterarCatTarget({
                      item: fav,
                      tipo: fav._origem === 'catalogo' ? 'catalogo' : 'documento',
                    })
                  }
                  onToggleFavorite={() =>
                    handleToggleFavorite(
                      fav,
                      fav._origem === 'catalogo' ? 'catalogo' : 'documento'
                    )
                  }
                  onDelete={() =>
                    handleDelete(
                      fav,
                      fav._origem === 'catalogo' ? 'catalogo' : 'documento'
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: Novo/Editar Catálogo */}
      {isCatalogoModalOpen && (
        <CatalogoModal
          isOpen={isCatalogoModalOpen}
          catalogoToEdit={catalogoToEdit}
          categorias={catalogoCategoriasMemo}
          onClose={() => {
            setIsCatalogoModalOpen(false);
            setCatalogoToEdit(null);
          }}
          onSave={async (data, file, onProg) => {
            const res = await saveCatalogoAsync(data, file, currentUserName, onProg);
            if (res.success) {
              await reloadData();
              showToast(`Catálogo "${res.item?.titulo}" salvo no Supabase com sucesso!`);
            }
            return res;
          }}
        />
      )}

      {/* MODAL: Novo/Editar Documento */}
      {isDocumentoModalOpen && (
        <NovoDocumentoModal
          isOpen={isDocumentoModalOpen}
          documentoToEdit={documentoToEdit}
          categorias={documentoCategoriasMemo}
          onClose={() => {
            setIsDocumentoModalOpen(false);
            setDocumentoToEdit(null);
          }}
          onSave={async (data, file, onProg) => {
            const res = await saveDocumentoAsync(data, file, currentUserName, { onProgress: onProg });
            if (res.success) {
              await reloadData();
              showToast(`Documento "${res.item?.titulo}" salvo no Supabase com sucesso!`);
            }
            return res;
          }}
          onOpenEditor={(initialData) => {
            const blank = createBlankDocumento(
              initialData?.categoriaId || '',
              initialData?.categoriaNome || 'Documentos',
              currentUserName,
              false
            );
            if (initialData?.titulo) {
              blank.titulo = initialData.titulo;
            }
            setEditorDoc(blank);
            setIsEditorOpen(true);
          }}
        />
      )}

      {/* MODAL: Gerenciar Categorias */}
      {isGerenciarCategoriasOpen && (
        <GerenciarCategoriasModal
          isOpen={isGerenciarCategoriasOpen}
          tipo={activeArea === 'catalogos' ? 'catalogo' : 'documento'}
          categorias={categorias}
          currentUserName={currentUserName}
          onClose={() => setIsGerenciarCategoriasOpen(false)}
          onUpdated={() => {
            reloadData();
            showToast('Categorias atualizadas.');
          }}
        />
      )}

      {/* MODAL: Visualizador Universal */}
      {isViewerOpen && viewerItem && (
        <DocumentoViewerModal
          isOpen={isViewerOpen}
          item={viewerItem}
          clients={clients}
          currentUserName={currentUserName}
          onClose={() => {
            setIsViewerOpen(false);
            setViewerItem(null);
          }}
          onEdit={() => {
            const item = viewerItem;
            setIsViewerOpen(false);
            if (
              'isTabelaComercial' in item &&
              (item.isTabelaComercial || item.titulo.toLowerCase().includes('tabela'))
            ) {
              setTabelaParaEditar(item as DocumentoItem);
              setIsTabelaEditorOpen(true);
            } else if ('paginas' in item) {
              setEditorDoc(item as DocumentoItem);
              setIsEditorOpen(true);
            } else {
              setCatalogoToEdit(item as CatalogoItem);
              setIsCatalogoModalOpen(true);
            }
          }}
          onSend={() => {
            const item = viewerItem;
            setIsViewerOpen(false);
            if ('paginas' in item) {
              setEnvioDoc(item as DocumentoItem);
              setIsEnvioOpen(true);
            }
          }}
        />
      )}

      {/* MODAL: Editor de Documentos e Modelos */}
      {isEditorOpen && editorDoc && (
        <DocumentoEditorModal
          isOpen={isEditorOpen}
          documento={editorDoc}
          categorias={getDocumentoCategoriasOnly()}
          clients={clients}
          currentUserName={currentUserName}
          onClose={() => {
            setIsEditorOpen(false);
            setEditorDoc(null);
            reloadData();
          }}
          onSaved={(saved) => {
            setEditorDoc(saved);
            reloadData();
            showToast(`Documento "${saved.titulo}" salvo.`);
          }}
        />
      )}

      {/* MODAL: Envio de Documento */}
      {isEnvioOpen && envioDoc && (
        <DocumentoEnvioModal
          isOpen={isEnvioOpen}
          documento={envioDoc}
          clients={clients}
          currentUserName={currentUserName}
          onClose={() => {
            setIsEnvioOpen(false);
            setEnvioDoc(null);
          }}
          onEnvioSuccess={(tipo, dest) => {
            reloadData();
            showToast(`Documento enviado via ${tipo} para ${dest}!`);
          }}
        />
      )}

      {/* MODAL: Renomear */}
      {renameTarget && (
        <RenameModal
          isOpen={Boolean(renameTarget)}
          currentTitle={renameTarget.item.titulo}
          onClose={() => setRenameTarget(null)}
          onConfirm={handleRenameConfirm}
        />
      )}

      {/* MODAL: Alterar Categoria */}
      {alterarCatTarget && (
        <AlterarCategoriaModal
          isOpen={Boolean(alterarCatTarget)}
          itemTitle={alterarCatTarget.item.titulo}
          currentCatId={alterarCatTarget.item.categoriaId}
          categorias={
            alterarCatTarget.tipo === 'catalogo'
              ? getCatalogoCategorias()
              : getDocumentoCategoriasOnly()
          }
          onClose={() => setAlterarCatTarget(null)}
          onConfirm={handleAlterarCategoriaConfirm}
        />
      )}

      {/* MODAL: Fallback para Cópia de PDF */}
      {copyFallbackTarget && (
        <CopiarPdfFallbackModal
          isOpen={Boolean(copyFallbackTarget)}
          itemTitle={copyFallbackTarget.item.titulo}
          onClose={() => setCopyFallbackTarget(null)}
          onDownload={() => {
            const fileName =
              ('nomeArquivo' in copyFallbackTarget.item && copyFallbackTarget.item.nomeArquivo) ||
              ('nomeArquivoOriginal' in copyFallbackTarget.item &&
                copyFallbackTarget.item.nomeArquivoOriginal) ||
              `${copyFallbackTarget.item.titulo}.pdf`;
            downloadPdfFile(copyFallbackTarget.item.id, fileName);
            showToast('Download iniciado.');
          }}
          onShare={() => {
            setViewerItem(copyFallbackTarget.item);
            setIsViewerOpen(true);
          }}
        />
      )}

      {/* MODAL: Importar PDF como Modelo */}
      {isImportarPdfModeloOpen && (
        <ImportarPdfModeloModal
          isOpen={isImportarPdfModeloOpen}
          categorias={getDocumentoCategoriasOnly()}
          currentUserName={currentUserName}
          onClose={() => setIsImportarPdfModeloOpen(false)}
          onSuccess={(saved) => {
            setIsImportarPdfModeloOpen(false);
            reloadData();
            setModeloParaEditar(saved);
            setIsModeloEditorOpen(true);
            showToast(`PDF importado como modelo! Agora configure os campos sobre o documento.`);
          }}
        />
      )}

      {/* MODAL: Editor de Campos do Modelo sobre o PDF */}
      {isModeloEditorOpen && modeloParaEditar && (
        <ModeloCamposEditorModal
          isOpen={isModeloEditorOpen}
          modelo={modeloParaEditar}
          categorias={getDocumentoCategoriasOnly()}
          clients={clients}
          currentUserName={currentUserName}
          onClose={() => {
            setIsModeloEditorOpen(false);
            setModeloParaEditar(null);
            reloadData();
          }}
          onSaved={(saved) => {
            setModeloParaEditar(saved);
            reloadData();
            showToast(`Modelo "${saved.titulo}" e campos salvos no Supabase!`);
          }}
          onUseModelo={(mod) => {
            setIsModeloEditorOpen(false);
            setModeloParaEditar(null);
            setModeloParaUsar(mod);
            setIsUsarModeloOpen(true);
          }}
        />
      )}

      {/* MODAL: Usar Modelo */}
      {isUsarModeloOpen && modeloParaUsar && (
        <UsarModeloModal
          isOpen={isUsarModeloOpen}
          modelo={modeloParaUsar}
          clients={clients}
          currentUserName={currentUserName}
          onClose={() => {
            setIsUsarModeloOpen(false);
            setModeloParaUsar(null);
          }}
          onGeradoSucesso={(novoDoc) => {
            setIsUsarModeloOpen(false);
            setModeloParaUsar(null);
            reloadData();
            showToast(`Novo documento "${novoDoc.titulo}" gerado e salvo no Supabase! O modelo original permanece intacto.`);
            setViewerItem(novoDoc);
            setIsViewerOpen(true);
          }}
        />
      )}

      {/* MODAL: Tabela Comercial Editável (Prompt 4 - Tabela de Revenda) */}
      {isTabelaEditorOpen && tabelaParaEditar && (
        <TabelaComercialEditorModal
          isOpen={isTabelaEditorOpen}
          documento={tabelaParaEditar}
          categorias={getDocumentoCategoriasOnly()}
          currentUserName={currentUserName}
          onClose={() => {
            setIsTabelaEditorOpen(false);
            setTabelaParaEditar(null);
            reloadData();
          }}
          onSaved={(saved) => {
            setTabelaParaEditar(saved);
            reloadData();
            showToast(`Tabela Comercial "${saved.titulo}" salva com sucesso no Supabase!`);
          }}
        />
      )}
    </div>
  );
};

// ==========================================
// CARD DE ITEM REUTILIZÁVEL E COMPLETO
// ==========================================

interface ItemCardProps {
  item: CatalogoItem | DocumentoItem;
  tipo: 'catalogo' | 'documento';
  origemBadge?: string;
  activeMenuId: string | null;
  setActiveMenuId: (id: string | null) => void;
  onOpen: () => void;
  onCopy: () => void;
  onShare: () => void;
  onUseModelo?: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onChangeCategory: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

const ItemCard: React.FC<ItemCardProps> = ({
  item,
  tipo,
  origemBadge,
  activeMenuId,
  setActiveMenuId,
  onOpen,
  onCopy,
  onShare,
  onUseModelo,
  onEdit,
  onDuplicate,
  onRename,
  onChangeCategory,
  onToggleFavorite,
  onDelete,
}) => {
  const isMenuOpen = activeMenuId === item.id;
  const fileName =
    ('nomeArquivo' in item && item.nomeArquivo) ||
    ('nomeArquivoOriginal' in item && item.nomeArquivoOriginal) ||
    '';
  const size = item.tamanhoArquivo || '';
  const dateStr = item.createdAt ? new Date(item.createdAt).toLocaleDateString('pt-BR') : '';
  const formatBadge = getFileFormatLabel(fileName, item.tipoArquivo);

  return (
    <div className="bg-white hover:bg-slate-50/50 border border-slate-200/90 hover:border-slate-300 rounded-2xl p-4 transition-all duration-150 flex flex-col justify-between group shadow-[0_2px_12px_-2px_rgba(0,0,0,0.03)] hover:shadow-md">
      <div>
        {/* Card Header: Category & Favorite */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 overflow-hidden">
            {origemBadge && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 shrink-0 border border-slate-200">
                {origemBadge}
              </span>
            )}
            {'isTabelaComercial' in item && item.isTabelaComercial && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200 shrink-0">
                5 Páginas • {('mes' in item && item.mes) || 'Setembro'}
              </span>
            )}
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-blue-50 text-[#0052cc] border border-blue-100 truncate">
              {item.categoriaNome || 'Geral'}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              item.isFavorite
                ? 'text-amber-500 hover:text-amber-600'
                : 'text-slate-300 hover:text-slate-500'
            }`}
            title={item.isFavorite ? 'Remover dos Favoritos' : 'Marcar como Favorito'}
          >
            <Star
              className={`w-4 h-4 ${
                item.isFavorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'
              }`}
            />
          </button>
        </div>

        {/* Thumbnail Preview Banner */}
        <div
          onClick={onOpen}
          className="w-full h-32 rounded-xl bg-slate-100 border border-slate-200 flex flex-col items-center justify-center relative overflow-hidden group-hover:border-blue-300 transition-colors cursor-pointer mb-3"
        >
          {item.capaUrl ? (
            <img
              src={item.capaUrl}
              alt={item.titulo}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
            />
          ) : (
            <div className="flex flex-col items-center gap-1.5 text-slate-500 group-hover:text-[#0052cc] transition-colors">
              <div className="w-10 h-10 rounded-xl bg-white text-[#0052cc] border border-slate-200 flex items-center justify-center font-bold text-xs shadow-2xs">
                {formatBadge}
              </div>
              <span className="text-[10px] font-bold tracking-wider uppercase text-slate-400">
                Arquivo {formatBadge}
              </span>
            </div>
          )}

          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 backdrop-blur-[1px]">
            <span className="px-3 py-1.5 bg-[#0052cc] text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md">
              <Eye className="w-3.5 h-3.5" /> Abrir
            </span>
          </div>
        </div>

        {/* Title */}
        <h3
          onClick={onOpen}
          className="text-sm font-bold text-slate-900 group-hover:text-[#0052cc] line-clamp-2 transition-colors cursor-pointer mb-1 leading-snug"
          title={item.titulo}
        >
          {item.titulo}
        </h3>

        {/* File Meta */}
        <div className="text-[11px] text-slate-500 space-y-0.5 mb-3">
          {fileName && (
            <p className="truncate text-slate-500 font-mono text-[10px]" title={fileName}>
              {fileName}
            </p>
          )}
          <div className="flex items-center gap-2 text-[10px] text-slate-400">
            <span className="font-semibold text-slate-600">{formatBadge}</span>
            {size && <span>•</span>}
            {size && <span>{size}</span>}
            {dateStr && <span>•</span>}
            {dateStr && <span>{dateStr}</span>}
          </div>
        </div>

        {/* Botão de Destaque para Usar Modelo */}
        {onUseModelo && !('isTabelaComercial' in item && item.isTabelaComercial) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onUseModelo();
            }}
            className="w-full mb-3 py-2 px-3 bg-[#0052cc] hover:bg-[#0047b3] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/25 transition-all cursor-pointer group/btn"
            title="Abrir tela dividida para preenchimento de campos e assinatura"
          >
            <Play className="w-3.5 h-3.5 fill-white group-hover/btn:scale-110 transition-transform" />
            <span>Usar Modelo</span>
          </button>
        )}

        {/* Botão de Destaque para Tabela Comercial */}
        {'isTabelaComercial' in item && item.isTabelaComercial && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="w-full mb-3 py-2 px-3 bg-gradient-to-r from-blue-600 to-sky-600 hover:from-blue-700 hover:to-sky-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm shadow-blue-600/25 transition-all cursor-pointer group/btn"
            title="Abrir editor da Tabela Comercial com 5 páginas, produtos e preços vinculados"
          >
            <Pencil className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
            <span>Editar Tabela Comercial</span>
          </button>
        )}
      </div>

      {/* Card Actions Footer */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1">
        <div className="flex items-center gap-1">
          {/* Abrir */}
          <button
            type="button"
            onClick={onOpen}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Abrir arquivo"
          >
            <Eye className="w-4 h-4" />
          </button>

          {/* Copiar PDF */}
          <button
            type="button"
            onClick={onCopy}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Copiar link/arquivo para a área de transferência"
          >
            <Copy className="w-4 h-4" />
          </button>

          {/* Compartilhar */}
          <button
            type="button"
            onClick={onShare}
            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Compartilhar arquivo"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>

        {/* Menu Dropdown de Mais Ações */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setActiveMenuId(isMenuOpen ? null : item.id);
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="Mais Opções"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {isMenuOpen && (
            <div
              className="absolute right-0 bottom-full mb-1.5 w-52 bg-white border border-slate-200 rounded-xl shadow-xl p-1.5 z-40 text-xs space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Opção Primária se for Modelo: Usar Modelo */}
              {onUseModelo && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveMenuId(null);
                    onUseModelo();
                  }}
                  className="w-full text-left px-2.5 py-2 rounded-lg text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 flex items-center gap-2 transition-colors cursor-pointer font-bold border-b border-slate-100 mb-1"
                >
                  <Play className="w-3.5 h-3.5 fill-current text-emerald-600" />
                  <span>Usar Modelo (Preencher)</span>
                </button>
              )}

              {/* Editar */}
              <button
                type="button"
                onClick={() => {
                  setActiveMenuId(null);
                  onEdit();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5 text-blue-600" />
                <span>{origemBadge === 'Modelo' ? 'Editar Campos do Modelo' : 'Editar'}</span>
              </button>

              {/* Salvar como Cópia */}
              <button
                type="button"
                onClick={() => {
                  setActiveMenuId(null);
                  onDuplicate();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <CopyPlus className="w-3.5 h-3.5 text-emerald-600" />
                <span>Salvar como Cópia</span>
              </button>

              {/* Renomear */}
              <button
                type="button"
                onClick={() => {
                  setActiveMenuId(null);
                  onRename();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>Renomear</span>
              </button>

              {/* Alterar Categoria */}
              <button
                type="button"
                onClick={() => {
                  setActiveMenuId(null);
                  onChangeCategory();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <FolderSymlink className="w-3.5 h-3.5 text-amber-600" />
                <span>Alterar Categoria</span>
              </button>

              {/* Favoritar / Desfavoritar */}
              <button
                type="button"
                onClick={() => {
                  setActiveMenuId(null);
                  onToggleFavorite();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-slate-700 hover:text-slate-900 hover:bg-slate-100 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    item.isFavorite
                      ? 'fill-amber-400 text-amber-500'
                      : 'text-amber-500'
                  }`}
                />
                <span>{item.isFavorite ? 'Desfavoritar' : 'Favoritar'}</span>
              </button>

              <div className="border-t border-slate-100 my-1" />

              {/* Excluir */}
              <button
                type="button"
                onClick={() => {
                  setActiveMenuId(null);
                  onDelete();
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Excluir</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
