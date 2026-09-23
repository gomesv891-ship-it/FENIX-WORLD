import {
  DocumentoCategoria,
  DocumentoItem,
  DocumentoPagina,
  DocumentoElemento,
  DocumentoVersao,
  CatalogoItem,
  DocumentoEnvio,
  ClientRecord,
} from '../types';
import { getInitialTabelaRevendaDoc } from '../data/tabelaRevendaModel';
import {
  saveWholeCollectionToSupabase,
  saveItemToSupabase,
  deleteItemFromSupabase,
  dispatchCollectionEvents,
  getSupabaseClient,
} from './supabaseClient';
import {
  persistPdfFile,
  deletePdfFile,
  getPdfDataUrl,
} from './pdfStorageService';

export const STORAGE_CATEGORIAS_KEY = 'fenix_documentos_categorias';
export const STORAGE_DOCUMENTOS_KEY = 'fenix_documentos_items';
export const STORAGE_CATALOGOS_KEY = 'fenix_catalogos_items';
export const STORAGE_ENVIOS_KEY = 'fenix_documentos_envios';

/**
 * Formatos de arquivos aceitos em Catálogos e Documentos:
 * PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX e TXT.
 * Preservando formato original sem conversão.
 */
export const ACCEPTED_DOCUMENT_EXTENSIONS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt';
export const ACCEPTED_DOCUMENT_MIMES =
  '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,text/plain';

export function getFileFormatLabel(fileName?: string, mimeType?: string): string {
  if (fileName) {
    const extMatch = fileName.match(/\.([a-zA-Z0-9]+)$/);
    if (extMatch) {
      return extMatch[1].toUpperCase();
    }
  }
  if (mimeType) {
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('word') || mimeType.includes('msword')) return 'DOCX';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'XLSX';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return 'PPTX';
    if (mimeType.includes('text/plain')) return 'TXT';
  }
  return 'PDF';
}

/**
 * Categorias Iniciais Obrigatórias para Catálogos
 */
export const INITIAL_CATALOGO_CATEGORIAS: { nome: string; cor: string }[] = [
  { nome: 'Pisos Vinílicos', cor: '#0284c7' },
  { nome: 'Ripado', cor: '#d97706' },
  { nome: 'Rodapés', cor: '#8b5cf6' },
  { nome: 'Laminados', cor: '#10b981' },
  { nome: 'Revestimentos', cor: '#ec4899' },
  { nome: 'Fichas Técnicas', cor: '#64748b' },
  { nome: 'Outras', cor: '#6b7280' },
];

/**
 * Categorias Iniciais Obrigatórias para Documentos
 */
export const INITIAL_DOCUMENTO_CATEGORIAS: { nome: string; cor: string }[] = [
  { nome: 'Tabelas Comerciais', cor: '#0055ff' },
  { nome: 'Termos e Contratos', cor: '#0284c7' },
  { nome: 'Fichas Cadastrais', cor: '#10b981' },
  { nome: 'Fichas Técnicas', cor: '#64748b' },
  { nome: 'Manuais e Cuidados', cor: '#d97706' },
  { nome: 'Institucional', cor: '#8b5cf6' },
  { nome: 'Certificados', cor: '#ec4899' },
  { nome: 'Políticas', cor: '#06b6d4' },
  { nome: 'Outros', cor: '#6b7280' },
];

/**
 * 11 Campos Automáticos do CRM
 */
export interface CrmFieldDefinition {
  tag: string;
  label: string;
  key: string;
  description: string;
  example: string;
}

export const CRM_FIELDS: CrmFieldDefinition[] = [
  { tag: '{cliente_nome}', label: 'Cliente', key: 'cliente_nome', description: 'Nome completo ou Razão Social do cliente', example: 'Construtora Splendor Ltda' },
  { tag: '{cliente_cpf_cnpj}', label: 'CPF/CNPJ', key: 'cliente_cpf_cnpj', description: 'Número do documento CPF ou CNPJ', example: '12.345.678/0001-90' },
  { tag: '{cliente_telefone}', label: 'Telefone', key: 'cliente_telefone', description: 'Telefone ou WhatsApp de contato', example: '(11) 98765-4321' },
  { tag: '{cliente_email}', label: 'E-mail', key: 'cliente_email', description: 'E-mail cadastrado do cliente', example: 'compras@splendor.com.br' },
  { tag: '{cliente_endereco}', label: 'Endereço', key: 'cliente_endereco', description: 'Logradouro, número, bairro e cidade', example: 'Av. Paulista, 1000 - Bela Vista, São Paulo - SP' },
  { tag: '{pedido}', label: 'Pedido', key: 'pedido', description: 'Número do pedido ou orçamento vinculado', example: '#2620' },
  { tag: '{data}', label: 'Data', key: 'data', description: 'Data atual por extenso ou formatada', example: new Date().toLocaleDateString('pt-BR') },
  { tag: '{empresa}', label: 'Empresa', key: 'empresa', description: 'Razão social oficial da Fênix World', example: 'Fênix World Distribuidora' },
  { tag: '{responsavel}', label: 'Responsável', key: 'responsavel', description: 'Vendedor ou responsável pelo atendimento', example: 'Vanessa Gomes' },
  { tag: '{produto}', label: 'Produto', key: 'produto', description: 'Produto, piso, insumo ou serviço principal', example: 'Piso Vinílico Flexfloor 3mm Colado' },
  { tag: '{instalador}', label: 'Instalador', key: 'instalador', description: 'Nome do instalador ou equipe técnica', example: 'Equipe Alpha Montagens' },
];

export interface CrmResolveContext {
  client?: ClientRecord | null;
  pedido?: string;
  produto?: string;
  instalador?: string;
  responsavel?: string;
  empresa?: string;
  data?: string;
}

