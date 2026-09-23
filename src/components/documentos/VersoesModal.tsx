import React from 'react';
import { X, History, RotateCcw, Clock, User, Calendar } from 'lucide-react';
import { DocumentoItem, DocumentoVersao } from '../../types';

interface VersoesModalProps {
  isOpen: boolean;
  documento: DocumentoItem | null;
  onClose: () => void;
  onRestore: (versaoId: string) => void;
}

export const VersoesModal: React.FC<VersoesModalProps> = ({
  isOpen,
  documento,
  onClose,
  onRestore,
}) => {
  if (!isOpen || !documento) return null;

  const versoes = documento.versoes || [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#091122] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                Histórico de Versões
              </h2>
              <p className="text-xs text-slate-400 truncate max-w-xs">
                {documento.titulo}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List of Versions */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {versoes.length === 0 ? (
            <div className="text-center py-10 text-slate-400">
              <Clock className="w-10 h-10 mx-auto mb-2 text-slate-600 stroke-[1.5]" />
              <p className="text-sm font-medium text-slate-300">Nenhuma versão anterior registrada</p>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                À medida que você edita e salva o documento, snapshots automáticos são gravados aqui para que você possa restaurar quando quiser.
              </p>
            </div>
          ) : (
            versoes.map((v, idx) => (
              <div
                key={v.id || idx}
                className="p-4 bg-[#1e293b]/70 border border-slate-800 hover:border-slate-700 rounded-xl transition-all flex items-center justify-between gap-4"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-[#0055ff]/20 text-[#0055ff]">
                      v{versoes.length - idx}
                    </span>
                    <span className="text-xs font-semibold text-white">
                      {v.descricao || 'Versão salva'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {v.data}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      {v.hora}
                    </span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-500" />
                      {v.usuario || 'Usuário Fênix'}
                    </span>
                    <span className="text-slate-500">
                      • {v.paginas?.length || 1} {v.paginas?.length === 1 ? 'pág' : 'págs'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Deseja realmente restaurar a versão de ${v.data} às ${v.hora}? O estado atual será salvo como backup.`)) {
                      onRestore(v.id);
                    }
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-amber-300 hover:text-white bg-amber-500/10 hover:bg-amber-600 rounded-xl transition-all flex items-center gap-1.5 shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Restaurar
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#091122] border-t border-slate-800 flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};
