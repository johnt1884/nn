// ==UserScript==
// @name         NewsNow Popup Blocker & Scroll Restorer
// @namespace    http://tampermonkey.net/
// @version      1.8
// @description  Instantly blocks membership popups and consent dialogs on NewsNow pages and restores scrolling and mouse-wheel interactivity.
// @author       Jules
// @match        *://*.newsnow.co.uk/*
// @match        *://*.newsnow.com/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 1. Prevent event-preventing scroll-blocking scripts from hijacking mousewheel / touchpad scrolling.
    // Webpages often call `event.preventDefault()` on 'wheel', 'mousewheel', 'touchmove', or keypress events to lock scrolling.
    // By wrapping Event.prototype.preventDefault and making it a no-op for scroll/wheel events, we guarantee standard mouse-wheel scrolling continues to work.
    try {
        const originalPreventDefault = Event.prototype.preventDefault;
        Event.prototype.preventDefault = function() {
            if (this && (
                this.type === 'wheel' ||
                this.type === 'mousewheel' ||
                this.type === 'DOMMouseScroll' ||
                this.type === 'touchmove'
            )) {
                // Ignore preventDefault() calls on scroll and wheel events to keep native scrolling enabled!
                return;
            }
            return originalPreventDefault.apply(this, arguments);
        };
    } catch (e) {
        console.error("Failed to override Event.prototype.preventDefault", e);
    }

    // 2. Declarative CSS-only overrides.
    // This is 100% immune to JS infinite loops/page hangs because it does not modify DOM attributes or trigger page MutationObservers.
    // CSS !important rules completely bypass inline styles and class-based scroll-locking applied by the site's scripts.
    const cssRules = `
        /* Hide membership popups, overlays, and backdrops instantly before they can draw/dim the page */
        .membership-main[type="popup"],
        .membership-main,
        div[class*="membership-main"],
        div[class*="membership-auto-learn"],
        div[id^="sp_message_container_"],
        iframe[id^="sp_message_iframe_"],
        .message-overlay,
        [class*="message-overlay"],
        .overlay,
        .overlay__shade {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
            height: 0 !important;
            width: 0 !important;
        }

        /* Override dimming/shading overlay backgrounds */
        .overlay, .overlay__shade {
            background: none !important;
            background-color: transparent !important;
        }

        /* Completely unlock scrolling on both html and body tags */
        /* By forcing position: static, top: auto, and overflow: auto, we completely neutralize */
        /* any inline styles or classes (like sp-message-open) that freeze the scrollbar. */
        html, body,
        html[class], body[class] {
            overflow: auto !important;
            overflow-y: auto !important;
            position: static !important;
            height: auto !important;
            width: auto !important;
            margin-top: 0px !important;
            top: auto !important;
            left: auto !important;
            right: auto !important;
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

    // 3. Safe, non-intrusive cleanup function to remove hidden elements from the DOM.
    function cleanupDOM() {
        try {
            // Remove membership popup elements
            const popups = document.querySelectorAll('.membership-main, [class*="membership-main"], div[type="popup"]');
            popups.forEach(el => el.remove());

            // Remove Sourcepoint consent overlays/iframes
            const containers = document.querySelectorAll('div[id^="sp_message_container_"], iframe[id^="sp_message_iframe_"], .message-overlay, [class*="message-overlay"]');
            containers.forEach(el => containers.forEach(el => el.remove()));
        } catch (e) {
            console.error("Error during DOM cleanup", e);
        }
    }

    // Run DOM node cleanup safely on DOMContentLoaded and Load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', cleanupDOM);
    } else {
        cleanupDOM();
    }
    window.addEventListener('load', cleanupDOM);

})();
