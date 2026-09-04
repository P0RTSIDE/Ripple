/*
 * Ripple user guide UI
 * --------------------
 * The written guide lives in index.html (#guide-panel). Whenever pond, fish,
 * food, tools, or unlock mechanics change, update that HTML so the guide
 * stays current. This file only handles the disclaimer gate and open/close.
 *
 * Loaded on demand from the guide button so the first pond paint stays light.
 */

(function () {
    "use strict";

    if (window.__rippleGuide) return;

    const btn = document.getElementById("guide-btn");
    const gate = document.getElementById("guide-gate");
    const panel = document.getElementById("guide-panel");
    const proceed = document.getElementById("guide-proceed");
    const decline = document.getElementById("guide-decline");
    const closeBtn = document.getElementById("guide-close");

    if (!btn || !gate || !panel) return;

    function setOpen(el, open) {
        el.classList.toggle("open", open);
        el.setAttribute("aria-hidden", open ? "false" : "true");
    }

    function isOpen() {
        return gate.classList.contains("open") || panel.classList.contains("open");
    }

    function closeAll() {
        setOpen(gate, false);
        setOpen(panel, false);
        btn.setAttribute("aria-pressed", "false");
        btn.setAttribute("aria-expanded", "false");
        btn.title = "User guide";
    }

    function openGate() {
        setOpen(panel, false);
        setOpen(gate, true);
        btn.setAttribute("aria-pressed", "true");
        btn.setAttribute("aria-expanded", "true");
        btn.title = "Close guide";
        if (proceed) proceed.focus();
    }

    function openGuide() {
        setOpen(gate, false);
        setOpen(panel, true);
        btn.setAttribute("aria-pressed", "true");
        btn.setAttribute("aria-expanded", "true");
        btn.title = "Close guide";
        if (closeBtn) closeBtn.focus();
    }

    function toggle() {
        if (isOpen()) closeAll();
        else openGate();
    }

    if (proceed) {
        proceed.addEventListener("click", (e) => {
            e.stopPropagation();
            openGuide();
        });
    }

    if (decline) {
        decline.addEventListener("click", (e) => {
            e.stopPropagation();
            closeAll();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            closeAll();
        });
    }

    // Click outside the card/sheet closes the overlay.
    gate.addEventListener("click", (e) => {
        if (e.target === gate) closeAll();
    });
    panel.addEventListener("click", (e) => {
        if (e.target === panel) closeAll();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        if (isOpen()) {
            e.preventDefault();
            closeAll();
        }
    });

    // Keep guide clicks from falling through to the canvas.
    gate.querySelector(".guide-card")?.addEventListener("click", (e) => e.stopPropagation());
    panel.querySelector(".guide-sheet")?.addEventListener("click", (e) => e.stopPropagation());

    window.__rippleGuide = { toggle, openGate, openGuide, closeAll, isOpen };
})();