export function resolveCrmTags(text: string, context?: CrmResolveContext): string {
  if (!text) return '';
  const client = context?.client;
  const now = new Date();
  const dataFormatada = context?.data || now.toLocaleDateString('pt-BR');
  const empresaOficial = context?.empresa || 'Fênix World Distribuidora';
  const responsavelOficial = context?.responsavel || client?.responsavel || client?.vendedorId || 'Consultor Comercial Fênix';

  const enderecoParts = [
    client?.street,
    client?.number ? `nº ${client.number}` : '',
    client?.neighborhood,
    client?.city ? `${client.city}${client.state ? `/${client.state}` : ''}` : '',
  ].filter(Boolean);
  const enderecoCompleto = enderecoParts.length > 0 ? enderecoParts.join(', ') : (client?.address || '');

  const map: Record<string, string> = {
    '{cliente_nome}': client?.name || '',
    '{cliente_cpf_cnpj}': client?.document || '',
    '{cliente_telefone}': client?.whatsapp || '',
    '{cliente_email}': client?.email || '',
    '{cliente_endereco}': enderecoCompleto,
    '{pedido}': context?.pedido || '',
    '{data}': dataFormatada,
    '{empresa}': empresaOficial,
    '{responsavel}': responsavelOficial,
    '{produto}': context?.produto || 'Piso Vinílico Fênix World',
    '{instalador}': context?.instalador || 'Equipe Especializada Fênix',
  };

  let resolved = text;
  for (const [tag, val] of Object.entries(map)) {
    if (resolved.includes(tag)) {
      resolved = resolved.split(tag).join(val);
    }
  }
  return resolved;
}

export function resolveElementCrmTags(el: DocumentoElemento, context?: CrmResolveContext): DocumentoElemento {
  if (el.tipo === 'texto' || el.tipo === 'campo_crm') {
    return {
      ...el,
      conteudo: resolveCrmTags(el.conteudo || '', context),
    };
  }
  if (el.tipo === 'cabecalho' || el.tipo === 'rodape') {
    return {
      ...el,
      conteudo: resolveCrmTags(el.conteudo || '', context),
      textoSecundario: resolveCrmTags(el.textoSecundario || '', context),
    };
  }
  if (el.tipo === 'tabela' && el.tabelaLinhas) {
    const resolvedRows = el.tabelaLinhas.map((row) =>
      row.map((cell) => resolveCrmTags(cell || '', context))
    );
    const resolvedHeaders = el.tabelaHeaders?.map((h) => resolveCrmTags(h || '', context));
    return {
      ...el,
      tabelaHeaders: resolvedHeaders,
      tabelaLinhas: resolvedRows,
    };
  }
  return el;
}

// ==========================================
// CATEGORIAS
// ==========================================

export function getDocumentosCategorias(): DocumentoCategoria[] {
  try {
    const raw = localStorage.getItem(STORAGE_CATEGORIAS_KEY);
    let list: DocumentoCategoria[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }

    const hasInitialized = localStorage.getItem('fenix_doc_categories_initialized') === 'true';
    const deletedIdsRaw = localStorage.getItem('fenix_deleted_category_ids');
    const deletedIds = new Set<string>(deletedIdsRaw ? JSON.parse(deletedIdsRaw) : []);
    const deletedNamesRaw = localStorage.getItem('fenix_deleted_category_names');
    const deletedNames = new Set<string>(deletedNamesRaw ? JSON.parse(deletedNamesRaw) : []);

    // Filter out any explicitly deleted categories
    list = list.filter((c) => !deletedIds.has(c.id) && !deletedNames.has(c.nome.trim().toLowerCase()));

    // Inicialização ÚNICA das categorias padrão (NUNCA recriar categorias excluídas pelo usuário)
    if (!hasInitialized && list.length === 0) {
      const existingNames = new Set(list.map((c) => c.nome.trim().toLowerCase()));

      // Categorias padrão de Catálogo
      INITIAL_CATALOGO_CATEGORIAS.forEach((item, idx) => {
        const norm = item.nome.trim().toLowerCase();
        if (!existingNames.has(norm) && !deletedNames.has(norm)) {
          list.push({
            id: `cat_ctl_${idx}_${Date.now()}`,
            nome: item.nome,
            tipo: 'catalogo',
            cor: item.cor,
            ordem: idx,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            criadoPor: 'Sistema Fênix',
          });
          existingNames.add(norm);
        }
      });

      // Categorias padrão de Documentos
      INITIAL_DOCUMENTO_CATEGORIAS.forEach((item, idx) => {
        const norm = item.nome.trim().toLowerCase();
        if (!existingNames.has(norm) && !deletedNames.has(norm)) {
          list.push({
            id: `cat_doc_${idx}_${Date.now()}`,
            nome: item.nome,
            tipo: 'documento',
            cor: item.cor,
            ordem: 50 + idx,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            criadoPor: 'Sistema Fênix',
          });
          existingNames.add(norm);
        }
      });

      localStorage.setItem('fenix_doc_categories_initialized', 'true');
      localStorage.setItem(STORAGE_CATEGORIAS_KEY, JSON.stringify(list));
      dispatchCollectionEvents(STORAGE_CATEGORIAS_KEY);
      saveWholeCollectionToSupabase(STORAGE_CATEGORIAS_KEY, list, 'Sistema Fênix').catch(() => {});
    }

    return list.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  } catch (err) {
    console.error('Erro ao ler categorias de documentos:', err);
    return [];
  }
}

export function getCatalogoCategorias(): DocumentoCategoria[] {
  const all = getDocumentosCategorias();
  return all.filter((c) => c.tipo === 'catalogo' || !c.tipo);
}

export function getDocumentoCategoriasOnly(): DocumentoCategoria[] {
  const all = getDocumentosCategorias();
  return all.filter((c) => c.tipo === 'documento' || !c.tipo);
}

/**
 * Consulta as categorias diretamente do Supabase e sincroniza o cache local.
 */
export async function fetchDocumentosCategoriasFromDatabase(): Promise<DocumentoCategoria[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('fenix_kv_store')
        .select('data')
        .eq('key', STORAGE_CATEGORIAS_KEY)
        .maybeSingle();

      if (!error && data && Array.isArray(data.data) && data.data.length > 0) {
        let list = data.data as DocumentoCategoria[];
        const deletedIdsRaw = localStorage.getItem('fenix_deleted_category_ids');
        const deletedIds = new Set<string>(deletedIdsRaw ? JSON.parse(deletedIdsRaw) : []);
        const deletedNamesRaw = localStorage.getItem('fenix_deleted_category_names');
        const deletedNames = new Set<string>(deletedNamesRaw ? JSON.parse(deletedNamesRaw) : []);

        const cleanList = list.filter(
          (c) => !deletedIds.has(c.id) && !deletedNames.has(c.nome.trim().toLowerCase())
        );

        try {
          localStorage.setItem(STORAGE_CATEGORIAS_KEY, JSON.stringify(cleanList));
        } catch {}
        return cleanList.sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
      }
    } catch (err) {
      console.warn('Erro ao carregar categorias do Supabase:', err);
    }
  }
  return getDocumentosCategorias();
}

