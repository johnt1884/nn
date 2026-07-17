// ==UserScript==
// @name         NewsNow Popup Blocker & Scroll Restorer
// @namespace    http://tampermonkey.net/
// @version      1.6
// @description  Blocks membership popups and consent dialogs on NewsNow pages and restores scrolling and interactivity with zero performance overhead.
// @author       Jules
// @match        *://*.newsnow.co.uk/*
// @match        *://*.newsnow.com/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 1. CSS-only hiding is extremely lightweight, instantaneous, and has absolutely zero performance overhead.
    // CSS "!important" rules override inline styles and class-based styles applied by the page's scripts.
    const cssRules = `
        /* Hide membership popups and Sourcepoint consent overlays */
        .membership-main[type="popup"],
        .membership-main,
        div[class*="membership-main"],
        div[class*="membership-auto-learn"],
        div[id^="sp_message_container_"],
        iframe[id^="sp_message_iframe_"],
        .message-overlay,
        [class*="message-overlay"] {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            height: 0 !important;
            width: 0 !important;
        }

        /* Restore scrolling on html and body when blocked by consent/membership classes/styles */
        html, body,
        html.sp-message-open, body.sp-message-open,
        html.no-scroll, body.no-scroll,
        html.modal-open, body.modal-open {
            overflow: auto !important;
            overflow-y: auto !important;
            position: static !important;
            height: auto !important;
            width: auto !important;
            margin-top: 0px !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
            background-color: initial;
        }
    `;

    function injectStyle() {
        if (typeof GM_addStyle !== 'undefined') {
            GM_addStyle(cssRules);
        } else {
            const style = document.createElement('style');
            style.textContent = cssRules;
            const parent = document.head || document.documentElement;
            if (parent) {
                parent.appendChild(style);
            } else {
                const observer = new MutationObserver(() => {
                    const p = document.head || document.documentElement;
                    if (p) {
                        p.appendChild(style);
                        observer.disconnect();
                    }
                });
                observer.observe(document, { childList: true, subtree: true });
            }
        }
    }

    try {
        injectStyle();
    } catch (e) {
        console.error("Failed to inject CSS style", e);
    }

    let observer = null;

    // 2. Cleanup function to restore scroll and remove blocking elements.
    // Temporarily disconnects the MutationObserver to guarantee absolutely zero recursive loops.
    function cleanup() {
        // Disconnect observer synchronously to avoid hearing our own mutations
        if (observer) {
            observer.disconnect();
        }

        try {
            // Restore body/html scrolling and classes
            const docHtml = document.documentElement;
            const docBody = document.body;

            if (docHtml) {
                if (docHtml.classList.contains('sp-message-open') || docHtml.classList.contains('modal-open') || docHtml.classList.contains('no-scroll')) {
                    docHtml.classList.remove('sp-message-open', 'modal-open', 'no-scroll');
                }
                if (docHtml.hasAttribute('data-previous-scroll-y')) {
                    docHtml.removeAttribute('data-previous-scroll-y');
                }
                const htmlStyle = docHtml.getAttribute('style') || '';
                if (htmlStyle.includes('overflow') || htmlStyle.includes('position') || htmlStyle.includes('margin-top')) {
                    docHtml.style.setProperty('overflow', 'auto', 'important');
                    docHtml.style.setProperty('overflow-y', 'auto', 'important');
                    docHtml.style.setProperty('position', 'static', 'important');
                    docHtml.style.setProperty('height', 'auto', 'important');
                    docHtml.style.setProperty('width', 'auto', 'important');
                    docHtml.style.setProperty('margin-top', '0px', 'important');
                    docHtml.style.setProperty('top', 'auto', 'important');
                    docHtml.style.setProperty('left', 'auto', 'important');
                    docHtml.style.setProperty('right', 'auto', 'important');
                }
            }

            if (docBody) {
                if (docBody.classList.contains('sp-message-open') || docBody.classList.contains('modal-open') || docBody.classList.contains('no-scroll')) {
                    docBody.classList.remove('sp-message-open', 'modal-open', 'no-scroll');
                }
                const bodyStyle = docBody.getAttribute('style') || '';
                if (bodyStyle.includes('overflow') || bodyStyle.includes('position') || bodyStyle.includes('margin-top')) {
                    docBody.style.setProperty('overflow', 'auto', 'important');
                    docBody.style.setProperty('overflow-y', 'auto', 'important');
                    docBody.style.setProperty('position', 'static', 'important');
                    docBody.style.setProperty('height', 'auto', 'important');
                    docBody.style.setProperty('width', 'auto', 'important');
                    docBody.style.setProperty('margin-top', '0px', 'important');
                    docBody.style.setProperty('top', 'auto', 'important');
                    docBody.style.setProperty('left', 'auto', 'important');
                    docBody.style.setProperty('right', 'auto', 'important');
                }
            }
        } catch (e) {
            console.error("Error during cleanup", e);
        } finally {
            // Reconnect the observer after safe execution
            if (observer) {
                setupObserverObservation();
            }
        }
    }

    function setupObserverObservation() {
        if (!observer) return;
        if (document.documentElement) {
            observer.observe(document.documentElement, {
                attributes: true,
                attributeFilter: ['class', 'style', 'data-previous-scroll-y']
            });
        }
        if (document.body) {
            observer.observe(document.body, {
                attributes: true,
                attributeFilter: ['class', 'style']
            });
        }
    }

    // 3. MutationObserver on html and body tags ONLY (no childList: true or subtree: true)
    function setupObserver() {
        observer = new MutationObserver((mutations) => {
            cleanup();
        });
        setupObserverObservation();
    }

    // Run cleanup immediately on load / DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            cleanup();
            setupObserver();
        });
    } else {
        cleanup();
        setupObserver();
    }
    window.addEventListener('load', cleanup);

    // 4. Low-frequency periodic backup interval to catch edge cases
    setInterval(cleanup, 1500);

})();
