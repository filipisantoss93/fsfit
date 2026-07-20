from pathlib import Path


def apply_replacements(path_str, replacements):
    path = Path(path_str)
    if not path.exists():
        print(f"[ignorado] {path_str}: arquivo não encontrado")
        return 0

    original = path.read_text(encoding="utf-8")
    text = original
    hits = 0

    for old, new in replacements:
        count = text.count(old)
        if count:
            text = text.replace(old, new)
            hits += count
            print(f"[ok] {path_str}: {count} substituição(ões)")
        else:
            print(f"[aviso] {path_str}: padrão já ajustado ou não encontrado: {old[:90]!r}")

    if text != original:
        path.write_text(text, encoding="utf-8")
    return hits


changes = 0

# Acesso do aluno: apenas a ação principal permanece preenchida.
changes += apply_replacements("acesso-aluno.html", [
    ('class="btn btn-secondary hidden" type="button" data-change-personal', 'class="btn btn-neutral hidden" type="button" data-change-personal'),
    ('class="btn btn-secondary" type="button" data-change-student-access', 'class="btn btn-neutral" type="button" data-change-student-access'),
])

# Cadastro de alunos: salvar é primário; cancelar/fechar são neutros.
changes += apply_replacements("alunos.html", [
    ('id="cancel-edit" class="btn btn-outline hidden"', 'id="cancel-edit" class="btn btn-neutral hidden"'),
    ('id="close-student-form" class="btn btn-outline"', 'id="close-student-form" class="btn btn-neutral"'),
])

# Painel: atalhos de consulta não competem com o CTA principal.
changes += apply_replacements("painel.html", [
    ('id="view-all-students" class="btn btn-secondary"', 'id="view-all-students" class="btn btn-outline"'),
])

# Treino: ações de fechar/cancelar neutras; edição como ação secundária.
changes += apply_replacements("treino-aluno.html", [
    ('class="btn btn-outline" type="button" data-close-workout-modal>Fechar</button>', 'class="btn btn-neutral" type="button" data-close-workout-modal>Fechar</button>'),
    ('id="cancel-workout-edit" class="btn btn-outline"', 'id="cancel-workout-edit" class="btn btn-neutral"'),
    ('class="btn btn-outline" type="button" data-close-exercise-modal>Cancelar</button>', 'class="btn btn-neutral" type="button" data-close-exercise-modal>Cancelar</button>'),
    ('id="exercise-detail-edit" class="btn btn-primary"', 'id="exercise-detail-edit" class="btn btn-outline"'),
    ('class="btn btn-outline" type="button" data-close-exercise-detail-modal>Fechar</button>', 'class="btn btn-neutral" type="button" data-close-exercise-detail-modal>Fechar</button>'),
])

# Ficha do aluno: visualização em azul secundário, planejamento em outline e destrutivas isoladas.
changes += apply_replacements("ficha-aluno.html", [
    ('id="student-preview-link" class="btn btn-primary"', 'id="student-preview-link" class="btn btn-secondary"'),
    ('id="edit-registration" class="btn btn-secondary"', 'id="edit-registration" class="btn btn-outline"'),
    ('id="workout-editor-link" class="btn btn-secondary"', 'id="workout-editor-link" class="btn btn-outline"'),
    ('id="diet-editor-link" class="btn btn-secondary"', 'id="diet-editor-link" class="btn btn-outline"'),
    ('id="reminders-link" class="btn btn-secondary"', 'id="reminders-link" class="btn btn-outline"'),
    ('<button class="btn btn-secondary" type="submit">Adicionar link</button>', '<button class="btn btn-outline" type="submit">Adicionar link</button>'),
    ('<button class="btn btn-secondary" type="submit">Alterar PIN</button>', '<button class="btn btn-outline" type="submit">Alterar PIN</button>'),
])

# Biblioteca de exercícios: cancelar é neutro.
changes += apply_replacements("biblioteca-exercicios.html", [
    ('id="cancel-library-edit" class="btn btn-outline"', 'id="cancel-library-edit" class="btn btn-neutral"'),
    ('id="cancel-category-edit" class="btn btn-outline"', 'id="cancel-category-edit" class="btn btn-neutral"'),
])

# Perfil: exclusão usa danger; cancelar alteração de senha é neutro.
changes += apply_replacements("perfil.html", [
    ('class="btn btn-outline danger-button"', 'class="btn btn-danger danger-button"'),
    ('id="cancel-password-change" class="btn btn-outline"', 'id="cancel-password-change" class="btn btn-neutral"'),
])

# Financeiro: paginação e fechamento não recebem preenchimento azul.
changes += apply_replacements("financeiro.html", [
    ('id="finance-students-prev" class="btn btn-secondary"', 'id="finance-students-prev" class="btn btn-neutral"'),
    ('id="finance-students-next" class="btn btn-secondary"', 'id="finance-students-next" class="btn btn-neutral"'),
    ('class="btn btn-secondary" type="button" data-close-finance-modal>Fechar</button>', 'class="btn btn-neutral" type="button" data-close-finance-modal>Fechar</button>'),
])

