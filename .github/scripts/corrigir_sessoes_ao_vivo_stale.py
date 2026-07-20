from pathlib import Path

js_path = Path('js/aulas-painel.js')
html_path = Path('painel.html')

js = js_path.read_text(encoding='utf-8')
html = html_path.read_text(encoding='utf-8')

old_finish = """    if (error) throw error;\n    if (data !== true) throw new Error('A sessão não está mais em andamento ou não pertence a este personal.');\n    closeModal();\n    await loadLiveStudents();"""
new_finish = """    if (error) throw error;\n    if (data !== true) {\n      await loadLiveStudents();\n      if (!rowsById.has(sessionId)) {\n        closeModal();\n        return;\n      }\n      throw new Error('Não foi possível encerrar esta sessão agora. Atualize a página e tente novamente.');\n    }\n    closeModal();\n    await loadLiveStudents();"""
if old_finish not in js:
    raise SystemExit('Bloco finishSession esperado não encontrado')
js = js.replace(old_finish, new_finish, 1)

old_end = """chatForm?.addEventListener('submit', event => sendMessage(event).catch(console.error));\n\nawait loadLiveStudents();"""
new_end = """chatForm?.addEventListener('submit', event => sendMessage(event).catch(console.error));\n\nconst LIVE_REFRESH_INTERVAL_MS = 15000;\n\nfunction refreshLiveStudentsWhenVisible() {\n  if (document.visibilityState !== 'visible') return;\n  loadLiveStudents().catch(console.error);\n}\n\nsetInterval(refreshLiveStudentsWhenVisible, LIVE_REFRESH_INTERVAL_MS);\ndocument.addEventListener('visibilitychange', refreshLiveStudentsWhenVisible);\nwindow.addEventListener('focus', refreshLiveStudentsWhenVisible);\n\nawait loadLiveStudents();"""
if old_end not in js:
    raise SystemExit('Final esperado de aulas-painel.js não encontrado')
js = js.replace(old_end, new_end, 1)

old_version = 'js/aulas-painel.js?v=20260719-live-modal1'
new_version = 'js/aulas-painel.js?v=20260720-live-refresh2'
if old_version not in html:
    raise SystemExit('Versão esperada do script aulas-painel.js não encontrada')
html = html.replace(old_version, new_version, 1)

js_path.write_text(js, encoding='utf-8')
html_path.write_text(html, encoding='utf-8')

Path('.github/scripts/corrigir_sessoes_ao_vivo_stale.py').unlink(missing_ok=True)
Path('.github/workflows/corrigir-sessoes-ao-vivo-stale.yml').unlink(missing_ok=True)
