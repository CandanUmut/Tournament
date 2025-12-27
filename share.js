import { toast } from './utils.js';

const loadLib = async (url) => import(/* @vite-ignore */ url);

export const exportPng = async (node, name='tournament') => {
  try{
    const { toPng } = await loadLib('https://esm.sh/html-to-image@1.11.11');
    const dataUrl = await toPng(node, { cacheBust:true, pixelRatio:2 });
    const a = document.createElement('a'); a.href=dataUrl; a.download=`${name}.png`; a.click();
    toast('PNG exported');
  }catch(e){ console.error(e); toast('PNG export failed'); }
};

export const exportPdf = async (node, name='tournament') => {
  try{
    const [{ toPng }, { jsPDF }] = await Promise.all([
      loadLib('https://esm.sh/html-to-image@1.11.11'),
      loadLib('https://cdn.skypack.dev/jspdf@2.5.1')
    ]);
    const dataUrl = await toPng(node, { cacheBust:true, pixelRatio:2 });
    const pdf = new jsPDF({ orientation:'landscape', unit:'px', format:'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    pdf.addImage(dataUrl, 'PNG', 10, 10, pageWidth-20, pageHeight-20);
    pdf.save(`${name}.pdf`);
    toast('PDF exported');
  }catch(e){ console.error(e); toast('PDF export failed'); }
};
