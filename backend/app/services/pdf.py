from playwright.async_api import async_playwright


async def html_to_pdf(html: str) -> bytes:
    """Convert rendered proposal HTML into a PDF byte stream.

    Playwright is used because Chromium understands the same HTML/CSS that the
    live preview uses. This keeps preview and PDF output close to each other.
    """

    try:
        async with async_playwright() as playwright:
            # A fresh headless Chromium instance is enough for v0.1.0. For higher
            # traffic later, keep a browser process alive and reuse pages.
            browser = await playwright.chromium.launch()
            page = await browser.new_page(viewport={"width": 1440, "height": 1200})

            # networkidle gives local CSS/images time to finish loading before
            # Chromium captures the PDF.
            await page.set_content(html, wait_until="networkidle")
            pdf = await page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
            await browser.close()
            return pdf
    except Exception as exc:
        # Keep the public API error simple; the original exception is chained for
        # server logs and debugging.
        raise RuntimeError(
            "PDF generation failed. Confirm Playwright is installed and Chromium has been installed."
        ) from exc