export async function saveDocumentoCategoriaAsync(
  data: Partial<DocumentoCategoria>,
  userName = 'Usuário Fênix'
): Promise<DocumentoCategoria> {
  const current = getDocumentosCategorias();
  const isEdit = Boolean(data.id && current.some((c) => c.id === data.id));
  const now = new Date().toISOString();

  let savedItem: DocumentoCategoria;

  if (isEdit && data.id) {
    savedItem = {
      ...current.find((c) => c.id === data.id)!,
      ...data,
      updatedAt: now,
    };
    const updatedList = current.map((c) => (c.id === data.id ? savedItem : c));
    localStorage.setItem(STORAGE_CATEGORIAS_KEY, JSON.stringify(updatedList));
    dispatchCollectionEvents(STORAGE_CATEGORIAS_KEY);
    await saveWholeCollectionToSupabase(STORAGE_CATEGORIAS_KEY, updatedList, userName);
  } else {
    savedItem = {
      id: data.id || `cat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      nome: (data.nome || 'Nova Categoria').trim(),
      tipo: data.tipo || 'catalogo',
      descricao: data.descricao || '',
      ordem: data.ordem ?? current.length,
      cor: data.cor || '#0055ff',
      createdAt: now,
      updatedAt: now,
      criadoPor: userName,
    };
    const updatedList = [...current, savedItem];
    localStorage.setItem(STORAGE_CATEGORIAS_KEY, JSON.stringify(updatedList));
    dispatchCollectionEvents(STORAGE_CATEGORIAS_KEY);
    await saveWholeCollectionToSupabase(STORAGE_CATEGORIAS_KEY, updatedList, userName);
  }

  return savedItem;
}

export function saveDocumentoCategoria(
  data: Partial<DocumentoCategoria>,
  userName = 'Usuário Fênix'
): DocumentoCategoria {
  saveDocumentoCategoriaAsync(data, userName).catch(() => {});
  const current = getDocumentosCategorias();
  return current.find((c) => c.id === data.id) || {
    id: data.id || `cat_${Date.now()}`,
    nome: (data.nome || '').trim(),
    tipo: data.tipo || 'catalogo',
    createdAt: new Date().toISOString(),
    criadoPor: userName,
  };
}

export async function updateDocumentoCategoriaAsync(
  id: string,
  updates: Partial<DocumentoCategoria>,
  userName = 'Usuário Fênix'
): Promise<DocumentoCategoria | null> {
  const current = getDocumentosCategorias();
  const index = current.findIndex((c) => c.id === id);
  if (index === -1) return null;

  const updated: DocumentoCategoria = {
    ...current[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  current[index] = updated;
  localStorage.setItem(STORAGE_CATEGORIAS_KEY, JSON.stringify(current));
  dispatchCollectionEvents(STORAGE_CATEGORIAS_KEY);
  await saveWholeCollectionToSupabase(STORAGE_CATEGORIAS_KEY, current, userName);

  if (updates.nome && updates.nome !== current[index].nome) {
    updateCategoryNameInItems(id, updates.nome, userName);
  }

  return updated;
}

export function updateDocumentoCategoria(
  id: string,
  updates: Partial<DocumentoCategoria>,
  userName = 'Usuário Fênix'
): DocumentoCategoria | null {
  updateDocumentoCategoriaAsync(id, updates, userName).catch(() => {});
  const current = getDocumentosCategorias();
  const item = current.find((c) => c.id === id);
  return item ? { ...item, ...updates } : null;
}

/**
 * Retorna contagem de uso da categoria em Catálogos e Documentos
 */
export function getCategoryUsage(categoryId: string): {
  catalogosCount: number;
  documentosCount: number;
  totalCount: number;
} {
  const cats = getCatalogos().filter((c) => c.categoriaId === categoryId);
  const docs = getDocumentos().filter((d) => d.categoriaId === categoryId);
  return {
    catalogosCount: cats.length,
    documentosCount: docs.length,
    totalCount: cats.length + docs.length,
  };
}

/**
 * Transfere todos os arquivos de uma categoria excluída para uma nova categoria e exclui a antiga.
 * Garante: "Se houver arquivos vinculados a uma categoria excluída, exigir que sejam transferidos para outra categoria. Nunca apagar os PDFs automaticamente."
 */
export async function transferCategoryItemsAndDelete(
  oldCategoryId: string,
  newCategoryId: string,
  newCategoryName: string,
  userName = 'Usuário Fênix'
): Promise<boolean> {
  // 1. Atualizar Catálogos
  const currentCats = getCatalogos();
  let catsChanged = false;
  const updatedCats = currentCats.map((c) => {
    if (c.categoriaId === oldCategoryId) {
      catsChanged = true;
      return {
        ...c,
        categoriaId: newCategoryId,
        categoriaNome: newCategoryName,
        updatedAt: new Date().toISOString(),
      };
    }
    return c;
  });

  if (catsChanged) {
    localStorage.setItem(STORAGE_CATALOGOS_KEY, JSON.stringify(updatedCats));
    dispatchCollectionEvents(STORAGE_CATALOGOS_KEY);
    await saveWholeCollectionToSupabase(STORAGE_CATALOGOS_KEY, updatedCats, userName);
  }

  // 2. Atualizar Documentos
  const currentDocs = getDocumentos();
  let docsChanged = false;
  const updatedDocs = currentDocs.map((d) => {
    if (d.categoriaId === oldCategoryId) {
      docsChanged = true;
      return {
        ...d,
        categoriaId: newCategoryId,
        categoriaNome: newCategoryName,
        updatedAt: new Date().toISOString(),
      };
    }
    return d;
  });

  if (docsChanged) {
    localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(updatedDocs));
    dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);
    await saveWholeCollectionToSupabase(STORAGE_DOCUMENTOS_KEY, updatedDocs, userName);
  }

  // 3. Excluir a categoria antiga
  await deleteDocumentoCategoriaAsync(oldCategoryId, userName);
  return true;
}

export async function deleteDocumentoCategoriaAsync(
  id: string,
  userName = 'Usuário Fênix'
): Promise<boolean> {
  const current = getDocumentosCategorias();
  const targetCat = current.find((c) => c.id === id);
  const filtered = current.filter((c) => c.id !== id);
  if (filtered.length === current.length) return false;

  // Track deleted ID and normalized name to block resurrection permanently
  try {
    const deletedIdsRaw = localStorage.getItem('fenix_deleted_category_ids');
    const deletedIds: string[] = deletedIdsRaw ? JSON.parse(deletedIdsRaw) : [];
    if (!deletedIds.includes(id)) {
      deletedIds.push(id);
      localStorage.setItem('fenix_deleted_category_ids', JSON.stringify(deletedIds));
    }
    if (targetCat) {
      const deletedNamesRaw = localStorage.getItem('fenix_deleted_category_names');
      const deletedNames: string[] = deletedNamesRaw ? JSON.parse(deletedNamesRaw) : [];
      const norm = targetCat.nome.trim().toLowerCase();
      if (!deletedNames.includes(norm)) {
        deletedNames.push(norm);
        localStorage.setItem('fenix_deleted_category_names', JSON.stringify(deletedNames));
      }
    }
  } catch {}

  localStorage.setItem(STORAGE_CATEGORIAS_KEY, JSON.stringify(filtered));
  dispatchCollectionEvents(STORAGE_CATEGORIAS_KEY);
  await saveWholeCollectionToSupabase(STORAGE_CATEGORIAS_KEY, filtered, userName);
  return true;
}

export function deleteDocumentoCategoria(id: string, userName = 'Usuário Fênix'): boolean {
  deleteDocumentoCategoriaAsync(id, userName).catch(() => {});
  const current = getDocumentosCategorias();
  const filtered = current.filter((c) => c.id !== id);
  localStorage.setItem(STORAGE_CATEGORIAS_KEY, JSON.stringify(filtered));
  dispatchCollectionEvents(STORAGE_CATEGORIAS_KEY);
  return true;
}

function updateCategoryNameInItems(categoriaId: string, novoNome: string, userName: string) {
  // Documentos
  const docs = getDocumentos();
  let docsChanged = false;
  const updatedDocs = docs.map((doc) => {
    if (doc.categoriaId === categoriaId) {
      docsChanged = true;
      return { ...doc, categoriaNome: novoNome, updatedAt: new Date().toISOString() };
    }
    return doc;
  });
  if (docsChanged) {
    localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(updatedDocs));
    dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);
    saveWholeCollectionToSupabase(STORAGE_DOCUMENTOS_KEY, updatedDocs, userName).catch(() => {});
  }

  // Catálogos
  const cats = getCatalogos();
  let catsChanged = false;
  const updatedCats = cats.map((item) => {
    if (item.categoriaId === categoriaId) {
      catsChanged = true;
      return { ...item, categoriaNome: novoNome, updatedAt: new Date().toISOString() };
    }
    return item;
  });
  if (catsChanged) {
    localStorage.setItem(STORAGE_CATALOGOS_KEY, JSON.stringify(updatedCats));
    dispatchCollectionEvents(STORAGE_CATALOGOS_KEY);
    saveWholeCollectionToSupabase(STORAGE_CATALOGOS_KEY, updatedCats, userName).catch(() => {});
  }
}

// ==========================================
// CATÁLOGOS
// ==========================================

export function getCatalogos(): CatalogoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_CATALOGOS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('Erro ao ler catálogos:', err);
    return [];
  }
}

/**
 * Consulta a lista completa de catálogos do Supabase e sincroniza o cache local.
 */
export async function fetchCatalogosFromDatabase(): Promise<CatalogoItem[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('fenix_kv_store')
        .select('data')
        .eq('key', STORAGE_CATALOGOS_KEY)
        .maybeSingle();

      if (!error && data && Array.isArray(data.data)) {
        const list = data.data as CatalogoItem[];
        try {
          localStorage.setItem(STORAGE_CATALOGOS_KEY, JSON.stringify(list));
        } catch {}
        return list;
      }
    } catch (err) {
      console.warn('Erro ao carregar catálogos do Supabase:', err);
    }
  }
  return getCatalogos();
}

/**
 * Salva um catálogo de forma 100% persistente no Supabase.
 * FLUXO OBRIGATÓRIO: Nome → Categoria → Selecionar PDF → Upload completo → Salvar arquivo → Salvar registro no Supabase → Confirmar sucesso → Atualizar lista.
 */
export async function saveCatalogoAsync(
  data: Partial<CatalogoItem>,
  fileOrDataUrl?: File | Blob | string,
  userName = 'Usuário Fênix',
  onProgress?: (progress: { currentChunk: number; totalChunks: number; percent: number }) => void
): Promise<{ success: boolean; item?: CatalogoItem; error?: string }> {
  try {
    const current = getCatalogos();
    const now = new Date().toISOString();
    const id = data.id || `cat_item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isEdit = Boolean(data.id && current.some((c) => c.id === data.id));
    const existing = isEdit ? current.find((c) => c.id === id) : null;

    let sizeFormatted = data.tamanhoArquivo || existing?.tamanhoArquivo || '';

    // 1. Upload e salvamento real do PDF no Supabase (se fornecido novo arquivo)
    if (fileOrDataUrl) {
      const fileRes = await persistPdfFile(
        id,
        fileOrDataUrl,
        data.nomeArquivo || existing?.nomeArquivo || 'catalogo.pdf',
        userName,
        undefined,
        onProgress
      );

      if (!fileRes.success) {
        return {
          success: false,
          error: fileRes.error || 'Erro ao persistir o arquivo PDF no Supabase.',
        };
      }
      sizeFormatted = fileRes.sizeFormatted;
    }

    // 2. Registro do catálogo (sem carregar megabytes desnecessários na lista JSON)
    const savedItem: CatalogoItem = {
      id,
      titulo: (data.titulo || existing?.titulo || 'Novo Catálogo').trim(),
      categoriaId: data.categoriaId || existing?.categoriaId || '',
      categoriaNome: data.categoriaNome || existing?.categoriaNome || 'Geral',
      descricao: data.descricao ?? existing?.descricao ?? '',
      nomeArquivo: data.nomeArquivo || existing?.nomeArquivo || 'catalogo.pdf',
      tamanhoArquivo: sizeFormatted,
      tipoArquivo: data.tipoArquivo || existing?.tipoArquivo || 'application/pdf',
      totalPaginas: data.totalPaginas || existing?.totalPaginas || 1,
      capaUrl: data.capaUrl || existing?.capaUrl || '',
      fileStorageKey: `fenix_file_${id}`,
      isFavorite: data.isFavorite !== undefined ? Boolean(data.isFavorite) : Boolean(existing?.isFavorite),
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      criadoPor: existing?.criadoPor || userName,
    };

    // 3. Salvar registro no Supabase
    const result = await saveItemToSupabase(STORAGE_CATALOGOS_KEY, savedItem, 'id', userName);
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Erro ao registrar catálogo no Supabase. Tente novamente.',
      };
    }

    // 4. Atualizar lista local
    const updated = isEdit
      ? current.map((c) => (c.id === id ? savedItem : c))
      : [savedItem, ...current.filter((c) => c.id !== id)];

    try {
      localStorage.setItem(STORAGE_CATALOGOS_KEY, JSON.stringify(updated));
    } catch {
      // Ignora erro de cota local, já que os dados principais estão salvos no Supabase
    }
    dispatchCollectionEvents(STORAGE_CATALOGOS_KEY);
    window.dispatchEvent(new Event('fenix_catalogos_items_updated'));
    window.dispatchEvent(new Event('fenix_documentos_updated'));

    return { success: true, item: savedItem };
  } catch (err: any) {
    console.error('Exceção ao salvar catálogo:', err);
    return {
      success: false,
      error: err?.message || 'Falha ao salvar catálogo. Verifique sua conexão e tente novamente.',
    };
  }
}

