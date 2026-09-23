import * as pdfjsLib from 'pdfjs-dist';
import { DocumentoPagina, DocumentoElemento } from '../types';

// Configura o worker do pdfjs de forma segura para o navegador
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '4.0.379'}/pdf.worker.min.mjs`;
  } catch {
    // Fallback se version não estiver definida
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
  }
}

export interface ImportedPdfResult {
  title: string;
  totalPages: number;
  pages: DocumentoPagina[];
  rawFileUrl?: string;
}

/**
 * Lê um arquivo PDF selecionado e renderiza cada página em alta definição como fundo de página,
 * extraindo também blocos de texto individuais como elementos editáveis quando possível.
 */
export async function importPdfFile(file: File): Promise<ImportedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const pages: DocumentoPagina[] = [];

  // Converte também o PDF para DataUrl para preview nativo caso necessário
  const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
  const rawFileUrl = await fileToDataUrl(file);

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.5 }); // Escala 1.5 para fidelidade visual cristalina
    const standardWidth = 794; // Largura A4 padrão a 96DPI
    const standardHeight = 1123; // Altura A4 padrão a 96DPI
    const scaleFactorX = standardWidth / viewport.width;
    const scaleFactorY = standardHeight / viewport.height;

    // Renderiza a página em canvas para capturar 100% de layout, vetores, formas e imagens
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    let pageBackgroundDataUrl = '';
    if (ctx) {
      await (page.render({ canvasContext: ctx, viewport, canvas } as any) as any).promise;
      pageBackgroundDataUrl = canvas.toDataURL('image/jpeg', 0.88);
    }

    // Tenta extrair blocos de texto da página
    const elementos: DocumentoElemento[] = [];
    try {
      const textContent = await page.getTextContent();
      let elementIdx = 0;

      for (const item of textContent.items) {
        if ('str' in item && typeof item.str === 'string' && item.str.trim()) {
          const tx = (item.transform[4] || 0) * scaleFactorX;
          // Em PDF a origem Y é na base da página, invertemos para a coordenada do canvas (topo para baixo)
          const pdfY = item.transform[5] || 0;
          const ty = (viewport.height / 1.5 - pdfY) * scaleFactorY;

          // Filtra ruídos minúsculos e agrupa
          if (ty >= 0 && ty <= standardHeight && tx >= 0 && tx <= standardWidth) {
            elementos.push({
              id: `el_pdf_${pageNum}_${elementIdx++}`,
              tipo: 'texto',
              x: Math.max(10, Math.min(standardWidth - 200, Math.round(tx))),
              y: Math.max(10, Math.min(standardHeight - 40, Math.round(ty))),
              width: Math.min(400, Math.max(80, Math.round(item.width * scaleFactorX * 1.2))),
              height: Math.round(Math.max(22, (item.height || 14) * scaleFactorY * 1.3)),
              conteudo: item.str,
              fontSize: Math.max(10, Math.min(24, Math.round((item.height || 12) * 1.1))),
              fontFamily: 'Inter, sans-serif',
              color: '#0f172a',
              backgroundColor: 'transparent',
              textAlign: 'left',
              fontWeight: 'normal',
            });
          }
        }
      }
    } catch (textErr) {
      console.warn('Não foi possível extrair texto vetorizado da página:', textErr);
    }

    pages.push({
      id: `page_${Date.now()}_${pageNum}`,
      numero: pageNum,
      titulo: `Página ${pageNum}`,
      backgroundColor: '#ffffff',
      backgroundImage: pageBackgroundDataUrl,
      // Caso tenhamos elementos de texto extraídos, incluímos os mais significativos;
      // o background preserva 100% da visualização e permite ao usuário adicionar anotações e carimbos
      elementos,
    });
  }

  const cleanTitle = file.name.replace(/\.[^/.]+$/, '').trim() || 'Documento Importado';

  return {
    title: cleanTitle,
    totalPages,
    pages,
    rawFileUrl,
  };
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
