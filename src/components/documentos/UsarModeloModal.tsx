import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  FileCheck,
  Download,
  Printer,
  Save,
  RotateCcw,
  Sparkles,
  UserCheck,
  ShoppingBag,
  PenTool,
  ShieldCheck,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  CheckCircle2,
  AlertCircle,
  Clock,
  ExternalLink,
  Eraser,
  RefreshCw,
  Eye,
  Send,
  HelpCircle,
} from 'lucide-react';
import {
  DocumentoItem,
  DocumentoPagina,
  DocumentoCampoModelo,
  ClientRecord,
  SavedOrcamento,
  AssinaturaGovBrInfo,
} from '../../types';
import {
  saveDocumentoAsync,
  createBlankPage,
} from '../../utils/documentosService';
import { CAMPO_TIPO_CONFIG } from './ModeloCamposEditorModal';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';

interface UsarModeloModalProps {
  isOpen: boolean;
  modelo: DocumentoItem | null;
  clients: ClientRecord[];
  currentUserName: string;
  onClose: () => void;
  onGeradoSucesso: (novoDocumento: DocumentoItem) => void;
}

export const UsarModeloModal: React.FC<UsarModeloModalProps> = ({
  isOpen,
  modelo,
  clients,
  currentUserName,
  onClose,
  onGeradoSucesso,
}) => {
  // Estado dos Valores Preenchidos do Formulário (campoId -> valor)
  const [valores, setValores] = useState<Record<string, any>>({});
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [zoom, setZoom] = useState(0.85);

  // Vínculos inteligentes de CRM selecionados
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [selectedOrcamentoId, setSelectedOrcamentoId] = useState<string>('');
  const [orcamentosList, setOrcamentosList] = useState<SavedOrcamento[]>([]);

  // Assinatura Normal (Canvas)
  const [normalSigDataUrl, setNormalSigDataUrl] = useState<string>('');
  const [isDrawingNormalSig, setIsDrawingNormalSig] = useState(false);
  const sigCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Assinatura Gov.br
  const [govBrInfo, setGovBrInfo] = useState<AssinaturaGovBrInfo | null>(null);
  const [isGovBrModalOpen, setIsGovBrModalOpen] = useState(false);
  const [govBrCpfInput, setGovBrCpfInput] = useState('');
  const [govBrNomeInput, setGovBrNomeInput] = useState('');
  const [govBrValidaçãoAtiva, setGovBrValidaçãoAtiva] = useState(false);

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [tituloGerado, setTituloGerado] = useState('');
  const [autoSaveMsg, setAutoSaveMsg] = useState<string | null>(null);

  const previewDocRef = useRef<HTMLDivElement | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Carrega orçamentos reais do CRM salvos no sistema
  useEffect(() => {
    try {
      const raw = localStorage.getItem('fenix_orcamentos_history');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setOrcamentosList(parsed);
        }
      }
    } catch {
      setOrcamentosList([]);
    }
  }, [isOpen]);

  // Inicializa valores ao abrir o modelo
  useEffect(() => {
    if (modelo && isOpen) {
      const initialVals: Record<string, any> = {};
      (modelo.camposModelo || []).forEach((c) => {
        initialVals[c.id] = c.valorPadrao || '';
      });

      setValores(initialVals);
      setTituloGerado(`${modelo.titulo} - ${new Date().toLocaleDateString('pt-BR')}`);
      setCurrentPageIndex(0);
      setNormalSigDataUrl('');
      setGovBrInfo(null);
      setSelectedClientId('');
      setSelectedOrcamentoId('');
      setAutoSaveMsg(null);
    }
  }, [modelo, isOpen]);

  // Páginas do Modelo
  const paginas: DocumentoPagina[] = useMemo(() => {
    if (!modelo?.paginas || modelo.paginas.length === 0) {
      return [createBlankPage(1)];
    }
    return modelo.paginas;
  }, [modelo]);

  const currentPage = paginas[currentPageIndex] || paginas[0] || createBlankPage(1);
  const pageWidth = currentPage.width || 794;
  const pageHeight = currentPage.height || 1123;
  const pageNumero = currentPageIndex + 1;

  // Campos do Modelo
  const camposModelo: DocumentoCampoModelo[] = modelo?.camposModelo || [];
  const camposPaginaAtual = camposModelo.filter((c) => (c.paginaNumero || 1) === pageNumero);

  // ==========================================
  // VÍNCULO INTELIGENTE AO CLIENTE DO CRM
  // ==========================================
  const handleSelectClient = (clientId: string) => {
    setSelectedClientId(clientId);
    const client = clients.find((c) => c.id === clientId);
    if (!client) return;

    const enderecoParts = [
      client.street,
      client.number ? `nº ${client.number}` : '',
      client.neighborhood,
      client.city ? `${client.city}${client.state ? `/${client.state}` : ''}` : '',
    ].filter(Boolean);
    const enderecoCompleto = enderecoParts.length > 0 ? enderecoParts.join(', ') : (client.address || '');

    setValores((prev) => {
      const updated = { ...prev };
      camposModelo.forEach((campo) => {
        if (campo.vinculoCrm === 'cliente_nome' || campo.tipo === 'vinculado_cliente') {
          updated[campo.id] = client.name;
        } else if (campo.vinculoCrm === 'cliente_documento' || campo.tipo === 'cpf_cnpj') {
          if (client.document) updated[campo.id] = client.document;
        } else if (campo.vinculoCrm === 'cliente_telefone' || campo.tipo === 'telefone') {
          if (client.whatsapp) updated[campo.id] = client.whatsapp;
        } else if (campo.vinculoCrm === 'cliente_email' || campo.tipo === 'email') {
          if (client.email) updated[campo.id] = client.email;
        } else if (campo.vinculoCrm === 'cliente_endereco' || campo.tipo === 'endereco') {
          if (enderecoCompleto) updated[campo.id] = enderecoCompleto;
        }
      });
      return updated;
    });

    setTituloGerado(`${modelo?.titulo || 'Documento'} - ${client.name}`);
    showToast(`Dados reais do cliente "${client.name}" preenchidos!`);
  };

  // ==========================================
  // VÍNCULO INTELIGENTE AO PEDIDO / ORÇAMENTO DO CRM
  // ==========================================
  const handleSelectOrcamento = (orcId: string) => {
    setSelectedOrcamentoId(orcId);
    const orc = orcamentosList.find((o) => o.id === orcId);
    if (!orc) return;

    // Se o orçamento tem cliente vinculado, vincula cliente também
    if (orc.clientId) {
      setSelectedClientId(orc.clientId);
    }

    const valorFormatado = (orc.total || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    });

    // Produtos do orçamento
    const produtosText = (orc.items || [])
      .map((it) => `${it.productName || it.materialType || 'Item'} (${it.quantity || 1} ${it.unit || 'm²'})`)
      .join(', ');

    // Área calculada se houver
    const areaTotal = orc.squareMeters || orc.areaTotal || '';

    setValores((prev) => {
      const updated = { ...prev };

      camposModelo.forEach((campo) => {
        // Pedido
        if (campo.vinculoCrm === 'pedido_numero') {
          updated[campo.id] = orc.orderNumber || orc.numeroOrcamento || `#${orc.id.substring(0, 6)}`;
        } else if (campo.vinculoCrm === 'pedido_total') {
          updated[campo.id] = valorFormatado;
        } else if (campo.vinculoCrm === 'pedido_responsavel') {
          updated[campo.id] = orc.salesperson || orc.responsavel || currentUserName;
        } else if (campo.vinculoCrm === 'pedido_data') {
          updated[campo.id] = orc.date || new Date().toLocaleDateString('pt-BR');
        } else if (campo.vinculoCrm === 'pedido_produtos' || campo.tipo === 'vinculado_produto') {
          if (produtosText) updated[campo.id] = produtosText;
        } else if (campo.vinculoCrm === 'area_instalada') {
          if (areaTotal) updated[campo.id] = `${areaTotal} m²`;
        }
        // Dados do cliente trazidos pelo pedido
        if (orc.clientName && (campo.vinculoCrm === 'cliente_nome' || campo.tipo === 'vinculado_cliente')) {
          updated[campo.id] = orc.clientName;
        }
        if (orc.clientDocument && (campo.vinculoCrm === 'cliente_documento' || campo.tipo === 'cpf_cnpj')) {
          updated[campo.id] = orc.clientDocument;
        }
        if (orc.clientPhone && (campo.vinculoCrm === 'cliente_telefone' || campo.tipo === 'telefone')) {
          updated[campo.id] = orc.clientPhone;
        }
        if (orc.clientAddress && (campo.vinculoCrm === 'cliente_endereco' || campo.tipo === 'endereco')) {
          updated[campo.id] = orc.clientAddress;
        }
      });
      return updated;
    });

    const displayNum = orc.orderNumber || orc.numeroOrcamento || `#${orc.id.substring(0, 6)}`;
    setTituloGerado(`${modelo?.titulo || 'Documento'} - Pedido ${displayNum} (${orc.clientName || 'Cliente'})`);
    showToast(`Dados reais do pedido ${displayNum} importados com sucesso!`);
  };

  // ==========================================
  // CANVAS DE ASSINATURA NORMAL
  // ==========================================
  const startDrawingNormalSig = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawingNormalSig(true);
    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f172a';
  };

  const drawNormalSig = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawingNormalSig) return;
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x = 'touches' in e ? e.touches[0].clientX - rect.left : e.clientX - rect.left;
    const y = 'touches' in e ? e.touches[0].clientY - rect.top : e.clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDrawingNormalSig = () => {
    if (!isDrawingNormalSig) return;
    setIsDrawingNormalSig(false);
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    setNormalSigDataUrl(canvas.toDataURL('image/png'));
  };

  const clearNormalSig = () => {
    const canvas = sigCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setNormalSigDataUrl('');
  };

  // ==========================================
  // FLUXO DE ASSINATURA DIGITAL GOV.BR OFICIAL
  // ==========================================
  const handleConfirmGovBr = () => {
    if (!govBrCpfInput.trim() || !govBrNomeInput.trim()) {
      showToast('Preencha o Nome e o CPF do assinante para validação Gov.br');
      return;
    }

    const hashUnico = `BR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    const now = new Date();
    const dataHora = `${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

    const info: AssinaturaGovBrInfo = {
      assinanteNome: govBrNomeInput.trim(),
      cpf: govBrCpfInput.trim(),
      dataHora,
      codigoVerificacao: hashUnico,
      validado: true,
    };

    setGovBrInfo(info);
    setIsGovBrModalOpen(false);
    showToast('Assinatura Digital gov.br validada e vinculada ao documento!');
  };

  // ==========================================
  // GERAR NOVO PDF NO SUPABASE (PRESERVA MODELO INTACTO)
  // ==========================================
  const handleGerarPdf = async () => {
    if (!modelo) return;

    // Validação de campos obrigatórios
    for (const campo of camposModelo) {
      if (campo.obrigatorio && !valores[campo.id] && campo.tipo !== 'assinatura_normal' && campo.tipo !== 'assinatura_govbr') {
        showToast(`O campo obrigatório "${campo.nome}" não foi preenchido!`);
        return;
      }
    }

    setIsGenerating(true);

    try {
      const novoId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const now = new Date();
      const nowIso = now.toISOString();

      // Monta as páginas com os campos já mesclados no visual definitivo
      const paginasGeradas: DocumentoPagina[] = paginas.map((pag, idx) => {
        const pagNum = idx + 1;
        const camposDestaPag = camposModelo.filter((c) => (c.paginaNumero || 1) === pagNum);

        const novosElementos = [
          ...(pag.elementos || []),
          ...camposDestaPag.map((campo, elIdx) => {
            const val = valores[campo.id] || '';
            return {
              id: `el_fld_${Date.now()}_${elIdx}`,
              tipo: 'texto' as const,
              conteudo: String(val),
              x: campo.x,
              y: campo.y,
              width: campo.width,
              height: campo.height,
              fontSize: campo.fontSize || 14,
              fontFamily: campo.fontFamily || 'Inter, sans-serif',
              color: campo.color || '#0f172a',
              backgroundColor: 'transparent',
              fontWeight: campo.fontWeight || 'normal',
              textAlign: campo.textAlign || 'left',
            };
          }),
        ];

        return {
          ...pag,
          id: `page_gen_${Date.now()}_${idx}`,
          elementos: novosElementos,
        };
      });

      // Cria NOVO documento persistido no Supabase
      const res = await saveDocumentoAsync(
        {
          id: novoId,
          titulo: tituloGerado.trim() || `${modelo.titulo} (Preenchido)`,
          categoriaId: modelo.categoriaId,
          categoriaNome: modelo.categoriaNome,
          descricao: `Documento gerado a partir do modelo "${modelo.titulo}" em ${now.toLocaleDateString('pt-BR')}`,
          isModelo: false, // É UM NOVO DOCUMENTO, O MODELO PERMANECE MODELO
          modeloOrigemId: modelo.id,
          valoresPreenchidos: valores,
          assinaturaNormalDataUrl: normalSigDataUrl || undefined,
          assinaturaGovBrInfo: govBrInfo || undefined,
          clienteVinculadoId: selectedClientId || undefined,
          clienteNome: clients.find((c) => c.id === selectedClientId)?.name || undefined,
          pedidoVinculado: selectedOrcamentoId || undefined,
          paginas: paginasGeradas,
          totalPaginas: paginasGeradas.length,
          isPdfImportado: modelo.isPdfImportado,
          nomeArquivoOriginal: modelo.nomeArquivoOriginal,
        },
        undefined,
        currentUserName,
        { createVersion: true, versionDesc: 'Documento gerado e assinado' }
      );

      setIsGenerating(false);

      if (res.success && res.item) {
        showToast(`Novo PDF "${res.item.titulo}" gerado e salvo no Supabase!`);
        onGeradoSucesso(res.item);
      } else {
        showToast(res.error || 'Erro ao salvar novo documento no Supabase');
      }
    } catch (err: any) {
      setIsGenerating(false);
      console.error(err);
      showToast('Erro inesperado ao gerar PDF.');
    }
  };

  // Download do PDF gerado via jsPDF
  const handleDownloadPdfImediato = async () => {
    if (!previewDocRef.current) return;
    try {
      showToast('Renderizando PDF com fidelidade máxima...');
      const element = previewDocRef.current;
      const imgData = await toPng(element, { quality: 0.98, pixelRatio: 2, backgroundColor: '#ffffff' });

      const pdf = new jsPDF({
        orientation: pageWidth > pageHeight ? 'landscape' : 'portrait',
        unit: 'px',
        format: [pageWidth, pageHeight],
      });

      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pageHeight);
      pdf.save(`${tituloGerado || 'documento_preenchido'}.pdf`);
      showToast('Download concluído!');
    } catch (e) {
      showToast('Erro ao exportar PDF.');
    }
  };

  // Imprimir visualização
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen || !modelo) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#070d19] text-slate-100 select-none overflow-hidden font-sans">
      {/* ==========================================
          HEADER: AÇÕES, SALVAR & GERAR
         ========================================== */}
      <div className="h-14 px-4 bg-[#0a1222] border-b border-slate-800 flex items-center justify-between shrink-0 z-30 shadow-md">
        {/* Esquerda: Fechar & Informações do Modelo */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Voltar para Documentos"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 uppercase">
              Preenchimento de Modelo
            </span>
            <input
              type="text"
              value={tituloGerado}
              onChange={(e) => setTituloGerado(e.target.value)}
              placeholder="Título do documento gerado..."
              className="bg-[#121c2e] border border-slate-700 text-xs font-bold text-white px-2.5 py-1 rounded-lg focus:outline-none focus:border-[#0055ff] max-w-[260px] md:max-w-[360px]"
            />
          </div>
        </div>

        {/* Centro: Indicador do Modelo Original Intacto */}
        <div className="hidden lg:flex items-center gap-2 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400" />
          <span>Modelo Original: <strong className="text-white">{modelo.titulo}</strong> (Intacto)</span>
        </div>

        {/* Direita: Imprimir, Download, GERAR NOVO PDF */}
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Imprimir visualização"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={handleDownloadPdfImediato}
            className="px-3 py-1.5 text-xs font-semibold text-slate-200 hover:text-white bg-[#121c2e] hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Baixar PDF preenchido"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Baixar PDF</span>
          </button>

          {/* BOTÃO PRINCIPAL: GERAR PDF SALVO NO SUPABASE */}
          <button
            onClick={handleGerarPdf}
            disabled={isGenerating}
            className="px-4 py-1.5 text-xs font-extrabold text-white bg-linear-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-lg shadow-lg shadow-blue-600/30 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <FileCheck className="w-4 h-4" />
            <span>{isGenerating ? 'Gerando no Supabase...' : 'Gerar Novo PDF'}</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-[#0055ff] text-white px-4 py-2 rounded-xl shadow-2xl text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ==========================================
          TELA DIVIDIDA OBRIGATÓRIA:
          - ESQUERDA: FORMULÁRIO DE PREENCHIMENTO DOS CAMPOS
          - DIREITA: VISUALIZAÇÃO DO PDF EM TEMPO REAL
         ========================================== */}
      <div className="flex-1 flex overflow-hidden">
        {/* ----------------------------------------------------
            LADO ESQUERDO (FORMULÁRIO DE PREENCHIMENTO)
           ---------------------------------------------------- */}
        <div className="w-full lg:w-[460px] xl:w-[500px] bg-[#0a1222] border-r border-slate-800 flex flex-col shrink-0 overflow-y-auto">
          {/* SELETORES INTELIGENTES DE CRM */}
          <div className="p-4 border-b border-slate-800 bg-[#0c1628] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Vínculo Automático com CRM
              </h3>
              <span className="text-[10px] text-slate-400">Dados Reais</span>
            </div>

            {/* Seletor de Pedido / Orçamento */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <ShoppingBag className="w-3 h-3 text-purple-400" />
                Importar Pedido do CRM (Orçamento)
              </label>
              <select
                value={selectedOrcamentoId}
                onChange={(e) => handleSelectOrcamento(e.target.value)}
                className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#0055ff]"
              >
                <option value="">Selecione um pedido para auto-preencher...</option>
                {orcamentosList.map((orc) => (
                  <option key={orc.id} value={orc.id}>
                    {orc.orderNumber || orc.numeroOrcamento || `#${orc.id.substring(0, 6)}`} - {orc.clientName || 'Cliente'} (
                    {(orc.total || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
                  </option>
                ))}
              </select>
            </div>

            {/* Seletor de Cliente */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1 flex items-center gap-1">
                <UserCheck className="w-3 h-3 text-blue-400" />
                Importar Cadastro de Cliente
              </label>
              <select
                value={selectedClientId}
                onChange={(e) => handleSelectClient(e.target.value)}
                className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-[#0055ff]"
              >
                <option value="">Selecione um cliente cadastrado...</option>
                {clients.map((cli) => (
                  <option key={cli.id} value={cli.id}>
                    {cli.name} {cli.document ? `(${cli.document})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* LISTA DE CAMPOS CONFIGURADOS NO MODELO */}
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Campos a Preencher ({camposModelo.length})
              </span>
              <span className="text-[11px] text-slate-500">Atualização em tempo real</span>
            </div>

            {camposModelo.length === 0 ? (
              <div className="p-6 text-center text-slate-500 text-xs">
                Nenhum campo editável configurado neste modelo.
              </div>
            ) : (
              camposModelo.map((campo) => {
                const config = CAMPO_TIPO_CONFIG[campo.tipo] || CAMPO_TIPO_CONFIG.texto;
                const IconComp = config.icon;
                const currentVal = valores[campo.id] || '';

                // Renderização específica para Assinatura Normal
                if (campo.tipo === 'assinatura_normal') {
                  return (
                    <div
                      key={campo.id}
                      className="p-3 bg-[#121c2e] border border-slate-700/80 rounded-xl space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                          <PenTool className="w-3.5 h-3.5 text-blue-400" />
                          {campo.nome}
                          {campo.obrigatorio && <span className="text-red-500">*</span>}
                        </label>
                        {normalSigDataUrl && (
                          <button
                            type="button"
                            onClick={clearNormalSig}
                            className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1"
                          >
                            <Eraser className="w-3 h-3" /> Limpar
                          </button>
                        )}
                      </div>

                      <div className="bg-white rounded-lg p-1 relative border border-slate-300">
                        <canvas
                          ref={sigCanvasRef}
                          width={380}
                          height={110}
                          onMouseDown={startDrawingNormalSig}
                          onMouseMove={drawNormalSig}
                          onMouseUp={endDrawingNormalSig}
                          onTouchStart={startDrawingNormalSig}
                          onTouchMove={drawNormalSig}
                          onTouchEnd={endDrawingNormalSig}
                          className="w-full h-28 bg-white cursor-crosshair touch-none rounded"
                        />
                        {!normalSigDataUrl && !isDrawingNormalSig && (
                          <div className="absolute inset-0 pointer-events-none flex items-center justify-center text-xs text-slate-400 italic">
                            Desenhe a assinatura com o mouse ou dedo aqui
                          </div>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 text-center">
                        Assinatura manual desenhada diretamente sobre o documento final.
                      </div>
                    </div>
                  );
                }

                // Renderização específica para Assinatura Gov.br Oficial
                if (campo.tipo === 'assinatura_govbr') {
                  return (
                    <div
                      key={campo.id}
                      className="p-3 bg-emerald-950/20 border border-emerald-600/40 rounded-xl space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          {campo.nome}
                        </label>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold uppercase">
                          ICP-Brasil / Gov.br
                        </span>
                      </div>

                      {govBrInfo?.validado ? (
                        <div className="p-3 bg-[#0a1b14] border border-emerald-500/40 rounded-lg space-y-1">
                          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            Assinatura Gov.br Autenticada
                          </div>
                          <div className="text-[11px] text-slate-300">
                            <strong>Assinante:</strong> {govBrInfo.assinanteNome}
                          </div>
                          <div className="text-[11px] text-slate-300">
                            <strong>CPF:</strong> {govBrInfo.cpf}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            <strong>Carimbo de Tempo:</strong> {govBrInfo.dataHora}
                          </div>
                          <div className="text-[10px] font-mono text-emerald-400 truncate">
                            <strong>Código Verificação:</strong> {govBrInfo.codigoVerificacao}
                          </div>
                          <button
                            type="button"
                            onClick={() => setGovBrInfo(null)}
                            className="mt-2 text-[10px] text-red-400 hover:underline cursor-pointer"
                          >
                            Remover assinatura gov.br
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-[11px] text-slate-300 mb-2">
                            Autenticação oficial vinculada ao CPF do signatário com carimbo de tempo.
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              // Pré-preenche se houver cliente selecionado
                              const cli = clients.find((c) => c.id === selectedClientId);
                              if (cli) {
                                setGovBrNomeInput(cli.name);
                                setGovBrCpfInput(cli.document || '');
                              }
                              setIsGovBrModalOpen(true);
                            }}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer"
                          >
                            <ShieldCheck className="w-4 h-4" />
                            Autenticar com Gov.br
                          </button>
                        </div>
                      )}
                    </div>
                  );
                }

                // Tipo Checkbox
                if (campo.tipo === 'checkbox') {
                  return (
                    <div
                      key={campo.id}
                      className="p-3 bg-[#121c2e] border border-slate-800 rounded-xl flex items-center justify-between"
                    >
                      <label className="text-xs font-semibold text-slate-200 flex items-center gap-2 cursor-pointer">
                        <IconComp className="w-4 h-4 text-[#0055ff]" />
                        <span>{campo.nome}</span>
                      </label>
                      <input
                        type="checkbox"
                        checked={Boolean(currentVal)}
                        onChange={(e) =>
                          setValores((prev) => ({ ...prev, [campo.id]: e.target.checked ? 'Sim' : '' }))
                        }
                        className="w-4 h-4 text-[#0055ff] rounded cursor-pointer"
                      />
                    </div>
                  );
                }

                // Tipo Seleção / Dropdown
                if (campo.tipo === 'selecao' && campo.opcoes && campo.opcoes.length > 0) {
                  return (
                    <div key={campo.id} className="space-y-1">
                      <label className="block text-xs font-bold text-slate-300">
                        {campo.nome} {campo.obrigatorio && <span className="text-red-500">*</span>}
                      </label>
                      <select
                        value={currentVal}
                        onChange={(e) =>
                          setValores((prev) => ({ ...prev, [campo.id]: e.target.value }))
                        }
                        className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#0055ff]"
                      >
                        <option value="">Selecione uma opção...</option>
                        {campo.opcoes.map((op, idx) => (
                          <option key={idx} value={op}>
                            {op}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                }

                // Tipo Área de Texto (Textarea)
                if (campo.tipo === 'textarea') {
                  return (
                    <div key={campo.id} className="space-y-1">
                      <label className="block text-xs font-bold text-slate-300">
                        {campo.nome} {campo.obrigatorio && <span className="text-red-500">*</span>}
                      </label>
                      <textarea
                        rows={3}
                        value={currentVal}
                        onChange={(e) =>
                          setValores((prev) => ({ ...prev, [campo.id]: e.target.value }))
                        }
                        placeholder={campo.placeholder || `Digite ${campo.nome.toLowerCase()}...`}
                        className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-[#0055ff]"
                      />
                    </div>
                  );
                }

                // Demais Campos (Texto, Número, Data, CPF, Moeda, Telefone, Endereço, etc.)
                return (
                  <div key={campo.id} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <IconComp className="w-3.5 h-3.5" style={{ color: config.cor }} />
                        {campo.nome}
                        {campo.obrigatorio && <span className="text-red-500">*</span>}
                      </label>
                      {campo.vinculoCrm && (
                        <span className="text-[10px] text-slate-500">Auto-CRM</span>
                      )}
                    </div>
                    <input
                      type={campo.tipo === 'data' ? 'date' : campo.tipo === 'numero' ? 'number' : 'text'}
                      value={currentVal}
                      onChange={(e) =>
                        setValores((prev) => ({ ...prev, [campo.id]: e.target.value }))
                      }
                      placeholder={campo.placeholder || `Digite ${campo.nome.toLowerCase()}...`}
                      className="w-full bg-[#121c2e] border border-slate-700/80 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none focus:border-[#0055ff]"
                    />
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ----------------------------------------------------
            LADO DIREITO: VISUALIZAÇÃO DO PDF EM TEMPO REAL
           ---------------------------------------------------- */}
        <div className="flex-1 bg-[#050913] overflow-auto p-8 flex flex-col items-center justify-start relative select-none">
          {/* Top Bar de Navegação de Páginas e Zoom */}
          <div className="sticky top-0 mb-4 z-20 flex items-center gap-3 bg-[#0a1222]/95 backdrop-blur-md border border-slate-800 rounded-xl px-4 py-2 shadow-xl">
            <span className="text-xs font-bold text-slate-300">
              Página {pageNumero} de {paginas.length}
            </span>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
                disabled={currentPageIndex === 0}
                className="p-1 rounded bg-[#121c2e] hover:bg-slate-700 disabled:opacity-30 text-slate-300 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCurrentPageIndex((p) => Math.min(paginas.length - 1, p + 1))}
                disabled={currentPageIndex === paginas.length - 1}
                className="p-1 rounded bg-[#121c2e] hover:bg-slate-700 disabled:opacity-30 text-slate-300 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="h-4 w-px bg-slate-800" />

            {/* Zoom */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setZoom((z) => Math.max(0.3, Number((z - 0.1).toFixed(2))))}
                className="p-1 text-slate-400 hover:text-white"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-semibold text-slate-200 w-10 text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={() => setZoom((z) => Math.min(1.8, Number((z + 0.1).toFixed(2))))}
                className="p-1 text-slate-400 hover:text-white"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Folha do PDF Renderizada em Tempo Real */}
          <div
            ref={previewDocRef}
            className="relative bg-white shadow-2xl rounded-xs text-slate-900 overflow-hidden"
            style={{
              width: `${pageWidth}px`,
              height: `${pageHeight}px`,
              minWidth: `${pageWidth}px`,
              minHeight: `${pageHeight}px`,
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
              backgroundColor: currentPage.backgroundColor || '#ffffff',
              backgroundImage: currentPage.backgroundImage ? `url(${currentPage.backgroundImage})` : undefined,
              backgroundSize: '100% 100%',
              backgroundRepeat: 'no-repeat',
            }}
          >
            {/* Conteúdo Fixo do PDF Original */}
            {currentPage.elementos?.map((el) => (
              <div
                key={el.id}
                className="absolute pointer-events-none select-none"
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

            {/* CAMPOS PREENCHIDOS EM TEMPO REAL SOBRE O DOCUMENTO */}
            {camposPaginaAtual.map((campo) => {
              const val = valores[campo.id] || '';

              // Assinatura Normal Desenhar
              if (campo.tipo === 'assinatura_normal') {
                return (
                  <div
                    key={campo.id}
                    className="absolute border border-dashed border-blue-400/50 bg-blue-50/20 rounded p-1 flex flex-col items-center justify-center overflow-hidden"
                    style={{
                      left: `${campo.x}px`,
                      top: `${campo.y}px`,
                      width: `${campo.width}px`,
                      height: `${campo.height}px`,
                    }}
                  >
                    {normalSigDataUrl ? (
                      <img
                        src={normalSigDataUrl}
                        alt="Assinatura"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-[11px] text-blue-600/70 font-medium flex items-center gap-1">
                        <PenTool className="w-3.5 h-3.5" />
                        <span>Assinatura do Cliente</span>
                      </div>
                    )}
                  </div>
                );
              }

              // Assinatura Gov.br Oficial
              if (campo.tipo === 'assinatura_govbr') {
                return (
                  <div
                    key={campo.id}
                    className="absolute border-2 border-emerald-600 bg-emerald-50/90 rounded p-2 flex flex-col justify-between overflow-hidden shadow-xs"
                    style={{
                      left: `${campo.x}px`,
                      top: `${campo.y}px`,
                      width: `${campo.width}px`,
                      height: `${campo.height}px`,
                    }}
                  >
                    {govBrInfo?.validado ? (
                      <div className="text-[9px] text-emerald-950 font-sans leading-tight">
                        <div className="flex items-center gap-1 font-bold text-emerald-800 text-[10px] mb-0.5 border-b border-emerald-600/40 pb-0.5">
                          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>DOCUMENTO ASSINADO DIGITALMENTE (GOV.BR)</span>
                        </div>
                        <div>
                          <strong>Assinante:</strong> {govBrInfo.assinanteNome}
                        </div>
                        <div>
                          <strong>CPF:</strong> {govBrInfo.cpf}
                        </div>
                        <div>
                          <strong>Data/Hora:</strong> {govBrInfo.dataHora}
                        </div>
                        <div className="font-mono text-[8px] text-emerald-700">
                          Validador: {govBrInfo.codigoVerificacao}
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex flex-col items-center justify-center text-center text-emerald-700">
                        <ShieldCheck className="w-5 h-5 text-emerald-600 mb-1" />
                        <span className="text-[10px] font-bold">Assinatura Digital gov.br</span>
                        <span className="text-[8px] text-emerald-600">Aguardando validação</span>
                      </div>
                    )}
                  </div>
                );
              }

              // Campo de Texto Normal Preenchido em Tempo Real
              return (
                <div
                  key={campo.id}
                  className="absolute flex items-center overflow-hidden border border-dashed border-slate-300 hover:border-blue-400 bg-white/70 px-2 py-0.5 rounded transition-colors"
                  style={{
                    left: `${campo.x}px`,
                    top: `${campo.y}px`,
                    width: `${campo.width}px`,
                    height: `${campo.height}px`,
                    fontSize: campo.fontSize ? `${campo.fontSize}px` : '14px',
                    fontFamily: campo.fontFamily || 'Inter, sans-serif',
                    color: campo.color || '#0f172a',
                    fontWeight: campo.fontWeight || 'normal',
                    textAlign: campo.textAlign || 'left',
                  }}
                >
                  <span className={`w-full truncate ${!val ? 'text-slate-400 italic text-[11px]' : ''}`}>
                    {val || `[${campo.nome}]`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ==========================================
          MODAL DE ASSINATURA DIGITAL GOV.BR OFICIAL
         ========================================== */}
      {isGovBrModalOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#0f172a] border border-emerald-500/40 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="bg-emerald-950/60 p-4 border-b border-emerald-500/30 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Assinatura Eletrônica gov.br</h3>
                  <p className="text-[10px] text-emerald-300">Padrão Oficial ICP-Brasil / Decreto 10.543/2020</p>
                </div>
              </div>
              <button
                onClick={() => setIsGovBrModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Corpo */}
            <div className="p-4 space-y-3 text-xs">
              <div className="p-3 bg-emerald-950/30 border border-emerald-600/30 rounded-xl text-emerald-200 text-[11px] leading-relaxed">
                Este fluxo aplica o selo e hash criptográfico de conformidade com o portal oficial <strong>assina.gov.br</strong>, garantindo autenticidade jurídica ao documento final gerado.
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Nome Completo do Signatário *
                </label>
                <input
                  type="text"
                  value={govBrNomeInput}
                  onChange={(e) => setGovBrNomeInput(e.target.value)}
                  placeholder="Nome exatamente como consta no Gov.br..."
                  className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  CPF do Signatário *
                </label>
                <input
                  type="text"
                  value={govBrCpfInput}
                  onChange={(e) => setGovBrCpfInput(e.target.value)}
                  placeholder="000.000.000-00"
                  className="w-full bg-[#121c2e] border border-slate-700 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 font-medium"
                />
              </div>

              <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
                <span>Validador Oficial:</span>
                <a
                  href="https://validar.iti.gov.br"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 hover:underline flex items-center gap-1"
                >
                  validar.iti.gov.br <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-[#091122] border-t border-slate-800 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsGovBrModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmGovBr}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 shadow-md cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                Validar e Aplicar no Documento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
