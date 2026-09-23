import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Save,
  Play,
  RotateCcw,
  RotateCw,
  Plus,
  Trash2,
  Copy,
  Layers,
  Settings,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  Type,
  Hash,
  Calendar,
  DollarSign,
  FileBadge,
  Phone,
  Mail,
  MapPin,
  ListFilter,
  CheckSquare,
  AlignLeft,
  Image as ImageIcon,
  PenTool,
  ShieldCheck,
  UserCheck,
  Package,
  ShoppingBag,
  Sliders,
  AlertCircle,
  CheckCircle2,
  History,
  CopyPlus,
  RefreshCw,
  Eye,
  ArrowUp,
  ArrowDown,
  Sparkles,
  Info,
} from 'lucide-react';
import {
  DocumentoItem,
  DocumentoPagina,
  DocumentoCampoModelo,
  TipoCampoModelo,
  DocumentoCategoria,
  ClientRecord,
} from '../../types';
import {
  saveDocumentoAsync,
  createBlankPage,
} from '../../utils/documentosService';
import { VersoesModal } from './VersoesModal';

interface ModeloCamposEditorModalProps {
  isOpen: boolean;
  modelo: DocumentoItem | null;
  categorias: DocumentoCategoria[];
  clients: ClientRecord[];
  currentUserName: string;
  onClose: () => void;
  onSaved: (savedModelo: DocumentoItem) => void;
  onUseModelo: (modelo: DocumentoItem) => void;
}

interface HistorySnapshot {
  campos: DocumentoCampoModelo[];
  titulo: string;
  paginas: DocumentoPagina[];
}

export const CAMPO_TIPO_CONFIG: Record<
  TipoCampoModelo,
  { label: string; icon: any; cor: string; desc: string }
> = {
  texto: { label: 'Texto Curto', icon: Type, cor: '#0055ff', desc: 'Linha simples de texto' },
  numero: { label: 'Número', icon: Hash, cor: '#0284c7', desc: 'Valores numéricos e quantidades' },
  data: { label: 'Data', icon: Calendar, cor: '#0d9488', desc: 'Seleção de data no calendário' },
  moeda: { label: 'Moeda (R$)', icon: DollarSign, cor: '#16a34a', desc: 'Valores monetários formatados' },
  cpf_cnpj: { label: 'CPF / CNPJ', icon: FileBadge, cor: '#d97706', desc: 'Documento com máscara e validação' },
  telefone: { label: 'Telefone / WhatsApp', icon: Phone, cor: '#2563eb', desc: 'Número de telefone formatado' },
  email: { label: 'E-mail', icon: Mail, cor: '#9333ea', desc: 'Endereço eletrônico' },
  endereco: { label: 'Endereço da Obra', icon: MapPin, cor: '#ea580c', desc: 'Endereço completo da obra ou entrega' },
  selecao: { label: 'Seleção (Dropdown)', icon: ListFilter, cor: '#4f46e5', desc: 'Lista suspensa com opções' },
  checkbox: { label: 'Checkbox', icon: CheckSquare, cor: '#059669', desc: 'Caixa de marcação sim/não' },
  textarea: { label: 'Área de Texto', icon: AlignLeft, cor: '#64748b', desc: 'Texto longo ou observações' },
  imagem: { label: 'Imagem / Foto', icon: ImageIcon, cor: '#e11d48', desc: 'Upload de foto ou comprovante' },
  assinatura_normal: { label: 'Assinatura Normal', icon: PenTool, cor: '#0284c7', desc: 'Desenhar com dedo ou mouse' },
  assinatura_govbr: { label: 'Assinatura gov.br', icon: ShieldCheck, cor: '#15803d', desc: 'Autenticação digital oficial Gov.br' },
  vinculado_cliente: { label: 'Vínculo: Cliente CRM', icon: UserCheck, cor: '#0055ff', desc: 'Preenche automático do cadastro do cliente' },
  vinculado_pedido: { label: 'Vínculo: Pedido CRM', icon: ShoppingBag, cor: '#7c3aed', desc: 'Puxa dados do pedido / orçamento' },
  vinculado_produto: { label: 'Vínculo: Produto / Coleção', icon: Package, cor: '#b45309', desc: 'Puxa itens, unidade e coleção' },
  personalizado: { label: 'Personalizado', icon: Sliders, cor: '#475569', desc: 'Campo livre customizável' },
};

