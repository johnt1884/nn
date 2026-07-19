// ==UserScript==
// @name         NewsNow Popup Blocker & Scroll Restorer
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  Instantly blocks membership popups and consent dialogs on NewsNow pages and restores scrolling and mouse-wheel interactivity.
// @author       Jules
// @match        *://*.newsnow.co.uk/*
// @match        *://*.newsnow.com/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    // 1. Injected Main-Context Script to completely neutralize scroll-blocking APIs.
    // This script runs inside the page's actual window/unsafe scope before any other scripts execute.
    const injectionCode = `
        (function() {
            try {
                // Track user interactions to safely distinguish user-initiated scrolls (like clicking "back to top") from script-initiated locks
                let lastUserInteractionTime = 0;
                ['click', 'keydown', 'mousedown', 'touchstart'].forEach(type => {
                    window.addEventListener(type, () => {
                        lastUserInteractionTime = Date.now();
                    }, { passive: true, capture: true });
                });

                function isUserInitiated() {
                    if (navigator.userActivation && navigator.userActivation.isActive) {
                        return true;
                    }
                    return (Date.now() - lastUserInteractionTime) < 1000;
                }

                // A) Force all scroll/wheel event listeners to be passive so they cannot prevent scrolling
                const originalAddEventListener = EventTarget.prototype.addEventListener;
                EventTarget.prototype.addEventListener = function(type, listener, options) {
                    if (type === 'wheel' || type === 'mousewheel' || type === 'DOMMouseScroll' || type === 'touchmove') {
                        if (options === undefined || options === null) {
                            options = { passive: true };
                        } else if (typeof options === 'boolean') {
                            options = { capture: options, passive: true };
                        } else if (typeof options === 'object') {
                            options.passive = true;
                        }
                    }
                    return originalAddEventListener.call(this, type, listener, options);
                };

                // B) Neutralize Event.prototype.preventDefault on wheel, scroll, touch and keyboard events
                const originalPreventDefault = Event.prototype.preventDefault;
                Event.prototype.preventDefault = function() {
                    if (this && (
                        this.type === 'wheel' ||
                        this.type === 'mousewheel' ||
                        this.type === 'DOMMouseScroll' ||
                        this.type === 'touchmove' ||
                        this.type === 'keydown' ||
                        this.type === 'keyup'
                    )) {
                        return;
                    }
                    return originalPreventDefault.apply(this, arguments);
                };

                // C) Reject direct scroll event-handler property setters (e.g. window.onwheel = function...)
                ['onwheel', 'onmousewheel', 'ontouchmove', 'onscroll'].forEach(prop => {
                    try {
                        Object.defineProperty(window, prop, {
                            configurable: true,
                            get: function() { return null; },
                            set: function() { return; }
                        });
                        Object.defineProperty(document, prop, {
                            configurable: true,
                            get: function() { return null; },
                            set: function() { return; }
                        });
                        Object.defineProperty(HTMLElement.prototype, prop, {
                            configurable: true,
                            get: function() { return null; },
                            set: function() { return; }
                        });
                    } catch (e) {}
                });

                // D) Neutralize vertical scrollTop/scrollTo lock resets unless user-initiated
                const originalScrollTo = window.scrollTo;
                window.scrollTo = function(x, y) {
                    if (y === 0 || (typeof x === 'object' && x.top === 0)) {
                        if (!isUserInitiated()) {
                            return;
                        }
                    }
                    return originalScrollTo.apply(this, arguments);
                };

                const originalScroll = window.scroll;
                window.scroll = function(x, y) {
                    if (y === 0 || (typeof x === 'object' && x.top === 0)) {
                        if (!isUserInitiated()) {
                            return;
                        }
                    }
                    return originalScroll.apply(this, arguments);
                };

                const originalScrollTopDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
                if (originalScrollTopDescriptor && originalScrollTopDescriptor.set) {
                    Object.defineProperty(Element.prototype, 'scrollTop', {
                        configurable: true,
                        enumerable: true,
                        get: originalScrollTopDescriptor.get,
                        set: function(val) {
                            if (val === 0 && (this === document.documentElement || this === document.body)) {
                                if (!isUserInitiated()) {
                                    return;
                                }
                            }
                            originalScrollTopDescriptor.set.call(this, val);
                        }
                    });
                }

                // E) Intercept and reject style setters that lock scrollbars or fix position on HTML/Body
                const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
                CSSStyleDeclaration.prototype.setProperty = function(property, value, priority) {
                    const isHtmlOrBody = this.parentRule && (
                        this.parentRule.selectorText === 'html' ||
                        this.parentRule.selectorText === 'body'
                    ) || (
                        this.parentRule === undefined
                    );

                    if (isHtmlOrBody) {
                        if (property === 'overflow' && (value === 'hidden' || value.includes('hidden'))) {
                            return;
                        }
                        if (property === 'position' && (value === 'fixed' || value.includes('fixed'))) {
                            return;
                        }
                        if (property === 'top' || property === 'margin-top') {
                            return;
                        }
                    }
                    return originalSetProperty.call(this, property, value, priority);
                };

                const originalOverflowDescriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'overflow');
                if (originalOverflowDescriptor && originalOverflowDescriptor.set) {
                    Object.defineProperty(CSSStyleDeclaration.prototype, 'overflow', {
                        configurable: true,
                        enumerable: true,
                        get: originalOverflowDescriptor.get,
                        set: function(val) {
                            if (val === 'hidden' || (typeof val === 'string' && val.includes('hidden'))) {
                                return;
                            }
                            originalOverflowDescriptor.set.call(this, val);
                        }
                    });
                }

                const originalPositionDescriptor = Object.getOwnPropertyDescriptor(CSSStyleDeclaration.prototype, 'position');
                if (originalPositionDescriptor && originalPositionDescriptor.set) {
                    Object.defineProperty(CSSStyleDeclaration.prototype, 'position', {
                        configurable: true,
                        enumerable: true,
                        get: originalPositionDescriptor.get,
                        set: function(val) {
                            if (val === 'fixed' || (typeof val === 'string' && val.includes('fixed'))) {
                                return;
                            }
                            originalPositionDescriptor.set.call(this, val);
                        }
                    });
                }

                // F) Intercept element attributes / classList additions
                const originalSetAttribute = Element.prototype.setAttribute;
                Element.prototype.setAttribute = function(name, value) {
                    if (this === document.documentElement || this === document.body) {
                        if (name === 'class' && (value.includes('sp-message-open') || value.includes('no-scroll') || value.includes('modal-open'))) {
                            value = value.replace('sp-message-open', '').replace('no-scroll', '').replace('modal-open', '');
                        }
                        if (name === 'style' && (value.includes('hidden') || value.includes('fixed'))) {
                            value = value.replace(/overflow\\s*:\\s*hidden/gi, '')
                                         .replace(/position\\s*:\\s*fixed/gi, '')
                                         .replace(/top\\s*:\\s*[0-9a-zA-Z-.]+/gi, '')
                                         .replace(/margin-top\\s*:\\s*[0-9a-zA-Z-.]+/gi, '');
                        }
                        if (name === 'data-previous-scroll-y') {
                            return;
                        }
                    }
                    return originalSetAttribute.call(this, name, value);
                };

                const originalClassListAdd = DOMTokenList.prototype.add;
                DOMTokenList.prototype.add = function() {
                    const filteredArgs = [];
                    for (let i = 0; i < arguments.length; i++) {
                        const className = arguments[i];
                        if (className !== 'sp-message-open' && className !== 'no-scroll' && className !== 'modal-open') {
                            filteredArgs.push(className);
                        }
                    }
                    if (filteredArgs.length > 0) {
                        return originalClassListAdd.apply(this, filteredArgs);
                    }
                };

            } catch (e) {
                console.error("Failed to inject dynamic scroll lock interception", e);
            }
        })();
    `;

    try {
        const script = document.createElement('script');
        script.textContent = injectionCode;
        (document.head || document.documentElement).appendChild(script);
        script.remove(); // Clean up script tag after execution
    } catch (e) {
        console.error("Failed to inject event override script", e);
    }

    // 2. Declarative CSS-only overrides.
    // CSS "!important" rules completely bypass inline styles and class-based scroll-locking applied by the site's scripts.
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
        html, body,
        html[class], body[class],
        html[style], body[style] {
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
            containers.forEach(el => el.remove());
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
