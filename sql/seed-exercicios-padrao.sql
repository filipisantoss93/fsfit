-- FS Fit — biblioteca inicial de exercícios
-- Execute no SQL Editor do Supabase.
-- Idempotente: não duplica exercícios globais com o mesmo nome e grupo muscular.

insert into public.exercicios (nome, grupo_muscular, equipamento, instrucoes, video_url, global, personal_id)
select v.nome, v.grupo_muscular, v.equipamento, v.instrucoes, null, true, null
from (values
  ('Supino reto com barra','Peito','Banco reto e barra','Mantenha as escápulas retraídas e controle a descida da barra.'),
  ('Supino reto com halteres','Peito','Banco reto e halteres','Desça os halteres com controle e evite perder a estabilidade dos ombros.'),
  ('Supino inclinado com barra','Peito','Banco inclinado e barra','Mantenha os pés firmes no chão e controle a amplitude.'),
  ('Supino inclinado com halteres','Peito','Banco inclinado e halteres','Evite bater os halteres no topo do movimento.'),
  ('Supino declinado','Peito','Banco declinado e barra','Mantenha o tronco estável e faça a descida controlada.'),
  ('Crucifixo reto','Peito','Banco reto e halteres','Mantenha leve flexão dos cotovelos durante todo o movimento.'),
  ('Crucifixo inclinado','Peito','Banco inclinado e halteres','Abra os braços com controle sem forçar excessivamente os ombros.'),
  ('Crossover na polia alta','Peito','Cross over','Cruze as mãos à frente do corpo mantendo o peitoral contraído.'),
  ('Crossover na polia média','Peito','Cross over','Mantenha o tronco estável e controle o retorno.'),
  ('Peck deck','Peito','Máquina peck deck','Ajuste o banco para alinhar os braços à altura do peito.'),
  ('Flexão de braços','Peito','Peso corporal','Mantenha o corpo alinhado e desça o peito de forma controlada.'),
  ('Pullover com halter','Peito','Banco e halter','Mantenha o abdômen firme e evite hiperextensão lombar.'),

  ('Puxada frontal aberta','Costas','Pulley','Puxe a barra em direção à parte superior do peito sem balançar o tronco.'),
  ('Puxada frontal fechada','Costas','Pulley','Conduza os cotovelos para baixo e para trás.'),
  ('Puxada neutra','Costas','Pulley com pegador neutro','Mantenha o peito aberto e controle a volta do peso.'),
  ('Barra fixa pronada','Costas','Barra fixa','Suba sem impulso e mantenha as escápulas ativas.'),
  ('Barra fixa supinada','Costas','Barra fixa','Evite balanço do corpo e controle a descida.'),
  ('Remada curvada com barra','Costas','Barra','Mantenha a coluna neutra e puxe a barra em direção ao abdômen.'),
  ('Remada unilateral com halter','Costas','Banco e halter','Evite girar o tronco durante a puxada.'),
  ('Remada baixa','Costas','Polia baixa','Puxe o pegador em direção ao abdômen mantendo o peito aberto.'),
  ('Remada cavalinho','Costas','Barra T','Mantenha a lombar estável e aproxime as escápulas.'),
  ('Remada articulada','Costas','Máquina articulada','Controle a fase excêntrica e mantenha o tronco apoiado.'),
  ('Pulldown com braços estendidos','Costas','Polia alta','Mantenha os braços quase estendidos e concentre a força no dorsal.'),
  ('Levantamento terra','Costas','Barra','Mantenha a coluna neutra e a barra próxima ao corpo durante todo o movimento.'),

  ('Rosca direta com barra','Bíceps','Barra reta ou W','Evite projetar os cotovelos para frente e não use impulso do tronco.'),
  ('Rosca alternada','Bíceps','Halteres','Alterne os braços mantendo os cotovelos próximos ao corpo.'),
  ('Rosca martelo','Bíceps','Halteres','Mantenha a pegada neutra durante toda a execução.'),
  ('Rosca concentrada','Bíceps','Halter','Apoie o cotovelo e faça o movimento de forma controlada.'),
  ('Rosca Scott com barra W','Bíceps','Banco Scott e barra W','Não estenda completamente o cotovelo sob carga elevada.'),
  ('Rosca Scott na máquina','Bíceps','Máquina Scott','Ajuste o banco para apoiar corretamente os braços.'),
  ('Rosca inclinada com halteres','Bíceps','Banco inclinado e halteres','Mantenha os ombros para trás e evite balanço.'),
  ('Rosca na polia baixa','Bíceps','Polia baixa','Mantenha tensão contínua durante toda a amplitude.'),
  ('Rosca inversa','Bíceps','Barra reta ou W','Use pegada pronada e mantenha os punhos alinhados.'),
  ('Rosca 21','Bíceps','Barra','Execute as três faixas de amplitude sem usar impulso.'),

  ('Tríceps pulley com barra','Tríceps','Polia alta e barra','Mantenha os cotovelos fixos junto ao corpo.'),
  ('Tríceps corda','Tríceps','Polia alta e corda','Afaste as pontas da corda ao final da extensão.'),
  ('Tríceps francês unilateral','Tríceps','Halter','Mantenha o cotovelo apontado para cima e estável.'),
  ('Tríceps francês bilateral','Tríceps','Halter','Evite abrir excessivamente os cotovelos.'),
  ('Tríceps testa com barra W','Tríceps','Banco e barra W','Controle a descida da barra sem deslocar demais os cotovelos.'),
  ('Tríceps coice','Tríceps','Halter','Mantenha o braço alinhado ao tronco e estenda completamente o cotovelo.'),
  ('Mergulho no banco','Tríceps','Banco','Mantenha os ombros estáveis e limite a profundidade conforme a mobilidade.'),
  ('Paralelas','Tríceps','Barras paralelas','Desça com controle mantendo os cotovelos próximos ao corpo.'),
  ('Supino fechado','Tríceps','Banco e barra','Use pegada confortável e mantenha os cotovelos controlados.'),
  ('Tríceps máquina','Tríceps','Máquina de tríceps','Ajuste o equipamento para preservar a posição dos ombros.'),

  ('Desenvolvimento com halteres','Ombro','Banco e halteres','Mantenha o abdômen firme e evite arquear excessivamente a lombar.'),
  ('Desenvolvimento com barra','Ombro','Barra','Desça a barra com controle e mantenha os punhos alinhados.'),
  ('Desenvolvimento Arnold','Ombro','Halteres','Faça a rotação de forma fluida e sem pressa.'),
  ('Elevação lateral','Ombro','Halteres','Eleve os braços até aproximadamente a linha dos ombros sem embalo.'),
  ('Elevação lateral na polia','Ombro','Polia baixa','Mantenha tensão contínua e controle o retorno.'),
  ('Elevação frontal com halteres','Ombro','Halteres','Evite ultrapassar excessivamente a altura dos ombros.'),
  ('Elevação frontal com barra','Ombro','Barra','Mantenha o tronco estável e não use impulso.'),
  ('Crucifixo inverso','Ombro','Halteres ou máquina','Concentre o movimento na porção posterior dos ombros.'),
  ('Face pull','Ombro','Polia alta e corda','Puxe a corda em direção ao rosto com rotação externa dos ombros.'),
  ('Desenvolvimento na máquina','Ombro','Máquina de ombros','Ajuste o assento para iniciar com as mãos na altura adequada.'),

  ('Encolhimento com barra','Trapézio','Barra','Eleve os ombros verticalmente sem realizar rotações.'),
  ('Encolhimento com halteres','Trapézio','Halteres','Mantenha os braços relaxados e concentre o movimento nos ombros.'),
  ('Encolhimento na máquina','Trapézio','Máquina','Faça uma pausa curta no topo do movimento.'),
  ('Remada alta com barra W','Trapézio','Barra W','Use amplitude confortável e evite elevar excessivamente os cotovelos.'),
  ('Remada alta na polia','Trapézio','Polia baixa','Mantenha o movimento controlado e os punhos neutros.'),
  ('Encolhimento no Smith','Trapézio','Smith machine','Mantenha a postura ereta e execute apenas a elevação dos ombros.'),
  ('Farmers walk','Trapézio','Halteres ou kettlebells','Caminhe com postura ereta, abdômen firme e passos controlados.'),
  ('Face pull alto','Trapézio','Polia alta e corda','Puxe em direção à testa mantendo as escápulas ativas.'),

  ('Agachamento livre','Pernas','Rack e barra','Mantenha os joelhos alinhados aos pés e a coluna neutra.'),
  ('Agachamento frontal','Pernas','Barra','Mantenha os cotovelos elevados e o tronco mais vertical.'),
  ('Agachamento no Smith','Pernas','Smith machine','Posicione os pés de forma estável e controle a profundidade.'),
  ('Leg press 45','Pernas','Leg press 45','Evite retirar o quadril do encosto e controle a descida.'),
  ('Leg press horizontal','Pernas','Leg press horizontal','Mantenha os joelhos alinhados durante toda a execução.'),
  ('Cadeira extensora','Pernas','Cadeira extensora','Ajuste o eixo da máquina ao joelho e evite movimentos bruscos.'),
  ('Mesa flexora','Pernas','Mesa flexora','Mantenha o quadril apoiado e controle a volta.'),
  ('Cadeira flexora','Pernas','Cadeira flexora','Ajuste o encosto e mantenha amplitude confortável.'),
  ('Stiff com barra','Pernas','Barra','Mantenha a coluna neutra e leve o quadril para trás.'),
  ('Stiff com halteres','Pernas','Halteres','Desça até preservar a postura e sentir alongamento dos posteriores.'),
  ('Levantamento terra romeno','Pernas','Barra','Mantenha a barra próxima às pernas e controle a fase excêntrica.'),
  ('Afundo com halteres','Pernas','Halteres','Mantenha o tronco estável e o joelho alinhado ao pé.'),
  ('Passada caminhando','Pernas','Halteres','Dê passos firmes e controle a descida do joelho traseiro.'),
  ('Agachamento búlgaro','Pernas','Banco e halteres','Mantenha o pé dianteiro estável e desça com controle.'),
  ('Cadeira adutora','Pernas','Máquina adutora','Controle a abertura e o fechamento das pernas.'),
  ('Cadeira abdutora','Pernas','Máquina abdutora','Evite usar impulso e mantenha o tronco estável.'),
  ('Elevação pélvica','Pernas','Banco e barra','Contraia os glúteos no topo sem hiperestender a lombar.'),
  ('Glúteo na polia','Pernas','Polia baixa','Mantenha o quadril estável durante a extensão da perna.'),
  ('Panturrilha em pé','Pernas','Máquina ou plataforma','Use amplitude completa e faça uma pausa no topo.'),
  ('Panturrilha sentada','Pernas','Máquina de panturrilha','Controle a descida e evite movimentos rápidos.')
) as v(nome, grupo_muscular, equipamento, instrucoes)
where not exists (
  select 1
  from public.exercicios e
  where e.global = true
    and lower(trim(e.nome)) = lower(trim(v.nome))
    and lower(trim(coalesce(e.grupo_muscular, ''))) = lower(trim(v.grupo_muscular))
);