export const ModeloCamposEditorModal: React.FC<ModeloCamposEditorModalProps> = ({
  isOpen,
  modelo,
  categorias,
  clients,
  currentUserName,
  onClose,
  onSaved,
  onUseModelo,
}) => {
  const [titulo, setTitulo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [paginas, setPaginas] = useState<DocumentoPagina[]>([]);
  const [campos, setCampos] = useState<DocumentoCampoModelo[]>([]);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedCampoId, setSelectedCampoId] = useState<string | null>(null);

  // Histórico para Desfazer / Refazer
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  // Snapshot inicial para "Restaurar Original"
  const [initialSnapshot, setInitialSnapshot] = useState<HistorySnapshot | null>(null);

  // UI state
  const [zoom, setZoom] = useState(0.85);
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'dirty'>('saved');
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<string | null>(null);
  const [isVersoesOpen, setIsVersoesOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Drag & Resize state
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string>('');
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [campoStartBounds, setCampoStartBounds] = useState({ x: 0, y: 0, w: 0, h: 0 });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Inicializa dados ao abrir
  useEffect(() => {
    if (modelo && isOpen) {
      const initialPages =
        modelo.paginas && modelo.paginas.length > 0
          ? JSON.parse(JSON.stringify(modelo.paginas))
          : [createBlankPage(1)];

      const initialCampos: DocumentoCampoModelo[] =
        modelo.camposModelo && modelo.camposModelo.length > 0
          ? JSON.parse(JSON.stringify(modelo.camposModelo))
          : [
              // Campos modelo padrão se for novo
              {
                id: 'fld_cliente_nome',
                nome: 'Nome do Cliente',
                tipo: 'vinculado_cliente',
                obrigatorio: true,
                paginaNumero: 1,
                x: 60,
                y: 140,
                width: 320,
                height: 38,
                vinculoCrm: 'cliente_nome',
                placeholder: 'Digite o nome do cliente...',
                fontSize: 14,
              },
              {
                id: 'fld_cpf_cnpj',
                nome: 'CPF/CNPJ',
                tipo: 'cpf_cnpj',
                obrigatorio: true,
                paginaNumero: 1,
                x: 400,
                y: 140,
                width: 250,
                height: 38,
                vinculoCrm: 'cliente_documento',
                placeholder: '000.000.000-00',
                fontSize: 14,
              },
              {
                id: 'fld_endereco_obra',
                nome: 'Endereço da Obra',
                tipo: 'endereco',
                obrigatorio: false,
                paginaNumero: 1,
                x: 60,
                y: 195,
                width: 590,
                height: 38,
                vinculoCrm: 'cliente_endereco',
                placeholder: 'Logradouro, número, bairro, cidade/UF...',
                fontSize: 14,
              },
              {
                id: 'fld_produto',
                nome: 'Produto/Coleção',
                tipo: 'vinculado_produto',
                obrigatorio: false,
                paginaNumero: 1,
                x: 60,
                y: 250,
                width: 320,
                height: 38,
                vinculoCrm: 'produto_nome',
                placeholder: 'Piso Vinílico / Ripado / Rodapé...',
                fontSize: 14,
              },
              {
                id: 'fld_area_instalada',
                nome: 'Área instalada (m²)',
                tipo: 'numero',
                obrigatorio: false,
                paginaNumero: 1,
                x: 400,
                y: 250,
                width: 250,
                height: 38,
                vinculoCrm: 'area_instalada',
                placeholder: 'Ex: 120,50 m²',
                fontSize: 14,
              },
              {
                id: 'fld_data_instalacao',
                nome: 'Data da instalação',
                tipo: 'data',
                obrigatorio: false,
                paginaNumero: 1,
                x: 60,
                y: 305,
                width: 280,
                height: 38,
                vinculoCrm: 'data_instalacao',
                fontSize: 14,
              },
              {
                id: 'fld_observacoes',
                nome: 'Observações',
                tipo: 'textarea',
                obrigatorio: false,
                paginaNumero: 1,
                x: 60,
                y: 360,
                width: 590,
                height: 75,
                placeholder: 'Observações gerais, garantia e especificações...',
                fontSize: 13,
              },
              {
                id: 'fld_ass_normal',
                nome: 'Assinatura do Cliente',
                tipo: 'assinatura_normal',
                obrigatorio: false,
                paginaNumero: 1,
                x: 60,
                y: 520,
                width: 280,
                height: 90,
              },
              {
                id: 'fld_ass_govbr',
                nome: 'Assinatura Digital gov.br',
                tipo: 'assinatura_govbr',
                obrigatorio: false,
                paginaNumero: 1,
                x: 370,
                y: 520,
                width: 280,
                height: 90,
              },
            ];

      setTitulo(modelo.titulo || 'Modelo de Documento');
      setCategoriaId(modelo.categoriaId || (categorias[0]?.id || ''));
      setPaginas(initialPages);
      setCampos(initialCampos);
      setCurrentPageIndex(0);
      setSelectedCampoId(null);
      setSaveStatus('saved');
      setUndoStack([]);
      setRedoStack([]);

      setInitialSnapshot({
        titulo: modelo.titulo || 'Modelo de Documento',
        campos: JSON.parse(JSON.stringify(initialCampos)),
        paginas: JSON.parse(JSON.stringify(initialPages)),
      });
    }
  }, [modelo, categorias, isOpen]);

  // Página atual
  const currentPage = paginas[currentPageIndex] || paginas[0] || createBlankPage(1);
  const pageWidth = currentPage.width || 794;
  const pageHeight = currentPage.height || 1123;
  const pageNumero = currentPageIndex + 1;

  // Campos sobre a página atual
  const camposPaginaAtual = campos.filter((c) => (c.paginaNumero || 1) === pageNumero);

  // Campo selecionado
  const selectedCampo = campos.find((c) => c.id === selectedCampoId) || null;

  // Histórico
  const recordHistory = () => {
    setUndoStack((prev) => [
      ...prev.slice(-25),
      {
        campos: JSON.parse(JSON.stringify(campos)),
        titulo,
        paginas: JSON.parse(JSON.stringify(paginas)),
      },
    ]);
    setRedoStack([]);
  };

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const prev = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setRedoStack((s) => [
      ...s,
      {
        campos: JSON.parse(JSON.stringify(campos)),
        titulo,
        paginas: JSON.parse(JSON.stringify(paginas)),
      },
    ]);
    setCampos(prev.campos);
    setTitulo(prev.titulo);
    setPaginas(prev.paginas);
    setSaveStatus('dirty');
    showToast('Ação desfeita');
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((s) => s.slice(0, -1));
    setUndoStack((s) => [
      ...s,
      {
        campos: JSON.parse(JSON.stringify(campos)),
        titulo,
        paginas: JSON.parse(JSON.stringify(paginas)),
      },
    ]);
    setCampos(next.campos);
    setTitulo(next.titulo);
    setPaginas(next.paginas);
    setSaveStatus('dirty');
    showToast('Ação refeita');
  };

  // Atualizar campo selecionado
  const updateSelectedCampo = (updates: Partial<DocumentoCampoModelo>, pushHistory = false) => {
    if (!selectedCampoId) return;
    if (pushHistory) recordHistory();
    setCampos((prev) =>
      prev.map((c) => (c.id === selectedCampoId ? { ...c, ...updates } : c))
    );
    setSaveStatus('dirty');
  };

  // Adicionar novo campo sobre o PDF
  const handleAddCampo = (tipo: TipoCampoModelo) => {
    recordHistory();
    const config = CAMPO_TIPO_CONFIG[tipo];
    const newId = `fld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    let defaultWidth = 280;
    let defaultHeight = 38;
    if (tipo === 'textarea') {
      defaultWidth = 590;
      defaultHeight = 75;
    } else if (tipo === 'assinatura_normal' || tipo === 'assinatura_govbr') {
      defaultWidth = 280;
      defaultHeight = 90;
    } else if (tipo === 'checkbox') {
      defaultWidth = 220;
      defaultHeight = 32;
    } else if (tipo === 'endereco') {
      defaultWidth = 590;
      defaultHeight = 38;
    }

    // Posição inteligente
    const offset = (camposPaginaAtual.length % 8) * 45;
    const newCampo: DocumentoCampoModelo = {
      id: newId,
      nome: config.label,
      tipo,
      obrigatorio: false,
      paginaNumero: pageNumero,
      x: 60,
      y: Math.min(pageHeight - defaultHeight - 40, 140 + offset),
      width: defaultWidth,
      height: defaultHeight,
      placeholder: `Preencher ${config.label.toLowerCase()}...`,
      fontSize: 14,
      fontFamily: 'Inter, sans-serif',
      color: '#0f172a',
      backgroundColor: '#ffffff',
      borderColor: '#cbd5e1',
      borderWidth: 1,
      borderRadius: 6,
    };

    setCampos([...campos, newCampo]);
    setSelectedCampoId(newId);
    setSaveStatus('dirty');
    showToast(`Campo "${config.label}" adicionado à página ${pageNumero}`);
  };

  // Duplicar campo
  const handleDuplicateCampo = () => {
    if (!selectedCampo) return;
    recordHistory();
    const dupId = `fld_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const dup: DocumentoCampoModelo = {
      ...JSON.parse(JSON.stringify(selectedCampo)),
      id: dupId,
      nome: `${selectedCampo.nome} (Cópia)`,
      x: Math.min(pageWidth - selectedCampo.width, selectedCampo.x + 20),
      y: Math.min(pageHeight - selectedCampo.height, selectedCampo.y + 20),
    };
    setCampos([...campos, dup]);
    setSelectedCampoId(dupId);
    setSaveStatus('dirty');
    showToast('Campo duplicado');
  };

  // Excluir campo
  const handleDeleteCampo = () => {
    if (!selectedCampoId) return;
    recordHistory();
    setCampos(campos.filter((c) => c.id !== selectedCampoId));
    setSelectedCampoId(null);
    setSaveStatus('dirty');
    showToast('Campo excluído');
  };

  // ==========================================
  // SALVAMENTO REAL NO SUPABASE
  // ==========================================
  const executeSave = async (createVersion = false, versionDesc?: string): Promise<DocumentoItem | null> => {
    if (!modelo) return null;
    setIsSaving(true);
    setSaveStatus('saving');

    const selectedCat = categorias.find((c) => c.id === categoriaId);
    const catNome = selectedCat ? selectedCat.nome : 'Modelos';

    const res = await saveDocumentoAsync(
      {
        id: modelo.id,
        titulo: titulo.trim() || 'Modelo de Documento',
        categoriaId,
        categoriaNome: catNome,
        isModelo: true,
        camposModelo: campos,
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
      showToast(res.error || 'Erro ao salvar modelo no Supabase');
      return null;
    }
  };

  // Salvar Modelo Manual
  const handleSaveManual = async () => {
    const saved = await executeSave(true, 'Modelo salvo manualmente');
    if (saved) {
      showToast('Modelo e campos salvos com sucesso no Supabase!');
    }
  };

  // Salvar como Cópia (Cria novo modelo independente no Supabase)
  const handleSaveAsCopy = async () => {
    if (!modelo) return;
    setIsSaving(true);
    const copyTitle = `${titulo.trim() || 'Modelo'} (Cópia)`;
    const newId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const selectedCat = categorias.find((c) => c.id === categoriaId);

    const res = await saveDocumentoAsync(
      {
        id: newId,
        titulo: copyTitle,
        categoriaId,
        categoriaNome: selectedCat ? selectedCat.nome : 'Modelos',
        isModelo: true,
        camposModelo: JSON.parse(JSON.stringify(campos)),
        paginas: JSON.parse(JSON.stringify(paginas)),
        totalPaginas: paginas.length,
        isPdfImportado: modelo.isPdfImportado,
        nomeArquivoOriginal: modelo.nomeArquivoOriginal,
      },
      undefined,
      currentUserName,
      { createVersion: true, versionDesc: 'Cópia independente do modelo criada' }
    );

    setIsSaving(false);
    if (res.success && res.item) {
      showToast(`Cópia independente "${copyTitle}" criada no Supabase!`);
      onSaved(res.item);
    } else {
      showToast(res.error || 'Erro ao gerar cópia');
    }
  };

  // Restaurar Original
  const handleRestoreOriginal = () => {
    if (!initialSnapshot) return;
    if (
      window.confirm(
        'Tem certeza que deseja restaurar o modelo ao seu estado original ao abrir? Quaisquer campos recém-adicionados serão revertidos.'
      )
    ) {
      recordHistory();
      setTitulo(initialSnapshot.titulo);
      setCampos(JSON.parse(JSON.stringify(initialSnapshot.campos)));
      setPaginas(JSON.parse(JSON.stringify(initialSnapshot.paginas)));
      setCurrentPageIndex(0);
      setSelectedCampoId(null);
      setSaveStatus('dirty');
      showToast('Modelo restaurado ao original.');
    }
  };

  // Autosave a cada 40s se houver alterações
  useEffect(() => {
    if (saveStatus !== 'dirty') return;
    const timer = setTimeout(() => {
      executeSave(false, 'Autosave automático do modelo');
    }, 40000);
    return () => clearTimeout(timer);
  }, [saveStatus, campos, titulo, paginas]);

  // Drag & Resize Mouse Handlers
  const handleMouseDownCampo = (e: React.MouseEvent, campoId: string) => {
    e.stopPropagation();
    setSelectedCampoId(campoId);
    const target = campos.find((c) => c.id === campoId);
    if (!target) return;

    setIsDragging(true);
    setDragStartPos({ x: e.clientX, y: e.clientY });
    setCampoStartBounds({
      x: target.x,
      y: target.y,
      w: target.width,
      h: target.height,
    });
  };

  const handleMouseMoveCanvas = (e: React.MouseEvent) => {
    if (!selectedCampoId) return;

    if (isDragging) {
      const dx = (e.clientX - dragStartPos.x) / zoom;
      const dy = (e.clientY - dragStartPos.y) / zoom;
      const newX = Math.max(0, Math.min(pageWidth - campoStartBounds.w, Math.round(campoStartBounds.x + dx)));
      const newY = Math.max(0, Math.min(pageHeight - campoStartBounds.h, Math.round(campoStartBounds.y + dy)));

      updateSelectedCampo({ x: newX, y: newY }, false);
    } else if (isResizing) {
      const dx = (e.clientX - dragStartPos.x) / zoom;
      const dy = (e.clientY - dragStartPos.y) / zoom;

      let newW = campoStartBounds.w;
      let newH = campoStartBounds.h;
      let newX = campoStartBounds.x;
      let newY = campoStartBounds.y;

      if (resizeHandle.includes('e')) newW = Math.max(60, Math.round(campoStartBounds.w + dx));
      if (resizeHandle.includes('s')) newH = Math.max(24, Math.round(campoStartBounds.h + dy));
      if (resizeHandle.includes('w')) {
        const potW = campoStartBounds.w - dx;
        if (potW >= 60) {
          newW = Math.round(potW);
          newX = Math.round(campoStartBounds.x + dx);
        }
      }
      if (resizeHandle.includes('n')) {
        const potH = campoStartBounds.h - dy;
        if (potH >= 24) {
          newH = Math.round(potH);
          newY = Math.round(campoStartBounds.y + dy);
        }
      }

      updateSelectedCampo({ width: newW, height: newH, x: newX, y: newY }, false);
    }
  };

  const handleMouseUpCanvas = () => {
    if (isDragging || isResizing) {
      recordHistory();
    }
    setIsDragging(false);
    setIsResizing(false);
  };

  if (!isOpen || !modelo) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070d19] text-slate-100 select-none overflow-hidden font-sans">
      {/* ==========================================
          BARRA SUPERIOR: CONTROLES & AÇÕES
         ========================================== */}
      <div className="h-14 px-4 bg-[#0a1222] border-b border-slate-800 flex items-center justify-between shrink-0 z-30 shadow-md">
        {/* Esquerda: Fechar, Título do Modelo, Categoria */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar Editor de Modelos"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-[#0055ff]/20 text-[#0055ff] border border-[#0055ff]/30 uppercase">
              Modelo Editável
            </span>
            <input
              type="text"
              value={titulo}
              onChange={(e) => {
                setTitulo(e.target.value);
                setSaveStatus('dirty');
              }}
              placeholder="Nome do Modelo..."
              className="bg-[#121c2e] border border-slate-700/80 text-sm font-bold text-white px-2.5 py-1 rounded-lg focus:outline-none focus:border-[#0055ff] max-w-[200px] md:max-w-[280px]"
            />
          </div>
        </div>

        {/* Centro: Desfazer, Refazer, Autosave Status, Versões */}
        <div className="flex items-center gap-2 md:gap-3">
          <button
            onClick={handleUndo}
            disabled={undoStack.length === 0}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors flex items-center gap-1 cursor-pointer"
            title="Desfazer"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="text-xs hidden xl:inline">Desfazer</span>
          </button>

          <button
            onClick={handleRedo}
            disabled={redoStack.length === 0}
            className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors flex items-center gap-1 cursor-pointer"
            title="Refazer"
          >
            <RotateCw className="w-4 h-4" />
            <span className="text-xs hidden xl:inline">Refazer</span>
          </button>

          <div className="h-4 w-px bg-slate-800 hidden md:block" />

          {/* Status Autosave */}
          <div className="text-xs flex items-center gap-1.5 px-2.5 py-1 bg-[#121c2e] rounded-lg border border-slate-800">
            {isSaving || saveStatus === 'saving' ? (
              <span className="text-amber-400 flex items-center gap-1 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" /> Salvando...
              </span>
            ) : saveStatus === 'dirty' ? (
              <span className="text-amber-300 flex items-center gap-1 font-medium">
                <span className="w-2 h-2 rounded-full bg-amber-400" /> Modificado
              </span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                {lastAutoSaveTime ? `Salvo às ${lastAutoSaveTime}` : 'Salvo no Supabase'}
              </span>
            )}
          </div>

          <button
            onClick={() => setIsVersoesOpen(true)}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-[#121c2e] hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Histórico de Versões"
          >
            <History className="w-3.5 h-3.5 text-indigo-400" />
            <span className="hidden lg:inline">Histórico</span>
          </button>
        </div>

        {/* Direita: Restaurar Original, Salvar Cópia, USAR MODELO, Salvar Modelo */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleRestoreOriginal}
            className="px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-[#121c2e] hover:bg-slate-800 border border-slate-700/60 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Restaurar estado original"
          >
            <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden xl:inline">Restaurar</span>
          </button>

          <button
            onClick={handleSaveAsCopy}
            disabled={isSaving}
            className="px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:text-white bg-emerald-500/15 hover:bg-emerald-600 border border-emerald-500/30 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Criar novo modelo independente"
          >
            <CopyPlus className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Salvar como Cópia</span>
          </button>

          {/* BOTÃO EM DESTAQUE: USAR MODELO */}
          <button
            onClick={async () => {
              const saved = await executeSave(false);
              if (saved) {
                onUseModelo(saved);
              } else if (modelo) {
                onUseModelo({
                  ...modelo,
                  titulo,
                  camposModelo: campos,
                  paginas,
                });
              }
            }}
            className="px-3.5 py-1.5 text-xs font-extrabold text-white bg-linear-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 rounded-lg shadow-md shadow-emerald-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
            title="Abrir tela dividida para preencher formulário e gerar PDF"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Usar Modelo</span>
          </button>

          {/* Salvar Modelo */}
          <button
            onClick={handleSaveManual}
            disabled={isSaving}
            className="px-4 py-1.5 text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0044cc] rounded-lg shadow-md shadow-[#0055ff]/25 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Salvar Modelo</span>
          </button>
        </div>
      </div>

      {/* Toast */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0055ff] text-white px-4 py-2 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <Info className="w-4 h-4" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ==========================================
          CORPO PRINCIPAL (3 COLUNAS)
          - Esquerda: Catálogo de Tipos de Campos & Miniaturas
          - Centro: Visualização grande do PDF com Campos SOBRE o documento
          - Direita: Painel de Propriedades do Campo Selecionado
         ========================================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* ----------------------------------------------------
            COLUNA ESQUERDA: PALETA DE CAMPOS & PÁGINAS
           ---------------------------------------------------- */}
        <div className="w-64 bg-[#0a1222] border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto">
          {/* Cabeçalho de Adicionar Campos */}
          <div className="p-3 border-b border-slate-800">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[#0055ff]" />
              Adicionar Campo ao PDF
            </h4>
            <p className="text-[11px] text-slate-400 mt-1 leading-tight">
              Clique para posicionar um campo editável sobre a página atual do PDF.
            </p>
          </div>

          {/* Lista de Tipos de Campos */}
          <div className="p-2 space-y-1">
            {(Object.keys(CAMPO_TIPO_CONFIG) as TipoCampoModelo[]).map((tipoKey) => {
              const cfg = CAMPO_TIPO_CONFIG[tipoKey];
              const IconComp = cfg.icon;

              return (
                <button
                  key={tipoKey}
                  onClick={() => handleAddCampo(tipoKey)}
                  className="w-full text-left p-2 rounded-xl bg-[#121c2e]/60 hover:bg-[#121c2e] hover:border-slate-700 border border-transparent flex items-center gap-2.5 transition-all group cursor-pointer"
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${cfg.cor}20`, color: cfg.cor }}
                  >
                    <IconComp className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-200 group-hover:text-white truncate">
                      {cfg.label}
                    </div>
                    <div className="text-[10px] text-slate-500 truncate">{cfg.desc}</div>
                  </div>
                  <Plus className="w-3.5 h-3.5 text-slate-500 group-hover:text-[#0055ff] opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>

          {/* Navegação de Páginas do Modelo */}
          <div className="mt-auto p-3 border-t border-slate-800 bg-[#080f1d]">
            <div className="flex items-center justify-between text-xs font-bold text-slate-300 mb-2">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#0055ff]" />
                Páginas do PDF ({paginas.length})
              </span>
              <span className="text-[10px] text-slate-500">Pág {pageNumero} de {paginas.length}</span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
                disabled={currentPageIndex === 0}
                className="flex-1 py-1.5 bg-[#121c2e] hover:bg-slate-700 disabled:opacity-30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
              <button
                onClick={() => setCurrentPageIndex((p) => Math.min(paginas.length - 1, p + 1))}
                disabled={currentPageIndex === paginas.length - 1}
                className="flex-1 py-1.5 bg-[#121c2e] hover:bg-slate-700 disabled:opacity-30 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer"
              >
                Próxima <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ----------------------------------------------------
            COLUNA CENTRAL: VISUALIZAÇÃO GRANDE DO PDF COM CAMPOS
           ---------------------------------------------------- */}
        <div
          className="flex-1 bg-[#050913] overflow-auto p-8 flex flex-col items-center justify-start relative select-none"
          onClick={() => setSelectedCampoId(null)}
          onMouseMove={handleMouseMoveCanvas}
          onMouseUp={handleMouseUpCanvas}
        >
          {/* Floating Zoom */}
          <div className="fixed bottom-6 right-84 z-30 flex items-center gap-2 bg-[#091122]/95 backdrop-blur-md border border-slate-700/80 rounded-xl px-2.5 py-1.5 shadow-2xl">
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

          {/* Canvas do PDF Preservando Dimensões Nativas */}
          <div
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
              backgroundImage: currentPage.backgroundImage ? `url(${currentPage.backgroundImage})` : undefined,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Elementos nativos de fundo da página (se houver) */}
            {currentPage.elementos?.map((el) => (
              <div
                key={el.id}
                className="absolute pointer-events-none select-none opacity-90"
                style={{
                  left: `${el.x}px`,
                  top: `${el.y}px`,
                  width: `${el.width}px`,
                  height: `${el.height}px`,
                  fontSize: el.fontSize ? `${el.fontSize}px` : '14px',
                  color: el.color || '#0f172a',
                  fontWeight: el.fontWeight || 'normal',
                }}
              >
                {el.conteudo}
              </div>
            ))}

            {/* CAMPOS SOBRE O DOCUMENTO */}
            {camposPaginaAtual.map((campo) => {
              const isSelected = campo.id === selectedCampoId;
              const config = CAMPO_TIPO_CONFIG[campo.tipo] || CAMPO_TIPO_CONFIG.texto;
              const IconComp = config.icon;

              return (
                <div
                  key={campo.id}
                  onMouseDown={(e) => handleMouseDownCampo(e, campo.id)}
                  className={`absolute group cursor-move select-none transition-shadow ${
                    isSelected
                      ? 'ring-2 ring-[#0055ff] shadow-xl z-30'
                      : 'hover:ring-1 hover:ring-blue-400 z-10'
                  }`}
                  style={{
                    left: `${campo.x}px`,
                    top: `${campo.y}px`,
                    width: `${campo.width}px`,
                    height: `${campo.height}px`,
                  }}
                >
                  {/* Container Visual do Campo SOBRE o PDF */}
                  <div
                    className="w-full h-full rounded-md border flex flex-col justify-between overflow-hidden relative shadow-xs"
                    style={{
                      backgroundColor: campo.backgroundColor || 'rgba(248, 250, 252, 0.92)',
                      borderColor: isSelected ? '#0055ff' : campo.borderColor || '#cbd5e1',
                      borderWidth: `${campo.borderWidth || 1}px`,
                    }}
                  >
                    {/* Header do Campo: Label e Tipo */}
                    <div
                      className="px-2 py-0.5 flex items-center justify-between text-[10px] font-bold border-b"
                      style={{
                        backgroundColor: `${config.cor}15`,
                        borderColor: `${config.cor}30`,
                        color: config.cor,
                      }}
                    >
                      <span className="truncate flex items-center gap-1">
                        <IconComp className="w-3 h-3 shrink-0" />
                        {campo.nome}
                        {campo.obrigatorio && <span className="text-red-500">*</span>}
                      </span>

                      <span className="text-[9px] uppercase px-1 py-0.2 rounded bg-white/70">
                        {config.label}
                      </span>
                    </div>

                    {/* Corpo de Prévia do Campo */}
                    <div className="flex-1 px-2 flex items-center justify-between text-xs text-slate-500 italic truncate">
                      <span className="truncate">
                        {campo.placeholder || `[${campo.nome}]`}
                      </span>

                      {campo.tipo === 'assinatura_normal' && (
                        <PenTool className="w-4 h-4 text-blue-500 opacity-60 shrink-0" />
                      )}
                      {campo.tipo === 'assinatura_govbr' && (
                        <ShieldCheck className="w-4 h-4 text-emerald-600 opacity-80 shrink-0" />
                      )}
                      {campo.tipo === 'checkbox' && (
                        <CheckSquare className="w-4 h-4 text-emerald-500 opacity-60 shrink-0" />
                      )}
                    </div>
                  </div>

                  {/* Alças de Redimensionamento se selecionado */}
                  {isSelected && (
                    <>
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsResizing(true);
                          setResizeHandle('se');
                          setDragStartPos({ x: e.clientX, y: e.clientY });
                          setCampoStartBounds({
                            x: campo.x,
                            y: campo.y,
                            w: campo.width,
                            h: campo.height,
                          });
                        }}
                        className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-[#0055ff] border-2 border-white rounded-full cursor-se-resize z-40"
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsResizing(true);
                          setResizeHandle('e');
                          setDragStartPos({ x: e.clientX, y: e.clientY });
                          setCampoStartBounds({
                            x: campo.x,
                            y: campo.y,
                            w: campo.width,
                            h: campo.height,
                          });
                        }}
                        className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-3 h-3 bg-[#0055ff] border-2 border-white rounded-full cursor-e-resize z-40"
                      />
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setIsResizing(true);
                          setResizeHandle('s');
                          setDragStartPos({ x: e.clientX, y: e.clientY });
                          setCampoStartBounds({
                            x: campo.x,
                            y: campo.y,
                            w: campo.width,
                            h: campo.height,
                          });
                        }}
                        className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#0055ff] border-2 border-white rounded-full cursor-s-resize z-40"
                      />
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ----------------------------------------------------
            COLUNA DIREITA: PROPRIEDADES DO CAMPO SELECIONADO
           ---------------------------------------------------- */}
        <div className="w-80 bg-[#0a1222] border-l border-slate-800 flex flex-col shrink-0 overflow-y-auto">
          <div className="p-3 border-b border-slate-800">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="w-3.5 h-3.5 text-[#0055ff]" />
              Propriedades do Campo
            </h4>
          </div>

          {selectedCampo ? (
            <div className="p-4 space-y-4 text-xs">
              {/* Nome / Label */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Nome do Campo (Rótulo no Formulário) *
                </label>
                <input
                  type="text"
                  value={selectedCampo.nome}
                  onChange={(e) => updateSelectedCampo({ nome: e.target.value }, true)}
                  className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-white font-medium focus:outline-none focus:border-[#0055ff]"
                />
              </div>

              {/* Tipo do Campo */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Tipo de Dado
                </label>
                <select
                  value={selectedCampo.tipo}
                  onChange={(e) =>
                    updateSelectedCampo({ tipo: e.target.value as TipoCampoModelo }, true)
                  }
                  className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0055ff]"
                >
                  {(Object.keys(CAMPO_TIPO_CONFIG) as TipoCampoModelo[]).map((k) => (
                    <option key={k} value={k}>
                      {CAMPO_TIPO_CONFIG[k].label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Toggle Obrigatório */}
              <div className="flex items-center justify-between p-2.5 bg-[#121c2e] rounded-xl border border-slate-800">
                <div>
                  <span className="font-bold text-slate-200">Campo Obrigatório</span>
                  <p className="text-[10px] text-slate-400">Exigir preenchimento ao usar modelo</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(selectedCampo.obrigatorio)}
                  onChange={(e) => updateSelectedCampo({ obrigatorio: e.target.checked }, true)}
                  className="w-4 h-4 text-[#0055ff] rounded focus:ring-0 cursor-pointer"
                />
              </div>

              {/* Vínculo CRM */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Preenchimento Automático do CRM
                </label>
                <select
                  value={selectedCampo.vinculoCrm || ''}
                  onChange={(e) => updateSelectedCampo({ vinculoCrm: e.target.value }, true)}
                  className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0055ff]"
                >
                  <option value="">Sem vínculo automático (Preenchimento manual)</option>
                  <optgroup label="Dados do Cliente">
                    <option value="cliente_nome">Nome Completo do Cliente</option>
                    <option value="cliente_documento">CPF ou CNPJ</option>
                    <option value="cliente_telefone">Telefone / WhatsApp</option>
                    <option value="cliente_email">E-mail</option>
                    <option value="cliente_endereco">Endereço Completo</option>
                  </optgroup>
                  <optgroup label="Dados do Pedido / Orçamento">
                    <option value="pedido_numero">Número do Pedido</option>
                    <option value="pedido_total">Valor Total do Pedido</option>
                    <option value="pedido_responsavel">Responsável / Vendedor</option>
                    <option value="pedido_data">Data do Pedido</option>
                    <option value="pedido_produtos">Lista de Produtos / Materiais</option>
                    <option value="area_instalada">Área Total Instalada (m²)</option>
                    <option value="data_instalacao">Data da Instalação</option>
                  </optgroup>
                </select>
              </div>

              {/* Opções (se dropdown de seleção) */}
              {selectedCampo.tipo === 'selecao' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Opções de Escolha (separadas por vírgula)
                  </label>
                  <textarea
                    rows={2}
                    value={selectedCampo.opcoes?.join(', ') || ''}
                    onChange={(e) =>
                      updateSelectedCampo(
                        {
                          opcoes: e.target.value
                            .split(',')
                            .map((s) => s.trim())
                            .filter(Boolean),
                        },
                        true
                      )
                    }
                    placeholder="Opção A, Opção B, Opção C..."
                    className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg p-2 text-white text-xs focus:outline-none focus:border-[#0055ff]"
                  />
                </div>
              )}

              {/* Placeholder */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">
                  Texto de Ajuda / Placeholder
                </label>
                <input
                  type="text"
                  value={selectedCampo.placeholder || ''}
                  onChange={(e) => updateSelectedCampo({ placeholder: e.target.value }, true)}
                  placeholder="Ex: Digite o nome do cliente..."
                  className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-white focus:outline-none focus:border-[#0055ff]"
                />
              </div>

              {/* Coordenadas e Dimensões */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-800">
                <div>
                  <label className="block text-[10px] text-slate-400">Largura (px)</label>
                  <input
                    type="number"
                    value={selectedCampo.width}
                    onChange={(e) => updateSelectedCampo({ width: Number(e.target.value) }, true)}
                    className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2 py-1 text-white text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400">Altura (px)</label>
                  <input
                    type="number"
                    value={selectedCampo.height}
                    onChange={(e) => updateSelectedCampo({ height: Number(e.target.value) }, true)}
                    className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2 py-1 text-white text-xs"
                  />
                </div>
              </div>

              {/* Ações do Campo: Duplicar e Excluir */}
              <div className="pt-3 border-t border-slate-800 flex items-center gap-2">
                <button
                  onClick={handleDuplicateCampo}
                  className="flex-1 py-1.5 bg-[#121c2e] hover:bg-slate-700 text-slate-200 rounded-lg font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicar</span>
                </button>
                <button
                  onClick={handleDeleteCampo}
                  className="p-1.5 bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/30 rounded-lg transition-colors cursor-pointer"
                  title="Excluir Campo"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 text-center text-slate-500 flex flex-col items-center justify-center gap-2">
              <Sliders className="w-8 h-8 opacity-40 text-[#0055ff]" />
              <p className="text-xs font-semibold text-slate-400">Nenhum campo selecionado</p>
              <p className="text-[11px] text-slate-500 max-w-[200px]">
                Clique em qualquer campo sobre o PDF para editar suas propriedades, nome e vínculo com o CRM.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Histórico de Versões */}
      {isVersoesOpen && (
        <VersoesModal
          isOpen={isVersoesOpen}
          documentoId={modelo.id}
          documentoTitulo={titulo}
          versoes={modelo.versoes || []}
          currentUserName={currentUserName}
          onClose={() => setIsVersoesOpen(false)}
          onRestore={(v) => {
            recordHistory();
            setPaginas(v.paginas);
            setSaveStatus('dirty');
            setIsVersoesOpen(false);
            showToast(`Versão "${v.descricao}" restaurada.`);
          }}
        />
      )}
    </div>
  );
};
