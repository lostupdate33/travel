const BROWSER_PRINT_STYLE = `
  <style>
    @page {
      size: A4 portrait;
      margin: 0;
    }

    @media print {
      html,
      body {
        width: 210mm !important;
        margin: 0 !important;
        background: #fff !important;
      }

      body {
        print-color-adjust: exact !important;
        -webkit-print-color-adjust: exact !important;
      }

      .proposal,
      .invoice-page,
      .cover,
      .page {
        width: 210mm !important;
      }

      .invoice-page {
        min-height: 297mm !important;
      }

      .cover,
      .page {
        height: 297mm !important;
        min-height: 297mm !important;
        max-height: 297mm !important;
        overflow: hidden !important;
        break-after: page !important;
        page-break-after: always !important;
      }

      .cover {
        padding: 46px 50px !important;
      }

      .page {
        padding: 44px 50px 46px !important;
      }

      .stat-grid {
        grid-template-columns: repeat(4, minmax(0, 1fr)) !important;
      }

      .destination-feature {
        grid-template-columns: 1.05fr .95fr !important;
      }

      .stay-card {
        grid-template-columns: .72fr 1fr !important;
      }

      .quote-page {
        grid-template-columns: .95fr 1.05fr !important;
      }

      .terms-grid,
      .mini-grid,
      .review-grid,
      .charge-grid,
      .contact-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
      }

      .payment-grid {
        grid-template-columns: 1fr 116px !important;
      }
    }
  </style>
`;

const PRINT_SCRIPT = `
  <script>
    function backgroundImageUrls() {
      return Array.from(document.querySelectorAll("*"))
        .map((element) => window.getComputedStyle(element).backgroundImage)
        .filter((value) => value && value !== "none")
        .flatMap((value) => Array.from(value.matchAll(/url\\\\(["']?([^"')]+)["']?\\\\)/g)).map((match) => match[1]));
    }

    function waitForImage(url) {
      return new Promise((resolve) => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = resolve;
        image.src = url;
      });
    }

    async function waitForPrintAssets() {
      const inlineImages = Array.from(document.images).map((image) => {
        if (image.complete) return Promise.resolve();
        return image.decode ? image.decode().catch(() => {}) : new Promise((resolve) => {
          image.onload = resolve;
          image.onerror = resolve;
        });
      });
      const backgroundImages = backgroundImageUrls().map(waitForImage);
      await Promise.all([...inlineImages, ...backgroundImages]);
    }

    window.addEventListener("load", async () => {
      await waitForPrintAssets();
      window.setTimeout(() => {
        window.focus();
        window.print();
      }, 250);
    });
  </script>
`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function withTitle(html, title) {
  const safeTitle = escapeHtml(title);
  if (html.includes("<title>")) {
    return html.replace(/<title>.*?<\/title>/, `<title>${safeTitle}</title>`);
  }
  return html.replace("</head>", `<title>${safeTitle}</title></head>`);
}

function withPrintStyle(html) {
  if (html.includes("</head>")) {
    return html.replace("</head>", `${BROWSER_PRINT_STYLE}</head>`);
  }
  return `${BROWSER_PRINT_STYLE}${html}`;
}

function withPrintScript(html) {
  if (html.includes("</body>")) {
    return html.replace("</body>", `${PRINT_SCRIPT}</body>`);
  }
  return `${html}${PRINT_SCRIPT}`;
}

export function printableProposalHtml(previewHtml, printTitle) {
  return withPrintScript(withPrintStyle(withTitle(previewHtml, printTitle)));
}

export function openProposalPrintWindow({ previewHtml, printTitle }) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    return false;
  }

  printWindow.document.open();
  printWindow.document.write(printableProposalHtml(previewHtml, printTitle));
  printWindow.document.close();
  return true;
}
