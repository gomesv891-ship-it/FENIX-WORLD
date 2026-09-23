import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface GeneratePdfOptions {
  fileName?: string;
  onProgress?: (progress: number, status: string) => void;
}

/**
 * Captura elementos de página HTML (A4) e compila em um arquivo PDF multipáginas oficial Fênix World
 */
export async function generateDocumentPdf(
  pageElements: HTMLElement[],
  options?: GeneratePdfOptions
): Promise<{ blob: Blob; dataUrl: string; download: () => void }> {
  const fileName = (options?.fileName || 'documento_fenix.pdf').replace(/\.pdf$/i, '') + '.pdf';
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const totalPages = pageElements.length;

  for (let i = 0; i < totalPages; i++) {
    const el = pageElements[i];
    if (options?.onProgress) {
      options.onProgress(Math.round(((i + 1) / totalPages) * 100), `Renderizando página ${i + 1} de ${totalPages}...`);
    }

    // Renderiza cada página do DOM para canvas com escala 2 para máxima nitidez
    const canvas = await html2canvas(el, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      windowWidth: 794,
      windowHeight: 1123,
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    // Dimensões A4 em milímetros
    const pdfWidth = 210;
    const pdfHeight = 297;
    pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
  }

  const blob = pdf.output('blob');
  const dataUrl = pdf.output('datauristring');

  const download = () => {
    pdf.save(fileName);
  };

  return { blob, dataUrl, download };
}
