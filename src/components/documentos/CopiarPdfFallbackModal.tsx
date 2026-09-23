import React from 'react';
import { X, Download, Share2, Info } from 'lucide-react';

interface CopiarPdfFallbackModalProps {
  isOpen: boolean;
  itemTitle: string;
  onClose: () => void;
  onDownload: () => void;
  onShare: () => void;
}

export const CopiarPdfFallbackModal: React.FC<CopiarPdfFallbackModalProps> = ({
  isOpen,
  itemTitle,
  onClose,
  onDownload,
  onShare,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0f172a] border border-slate-700/90 rounded-2xl shadow-2xl p-6 text-slate-100 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <Info className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-white">Copiar Arquivo PDF</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-300 leading-relaxed">
          A política de segurança deste navegador restringe a cópia de arquivos binários (.pdf) diretamente para a área de transferência do sistema operacional.
        </p>

        <p className="text-xs text-slate-400">
          Você pode baixar o PDF original ou compartilhá-lo diretamente:
        </p>

        <div className="grid grid-cols-2 gap-3 pt-2">
          <button
            onClick={() => {
              onDownload();
              onClose();
            }}
            className="p-3 bg-[#1e293b] hover:bg-slate-800 border border-slate-700 rounded-xl flex flex-col items-center gap-2 text-center transition-colors cursor-pointer group"
          >
            <Download className="w-5 h-5 text-[#0055ff] group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-white">Baixar PDF</span>
            <span className="text-[10px] text-slate-400">Salvar no dispositivo</span>
          </button>

          <button
            onClick={() => {
              onShare();
              onClose();
            }}
            className="p-3 bg-[#1e293b] hover:bg-slate-800 border border-slate-700 rounded-xl flex flex-col items-center gap-2 text-center transition-colors cursor-pointer group"
          >
            <Share2 className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
            <span className="text-xs font-bold text-white">Compartilhar</span>
            <span className="text-[10px] text-slate-400">WhatsApp, E-mail, etc.</span>
          </button>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-slate-400 hover:text-white bg-slate-800/80 rounded-xl"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
