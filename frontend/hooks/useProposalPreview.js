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
    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const html = await renderProposalHtml(proposal, { signal: controller.signal });
        if (isCurrent) {
          setPreviewHtml(html);
        }
      } catch (error) {
        if (error.name === "AbortError") return;
        if (isCurrent) {
          onErrorRef.current?.(error);
        }
      }
    }, 600);

    return () => {
      isCurrent = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [proposal]);

  return previewHtml;
}
