// ===== STORAGE =====
const DB = {
  get: (key, def = []) => {
    try { return JSON.parse(localStorage.getItem(key)) ?? def; }
    catch { return def; }
  },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  id: () => Date.now().toString(36) + Math.random().toString(36).slice(2),
};

// ===== CONSTANTS =====
const MONEDA = 'UYU';
const fmtPrecio = n => `$${Number(n).toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

// ===== STATE =====
const state = {
  view: 'dashboard',
  perfumes:    DB.get('perfumes'),
  proveedores: DB.get('proveedores'),
  precios:     DB.get('precios'),   // [{id, perfumeId, proveedorId, precio}]
  stock:       DB.get('stock'),     // [{id, perfumeId, cantidad, minimo, precioVenta}]
};

const save = () => {
  DB.set('perfumes',    state.perfumes);
  DB.set('proveedores', state.proveedores);
  DB.set('precios',     state.precios);
  DB.set('stock',       state.stock);
};

// Migrate old data: remove moneda field if present
state.precios.forEach(p => { delete p.moneda; });

// ===== SEED DATA (first run) =====
if (!state.perfumes.length && !state.proveedores.length) {
  state.proveedores = [
    { id: 'p1', nombre: 'Al Haramain', contacto: '', activo: true },
    { id: 'p2', nombre: 'Lattafa',     contacto: '', activo: true },
  ];
  state.perfumes = [
    { id: 'f1', nombre: 'Oud Wood',    marca: 'Tom Ford',    categoria: 'nicho',      modelo: '100ml', notas: '' },
    { id: 'f2', nombre: 'Oud Rose',    marca: 'Al Haramain', categoria: 'arabe',      modelo: '50ml',  notas: '' },
    { id: 'f3', nombre: 'Sauvage EDP', marca: 'Dior',        categoria: 'disenador',  modelo: '100ml', notas: '' },
  ];
  state.precios = [
    { id: DB.id(), perfumeId: 'f1', proveedorId: 'p1', precio: 3200 },
    { id: DB.id(), perfumeId: 'f1', proveedorId: 'p2', precio: 2900 },
    { id: DB.id(), perfumeId: 'f2', proveedorId: 'p1', precio: 1400 },
    { id: DB.id(), perfumeId: 'f3', proveedorId: 'p2', precio: 2500 },
  ];
  state.stock = [
    { id: DB.id(), perfumeId: 'f1', cantidad: 5,  minimo: 2, precioVenta: 5500 },
    { id: DB.id(), perfumeId: 'f2', cantidad: 12, minimo: 3, precioVenta: 2200 },
    { id: DB.id(), perfumeId: 'f3', cantidad: 1,  minimo: 2, precioVenta: 4000 },
  ];
  save();
}

// ===== UTILS =====
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showToast(msg, type = 'success') {
  const t = $('#toast');
  t.textContent = (type === 'success' ? '✓ ' : '✗ ') + msg;
  t.className = `toast ${type} show`;
  setTimeout(() => t.classList.remove('show'), 3000);
}

function openModal(title, bodyHtml) {
  $('#modalTitle').textContent = title;
  $('#modalBody').innerHTML = bodyHtml;
  $('#modalOverlay').classList.add('open');
}

function closeModal() {
  $('#modalOverlay').classList.remove('open');
}

function badgeCat(cat) {
  const map = { arabe: ['badge-arabe','Árabe'], disenador: ['badge-disenador','Diseñador'], nicho: ['badge-nicho','Nicho'] };
  const [cls, label] = map[cat] ?? ['', cat];
  return `<span class="badge ${cls}">${label}</span>`;
}

function getPerfumeById(id)    { return state.perfumes.find(p => p.id === id); }
function getProveedorById(id)  { return state.proveedores.find(p => p.id === id); }
function getStockByPerfume(id) { return state.stock.find(s => s.perfumeId === id); }
function getPreciosByPerfume(id) { return state.precios.filter(p => p.perfumeId === id); }

// Ganancia absoluta y porcentual sobre el costo mínimo
function calcGanancia(precioVenta, costoMin) {
  if (!costoMin || !precioVenta) return null;
  const ganancia = precioVenta - costoMin;
  const pct = (ganancia / costoMin * 100).toFixed(1);
  return { ganancia, pct };
}

// ===== ROUTER =====
function navigate(view) {
  state.view = view;
  $$('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === view));
  const titles = {
    dashboard: 'Dashboard', perfumes: 'Perfumes', proveedores: 'Proveedores',
    comparar: 'Comparar Precios', stock: 'Stock', exportar: 'Exportar',
  };
  $('#pageTitle').textContent = titles[view] ?? view;
  render();
}

// ===== RENDER ROUTER =====
function render() {
  const el = $('#content');
  const actions = $('#topbarActions');
  actions.innerHTML = '';
  switch (state.view) {
    case 'dashboard':   renderDashboard(el, actions); break;
    case 'perfumes':    renderPerfumes(el, actions);  break;
    case 'proveedores': renderProveedores(el, actions); break;
    case 'comparar':    renderComparar(el, actions);  break;
    case 'stock':       renderStock(el, actions);     break;
    case 'exportar':    renderExportar(el, actions);  break;
  }
}

// ===== DASHBOARD =====
function renderDashboard(el) {
  const totalPerfumes    = state.perfumes.length;
  const totalProveedores = state.proveedores.filter(p => p.activo).length;
  const totalPrecios     = state.precios.length;

  const valorStock = state.stock.reduce((acc, s) => {
    const ps = getPreciosByPerfume(s.perfumeId).map(p => p.precio).filter(n => n > 0);
    const min = ps.length ? Math.min(...ps) : 0;
    return acc + min * s.cantidad;
  }, 0);

  const gananciaTotal = state.stock.reduce((acc, s) => {
    const ps = getPreciosByPerfume(s.perfumeId).map(p => p.precio).filter(n => n > 0);
    const costoMin = ps.length ? Math.min(...ps) : null;
    if (!costoMin || !s.precioVenta) return acc;
    return acc + (s.precioVenta - costoMin) * s.cantidad;
  }, 0);

  const bajoStock = state.stock.filter(s => s.cantidad <= s.minimo).length;
  const cats = { arabe: 0, disenador: 0, nicho: 0 };
  state.perfumes.forEach(p => { if (cats[p.categoria] !== undefined) cats[p.categoria]++; });

  el.innerHTML = `
    <div class="stats-grid">
      <div class="stat-card purple">
        <div class="stat-top">
          <span class="stat-label">Perfumes</span>
          <span class="stat-icon">🧴</span>
        </div>
        <div class="stat-value">${totalPerfumes}</div>
        <div class="stat-sub">en catálogo</div>
      </div>
      <div class="stat-card amber">
        <div class="stat-top">
          <span class="stat-label">Proveedores</span>
          <span class="stat-icon">🏭</span>
        </div>
        <div class="stat-value">${totalProveedores}</div>
        <div class="stat-sub">activos</div>
      </div>
      <div class="stat-card green">
        <div class="stat-top">
          <span class="stat-label">Costo de Stock</span>
          <span class="stat-icon">📦</span>
        </div>
        <div class="stat-value" style="font-size:20px">${fmtPrecio(valorStock)}</div>
        <div class="stat-sub">${MONEDA} · precio mínimo de costo</div>
      </div>
      <div class="stat-card blue">
        <div class="stat-top">
          <span class="stat-label">Ganancia Potencial</span>
          <span class="stat-icon">💰</span>
        </div>
        <div class="stat-value" style="font-size:20px">${fmtPrecio(gananciaTotal)}</div>
        <div class="stat-sub">${bajoStock > 0
          ? `<span style="color:var(--red)">⚠ ${bajoStock} bajo stock mínimo</span>`
          : '✓ Stock OK'}</div>
      </div>
    </div>

    <div class="grid-2" style="gap:20px">
      <div class="card">
        <div class="card-header"><span class="card-title">Por categoría</span></div>
        ${renderCatBar(cats, totalPerfumes)}
      </div>
      <div class="card">
        <div class="card-header"><span class="card-title">Stock bajo</span></div>
        ${renderStockAlerts()}
      </div>
    </div>

    <div class="card" style="margin-top:20px">
      <div class="card-header"><span class="card-title">Últimos perfumes agregados</span></div>
      ${renderRecentPerfumes()}
    </div>
  `;
}

function renderCatBar(cats, total) {
  if (total === 0) return '<p style="color:var(--ivory3);font-size:13px">Sin datos aún.</p>';
  const items = [
    { key: 'arabe',     label: 'Árabe',     color: 'var(--gold)',  cls: 'badge-arabe' },
    { key: 'disenador', label: 'Diseñador', color: '#5A7FA8',      cls: 'badge-disenador' },
    { key: 'nicho',     label: 'Nicho',     color: '#C4736A',      cls: 'badge-nicho' },
  ];
  return items.map(i => {
    const pct = total ? (cats[i.key] / total * 100).toFixed(0) : 0;
    return `
      <div style="margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px">
          <span class="badge ${i.cls}">${i.label}</span>
          <span style="color:var(--ivory3)">${cats[i.key]} (${pct}%)</span>
        </div>
        <div class="cat-bar-track">
          <div class="cat-bar-fill" style="background:${i.color};width:${pct}%"></div>
        </div>
      </div>`;
  }).join('');
}

function renderStockAlerts() {
  const alerts = state.stock.filter(s => s.cantidad <= s.minimo);
  if (!alerts.length) return '<p style="color:var(--sage);font-size:13px">✓ Todo el stock está sobre el mínimo.</p>';
  return alerts.map(s => {
    const p = getPerfumeById(s.perfumeId);
    if (!p) return '';
    return `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(201,168,76,0.08)">
        <div>
          <div style="font-size:13px;font-weight:500">${esc(p.nombre)}</div>
          <div style="font-size:11px;color:var(--ivory3)">${esc(p.marca)} · ${esc(p.modelo)}</div>
        </div>
        <div style="text-align:right">
          <div class="stock-low">${s.cantidad} uds</div>
          <div style="font-size:11px;color:var(--ivory3)">mín: ${s.minimo}</div>
        </div>
      </div>`;
  }).join('');
}

function renderRecentPerfumes() {
  const recent = [...state.perfumes].reverse().slice(0, 5);
  if (!recent.length) return `<p style="color:var(--ivory3);font-size:13px">Sin perfumes aún. <a href="#" data-view="perfumes" style="color:var(--gold)">Agregá uno</a>.</p>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Nombre</th><th>Marca</th><th>Modelo</th><th>Categoría</th><th>Mejor Precio</th><th>Precio Venta</th><th>Ganancia</th></tr></thead>
        <tbody>
          ${recent.map(p => {
            const ps = getPreciosByPerfume(p.id).map(pr => pr.precio).filter(v => v > 0);
            const costoMin = ps.length ? Math.min(...ps) : null;
            const s = getStockByPerfume(p.id);
            const g = s?.precioVenta ? calcGanancia(s.precioVenta, costoMin) : null;
            return `<tr>
              <td><strong>${esc(p.nombre)}</strong></td>
              <td style="color:var(--ivory2)">${esc(p.marca)}</td>
              <td style="color:var(--ivory3)">${esc(p.modelo)}</td>
              <td>${badgeCat(p.categoria)}</td>
              <td>${costoMin !== null ? fmtPrecio(costoMin) : '<span class="price-na">—</span>'}</td>
              <td>${s?.precioVenta ? fmtPrecio(s.precioVenta) : '<span class="price-na">—</span>'}</td>
              <td>${g ? `<span class="${parseFloat(g.pct) >= 0 ? 'margin-positive' : 'margin-negative'}">${g.pct}%</span>` : '<span class="price-na">—</span>'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

// ===== PERFUMES =====
function renderPerfumes(el, actions) {
  actions.innerHTML = `<button class="btn btn-primary" id="btnNuevoPerfume">+ Nuevo Perfume</button>`;
  const searchVal = el._search ?? '';
  const filterCat = el._cat ?? '';

  el.innerHTML = `
    <div class="toolbar">
      <input class="search-input" id="searchPerfume" placeholder="Buscar por nombre o marca…" value="${esc(searchVal)}">
      <select class="filter-select" id="filterCat">
        <option value="">Todas las categorías</option>
        <option value="arabe"     ${filterCat==='arabe'?'selected':''}>Árabe</option>
        <option value="disenador" ${filterCat==='disenador'?'selected':''}>Diseñador</option>
        <option value="nicho"     ${filterCat==='nicho'?'selected':''}>Nicho</option>
      </select>
    </div>
    <div class="table-wrap" id="perfumesTable"></div>
  `;

  const renderTable = (search, cat) => {
    const list = state.perfumes.filter(p => {
      const q = search.toLowerCase();
      return (!q || p.nombre.toLowerCase().includes(q) || p.marca.toLowerCase().includes(q))
          && (!cat || p.categoria === cat);
    });

    const wrap = $('#perfumesTable');
    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🧴</div><h3>Sin resultados</h3><p>Probá otra búsqueda o agregá un perfume.</p></div>`;
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead><tr><th>Nombre</th><th>Marca</th><th>Modelo</th><th>Categoría</th><th>Notas</th><th>Mejor Precio</th><th>Precio Venta</th><th>Ganancia</th><th>Acciones</th></tr></thead>
        <tbody>
          ${list.map(p => {
            const ps = getPreciosByPerfume(p.id).map(pr => pr.precio).filter(v => v > 0);
            const costoMin = ps.length ? Math.min(...ps) : null;
            const s = getStockByPerfume(p.id);
            const g = s?.precioVenta ? calcGanancia(s.precioVenta, costoMin) : null;
            return `<tr>
              <td><strong>${esc(p.nombre)}</strong></td>
              <td style="color:var(--ivory2)">${esc(p.marca)}</td>
              <td style="color:var(--ivory3)">${esc(p.modelo)}</td>
              <td>${badgeCat(p.categoria)}</td>
              <td style="color:var(--ivory3);font-size:12px">${esc(p.notas) || '—'}</td>
              <td>${costoMin !== null ? fmtPrecio(costoMin) : '<span class="price-na">—</span>'}</td>
              <td>${s?.precioVenta ? fmtPrecio(s.precioVenta) : '<span class="price-na">—</span>'}</td>
              <td>${g ? `<span class="${parseFloat(g.pct) >= 0 ? 'margin-positive' : 'margin-negative'}">${fmtPrecio(g.ganancia)} (${g.pct}%)</span>` : '<span class="price-na">—</span>'}</td>
              <td>
                <div class="cell-actions">
                  <button class="btn btn-secondary btn-sm" data-action="editperfume" data-id="${p.id}">Editar</button>
                  <button class="btn btn-secondary btn-sm" data-action="precios"     data-id="${p.id}">Precios</button>
                  <button class="btn btn-danger btn-sm"    data-action="delperfume"  data-id="${p.id}">✕</button>
                </div>
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  };

  renderTable(searchVal, filterCat);
  $('#searchPerfume').addEventListener('input', e => { el._search = e.target.value; renderTable(e.target.value, $('#filterCat').value); });
  $('#filterCat').addEventListener('change', e => { el._cat = e.target.value; renderTable($('#searchPerfume').value, e.target.value); });
  actions.querySelector('#btnNuevoPerfume').addEventListener('click', () => formPerfume(null));
}

function formPerfume(perfume) {
  const isEdit = !!perfume;
  const p = perfume ?? { id: '', nombre: '', marca: '', categoria: 'arabe', modelo: '', notas: '' };
  const s = p.id ? (getStockByPerfume(p.id) ?? { precioVenta: 0 }) : { precioVenta: 0 };

  openModal(isEdit ? 'Editar Perfume' : 'Nuevo Perfume', `
    <div class="form-group"><label class="form-label">Nombre *</label>
      <input class="form-control" id="fNombre" value="${esc(p.nombre)}" placeholder="Ej: Oud Wood"></div>
    <div class="form-row">
      <div class="form-group"><label class="form-label">Marca *</label>
        <input class="form-control" id="fMarca" value="${esc(p.marca)}" placeholder="Ej: Tom Ford"></div>
      <div class="form-group"><label class="form-label">Modelo / Tamaño</label>
        <input class="form-control" id="fModelo" value="${esc(p.modelo)}" placeholder="Ej: 100ml EDP"></div>
    </div>
    <div class="form-group"><label class="form-label">Categoría *</label>
      <select class="form-control" id="fCat">
        <option value="arabe"     ${p.categoria==='arabe'?'selected':''}>Árabe</option>
        <option value="disenador" ${p.categoria==='disenador'?'selected':''}>Diseñador</option>
        <option value="nicho"     ${p.categoria==='nicho'?'selected':''}>Nicho</option>
      </select></div>
    <div class="form-group"><label class="form-label">Notas / Descripción</label>
      <input class="form-control" id="fNotas" value="${esc(p.notas)}" placeholder="Ej: amaderado, oud, vainilla"></div>
    <div class="form-group">
      <label class="form-label">Precio de venta (${MONEDA}) <span style="color:var(--ivory3);font-weight:400;text-transform:none;letter-spacing:0">— opcional</span></label>
      <input class="form-control" id="fVenta" type="number" min="0" step="1"
        value="${s.precioVenta || ''}" placeholder="Lo podés completar después">
    </div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btnCancelPerfume">Cancelar</button>
      <button class="btn btn-primary"   id="btnSavePerfume">${isEdit ? 'Guardar cambios' : 'Agregar perfume'}</button>
    </div>
  `);

  $('#btnCancelPerfume').addEventListener('click', closeModal);
  $('#btnSavePerfume').addEventListener('click', () => {
    const nombre      = $('#fNombre').value.trim();
    const marca       = $('#fMarca').value.trim();
    if (!nombre || !marca) { showToast('Nombre y marca son obligatorios', 'error'); return; }

    const precioVenta = parseFloat($('#fVenta').value) || 0;
    let perfumeId;

    if (isEdit) {
      Object.assign(perfume, { nombre, marca, modelo: $('#fModelo').value.trim(), categoria: $('#fCat').value, notas: $('#fNotas').value.trim() });
      perfumeId = perfume.id;
    } else {
      perfumeId = DB.id();
      state.perfumes.push({ id: perfumeId, nombre, marca, modelo: $('#fModelo').value.trim(), categoria: $('#fCat').value, notas: $('#fNotas').value.trim() });
    }

    // Update or create stock entry for precio de venta
    const existing = getStockByPerfume(perfumeId);
    if (existing) {
      existing.precioVenta = precioVenta;
    } else if (precioVenta > 0) {
      state.stock.push({ id: DB.id(), perfumeId, cantidad: 0, minimo: 1, precioVenta });
    }

    save(); closeModal(); render(); showToast(isEdit ? 'Perfume actualizado' : 'Perfume agregado');
  });
}

// ===== PROVEEDORES =====
function renderProveedores(el, actions) {
  actions.innerHTML = `<button class="btn btn-primary" id="btnNuevoProv">+ Nuevo Proveedor</button>`;
  el.innerHTML = `
    <div class="table-wrap">
      ${!state.proveedores.length
        ? `<div class="empty-state"><div class="empty-icon">🏭</div><h3>Sin proveedores</h3><p>Agregá tu primer proveedor para empezar a cargar precios.</p></div>`
        : `<table>
            <thead><tr><th>Nombre</th><th>Contacto</th><th>Perfumes</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              ${state.proveedores.map(pv => {
                const n = new Set(state.precios.filter(pr => pr.proveedorId === pv.id).map(pr => pr.perfumeId)).size;
                return `<tr>
                  <td><strong>${esc(pv.nombre)}</strong></td>
                  <td style="color:var(--ivory3)">${esc(pv.contacto) || '—'}</td>
                  <td style="color:var(--ivory2)">${n}</td>
                  <td>${pv.activo ? '<span class="badge badge-active">Activo</span>' : '<span class="badge badge-inactive">Inactivo</span>'}</td>
                  <td>
                    <div class="cell-actions">
                      <button class="btn btn-secondary btn-sm" data-action="editprov" data-id="${pv.id}">Editar</button>
                      <button class="btn btn-danger btn-sm"    data-action="delprov"  data-id="${pv.id}">✕</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
    </div>
  `;
  actions.querySelector('#btnNuevoProv').addEventListener('click', () => formProveedor(null));
}

function formProveedor(prov) {
  const isEdit = !!prov;
  const p = prov ?? { id: '', nombre: '', contacto: '', activo: true };
  openModal(isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor', `
    <div class="form-group"><label class="form-label">Nombre *</label>
      <input class="form-control" id="pvNombre" value="${esc(p.nombre)}" placeholder="Ej: Lattafa"></div>
    <div class="form-group"><label class="form-label">Contacto</label>
      <input class="form-control" id="pvContacto" value="${esc(p.contacto)}" placeholder="Teléfono, email o Instagram"></div>
    <div class="form-group"><label class="form-label">Estado</label>
      <select class="form-control" id="pvActivo">
        <option value="true"  ${p.activo ?'selected':''}>Activo</option>
        <option value="false" ${!p.activo?'selected':''}>Inactivo</option>
      </select></div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="btnCancelProv">Cancelar</button>
      <button class="btn btn-primary"   id="btnSaveProv">${isEdit ? 'Guardar' : 'Agregar'}</button>
    </div>
  `);
  $('#btnCancelProv').addEventListener('click', closeModal);
  $('#btnSaveProv').addEventListener('click', () => {
    const nombre = $('#pvNombre').value.trim();
    if (!nombre) { showToast('El nombre es obligatorio', 'error'); return; }
    const activo = $('#pvActivo').value === 'true';
    if (isEdit) {
      Object.assign(prov, { nombre, contacto: $('#pvContacto').value.trim(), activo });
    } else {
      state.proveedores.push({ id: DB.id(), nombre, contacto: $('#pvContacto').value.trim(), activo });
    }
    save(); closeModal(); render(); showToast(isEdit ? 'Proveedor actualizado' : 'Proveedor agregado');
  });
}

// ===== PRECIOS MODAL =====
function formPrecios(perfumeId) {
  const perf = getPerfumeById(perfumeId);
  if (!perf) return;
  const provActivos = state.proveedores.filter(p => p.activo);

  // Stock entry (precio de venta)
  const s = getStockByPerfume(perfumeId) ?? { cantidad: 0, minimo: 1, precioVenta: 0 };

  const renderRows = () => {
    const rows = state.precios.filter(p => p.perfumeId === perfumeId);
    if (!rows.length) return `<tr><td colspan="3" style="text-align:center;color:var(--ivory3);padding:20px">Sin precios cargados aún</td></tr>`;
    return rows.map(pr => {
      const pv = getProveedorById(pr.proveedorId);
      const g  = calcGanancia(s.precioVenta, pr.precio);
      return `<tr data-pid="${pr.id}">
        <td style="font-weight:500">${esc(pv?.nombre ?? '—')}</td>
        <td>
          <div style="display:flex;align-items:center;gap:6px">
            <span style="color:var(--ivory3);font-size:12px">${MONEDA}</span>
            <input class="form-control" style="padding:5px 8px;width:120px" type="number" min="0" step="1"
              value="${pr.precio}" data-field="precio" data-id="${pr.id}">
          </div>
        </td>
        <td>${g
          ? `<span class="${parseFloat(g.pct) >= 0 ? 'margin-positive' : 'margin-negative'}">${fmtPrecio(g.ganancia)} (${g.pct}%)</span>`
          : '<span class="price-na">—</span>'}</td>
        <td><button class="btn btn-danger btn-sm" data-delprecio="${pr.id}">✕</button></td>
      </tr>`;
    }).join('');
  };

  openModal(`Precios — ${perf.nombre} (${perf.modelo})`, `
    <div style="background:var(--ink3);border:var(--gold-line);border-radius:var(--r);padding:14px 16px;margin-bottom:18px">
      <div style="font-size:11px;color:var(--ivory3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Mi precio de venta</div>
      <div style="display:flex;align-items:center;gap:10px">
        <span style="color:var(--ivory3);font-size:13px">${MONEDA}</span>
        <input class="form-control" id="precioVentaInput" type="number" min="0" step="1"
          style="max-width:160px" value="${s.precioVenta || ''}" placeholder="0">
        <button class="btn btn-secondary btn-sm" id="saveVentaBtn">Guardar</button>
        <span id="ventaStatus" style="font-size:12px;color:var(--sage)"></span>
      </div>
      <div style="font-size:11px;color:var(--ivory3);margin-top:6px">La ganancia se calcula contra el menor precio de costo entre todos los proveedores.</div>
    </div>

    <div class="table-wrap" style="margin-bottom:18px">
      <table>
        <thead><tr><th>Proveedor</th><th>Precio de costo</th><th>Ganancia sobre este precio</th><th></th></tr></thead>
        <tbody id="preciosTbody">${renderRows()}</tbody>
      </table>
    </div>

    <div style="border-top:var(--gold-line);padding-top:16px">
      <div style="font-size:11px;color:var(--ivory3);letter-spacing:.08em;text-transform:uppercase;margin-bottom:10px">Agregar precio de proveedor</div>
      <div class="form-row">
        <div class="form-group" style="margin:0"><label class="form-label">Proveedor</label>
          <select class="form-control" id="newPreciosProv">
            <option value="">— Seleccioná —</option>
            ${provActivos.map(p => `<option value="${p.id}">${esc(p.nombre)}</option>`).join('')}
          </select></div>
        <div class="form-group" style="margin:0"><label class="form-label">Precio (${MONEDA})</label>
          <input class="form-control" id="newPreciosVal" type="number" min="0" step="1" placeholder="0"></div>
      </div>
      <div class="form-actions" style="margin-top:8px">
        <button class="btn btn-secondary" id="closePreciosBtn">Cerrar</button>
        <button class="btn btn-primary"   id="addPrecioBtn">Agregar precio</button>
      </div>
    </div>
  `);

  // Guardar precio de venta
  $('#saveVentaBtn').addEventListener('click', () => {
    const pv = parseFloat($('#precioVentaInput').value) || 0;
    const existing = getStockByPerfume(perfumeId);
    if (existing) { existing.precioVenta = pv; }
    else { state.stock.push({ id: DB.id(), perfumeId, cantidad: 0, minimo: 1, precioVenta: pv }); }
    s.precioVenta = pv;
    save();
    $('#preciosTbody').innerHTML = renderRows();
    $('#ventaStatus').textContent = '✓ Guardado';
    setTimeout(() => { $('#ventaStatus').textContent = ''; }, 2000);
  });

  // Editar precio en tabla en vivo
  $('#modalBody').addEventListener('input', e => {
    const id    = e.target.dataset.id;
    const field = e.target.dataset.field;
    if (!id || !field) return;
    const pr = state.precios.find(p => p.id === id);
    if (pr) { pr[field] = parseFloat(e.target.value) || 0; save(); $('#preciosTbody').innerHTML = renderRows(); }
  });

  // Eliminar precio
  $('#modalBody').addEventListener('click', e => {
    const delId = e.target.dataset.delprecio;
    if (delId) {
      state.precios = state.precios.filter(p => p.id !== delId);
      save();
      $('#preciosTbody').innerHTML = renderRows();
      showToast('Precio eliminado');
    }
  });

  // Agregar precio
  $('#addPrecioBtn').addEventListener('click', () => {
    const provId = $('#newPreciosProv').value;
    const precio = parseFloat($('#newPreciosVal').value);
    if (!provId) { showToast('Seleccioná un proveedor', 'error'); return; }
    if (!precio || precio <= 0) { showToast('Ingresá un precio válido', 'error'); return; }
    const exists = state.precios.find(p => p.perfumeId === perfumeId && p.proveedorId === provId);
    if (exists) { exists.precio = precio; showToast('Precio actualizado'); }
    else { state.precios.push({ id: DB.id(), perfumeId, proveedorId: provId, precio }); showToast('Precio agregado'); }
    save();
    $('#preciosTbody').innerHTML = renderRows();
    $('#newPreciosProv').value = '';
    $('#newPreciosVal').value  = '';
  });

  $('#closePreciosBtn').addEventListener('click', () => { closeModal(); render(); });
}

// ===== COMPARAR =====
function renderComparar(el) {
  const provActivos = state.proveedores.filter(p => p.activo);
  const searchVal   = el._search ?? '';
  const filterCat   = el._cat   ?? '';

  el.innerHTML = `
    <div class="toolbar">
      <input class="search-input" id="cmpSearch" placeholder="Buscar perfume…" value="${esc(searchVal)}">
      <select class="filter-select" id="cmpCat">
        <option value="">Todas las categorías</option>
        <option value="arabe"     ${filterCat==='arabe'?'selected':''}>Árabe</option>
        <option value="disenador" ${filterCat==='disenador'?'selected':''}>Diseñador</option>
        <option value="nicho"     ${filterCat==='nicho'?'selected':''}>Nicho</option>
      </select>
    </div>
    <div id="cmpTable"></div>
  `;

  const renderCmp = (search, cat) => {
    const list = state.perfumes.filter(p => {
      const q = search.toLowerCase();
      return (!q || p.nombre.toLowerCase().includes(q) || p.marca.toLowerCase().includes(q))
          && (!cat || p.categoria === cat);
    });

    const wrap = $('#cmpTable');
    if (!list.length) {
      wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">⚖️</div><h3>Sin resultados</h3></div>`;
      return;
    }

    wrap.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Perfume</th><th>Categoría</th>
              ${provActivos.map(p => `<th>${esc(p.nombre)}</th>`).join('')}
              <th>Menor costo</th><th>Precio venta</th><th>Ganancia</th><th>Ahorro vs. más caro</th>
            </tr>
          </thead>
          <tbody>
            ${list.map(perf => {
              const preciosProv = provActivos.map(pv => {
                const pr = state.precios.find(p => p.perfumeId === perf.id && p.proveedorId === pv.id);
                return pr ? pr.precio : null;
              });
              const validos  = preciosProv.filter(v => v !== null);
              const costoMin = validos.length ? Math.min(...validos) : null;
              const costoMax = validos.length > 1 ? Math.max(...validos) : null;
              const ahorro   = costoMin !== null && costoMax !== null
                ? ((costoMax - costoMin) / costoMax * 100).toFixed(1) : null;
              const s = getStockByPerfume(perf.id);
              const g = s?.precioVenta ? calcGanancia(s.precioVenta, costoMin) : null;

              return `<tr>
                <td>
                  <div style="font-weight:500">${esc(perf.nombre)}</div>
                  <div style="font-size:11px;color:var(--ivory3)">${esc(perf.marca)} · ${esc(perf.modelo)}</div>
                </td>
                <td>${badgeCat(perf.categoria)}</td>
                ${preciosProv.map(v => {
                  if (v === null) return `<td><span class="price-na">—</span></td>`;
                  const cls = v === costoMin && validos.length > 1 ? 'best'
                            : v === costoMax && validos.length > 1 ? 'worst' : '';
                  return `<td><span class="price-cell ${cls}">${fmtPrecio(v)}</span></td>`;
                }).join('')}
                <td style="font-weight:500">${costoMin !== null ? fmtPrecio(costoMin) : '<span class="price-na">—</span>'}</td>
                <td>${s?.precioVenta ? fmtPrecio(s.precioVenta) : '<span class="price-na">—</span>'}</td>
                <td>${g ? `<span class="${parseFloat(g.pct) >= 0 ? 'margin-positive' : 'margin-negative'}">${g.pct}%</span>` : '<span class="price-na">—</span>'}</td>
                <td>${ahorro !== null ? `<span style="color:var(--gold);font-weight:500">-${ahorro}%</span>` : '<span class="price-na">—</span>'}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  };

  renderCmp(searchVal, filterCat);
  $('#cmpSearch').addEventListener('input', e => { el._search = e.target.value; renderCmp(e.target.value, $('#cmpCat').value); });
  $('#cmpCat').addEventListener('change', e => { el._cat = e.target.value; renderCmp($('#cmpSearch').value, e.target.value); });
}

// ===== STOCK =====
function renderStock(el, actions) {
  actions.innerHTML = `<button class="btn btn-primary" id="btnNuevoStock">Actualizar Stock</button>`;

  el.innerHTML = `
    <div class="table-wrap">
      ${!state.perfumes.length
        ? `<div class="empty-state"><div class="empty-icon">📦</div><h3>Sin perfumes</h3><p>Primero agregá perfumes al catálogo.</p></div>`
        : `<table>
            <thead>
              <tr>
                <th>Perfume</th><th>Categoría</th><th>Stock</th><th>Mín.</th><th>Estado</th>
                <th>Precio costo mín.</th><th>Precio venta</th><th>Ganancia unit.</th><th>Ganancia total</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${state.perfumes.map(perf => {
                const s        = getStockByPerfume(perf.id) ?? { cantidad: 0, minimo: 1, precioVenta: 0 };
                const ps       = getPreciosByPerfume(perf.id).map(p => p.precio).filter(v => v > 0);
                const costoMin = ps.length ? Math.min(...ps) : null;
                const g        = calcGanancia(s.precioVenta, costoMin);
                const stockCls = s.cantidad === 0 ? 'stock-low' : s.cantidad <= s.minimo ? 'stock-medium' : 'stock-ok';
                const estado   = s.cantidad === 0 ? '🔴 Sin stock' : s.cantidad <= s.minimo ? '🟡 Bajo' : '🟢 OK';
                return `<tr>
                  <td>
                    <div style="font-weight:500">${esc(perf.nombre)}</div>
                    <div style="font-size:11px;color:var(--ivory3)">${esc(perf.marca)} · ${esc(perf.modelo)}</div>
                  </td>
                  <td>${badgeCat(perf.categoria)}</td>
                  <td><span class="${stockCls}">${s.cantidad} uds</span></td>
                  <td style="color:var(--ivory3)">${s.minimo}</td>
                  <td>${estado}</td>
                  <td>${costoMin !== null ? fmtPrecio(costoMin) : '<span class="price-na">—</span>'}</td>
                  <td>${s.precioVenta > 0 ? fmtPrecio(s.precioVenta) : '<span class="price-na">—</span>'}</td>
                  <td>${g ? `<span class="${parseFloat(g.pct) >= 0 ? 'margin-positive' : 'margin-negative'}">${fmtPrecio(g.ganancia)} (${g.pct}%)</span>` : '<span class="price-na">—</span>'}</td>
                  <td>${g ? `<span class="${parseFloat(g.pct) >= 0 ? 'margin-positive' : 'margin-negative'}">${fmtPrecio(g.ganancia * s.cantidad)}</span>` : '<span class="price-na">—</span>'}</td>
                  <td><button class="btn btn-secondary btn-sm" data-action="editstock" data-id="${perf.id}">Editar</button></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>`}
    </div>
  `;

  actions.querySelector('#btnNuevoStock').addEventListener('click', () => formStockSelect());
}

function formStockSelect() {
  openModal('Actualizar Stock', `
    <div class="form-group"><label class="form-label">Perfume</label>
      <select class="form-control" id="stockPerfumeSelect">
        <option value="">— Seleccioná —</option>
        ${state.perfumes.map(p => `<option value="${p.id}">${esc(p.nombre)} — ${esc(p.marca)} (${esc(p.modelo)})</option>`).join('')}
      </select></div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="cancelStockSel">Cancelar</button>
      <button class="btn btn-primary"   id="goStockEdit">Continuar</button>
    </div>
  `);
  $('#cancelStockSel').addEventListener('click', closeModal);
  $('#goStockEdit').addEventListener('click', () => {
    const id = $('#stockPerfumeSelect').value;
    if (!id) { showToast('Seleccioná un perfume', 'error'); return; }
    formStockEdit(id);
  });
}

function formStockEdit(perfumeId) {
  const perf = getPerfumeById(perfumeId);
  const s    = getStockByPerfume(perfumeId) ?? { cantidad: 0, minimo: 1, precioVenta: 0 };
  const ps   = getPreciosByPerfume(perfumeId).map(p => p.precio).filter(v => v > 0);
  const costoMin = ps.length ? Math.min(...ps) : null;

  openModal(`Stock — ${perf.nombre}`, `
    <div class="form-row">
      <div class="form-group"><label class="form-label">Cantidad actual</label>
        <input class="form-control" id="sCantidad" type="number" min="0" value="${s.cantidad}"></div>
      <div class="form-group"><label class="form-label">Stock mínimo</label>
        <input class="form-control" id="sMinimo" type="number" min="0" value="${s.minimo}"></div>
    </div>
    <div class="form-group">
      <label class="form-label">Precio de venta (${MONEDA})</label>
      <input class="form-control" id="sVenta" type="number" min="0" step="1" value="${s.precioVenta || ''}" placeholder="0">
      ${costoMin !== null ? `<div style="font-size:11px;color:var(--ivory3);margin-top:5px">Menor precio de costo: ${fmtPrecio(costoMin)}</div>` : ''}
    </div>
    <div id="gananciaPreview" style="margin-bottom:4px"></div>
    <div class="form-actions">
      <button class="btn btn-secondary" id="cancelStockEdit">Cancelar</button>
      <button class="btn btn-primary"   id="saveStockEdit">Guardar</button>
    </div>
  `);

  const updatePreview = () => {
    const pv = parseFloat($('#sVenta').value) || 0;
    const g  = calcGanancia(pv, costoMin);
    const el = $('#gananciaPreview');
    if (g && costoMin) {
      el.innerHTML = `<div style="background:var(--ink3);border:var(--gold-line);border-radius:var(--r);padding:10px 14px;font-size:13px">
        Ganancia: <span class="${parseFloat(g.pct) >= 0 ? 'margin-positive' : 'margin-negative'}">${fmtPrecio(g.ganancia)} (${g.pct}%)</span>
      </div>`;
    } else { el.innerHTML = ''; }
  };

  $('#sVenta').addEventListener('input', updatePreview);
  updatePreview();

  $('#cancelStockEdit').addEventListener('click', closeModal);
  $('#saveStockEdit').addEventListener('click', () => {
    const cantidad    = parseInt($('#sCantidad').value) || 0;
    const minimo      = parseInt($('#sMinimo').value)   || 0;
    const precioVenta = parseFloat($('#sVenta').value)  || 0;
    const existing    = getStockByPerfume(perfumeId);
    if (existing) { Object.assign(existing, { cantidad, minimo, precioVenta }); }
    else          { state.stock.push({ id: DB.id(), perfumeId, cantidad, minimo, precioVenta }); }
    save(); closeModal(); render(); showToast('Stock actualizado');
  });
}

// ===== EXPORTAR =====
function renderExportar(el) {
  el.innerHTML = `
    <div class="export-grid">
      <div class="export-card" id="expExcelPerfumes">
        <div class="export-icon">📊</div>
        <div class="export-title">Catálogo de Perfumes</div>
        <div class="export-desc">Perfumes con precios por proveedor y ganancia (.csv para Excel)</div>
      </div>
      <div class="export-card" id="expExcelStock">
        <div class="export-icon">📦</div>
        <div class="export-title">Reporte de Stock</div>
        <div class="export-desc">Stock actual, márgenes, ganancia unitaria y total (.csv)</div>
      </div>
      <div class="export-card" id="expExcelComparar">
        <div class="export-icon">⚖️</div>
        <div class="export-title">Comparación de Precios</div>
        <div class="export-desc">Tabla cruzada de precios entre todos los proveedores (.csv)</div>
      </div>
      <div class="export-card" id="expPDF">
        <div class="export-icon">📄</div>
        <div class="export-title">Imprimir / PDF</div>
        <div class="export-desc">Abre el diálogo de impresión del navegador para guardar como PDF</div>
      </div>
    </div>
  `;
  $('#expExcelPerfumes').addEventListener('click', exportarCSVPerfumes);
  $('#expExcelStock').addEventListener('click',    exportarCSVStock);
  $('#expExcelComparar').addEventListener('click', exportarCSVComparar);
  $('#expPDF').addEventListener('click',           () => window.print());
}

function downloadCSV(filename, rows) {
  const csv = rows.map(r =>
    r.map(c => {
      const val = String(c ?? '');
      // Si contiene comas, puntos y comas o saltos de línea, envolver en comillas
      return val.includes(',') || val.includes(';') || val.includes('\n') || val.includes('"')
        ? `"${val.replace(/"/g, '""')}"`
        : val;
    }).join(';')  // Usar punto y coma para Excel español
  ).join('\n');

  // BOM para UTF-8 que funciona mejor con Excel
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
  showToast(`Descargando ${filename}`);
}

function exportarCSVPerfumes() {
  const provs   = state.proveedores.filter(p => p.activo);
  const headers = ['Nombre','Marca','Modelo','Categoría','Notas',
    ...provs.map(p => `Precio ${p.nombre} (${MONEDA})`),
    'Menor costo','Precio venta','Ganancia (UYU)','Margen %'];
  const rows = state.perfumes.map(p => {
    const ps      = provs.map(pv => { const pr = state.precios.find(r => r.perfumeId === p.id && r.proveedorId === pv.id); return pr ? pr.precio : ''; });
    const validos = ps.filter(v => v !== '');
    const cMin    = validos.length ? Math.min(...validos) : '';
    const s       = getStockByPerfume(p.id);
    const g       = s?.precioVenta && cMin !== '' ? calcGanancia(s.precioVenta, cMin) : null;
    return [p.nombre, p.marca, p.modelo, p.categoria, p.notas, ...ps, cMin, s?.precioVenta ?? '', g?.ganancia ?? '', g?.pct ?? ''];
  });
  downloadCSV('catalogo-perfumes.csv', [headers, ...rows]);
}

function exportarCSVStock() {
  const headers = ['Nombre','Marca','Modelo','Categoría','Stock','Mínimo','Precio costo mín.','Precio venta','Ganancia unit.','Margen %','Ganancia total'];
  const rows    = state.perfumes.map(p => {
    const s    = getStockByPerfume(p.id) ?? { cantidad: 0, minimo: 1, precioVenta: 0 };
    const ps   = getPreciosByPerfume(p.id).map(pr => pr.precio).filter(v => v > 0);
    const cMin = ps.length ? Math.min(...ps) : '';
    const g    = s.precioVenta && cMin !== '' ? calcGanancia(s.precioVenta, cMin) : null;
    return [p.nombre, p.marca, p.modelo, p.categoria, s.cantidad, s.minimo, cMin, s.precioVenta, g?.ganancia ?? '', g?.pct ?? '', g ? g.ganancia * s.cantidad : ''];
  });
  downloadCSV('stock-perfumes.csv', [headers, ...rows]);
}

function exportarCSVComparar() {
  const provs   = state.proveedores.filter(p => p.activo);
  const headers = ['Nombre','Marca','Modelo','Categoría',...provs.map(p => p.nombre),'Menor costo','Precio venta','Ganancia %','Ahorro vs. más caro %'];
  const rows    = state.perfumes.map(p => {
    const ps      = provs.map(pv => { const pr = state.precios.find(r => r.perfumeId === p.id && r.proveedorId === pv.id); return pr ? pr.precio : ''; });
    const validos = ps.filter(v => v !== '');
    const cMin    = validos.length ? Math.min(...validos) : '';
    const cMax    = validos.length > 1 ? Math.max(...validos) : '';
    const ahorro  = cMin !== '' && cMax !== '' ? ((cMax - cMin) / cMax * 100).toFixed(1) : '';
    const s       = getStockByPerfume(p.id);
    const g       = s?.precioVenta && cMin !== '' ? calcGanancia(s.precioVenta, cMin) : null;
    return [p.nombre, p.marca, p.modelo, p.categoria, ...ps, cMin, s?.precioVenta ?? '', g?.pct ?? '', ahorro];
  });
  downloadCSV('comparacion-precios.csv', [headers, ...rows]);
}

// ===== GLOBAL EVENT DELEGATION =====
document.addEventListener('click', e => {
  const btn    = e.target.closest('[data-action]');
  const action = btn?.dataset.action;
  const id     = btn?.dataset.id;

  if (action === 'editperfume') { formPerfume(getPerfumeById(id)); return; }
  if (action === 'delperfume') {
    if (!confirm('¿Eliminar este perfume y todos sus precios?')) return;
    state.perfumes  = state.perfumes.filter(p => p.id !== id);
    state.precios   = state.precios.filter(p => p.perfumeId !== id);
    state.stock     = state.stock.filter(p => p.perfumeId !== id);
    save(); render(); showToast('Perfume eliminado');
    return;
  }
  if (action === 'precios')    { formPrecios(id); return; }
  if (action === 'editprov')   { formProveedor(getProveedorById(id)); return; }
  if (action === 'delprov') {
    if (!confirm('¿Eliminar este proveedor y todos sus precios?')) return;
    state.proveedores = state.proveedores.filter(p => p.id !== id);
    state.precios     = state.precios.filter(p => p.proveedorId !== id);
    save(); render(); showToast('Proveedor eliminado');
    return;
  }
  if (action === 'editstock') { formStockEdit(id); return; }

  const navLink = e.target.closest('[data-view]');
  if (navLink && !navLink.classList.contains('nav-item')) { navigate(navLink.dataset.view); return; }
});

// ===== NAV =====
$$('.nav-item').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    navigate(el.dataset.view);
    if (window.innerWidth < 768) $('#sidebar').classList.remove('open');
  });
});

$('#menuBtn').addEventListener('click',    () => $('#sidebar').classList.add('open'));
$('#sidebarClose').addEventListener('click', () => $('#sidebar').classList.remove('open'));
$('#modalClose').addEventListener('click',   closeModal);
$('#modalOverlay').addEventListener('click', e => { if (e.target === $('#modalOverlay')) closeModal(); });

// ===== THEME =====
const applyTheme = (dark) => {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  $('#themeToggle').textContent = dark ? '☀️' : '🌙';
};

const savedTheme = localStorage.getItem('theme');
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
const isDark = savedTheme ? savedTheme === 'dark' : prefersDark;
applyTheme(isDark);

$('#themeToggle').addEventListener('click', () => {
  const nowDark = document.documentElement.getAttribute('data-theme') === 'dark';
  localStorage.setItem('theme', nowDark ? 'light' : 'dark');
  applyTheme(!nowDark);
});

// ===== INIT =====
navigate('dashboard');