export function saveCatalogo(
  data: Partial<CatalogoItem>,
  userName = 'Usuário Fênix'
): CatalogoItem {
  saveCatalogoAsync(data, undefined, userName).catch(() => {});
  const current = getCatalogos();
  return current.find((c) => c.id === data.id) || {
    id: data.id || `cat_item_${Date.now()}`,
    titulo: data.titulo || 'Novo Catálogo',
    categoriaId: data.categoriaId || '',
    categoriaNome: data.categoriaNome || 'Geral',
    createdAt: new Date().toISOString(),
    criadoPor: userName,
  };
}

export async function updateCatalogoAsync(
  id: string,
  updates: Partial<CatalogoItem>,
  userName = 'Usuário Fênix'
): Promise<CatalogoItem | null> {
  const current = getCatalogos();
  const target = current.find((c) => c.id === id);
  if (!target) return null;

  const updated: CatalogoItem = {
    ...target,
    ...updates,
    updatedAt: new Date().toISOString(),
  };

  const res = await saveItemToSupabase(STORAGE_CATALOGOS_KEY, updated, 'id', userName);
  if (!res.success) return null;

  const list = current.map((c) => (c.id === id ? updated : c));
  try {
    localStorage.setItem(STORAGE_CATALOGOS_KEY, JSON.stringify(list));
  } catch {}
  dispatchCollectionEvents(STORAGE_CATALOGOS_KEY);

  return updated;
}

