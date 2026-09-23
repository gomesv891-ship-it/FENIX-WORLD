import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Download,
  Printer,
  Share2,
  Copy,
  Edit,
  ChevronLeft,
  ChevronRight,
  ZoomIn,
  ZoomOut,
  UserCheck,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';
import { DocumentoItem, ClientRecord, CatalogoItem, DocumentoElemento } from '../../types';
import { resolveCrmTags, registerDocumentoEnvio } from '../../utils/documentosService';
import { generateDocumentPdf } from '../../utils/pdfGenerator';
import {
  getPdfBlob,
  downloadPdfFile,
  copyPdfToClipboard,
} from '../../utils/pdfStorageService';

interface UniversalViewerProps {
  isOpen: boolean;
  item: (DocumentoItem | CatalogoItem) | null;
  clients: ClientRecord[];
  currentUserName: string;
  onClose: () => void;
  onEdit?: () => void;
  onSend?: () => void;
}

export const DocumentoViewerModal: React.FC<UniversalViewerProps> = ({
  isOpen,
  item,
  clients,
  currentUserName,
  onClose,
  onEdit,
  onSend,
}) => {
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [zoom, setZoom] = useState(0.85);

  // PDF original state
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const pagesContainerRef = useRef<HTMLDivElement>(null);

  const isDocumento = Boolean(item && 'paginas' in item && (item as DocumentoItem).paginas?.length > 0);
  const docItem = isDocumento ? (item as DocumentoItem) : null;
  const paginas = docItem?.paginas || [];
  const currentPage = paginas[currentPageIndex] || paginas[0];
  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;

  // Carrega PDF original quando modal abrir
  useEffect(() => {
    let activeUrl: string | null = null;
    if (isOpen && item?.id) {
      setIsLoadingPdf(true);
      setPdfError('');
      setPdfBlobUrl(null);
      setCopyFeedback('');

      getPdfBlob(item.id)
        .then((blob) => {
          if (blob && blob.size > 0) {
            activeUrl = URL.createObjectURL(blob);
            setPdfBlobUrl(activeUrl);
          } else if (!isDocumento) {
            setPdfError('Arquivo original ainda não sincronizado ou não localizado.');
          }
        })
        .catch((err) => {
          console.error('Erro ao abrir PDF:', err);
          if (!isDocumento) {
            setPdfError('Não foi possível carregar o arquivo PDF.');
          }
        })
        .finally(() => {
          setIsLoadingPdf(false);
        });
    }

    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [isOpen, item?.id, isDocumento]);

  if (!isOpen || !item) return null;

  const handleDownloadOriginal = async () => {
    const fileName =
      ('nomeArquivo' in item && item.nomeArquivo) ||
      ('nomeArquivoOriginal' in item && item.nomeArquivoOriginal) ||
      `${item.titulo}.pdf`;

    const success = await downloadPdfFile(item.id, fileName);
    if (success) {
      registerDocumentoEnvio(
        {
          documentoId: item.id,
          documentoTitulo: item.titulo,
          clienteNome: selectedClient?.name || 'Geral',
          tipoEnvio: 'Download',
          status: 'Concluído',
        },
        currentUserName
      );
    } else if (pagesContainerRef.current) {
      handleDownloadGeneratedPdf();
    }
  };

  const handleCopyPdf = async () => {
    const fileName =
      ('nomeArquivo' in item && item.nomeArquivo) ||
      ('nomeArquivoOriginal' in item && item.nomeArquivoOriginal) ||
      `${item.titulo}.pdf`;

    setCopyFeedback('Copiando...');
    const res = await copyPdfToClipboard(item.id, fileName);
    if (res.success) {
      setCopyFeedback('Copiado para Área de Transferência!');
      setTimeout(() => setCopyFeedback(''), 3000);
    } else {
      // Se não suportado nativamente pelo browser, oferece download
      setCopyFeedback('Iniciando Download...');
      await handleDownloadOriginal();
      setTimeout(() => setCopyFeedback(''), 3000);
    }
  };

  const handleShare = async () => {
    const fileName =
      ('nomeArquivo' in item && item.nomeArquivo) ||
      ('nomeArquivoOriginal' in item && item.nomeArquivoOriginal) ||
      `${item.titulo}.pdf`;

    try {
      const blob = await getPdfBlob(item.id);
      if (blob && navigator.share && navigator.canShare) {
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: item.titulo,
            text: `Segue em anexo o arquivo: ${item.titulo}`,
            files: [file],
          });
          return;
        }
      }
    } catch {
      // Fallback
    }

    if (onSend) {
      onSend();
    } else {
      await handleDownloadOriginal();
    }
  };

  const handleDownloadGeneratedPdf = async () => {
    if (!pagesContainerRef.current || !docItem) return;
    setIsGeneratingPdf(true);
    try {
      const pageElements = Array.from(
        pagesContainerRef.current.querySelectorAll('.fenix-a4-page')
      ) as HTMLElement[];
      if (pageElements.length === 0) return;

      const result = await generateDocumentPdf(pageElements, {
        fileName: `${docItem.titulo}.pdf`,
      });

      result.download();

      registerDocumentoEnvio(
        {
          documentoId: docItem.id,
          documentoTitulo: docItem.titulo,
          clienteNome: selectedClient?.name || docItem.clienteNome || 'Geral',
          tipoEnvio: 'Download',
          status: 'Concluído',
        },
        currentUserName
      );
    } catch (err) {
      console.error('Erro ao gerar PDF:', err);
      alert('Erro ao gerar o PDF.');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handlePrint = () => {
    if (pdfBlobUrl) {
      const w = window.open(pdfBlobUrl);
      w?.print();
    } else {
      window.print();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 backdrop-blur-md text-slate-100 animate-in fade-in duration-150"
      onClick={onClose}
    >
      {/* Top Header Bar */}
      <div
        className="h-16 px-6 bg-[#091122] border-b border-slate-800 flex items-center justify-between shrink-0 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#0055ff]/20 text-[#0055ff] flex items-center justify-center shrink-0">
            <FileText className="w-5 h-5" />
          </div>
          <div className="overflow-hidden">
            <h2 className="text-sm font-bold text-white tracking-wide truncate max-w-xs md:max-w-md">
              {item.titulo}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="px-2 py-0.5 rounded-md bg-slate-800 text-[10px] font-bold text-[#0055ff]">
                {item.categoriaNome || 'Geral'}
              </span>
              {'tamanhoArquivo' in item && item.tamanhoArquivo && (
                <>
                  <span>•</span>
                  <span>{item.tamanhoArquivo}</span>
                </>
              )}
              {pdfBlobUrl && (
                <span className="text-emerald-400 font-medium text-[11px] flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> PDF Original
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Client Tag Tester (Para modelos de texto) */}
        {isDocumento && !pdfBlobUrl && (
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 bg-[#1e293b]/70 border border-slate-700/80 rounded-xl">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-300 font-medium">Preencher Tags com:</span>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              className="bg-transparent text-xs text-white font-semibold focus:outline-none cursor-pointer max-w-[200px] truncate"
            >
              <option value="" className="bg-[#0f172a] text-slate-300">
                Tags Padrão (Exemplos)
              </option>
              {clients.map((c) => (
                <option key={c.id} value={c.id} className="bg-[#0f172a] text-white">
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex items-center gap-2">
          {copyFeedback && (
            <span className="text-xs font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/30 animate-pulse">
              {copyFeedback}
            </span>
          )}

          {/* Copiar PDF */}
          <button
            onClick={handleCopyPdf}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Copiar PDF para área de transferência"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Copiar PDF</span>
          </button>

          {/* Compartilhar */}
          <button
            onClick={handleShare}
            className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Compartilhar arquivo"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Compartilhar</span>
          </button>

          {/* Download Original */}
          <button
            onClick={handleDownloadOriginal}
            disabled={isGeneratingPdf}
            className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0044cc] rounded-xl shadow-lg shadow-[#0055ff]/20 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Baixar PDF original"
          >
            {isGeneratingPdf ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>Baixar PDF</span>
          </button>

          {/* Imprimir */}
          <button
            onClick={handlePrint}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            title="Imprimir"
          >
            <Printer className="w-4 h-4" />
          </button>

          {/* Abrir em nova aba */}
          {pdfBlobUrl && (
            <a
              href={pdfBlobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
              title="Abrir em Nova Aba"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}

          {onEdit && (
            <button
              onClick={onEdit}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Editar"
            >
              <Edit className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors ml-2 cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className="flex-1 overflow-hidden relative flex items-center justify-center p-2 sm:p-4"
        onClick={(e) => e.stopPropagation()}
      >
        {isLoadingPdf ? (
          <div className="flex flex-col items-center gap-3 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-[#0055ff]" />
            <p className="text-sm font-medium">Carregando PDF original com fidelidade cristalina...</p>
          </div>
        ) : pdfBlobUrl ? (
          /* PDF Original NATIVO sem distorções, cortes ou conversão forçada */
          <div className="w-full h-full max-w-6xl mx-auto rounded-2xl overflow-hidden border border-slate-800 bg-[#1e293b] shadow-2xl">
            <iframe
              src={`${pdfBlobUrl}#toolbar=1&navpanes=0`}
              title={item.titulo}
              className="w-full h-full border-0 rounded-2xl"
            />
          </div>
        ) : isDocumento && docItem ? (
          /* Visualizador de Páginas/Canvas Interno para Modelos Editáveis */
          <div className="flex-1 h-full overflow-auto flex flex-col items-center py-6 px-4">
            <div
              ref={pagesContainerRef}
              style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
              className="transition-transform duration-150"
            >
              <div
                className="fenix-a4-page relative shadow-2xl overflow-hidden bg-white text-slate-900 mx-auto"
                style={{
                  width: `${currentPage?.width || 794}px`,
                  height: `${currentPage?.height || 1123}px`,
                  backgroundColor: currentPage?.backgroundColor || '#ffffff',
                }}
              >
                {currentPage?.backgroundImage && (
                  <img
                    src={currentPage.backgroundImage}
                    alt="Página"
                    className="absolute inset-0 w-full h-full object-contain pointer-events-none"
                  />
                )}
                {currentPage?.elementos?.map((el: DocumentoElemento) => {
                  const resolved = resolveCrmTags(el.conteudo || '', {
                    client: selectedClient,
                    pedido: docItem.pedidoVinculado,
                    responsavel: currentUserName,
                  });
                  return (
                    <div
                      key={el.id}
                      style={{
                        position: 'absolute',
                        left: `${el.x}px`,
                        top: `${el.y}px`,
                        width: `${el.width}px`,
                        height: `${el.height}px`,
                        fontSize: `${el.fontSize || 14}px`,
                        color: el.color || '#000000',
                        fontWeight: el.fontWeight || 'normal',
                      }}
                      className="overflow-hidden"
                    >
                      {resolved}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Pagination Controls para Documentos Internos */}
            {paginas.length > 1 && (
              <div className="fixed bottom-6 z-20 flex items-center gap-2 px-4 py-2 bg-[#0f172a]/90 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl">
                <button
                  onClick={() => setCurrentPageIndex((p) => Math.max(0, p - 1))}
                  disabled={currentPageIndex === 0}
                  className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-white px-2">
                  {currentPageIndex + 1} de {paginas.length}
                </span>
                <button
                  onClick={() => setCurrentPageIndex((p) => Math.min(paginas.length - 1, p + 1))}
                  disabled={currentPageIndex === paginas.length - 1}
                  className="p-1 rounded-lg text-slate-400 hover:text-white disabled:opacity-30"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-center p-8 bg-[#1e293b]/70 border border-slate-800 rounded-2xl max-w-md">
            <AlertCircle className="w-10 h-10 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Visualização do Arquivo</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              {pdfError || 'O arquivo PDF original está salvo no Supabase. Você pode baixá-lo ou abri-lo diretamente.'}
            </p>
            <button
              onClick={handleDownloadOriginal}
              className="mt-2 px-4 py-2 text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0044cc] rounded-xl flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar Arquivo PDF</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