# Dieta: um CTA principal por contexto; editar/consultar em outline; fechar/cancelar neutros.
changes += apply_replacements("dieta-aluno.html", [
    ('class="btn btn-outline" type="button" data-close-plan-modal>Fechar</button>', 'class="btn btn-neutral" type="button" data-close-plan-modal>Fechar</button>'),
    ('id="cancel-plan-edit" class="btn btn-outline"', 'id="cancel-plan-edit" class="btn btn-neutral"'),
    ('class="btn btn-outline" type="button" data-close-meal-form-modal>Cancelar</button>', 'class="btn btn-neutral" type="button" data-close-meal-form-modal>Cancelar</button>'),
    ('class="btn btn-outline" type="button" data-close-library-meal-modal>Fechar</button>', 'class="btn btn-neutral" type="button" data-close-library-meal-modal>Fechar</button>'),
    ('<a class="btn btn-primary" href="modelos-dieta.html">Gerenciar modelos</a>', '<a class="btn btn-outline" href="modelos-dieta.html">Gerenciar modelos</a>'),
    ('class="btn btn-outline" type="button" data-close-diet-model-picker>Fechar</button>', 'class="btn btn-neutral" type="button" data-close-diet-model-picker>Fechar</button>'),
    ('id="meal-modal-edit" class="btn btn-primary"', 'id="meal-modal-edit" class="btn btn-outline"'),
    ('class="btn btn-outline" type="button" data-close-meal-modal>Fechar</button>', 'class="btn btn-neutral" type="button" data-close-meal-modal>Fechar</button>'),
])

# Lembretes: salvar é primário, cancelar edição é neutro.
changes += apply_replacements("lembretes-aluno.html", [
    ('id="cancel-edit" class="btn btn-secondary hidden"', 'id="cancel-edit" class="btn btn-neutral hidden"'),
])

# Biblioteca alimentar: Montar refeição é o CTA principal da área; demais criações ficam secundárias.
changes += apply_replacements("biblioteca-alimentar.html", [
    ('id="open-food-modal" class="btn btn-primary"', 'id="open-food-modal" class="btn btn-outline"'),
    ('id="cancel-food-edit" class="btn btn-outline"', 'id="cancel-food-edit" class="btn btn-neutral"'),
    ('id="cancel-food-category-edit" class="btn btn-outline"', 'id="cancel-food-category-edit" class="btn btn-neutral"'),
    ('id="cancel-meal-builder" class="btn btn-outline"', 'id="cancel-meal-builder" class="btn btn-neutral"'),
])

# Modelos de dieta: fechar/cancelar neutros; edição e exclusão mantêm hierarquia própria.
changes += apply_replacements("modelos-dieta.html", [
    ('class="btn btn-outline" type="button" data-close-model-modal>Cancelar</button>', 'class="btn btn-neutral" type="button" data-close-model-modal>Cancelar</button>'),
    ('class="btn btn-outline" type="button" data-close-model-detail-modal>Fechar</button>', 'class="btn btn-neutral" type="button" data-close-model-detail-modal>Fechar</button>'),
    ('class="btn btn-outline" type="button" data-close-add-model-meal-modal>Fechar</button>', 'class="btn btn-neutral" type="button" data-close-add-model-meal-modal>Fechar</button>'),
])

# Portal do aluno: limpar é ação neutra; pagamento e contato continuam destacados.
changes += apply_replacements("aluno.html", [
    ('id="student-clear-notifications" class="btn btn-secondary hidden"', 'id="student-clear-notifications" class="btn btn-neutral hidden"'),
])

# Assinatura: fechar/voltar neutro, ações destrutivas em vermelho e cartões de gestão sem competição azul.
changes += apply_replacements("js/assinatura-gerenciamento.js", [
    ('<button class="btn btn-secondary" type="button" data-close-subscription-modal>Voltar</button>', '<button class="btn btn-neutral" type="button" data-close-subscription-modal>Voltar</button>'),
    ('id="subscription-confirm-cancel" class="btn btn-outline"', 'id="subscription-confirm-cancel" class="btn btn-danger"'),
    ('id="subscription-copy-pix" class="btn btn-secondary"', 'id="subscription-copy-pix" class="btn btn-primary"'),
    ('''  actions.forEach(([title, description, buttonText, handler]) => {
    const article = document.createElement('article');
    article.className = 'subscription-management-action';
    article.innerHTML = `<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div><button class="btn btn-secondary" type="button">${escapeHtml(buttonText)}</button>`;
    article.querySelector('button')?.addEventListener('click', handler);
    host.appendChild(article);
  });''', '''  actions.forEach(([title, description, buttonText, handler]) => {
    const article = document.createElement('article');
    const destructive = /cancel|remov|exclu/i.test(`${title} ${buttonText}`);
    const buttonClass = destructive ? 'btn btn-danger' : 'btn btn-outline';
    article.className = 'subscription-management-action';
    article.innerHTML = `<div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(description)}</span></div><button class="${buttonClass}" type="button">${escapeHtml(buttonText)}</button>`;
    article.querySelector('button')?.addEventListener('click', handler);
    host.appendChild(article);
  });'''),
])

print(f"Total de substituições aplicadas: {changes}")
