with novas_categorias(nome) as (
  values
    ('Abdômen/Core'),('Adutores/Abdutores'),('Antebraço'),('Cardio'),('Funcional'),
    ('Glúteos'),('Lombar'),('Mobilidade/Alongamento'),('Panturrilhas')
)
insert into public.categorias_exercicios (nome, global, personal_id)
select nc.nome, true, null
from novas_categorias nc
where not exists (
  select 1 from public.categorias_exercicios c
  where c.global = true and lower(trim(c.nome)) = lower(trim(nc.nome))
);

with novos_exercicios(categoria, nome, equipamento, tipo_prescricao) as (
  values
    ('Abdômen/Core','Abdominal tradicional','Peso corporal','repeticoes'),
    ('Abdômen/Core','Abdominal infra no solo','Peso corporal','repeticoes'),
    ('Abdômen/Core','Abdominal supra na máquina','Máquina abdominal','repeticoes'),
    ('Abdômen/Core','Elevação de pernas suspenso','Barra fixa','repeticoes'),
    ('Abdômen/Core','Elevação de pernas no banco','Banco','repeticoes'),
    ('Abdômen/Core','Prancha frontal','Peso corporal','tempo'),
    ('Abdômen/Core','Prancha lateral','Peso corporal','tempo'),
    ('Abdômen/Core','Abdominal bicicleta','Peso corporal','repeticoes'),
    ('Abdômen/Core','Russian twist','Peso corporal ou anilha','repeticoes'),
    ('Abdômen/Core','Crunch na polia','Polia alta','repeticoes'),
    ('Adutores/Abdutores','Cadeira adutora','Máquina adutora','repeticoes'),
    ('Adutores/Abdutores','Cadeira abdutora','Máquina abdutora','repeticoes'),
    ('Adutores/Abdutores','Adução de quadril na polia','Polia baixa','repeticoes'),
    ('Adutores/Abdutores','Abdução de quadril na polia','Polia baixa','repeticoes'),
    ('Adutores/Abdutores','Abdução lateral com miniband','Miniband','repeticoes'),
    ('Antebraço','Rosca de punho com barra','Barra','repeticoes'),
    ('Antebraço','Rosca de punho reversa com barra','Barra','repeticoes'),
    ('Antebraço','Rosca de punho com halteres','Halteres','repeticoes'),
    ('Antebraço','Rosca inversa com barra','Barra','repeticoes'),
    ('Antebraço','Farmer walk','Halteres ou kettlebells','distancia'),
    ('Cardio','Esteira - caminhada','Esteira','tempo'),
    ('Cardio','Esteira - corrida','Esteira','tempo'),
    ('Cardio','Esteira - corrida por distância','Esteira','distancia'),
    ('Cardio','Bicicleta ergométrica','Bicicleta ergométrica','tempo'),
    ('Cardio','Bicicleta horizontal','Bicicleta horizontal','tempo'),
    ('Cardio','Elíptico','Elíptico','tempo'),
    ('Cardio','Remo ergométrico','Remo ergométrico','tempo'),
    ('Cardio','Remo por distância','Remo ergométrico','distancia'),
    ('Cardio','Escada ergométrica','Escada ergométrica','tempo'),
    ('Cardio','Caminhada ao ar livre','Nenhum','distancia'),
    ('Cardio','Corrida ao ar livre','Nenhum','distancia'),
    ('Funcional','Burpee','Peso corporal','repeticoes'),
    ('Funcional','Kettlebell swing','Kettlebell','repeticoes'),
    ('Funcional','Battle rope','Corda naval','tempo'),
    ('Funcional','Polichinelo','Peso corporal','tempo'),
    ('Funcional','Mountain climber','Peso corporal','tempo'),
    ('Funcional','Box jump','Caixa pliométrica','repeticoes'),
    ('Funcional','Agachamento com salto','Peso corporal','repeticoes'),
    ('Funcional','Sled push','Trenó','distancia'),
    ('Glúteos','Hip thrust com barra','Barra e banco','repeticoes'),
    ('Glúteos','Elevação pélvica no solo','Peso corporal','repeticoes'),
    ('Glúteos','Glúteo máquina','Máquina de glúteo','repeticoes'),
    ('Glúteos','Coice na polia','Polia baixa','repeticoes'),
    ('Glúteos','Coice com caneleira','Caneleira','repeticoes'),
    ('Glúteos','Abdução de quadril com miniband','Miniband','repeticoes'),
    ('Glúteos','Elevação pélvica unilateral','Peso corporal','repeticoes'),
    ('Lombar','Extensão lombar no banco romano','Banco romano','repeticoes'),
    ('Lombar','Hiperextensão lombar','Banco de hiperextensão','repeticoes'),
    ('Lombar','Superman','Peso corporal','repeticoes'),
    ('Lombar','Bird dog','Peso corporal','repeticoes'),
    ('Mobilidade/Alongamento','Alongamento de posterior de coxa','Peso corporal','tempo'),
    ('Mobilidade/Alongamento','Alongamento de quadríceps','Peso corporal','tempo'),
    ('Mobilidade/Alongamento','Alongamento de peitoral','Parede ou apoio','tempo'),
    ('Mobilidade/Alongamento','Alongamento de ombros','Peso corporal','tempo'),
    ('Mobilidade/Alongamento','Mobilidade de tornozelo','Peso corporal','tempo'),
    ('Mobilidade/Alongamento','Mobilidade de quadril','Peso corporal','tempo'),
    ('Mobilidade/Alongamento','Mobilidade torácica','Peso corporal','tempo'),
    ('Panturrilhas','Panturrilha em pé','Máquina ou peso corporal','repeticoes'),
    ('Panturrilhas','Panturrilha sentado','Máquina ou anilha','repeticoes'),
    ('Panturrilhas','Panturrilha no leg press','Leg press','repeticoes'),
    ('Panturrilhas','Panturrilha unilateral em pé','Peso corporal ou halter','repeticoes')
)
insert into public.exercicios (
  nome, grupo_muscular, equipamento, instrucoes, video_url, imagem_url,
  global, personal_id, origem_global_id, categoria_id, tipo_prescricao
)
select
  ne.nome, c.nome, ne.equipamento, null, null, null,
  true, null, null, c.id, ne.tipo_prescricao
from novos_exercicios ne
join public.categorias_exercicios c
  on c.global = true and lower(trim(c.nome)) = lower(trim(ne.categoria))
where not exists (
  select 1 from public.exercicios e
  where e.global = true
    and lower(trim(e.nome)) = lower(trim(ne.nome))
    and e.categoria_id = c.id
);