export function updateCatalogo(
  id: string,
  updates: Partial<CatalogoItem>,
  userName = 'Usuário Fênix'
): CatalogoItem | null {
  updateCatalogoAsync(id, updates, userName).catch(() => {});
  const current = getCatalogos();
  const target = current.find((c) => c.id === id);
  return target ? { ...target, ...updates } : null;
}

export async function deleteCatalogoAsync(id: string, userName = 'Usuário Fênix'): Promise<boolean> {
  // Remove registro do Supabase
  const res = await deleteItemFromSupabase(STORAGE_CATALOGOS_KEY, id, 'id', userName);
  // Remove arquivo associado do Supabase e IndexedDB
  await deletePdfFile(id);

  const current = getCatalogos();
  const filtered = current.filter((c) => c.id !== id);
  try {
    localStorage.setItem(STORAGE_CATALOGOS_KEY, JSON.stringify(filtered));
  } catch {}
  dispatchCollectionEvents(STORAGE_CATALOGOS_KEY);

  return res.success;
}

export function deleteCatalogo(id: string, userName = 'Usuário Fênix'): boolean {
  deleteCatalogoAsync(id, userName).catch(() => {});
  const current = getCatalogos();
  const filtered = current.filter((c) => c.id !== id);
  try {
    localStorage.setItem(STORAGE_CATALOGOS_KEY, JSON.stringify(filtered));
  } catch {}
  dispatchCollectionEvents(STORAGE_CATALOGOS_KEY);
  return true;
}

