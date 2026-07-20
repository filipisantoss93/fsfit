from pathlib import Path


def replace(path_str, old, new, required=True):
    path = Path(path_str)
    text = path.read_text(encoding='utf-8')
    if old not in text:
        if required:
            raise SystemExit(f'Padrão não encontrado em {path_str}: {old[:120]!r}')
        print(f'[ignorado] {path_str}: padrão já alterado')
        return
    path.write_text(text.replace(old, new), encoding='utf-8')
    print(f'[ok] {path_str}')


# 1) Refinamento visual global: menos arredondamento, títulos menores e suporte a ícones.
style_path = Path('css/style.css')
style = style_path.read_text(encoding='utf-8')
marker = '/* FS Fit · refinamento visual moderno 2026-07-20 */'
if marker not in style:
    style += f'''\n\n{marker}\n:root {{ --radius: 14px; }}\n.card {{ border-radius: 14px; box-shadow: 0 14px 42px rgba(0,0,0,.3); }}\n.btn {{ min-height: 42px; padding-inline: 15px; border-radius: 10px; font-size: .84rem; }}\n.btn[data-icon]::before {{ content: attr(data-icon); display: inline-grid; place-items: center; flex: 0 0 auto; min-width: 1.05em; font-size: 1.05em; line-height: 1; font-weight: 900; }}\n.btn-action-tile {{ border-radius: 10px; }}\n.page-header h1 {{ font-size: clamp(1.65rem, 3.8vw, 2.25rem); letter-spacing: -.035em; }}\n.section-heading h2, .quick-actions h2, .card > h2 {{ font-size: 1.22rem; letter-spacing: -.02em; }}\n.student-record-title h1 {{ font-size: clamp(1.7rem, 4vw, 2.25rem); }}\n.metric-card, .sub-card {{ border-radius: 11px; }}\n.record-tabs {{ border-radius: 11px; }}\n.record-tab {{ border-radius: 8px; }}\n.recent-students-card {{ overflow: hidden; }}\n.recent-students-heading {{ margin: 0 0 8px !important; align-items: center; }}\n.recent-students-heading h2 {{ font-size: 1.22rem; }}\n.recent-students-table {{ table-layout: fixed; }}\n.recent-students-table th:nth-child(1) {{ width: 54%; }}\n.recent-students-table th:nth-child(2) {{ width: 36%; }}\n.recent-students-table th:nth-child(3) {{ width: 10%; }}\n.recent-student-row {{ cursor: pointer; transition: background .16s ease; }}\n.recent-student-row:hover, .recent-student-row:focus-visible {{ background: rgba(255,255,255,.035); outline: none; }}\n.recent-student-row.is-locked {{ cursor: not-allowed; opacity: .58; }}\n.recent-student-person {{ display: flex; align-items: center; gap: 10px; min-width: 0; }}\n.recent-student-person strong {{ overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .9rem; }}\n.recent-student-avatar {{ display: grid; place-items: center; flex: 0 0 34px; width: 34px; height: 34px; border: 1px solid var(--border); border-radius: 50%; background: var(--surface-light); color: var(--text); font-size: .72rem; font-weight: 850; }}\n.recent-student-chevron {{ padding-right: 4px; color: var(--muted); text-align: right; font-size: 1.5rem; line-height: 1; }}\n@media (max-width: 620px) {{\n  .hero h1 {{ font-size: 2.1rem; line-height: 1.06; }}\n  .page-header h1 {{ font-size: 1.55rem; }}\n  .page-header p {{ font-size: .84rem; }}\n  .card {{ border-radius: 13px; }}\n  .btn {{ min-height: 41px; border-radius: 9px; font-size: .82rem; }}\n  .section-heading h2, .quick-actions h2, .card > h2 {{ font-size: 1.14rem; }}\n  .student-record-title h1 {{ font-size: 1.62rem; }}\n  .recent-students-card {{ padding: 15px; }}\n  .recent-students-table th, .recent-students-table td {{ padding: 12px 6px; }}\n  .recent-student-avatar {{ flex-basis: 31px; width: 31px; height: 31px; font-size: .68rem; }}\n  .recent-student-person strong {{ font-size: .84rem; }}\n  .recent-students-table td:nth-child(2) {{ font-size: .8rem; }}\n}}\n'''
    style_path.write_text(style, encoding='utf-8')
    print('[ok] css/style.css')

