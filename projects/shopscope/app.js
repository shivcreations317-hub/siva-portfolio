(() => {
  'use strict';

  // ── DATA ──────────────────────────────────────────────────────────────
  const DATA = window.SHOPSCOPE_DATA;
  if (!DATA || !Array.isArray(DATA.transactions)) {
    document.body.innerHTML = '<main style="margin:0;padding:40px"><h1>Data not found</h1><p>Run <code>python python/generate_data.py</code> then <code>python python/analyze.py</code>.</p></main>';
    return;
  }

  const TX = DATA.transactions.map(row => ({
    ...row,
    revenue: Number(row.revenue),
    net_revenue: Number(row.net_revenue),
    profit: Number(row.profit),
    refund_amount: Number(row.refund_amount),
    units: Number(row.units),
    unit_price: Number(row.unit_price),
    unit_cost: Number(row.unit_cost),
    discount_pct: Number(row.discount_pct),
    is_returned: Number(row.is_returned),
    is_repeat: Number(row.is_repeat),
    order_sequence: Number(row.order_sequence),
    cohort_index: Number(row.cohort_index),
    date: new Date(row.order_date + 'T00:00:00')
  }));
  const CUSTOMERS = DATA.customers.map(row => ({
    ...row,
    total_orders: Number(row.total_orders),
    total_revenue: Number(row.total_revenue),
    total_refunds: Number(row.total_refunds),
    avg_order_value: Number(row.avg_order_value),
    is_repeat: Number(row.is_repeat),
    recency_days: Number(row.recency_days),
    r_score: Number(row.r_score),
    f_score: Number(row.f_score),
    m_score: Number(row.m_score)
  }));
  const RETURNS = DATA.returns.map(row => ({ ...row, refund_amount: Number(row.refund_amount), units: Number(row.units) }));

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const SEGMENT_ORDER = ['Champions','Loyal Customers','New / Potential','Need Attention','At Risk','Hibernating'];
  const SEGMENT_COLORS = {
    'Champions':'#8b6cff',
    'Loyal Customers':'#38e8d8',
    'New / Potential':'#7aa7ff',
    'Need Attention':'#ffb454',
    'At Risk':'#ff8fb1',
    'Hibernating':'#b6a4ff'
  };
  const CATEGORY_COLORS = {
    'Apparel':'#8b6cff',
    'Footwear':'#38e8d8',
    'Accessories':'#ffb454',
    'Home & Living':'#ff8fb1',
    'Beauty':'#7aa7ff',
    'Electronics':'#b6a4ff'
  };
  const FALLBACK_COLORS = ['#8b6cff','#38e8d8','#7aa7ff','#ffb454','#ff8fb1','#b6a4ff'];

  const state = { quarter:'All', category:'All', channel:'All', segment:'All' };

  // ── FORMATTING ────────────────────────────────────────────────────────
  const nf = new Intl.NumberFormat('en-IN');
  const inr0 = new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 });

  function compactINR(value) {
    const n = Math.abs(value);
    if (n >= 1e7) return '₹' + (value / 1e7).toFixed(2) + ' Cr';
    if (n >= 1e5) return '₹' + (value / 1e5).toFixed(2) + ' L';
    if (n >= 1e3) return '₹' + (value / 1e3).toFixed(1) + ' K';
    return inr0.format(value);
  }
  function exactINR(value) { return inr0.format(value); }
  function pct(value, digits = 1) { return (value * 100).toFixed(digits) + '%'; }
  function pctPoint(value, digits = 1) { return (value * 100).toFixed(digits) + ' pp'; }
  function sum(rows, key) { return rows.reduce((acc, row) => acc + row[key], 0); }
  function groupSum(rows, key, valueKey) {
    const map = new Map();
    rows.forEach(row => map.set(row[key], (map.get(row[key]) || 0) + row[valueKey]));
    return map;
  }
  function unique(rows, key) { return new Set(rows.map(row => row[key])).size; }
  function niceMax(value) {
    if (!value) return 1;
    const exp = Math.floor(Math.log10(value));
    const base = Math.pow(10, exp);
    const fraction = value / base;
    let nice;
    if (fraction <= 1) nice = 1;
    else if (fraction <= 2) nice = 2;
    else if (fraction <= 2.5) nice = 2.5;
    else if (fraction <= 5) nice = 5;
    else nice = 10;
    return nice * base;
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  }
  function monthIndex(month) { return MONTHS.indexOf(month); }
  function monthsForState() {
    if (state.quarter === 'All') return MONTHS.slice();
    const q = Number(state.quarter.slice(1));
    return MONTHS.slice((q - 1) * 3, q * 3);
  }

  // ── FILTERS ───────────────────────────────────────────────────────────
  const categoryFilter = document.getElementById('categoryFilter');
  const channelFilter = document.getElementById('channelFilter');
  const segmentFilter = document.getElementById('segmentFilter');
  const quarterFilters = document.getElementById('quarterFilters');

  function uniqueSorted(key) {
    return [...new Set(TX.map(row => row[key]))].sort((a, b) => a.localeCompare(b));
  }
  function fillSelect(select, values, allLabel) {
    select.innerHTML = `<option value="All">${allLabel}</option>` +
      values.map(value => `<option value="${escapeHTML(value)}">${escapeHTML(value)}</option>`).join('');
  }
  fillSelect(categoryFilter, uniqueSorted('category'), 'All categories');
  fillSelect(channelFilter, uniqueSorted('channel'), 'All channels');
  fillSelect(segmentFilter, SEGMENT_ORDER, 'All segments');

  function baseFiltered(includeQuarter = true) {
    return TX.filter(row =>
      (state.category === 'All' || row.category === state.category) &&
      (state.channel === 'All' || row.channel === state.channel) &&
      (state.segment === 'All' || row.segment === state.segment) &&
      (!includeQuarter || state.quarter === 'All' || row.quarter === state.quarter)
    );
  }

  function updateScopeLabel() {
    const parts = [
      state.category === 'All' ? 'All categories' : state.category,
      state.channel === 'All' ? 'All channels' : state.channel,
      state.segment === 'All' ? 'All segments' : state.segment,
      state.quarter === 'All' ? 'FY 2025' : state.quarter + ' FY25'
    ];
    document.getElementById('scopeLabel').textContent = parts.join(' · ');
    document.getElementById('trendSub').textContent = state.quarter === 'All'
      ? 'Monthly performance · FY 2025'
      : 'Monthly performance · ' + state.quarter + ' FY25';
  }

  // ── TOOLTIP / TOAST ───────────────────────────────────────────────────
  const tooltip = document.getElementById('tooltip');
  let toastTimer;
  function showTooltip(event, html) {
    tooltip.innerHTML = html;
    tooltip.classList.add('show');
    moveTooltip(event);
  }
  function moveTooltip(event) {
    const pad = 14;
    let x = event.clientX + pad;
    let y = event.clientY + pad;
    const rect = tooltip.getBoundingClientRect();
    if (x + rect.width > window.innerWidth - 8) x = event.clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = event.clientY - rect.height - pad;
    tooltip.style.left = x + 'px';
    tooltip.style.top = y + 'px';
  }
  function hideTooltip() { tooltip.classList.remove('show'); }
  function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  // ── METRICS ───────────────────────────────────────────────────────────
  function metrics(rows) {
    const netRevenue = sum(rows, 'net_revenue');
    const profit = sum(rows, 'profit');
    const orders = rows.length;
    const customers = unique(rows, 'customer_id');
    const orderCounts = new Map();
    rows.forEach(row => orderCounts.set(row.customer_id, (orderCounts.get(row.customer_id) || 0) + 1));
    const repeatCustomers = [...orderCounts.values()].filter(count => count > 1).length;
    const returned = rows.filter(row => row.is_returned === 1).length;
    return {
      netRevenue,
      profit,
      margin: netRevenue ? profit / netRevenue : 0,
      orders,
      customers,
      repeatCustomers,
      repeatRate: customers ? repeatCustomers / customers : 0,
      returned,
      returnRate: orders ? returned / orders : 0,
      aov: orders ? netRevenue / orders : 0
    };
  }

  function comparison(rows) {
    const base = baseFiltered(false);
    if (state.quarter === 'All') {
      const h2 = base.filter(row => row.quarter === 'Q3' || row.quarter === 'Q4');
      const h1 = base.filter(row => row.quarter === 'Q1' || row.quarter === 'Q2');
      return { current: h2, prior: h1, label:'H2 vs H1' };
    }
    const q = Number(state.quarter.slice(1));
    if (q === 1) return { current: rows, prior: null, label:'No prior quarter' };
    const priorQ = 'Q' + (q - 1);
    return {
      current: base.filter(row => row.quarter === state.quarter),
      prior: base.filter(row => row.quarter === priorQ),
      label: state.quarter + ' vs ' + priorQ
    };
  }

  function deltaMarkup(current, prior, type = 'pct', invert = false) {
    if (prior === null || prior === undefined || !isFinite(prior) || prior === 0) {
      return '<span class="delta flat">—</span>';
    }
    const change = type === 'pp' ? (current - prior) : ((current - prior) / Math.abs(prior));
    if (!isFinite(change)) return '<span class="delta flat">—</span>';
    const isGood = invert ? change < -0.0001 : change > 0.0001;
    const isFlat = Math.abs(change) <= 0.0001;
    const arrow = isFlat ? '→' : change > 0 ? '↑' : '↓';
    const text = type === 'pp' ? pctPoint(Math.abs(change)) : pct(Math.abs(change));
    const cls = isFlat ? 'flat' : isGood ? 'up' : 'down';
    return `<span class="delta ${cls}">${arrow} ${text}</span>`;
  }

  function sparkline(values, color) {
    const w = 150, h = 28, pad = 2;
    if (!values.length) return '';
    const max = Math.max(...values);
    const min = Math.min(...values);
    const span = max - min || 1;
    const points = values.map((value, index) => {
      const x = pad + (values.length === 1 ? 0 : index * (w - pad * 2) / (values.length - 1));
      const y = h - pad - ((value - min) / span) * (h - pad * 2);
      return [x, y];
    });
    const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point[0].toFixed(1)},${point[1].toFixed(1)}`).join(' ');
    const area = `${line} L${(w - pad).toFixed(1)},${h - pad} L${pad},${h - pad} Z`;
    return `<svg class="kpi-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <path class="area" d="${area}" fill="${color}" opacity=".13"></path>
      <path class="line" d="${line}" stroke="${color}"></path>
    </svg>`;
  }

  function monthlySeries(rows, metric) {
    const months = monthsForState();
    return months.map(month => {
      const monthRows = rows.filter(row => row.month === month);
      const orders = monthRows.length;
      if (metric === 'revenue') return sum(monthRows, 'net_revenue');
      if (metric === 'profit') return sum(monthRows, 'profit');
      if (metric === 'orders') return orders;
      if (metric === 'aov') return orders ? sum(monthRows, 'net_revenue') / orders : 0;
      if (metric === 'repeatRate') return orders ? monthRows.filter(row => row.is_repeat === 1).length / orders : 0;
      if (metric === 'returnRate') return orders ? monthRows.filter(row => row.is_returned === 1).length / orders : 0;
      return 0;
    });
  }

  // ── KPIs ──────────────────────────────────────────────────────────────
  function renderKPIs(rows) {
    const grid = document.getElementById('kpiGrid');
    if (!rows.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><strong>No orders match these filters.</strong><span>Try widening the category, channel, segment or period.</span></div>`;
      return;
    }
    const current = metrics(rows);
    const compare = comparison(rows);
    const prior = compare.prior && compare.prior.length ? metrics(compare.prior) : null;
    const compareCurrent = compare.current && compare.current.length ? metrics(compare.current) : current;

    const cards = [
      { label:'Net revenue', hint:'Gross revenue minus refunds', value:compactINR(current.netRevenue), raw:exactINR(current.netRevenue), delta:deltaMarkup(compareCurrent.netRevenue, prior && prior.netRevenue), color:'#8b6cff', spark:'revenue' },
      { label:'Gross profit', hint:'Net revenue minus product cost', value:compactINR(current.profit), raw:exactINR(current.profit) + ' · ' + pct(current.margin) + ' margin', delta:deltaMarkup(compareCurrent.profit, prior && prior.profit), color:'#38e8d8', spark:'profit', small:pct(current.margin) },
      { label:'Orders', hint:'Completed orders in the selected period', value:nf.format(current.orders), raw:nf.format(current.orders) + ' orders', delta:deltaMarkup(compareCurrent.orders, prior && prior.orders), color:'#7aa7ff', spark:'orders' },
      { label:'Avg order value', hint:'Net revenue divided by orders', value:compactINR(current.aov), raw:exactINR(current.aov), delta:deltaMarkup(compareCurrent.aov, prior && prior.aov), color:'#ffb454', spark:'aov' },
      { label:'Repeat customer rate', hint:'Customers with 2+ orders in the selected period', value:pct(current.repeatRate), raw:pct(current.repeatRate, 2) + ' · ' + nf.format(current.repeatCustomers) + ' repeat customers', delta:deltaMarkup(compareCurrent.repeatRate, prior && prior.repeatRate, 'pp'), color:'#ff8fb1', spark:'repeatRate' },
      { label:'Return rate', hint:'Returned orders divided by total orders', value:pct(current.returnRate), raw:pct(current.returnRate, 2) + ' · ' + nf.format(current.returned) + ' returned orders', delta:deltaMarkup(compareCurrent.returnRate, prior && prior.returnRate, 'pp', true), color:'#b6a4ff', spark:'returnRate', invert:true }
    ];

    grid.innerHTML = cards.map((card, index) => `
      <article class="kpi-card" data-tilt="4" style="--i:${index}">
        <div class="kpi-label"${card.hint ? ` title="${escapeHTML(card.hint)}"` : ''}>${card.label}</div>
        <div class="kpi-value" title="${escapeHTML(card.raw)}">${card.value}${card.small ? `<small>${card.small} margin</small>` : ''}</div>
        <div class="kpi-foot">${card.delta}<span class="kpi-compare">${escapeHTML(compare.label)}</span></div>
        ${sparkline(monthlySeries(rows, card.spark), card.color)}
      </article>
    `).join('');
  }

  // ── TREND CHART ───────────────────────────────────────────────────────
  function renderTrend(rows) {
    const container = document.getElementById('trendChart');
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state"><strong>No trend data.</strong><span>Adjust the filters to see monthly performance.</span></div>';
      return;
    }
    const months = monthsForState();
    const series = months.map(month => {
      const monthRows = rows.filter(row => row.month === month);
      const revenue = sum(monthRows, 'net_revenue');
      const gross = sum(monthRows, 'revenue');
      const profit = sum(monthRows, 'profit');
      const orders = monthRows.length;
      const returned = monthRows.filter(row => row.is_returned === 1).length;
      return {
        month,
        revenue,
        gross,
        profit,
        orders,
        returned,
        returnRate: orders ? returned / orders : 0
      };
    });

    const maxRevenue = niceMax(Math.max(...series.map(item => item.revenue), 1));
    const maxReturn = Math.max(20, Math.ceil(Math.max(...series.map(item => item.returnRate * 100), 1) / 5) * 5);

    const W = 760, H = 300, left = 56, right = 44, top = 18, bottom = 34;
    const plotW = W - left - right;
    const plotH = H - top - bottom;
    const step = plotW / series.length;
    const barW = Math.min(42, step * 0.48);

    const gridLines = Array.from({ length: 5 }, (_, index) => {
      const value = maxRevenue * (4 - index) / 4;
      const y = top + (plotH * index) / 4;
      return `<line x1="${left}" y1="${y}" x2="${W - right}" y2="${y}" stroke="rgba(255,255,255,.07)" stroke-width="1"/>
        <text x="${left - 9}" y="${y + 3.5}" text-anchor="end" fill="#5f687e" font-size="9" font-family="Manrope, sans-serif">${compactINR(value)}</text>
        <text x="${W - right + 9}" y="${y + 3.5}" text-anchor="start" fill="#5f687e" font-size="9" font-family="Manrope, sans-serif">${Math.round(maxReturn * (4 - index) / 4)}%</text>`;
    }).join('');

    const bars = series.map((item, index) => {
      const x = left + index * step + (step - barW) / 2;
      const barH = (item.revenue / maxRevenue) * plotH;
      const y = top + plotH - barH;
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${barH.toFixed(1)}" rx="4" fill="url(#barGrad)" opacity="${item.revenue ? .92 : .12}"/>`;
    }).join('');

    const linePoints = series.map((item, index) => {
      const x = left + index * step + step / 2;
      const y = top + plotH - (item.returnRate * 100 / maxReturn) * plotH;
      return { x, y, ...item };
    });
    const linePath = linePoints.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
    const dots = linePoints.map(point => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="3.2" fill="#0c0f17" stroke="#ffb454" stroke-width="2"/>`).join('');

    const xLabels = series.map((item, index) => {
      const x = left + index * step + step / 2;
      return `<text x="${x.toFixed(1)}" y="${H - 12}" text-anchor="middle" fill="#5f687e" font-size="9" font-family="Manrope, sans-serif">${item.month}</text>`;
    }).join('');

    const hits = series.map((item, index) => {
      const x = left + index * step;
      return `<g class="chart-hit" data-index="${index}">
        <rect class="hit" x="${x.toFixed(1)}" y="${top}" width="${step.toFixed(1)}" height="${plotH}" fill="transparent"/>
      </g>`;
    }).join('');

    container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly net revenue bars and return rate line for the selected period">
      <defs>
        <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#8b6cff"/>
          <stop offset="100%" stop-color="#38e8d8" stop-opacity=".22"/>
        </linearGradient>
      </defs>
      ${gridLines}
      ${bars}
      <path d="${linePath}" fill="none" stroke="#ffb454" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      ${dots}
      ${xLabels}
      ${hits}
    </svg>`;

    container.querySelectorAll('.chart-hit').forEach(hit => {
      const item = series[Number(hit.dataset.index)];
      hit.addEventListener('mouseenter', event => {
        showTooltip(event, `<strong>${item.month} 2025</strong>
          <div class="tip-row"><span>Net revenue</span><b>${compactINR(item.revenue)}</b></div>
          <div class="tip-row"><span>Gross revenue</span><b>${compactINR(item.gross)}</b></div>
          <div class="tip-row"><span>Orders</span><b>${nf.format(item.orders)}</b></div>
          <div class="tip-row"><span>Return rate</span><b>${pct(item.returnRate)}</b></div>`);
      });
      hit.addEventListener('mousemove', moveTooltip);
      hit.addEventListener('mouseleave', hideTooltip);
    });
  }

  // ── CATEGORY DONUT ────────────────────────────────────────────────────
  function renderCategory(rows) {
    const chart = document.getElementById('categoryChart');
    const legend = document.getElementById('categoryLegend');
    const totalEl = document.getElementById('donutTotal');
    const countEl = document.getElementById('categoryCount');
    if (!rows.length) {
      chart.innerHTML = '';
      legend.innerHTML = '<div class="empty-state" style="min-height:120px">No category data.</div>';
      totalEl.textContent = '—';
      countEl.textContent = '0 categories';
      return;
    }
    const total = sum(rows, 'net_revenue');
    const grouped = [...groupSum(rows, 'category', 'net_revenue').entries()]
      .map(([category, revenue], index) => {
        const categoryRows = rows.filter(row => row.category === category);
        const profit = sum(categoryRows, 'profit');
        const returned = categoryRows.filter(row => row.is_returned === 1).length;
        return {
          category,
          revenue,
          share: revenue / total,
          margin: revenue ? profit / revenue : 0,
          returnRate: categoryRows.length ? returned / categoryRows.length : 0,
          color: CATEGORY_COLORS[category] || FALLBACK_COLORS[index % FALLBACK_COLORS.length]
        };
      })
      .sort((a, b) => b.revenue - a.revenue);

    const radius = 64;
    const circumference = 2 * Math.PI * radius;
    let offset = 0;
    const segments = grouped.map((item, index) => {
      const length = item.share * circumference;
      const gap = grouped.length > 1 ? 3 : 0;
      const segment = `<circle class="donut-seg" data-index="${index}" cx="90" cy="90" r="${radius}" fill="none" stroke="${item.color}" stroke-width="18" stroke-dasharray="${Math.max(0, length - gap).toFixed(2)} ${(circumference - Math.max(0, length - gap)).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt"></circle>`;
      offset += length;
      return segment;
    }).join('');

    chart.innerHTML = `<circle cx="90" cy="90" r="${radius}" fill="none" stroke="rgba(255,255,255,.055)" stroke-width="18"></circle>${segments}`;
    totalEl.textContent = compactINR(total);
    countEl.textContent = grouped.length + (grouped.length === 1 ? ' category' : ' categories');

    legend.innerHTML = grouped.map((item, index) => `
      <div class="cat-item" data-index="${index}">
        <span class="cat-dot" style="background:${item.color}"></span>
        <span class="cat-name">${escapeHTML(item.category)}</span>
        <span class="cat-share">${pct(item.share)}</span>
        <span class="cat-margin">${compactINR(item.revenue)} · ${pct(item.margin)} margin · ${pct(item.returnRate)} returns</span>
      </div>
    `).join('');

    chart.querySelectorAll('.donut-seg').forEach(segment => {
      const item = grouped[Number(segment.dataset.index)];
      segment.addEventListener('mouseenter', event => {
        showTooltip(event, `<strong>${escapeHTML(item.category)}</strong>
          <div class="tip-row"><span>Net revenue</span><b>${compactINR(item.revenue)}</b></div>
          <div class="tip-row"><span>Share</span><b>${pct(item.share)}</b></div>
          <div class="tip-row"><span>Gross margin</span><b>${pct(item.margin)}</b></div>
          <div class="tip-row"><span>Return rate</span><b>${pct(item.returnRate)}</b></div>`);
      });
      segment.addEventListener('mousemove', moveTooltip);
      segment.addEventListener('mouseleave', hideTooltip);
    });
  }

  // ── TOP PRODUCTS ──────────────────────────────────────────────────────
  function renderProducts(rows) {
    const list = document.getElementById('productList');
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state"><strong>No product data.</strong><span>Adjust the filters.</span></div>';
      return;
    }
    const total = sum(rows, 'net_revenue');
    const grouped = [...groupSum(rows, 'product', 'net_revenue').entries()]
      .map(([product, revenue]) => {
        const productRows = rows.filter(row => row.product === product);
        const profit = sum(productRows, 'profit');
        const returned = productRows.filter(row => row.is_returned === 1).length;
        return {
          product,
          category: productRows[0].category,
          revenue,
          margin: revenue ? profit / revenue : 0,
          returnRate: productRows.length ? returned / productRows.length : 0,
          share: revenue / total
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
    const max = grouped[0].revenue || 1;
    list.innerHTML = grouped.map((item, index) => `
      <div class="product-row">
        <div class="product-rank">${String(index + 1).padStart(2, '0')}</div>
        <div>
          <div class="product-top">
            <span class="product-name" title="${escapeHTML(item.product)}">${escapeHTML(item.product)}</span>
            <span class="product-rev">${compactINR(item.revenue)}</span>
          </div>
          <div class="product-meta">${escapeHTML(item.category)} · ${pct(item.margin)} margin · ${pct(item.returnRate)} returns · ${pct(item.share)} of revenue</div>
          <div class="product-track"><span style="width:${Math.max(4, (item.revenue / max) * 100).toFixed(1)}%"></span></div>
        </div>
      </div>
    `).join('');
  }

  // ── CUSTOMER SEGMENTS ─────────────────────────────────────────────────
  function segmentMetrics(rows) {
    const map = new Map();
    rows.forEach(row => {
      if (!map.has(row.segment)) {
        map.set(row.segment, { name:row.segment, customers:new Map(), orders:0, revenue:0, profit:0, returns:0 });
      }
      const item = map.get(row.segment);
      item.orders += 1;
      item.revenue += row.net_revenue;
      item.profit += row.profit;
      item.returns += row.is_returned;
      item.customers.set(row.customer_id, (item.customers.get(row.customer_id) || 0) + 1);
    });
    const total = sum(rows, 'net_revenue');
    return [...map.values()].map(item => {
      const customers = item.customers.size;
      const repeatCustomers = [...item.customers.values()].filter(count => count > 1).length;
      return {
        name: item.name,
        customers,
        orders: item.orders,
        revenue: item.revenue,
        profit: item.profit,
        returns: item.returns,
        revenueShare: total ? item.revenue / total : 0,
        aov: item.orders ? item.revenue / item.orders : 0,
        repeatRate: customers ? repeatCustomers / customers : 0,
        returnRate: item.orders ? item.returns / item.orders : 0,
        avgOrders: customers ? item.orders / customers : 0
      };
    }).sort((a, b) => SEGMENT_ORDER.indexOf(a.name) - SEGMENT_ORDER.indexOf(b.name));
  }

  function renderSegments(rows) {
    const list = document.getElementById('segmentList');
    const summary = document.getElementById('segmentSummary');
    const foot = document.getElementById('segmentFoot');
    const badge = document.getElementById('segmentBadge');
    if (!rows.length) {
      list.innerHTML = '<div class="empty-state"><strong>No customer data.</strong><span>Adjust the filters.</span></div>';
      summary.innerHTML = '';
      foot.innerHTML = '';
      badge.textContent = '0 segments';
      return;
    }
    const segments = segmentMetrics(rows);
    const totalRevenue = sum(rows, 'net_revenue');
    const totalCustomers = unique(rows, 'customer_id');
    const repeatCustomers = new Set();
    const counts = new Map();
    rows.forEach(row => counts.set(row.customer_id, (counts.get(row.customer_id) || 0) + 1));
    counts.forEach((count, customer) => { if (count > 1) repeatCustomers.add(customer); });
    const repeatRate = totalCustomers ? repeatCustomers.size / totalCustomers : 0;
    const sortedByRevenue = [...segments].sort((a, b) => b.revenue - a.revenue);
    const topTwoShare = sortedByRevenue.slice(0, 2).reduce((acc, item) => acc + item.revenueShare, 0);
    const atRisk = segments.find(item => item.name === 'At Risk');

    badge.textContent = segments.length + (segments.length === 1 ? ' segment' : ' segments');
    summary.innerHTML = `
      <span class="segment-chip"><strong>${nf.format(totalCustomers)}</strong> customers</span>
      <span class="segment-chip"><strong>${pct(repeatRate)}</strong> repeat rate</span>
      <span class="segment-chip"><strong>${pct(topTwoShare)}</strong> top-2 revenue</span>
    `;

    const maxShare = Math.max(...segments.map(item => item.revenueShare), 0.01);
    list.innerHTML = segments.map(item => {
      const color = SEGMENT_COLORS[item.name] || '#8a93a6';
      return `<div class="segment-row">
        <span class="segment-dot" style="background:${color}"></span>
        <div class="segment-main">
          <div class="segment-top">
            <span class="segment-name">${escapeHTML(item.name)}</span>
            <span class="segment-rev">${pct(item.revenueShare)} rev</span>
          </div>
          <div class="segment-track"><span style="width:${Math.max(3, (item.revenueShare / maxShare) * 100).toFixed(1)}%;background:${color}"></span></div>
          <div class="segment-meta">AOV ${compactINR(item.aov)} · ${pct(item.repeatRate)} repeat · ${pct(item.returnRate)} returns</div>
        </div>
        <div class="segment-num">${nf.format(item.customers)}<small>customers</small></div>
        <div class="segment-num">${compactINR(item.revenue)}<small>revenue</small></div>
      </div>`;
    }).join('');

    foot.innerHTML = `
      <span>Top 2 segments drive <strong>${pct(topTwoShare)}</strong> of net revenue</span>
      <span>${atRisk ? `<strong>${nf.format(atRisk.customers)}</strong> At Risk customers · ${pct(atRisk.revenueShare)} revenue` : 'No At Risk customers in this view'}</span>
    `;
  }

  // ── COHORT RETENTION ──────────────────────────────────────────────────
  function computeCohorts(rows) {
    if (!rows.length) return [];
    const firstByCustomer = new Map();
    rows.forEach(row => {
      const current = firstByCustomer.get(row.customer_id);
      if (!current || row.date < current.date) firstByCustomer.set(row.customer_id, row);
    });
    const enriched = rows.map(row => {
      const first = firstByCustomer.get(row.customer_id);
      const firstDate = first.date;
      const index = (row.date.getFullYear() - firstDate.getFullYear()) * 12 + row.date.getMonth() - firstDate.getMonth();
      return { ...row, dynamicCohort: MONTHS[firstDate.getMonth()], dynamicIndex: index };
    });
    return MONTHS.map((month, monthIdx) => {
      const cohortRows = enriched.filter(row => row.dynamicCohort === month);
      const customers = new Set(cohortRows.map(row => row.customer_id));
      const size = customers.size;
      if (!size) return null;
      const retention = Array.from({ length: 12 }, (_, period) => {
        if (period > 11 - monthIdx) return null;
        const retained = new Set(cohortRows.filter(row => row.dynamicIndex === period).map(row => row.customer_id)).size;
        return { retained, rate: size ? retained / size : 0 };
      });
      return { month, monthIdx, size, retention };
    }).filter(Boolean);
  }

  function renderCohorts(rows) {
    const wrap = document.getElementById('cohortWrap');
    const badge = document.getElementById('cohortBadge');
    if (!rows.length) {
      wrap.innerHTML = '<div class="empty-state"><strong>No cohort data.</strong><span>Adjust the filters.</span></div>';
      badge.textContent = '0 cohorts';
      return;
    }
    const cohorts = computeCohorts(rows);
    if (!cohorts.length) {
      wrap.innerHTML = '<div class="empty-state"><strong>No cohort data.</strong><span>Adjust the filters.</span></div>';
      badge.textContent = '0 cohorts';
      return;
    }
    badge.textContent = cohorts.length + ' cohorts';

    const header = `<div class="cohort-head" style="text-align:left">Cohort</div>` +
      Array.from({ length: 12 }, (_, index) => `<div class="cohort-head">M${index}</div>`).join('');

    const body = cohorts.map(cohort => {
      const cells = Array.from({ length: 12 }, (_, period) => {
        const cell = cohort.retention[period];
        if (!cell) return '<div class="cohort-cell empty"></div>';
        const alpha = 0.06 + cell.rate * 0.88;
        const textColor = cell.rate > 0.55 ? '#05060a' : 'rgba(255,255,255,.8)';
        return `<div class="cohort-cell" style="background:rgba(139,108,255,${alpha.toFixed(3)});color:${textColor}" data-cohort="${cohort.month}" data-period="${period}" data-retained="${cell.retained}" data-size="${cohort.size}" data-rate="${cell.rate}">${Math.round(cell.rate * 100)}%</div>`;
      }).join('');
      return `<div class="cohort-label">${cohort.month} <span>${cohort.size}</span></div>${cells}`;
    }).join('');

    wrap.innerHTML = `<div class="cohort-grid">${header}${body}</div>`;

    wrap.querySelectorAll('.cohort-cell[data-cohort]').forEach(cell => {
      cell.addEventListener('mouseenter', event => {
        const rate = Number(cell.dataset.rate);
        showTooltip(event, `<strong>${cell.dataset.cohort} cohort · Month ${cell.dataset.period}</strong>
          <div class="tip-row"><span>Retained</span><b>${cell.dataset.retained} / ${cell.dataset.size}</b></div>
          <div class="tip-row"><span>Retention</span><b>${pct(rate)}</b></div>`);
      });
      cell.addEventListener('mousemove', moveTooltip);
      cell.addEventListener('mouseleave', hideTooltip);
    });
  }

  // ── RETURNS ───────────────────────────────────────────────────────────
  function renderReturns(rows) {
    const reasonsEl = document.getElementById('returnReasons');
    const hotspotsEl = document.getElementById('returnHotspots');
    const badge = document.getElementById('returnBadge');
    const countEl = document.getElementById('returnCount');
    const refundEl = document.getElementById('refundTotal');
    if (!rows.length) {
      reasonsEl.innerHTML = '<div class="empty-state" style="min-height:110px">No return data.</div>';
      hotspotsEl.innerHTML = '';
      badge.textContent = '—';
      countEl.textContent = '—';
      refundEl.textContent = '—';
      return;
    }
    const returned = rows.filter(row => row.is_returned === 1);
    const returnRate = returned.length / rows.length;
    badge.textContent = pct(returnRate) + ' overall';
    countEl.textContent = `${nf.format(returned.length)} returns · ${compactINR(sum(returned, 'refund_amount'))}`;
    refundEl.textContent = `${compactINR(sum(returned, 'refund_amount'))} refunded`;

    if (!returned.length) {
      reasonsEl.innerHTML = '<div class="empty-state" style="min-height:110px"><strong>No returns in this selection.</strong></div>';
      hotspotsEl.innerHTML = '';
      return;
    }

    const reasonMap = new Map();
    returned.forEach(row => {
      if (!reasonMap.has(row.return_reason)) reasonMap.set(row.return_reason, { count:0, refund:0 });
      const item = reasonMap.get(row.return_reason);
      item.count += 1;
      item.refund += row.refund_amount;
    });
    const reasons = [...reasonMap.entries()]
      .map(([reason, item]) => ({ reason, count:item.count, refund:item.refund, share:item.count / returned.length }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const maxReason = reasons[0].count || 1;
    reasonsEl.innerHTML = reasons.map(item => `
      <div class="return-row">
        <div>
          <div class="return-top"><span class="return-name">${escapeHTML(item.reason)}</span><span class="return-count">${pct(item.share)}</span></div>
          <div class="return-track"><span style="width:${Math.max(4, (item.count / maxReason) * 100).toFixed(1)}%"></span></div>
        </div>
        <div class="return-count" style="text-align:right">${nf.format(item.count)}</div>
      </div>
    `).join('');

    const categories = [...new Set(rows.map(row => row.category))].map(category => {
      const categoryRows = rows.filter(row => row.category === category);
      const categoryReturns = categoryRows.filter(row => row.is_returned === 1);
      return {
        category,
        rate: categoryRows.length ? categoryReturns.length / categoryRows.length : 0,
        refund: sum(categoryReturns, 'refund_amount')
      };
    }).sort((a, b) => b.rate - a.rate).slice(0, 4);

    hotspotsEl.innerHTML = categories.map(item => {
      const cls = item.rate >= 0.18 ? 'high' : item.rate >= 0.10 ? 'mid' : 'low';
      return `<div class="hotspot">
        <span class="hotspot-name">${escapeHTML(item.category)}</span>
        <span class="hotspot-rate ${cls}">${pct(item.rate)} · ${compactINR(item.refund)}</span>
      </div>`;
    }).join('');
  }

  // ── INSIGHTS ──────────────────────────────────────────────────────────
  const icons = {
    revenue:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20"/><path d="M17 6H9.5a3.5 3.5 0 000 7H14a3.5 3.5 0 010 7H6"/></svg>',
    repeat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>',
    users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    return:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 109-9"/><path d="M3 3v6h6"/><path d="M12 8v4l3 2"/></svg>',
    calendar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4"/><path d="M8 3v4"/><path d="M3 11h18"/></svg>'
  };

  function renderInsights(rows) {
    const grid = document.getElementById('insightGrid');
    if (!rows.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><strong>No insights for this selection.</strong><span>Reset the filters to see the full FY 2025 story.</span></div>';
      return;
    }
    const total = sum(rows, 'net_revenue');
    const current = metrics(rows);
    const categories = [...groupSum(rows, 'category', 'net_revenue').entries()].map(([category, revenue]) => {
      const catRows = rows.filter(row => row.category === category);
      const returned = catRows.filter(row => row.is_returned === 1).length;
      return {
        category,
        revenue,
        share: revenue / total,
        margin: revenue ? sum(catRows, 'profit') / revenue : 0,
        returnRate: catRows.length ? returned / catRows.length : 0
      };
    }).sort((a, b) => b.revenue - a.revenue);
    const segments = segmentMetrics(rows);
    const atRisk = segments.find(item => item.name === 'At Risk') || segments.find(item => item.name === 'Hibernating') || segments[segments.length - 1];
    const repeatRevenue = sum(rows.filter(row => row.is_repeat === 1), 'net_revenue');
    const repeatRevenueShare = total ? repeatRevenue / total : 0;
    const topCategory = categories[0];
    const returned = rows.filter(row => row.is_returned === 1);
    const reasonMap = new Map();
    returned.forEach(row => reasonMap.set(row.return_reason, (reasonMap.get(row.return_reason) || 0) + 1));
    const topReason = [...reasonMap.entries()].sort((a, b) => b[1] - a[1])[0] || ['No returns', 0];
    const hotspot = [...categories].sort((a, b) => b.returnRate - a.returnRate)[0];
    const peak = [...groupSum(rows, 'month', 'net_revenue').entries()].map(([month, revenue]) => ({ month, revenue })).sort((a, b) => b.revenue - a.revenue)[0];
    const cohorts = computeCohorts(rows);
    const m1Values = cohorts
      .filter(cohort => cohort.size >= 10 && cohort.retention[1])
      .map(cohort => cohort.retention[1].rate);
    const m1Average = m1Values.length ? m1Values.reduce((acc, value) => acc + value, 0) / m1Values.length : 0;

    const cards = [
      {
        icon:'repeat', color:'#8b6cff', title:'Repeat revenue engine',
        text:`<strong>${pct(repeatRevenueShare)}</strong> of net revenue comes from repeat orders, while <strong>${pct(current.repeatRate)}</strong> of customers have ordered more than once. Retention is already the growth engine.`
      },
      {
        icon:'revenue', color:'#38e8d8', title:'Category concentration',
        text:`<strong>${escapeHTML(topCategory.category)}</strong> contributes <strong>${pct(topCategory.share)}</strong> of net revenue at ${pct(topCategory.margin)} margin. Its return rate is ${pct(topCategory.returnRate)} — protect the category, but fix the leak.`
      },
      {
        icon:'users', color:'#ff8fb1', title:'At Risk opportunity',
        text:`<strong>${nf.format(atRisk.customers)}</strong> ${escapeHTML(atRisk.name)} customers hold <strong>${pct(atRisk.revenueShare)}</strong> of revenue (AOV ${compactINR(atRisk.aov)}). A targeted win-back play is the fastest retention lever.`
      },
      {
        icon:'return', color:'#ffb454', title:'Returns hotspot',
        text:`<strong>${escapeHTML(hotspot.category)}</strong> returns <strong>${pct(hotspot.returnRate)}</strong> of orders. <strong>${escapeHTML(topReason[0])}</strong> is the top reason at ${pct(topReason[1] / Math.max(1, returned.length))} of returns. Fix fit guidance first.`
      },
      {
        icon:'calendar', color:'#b6a4ff', title:'Retention signal',
        text:`Month-1 retention averages <strong>${pct(m1Average)}</strong>. <strong>${peak.month} 2025</strong> was the strongest revenue month at ${compactINR(peak.revenue)} — build the repeat journey before the festive peak.`
      }
    ];

    grid.innerHTML = cards.map((card, index) => `
      <article class="insight" data-tilt="2" style="--c:${card.color};--i:${index}">
        <span class="insight-icon">${icons[card.icon]}</span>
        <div>
          <h3>${card.title}</h3>
          <p>${card.text}</p>
        </div>
      </article>
    `).join('');
  }

  // ── QUALITY STRIP ─────────────────────────────────────────────────────
  function renderQuality() {
    const strip = document.getElementById('qualityStrip');
    const duplicateOrders = TX.length - new Set(TX.map(row => row.order_id)).size;
    const duplicateCustomers = CUSTOMERS.length - new Set(CUSTOMERS.map(row => row.customer_id)).size;
    const nulls = TX.reduce((acc, row) => acc + Object.values(row).filter(value => value === null || value === '' || Number.isNaN(value)).length, 0);
    const refundMismatch = TX.filter(row => Math.abs(row.refund_amount - (row.is_returned ? row.revenue : 0)) > 0.01).length;
    const returnsWithoutOrder = RETURNS.filter(row => !TX.some(order => order.order_id === row.order_id)).length;
    const checks = [
      `${nf.format(TX.length)} orders · ${nf.format(CUSTOMERS.length)} customers`,
      `${duplicateOrders + duplicateCustomers} duplicate IDs`,
      `${nulls} missing values`,
      `${refundMismatch} refund mismatches`,
      `${returnsWithoutOrder} orphan returns`,
      '6 categories · 4 channels'
    ];
    strip.innerHTML = checks.map(check => `<span class="quality-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 6L9 17l-5-5"/></svg>${escapeHTML(check)}</span>`).join('');
  }

  // ── UPDATE ────────────────────────────────────────────────────────────
  function update() {
    const rows = baseFiltered();
    updateScopeLabel();
    renderKPIs(rows);
    renderTrend(rows);
    renderCategory(rows);
    renderProducts(rows);
    renderSegments(rows);
    renderCohorts(rows);
    renderReturns(rows);
    renderInsights(rows);
  }

  // ── EVENTS ────────────────────────────────────────────────────────────
  quarterFilters.addEventListener('click', event => {
    const button = event.target.closest('button[data-quarter]');
    if (!button) return;
    state.quarter = button.dataset.quarter;
    quarterFilters.querySelectorAll('button').forEach(item => item.classList.toggle('active', item === button));
    update();
  });
  categoryFilter.addEventListener('change', event => { state.category = event.target.value; update(); });
  channelFilter.addEventListener('change', event => { state.channel = event.target.value; update(); });
  segmentFilter.addEventListener('change', event => { state.segment = event.target.value; update(); });

  document.getElementById('resetFilters').addEventListener('click', () => {
    state.quarter = 'All';
    state.category = 'All';
    state.channel = 'All';
    state.segment = 'All';
    quarterFilters.querySelectorAll('button').forEach(item => item.classList.toggle('active', item.dataset.quarter === 'All'));
    categoryFilter.value = 'All';
    channelFilter.value = 'All';
    segmentFilter.value = 'All';
    update();
    toast('Filters reset to full FY 2025');
  });

  document.getElementById('exportBtn').addEventListener('click', () => {
    const rows = baseFiltered();
    if (!rows.length) {
      toast('No rows to export for this selection');
      return;
    }
    const headers = ['order_id','order_date','customer_id','customer_name','segment','region','city_tier','age_group','gender','acquisition_channel','channel','category','product','units','unit_price','discount_pct','revenue','refund_amount','net_revenue','profit','is_returned','return_reason','order_sequence','cohort_month'];
    const csv = [headers.join(',')].concat(rows.map(row => headers.map(header => {
      const value = row[header];
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(','))).join('\r\n');
    const blob = new Blob(['\ufeff' + csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `shopscope-fy2025-${state.quarter === 'All' ? 'all' : state.quarter.toLowerCase()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${nf.format(rows.length)} filtered orders`);
  });

  // Scroll-spy for the sidebar.
  const sections = [...document.querySelectorAll('main section[id]')];
  const navLinks = [...document.querySelectorAll('.side-nav a')];
  const spy = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      navLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === '#' + entry.target.id));
    });
  }, { rootMargin:'-20% 0px -65% 0px', threshold:0 });
  sections.forEach(section => spy.observe(section));

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') hideTooltip();
  });

  // Boot.
  updateScopeLabel();
  renderQuality();
  update();
})();
