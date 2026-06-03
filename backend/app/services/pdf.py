import asyncio

from playwright.async_api import async_playwright

_playwright = None
_browser = None
_browser_lock = asyncio.Lock()


async def _get_browser():
    global _playwright, _browser

    async with _browser_lock:
        if _browser and _browser.is_connected():
            return _browser

        if _playwright is None:
            _playwright = await async_playwright().start()

        _browser = await _playwright.chromium.launch()
        return _browser


async def html_to_pdf(html: str) -> bytes:
    """Convert rendered proposal HTML into a PDF byte stream.

    Playwright is used because Chromium understands the same HTML/CSS that the
    live preview uses. This keeps preview and PDF output close to each other.
    """

    try:
        browser = await _get_browser()
        context = await browser.new_context(
            viewport={"width": 1440, "height": 1200},
        )
        page = await context.new_page()
        try:
            await page.emulate_media(media="print")

            # The HTML points at local CSS and DB-backed media endpoints. The
            # load event waits for those resources without the extra idle delay
            # that made each export feel slow.
            await page.set_content(html, wait_until="load", timeout=15000)
            pdf = await page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "0", "right": "0", "bottom": "0", "left": "0"},
            )
            return pdf
        finally:
            await context.close()
    except Exception as exc:
        # Keep the public API error simple; the original exception is chained for
        # server logs and debugging.
        raise RuntimeError(
            "PDF generation failed. Confirm Playwright is installed and Chromium has been installed."
        ) from exc