# 2) Painel: botões com ícones e lista de alunos recentes em linhas clicáveis.
replace('painel.html',
'''      <a id="new-student-button" class="btn btn-primary" href="alunos.html?novo=1" data-premium-link>+ Novo aluno</a>''',
'''      <a id="new-student-button" class="btn btn-primary" href="alunos.html?novo=1" data-icon="＋" data-premium-link>Novo aluno</a>''')
replace('painel.html',
'''        <button id="copy-dashboard-public-link" class="btn btn-outline" type="button">Copiar link</button>\n        <a id="open-dashboard-public-link" class="btn btn-secondary" href="#">Ver minha página</a>\n        <a id="configure-dashboard-public-link" class="btn btn-secondary hidden" href="perfil.html">Configurar página</a>''',
'''        <button id="copy-dashboard-public-link" class="btn btn-outline" type="button" data-icon="⧉">Copiar link</button>\n        <a id="open-dashboard-public-link" class="btn btn-secondary" href="#" data-icon="↗">Ver minha página</a>\n        <a id="configure-dashboard-public-link" class="btn btn-secondary hidden" href="perfil.html" data-icon="⚙">Configurar página</a>''')
replace('painel.html',
'''    <section class="card">\n      <div class="page-header" style="color:inherit;margin-top:0"><div><h2>Alunos recentes</h2></div><a id="view-all-students" class="btn btn-outline" href="alunos.html" data-premium-link>Ver todos</a></div>\n      <div class="table-wrap"><table><thead><tr><th>Aluno</th><th>Cadastro</th><th>Ação</th></tr></thead><tbody id="recent-list"><tr><td colspan="3">Carregando...</td></tr></tbody></table></div>\n    </section>''',
'''    <section class="card recent-students-card">\n      <div class="page-header recent-students-heading" style="color:inherit;margin-top:0"><div><h2>Alunos recentes</h2></div><a id="view-all-students" class="btn btn-outline" href="alunos.html" data-icon="→" data-premium-link>Ver todos</a></div>\n      <div class="table-wrap"><table class="recent-students-table"><thead><tr><th>Aluno</th><th>Cadastro</th><th aria-label="Abrir aluno"></th></tr></thead><tbody id="recent-list"><tr><td colspan="3">Carregando...</td></tr></tbody></table></div>\n    </section>''')
replace('painel.html',
'''          <button class="btn btn-primary" type="submit">Enviar</button>''',
'''          <button class="btn btn-primary" type="submit" data-icon="➤">Enviar</button>''')

# 3) Alunos recentes: remove os botões repetidos "Abrir"; toda a linha abre a ficha.
painel_js = Path('js/painel-dashboard.js')
js = painel_js.read_text(encoding='utf-8')
old_anchor = '''async function loadStudents(freeMode) {\n  const list = document.querySelector('#recent-list');'''
new_anchor = '''function bindRecentStudentRows() {\n  const list = document.querySelector('#recent-list');\n  if (!list || list.dataset.rowNavigationBound === '1') return;\n  list.dataset.rowNavigationBound = '1';\n\n  const openRow = row => {\n    const href = row?.dataset.studentHref;\n    if (href) window.location.href = href;\n  };\n\n  list.addEventListener('click', event => {\n    const row = event.target.closest('[data-student-href]');\n    if (row) openRow(row);\n  });\n\n  list.addEventListener('keydown', event => {\n    if (event.key !== 'Enter' && event.key !== ' ') return;\n    const row = event.target.closest('[data-student-href]');\n    if (!row) return;\n    event.preventDefault();\n    openRow(row);\n  });\n}\n\nbindRecentStudentRows();\n\nasync function loadStudents(freeMode) {\n  const list = document.querySelector('#recent-list');'''
if old_anchor not in js:
    raise SystemExit('Não foi possível inserir navegação das linhas de alunos recentes.')
