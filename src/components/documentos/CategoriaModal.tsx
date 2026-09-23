import React, { useState, useEffect } from 'react';
import { X, FolderPlus, Palette, Tag } from 'lucide-react';
import { DocumentoCategoria } from '../../types';

interface CategoriaModalProps {
  isOpen: boolean;
  categoriaToEdit: DocumentoCategoria | null;
  onClose: () => void;
  onSave: (catData: { nome: string; descricao?: string; cor?: string }) => void;
}

const PRESET_COLORS = [
  '#0055ff', // Azul Oficial Fênix
  '#0284c7', // Azul Céu
  '#0d9488', // Teal
  '#16a34a', // Verde Esmeralda
  '#ca8a04', // Dourado
  '#ea580c', // Laranja
  '#dc2626', // Vermelho
  '#7c3aed', // Roxo
  '#475569', // Ardósia
  '#0f172a', // Azul Marinho
];

export const CategoriaModal: React.FC<CategoriaModalProps> = ({
  isOpen,
  categoriaToEdit,
  onClose,
  onSave,
}) => {
  const [nome, setNome] = useState('');
  const [descricao, setDescricao] = useState('');
  const [cor, setCor] = useState('#0055ff');
  const [error, setError] = useState('');

  useEffect(() => {
    if (categoriaToEdit) {
      setNome(categoriaToEdit.nome || '');
      setDescricao(categoriaToEdit.descricao || '');
      setCor(categoriaToEdit.cor || '#0055ff');
    } else {
      setNome('');
      setDescricao('');
      setCor('#0055ff');
    }
    setError('');
  }, [categoriaToEdit, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNome = nome.trim();
    if (!cleanNome) {
      setError('Por favor, informe o nome da categoria.');
      return;
    }
    onSave({
      nome: cleanNome,
      descricao: descricao.trim(),
      cor,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0f172a] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden text-slate-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-[#091122]">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shadow-inner"
              style={{ backgroundColor: `${cor}25`, color: cor }}
            >
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">
                {categoriaToEdit ? 'Editar Categoria' : 'Nova Categoria'}
              </h2>
              <p className="text-xs text-slate-400">
                Organize seus documentos e catálogos no CRM
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-300 text-xs flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Nome da Categoria <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={nome}
                onChange={(e) => {
                  setNome(e.target.value);
                  setError('');
                }}
                placeholder="Ex: Termos de Garantia, Contratos, CATÁLOGOS..."
                className="w-full px-3.5 py-2.5 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#0055ff] focus:ring-1 focus:ring-[#0055ff] transition-all"
                autoFocus
              />
              <Tag className="w-4 h-4 text-slate-500 absolute right-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
              Descrição (Opcional)
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Descreva a finalidade desta categoria..."
              rows={2}
              className="w-full px-3.5 py-2.5 bg-[#1e293b]/70 border border-slate-700 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-[#0055ff] focus:ring-1 focus:ring-[#0055ff] transition-all resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-slate-400" />
              Cor de Identificação
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCor(c)}
                  className={`w-7 h-7 rounded-full transition-transform ${
                    cor === c ? 'scale-125 ring-2 ring-white ring-offset-2 ring-offset-[#0f172a]' : 'hover:scale-110 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 rounded-xl transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0044cc] rounded-xl shadow-lg shadow-[#0055ff]/20 transition-all flex items-center gap-2"
            >
              {categoriaToEdit ? 'Atualizar Categoria' : 'Criar Categoria'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
