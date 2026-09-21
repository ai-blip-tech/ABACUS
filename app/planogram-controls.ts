"use client";

/** Controls rendered next to the selected object keep using the plan editor's React actions. */
if (typeof window !== "undefined" && !(window as Window & { __roomPlanControls?: boolean }).__roomPlanControls) {
  (window as Window & { __roomPlanControls?: boolean }).__roomPlanControls = true;
  const later = (callback: () => void) => window.setTimeout(callback, 0);
  const trigger = (selector: string) => document.querySelector<HTMLButtonElement>(`.plan-properties ${selector}`)?.click();

  type CatalogProduct = { id:string;name:string;article:string;image:string;images?:string[];url:string;price:number;available:boolean;subtype:string;widthMm:number|null;depthMm:number|null };
  const catalogType = (item: HTMLElement) => {
    const name = (item.getAttribute("aria-label") || "").toLocaleLowerCase("ru-RU");
    if (item.classList.contains("sofa")) return "sofa";
    if (item.classList.contains("chair")) return "armchair";
    if (item.classList.contains("stool")) return "chair";
    if (item.classList.contains("bed")) return "bed";
    if (item.classList.contains("dresser")) return "dresser";
    if (item.classList.contains("tv_stand")) return "tv_stand";
    if (item.classList.contains("rug")) return "rug";
    if (item.classList.contains("lamp")) return "light";
    if (item.classList.contains("decor")) return "decor";
    if (item.classList.contains("table")) {
      if (name.includes("журналь") || name.includes("пристав")) return "coffee_table";
      if (name.includes("письмен") || name.includes("туалет")) return "desk_table";
      if (name.includes("обеден")) return "dining_table";
      return "table";
    }
    return "";
  };

  const closeCatalog = () => document.querySelector(".catalog-drawer-dom")?.remove();
  const openCatalog = (item: HTMLElement) => {
    closeCatalog();
    const itemIndex = Array.from(document.querySelectorAll(".planogram-furniture")).indexOf(item);
    const type = catalogType(item);
    if (itemIndex < 0 || !type) return;
    const drawer = document.createElement("aside");
    drawer.className = "catalog-drawer catalog-drawer-dom";
    drawer.setAttribute("aria-label", "Каталог товаров");
    const title = (item.getAttribute("aria-label") || "Предмет").split(":")[0];
    drawer.innerHTML = `<header><div><span>КАТАЛОГ</span><b></b></div><button type="button" aria-label="Закрыть каталог">×</button></header><div class="catalog-search"><input placeholder="Название или артикул" aria-label="Поиск по названию или артикулу"><label><input type="checkbox">В наличии</label></div><div class="catalog-chips"></div><div class="catalog-results-head"><span>Загружаем товары…</span></div><div class="catalog-grid"></div><footer>Товар получит изображение, артикул и реальные габариты из каталога.</footer>`;
    drawer.querySelector("header b")!.textContent = title;
    drawer.querySelector("header button")!.addEventListener("click", closeCatalog);
    document.querySelector(".planogram-workspace")?.append(drawer);
    const search = drawer.querySelector<HTMLInputElement>(".catalog-search>input")!;
    const available = drawer.querySelector<HTMLInputElement>('.catalog-search input[type="checkbox"]')!;
    const chips = drawer.querySelector<HTMLElement>(".catalog-chips")!;
    const head = drawer.querySelector<HTMLElement>(".catalog-results-head")!;
    const grid = drawer.querySelector<HTMLElement>(".catalog-grid")!;
    let subtype = "", page = 1, total = 0, timer = 0, loading = false, requestToken = 0, controller: AbortController | null = null;
    const renderProducts = (products: CatalogProduct[], append: boolean) => {
      if (!append) grid.replaceChildren();
      products.forEach((product, productIndex) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "catalog-card";
        const media = document.createElement("span");
        media.className = "catalog-card-image";
        const sources = Array.from(new Set([product.image, ...(product.images || [])].filter(Boolean)));
        const image = document.createElement("img");
        image.src = sources[0] || "";
        image.alt = product.name;
        image.loading = !append && productIndex < 4 ? "eager" : "lazy";
        image.decoding = "async";
        let sourceIndex = 0;
        image.addEventListener("load", () => media.classList.add("loaded"));
        image.addEventListener("error", () => {
          sourceIndex += 1;
          if (sources[sourceIndex]) image.src = sources[sourceIndex];
          else { image.classList.add("failed"); media.classList.add("loaded"); }
        });
        media.append(image);
        if (!product.available) { const badge = document.createElement("em"); badge.textContent = "Под заказ"; media.append(badge); }
        const name = document.createElement("b"); name.textContent = product.name;
        const article = document.createElement("small"); article.textContent = `Арт. ${product.article}`;
        card.append(media, name, article);
        if (product.widthMm && product.depthMm) { const size = document.createElement("span"); size.textContent = `${product.widthMm} × ${product.depthMm} мм`; card.append(size); }
        const price = document.createElement("strong"); price.textContent = product.price ? `${new Intl.NumberFormat("ru-RU").format(product.price)} ₽` : "Цена по запросу"; card.append(price);
        card.addEventListener("click", () => { window.dispatchEvent(new CustomEvent("room-plan-catalog-select", { detail: { index: itemIndex, product } })); closeCatalog(); });
        grid.append(card);
      });
    };
    const load = (append = false) => {
      if (loading && append) return;
      loading = true;
      const token = ++requestToken;
      controller?.abort(); controller = new AbortController();
      head.innerHTML = `<span>${append ? "Загружаем ещё…" : "Загружаем товары…"}</span>`;
      const params = new URLSearchParams({ type, q: search.value.trim(), subtype, page: String(page), limit: "12" });
      if (available.checked) params.set("available", "1");
      fetch(`/api/catalog?${params}`, { signal: controller.signal }).then(async (response) => { const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Не удалось загрузить каталог."); return payload; }).then((payload) => {
        total = payload.total || 0; renderProducts(payload.products || [], append); head.innerHTML = `<span>${total} товаров</span>`;
        if (!chips.children.length && payload.subtypes?.length > 1) {
          const values = ["", ...payload.subtypes.slice(0, 7)];
          values.forEach((value: string, index: number) => { const button = document.createElement("button"); button.type = "button"; button.textContent = index === 0 ? "Все" : value; button.className = value === subtype ? "active" : ""; button.addEventListener("click", () => { subtype = value; page = 1; Array.from(chips.children).forEach((child) => child.classList.remove("active")); button.classList.add("active"); load(false); }); chips.append(button); });
        }
      }).catch((error) => { if (error?.name !== "AbortError") head.innerHTML = `<span>Каталог временно недоступен</span>`; }).finally(() => { if (token === requestToken) loading = false; });
    };
    search.addEventListener("input", () => { window.clearTimeout(timer); timer = window.setTimeout(() => { page = 1; load(false); }, 300); });
    available.addEventListener("change", () => { page = 1; load(false); });
    grid.addEventListener("scroll", () => {
      if (!loading && grid.children.length < total && grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 240) {
        page += 1;
        load(true);
      }
    });
    load();
  };

  const attachDelete = () => {
    const menu = document.querySelector<HTMLElement>(".plan-context-menu");
    if (!menu || menu.querySelector(".plan-context-delete")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "danger plan-context-delete";
    button.textContent = "Удалить предмет";
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      trigger(".plan-delete");
    });
    menu.append(button);
  };

  const attachCatalog = (item: HTMLElement) => {
    const menu = document.querySelector<HTMLElement>(".plan-context-menu");
    if (!menu || menu.querySelector(".plan-context-catalog") || !catalogType(item)) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "plan-context-catalog";
    button.textContent = "Добавить из каталога";
    button.addEventListener("pointerdown", (event) => event.stopPropagation());
    button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); openCatalog(item); });
    const deleteButton = menu.querySelector(".plan-context-delete");
    if (deleteButton) menu.insertBefore(button, deleteButton); else menu.append(button);
  };

  document.addEventListener("contextmenu", (event) => {
    const item = (event.target as HTMLElement | null)?.closest<HTMLElement>(".planogram-furniture");
    if (item) later(() => { attachCatalog(item); attachDelete(); });
  });
}
