import { useEffect, useRef, useState } from "react";

import { renderProposalHtml } from "../lib/api";

export function useProposalPreview(proposal, onError) {
  const [previewHtml, setPreviewHtml] = useState("");
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!proposal) return undefined;

    let isCurrent = true;
    const timeout = setTimeout(async () => {
      try {
        const html = await renderProposalHtml(proposal);
        if (isCurrent) {
          setPreviewHtml(html);
        }
      } catch (error) {
        if (isCurrent) {
          onErrorRef.current?.(error);
        }
      }
    }, 180);

    return () => {
      isCurrent = false;
      clearTimeout(timeout);
    };
  }, [proposal]);

  return previewHtml;
}
