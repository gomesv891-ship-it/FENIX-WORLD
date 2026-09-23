import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  BookOpen,
  Upload,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { CatalogoItem, DocumentoCategoria } from '../../types';
import {
  ACCEPTED_DOCUMENT_MIMES,
  getFileFormatLabel,
} from '../../utils/documentosService';

interface CatalogoModalProps {
  isOpen: boolean;
  catalogoToEdit: CatalogoItem | null;
  categorias: DocumentoCategoria[];
  onClose: () => void;
  onSave: (
    data: Partial<CatalogoItem>,
    file?: File | Blob | string,
    onProgress?: (progress: { currentChunk: number; totalChunks: number; percent: number }) => void
  ) => Promise<{ success: boolean; error?: string }>;
}

export const CatalogoModal: React.FC<CatalogoModalProps> = ({
  isOpen,
  catalogoToEdit,
  categorias,
  onClose,
  onSave,
}) => {
  const [titulo, setTitulo] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [descricao, setDescricao] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [tamanhoArquivo, setTamanhoArquivo] = useState('');
  const [tipoArquivo, setTipoArquivo] = useState('application/pdf');

  // Status & Resiliency States
  const [isReadingFile, setIsReadingFile] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    currentChunk: number;
    totalChunks: number;
    percent: number;
  } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prevIsOpenRef = useRef(false);
  const prevEditIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      prevIsOpenRef.current = false;
      return;
    }

    const currentEditId = catalogoToEdit?.id || null;
    const justOpened = !prevIsOpenRef.current && isOpen;
    const editTargetChanged = prevEditIdRef.current !== currentEditId;

    if (justOpened || editTargetChanged) {
      prevIsOpenRef.current = true;
      prevEditIdRef.current = currentEditId;

      if (catalogoToEdit) {
        setTitulo(catalogoToEdit.titulo || '');
        setCategoriaId(catalogoToEdit.categoriaId || categorias[0]?.id || '');
        setDescricao(catalogoToEdit.descricao || '');
        setNomeArquivo(catalogoToEdit.nomeArquivo || '');
        setTamanhoArquivo(catalogoToEdit.tamanhoArquivo || '');
        setTipoArquivo(catalogoToEdit.tipoArquivo || 'application/pdf');
        setSelectedFile(null);
      } else {
        setTitulo('');
        setCategoriaId(categorias[0]?.id || '');
        setDescricao('');
        setNomeArquivo('');
        setTamanhoArquivo('');
        setTipoArquivo('application/pdf');
        setSelectedFile(null);
      }
      setErrorMessage('');
      setIsSaving(false);
      setSaveSuccess(false);
    }
  }, [isOpen, catalogoToEdit]);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setErrorMessage('O arquivo excede o limite máximo permitido de 50MB.');
      return;
    }

    setIsReadingFile(true);
    setErrorMessage('');

    const formattedSize =
      file.size > 1024 * 1024
        ? `${(file.size / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.round(file.size / 1024)} KB`;

    setSelectedFile(file);
    setNomeArquivo(file.name);
    setTamanhoArquivo(formattedSize);
    setTipoArquivo(file.type || 'application/octet-stream');

    if (!titulo.trim()) {
      setTitulo(file.name.replace(/\.[^/.]+$/, '').trim());
    }

    setIsReadingFile(false);
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    setNomeArquivo('');
    setTamanhoArquivo('');
    setTipoArquivo('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving || isReadingFile) return;

    const cleanTitle = titulo.trim();
    if (!cleanTitle) {
      setErrorMessage('Informe o título do catálogo.');
      return;
    }

    if (!categoriaId) {
      setErrorMessage('Selecione uma categoria válida para o catálogo.');
      return;
    }

    if (!selectedFile && !catalogoToEdit?.fileStorageKey && !nomeArquivo) {
      setErrorMessage('Selecione o arquivo do catálogo para upload (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX ou TXT).');
      return;
    }

    const selectedCat = categorias.find((c) => c.id === categoriaId);
    const catName = selectedCat ? selectedCat.nome : 'Catálogos';

    setIsSaving(true);
    setUploadProgress(null);
    setErrorMessage('');
    setSaveSuccess(false);

    try {
      const res = await onSave(
        {
          id: catalogoToEdit?.id,
          titulo: cleanTitle,
          categoriaId,
          categoriaNome: catName,
          descricao: descricao.trim(),
          nomeArquivo: selectedFile ? selectedFile.name : nomeArquivo,
          tamanhoArquivo,
          tipoArquivo,
        },
        selectedFile || undefined,
        (progress) => {
          setUploadProgress(progress);
        }
      );

      if (!res.success) {
        setErrorMessage(
          res.error ||
            'Não foi possível confirmar o salvamento no Supabase. Seus dados e arquivo foram mantidos, tente novamente.'
        );
        setIsSaving(false);
        setUploadProgress(null);
        return;
      }

      setSaveSuccess(true);
      setIsSaving(false);
      setUploadProgress(null);

      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err: any) {
      console.error('Erro no salvamento do catálogo:', err);
      setErrorMessage(
        err?.message || 'Falha de comunicação ao salvar. Seus dados e arquivo foram mantidos, tente novamente.'
      );
      setIsSaving(false);
      setUploadProgress(null);
    }
  };

  const formatoAtual = getFileFormatLabel(nomeArquivo, tipoArquivo);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
      onClick={() => {
        if (!isSaving) onClose();
      }}
    >
      <div
        className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden text-slate-900 animate-in fade-in zoom-in-95 duration-200 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0052cc] border border-blue-100 flex items-center justify-center">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                {catalogoToEdit ? 'Editar Catálogo' : 'Novo Catálogo'}
              </h2>
              <p className="text-xs text-slate-500">
                Formatos aceitos: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX e TXT
              </p>
            </div>
          </div>
          {!isSaving && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-rose-900">Falha ao salvar no Supabase</p>
                <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
                <p className="mt-1 text-[11px] text-rose-700 font-medium">
                  Os dados digitados e o arquivo selecionado NÃO foram perdidos. Clique no botão "Tentar Novamente" abaixo para reenviar.
                </p>
              </div>
            </div>
          )}

          {isSaving && (
            <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-900 text-xs flex flex-col gap-2">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#0052cc]" />
                  {uploadProgress && uploadProgress.totalChunks > 1
                    ? `Enviando parte ${uploadProgress.currentChunk} de ${uploadProgress.totalChunks} para o Supabase...`
                    : 'Enviando arquivo e dados para o Supabase...'}
                </span>
                {uploadProgress && <span className="font-bold">{uploadProgress.percent}%</span>}
              </div>
              {uploadProgress && uploadProgress.totalChunks > 1 && (
                <div className="w-full bg-blue-200/80 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-[#0052cc] h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              )}
            </div>
          )}

          {saveSuccess && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2.5">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600" />
              <div>
                <p className="font-bold text-emerald-900">Catálogo persistido com sucesso!</p>
                <p className="text-[11px] text-emerald-700">Arquivo e dados gravados no Supabase.</p>
              </div>
            </div>
          )}

          {/* 1. Nome do Catálogo */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Nome do Catálogo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={titulo}
              onChange={(e) => {
                setTitulo(e.target.value);
                setErrorMessage('');
              }}
              disabled={isSaving}
              placeholder="Ex: Catálogo Flexfloor 2026, Ripados Especiais..."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-[#0052cc] focus:bg-white focus:ring-1 focus:ring-[#0052cc] transition-all disabled:opacity-60"
              autoFocus
            />
          </div>

          {/* 2. Categoria */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Categoria <span className="text-red-500">*</span>
            </label>
            <select
              value={categoriaId}
              onChange={(e) => {
                setCategoriaId(e.target.value);
                setErrorMessage('');
              }}
              disabled={isSaving}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm focus:outline-none focus:border-[#0052cc] focus:bg-white focus:ring-1 focus:ring-[#0052cc] transition-all disabled:opacity-60 cursor-pointer"
            >
              {categorias.length === 0 ? (
                <option value="">Nenhuma categoria cadastrada</option>
              ) : (
                categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* 3. Selecionar Arquivo */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Arquivo Original <span className="text-red-500">*</span>
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_DOCUMENT_MIMES}
              onChange={handleFileChange}
              disabled={isSaving}
              className="hidden"
            />

            {/* Após selecionar, mostrar: Nome | Formato | Tamanho | Remover arquivo */}
            {nomeArquivo ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl shadow-2xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 overflow-hidden min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#0052cc] border border-blue-100 flex items-center justify-center font-bold text-xs shrink-0">
                      {formatoAtual}
                    </div>
                    <div className="truncate min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate" title={nomeArquivo}>
                        {nomeArquivo}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                        <span className="font-semibold text-[#0052cc]">{formatoAtual}</span>
                        <span>•</span>
                        <span>{tamanhoArquivo || 'Pronto para envio'}</span>
                      </div>
                    </div>
                  </div>

                  {!isSaving && (
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200/80 rounded-lg transition-colors cursor-pointer shrink-0 ml-2"
                      title="Remover arquivo selecionado"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Remover arquivo</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSaving || isReadingFile}
                className="w-full border-2 border-dashed border-slate-200 hover:border-[#0052cc] hover:bg-blue-50/30 rounded-xl p-5 text-center transition-all flex flex-col items-center justify-center gap-2 group cursor-pointer"
              >
                <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-blue-50 text-slate-500 group-hover:text-[#0052cc] flex items-center justify-center transition-colors">
                  {isReadingFile ? (
                    <Loader2 className="w-5 h-5 animate-spin text-[#0052cc]" />
                  ) : (
                    <Upload className="w-5 h-5" />
                  )}
                </div>
                <div className="text-xs">
                  <span className="font-semibold text-slate-900 group-hover:text-[#0052cc]">
                    Clique para selecionar o arquivo
                  </span>{' '}
                  <span className="text-slate-500">do seu computador</span>
                </div>
                <span className="text-[11px] text-slate-500">
                  Aceita: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX e TXT (até 50MB)
                </span>
              </button>
            )}
          </div>

          {/* 4. Descrição Opcional */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Descrição ou Observações (Opcional)
            </label>
            <textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              disabled={isSaving}
              placeholder="Linhas de produtos inclusas, acabamentos, espessuras..."
              rows={2}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 text-sm placeholder-slate-400 focus:outline-none focus:border-[#0052cc] focus:bg-white focus:ring-1 focus:ring-[#0052cc] transition-all resize-none disabled:opacity-60"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving || isReadingFile}
              className="px-5 py-2.5 text-xs font-bold text-white bg-[#0052cc] hover:bg-[#0047b3] disabled:bg-slate-300 rounded-xl shadow-sm shadow-blue-600/25 transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Salvando no Supabase...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Salvo com Sucesso!</span>
                </>
              ) : errorMessage ? (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Tentar Novamente</span>
                </>
              ) : (
                <span>{catalogoToEdit ? 'Atualizar Catálogo' : 'Salvar Catálogo'}</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
