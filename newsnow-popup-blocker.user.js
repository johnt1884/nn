// ==UserScript==
// @name         NewsNow Popup Blocker & Scroll Restorer
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Blocks membership popups and consent dialogs on NewsNow pages and restores scrolling and interactivity.
// @author       Jules
// @match        *://*.newsnow.co.uk/*
// @match        *://*.newsnow.com/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 1. Inject CSS to hide popups, overlays, and backdrops instantly before they render
    const cssRules = `
        /* Hide membership popups and Sourcepoint consent overlays */
        .membership-main[type="popup"],
        .membership-main,
        div[class*="membership-main"],
        div[class*="membership-auto-learn"],
        div[id^="sp_message_container_"],
        iframe[id^="sp_message_iframe_"],
        .message-overlay {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }

        /* Restore scrolling on html and body when blocked by consent/membership classes */
        html, body,
        html.sp-message-open, body.sp-message-open,
        html.no-scroll, body.no-scroll,
        html.modal-open, body.modal-open {
            overflow: auto !important;
            position: static !important;
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

    // Flag to prevent recursive loop inside cleanup from triggering MutationObserver
    let isCleaning = false;

    // 2. Continuous cleanup function to restore scroll and remove blocking elements
    function cleanup() {
        if (isCleaning) return;
        isCleaning = true;

        try {
            // Remove membership main elements
            const popups = document.querySelectorAll('.membership-main, [class*="membership-main"], div[type="popup"]');
            popups.forEach(el => {
                el.remove();
            });

            // Remove Sourcepoint consent overlays/iframes if any
            const containers = document.querySelectorAll('div[id^="sp_message_container_"], iframe[id^="sp_message_iframe_"], .message-overlay');
            containers.forEach(el => {
                el.remove();
            });

            // Restore body/html scrolling and classes
            const docHtml = document.documentElement;
            const docBody = document.body;

            if (docHtml) {
                if (docHtml.classList.contains('sp-message-open') || docHtml.classList.contains('modal-open') || docHtml.classList.contains('no-scroll')) {
                    docHtml.classList.remove('sp-message-open', 'modal-open', 'no-scroll');
                }
                const htmlStyle = docHtml.getAttribute('style') || '';
                if (htmlStyle.includes('overflow') || htmlStyle.includes('position')) {
                    docHtml.style.setProperty('overflow', 'auto', 'important');
                    docHtml.style.setProperty('position', 'static', 'important');
                }
            }

            if (docBody) {
                if (docBody.classList.contains('sp-message-open') || docBody.classList.contains('modal-open') || docBody.classList.contains('no-scroll')) {
                    docBody.classList.remove('sp-message-open', 'modal-open', 'no-scroll');
                }
                const bodyStyle = docBody.getAttribute('style') || '';
                if (bodyStyle.includes('overflow') || bodyStyle.includes('position')) {
                    docBody.style.setProperty('overflow', 'auto', 'important');
                    docBody.style.setProperty('position', 'static', 'important');
                }
            }
        } catch (e) {
            console.error("Error during cleanup", e);
        } finally {
            isCleaning = false;
        }
    }

    // Run cleanup immediately on load / periodically
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cleanup);
    } else {
        cleanup();
    }
    window.addEventListener('load', cleanup);

    // 3. MutationObserver to handle dynamically added popups
    function setupObserver() {
        if (!document.documentElement) return;
        const observer = new MutationObserver((mutations) => {
            if (isCleaning) return;

            // Check if any mutations are actually something we care about before cleaning up
            let shouldClean = false;
            for (let i = 0; i < mutations.length; i++) {
                const mutation = mutations[i];
                if (mutation.type === 'childList') {
                    // Check if added nodes contain matching popup or container elements
                    for (let j = 0; j < mutation.addedNodes.length; j++) {
                        const node = mutation.addedNodes[j];
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            if (node.matches && (
                                node.matches('.membership-main, [class*="membership-main"], div[type="popup"], div[id^="sp_message_container_"], iframe[id^="sp_message_iframe_"], .message-overlay') ||
                                node.querySelector('.membership-main, [class*="membership-main"], div[type="popup"], div[id^="sp_message_container_"], iframe[id^="sp_message_iframe_"], .message-overlay')
                            )) {
                                shouldClean = true;
                                break;
                            }
                        }
                    }
                    if (shouldClean) break;
                } else if (mutation.type === 'attributes') {
                    const target = mutation.target;
                    // Only trigger if class or style on html/body is actually locking page scrolling
                    if (target === document.documentElement || target === document.body) {
                        const classes = target.classList;
                        if (classes.contains('sp-message-open') || classes.contains('modal-open') || classes.contains('no-scroll')) {
                            shouldClean = true;
                            break;
                        }
                        const styleStr = target.getAttribute('style') || '';
                        if (styleStr.includes('overflow: hidden') || styleStr.includes('position: fixed') || styleStr.includes('overflow') || styleStr.includes('position')) {
                            shouldClean = true;
                            break;
                        }
                    }
                }
            }
            if (shouldClean) {
                cleanup();
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    }

    if (document.documentElement) {
        setupObserver();
    } else {
        document.addEventListener('DOMContentLoaded', setupObserver);
    }

    // 4. Periodic interval backup to ensure nothing is missed (but with longer delay to reduce load)
    setInterval(cleanup, 1000);

})();