export async function duplicateCatalogoAsync(id: string, userName = 'Usuário Fênix'): Promise<CatalogoItem | null> {
  const current = getCatalogos();
  const target = current.find((c) => c.id === id);
  if (!target) return null;

  const newId = `cat_item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // Copia o arquivo binário para o novo ID se existir
  const originalDataUrl = await getPdfDataUrl(id);
  if (originalDataUrl) {
    await persistPdfFile(newId, originalDataUrl, target.nomeArquivo || 'catalogo.pdf', userName);
  }

  const copy: CatalogoItem = {
    ...target,
    id: newId,
    titulo: `${target.titulo} (Cópia)`,
    fileStorageKey: `fenix_file_${newId}`,
    createdAt: now,
    updatedAt: now,
    criadoPor: userName,
  };

  const res = await saveItemToSupabase(STORAGE_CATALOGOS_KEY, copy, 'id', userName);
  if (!res.success) return null;

  const updated = [copy, ...current];
  try {
    localStorage.setItem(STORAGE_CATALOGOS_KEY, JSON.stringify(updated));
  } catch {}
  dispatchCollectionEvents(STORAGE_CATALOGOS_KEY);

  return copy;
}

export function duplicateCatalogo(id: string, userName = 'Usuário Fênix'): CatalogoItem | null {
  duplicateCatalogoAsync(id, userName).catch(() => {});
  return null;
}

export async function toggleCatalogoFavorite(id: string, userName = 'Usuário Fênix'): Promise<CatalogoItem | null> {
  const current = getCatalogos();
  const target = current.find((c) => c.id === id);
  if (!target) return null;

  const updated: CatalogoItem = {
    ...target,
    isFavorite: !target.isFavorite,
    updatedAt: new Date().toISOString(),
  };

  await saveItemToSupabase(STORAGE_CATALOGOS_KEY, updated, 'id', userName);
  const list = current.map((c) => (c.id === id ? updated : c));
  try {
    localStorage.setItem(STORAGE_CATALOGOS_KEY, JSON.stringify(list));
  } catch {}
  dispatchCollectionEvents(STORAGE_CATALOGOS_KEY);

  return updated;
}

export async function renameCatalogo(id: string, newTitle: string, userName = 'Usuário Fênix'): Promise<CatalogoItem | null> {
  const clean = newTitle.trim();
  if (!clean) return null;
  return updateCatalogoAsync(id, { titulo: clean }, userName);
}

export async function changeCatalogoCategoria(
  id: string,
  newCategoriaId: string,
  newCategoriaNome: string,
  userName = 'Usuário Fênix'
): Promise<CatalogoItem | null> {
  return updateCatalogoAsync(id, { categoriaId: newCategoriaId, categoriaNome: newCategoriaNome }, userName);
}

// ==========================================
// DOCUMENTOS E MODELOS
// ==========================================

export function getDocumentos(): DocumentoItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_DOCUMENTOS_KEY);
    let list: DocumentoItem[] = [];
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    }

    // Garante que o modelo oficial "Tabela de Revenda" (Prompt 4) esteja sempre registrado
    const hasTabelaRevenda = list.some(
      (d) => d.id === 'tabela_revenda_setembro_2026' || (d.titulo === 'Tabela de Revenda' && d.isModelo)
    );
    if (!hasTabelaRevenda) {
      const initialTabela = getInitialTabelaRevendaDoc();
      list = [initialTabela, ...list];
      try {
        localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(list));
      } catch {}
      dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);
      saveWholeCollectionToSupabase(STORAGE_DOCUMENTOS_KEY, list, 'Sistema Fênix').catch(() => {});
    }

    return list;
  } catch (err) {
    console.error('Erro ao ler documentos:', err);
    return [];
  }
}

/**
 * Consulta a lista completa de documentos e modelos do Supabase e sincroniza o cache local.
 */
export async function fetchDocumentosFromDatabase(): Promise<DocumentoItem[]> {
  const client = getSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('fenix_kv_store')
        .select('data')
        .eq('key', STORAGE_DOCUMENTOS_KEY)
        .maybeSingle();

      if (!error && data && Array.isArray(data.data)) {
        let list = data.data as DocumentoItem[];
        const hasTabelaRevenda = list.some(
          (d) => d.id === 'tabela_revenda_setembro_2026' || (d.titulo === 'Tabela de Revenda' && d.isModelo)
        );
        if (!hasTabelaRevenda) {
          const initialTabela = getInitialTabelaRevendaDoc();
          list = [initialTabela, ...list];
          saveWholeCollectionToSupabase(STORAGE_DOCUMENTOS_KEY, list, 'Sistema Fênix').catch(() => {});
        }
        try {
          localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(list));
        } catch {}
        return list;
      }
    } catch (err) {
      console.warn('Erro ao carregar documentos do Supabase:', err);
    }
  }
  return getDocumentos();
}

export function getDocumentoById(id: string): DocumentoItem | null {
  const list = getDocumentos();
  return list.find((d) => d.id === id) || null;
}

export function createBlankPage(numero = 1): DocumentoPagina {
  return {
    id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    numero,
    titulo: `Página ${numero}`,
    backgroundColor: '#ffffff',
    elementos: [],
  };
}

export function createBlankDocumento(
  categoriaId = '',
  categoriaNome = 'Geral',
  userName = 'Usuário Fênix',
  isModelo = false
): DocumentoItem {
  const now = new Date().toISOString();
  return {
    id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    titulo: isModelo ? 'Novo Modelo' : 'Novo Documento',
    categoriaId,
    categoriaNome,
    isModelo,
    paginas: [createBlankPage(1)],
    versoes: [],
    createdAt: now,
    updatedAt: now,
    criadoPor: userName,
  };
}

/**
 * Salva um documento ou modelo de forma 100% persistente no Supabase.
 */
export async function saveDocumentoAsync(
  doc: Partial<DocumentoItem>,
  fileOrDataUrl?: File | Blob | string,
  userName = 'Usuário Fênix',
  options?: { createVersion?: boolean; versionDesc?: string; onProgress?: (progress: { currentChunk: number; totalChunks: number; percent: number }) => void }
): Promise<{ success: boolean; item?: DocumentoItem; error?: string }> {
  try {
    const current = getDocumentos();
    const now = new Date();
    const nowIso = now.toISOString();
    const id = doc.id || `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const isEdit = Boolean(doc.id && current.some((d) => d.id === doc.id));
    const existing = isEdit ? current.find((d) => d.id === id) : null;

    let sizeFormatted = doc.tamanhoArquivo || existing?.tamanhoArquivo || '';

    // 1. Upload do PDF para o Supabase caso fornecido
    if (fileOrDataUrl) {
      const fileRes = await persistPdfFile(
        id,
        fileOrDataUrl,
        doc.nomeArquivoOriginal || existing?.nomeArquivoOriginal || 'documento.pdf',
        userName,
        undefined,
        options?.onProgress
      );
      if (!fileRes.success) {
        return {
          success: false,
          error: fileRes.error || 'Erro ao persistir PDF no Supabase.',
        };
      }
      sizeFormatted = fileRes.sizeFormatted;
    }

    // 2. Histórico de versões
    const versoes = [...(existing?.versoes || [])];
    if (options?.createVersion && existing?.paginas && existing.paginas.length > 0) {
      const novaVersao: DocumentoVersao = {
        id: `v_${Date.now()}`,
        data: now.toLocaleDateString('pt-BR'),
        hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        usuario: userName,
        descricao: options.versionDesc || `Versão salva em ${now.toLocaleDateString('pt-BR')}`,
        paginas: JSON.parse(JSON.stringify(existing.paginas)),
      };
      versoes.unshift(novaVersao);
      if (versoes.length > 20) versoes.pop();
    }

    // 3. Montagem do item de documento
    const savedItem: DocumentoItem = {
      id,
      titulo: (doc.titulo || existing?.titulo || 'Novo Documento').trim(),
      categoriaId: doc.categoriaId || existing?.categoriaId || '',
      categoriaNome: doc.categoriaNome || existing?.categoriaNome || 'Geral',
      descricao: doc.descricao ?? existing?.descricao ?? '',
      isModelo: doc.isModelo !== undefined ? Boolean(doc.isModelo) : Boolean(existing?.isModelo),
      isFavorite: doc.isFavorite !== undefined ? Boolean(doc.isFavorite) : Boolean(existing?.isFavorite),
      isPdfImportado: doc.isPdfImportado !== undefined ? Boolean(doc.isPdfImportado) : Boolean(existing?.isPdfImportado),
      nomeArquivoOriginal: doc.nomeArquivoOriginal || existing?.nomeArquivoOriginal,
      fileStorageKey: `fenix_file_${id}`,
      tamanhoArquivo: sizeFormatted,
      tipoArquivo: doc.tipoArquivo || existing?.tipoArquivo || 'application/pdf',
      totalPaginas: doc.totalPaginas || existing?.totalPaginas || (doc.paginas?.length || 1),
      capaUrl: doc.capaUrl || existing?.capaUrl,
      paginas: doc.paginas && doc.paginas.length > 0 ? doc.paginas : (existing?.paginas || [createBlankPage(1)]),
      versoes,
      camposModelo: doc.camposModelo !== undefined ? doc.camposModelo : (existing?.camposModelo || []),
      modeloOrigemId: doc.modeloOrigemId || existing?.modeloOrigemId,
      valoresPreenchidos: doc.valoresPreenchidos !== undefined ? doc.valoresPreenchidos : existing?.valoresPreenchidos,
      assinaturaNormalDataUrl: doc.assinaturaNormalDataUrl || existing?.assinaturaNormalDataUrl,
      assinaturaGovBrInfo: doc.assinaturaGovBrInfo || existing?.assinaturaGovBrInfo,
      clienteVinculadoId: doc.clienteVinculadoId || existing?.clienteVinculadoId,
      clienteNome: doc.clienteNome || existing?.clienteNome,
      pedidoVinculado: doc.pedidoVinculado || existing?.pedidoVinculado,
      mes: doc.mes || existing?.mes,
      ano: doc.ano || existing?.ano,
      isTabelaComercial: doc.isTabelaComercial !== undefined ? doc.isTabelaComercial : existing?.isTabelaComercial,
      tipoTabela: doc.tipoTabela || existing?.tipoTabela,
      tabelaProdutosData: doc.tabelaProdutosData !== undefined ? doc.tabelaProdutosData : existing?.tabelaProdutosData,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
      criadoPor: existing?.criadoPor || userName,
    };

    // 4. Salvar registro no Supabase
    const result = await saveItemToSupabase(STORAGE_DOCUMENTOS_KEY, savedItem, 'id', userName);
    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Falha ao salvar documento no Supabase.',
      };
    }

    // 5. Atualizar lista local
    const updated = isEdit
      ? current.map((d) => (d.id === id ? savedItem : d))
      : [savedItem, ...current.filter((d) => d.id !== id)];

    try {
      localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(updated));
    } catch {}
    dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);
    window.dispatchEvent(new Event('fenix_documentos_items_updated'));
    window.dispatchEvent(new Event('fenix_documentos_updated'));

    return { success: true, item: savedItem };
  } catch (err: any) {
    console.error('Exceção ao salvar documento:', err);
    return {
      success: false,
      error: err?.message || 'Falha ao salvar documento. Tente novamente.',
    };
  }
}

