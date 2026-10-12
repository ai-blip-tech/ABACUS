(function () {
  "use strict";
  var VERSION = "2.0-preview";
  var ALLOWED_INBOUND = new Set(["widget.ready", "widget.opened", "widget.closed", "page.changed", "user.click_product", "widget.link_opened", "handoff.requested", "widget.error", "ono.message.sent", "ono.catalog.results", "widget.ui_action"]);
  var instances = new Map();

  function safeContext(value) {
    value = value && typeof value === "object" ? value : {};
    var product = value.product && typeof value.product === "object" ? value.product : null;
    var attributes = product && Array.isArray(product.attributes) ? product.attributes.slice(0, 30).map(function (item) {
      item = item && typeof item === "object" ? item : {};
      return { name: String(item.name || "").slice(0, 80), value: String(item.value || "").slice(0, 240) };
    }).filter(function (item) { return item.name && item.value; }) : [];
    var availability = product ? String(product.availability || "unknown") : "unknown";
    if (!["in_stock", "out_of_stock", "preorder", "unknown"].includes(availability)) availability = "unknown";
    return {
      pageType: String(value.pageType || "other").slice(0, 40),
      pathname: String(value.pathname || location.pathname).slice(0, 500),
      title: String(value.title || document.title).slice(0, 200),
      entityId: String(value.entityId || "").slice(0, 120),
      templateSlug: String(value.templateSlug || "").slice(0, 120),
      product: product ? {
        id: String(product.id || "").slice(0, 120),
        sku: String(product.sku || "").slice(0, 120),
        name: String(product.name || "").slice(0, 200),
        category: String(product.category || "").slice(0, 120),
        brand: String(product.brand || "").slice(0, 120),
        collection: String(product.collection || "").slice(0, 120),
        price: Number.isFinite(Number(product.price)) && Number(product.price) >= 0 ? Number(product.price) : undefined,
        currency: "RUB",
        availability: availability,
        canonicalUrl: /^https:\/\//i.test(String(product.canonicalUrl || "")) ? String(product.canonicalUrl).slice(0, 500) : "",
        attributes: attributes,
      } : undefined,
    };
  }

  function mount(options) {
    options = options || {};
    var instanceKey = String(options.instanceKey || options.siteId || "roomdesign").slice(0, 80);
    if (instances.has(instanceKey)) return instances.get(instanceKey);
    var baseUrl = new URL(options.baseUrl || document.currentScript && document.currentScript.src || location.origin, location.href).origin;
    var approvedOrigin = new URL(baseUrl).origin;
    var iframe = document.createElement("iframe");
    iframe.src = baseUrl + "/embed/ono?site=" + encodeURIComponent(options.siteId || "roomdesign") + "&parentOrigin=" + encodeURIComponent(location.origin);
    iframe.title = options.title || "Оно — AI-консультант";
    iframe.dataset.onoWidget = VERSION;
    iframe.setAttribute("allow", "microphone");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:86px;height:86px;border:0;background:transparent;z-index:" + String(options.zIndex || 2147482000) + ";color-scheme:normal;transition:width .2s ease,height .2s ease";
    (options.container || document.body).appendChild(iframe);
    var listeners = new Set();
    var actionTargets = options.actionTargets && typeof options.actionTargets === "object" ? options.actionTargets : {};
    function runUiAction(action) {
      if (!action || !["focus", "highlight", "guide"].includes(action.type)) return;
      var selector = Object.prototype.hasOwnProperty.call(actionTargets, action.target) ? actionTargets[action.target] : "";
      if (typeof selector !== "string" || !selector || selector.length > 300) return;
      var target;
      try { target = document.querySelector(selector); } catch { return; }
      if (!target) return;
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      if (action.type === "focus" && typeof target.focus === "function") target.focus({ preventScroll: true });
      if (action.type === "highlight" || action.type === "guide") {
        var previousOutline = target.style.outline;
        var previousOffset = target.style.outlineOffset;
        target.style.outline = "4px solid rgba(194,104,29,.72)";
        target.style.outlineOffset = "6px";
        window.setTimeout(function () { target.style.outline = previousOutline; target.style.outlineOffset = previousOffset; }, 4200);
      }
    }
    var api = {
      version: VERSION,
      iframe: iframe,
      updateContext: function (context) { if (iframe.contentWindow) iframe.contentWindow.postMessage({ type: "page.changed", version: VERSION, context: safeContext(context) }, approvedOrigin); },
      on: function (listener) { if (typeof listener === "function") listeners.add(listener); return function () { listeners.delete(listener); }; },
      destroy: function () { instances.delete(instanceKey); iframe.remove(); window.removeEventListener("message", receive); },
    };
    function receive(event) {
      if (event.origin !== approvedOrigin || event.source !== iframe.contentWindow) return;
      var payload = event.data;
      if (!payload || payload.version !== VERSION || !ALLOWED_INBOUND.has(payload.type)) return;
      if (payload.type === "widget.opened") {
        iframe.style.width = "min(470px,100vw)";
        iframe.style.height = "min(760px,100vh)";
      }
      if (payload.type === "widget.closed") {
        iframe.style.width = "86px";
        iframe.style.height = "86px";
      }
      if (payload.type === "widget.ui_action") runUiAction(payload.action);
      listeners.forEach(function (listener) { listener(payload); });
    }
    window.addEventListener("message", receive);
    iframe.addEventListener("load", function () { api.updateContext(options.context); });
    instances.set(instanceKey, api);
    return api;
  }

  window.OnoWidget = Object.freeze({ version: VERSION, mount: mount });
})();
