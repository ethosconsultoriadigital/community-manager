/** @type {import('md-to-pdf').Config} */
module.exports = {
  pdf_options: {
    format: 'A4',
    margin: { top: '16mm', right: '12mm', bottom: '16mm', left: '12mm' },
    printBackground: true,
  },
  stylesheet: ['./manual-pdf.css'],
};
