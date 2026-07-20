from pathlib import Path

path = Path('painel.html')
text = path.read_text(encoding='utf-8')
old = 'js/aulas-painel-editor.js?v=20260720-live-tabs1'
new = 'js/aulas-painel-editor.js?v=20260720-live-exercises1'
if old in text:
    path.write_text(text.replace(old, new), encoding='utf-8')
