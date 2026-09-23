import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Save,
  Eye,
  History,
  Type,
  Database,
  Image as ImageIcon,
  Square,
  Minus,
  Table as TableIcon,
  Layout,
  Plus,
  Copy,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Check,
  Clock,
  Sparkles,
  RotateCcw,
  RotateCw,
  CopyPlus,
  FileSpreadsheet,
  Settings,
  Layers,
  Palette,
  FileText,
  Package,
  DollarSign,
  Calendar,
  Tag,
  ArrowUp,
  ArrowDown,
  Upload,
  RefreshCw,
  FolderOpen,
  Sliders,
  CheckCircle2,
  Info,
} from 'lucide-react';
import {
  DocumentoItem,
  DocumentoPagina,
  DocumentoElemento,
  DocumentoCategoria,
  ClientRecord,
} from '../../types';
import {
  CRM_FIELDS,
  resolveCrmTags,
  createBlankPage,
  saveDocumentoAsync,
  duplicateDocumentoAsync,
} from '../../utils/documentosService';
import { VersoesModal } from './VersoesModal';
import { DocumentoViewerModal } from './DocumentoViewerModal';

interface DocumentoEditorModalProps {
  isOpen: boolean;
  documento: DocumentoItem | null;
  categorias: DocumentoCategoria[];
  clients: ClientRecord[];
  currentUserName: string;
  onClose: () => void;
  onSaved: (savedDoc: DocumentoItem) => void;
}

// 4 Abas principais exigidas na estrutura:
// 1. 'conteudo' (Editar Conteúdo)
// 2. 'paginas' (Páginas)
// 3. 'elementos' (Elementos Visuais)
// 4. 'configuracoes' (Configurações)
type MainTab = 'conteudo' | 'paginas' | 'elementos' | 'configuracoes';

// Snapshot para Desfazer / Refazer (Undo / Redo)
interface HistoryState {
  paginas: DocumentoPagina[];
  currentPageIndex: number;
  docTitle: string;
}

