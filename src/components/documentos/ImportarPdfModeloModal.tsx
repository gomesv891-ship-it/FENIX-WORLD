import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FolderOpen,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { DocumentoCategoria, DocumentoItem } from '../../types';
import { saveDocumentoAsync, createBlankPage } from '../../utils/documentosService';

interface ImportarPdfModeloModalProps {
  isOpen: boolean;
  categorias: DocumentoCategoria[];
  currentUserName: string;
  onClose: () => void;
  onSuccess: (savedModelo: DocumentoItem) => void;
}

export const ImportarPdfModeloModal: React.FC<ImportarPdfModeloModalProps> = ({
  isOpen,
  categorias,
  currentUserName,
  onClose,
  onSuccess,
}) => {
  const [titulo, setTitulo] = useState('');
  const [categoriaId, setCategoriaId] = useState(categorias[0]?.id || '');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setFileError('Por favor selecione um arquivo PDF válido.');
      return;
    }

    setFileError(null);
    setSelectedFile(file);
    if (!titulo.trim()) {
      const cleanName = file.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ');
      setTitulo(cleanName);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!titulo.trim()) {
      setFileError('Informe o nome do modelo.');
      return;
    }

    if (!selectedFile) {
      setFileError('Selecione um arquivo PDF para importar como modelo.');
      return;
    }

    setIsUploading(true);
    setUploadProgress(20);

    try {
      const selectedCat = categorias.find((c) => c.id === categoriaId);
      const catNome = selectedCat ? selectedCat.nome : 'Modelos';

      // Salva no Supabase através do serviço
      setUploadProgress(50);
      const res = await saveDocumentoAsync(
        {
          titulo: titulo.trim(),
          categoriaId,
          categoriaNome: catNome,
          isModelo: true,
          isPdfImportado: true,
          nomeArquivoOriginal: selectedFile.name,
          totalPaginas: 1,
        },
        selectedFile,
        currentUserName
      );

      setUploadProgress(100);
      setIsUploading(false);

      if (res.success && res.item) {
        onSuccess(res.item);
      } else {
        setFileError(res.error || 'Erro ao persistir PDF no Supabase. Tente novamente.');
      }
    } catch (err: any) {
      setIsUploading(false);
      setFileError(err?.message || 'Falha no upload do arquivo.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#0f172a] border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-[#091122] p-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0055ff]/20 text-[#0055ff] flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">Importar PDF como Modelo</h3>
              <p className="text-[11px] text-slate-400">
                O PDF original permanecerá intacto como base para novos campos editáveis.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-1 rounded-lg text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {fileError && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-2 text-xs text-red-400">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{fileError}</span>
            </div>
          )}

          {/* Nome do Modelo */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Nome do Modelo *
            </label>
            <input
              type="text"
              required
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ex: Contrato de Prestação de Serviços, Ordem de Instalação..."
              className="w-full bg-[#121c2e] border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0055ff]"
            />
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Categoria
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              className="w-full bg-[#121c2e] border border-slate-700 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-[#0055ff]"
            >
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nome}
                </option>
              ))}
            </select>
          </div>

          {/* Upload de Arquivo PDF */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1">
              Arquivo PDF Base *
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept="application/pdf"
              onChange={handleFileChange}
              className="hidden"
            />

            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                selectedFile
                  ? 'border-emerald-500/50 bg-emerald-500/5'
                  : 'border-slate-700 hover:border-[#0055ff]/60 hover:bg-[#121c2e]/40'
              }`}
            >
              {selectedFile ? (
                <div className="flex items-center justify-center gap-3 text-emerald-400">
                  <FileText className="w-8 h-8" />
                  <div className="text-left">
                    <p className="text-xs font-bold text-white truncate max-w-xs">
                      {selectedFile.name}
                    </p>
                    <p className="text-[10px] text-slate-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB • Clique para trocar
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-slate-400">
                  <Upload className="w-8 h-8 text-slate-500" />
                  <div>
                    <span className="text-xs font-bold text-white">Clique para selecionar o PDF</span>
                    <p className="text-[11px] text-slate-500">ou arraste e solte o arquivo aqui</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Progress Bar se estiver fazendo upload */}
          {isUploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span className="flex items-center gap-1.5 text-blue-400">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Enviando PDF e persistindo no Supabase...
                </span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#0055ff] transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isUploading || !selectedFile}
              className="px-5 py-2 text-xs font-bold text-white bg-[#0055ff] hover:bg-[#0044cc] rounded-xl shadow-lg shadow-[#0055ff]/25 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Importando...</span>
                </>
              ) : (
                <>
                  <span>Importar e Configurar Campos</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
