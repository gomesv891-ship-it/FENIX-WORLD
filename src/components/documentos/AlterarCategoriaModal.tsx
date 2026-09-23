import React, { useState, useEffect } from 'react';
import { X, FolderSymlink, Check } from 'lucide-react';
import { DocumentoCategoria } from '../../types';

interface AlterarCategoriaModalProps {
  isOpen: boolean;
  itemTitle: string;
  currentCatId: string;
  categorias: DocumentoCategoria[];
  onClose: () => void;
  onConfirm: (newCatId: string, newCatNome: string) => Promise<void> | void;
}

export const AlterarCategoriaModal: React.FC<AlterarCategoriaModalProps> = ({
  isOpen,
  itemTitle,
  currentCatId,
  categorias,
  onClose,
  onConfirm,
}) => {
  const [selectedCatId, setSelectedCatId] = useState(currentCatId);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setSelectedCatId(currentCatId || categorias[0]?.id || '');
    setLoading(false);
  }, [currentCatId, categorias, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cat = categorias.find((c) => c.id === selectedCatId);
    if (!cat) return;

    setLoading(true);
    try {
      await onConfirm(cat.id, cat.nome);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white border border-slate-200 rounded-2xl shadow-2xl p-6 text-slate-900 space-y-4 animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#0052cc] border border-blue-100 flex items-center justify-center">
              <FolderSymlink className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Alterar Categoria</h3>
              <p className="text-[11px] text-slate-500 truncate max-w-[240px]">
                {itemTitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Selecione a Nova Categoria
            </label>
            <select
              value={selectedCatId}
              onChange={(e) => setSelectedCatId(e.target.value)}
              disabled={loading}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:border-[#0052cc] focus:bg-white focus:ring-1 focus:ring-[#0052cc] focus:outline-none cursor-pointer"
            >
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !selectedCatId}
              className="px-4 py-2 text-xs font-bold text-white bg-[#0052cc] hover:bg-[#0047b3] disabled:bg-slate-300 rounded-xl flex items-center gap-1.5 cursor-pointer shadow-sm shadow-blue-600/25"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{loading ? 'Salvando...' : 'Mover Arquivo'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