export function saveDocumento(
  doc: Partial<DocumentoItem>,
  userName = 'Usuário Fênix',
  options?: { createVersion?: boolean; versionDesc?: string }
): DocumentoItem {
  saveDocumentoAsync(doc, undefined, userName, options).catch(() => {});
  const current = getDocumentos();
  return current.find((d) => d.id === doc.id) || {
    id: doc.id || `doc_${Date.now()}`,
    titulo: doc.titulo || 'Novo Documento',
    categoriaId: doc.categoriaId || '',
    categoriaNome: doc.categoriaNome || 'Geral',
    isModelo: Boolean(doc.isModelo),
    paginas: [createBlankPage(1)],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    criadoPor: userName,
  };
}

export async function deleteDocumentoAsync(id: string, userName = 'Usuário Fênix'): Promise<boolean> {
  const res = await deleteItemFromSupabase(STORAGE_DOCUMENTOS_KEY, id, 'id', userName);
  await deletePdfFile(id);

  const current = getDocumentos();
  const filtered = current.filter((d) => d.id !== id);
  try {
    localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(filtered));
  } catch {}
  dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);

  return res.success;
}

export function deleteDocumento(id: string, userName = 'Usuário Fênix'): boolean {
  deleteDocumentoAsync(id, userName).catch(() => {});
  const current = getDocumentos();
  const filtered = current.filter((d) => d.id !== id);
  try {
    localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(filtered));
  } catch {}
  dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);
  return true;
}