js = js.replace(old_anchor, new_anchor)
old_rows = '''      list.innerHTML = alunos.length\n        ? alunos.slice(0, 5).map(aluno => `\n            <tr>\n              <td>${escapeHtml(aluno.nome)}</td>\n              <td>${formatDate(aluno.created_at)}</td>\n              <td>${freeMode\n                ? '<span style="color:var(--muted);font-weight:700">Bloqueado</span>'\n                : `<a class="btn btn-outline" href="alunos.html?editar=${encodeURIComponent(aluno.id)}">Abrir</a>`}\n              </td>\n            </tr>`).join('')\n        : '<tr><td colspan="3" class="empty">Nenhum aluno cadastrado.</td></tr>';'''
new_rows = '''      list.innerHTML = alunos.length\n        ? alunos.slice(0, 5).map(aluno => {\n            const href = `ficha-aluno.html?id=${encodeURIComponent(aluno.id)}`;\n            const rowAttrs = freeMode\n              ? 'class="recent-student-row is-locked" aria-disabled="true" title="Disponível em um plano pago"'\n              : `class="recent-student-row" data-student-href="${href}" tabindex="0" role="link" aria-label="Abrir ficha de ${escapeHtml(aluno.nome)}"`;\n            return `\n              <tr ${rowAttrs}>\n                <td><span class="recent-student-person"><span class="recent-student-avatar" aria-hidden="true">${escapeHtml(initials(aluno.nome))}</span><strong>${escapeHtml(aluno.nome)}</strong></span></td>\n                <td>${formatDate(aluno.created_at)}</td>\n                <td class="recent-student-chevron" aria-hidden="true">${freeMode ? '·' : '›'}</td>\n              </tr>`;\n          }).join('')\n        : '<tr><td colspan="3" class="empty">Nenhum aluno cadastrado.</td></tr>';'''
if old_rows not in js:
    raise SystemExit('Bloco de alunos recentes não encontrado.')
js = js.replace(old_rows, new_rows)
old_helper = '''function formatDate(value) {\n  const date = new Date(value);\n  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');\n}\n\nfunction setText(selector, value) {'''
new_helper = '''function formatDate(value) {\n  const date = new Date(value);\n  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');\n}\n\nfunction initials(value = '') {\n  const parts = String(value || '').trim().split(/\\s+/).filter(Boolean);\n  return (parts.slice(0, 2).map(part => part.charAt(0)).join('') || 'A').toUpperCase();\n}\n\nfunction setText(selector, value) {'''
if old_helper not in js:
    raise SystemExit('Ponto de inserção do helper initials não encontrado.')
js = js.replace(old_helper, new_helper)
painel_js.write_text(js, encoding='utf-8')
print('[ok] js/painel-dashboard.js')

# 4) Modal de aula: cartões menos arredondados, título menor e edição em outline.
replace('js/aulas-painel-editor.js',
'''  button.className = 'btn btn-secondary btn-action-tile';''',
'''  button.className = 'btn btn-outline btn-action-tile';''')

compact = Path('css/aulas-painel-compact.css')
text = compact.read_text(encoding='utf-8')
text = text.replace('border-radius: 22px;', 'border-radius: 14px;')
text = text.replace('.live-session-modal-header h2 { margin: 0 0 5px; font-size: 1.55rem; }', '.live-session-modal-header h2 { margin: 0 0 5px; font-size: 1.35rem; }')
text = text.replace('border-radius: 12px;\n  background: rgba(255,255,255,.035);', 'border-radius: 10px;\n  background: rgba(255,255,255,.035);')
text = text.replace('.live-session-modal-header h2 { font-size: 1.45rem; }', '.live-session-modal-header h2 { font-size: 1.28rem; }')
compact.write_text(text, encoding='utf-8')
print('[ok] css/aulas-painel-compact.css')

print('Novo modelo visual aplicado.')