export const DocumentoEditorModal: React.FC<DocumentoEditorModalProps> = ({
  isOpen,
  documento,
  categorias,
  clients,
  currentUserName,
  onClose,
  onSaved,
}) => {
  // Document state
  const [docTitle, setDocTitle] = useState('');
  const [docCategoriaId, setDocCategoriaId] = useState('');
  const [isModelo, setIsModelo] = useState(false);
  const [paginas, setPaginas] = useState<DocumentoPagina[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);

  // Backup original imutável para "Restaurar Original"
  const [initialDocSnapshot, setInitialDocSnapshot] = useState<{
    titulo: string;
    categoriaId: string;
    paginas: DocumentoPagina[];
  } | null>(null);

  // UI Structure Tabs
  const [activeTab, setActiveTab] = useState<MainTab>('conteudo');
  const [zoom, setZoom] = useState(0.85);

  // History for Desfazer / Refazer
  const [undoStack, setUndoStack] = useState<HistoryState[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryState[]>([]);

  // Autosave & Save States
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);

  // Modais auxiliares
  const [isVersoesOpen, setIsVersoesOpen] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [previewClientId, setPreviewClientId] = useState('');

  // Drag & Resize state
  const canvasRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string>('');
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [elementStartBounds, setElementStartBounds] = useState({ x: 0, y: 0, w: 0, h: 0 });

  // Input file refs
  const replacePageFileInputRef = useRef<HTMLInputElement>(null);
  const changeCapaFileInputRef = useRef<HTMLInputElement>(null);
  const uploadImageInputRef = useRef<HTMLInputElement>(null);

  // Status Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Inicialização ao abrir o modal
  useEffect(() => {
    if (documento && isOpen) {
      const initialPages =
        documento.paginas && documento.paginas.length > 0
          ? JSON.parse(JSON.stringify(documento.paginas))
          : [createBlankPage(1)];

      setDocTitle(documento.titulo || 'Novo Documento');
      setDocCategoriaId(documento.categoriaId || (categorias[0]?.id || ''));
      setIsModelo(Boolean(documento.isModelo));
      setPaginas(initialPages);
      setCurrentPageIndex(0);
      setSelectedElementId(null);
      setSaveStatus('saved');
      setUndoStack([]);
      setRedoStack([]);

      // Armazena cópia original para Restaurar Original
      setInitialDocSnapshot({
        titulo: documento.titulo || 'Novo Documento',
        categoriaId: documento.categoriaId || (categorias[0]?.id || ''),
        paginas: JSON.parse(JSON.stringify(initialPages)),
      });
    }
  }, [documento, categorias, isOpen]);

  // Página atual garantindo proporção e dimensões originais do PDF
  const currentPage: DocumentoPagina =
    paginas[currentPageIndex] || paginas[0] || createBlankPage(1);

  // Preservação do PDF: mantém dimensões e proporção original da página
  const pageWidth = currentPage.width || 794;
  const pageHeight = currentPage.height || 1123;
  const pageAspectRatio = pageWidth / pageHeight;

  // Elemento selecionado
  const selectedElement =
    currentPage?.elementos?.find((el) => el.id === selectedElementId) || null;

  // Contexto CRM para simulação ou aplicação real
  const selectedClient = clients.find((c) => c.id === previewClientId) || null;
  const crmContext = {
    client: selectedClient,
    pedido: documento?.pedidoVinculado || '#2620',
    produto: 'Piso Vinílico Fênix World',
    responsavel: currentUserName,
  };

  // Push state to undo stack before mutation
  const recordHistory = () => {
    setUndoStack((prev) => [
      ...prev.slice(-25),
      {
        paginas: JSON.parse(JSON.stringify(paginas)),
        currentPageIndex,
        docTitle,
      },
    ]);
    setRedoStack([]);
  };

  // Desfazer (Undo)
  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [
      ...prev,
      {
        paginas: JSON.parse(JSON.stringify(paginas)),
        currentPageIndex,
        docTitle,
      },
    ]);
    setPaginas(previous.paginas);
    setCurrentPageIndex(Math.min(previous.currentPageIndex, previous.paginas.length - 1));
    setDocTitle(previous.docTitle);
    setSelectedElementId(null);
    setSaveStatus('dirty');
    showToast('Ação desfeita');
  };

  // Refazer (Redo)
  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [
      ...prev,
      {
        paginas: JSON.parse(JSON.stringify(paginas)),
        currentPageIndex,
        docTitle,
      },
    ]);
    setPaginas(next.paginas);
    setCurrentPageIndex(Math.min(next.currentPageIndex, next.paginas.length - 1));
    setDocTitle(next.docTitle);
    setSelectedElementId(null);
    setSaveStatus('dirty');
    showToast('Ação refeita');
  };

  // Atualizar elementos da página atual
  const updateCurrentPageElements = (
    newElements: DocumentoElemento[],
    pushHistory = true
  ) => {
    if (pushHistory) recordHistory();
    setPaginas((prev) =>
      prev.map((p, idx) => (idx === currentPageIndex ? { ...p, elementos: newElements } : p))
    );
    setSaveStatus('dirty');
  };

  // Atualizar elemento selecionado
  const updateSelectedElement = (
    updates: Partial<DocumentoElemento>,
    pushHistory = false
  ) => {
    if (!selectedElementId) return;
    if (pushHistory) recordHistory();
    const newElements = (currentPage.elementos || []).map((el) =>
      el.id === selectedElementId ? { ...el, ...updates } : el
    );
    updateCurrentPageElements(newElements, false);
  };

  // ==========================================
  // SALVAMENTO REAL NO SUPABASE
  // ==========================================
  const executeSave = async (
    createVersion = false,
    versionDesc?: string
  ): Promise<DocumentoItem | null> => {
    if (!documento) return null;
    setIsSaving(true);
    setSaveStatus('saving');

    const selectedCat = categorias.find((c) => c.id === docCategoriaId);
    const catName = selectedCat ? selectedCat.nome : 'Geral';

    const res = await saveDocumentoAsync(
      {
        id: documento.id,
        titulo: docTitle.trim() || 'Documento Fênix',
        categoriaId: docCategoriaId,
        categoriaNome: catName,
        isModelo,
        paginas,
        totalPaginas: paginas.length,
      },
      undefined,
      currentUserName,
      { createVersion, versionDesc }
    );

    setIsSaving(false);
    if (res.success && res.item) {
      setSaveStatus('saved');
      setLastAutoSaveTime(
        new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      );
      onSaved(res.item);
      return res.item;
    } else {
      setSaveStatus('dirty');
      showToast(res.error || 'Erro ao salvar no Supabase');
      return null;
    }
  };

  // Salvar Alterações Manual
  const handleSaveManual = async () => {
    const saved = await executeSave(true, 'Salvo manualmente pelo usuário');
    if (saved) {
      showToast('Alterações salvas com sucesso no Supabase!');
    }
  };

  // Autosave: aciona a cada 40 segundos caso haja alterações
  useEffect(() => {
    if (!autoSaveEnabled || saveStatus !== 'dirty') return;
    const timer = setTimeout(() => {
      executeSave(false, 'Autosave automático').then((saved) => {
        if (saved) {
          console.log('[Autosave] Salvo no Supabase');
        }
      });
    }, 40000);
    return () => clearTimeout(timer);
  }, [autoSaveEnabled, saveStatus, paginas, docTitle, docCategoriaId]);

  // Salvar como Cópia (Novo arquivo independente no Supabase)
  const handleSaveAsCopy = async () => {
    if (!documento) return;
    setIsSaving(true);
    const copyTitle = `${docTitle.trim() || 'Documento'} (Cópia)`;
    const newDocId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const selectedCat = categorias.find((c) => c.id === docCategoriaId);

    const res = await saveDocumentoAsync(
      {
        id: newDocId,
        titulo: copyTitle,
        categoriaId: docCategoriaId,
        categoriaNome: selectedCat ? selectedCat.nome : 'Geral',
        isModelo,
        paginas: JSON.parse(JSON.stringify(paginas)),
        totalPaginas: paginas.length,
        isPdfImportado: documento.isPdfImportado,
        nomeArquivoOriginal: documento.nomeArquivoOriginal,
      },
      undefined,
      currentUserName,
      { createVersion: true, versionDesc: 'Cópia independente criada' }
    );

    setIsSaving(false);
    if (res.success && res.item) {
      showToast(`Cópia independente "${copyTitle}" salva no Supabase!`);
      onSaved(res.item);
    } else {
      showToast(res.error || 'Erro ao gerar cópia');
    }
  };

  // Restaurar Original (Reverte para o snapshot sem sobrescrever o PDF original)
  const handleRestoreOriginal = () => {
    if (!initialDocSnapshot) return;
    if (
      window.confirm(
        'Tem certeza que deseja restaurar o documento ao seu estado original ao abrir? Quaisquer alterações não salvas serão perdidas.'
      )
    ) {
      recordHistory();
      setDocTitle(initialDocSnapshot.titulo);
      setDocCategoriaId(initialDocSnapshot.categoriaId);
      setPaginas(JSON.parse(JSON.stringify(initialDocSnapshot.paginas)));
      setCurrentPageIndex(0);
      setSelectedElementId(null);
      setSaveStatus('dirty');
      showToast('Documento restaurado ao estado original.');
    }
  };

  // ==========================================
  // ELEMENTOS VISUAIS (Adicionar, Mover, Duplicar, Redimensionar)
  // ==========================================
  const addElement = (element: Omit<DocumentoElemento, 'id'>) => {
    recordHistory();
    const newId = `el_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newEl: DocumentoElemento = {
      ...element,
      id: newId,
      zIndex: (currentPage.elementos?.length || 0) + 1,
    };
    updateCurrentPageElements([...(currentPage.elementos || []), newEl], false);
    setSelectedElementId(newId);
    showToast(`Elemento "${element.tipo}" adicionado`);
  };

  const handleDuplicateSelectedElement = () => {
    if (!selectedElement) return;
    recordHistory();
    const dup: DocumentoElemento = {
      ...JSON.parse(JSON.stringify(selectedElement)),
      id: `el_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      x: Math.min(pageWidth - selectedElement.width, selectedElement.x + 20),
      y: Math.min(pageHeight - selectedElement.height, selectedElement.y + 20),
      zIndex: (currentPage.elementos?.length || 0) + 1,
    };
    updateCurrentPageElements([...currentPage.elementos, dup], false);
    setSelectedElementId(dup.id);
    showToast('Elemento duplicado');
  };

  const handleDeleteSelectedElement = () => {
    if (!selectedElementId) return;
    recordHistory();
    updateCurrentPageElements(
      currentPage.elementos.filter((el) => el.id !== selectedElementId),
      false
    );
    setSelectedElementId(null);
    showToast('Elemento removido');
  };

  // ==========================================
  // PÁGINAS (Adicionar, Excluir, Duplicar, Reordenar, Substituir, Alterar Capa)
  // ==========================================
  const handleAddPage = () => {
    recordHistory();
    const newPageNum = paginas.length + 1;
    const newP: DocumentoPagina = {
      ...createBlankPage(newPageNum),
      width: pageWidth,
      height: pageHeight,
    };
    setPaginas([...paginas, newP]);
    setCurrentPageIndex(paginas.length);
    setSelectedElementId(null);
    setSaveStatus('dirty');
    showToast(`Página ${newPageNum} adicionada`);
  };

  const handleDuplicatePage = () => {
    const cur = paginas[currentPageIndex];
    if (!cur) return;
    recordHistory();
    const dup: DocumentoPagina = {
      ...JSON.parse(JSON.stringify(cur)),
      id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      numero: paginas.length + 1,
      titulo: `${cur.titulo || 'Página'} (Cópia)`,
    };
    const newPages = [...paginas];
    newPages.splice(currentPageIndex + 1, 0, dup);
    newPages.forEach((p, i) => (p.numero = i + 1));
    setPaginas(newPages);
    setCurrentPageIndex(currentPageIndex + 1);
    setSelectedElementId(null);
    setSaveStatus('dirty');
    showToast(`Página ${currentPageIndex + 2} duplicada`);
  };

  const handleDeletePage = () => {
    if (paginas.length <= 1) {
      alert('O documento precisa conter pelo menos 1 página.');
      return;
    }
    if (window.confirm(`Tem certeza que deseja excluir a Página ${currentPageIndex + 1}?`)) {
      recordHistory();
      const filtered = paginas.filter((_, idx) => idx !== currentPageIndex);
      filtered.forEach((p, i) => (p.numero = i + 1));
      setPaginas(filtered);
      setCurrentPageIndex(Math.max(0, currentPageIndex - 1));
      setSelectedElementId(null);
      setSaveStatus('dirty');
      showToast('Página excluída');
    }
  };

  const handleMovePage = (direction: 'up' | 'down') => {
    if (direction === 'up' && currentPageIndex > 0) {
      recordHistory();
      const newPages = [...paginas];
      const temp = newPages[currentPageIndex];
      newPages[currentPageIndex] = newPages[currentPageIndex - 1];
      newPages[currentPageIndex - 1] = temp;
      newPages.forEach((p, i) => (p.numero = i + 1));
      setPaginas(newPages);
      setCurrentPageIndex(currentPageIndex - 1);
      setSaveStatus('dirty');
    } else if (direction === 'down' && currentPageIndex < paginas.length - 1) {
      recordHistory();
      const newPages = [...paginas];
      const temp = newPages[currentPageIndex];
      newPages[currentPageIndex] = newPages[currentPageIndex + 1];
      newPages[currentPageIndex + 1] = temp;
      newPages.forEach((p, i) => (p.numero = i + 1));
      setPaginas(newPages);
      setCurrentPageIndex(currentPageIndex + 1);
      setSaveStatus('dirty');
    }
  };

  // Substituir imagem de fundo / layout da página atual
  const handleReplacePageBackground = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    recordHistory();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        // Detecta dimensões originais da imagem para preservar proporção exata
        const w = img.width || 794;
        const h = img.height || 1123;
        setPaginas((prev) =>
          prev.map((p, idx) =>
            idx === currentPageIndex
              ? {
                  ...p,
                  backgroundImage: dataUrl,
                  width: w,
                  height: h,
                  orientation: w > h ? 'landscape' : 'portrait',
                }
              : p
          )
        );
        setSaveStatus('dirty');
        showToast('Fundo da página substituído mantendo proporção original');
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Alterar capa do documento (Página 1)
  const handleChangeCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    recordHistory();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPaginas((prev) =>
        prev.map((p, idx) =>
          idx === 0 ? { ...p, backgroundImage: dataUrl } : p
        )
      );
      setSaveStatus('dirty');
      showToast('Capa do documento alterada com sucesso');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ==========================================
  // TECLADO & ATALHOS
  // ==========================================
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Atalho Ctrl+Z / Ctrl+Y
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }
      // Atalho Ctrl+S
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveManual();
        return;
      }

      // Delete: somente se não estiver em campo de digitação
      if (e.key === 'Delete' && selectedElementId) {
        const active = document.activeElement as HTMLElement | null;
        const tag = (active?.tagName || '').toLowerCase();
        const isEditing =
          tag === 'input' ||
          tag === 'textarea' ||
          tag === 'select' ||
          Boolean(active?.isContentEditable) ||
          active?.getAttribute('contenteditable') === 'true';

        if (!isEditing) {
          e.preventDefault();
          handleDeleteSelectedElement();
        }
      }

      if (e.key === 'Escape') {
        setSelectedElementId(null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementId, currentPage, undoStack, redoStack, paginas, docTitle]);

  // ==========================================
  // DRAG & RESIZE CANVAS INTERACTION
  // ==========================================
  const handleMouseDownElement = (e: React.MouseEvent, elId: string) => {
    e.stopPropagation();
    setSelectedElementId(elId);
    const targetEl = currentPage.elementos?.find((x) => x.id === elId);
    if (!targetEl) return;

    setIsDragging(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setElementStartBounds({
      x: targetEl.x,
      y: targetEl.y,
      w: targetEl.width,
      h: targetEl.height,
    });
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (!selectedElementId) return;

    if (isDragging) {
      const dx = (e.clientX - dragStartPos.x) / zoom;
      const dy = (e.clientY - dragStartPos.y) / zoom;
      const newX = Math.max(0, Math.min(pageWidth - elementStartBounds.w, Math.round(elementStartBounds.x + dx)));
      const newY = Math.max(0, Math.min(pageHeight - elementStartBounds.h, Math.round(elementStartBounds.y + dy)));

      updateSelectedElement({ x: newX, y: newY }, false);
    } else if (isResizing) {
      const dx = (e.clientX - dragStartPos.x) / zoom;
      const dy = (e.clientY - dragStartPos.y) / zoom;

      let newW = elementStartBounds.w;
      let newH = elementStartBounds.h;
      let newX = elementStartBounds.x;
      let newY = elementStartBounds.y;

      if (resizeHandle.includes('e')) newW = Math.max(20, Math.round(elementStartBounds.w + dx));
      if (resizeHandle.includes('s')) newH = Math.max(15, Math.round(elementStartBounds.h + dy));
      if (resizeHandle.includes('w')) {
        const potW = elementStartBounds.w - dx;
        if (potW >= 20) {
          newW = Math.round(potW);
          newX = Math.round(elementStartBounds.x + dx);
        }
      }
      if (resizeHandle.includes('n')) {
        const potH = elementStartBounds.h - dy;
        if (potH >= 15) {
          newH = Math.round(potH);
          newY = Math.round(elementStartBounds.y + dy);
        }
      }

      updateSelectedElement({ width: newW, height: newH, x: newX, y: newY }, false);
    }
  };

  const handleMouseUpCanvas = () => {
    if (isDragging || isResizing) {
      recordHistory();
    }
    setIsDragging(false);
    setIsResizing(false);
  };

  // Helper para adicionar bloco de produto rápido
  const handleAddProductBlock = () => {
    addElement({
      tipo: 'tabela',
      x: 50,
      y: 180,
      width: Math.min(pageWidth - 100, 694),
      height: 120,
      headerBg: '#0055ff',
      headerColor: '#ffffff',
      tabelaHeaders: ['Produto', 'Descrição', 'Categoria', 'Unid', 'Preço Unitário', 'Promoção'],
      tabelaLinhas: [
        ['Piso Vinílico Flexfloor 3mm', 'Piso colado acústico premium', 'Pisos Vinílicos', 'm²', 'R$ 89,90', '10% OFF'],
        ['Rodapé Poliestireno 10cm', 'Rodapé branco naval impermeável', 'Rodapés', 'ml', 'R$ 24,50', 'Preço Especial'],
      ],
    });
  };

  // Helper para adicionar texto simples
  const handleAddTextElement = (text: string, fontSize = 16, isBold = false) => {
    addElement({
      tipo: 'texto',
      x: 60,
      y: 120 + (currentPage.elementos?.length || 0) * 20,
      width: Math.min(pageWidth - 120, 674),
      height: 45,
      conteudo: text,
      fontSize,
      fontWeight: isBold ? 'bold' : 'normal',
      color: '#0f172a',
    });
  };

  if (!isOpen || !documento) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070d19] text-slate-100 select-none overflow-hidden font-sans">
      {/* ==========================================
          1. BARRA SUPERIOR: TÍTULO, CONTROLES & AÇÕES
         ========================================== */}
      <div className="h-14 px-4 bg-[#0a1222] border-b border-slate-800 flex items-center justify-between shrink-0 z-30 shadow-md">
        {/* Lado Esquerdo: Fechar, Título do Documento, Categoria */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Fechar Editor"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 hidden sm:inline">Título:</span>
            <input
              type="text"
              value={docTitle}
              onChange={(e) => {
                setDocTitle(e.target.value);
                setSaveStatus('dirty');
              }}
              placeholder="Título do Documento..."
              className="bg-[#121c2e] border border-slate-700/80 text-sm font-bold text-white px-2.5 py-1 rounded-lg focus:outline-none focus:border-[#0055ff] max-w-[200px] md:max-w-[280px] transition-all"
            />
          </div>

          <select
            value={docCategoriaId}
            onChange={(e) => {
              setDocCategoriaId(e.target.value);
              setSaveStatus('dirty');
            }}
            className="text-xs bg-[#121c2e] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-[#0055ff]"
            title="Categoria do Documento"
          >
            {categorias.length === 0 ? (
              <option value="">Sem categoria</option>
            ) : (
              categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))
            )}
          </select>
        </div>

        {/* Centro: CONTROLES PRINCIPAIS (Desfazer, Refazer, Autosave Status, Versões) */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Desfazer */}
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
            title="Desfazer (Ctrl+Z)"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="text-xs hidden xl:inline">Desfazer</span>
          </button>

          {/* Refazer */}
          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent transition-colors flex items-center gap-1"
            title="Refazer (Ctrl+Y)"
          >
            <RotateCw className="w-4 h-4" />
            <span className="text-xs hidden xl:inline">Refazer</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden md:block" />

          {/* Status do Salvamento & Autosave */}
          <div className="text-xs flex items-center gap-1.5 px-2 py-1 bg-[#121c2e] rounded-lg border border-slate-800">
            {isSaving || saveStatus === 'saving' ? (
              <span className="text-amber-400 flex items-center gap-1 font-medium">
                <Clock className="w-3.5 h-3.5 animate-spin" /> Salvando...
              </span>
            ) : saveStatus === 'dirty' ? (
              <span className="text-amber-300 flex items-center gap-1 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" /> Alterado
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {lastAutoSaveTime ? `Salvo às ${lastAutoSaveTime}` : 'Salvo no Supabase'}
              </span>
            )}
          </div>

          {/* Histórico de Versões */}
          <button
            onClick={() => setIsVersoesOpen(true)}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-[#121c2e] hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5"
            title="Histórico de Versões do Supabase"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden lg:inline">Histórico</span>
          </button>
        </div>

        {/* Lado Direito: Restaurar Original, Salvar como Cópia, Visualizar, Salvar Alterações */}
        <div className="flex items-center gap-2">
          {/* Restaurar Original */}
          <button
            onClick={handleRestoreOriginal}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-[#121c2e] hover:bg-slate-800 border border-slate-700/60 rounded-lg transition-colors flex items-center gap-1.5"
            title="Restaurar documento ao original inicial (sem destruir o arquivo original)"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">Restaurar Original</span>
          </button>

          {/* Salvar como Cópia */}
          <button
            onClick={handleSaveAsCopy}
            disabled={isSaving}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-600 border border-emerald-500/30 rounded-lg transition-colors flex items-center gap-1.5"
            title="Cria um novo arquivo independente sem sobrescrever o PDF original"
          >
            <CopyPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Salvar como Cópia</span>
          </button>

          {/* Visualizar */}
          <button
            onClick={() => setIsViewerOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
            title="Visualização em Tela Cheia"
          >
            <Eye className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden md:inline">Visualizar</span>
          </button>

          {/* Salvar Alterações */}
          <button
            onClick={handleSaveManual}
            disabled={isSaving}
            className="px-4 py-1.5 text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0044cc] rounded-lg shadow-md shadow-[#0055ff]/25 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Salvar alterações no Supabase"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Alterações</span>
          </button>
        </div>
      </div>

      {/* ==========================================
          2. TOAST DE FEEDBACK
         ========================================== */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0055ff] text-white px-4 py-2 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <Info className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ==========================================
          3. BARRA DE SUB-ESTRUTURA (4 ÁREAS PRINCIPAIS)
         ========================================== */}
      <div className="h-10 px-4 bg-[#080f1d] border-b border-slate-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('conteudo')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
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
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'paginas'
                ? 'bg-[#0055ff] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Páginas ({paginas.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('elementos')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
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
            className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeTab === 'configuracoes'
                ? 'bg-[#0055ff] text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Configurações</span>
          </button>
        </div>

        {/* Cliente para Tags Dinâmicas */}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-slate-400 text-[11px] hidden sm:inline">Prever dados CRM:</span>
          <select
            value={previewClientId}
            onChange={(e) => setPreviewClientId(e.target.value)}
            className="bg-[#121c2e] border border-slate-700/80 rounded-lg px-2 py-0.5 text-xs text-slate-200 focus:outline-none max-w-[150px] truncate"
          >
            <option value="">Exibir Tags Padrão</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ==========================================
          4. CORPO DO EDITOR (LAYOUT 3 COLUNAS)
          - Miniaturas das páginas no lado esquerdo
          - Visualização grande do documento no centro
          - Painel de propriedades no lado direito
         ========================================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* ----------------------------------------------------
            COLUNA ESQUERDA: MINIATURAS DAS PÁGINAS (PÁGINAS)
           ---------------------------------------------------- */}
        <div className="w-56 md:w-64 bg-[#0a1222] border-r border-slate-800 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-800/80 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#0055ff]" />
              Páginas ({paginas.length})
            </h4>
            <button
              onClick={handleAddPage}
              className="p-1 bg-[#121c2e] hover:bg-[#0055ff] text-slate-300 hover:text-white rounded-lg transition-colors"
              title="Adicionar Nova Página"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Lista com scroll das Miniaturas */}
          <div className="p-3 overflow-y-auto flex-1 space-y-3">
            {paginas.map((p, pIdx) => {
              const isSelected = pIdx === currentPageIndex;
              const pW = p.width || 794;
              const pH = p.height || 1123;
              const aspect = pW / pH;
              const thumbW = 140;
              const thumbH = Math.round(thumbW / aspect);

              return (
                <div
                  key={p.id || pIdx}
                  onClick={() => {
                    setCurrentPageIndex(pIdx);
                    setSelectedElementId(null);
                  }}
                  className={`group rounded-xl border-2 transition-all p-2 flex flex-col items-center gap-2 cursor-pointer ${
                    isSelected
                      ? 'border-[#0055ff] bg-[#0055ff]/10 shadow-lg shadow-[#0055ff]/20'
                      : 'border-slate-800 bg-[#121c2e]/60 hover:border-slate-600 hover:bg-[#121c2e]'
                  }`}
                >
                  {/* Mini Canvas com Proporção Original */}
                  <div
                    className="relative bg-white rounded shadow overflow-hidden pointer-events-none select-none"
                    style={{
                      width: `${thumbW}px`,
                      height: `${thumbH}px`,
                      backgroundColor: p.backgroundColor || '#ffffff',
                      backgroundImage: p.backgroundImage ? `url(${p.backgroundImage})` : undefined,
                      backgroundSize: '100% 100%',
                    }}
                  >
                    {p.elementos?.map((el) => {
                      const scale = thumbW / pW;
                      return (
                        <div
                          key={el.id}
                          className="absolute overflow-hidden"
                          style={{
                            left: `${el.x * scale}px`,
                            top: `${el.y * scale}px`,
                            width: `${el.width * scale}px`,
                            height: `${el.height * scale}px`,
                            backgroundColor:
                              el.backgroundColor ||
                              el.fillColor ||
                              (el.tipo === 'texto' ? 'transparent' : '#e2e8f0'),
                            opacity: 0.8,
                          }}
                        >
                          {el.tipo === 'texto' && (
                            <div
                              style={{
                                fontSize: '4px',
                                lineHeight: '5px',
                                color: el.color || '#334155',
                              }}
                              className="truncate"
                            >
                              {el.conteudo}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Informações e Ações da Página na Miniatura */}
                  <div className="w-full flex items-center justify-between text-xs px-1">
                    <span className={`font-bold ${isSelected ? 'text-[#0055ff]' : 'text-slate-300'}`}>
                      {pIdx === 0 ? '1 (Capa)' : `Pág ${pIdx + 1}`}
                    </span>

                    <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentPageIndex(pIdx);
                          handleMovePage('up');
                        }}
                        disabled={pIdx === 0}
                        className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20"
                        title="Subir Página"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentPageIndex(pIdx);
                          handleMovePage('down');
                        }}
                        disabled={pIdx === paginas.length - 1}
                        className="p-0.5 text-slate-400 hover:text-white disabled:opacity-20"
                        title="Descer Página"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Rodapé da Coluna de Páginas */}
          <div className="p-3 border-t border-slate-800 bg-[#080f1d] flex items-center justify-between text-xs">
            <button
              onClick={handleAddPage}
              className="w-full py-1.5 bg-[#121c2e] hover:bg-[#0055ff] text-slate-200 hover:text-white rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nova Página</span>
            </button>
          </div>
        </div>

        {/* ----------------------------------------------------
            COLUNA CENTRAL: VISUALIZAÇÃO GRANDE DO DOCUMENTO
           ---------------------------------------------------- */}
        <div
          className="flex-1 bg-[#050913] overflow-auto p-8 flex flex-col items-center justify-start relative select-none"
          onClick={() => setSelectedElementId(null)}
          onMouseMove={handleMouseMoveCanvas}
          onMouseUp={handleMouseUpCanvas}
        >
          {/* Zoom & Controles Flutuantes */}
          <div className="fixed bottom-6 right-80 z-30 flex items-center gap-2 bg-[#091122]/95 backdrop-blur-md border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-2xl">
            <button
              onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))))}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              title="Diminuir Zoom"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-slate-200 w-12 text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
              title="Aumentar Zoom"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-700 mx-1" />
            <button
              onClick={() => setZoom(0.85)}
              className="text-[11px] text-[#0055ff] hover:underline font-semibold"
            >
              100%
            </button>
          </div>

          {/* Página do Documento Preservando Resolução e Proporção */}
          <div
            ref={canvasRef}
            className="relative bg-white shadow-2xl rounded-xs text-slate-900 overflow-hidden"
            style={{
              width: `${pageWidth}px`,
              height: `${pageHeight}px`,
              minWidth: `${pageWidth}px`,
              minHeight: `${pageHeight}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              transition: isDragging || isResizing ? 'none' : 'transform 0.1s ease-out',
              backgroundColor: currentPage.backgroundColor || '#ffffff',
              backgroundImage: currentPage.backgroundImage
                ? `url(${currentPage.backgroundImage})`
                : undefined,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {currentPage.elementos?.map((el) => {
              const isSelected = el.id === selectedElementId;
              const resolvedText = resolveCrmTags(el.conteudo || '', crmContext);
              const resolvedSub = resolveCrmTags(el.textoSecundario || '', crmContext);

              return (
                <div
                  key={el.id}
                  onMouseDown={(e) => handleMouseDownElement(e, el.id)}
                  className={`absolute group cursor-move select-none ${
                    isSelected
                      ? 'ring-2 ring-[#0055ff] ring-offset-1 ring-offset-white'
                      : 'hover:outline hover:outline-1 hover:outline-blue-400'
                  }`}
                  style={{
                    left: `${el.x}px`,
                    top: `${el.y}px`,
                    width: `${el.width}px`,
                    height: `${el.height}px`,
                    zIndex: el.zIndex || 1,
                    transform: el.rotation ? `rotate(${el.rotation}deg)` : undefined,
                  }}
                >
                  <div
                    className="w-full h-full overflow-hidden"
                    style={{
                      fontSize: el.fontSize ? `${el.fontSize}px` : '14px',
                      fontFamily: el.fontFamily || 'Inter, sans-serif',
                      color: el.color || '#0f172a',
                      backgroundColor: el.backgroundColor || 'transparent',
                      textAlign: el.textAlign || 'left',
                      fontWeight: el.fontWeight || 'normal',
                      fontStyle: el.fontStyle || 'normal',
                      textDecoration: el.textDecoration || 'none',
                      lineHeight: el.lineHeight || 1.4,
                      letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
                      padding: el.padding ? `${el.padding}px` : '0px',
                      borderRadius:
                        el.formaTipo === 'circulo'
                          ? '9999px'
                          : el.formaTipo === 'cartao'
                          ? '12px'
                          : el.borderRadius
                          ? `${el.borderRadius}px`
                          : '0px',
                      borderWidth: el.borderWidth ? `${el.borderWidth}px` : '0px',
                      borderColor: el.borderColor || 'transparent',
                      borderStyle: el.borderStyle || 'solid',
                      opacity: el.opacity !== undefined ? el.opacity : 1,
                    }}
                  >
                    {/* Elemento de Texto */}
                    {el.tipo === 'texto' && (
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        onKeyDown={(e) => e.stopPropagation()}
                        onBlur={(e) => {
                          const val = e.currentTarget.innerText;
                          if (val !== el.conteudo) {
                            recordHistory();
                            updateSelectedElement({ conteudo: val }, false);
                          }
                        }}
                        className="w-full h-full outline-none whitespace-pre-wrap cursor-text"
                      >
                        {resolvedText}
                      </div>
                    )}

                    {/* Elemento Campo CRM */}
                    {el.tipo === 'campo_crm' && (
                      <div className="w-full h-full flex items-center justify-between px-2">
                        <span className="font-semibold">{resolvedText}</span>
                        <span className="text-[10px] text-blue-600 font-bold bg-blue-100 px-1 py-0.5 rounded">
                          CRM
                        </span>
                      </div>
                    )}

                    {/* Imagens e Logos */}
                    {(el.tipo === 'imagem' || el.tipo === 'logo') && (
                      <img
                        src={el.src || '/public/fenix_official_logo.png'}
                        alt="Imagem"
                        className="w-full h-full pointer-events-none select-none"
                        style={{ objectFit: el.fit || 'contain' }}
                      />
                    )}

                    {/* Formas */}
                    {el.tipo === 'forma' && (
                      <div
                        className="w-full h-full"
                        style={{
                          backgroundColor: el.fillColor || el.backgroundColor || '#0055ff',
                        }}
                      />
                    )}

                    {/* Linhas */}
                    {el.tipo === 'linha' && (
                      <div
                        className="w-full"
                        style={{
                          borderTopWidth: `${el.espessuraLinha || 2}px`,
                          borderTopColor: el.borderColor || '#0055ff',
                          borderTopStyle: el.linhaEstilo || 'solid',
                        }}
                      />
                    )}

                    {/* Cabeçalho Oficial */}
                    {el.tipo === 'cabecalho' && (
                      <div className="w-full h-full flex items-center justify-between border-b-2 border-[#0055ff] pb-2">
                        <div className="flex items-center gap-3">
                          <img
                            src="/public/fenix_official_logo.png"
                            alt="Logo"
                            className="h-9 object-contain"
                          />
                          <div>
                            <p className="font-bold text-xs text-[#091122]">FÊNIX WORLD DISTRIBUIDORA</p>
                            <p className="text-[10px] text-slate-500">{resolvedSub}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-[#0055ff]">{resolvedText}</p>
                          <p className="text-[10px] text-slate-400">
                            {new Date().toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Rodapé Oficial */}
                    {el.tipo === 'rodape' && (
                      <div className="w-full h-full flex items-center justify-between border-t border-slate-300 pt-1 text-[10px] text-slate-500">
                        <p>{resolvedText || 'Fênix World Distribuidora'}</p>
                        <p>
                          Página {currentPageIndex + 1} de {paginas.length}
                        </p>
                      </div>
                    )}

                    {/* Número de Página */}
                    {el.tipo === 'numero_pagina' && (
                      <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 font-semibold">
                        Página {currentPageIndex + 1} de {paginas.length}
                      </div>
                    )}

                    {/* Tabela de Produtos / Conteúdo */}
                    {el.tipo === 'tabela' && (
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr
                            style={{
                              backgroundColor: el.headerBg || '#0055ff',
                              color: el.headerColor || '#fff',
                            }}
                          >
                            {el.tabelaHeaders?.map((h, hIdx) => (
                              <th
                                key={hIdx}
                                className="px-2 py-1 text-left font-bold text-[11px] border border-slate-300"
                              >
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {el.tabelaLinhas?.map((r, rIdx) => (
                            <tr
                              key={rIdx}
                              className={rIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}
                            >
                              {r.map((cell, cIdx) => (
                                <td
                                  key={cIdx}
                                  className="px-2 py-1 text-slate-800 border border-slate-200"
                                >
                                  {cell}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>

                  {/* Alças de Redimensionamento */}
                  {isSelected && (
                    <>
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsResizing(true);
                          setResizeHandle('se');
                          setDragStartPos({ x: e.clientX, y: e.clientY });
                          setElementStartBounds({ x: el.x, y: el.y, w: el.width, h: el.height });
                        }}
                        className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-[#0055ff] border-2 border-white rounded-full cursor-se-resize shadow-md"
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsResizing(true);
                          setResizeHandle('e');
                          setDragStartPos({ x: e.clientX, y: e.clientY });
                          setElementStartBounds({ x: el.x, y: el.y, w: el.width, h: el.height });
                        }}
                        className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-2.5 h-2.5 bg-[#0055ff] border border-white rounded-full cursor-e-resize shadow-md"
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsResizing(true);
                          setResizeHandle('s');
                          setDragStartPos({ x: e.clientX, y: e.clientY });
                          setElementStartBounds({ x: el.x, y: el.y, w: el.width, h: el.height });
                        }}
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-[#0055ff] border border-white rounded-full cursor-s-resize shadow-md"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ----------------------------------------------------
            COLUNA DIREITA: PAINEL DE PROPRIEDADES / SUB-ESTRUTURA
           ---------------------------------------------------- */}
        <div className="w-72 md:w-80 bg-[#0a1222] border-l border-slate-800 flex flex-col shrink-0">
          {/* Seletor ou contexto no topo do painel direito */}
          <div className="p-3 border-b border-slate-800 flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              {activeTab === 'conteudo' && 'Editar Conteúdo'}
              {activeTab === 'paginas' && 'Gerenciar Páginas'}
              {activeTab === 'elementos' && 'Elementos Visuais'}
              {activeTab === 'configuracoes' && 'Configurações'}
            </h4>
            {selectedElement && (
              <span className="text-[10px] text-[#0055ff] font-bold bg-[#0055ff]/15 px-2 py-0.5 rounded uppercase">
                {selectedElement.tipo}
              </span>
            )}
          </div>

          {/* Conteúdo dinâmico com scroll */}
          <div className="p-4 overflow-y-auto flex-1 space-y-4">
            {/* ====================================================
                ABA 1: EDITAR CONTEÚDO (Textos, Produtos, Preços, etc)
               ==================================================== */}
            {activeTab === 'conteudo' && (
              <div className="space-y-4">
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <p className="text-xs font-bold text-white flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#0055ff]" />
                    Conteúdo Rápido
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Insira blocos estruturados de produtos, descrições comerciais e tabelas de preços.
                  </p>
                </div>

                {/* Produtos e Tabelas de Preço */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-emerald-400" />
                    Produtos & Preços
                  </label>
                  <button
                    onClick={handleAddProductBlock}
                    className="w-full p-2.5 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-left transition-all flex items-center justify-between"
                  >
                    <div>
                      <p className="text-xs font-bold text-white">Tabela de Produtos</p>
                      <p className="text-[10px] text-slate-400">Produtos, Unid, Preços, Promoção</p>
                    </div>
                    <Plus className="w-4 h-4 text-emerald-400" />
                  </button>
                </div>

                {/* Textos Comerciais e Títulos */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-blue-400" />
                    Títulos e Descrições
                  </label>
                  <button
                    onClick={() => handleAddTextElement('TÍTULO PRINCIPAL', 24, true)}
                    className="w-full p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-lg text-left text-xs font-bold text-white"
                  >
                    + Título de Destaque
                  </button>
                  <button
                    onClick={() => handleAddTextElement('Subtítulo com Categoria e Especificação', 15, false)}
                    className="w-full p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-lg text-left text-xs font-semibold text-slate-300"
                  >
                    + Subtítulo / Categoria
                  </button>
                  <button
                    onClick={() =>
                      handleAddTextElement(
                        'Descrição detalhada do produto, acabamento, normas técnicas e orientações de instalação.',
                        12,
                        false
                      )
                    }
                    className="w-full p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-lg text-left text-xs text-slate-400"
                  >
                    + Parágrafo Descritivo
                  </button>
                </div>

                {/* Promoções, Mês/Ano e Observações */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" />
                    Promoções & Vigência
                  </label>
                  <button
                    onClick={() =>
                      addElement({
                        tipo: 'texto',
                        x: 60,
                        y: 100,
                        width: 250,
                        height: 35,
                        conteudo: `PROMOÇÃO VÁLIDA: ${new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase()}`,
                        fontSize: 12,
                        fontWeight: 'bold',
                        color: '#d97706',
                        backgroundColor: '#fef3c7',
                        padding: 8,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: '#fde68a',
                      })
                    }
                    className="w-full p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-lg text-left text-xs font-medium text-amber-300 flex items-center justify-between"
                  >
                    <span>+ Bloco Mês/Ano & Promoção</span>
                    <Calendar className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() =>
                      addElement({
                        tipo: 'texto',
                        x: 60,
                        y: 200,
                        width: 500,
                        height: 60,
                        conteudo:
                          'Observações: Os valores acima podem sofrer alteração conforme disponibilidade de lote e forma de faturamento acordada.',
                        fontSize: 11,
                        color: '#64748b',
                        padding: 6,
                        backgroundColor: '#f8fafc',
                        borderRadius: 4,
                      })
                    }
                    className="w-full p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-lg text-left text-xs text-slate-400"
                  >
                    + Observações Comerciais
                  </button>
                </div>

                {/* Campos do CRM */}
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-[#0055ff]" />
                    Campos Automáticos do CRM
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {CRM_FIELDS.map((f) => (
                      <button
                        key={f.tag}
                        onClick={() => {
                          if (selectedElement && selectedElement.tipo === 'texto') {
                            recordHistory();
                            updateSelectedElement({
                              conteudo: `${selectedElement.conteudo || ''} ${f.tag}`.trim(),
                            });
                          } else {
                            addElement({
                              tipo: 'campo_crm',
                              x: 60,
                              y: 180,
                              width: 280,
                              height: 38,
                              conteudo: `${f.label}: ${f.tag}`,
                              crmFieldTag: f.tag,
                              fontSize: 13,
                              fontWeight: '600',
                              color: '#0055ff',
                              backgroundColor: '#eff6ff',
                              borderRadius: 6,
                              borderWidth: 1,
                              borderColor: '#bfdbfe',
                              padding: 8,
                            });
                          }
                        }}
                        className="p-1.5 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-lg text-left text-[11px] font-semibold text-slate-300 truncate"
                        title={f.description}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ====================================================
                ABA 2: PÁGINAS (Adicionar, Duplicar, Excluir, Reordenar, Substituir, Capa)
               ==================================================== */}
            {activeTab === 'paginas' && (
              <div className="space-y-4">
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-1">
                  <p className="text-xs font-bold text-white">
                    Página Atual: {currentPageIndex + 1} de {paginas.length}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Dimensões: {pageWidth}x{pageHeight}px ({currentPage.orientation || 'portrait'})
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Ações de Página
                  </label>

                  {/* Adicionar */}
                  <button
                    onClick={handleAddPage}
                    className="w-full p-2.5 bg-[#0055ff] hover:bg-[#0044cc] text-white rounded-xl text-xs font-bold flex items-center justify-between transition-colors shadow"
                  >
                    <span>Adicionar Nova Página</span>
                    <Plus className="w-4 h-4" />
                  </button>

                  {/* Duplicar */}
                  <button
                    onClick={handleDuplicatePage}
                    className="w-full p-2.5 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 text-white rounded-xl text-xs font-semibold flex items-center justify-between transition-colors"
                  >
                    <span>Duplicar Página Atual</span>
                    <Copy className="w-4 h-4 text-emerald-400" />
                  </button>

                  {/* Reordenar */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleMovePage('up')}
                      disabled={currentPageIndex === 0}
                      className="p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-300 disabled:opacity-30 flex items-center justify-center gap-1.5"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                      <span>Subir Ordem</span>
                    </button>
                    <button
                      onClick={() => handleMovePage('down')}
                      disabled={currentPageIndex === paginas.length - 1}
                      className="p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-300 disabled:opacity-30 flex items-center justify-center gap-1.5"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                      <span>Descer Ordem</span>
                    </button>
                  </div>

                  {/* Substituir Imagem/Fundo da Página Atual */}
                  <div className="pt-2">
                    <input
                      type="file"
                      ref={replacePageFileInputRef}
                      onChange={handleReplacePageBackground}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      onClick={() => replacePageFileInputRef.current?.click()}
                      className="w-full p-2.5 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors"
                    >
                      <span>Substituir Layout da Página</span>
                      <Upload className="w-4 h-4 text-sky-400" />
                    </button>
                  </div>

                  {/* Alterar Capa (Página 1) */}
                  <div>
                    <input
                      type="file"
                      ref={changeCapaFileInputRef}
                      onChange={handleChangeCover}
                      accept="image/*"
                      className="hidden"
                    />
                    <button
                      onClick={() => changeCapaFileInputRef.current?.click()}
                      className="w-full p-2.5 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 text-slate-200 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors"
                    >
                      <span>Alterar Capa (Página 1)</span>
                      <FolderOpen className="w-4 h-4 text-amber-400" />
                    </button>
                  </div>

                  {/* Excluir Página Atual */}
                  <button
                    onClick={handleDeletePage}
                    disabled={paginas.length <= 1}
                    className="w-full p-2.5 bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/30 rounded-xl text-xs font-bold flex items-center justify-between transition-colors disabled:opacity-30"
                  >
                    <span>Excluir Página Atual</span>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* ====================================================
                ABA 3: ELEMENTOS VISUAIS (Imagens, Logos, Formas, Ícones)
               ==================================================== */}
            {activeTab === 'elementos' && (
              <div className="space-y-4">
                {/* Adicionar Imagens e Logos */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Imagens e Logotipos
                  </label>

                  <button
                    onClick={() =>
                      addElement({
                        tipo: 'logo',
                        x: 50,
                        y: 40,
                        width: 140,
                        height: 55,
                        src: '/public/fenix_official_logo.png',
                        fit: 'contain',
                      })
                    }
                    className="w-full p-2.5 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-left text-xs font-bold text-white flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <img
                        src="/public/fenix_official_logo.png"
                        alt="Logo"
                        className="w-7 h-7 object-contain bg-white/10 rounded p-0.5"
                      />
                      <span>Logo Oficial Fênix</span>
                    </div>
                    <Plus className="w-4 h-4 text-[#0055ff]" />
                  </button>

                  <input
                    type="file"
                    ref={uploadImageInputRef}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        addElement({
                          tipo: 'imagem',
                          x: 80,
                          y: 150,
                          width: 240,
                          height: 180,
                          src: reader.result as string,
                          fit: 'contain',
                        });
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                    accept="image/*"
                    className="hidden"
                  />
                  <button
                    onClick={() => uploadImageInputRef.current?.click()}
                    className="w-full p-2.5 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-left text-xs font-semibold text-slate-300 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-emerald-400" />
                      <span>Fazer Upload de Imagem</span>
                    </div>
                    <Upload className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {/* Formas Geométricas & Cartões */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Formas & Molduras
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() =>
                        addElement({
                          tipo: 'forma',
                          x: 80,
                          y: 150,
                          width: 250,
                          height: 120,
                          formaTipo: 'cartao',
                          fillColor: '#f8fafc',
                          borderWidth: 1,
                          borderColor: '#cbd5e1',
                          borderRadius: 8,
                        })
                      }
                      className="p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-300 text-center"
                    >
                      Cartão / Fundo
                    </button>

                    <button
                      onClick={() =>
                        addElement({
                          tipo: 'forma',
                          x: 100,
                          y: 150,
                          width: 80,
                          height: 80,
                          formaTipo: 'circulo',
                          fillColor: '#0055ff',
                          borderRadius: 9999,
                        })
                      }
                      className="p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-300 text-center"
                    >
                      Círculo / Selo
                    </button>
                  </div>
                </div>

                {/* Linhas e Separadores */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Linhas & Estrutura
                  </label>
                  <button
                    onClick={() =>
                      addElement({
                        tipo: 'linha',
                        x: 50,
                        y: 160,
                        width: Math.min(pageWidth - 100, 694),
                        height: 4,
                        espessuraLinha: 2,
                        borderColor: '#0055ff',
                      })
                    }
                    className="w-full p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-300 flex items-center justify-between"
                  >
                    <span>Linha Divisória</span>
                    <Minus className="w-4 h-4 text-blue-400" />
                  </button>

                  <button
                    onClick={() =>
                      addElement({
                        tipo: 'cabecalho',
                        x: 40,
                        y: 30,
                        width: Math.min(pageWidth - 80, 714),
                        height: 60,
                        conteudo: 'DOCUMENTO OFICIAL',
                        textoSecundario: 'Distribuição Especializada de Pisos Vinílicos',
                      })
                    }
                    className="w-full p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-300 flex items-center justify-between"
                  >
                    <span>Cabeçalho Oficial Fênix</span>
                    <Layout className="w-4 h-4 text-slate-400" />
                  </button>

                  <button
                    onClick={() =>
                      addElement({
                        tipo: 'rodape',
                        x: 40,
                        y: pageHeight - 60,
                        width: Math.min(pageWidth - 80, 714),
                        height: 40,
                        conteudo: 'Fênix World • São Paulo / SP • www.fenixworld.com.br',
                      })
                    }
                    className="w-full p-2 bg-[#121c2e] hover:bg-slate-800 border border-slate-700/80 rounded-xl text-xs font-semibold text-slate-300 flex items-center justify-between"
                  >
                    <span>Rodapé Institucional</span>
                    <Layout className="w-4 h-4 text-slate-400" />
                  </button>
                </div>

                {/* Se um elemento estiver selecionado, exibe ações rápidas */}
                {selectedElement && (
                  <div className="p-3 bg-[#121c2e] border border-blue-500/30 rounded-xl space-y-2 mt-4">
                    <p className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-[#0055ff]" />
                      Elemento Selecionado
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={handleDuplicateSelectedElement}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-semibold text-slate-200 flex items-center justify-center gap-1"
                      >
                        <Copy className="w-3 h-3 text-emerald-400" />
                        <span>Duplicar</span>
                      </button>
                      <button
                        onClick={handleDeleteSelectedElement}
                        className="p-1.5 bg-red-500/10 hover:bg-red-600 rounded-lg text-xs font-semibold text-red-400 hover:text-white flex items-center justify-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Excluir</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ====================================================
                ABA 4: CONFIGURAÇÕES (Autosave, Proporção, Metadados)
               ==================================================== */}
            {activeTab === 'configuracoes' && (
              <div className="space-y-4 text-xs">
                {/* Autosave Toggle */}
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white">Salvamento Automático (Autosave)</p>
                      <p className="text-[11px] text-slate-400">
                        Salva periodicamente no Supabase a cada 40s
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={autoSaveEnabled}
                      onChange={(e) => setAutoSaveEnabled(e.target.checked)}
                      className="rounded text-[#0055ff] focus:ring-0 cursor-pointer w-4 h-4"
                    />
                  </div>
                </div>

                {/* Preservação e Proporções */}
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <p className="font-bold text-white">Preservação do PDF Original</p>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    O documento mantém fielmente as dimensões e proporção original da página ({pageWidth} x {pageHeight} px). Não há distorção nem conversão destrutiva para A4.
                  </p>
                  <div className="pt-1 flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-500/15 text-blue-400 font-bold rounded text-[10px]">
                      100% FIEL
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Original Intacto no Supabase
                    </span>
                  </div>
                </div>

                {/* Salvar como Modelo */}
                <div className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-white">Disponibilizar como Modelo</p>
                      <p className="text-[11px] text-slate-400">
                        Permite que outros usuários utilizem este documento como matriz
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isModelo}
                      onChange={(e) => {
                        setIsModelo(e.target.checked);
                        setSaveStatus('dirty');
                      }}
                      className="rounded text-[#0055ff] focus:ring-0 cursor-pointer w-4 h-4"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* ====================================================
                PROPRIEDADES DO ELEMENTO SELECIONADO (SE HOUVER)
               ==================================================== */}
            {selectedElement && (
              <div className="pt-4 border-t border-slate-800 space-y-3">
                <p className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Propriedades do Elemento</span>
                  <button
                    onClick={() => setSelectedElementId(null)}
                    className="text-[11px] text-slate-500 hover:text-white"
                  >
                    Desmarcar
                  </button>
                </p>

                {/* Se for Texto ou Campo CRM */}
                {(selectedElement.tipo === 'texto' || selectedElement.tipo === 'campo_crm') && (
                  <div className="space-y-2">
                    <div>
                      <label className="text-[11px] text-slate-400 font-semibold block mb-1">
                        Conteúdo do Texto
                      </label>
                      <textarea
                        value={selectedElement.conteudo || ''}
                        onChange={(e) => updateSelectedElement({ conteudo: e.target.value })}
                        className="w-full bg-[#121c2e] border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-[#0055ff] resize-y min-h-[60px]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] text-slate-400">Tamanho da Fonte</label>
                        <input
                          type="number"
                          min={8}
                          max={96}
                          value={selectedElement.fontSize || 14}
                          onChange={(e) => updateSelectedElement({ fontSize: Number(e.target.value) })}
                          className="w-full px-2 py-1 bg-[#121c2e] border border-slate-700 rounded text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-slate-400">Cor do Texto</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={selectedElement.color || '#0f172a'}
                            onChange={(e) => updateSelectedElement({ color: e.target.value })}
                            className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                          />
                          <span className="text-[10px] font-mono text-slate-400">
                            {selectedElement.color || '#0f172a'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Alinhamento e Estilos */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center bg-[#121c2e] rounded-lg p-0.5">
                        <button
                          onClick={() =>
                            updateSelectedElement({
                              fontWeight: selectedElement.fontWeight === 'bold' ? 'normal' : 'bold',
                            })
                          }
                          className={`p-1.5 rounded ${
                            selectedElement.fontWeight === 'bold'
                              ? 'bg-[#0055ff] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Negrito"
                        >
                          <Bold className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            updateSelectedElement({
                              fontStyle: selectedElement.fontStyle === 'italic' ? 'normal' : 'italic',
                            })
                          }
                          className={`p-1.5 rounded ${
                            selectedElement.fontStyle === 'italic'
                              ? 'bg-[#0055ff] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Itálico"
                        >
                          <Italic className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() =>
                            updateSelectedElement({
                              textDecoration:
                                selectedElement.textDecoration === 'underline' ? 'none' : 'underline',
                            })
                          }
                          className={`p-1.5 rounded ${
                            selectedElement.textDecoration === 'underline'
                              ? 'bg-[#0055ff] text-white'
                              : 'text-slate-400 hover:text-white'
                          }`}
                          title="Sublinhado"
                        >
                          <Underline className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center bg-[#121c2e] rounded-lg p-0.5">
                        <button
                          onClick={() => updateSelectedElement({ textAlign: 'left' })}
                          className={`p-1.5 rounded ${
                            selectedElement.textAlign === 'left' ? 'bg-[#0055ff] text-white' : 'text-slate-400'
                          }`}
                        >
                          <AlignLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => updateSelectedElement({ textAlign: 'center' })}
                          className={`p-1.5 rounded ${
                            selectedElement.textAlign === 'center' ? 'bg-[#0055ff] text-white' : 'text-slate-400'
                          }`}
                        >
                          <AlignCenter className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => updateSelectedElement({ textAlign: 'right' })}
                          className={`p-1.5 rounded ${
                            selectedElement.textAlign === 'right' ? 'bg-[#0055ff] text-white' : 'text-slate-400'
                          }`}
                        >
                          <AlignRight className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => updateSelectedElement({ textAlign: 'justify' })}
                          className={`p-1.5 rounded ${
                            selectedElement.textAlign === 'justify' ? 'bg-[#0055ff] text-white' : 'text-slate-400'
                          }`}
                        >
                          <AlignJustify className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Se for Imagem ou Logo */}
                {(selectedElement.tipo === 'imagem' || selectedElement.tipo === 'logo') && (
                  <div className="space-y-2">
                    <label className="text-[11px] text-slate-400 block">Ajuste da Imagem</label>
                    <select
                      value={selectedElement.fit || 'contain'}
                      onChange={(e) => updateSelectedElement({ fit: e.target.value as any })}
                      className="w-full bg-[#121c2e] border border-slate-700 rounded-lg p-1.5 text-xs text-white"
                    >
                      <option value="contain">Conter Proporcional (Contain)</option>
                      <option value="cover">Preencher Sem Bordas (Cover)</option>
                      <option value="fill">Ajustar ao Quadro (Fill)</option>
                    </select>
                  </div>
                )}

                {/* Se for Forma */}
                {selectedElement.tipo === 'forma' && (
                  <div className="space-y-2">
                    <label className="text-[11px] text-slate-400 block">Cor de Preenchimento</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={selectedElement.fillColor || '#0055ff'}
                        onChange={(e) => updateSelectedElement({ fillColor: e.target.value })}
                        className="w-7 h-7 rounded border-0 cursor-pointer bg-transparent"
                      />
                      <span className="text-xs font-mono text-slate-300">
                        {selectedElement.fillColor || '#0055ff'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ==========================================
          5. MODAIS AUXILIARES (VERSÕES E VISUALIZADOR)
         ========================================== */}
      {isVersoesOpen && (
        <VersoesModal
          isOpen={isVersoesOpen}
          documento={documento}
          onClose={() => setIsVersoesOpen(false)}
          onRestore={(vId) => {
            const v = documento.versoes?.find((x) => x.id === vId);
            if (v && v.paginas) {
              recordHistory();
              setPaginas(JSON.parse(JSON.stringify(v.paginas)));
              setCurrentPageIndex(0);
              setSelectedElementId(null);
              setIsVersoesOpen(false);
              setSaveStatus('dirty');
              showToast('Versão restaurada!');
            }
          }}
        />
      )}

      {isViewerOpen && (
        <DocumentoViewerModal
          isOpen={isViewerOpen}
          item={{
            ...documento,
            titulo: docTitle,
            paginas,
          }}
          clients={clients}
          currentUserName={currentUserName}
          onClose={() => setIsViewerOpen(false)}
          onEdit={() => setIsViewerOpen(false)}
          onSend={() => {
            setIsViewerOpen(false);
            onClose();
          }}
        />
      )}
    </div>
  );
};
