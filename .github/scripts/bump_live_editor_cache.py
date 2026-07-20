from pathlib import Path

panel = Path('painel.html')
text = panel.read_text(encoding='utf-8')
old = 'js/aulas-painel-editor.js?v=20260719-live-editor1'
new = 'js/aulas-painel-editor.js?v=20260720-live-tabs1'
if old in text:
    panel.write_text(text.replace(old, new), encoding='utf-8')

Path('.github/scripts/bump_live_editor_cache.py').unlink(missing_ok=True)
Path('.github/workflows/bump-live-editor-cache.yml').unlink(missing_ok=True)
