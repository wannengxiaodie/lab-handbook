/* 检验项目手册 · 在线浏览版 —— 纯静态，无外部依赖 */
(function () {
  "use strict";

  var DATA = window.HANDBOOK;
  if (!DATA || !DATA.entries) {
    document.getElementById("cards").innerHTML =
      '<p style="padding:30px;color:#b26b00">数据加载失败：未找到 assets/data.js。请先运行 python3 tools/extract.py 生成数据。</p>';
    return;
  }

  var entries = DATA.entries;
  var byId = new Map(entries.map(function (e) { return [e.id, e]; }));

  /* ---------- 搜索索引 ---------- */
  var haystack = new Map();
  entries.forEach(function (e) {
    var parts = [e.name, e.category, e.lab, e.specimen, e.tube, e.turnaround, e.note];
    e.items.forEach(function (it) { parts.push(it.name); if (it.charge) parts.push(it.charge); });
    haystack.set(e.id, parts.filter(Boolean).join(" ").toLowerCase());
  });

  var nameCount = new Map();
  entries.forEach(function (e) { nameCount.set(e.name, (nameCount.get(e.name) || 0) + 1); });

  /* ---------- 状态 ---------- */
  var state = { q: "", kind: "all", category: "", lab: "", sort: "default" };
  var listScroll = 0;

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  var el = {
    q: $("#q"), clearQ: $("#clearQ"), cards: $("#cards"), empty: $("#empty"),
    resultMeta: $("#resultMeta"), fCategory: $("#fCategory"), fLab: $("#fLab"),
    fSort: $("#fSort"), listView: $("#listView"), detailView: $("#detailView"),
    brandSub: $("#brandSub"), footSource: $("#footSource"), footDate: $("#footDate"),
    reset: $("#reset"), reset2: $("#reset2")
  };

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function money(n) {
    if (n == null) return "—";
    var v = Number(n);
    if (!isFinite(v)) return "—";
    return v % 1 === 0 ? String(v) : v.toFixed(2).replace(/0$/, "");
  }

  function priceLabel(n) {
    if (n == null) return "—";
    var v = Number(n);
    if (!isFinite(v)) return "—";
    return v === 0 ? "不收费" : money(v);
  }

  function hl(text, terms) {
    var safe = esc(text);
    if (!terms || !terms.length) return safe;
    terms.forEach(function (t) {
      if (!t) return;
      var pattern = esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      safe = safe.replace(new RegExp(pattern, "gi"), function (m) { return "<mark>" + m + "</mark>"; });
    });
    return safe;
  }

  /* ---------- 初始化下拉 ---------- */
  function fillSelect(sel, values, allLabel) {
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    });
    sel.options[0].textContent = allLabel;
  }

  var categories = Array.from(new Set(entries.map(function (e) { return e.category; }).filter(Boolean)))
    .sort(function (a, b) { return a.localeCompare(b, "zh-Hans-CN"); });
  var labs = Array.from(new Set(entries.map(function (e) { return e.lab; }).filter(Boolean)))
    .sort(function (a, b) { return a.localeCompare(b, "zh-Hans-CN"); });

  fillSelect(el.fCategory, categories, "全部分类");
  fillSelect(el.fLab, labs, "全部组室");

  el.brandSub.textContent = DATA.version + " · " + entries.length + " 项";
  el.footSource.textContent = "《" + DATA.title + "》" + DATA.version + "（" + DATA.source + "）";
  el.footDate.textContent = DATA.generated;

  /* ---------- 过滤与排序 ---------- */
  function filtered() {
    var terms = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var list = entries.filter(function (e) {
      if (state.kind !== "all" && e.kind !== state.kind) return false;
      if (state.category && e.category !== state.category) return false;
      if (state.lab && e.lab !== state.lab) return false;
      if (terms.length) {
        var s = haystack.get(e.id);
        if (!terms.every(function (t) { return s.indexOf(t) !== -1; })) return false;
      }
      return true;
    });

    if (state.sort === "name") {
      list = list.slice().sort(function (a, b) { return a.name.localeCompare(b.name, "zh-Hans-CN"); });
    } else if (state.sort === "priceAsc") {
      list = list.slice().sort(function (a, b) { return (a.total || 0) - (b.total || 0); });
    } else if (state.sort === "priceDesc") {
      list = list.slice().sort(function (a, b) { return (b.total || 0) - (a.total || 0); });
    }
    return list;
  }

  /* ---------- 列表渲染 ---------- */
  function cardHTML(e, terms) {
    // 第二行：标本 · 采血管 · 报告时限（单行，超长省略）
    var line = [];
    if (e.specimen) line.push("<span>" + hl(e.specimen, terms) + "</span>");
    if (e.tube) line.push("<span>" + hl(e.tube, terms) + "</span>");
    if (e.turnaround) line.push("<em>" + hl(e.turnaround, terms) + "</em>");

    var tags = [];
    if (e.category) tags.push('<span class="tag tag-cat">' + hl(e.category, terms) + "</span>");
    if (e.kind === "组合") tags.push('<span class="tag">含 ' + e.itemCount + " 个子项</span>");
    if (e.note) tags.push('<span class="tag tag-note">' + hl(e.note, terms) + "</span>");

    return '<a class="card" data-kind="' + esc(e.kind) + '" href="#/i/' + encodeURIComponent(e.id) + '">' +
      '<div class="card-head">' +
        '<h3 class="card-title">' + hl(e.name, terms) + "</h3>" +
        '<span class="badge" data-kind="' + esc(e.kind) + '">' + esc(e.kind) + "</span>" +
      "</div>" +
      (line.length ? '<p class="card-line">' + line.join("<i>·</i>") + "</p>" : "") +
      (tags.length ? '<div class="card-tags">' + tags.join("") + "</div>" : "") +
      '<div class="card-foot">' +
        (Number(e.total) > 0
          ? '<div class="price"><span class="cur">¥</span><span class="num">' + money(e.total) + '</span><span class="unit">元</span></div>'
          : '<div class="price is-free"><span class="num">不收费</span></div>') +
        (e.lab ? '<span class="card-lab">' + hl(e.lab, terms) + "</span>" : "") +
      "</div>" +
    "</a>";
  }

  function renderList() {
    var terms = state.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    var list = filtered();

    el.cards.innerHTML = list.map(function (e) { return cardHTML(e, terms); }).join("");
    el.empty.hidden = list.length > 0;

    var combos = list.filter(function (e) { return e.kind === "组合"; }).length;
    var singles = list.length - combos;
    el.resultMeta.innerHTML = "共 <b>" + list.length + "</b> 项" +
      (list.length ? "（组合 <b>" + combos + "</b> · 单项 <b>" + singles + "</b>）" : "");

    el.clearQ.hidden = !el.q.value;
  }

  /* ---------- 详情渲染 ---------- */
  function fact(label, value, cls) {
    return '<div class="fact"><dt>' + esc(label) + "</dt><dd" +
      (cls ? ' class="' + cls + '"' : "") + ">" + value + "</dd></div>";
  }

  function detailHTML(e) {
    var isCombo = e.kind === "组合";
    var dup = (nameCount.get(e.name) || 0) > 1;

    var chips = ['<span class="chip" data-kind="' + esc(e.kind) + '">' + esc(e.kind) + "</span>"];
    if (e.category) chips.push('<span class="chip">' + esc(e.category) + "</span>");
    if (e.active) chips.push('<span class="chip">' + esc(e.active) + "</span>");
    if (dup) chips.push('<span class="chip">同名条目共 ' + nameCount.get(e.name) + " 项，请按标本区分</span>");

    var facts = [];
    facts.push(fact("总价", Number(e.total) > 0
      ? '<span class="num">' + money(e.total) + '</span><span class="cur">元</span>'
      : '<span class="num is-free">不收费</span>'));
    facts.push(fact("标本类型", esc(e.specimen || "—")));
    facts.push(fact("采血管／容器", esc(e.tube || "—")));
    facts.push(fact("报告时限", esc(e.turnaround || "—")));
    facts.push(fact("责任组室", esc(e.lab || "—")));
    facts.push(fact("联系电话", esc(e.phone || "—"), "mono"));

    var itemsBlock = "";
    if (isCombo) {
      var sum = e.items.reduce(function (a, it) { return a + (Number(it.price) || 0); }, 0);
      var sumDiff = Math.abs(sum - Number(e.total || 0)) > 0.01;

      itemsBlock =
        '<h3 class="section-title">包含子项 <span class="count">' + e.items.length + " 项</span>" +
        (sumDiff ? '<span class="hint">子项价格合计 ' + money(sum) + " 元，与手册总价不一致</span>" : "") + "</h3>" +
        '<div class="table-wrap"><table class="items">' +
          '<thead><tr><th class="idx">#</th><th>子项名称 ／ 对应收费</th><th class="price-cell">价格（元）</th></tr></thead>' +
          "<tbody>" + e.items.map(function (it, i) {
            var target = it.link ? byId.get(it.link) : null;
            var nameHTML = target
              ? '<a class="item-link" href="#/i/' + encodeURIComponent(target.id) + '">' + esc(it.name) + "</a>"
              : '<span class="no-link">' + esc(it.name) + "</span>";
            var chargeHTML = (it.charge && it.charge !== it.name)
              ? '<div class="sub-charge">对应收费：' + esc(it.charge) + "</div>" : "";
            var zero = Number(it.price) === 0 ? '<span class="calc">不收费</span>' : "";
            return "<tr>" +
              '<td class="idx">' + (i + 1) + "</td>" +
              "<td>" + nameHTML + chargeHTML + zero + "</td>" +
              '<td class="price-cell">' + money(it.price) + "</td>" +
            "</tr>";
          }).join("") + "</tbody>" +
          '<tfoot><tr><td class="idx"></td><td>手册总价</td>' +
            '<td class="price-cell">' + money(e.total) + "</td></tr></tfoot>" +
        "</table></div>";
    } else {
      var single = e.items[0] || {};
      var chargeText = single.charge && single.charge !== e.name
        ? '<h3 class="section-title">对应收费</h3><p style="margin:0;color:#45606d">' + esc(single.charge) + "</p>" : "";
      var usedIn = (e.usedIn || []).map(function (cid) {
        var c = byId.get(cid);
        if (!c) return "";
        return '<a href="#/i/' + encodeURIComponent(c.id) + '">' + esc(c.name) +
          '<span class="k">' + esc(c.category || "") + "</span></a>";
      }).filter(Boolean);

      itemsBlock = chargeText +
        (usedIn.length
          ? '<h3 class="section-title">此项目包含在以下组合中 <span class="count">' + usedIn.length + " 个</span></h3>" +
            '<div class="related">' + usedIn.join("") + "</div>"
          : "");
    }

    var noteBlock = e.note
      ? '<div class="note-box"><span class="label">修改说明</span>' + esc(e.note) + "</div>" : "";

    return '<div class="back-bar">' +
        '<a class="btn-back" href="#/">' +
          '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
          "返回列表</a>" +
        '<button class="link-btn" type="button" id="copyLink">复制链接</button>' +
      "</div>" +
      '<article class="detail">' +
        '<div class="detail-head">' +
          "<h2>" + esc(e.name) + "</h2>" +
          '<div class="chips">' + chips.join("") + "</div>" +
        "</div>" +
        '<div class="detail-body">' +
          '<div class="facts">' + facts.join("") + "</div>" +
          itemsBlock + noteBlock +
        "</div>" +
      "</article>";
  }

  function renderDetail(id) {
    var e = byId.get(id);
    if (!e) { location.replace("#/"); return; }
    el.detailView.innerHTML = detailHTML(e);

    var copy = $("#copyLink");
    if (copy) copy.addEventListener("click", function () {
      var url = location.href;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(function () { toast("链接已复制"); },
          function () { toast("复制失败，请手动复制地址栏"); });
      } else {
        toast("请手动复制地址栏");
      }
    });
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.className = "toast"; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add("show"); });
    setTimeout(function () {
      t.classList.remove("show");
      setTimeout(function () { t.remove(); }, 260);
    }, 1600);
  }

  /* ---------- 路由 ---------- */
  function route() {
    var hash = location.hash || "#/";
    var m = hash.match(/^#\/i\/(.+)$/);
    if (m) {
      var id = decodeURIComponent(m[1]);
      if (!byId.has(id)) { location.replace("#/"); return; }
      listScroll = window.scrollY || 0;
      el.listView.hidden = true;
      el.detailView.hidden = false;
      renderDetail(id);
      window.scrollTo(0, 0);
      document.title = byId.get(id).name + " · 检验项目手册 " + DATA.version;
    } else {
      el.detailView.hidden = true;
      el.listView.hidden = false;
      document.title = "检验项目手册 " + DATA.version;
      renderList();
      window.scrollTo(0, listScroll || 0);
    }
  }

  /* ---------- 事件 ---------- */
  var debounceTimer = null;
  el.q.addEventListener("input", function () {
    state.q = el.q.value;
    el.clearQ.hidden = !el.q.value;
    if (!el.detailView.hidden) location.hash = "#/";
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(renderList, 90);
  });

  el.clearQ.addEventListener("click", function () {
    el.q.value = ""; state.q = "";
    el.clearQ.hidden = true;
    el.q.focus();
    renderList();
  });

  $$(".seg").forEach(function (btn) {
    btn.addEventListener("click", function () {
      state.kind = btn.dataset.kind;
      $$(".seg").forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      renderList();
    });
  });

  el.fCategory.addEventListener("change", function () { state.category = el.fCategory.value; renderList(); });
  el.fLab.addEventListener("change", function () { state.lab = el.fLab.value; renderList(); });
  el.fSort.addEventListener("change", function () { state.sort = el.fSort.value; renderList(); });

  function resetAll() {
    state = { q: "", kind: "all", category: "", lab: "", sort: "default" };
    el.q.value = ""; el.clearQ.hidden = true;
    el.fCategory.value = ""; el.fLab.value = ""; el.fSort.value = "default";
    $$(".seg").forEach(function (b) {
      var on = b.dataset.kind === "all";
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    renderList();
  }
  el.reset.addEventListener("click", resetAll);
  el.reset2.addEventListener("click", resetAll);

  document.addEventListener("keydown", function (ev) {
    var typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
    if (ev.key === "/" && !typing) {
      ev.preventDefault(); el.q.focus(); el.q.select();
    } else if (ev.key === "Escape") {
      if (document.activeElement === el.q) {
        el.q.value = ""; state.q = ""; el.clearQ.hidden = true; renderList();
      } else if (!el.detailView.hidden) {
        location.hash = "#/";
      }
    }
  });

  window.addEventListener("hashchange", route);

  route();
})();