export async function duplicateDocumentoAsync(id: string, userName = 'Usuário Fênix'): Promise<DocumentoItem | null> {
  const current = getDocumentos();
  const target = current.find((d) => d.id === id);
  if (!target) return null;

  const newId = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  // Copia arquivo se existir
  const originalDataUrl = await getPdfDataUrl(id);
  if (originalDataUrl) {
    await persistPdfFile(newId, originalDataUrl, target.nomeArquivoOriginal || 'documento.pdf', userName);
  }

  const copy: DocumentoItem = {
    ...target,
    id: newId,
    titulo: `${target.titulo} (Cópia)`,
    fileStorageKey: `fenix_file_${newId}`,
    camposModelo: target.camposModelo
      ? JSON.parse(JSON.stringify(target.camposModelo))
      : [],
    paginas: target.paginas.map((p, idx) => ({
      ...p,
      id: `page_${Date.now()}_${idx}`,
      elementos: p.elementos.map((el, elIdx) => ({
        ...el,
        id: `el_${Date.now()}_${idx}_${elIdx}`,
      })),
    })),
    versoes: [],
    createdAt: now,
    updatedAt: now,
    criadoPor: userName,
  };

  const res = await saveItemToSupabase(STORAGE_DOCUMENTOS_KEY, copy, 'id', userName);
  if (!res.success) return null;

  const updated = [copy, ...current];
  try {
    localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(updated));
  } catch {}
  dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);

  return copy;
}

export function duplicateDocumento(id: string, userName = 'Usuário Fênix'): DocumentoItem | null {
  duplicateDocumentoAsync(id, userName).catch(() => {});
  return null;
}

export async function toggleDocumentoFavorite(id: string, userName = 'Usuário Fênix'): Promise<DocumentoItem | null> {
  const current = getDocumentos();
  const target = current.find((d) => d.id === id);
  if (!target) return null;

  const updated: DocumentoItem = {
    ...target,
    isFavorite: !target.isFavorite,
    updatedAt: new Date().toISOString(),
  };

  await saveItemToSupabase(STORAGE_DOCUMENTOS_KEY, updated, 'id', userName);
  const list = current.map((d) => (d.id === id ? updated : d));
  try {
    localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(list));
  } catch {}
  dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);

  return updated;
}

export async function renameDocumentoAsync(id: string, newTitle: string, userName = 'Usuário Fênix'): Promise<DocumentoItem | null> {
  const clean = newTitle.trim();
  if (!clean) return null;
  const current = getDocumentos();
  const target = current.find((d) => d.id === id);
  if (!target) return null;

  const updated = { ...target, titulo: clean, updatedAt: new Date().toISOString() };
  await saveItemToSupabase(STORAGE_DOCUMENTOS_KEY, updated, 'id', userName);
  const list = current.map((d) => (d.id === id ? updated : d));
  try {
    localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(list));
  } catch {}
  dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);

  return updated;
}

export function renameDocumento(id: string, newTitle: string, userName = 'Usuário Fênix'): DocumentoItem | null {
  renameDocumentoAsync(id, newTitle, userName).catch(() => {});
  const current = getDocumentos();
  const target = current.find((d) => d.id === id);
  return target ? { ...target, titulo: newTitle } : null;
}

export async function changeDocumentoCategoriaAsync(
  id: string,
  newCategoriaId: string,
  newCategoriaNome: string,
  userName = 'Usuário Fênix'
): Promise<DocumentoItem | null> {
  const current = getDocumentos();
  const target = current.find((d) => d.id === id);
  if (!target) return null;

  const updated = { ...target, categoriaId: newCategoriaId, categoriaNome: newCategoriaNome, updatedAt: new Date().toISOString() };
  await saveItemToSupabase(STORAGE_DOCUMENTOS_KEY, updated, 'id', userName);
  const list = current.map((d) => (d.id === id ? updated : d));
  try {
    localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(list));
  } catch {}
  dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);

  return updated;
}

export function restoreDocumentoVersao(
  docId: string,
  versaoId: string,
  userName = 'Usuário Fênix'
): DocumentoItem | null {
  const current = getDocumentos();
  const target = current.find((d) => d.id === docId);
  if (!target || !target.versoes) return null;

  const versao = target.versoes.find((v) => v.id === versaoId);
  if (!versao) return null;

  const now = new Date();
  const backupVersao: DocumentoVersao = {
    id: `v_${Date.now()}`,
    data: now.toLocaleDateString('pt-BR'),
    hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    usuario: userName,
    descricao: `Estado anterior antes de restaurar versão de ${versao.data} ${versao.hora}`,
    paginas: JSON.parse(JSON.stringify(target.paginas)),
  };

  target.paginas = JSON.parse(JSON.stringify(versao.paginas));
  target.versoes = [backupVersao, ...target.versoes];
  target.updatedAt = now.toISOString();

  localStorage.setItem(STORAGE_DOCUMENTOS_KEY, JSON.stringify(current));
  dispatchCollectionEvents(STORAGE_DOCUMENTOS_KEY);
  saveWholeCollectionToSupabase(STORAGE_DOCUMENTOS_KEY, current, userName).catch(() => {});
  return target;
}

// ==========================================
// HISTÓRICO DE ENVIOS
// ==========================================

export function getDocumentosEnvios(): DocumentoEnvio[] {
  try {
    const raw = localStorage.getItem(STORAGE_ENVIOS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.error('Erro ao ler envios de documentos:', err);
    return [];
  }
}

export function registerDocumentoEnvio(
  envio: Omit<DocumentoEnvio, 'id' | 'data' | 'hora' | 'usuario'> & { usuario?: string },
  userName = 'Usuário Fênix'
): DocumentoEnvio {
  const current = getDocumentosEnvios();
  const now = new Date();
  const novoEnvio: DocumentoEnvio = {
    id: `envio_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    ...envio,
    data: now.toISOString().split('T')[0],
    hora: now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    usuario: userName,
    status: envio.status || 'Enviado',
  };

  const updated = [novoEnvio, ...current];
  localStorage.setItem(STORAGE_ENVIOS_KEY, JSON.stringify(updated));
  dispatchCollectionEvents(STORAGE_ENVIOS_KEY);
  saveWholeCollectionToSupabase(STORAGE_ENVIOS_KEY, updated, userName).catch(() => {});
  return novoEnvio;
}

export function deleteDocumentoEnvio(id: string, userName = 'Usuário Fênix'): boolean {
  const current = getDocumentosEnvios();
  const filtered = current.filter((e) => e.id !== id);
  if (filtered.length === current.length) return false;

  localStorage.setItem(STORAGE_ENVIOS_KEY, JSON.stringify(filtered));
  dispatchCollectionEvents(STORAGE_ENVIOS_KEY);
  saveWholeCollectionToSupabase(STORAGE_ENVIOS_KEY, filtered, userName).catch(() => {});
  return true;
}
